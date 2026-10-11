// Kampanya özeti ve oluşturma. Alıcı kuralları (aliciDegerlendir) burada, kuyruğa eklemeden önce uygulanır;
// işçi her mesajdan hemen önce aynı fonksiyonla YENİDEN kontrol eder.
import { z } from "zod";
import {
  ALICI_TURLERI,
  HARIC_NEDENLERI,
  KAMPANYA_AZAMI_ALICI,
  KANALLAR,
  type HaricNedeni,
  type Kanal,
} from "@/lib/mesajlasma";
import { KAYIT_DURUMLARI } from "@/lib/sabitler";
import { sablonDoldur, smsAltbilgisi } from "@/lib/sablon";
import { smsUzunlugu } from "@/lib/sms-uzunluk";
import { gunAnahtari } from "@/lib/zaman";
import { cagriBirimi } from "../places/istemci";
import type { TenantContext } from "../repo/baglam";
import { kotaDurumu } from "../repo/kullanim";
import { sayacDegeri } from "../repo/gonderim-sayaci";
import { iletiAyarlariGetir } from "../repo/ileti-ayarlari";
import { kampanyaAdaylari, kampanyaOlustur, type Kampanya } from "../repo/kampanyalar";
import { saglayiciDurumlari } from "../repo/saglayicilar";
import { aliciDegerlendir } from "../messaging/alici-kurallari";
import { engelSorgusuOlustur, gunlukSinir, ticariIletiEksikleri } from "./ileti";

export class KampanyaHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "KampanyaHatasi";
  }
}

export const KampanyaGirdisi = z
  .object({
    kanal: z.enum(KANALLAR),
    ad: z.string().trim().min(1, "Kampanya adı gerekli.").max(120),
    konu: z.string().trim().max(200).optional(),
    sablon: z.string().trim().min(1, "Mesaj metni gerekli.").max(5000, "Mesaj en fazla 5.000 karakter olabilir."),
    bosIsimHitabi: z.string().trim().max(80).optional(),
    filtre: z
      .object({
        durum: z.enum(KAYIT_DURUMLARI).optional(),
        etiket: z.string().trim().toLowerCase().max(40).optional(),
        aliciTuru: z.enum(ALICI_TURLERI).optional(),
      })
      .strict(),
    /** true: sağlayıcı tanımlı olsa da gerçek gönderim yapılmaz (sandbox). */
    testModu: z.boolean().default(false),
    planlananTarih: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .superRefine((k, c) => {
    if (k.kanal === "eposta" && !k.konu) c.addIssue({ code: "custom", message: "E-posta konusu gerekli.", path: ["konu"] });
    if (k.kanal === "sms" && k.sablon.length > 900) {
      c.addIssue({ code: "custom", message: "SMS metni en fazla 900 karakter olabilir.", path: ["sablon"] });
    }
  });
export type KampanyaGirdisi = z.infer<typeof KampanyaGirdisi>;

export type KampanyaOzeti = {
  kanal: Kanal;
  toplamAday: number;
  gonderilecek: number;
  haricler: Record<HaricNedeni, number>;
  /** Uygun alıcılardan işletme adı girilmemiş olanlar ({isletme} boş isim hitabıyla dolar / kaldırılır). */
  isletmeAdiEksik: number;
  /** Başlangıç gününün kalan sınırını aşan alıcılar sonraki günlere kalır. */
  gunlukSinir: number;
  bugunKalan: number;
  sonrakiGunlereKalacak: number;
  sandbox: boolean;
  /** Sandbox dışı gönderim için Ayarlar'da eksik olanlar. */
  eksikAyarlar: string[];
  onizleme: string | null;
  /** SMS: telefonu kayıtta olmayan, gönderim anında Places'tan alınacak alıcılar ve tahmini kota maliyeti. */
  placesTelefonGerekli: number;
  tahminiKotaBirimi: number;
  kotaKalan: number;
  /** SMS: ilk alıcının mesajı (altbilgi dahil) kaç parça. */
  smsParca: number | null;
};

function hazirla(ctx: TenantContext, g: KampanyaGirdisi, simdi: Date) {
  const adaylar = kampanyaAdaylari(ctx, g.filtre);
  if (adaylar.length > KAMPANYA_AZAMI_ALICI) {
    throw new KampanyaHatasi(`Bir kampanyada en fazla ${KAMPANYA_AZAMI_ALICI} alıcı olabilir; filtreyi daraltın.`);
  }
  const engelli = engelSorgusuOlustur(ctx, adaylar);
  const kararlar = adaylar.map((k) => ({ kayit: k, karar: aliciDegerlendir(k, g.kanal, engelli) }));

  const ayar = iletiAyarlariGetir(ctx);
  const sandbox = g.testModu || !saglayiciDurumlari(ctx)[g.kanal].tanimli;
  const haricler = Object.fromEntries(HARIC_NEDENLERI.map((n) => [n, 0])) as Record<HaricNedeni, number>;
  let gonderilecek = 0;
  let isletmeAdiEksik = 0;
  let placesTelefonGerekli = 0;
  for (const { kayit, karar } of kararlar) {
    if (!karar.uygun) haricler[karar.neden]++;
    else {
      gonderilecek++;
      if (!kayit.isletmeAdi?.trim()) isletmeAdiEksik++;
      if (karar.adres === null) placesTelefonGerekli++;
    }
  }
  const baslangic = g.planlananTarih ? new Date(g.planlananTarih) : simdi;
  const sinir = gunlukSinir(ayar, g.kanal);
  const bugunKalan = Math.max(0, sinir - sayacDegeri(ctx, g.kanal, gunAnahtari(baslangic)));
  const ilk = kararlar.find((x) => x.karar.uygun)?.kayit;
  const onizleme = ilk ? sablonDoldur(g.sablon, ilk.isletmeAdi, g.bosIsimHitabi) : null;

  const ozet: KampanyaOzeti = {
    kanal: g.kanal,
    toplamAday: adaylar.length,
    gonderilecek,
    haricler,
    isletmeAdiEksik,
    gunlukSinir: sinir,
    bugunKalan,
    sonrakiGunlereKalacak: Math.max(0, gonderilecek - bugunKalan),
    sandbox,
    eksikAyarlar: sandbox ? [] : ticariIletiEksikleri(ayar, g.kanal),
    onizleme,
    placesTelefonGerekli,
    tahminiKotaBirimi: placesTelefonGerekli * cagriBirimi("telefon"),
    kotaKalan: kotaDurumu(ctx).kalan,
    smsParca: g.kanal === "sms" && onizleme !== null ? smsUzunlugu(`${onizleme}
${smsAltbilgisi(ayar)}`).parca : null,
  };
  return { ozet, kararlar };
}

export function kampanyaOzeti(ctx: TenantContext, g: KampanyaGirdisi, simdi = new Date()): KampanyaOzeti {
  return hazirla(ctx, g, simdi).ozet;
}

export function kampanyaBaslat(ctx: TenantContext, g: KampanyaGirdisi, simdi = new Date()): Kampanya {
  const { ozet, kararlar } = hazirla(ctx, g, simdi);
  if (!ozet.sandbox && ozet.eksikAyarlar.length) {
    throw new KampanyaHatasi(
      `Gerçek gönderim için Ayarlar → Ticari ileti bölümünü tamamlayın: ${ozet.eksikAyarlar.join(", ")}.`,
    );
  }
  if (ozet.gonderilecek === 0) throw new KampanyaHatasi("Kurallara uyan alıcı yok; kampanya oluşturulmadı.");
  return kampanyaOlustur(
    ctx,
    {
      kanal: g.kanal,
      ad: g.ad,
      konu: g.kanal === "eposta" ? (g.konu ?? null) : null,
      sablon: g.sablon,
      bosIsimHitabi: g.bosIsimHitabi || null,
      filtre: g.filtre,
      sandbox: ozet.sandbox,
      planlananTarih: g.planlananTarih ? new Date(g.planlananTarih) : null,
    },
    kararlar.map(({ kayit, karar }) => ({ leadId: kayit.id, haric: karar.uygun ? undefined : karar.neden })),
    simdi,
  );
}
