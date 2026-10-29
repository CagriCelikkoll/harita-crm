// Kampanya özeti ve oluşturma. Alıcı kuralları (aliciDegerlendir) burada, kuyruğa eklemeden önce uygulanır;
// işçi her mesajdan hemen önce aynı fonksiyonla YENİDEN kontrol eder.
// WhatsApp (Cloud API): onaylı şablon + değişken eşleme; test modu açıksa yalnızca test numaraları; tahmini Meta
// ücreti (bilgi amaçlı); yalnızca yönetici başlatır (K12).
import { z } from "zod";
import {
  ALICI_TURLERI,
  HARIC_NEDENLERI,
  KAMPANYA_AZAMI_ALICI,
  KUYRUK_KANALLARI,
  type HaricNedeni,
  type KuyrukKanali,
} from "@/lib/mesajlasma";
import { birimFiyat, WHATSAPP_FIYATLARI } from "@/lib/whatsapp-fiyatlar";
import {
  DEGISKEN_KAYNAKLARI,
  degiskenDegerleri,
  limitKatmaniSayisi,
  sablonMetni,
  type DegiskenEslemi,
  type Kalite,
} from "@/lib/whatsapp-api";
import { KAYIT_DURUMLARI } from "@/lib/sabitler";
import { sablonDoldur, smsAltbilgisi } from "@/lib/sablon";
import { smsUzunlugu } from "@/lib/sms-uzunluk";
import { gunAnahtari } from "@/lib/zaman";
import { cagriBirimi } from "../places/istemci";
import { yoneticiOlmali, type TenantContext } from "../repo/baglam";
import { kotaDurumu } from "../repo/kullanim";
import { sayacDegeri } from "../repo/gonderim-sayaci";
import { iletiAyarlariGetir } from "../repo/ileti-ayarlari";
import {
  kampanyaAdaylari,
  kampanyaDevamEttir,
  kampanyaGetir,
  kampanyaOlustur,
  type Kampanya,
  type KampanyaAdayi,
} from "../repo/kampanyalar";
import { whatsappSon24Saat } from "../repo/kuyruk";
import { sablonGetir } from "../repo/whatsapp-sablonlari";
import { whatsappKisileriGetir } from "../repo/whatsapp-kisileri";
import type { AliciKarari } from "../messaging/alici-kurallari";
import { baglantiyiTestEt, whatsappBaglantisiCoz } from "./whatsapp-api";
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
    kanal: z.enum(KUYRUK_KANALLARI),
    ad: z.string().trim().min(1, "Kampanya adı gerekli.").max(120),
    konu: z.string().trim().max(200).optional(),
    /** E-posta / SMS metni. WhatsApp'ta kullanılmaz (onaylı şablon). */
    sablon: z.string().trim().max(5000, "Mesaj en fazla 5.000 karakter olabilir.").optional(),
    /** Yalnızca WhatsApp: senkronize şablonun kimliği ve değişken eşlemesi. */
    sablonId: z.string().max(100).optional(),
    degiskenEslem: z
      .record(
        z.string().max(80),
        z
          .object({
            kaynak: z.enum(DEGISKEN_KAYNAKLARI),
            deger: z.string().trim().max(500).optional(),
            yedek: z.string().trim().max(500).optional(),
          })
          .strict(),
      )
      .optional(),
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
    if (k.kanal !== "whatsapp_api" && !k.sablon) c.addIssue({ code: "custom", message: "Mesaj metni gerekli.", path: ["sablon"] });
    if (k.kanal === "whatsapp_api" && !k.sablonId) c.addIssue({ code: "custom", message: "WhatsApp şablonu seçin.", path: ["sablonId"] });
    if (k.kanal === "sms" && (k.sablon ?? "").length > 900) {
      c.addIssue({ code: "custom", message: "SMS metni en fazla 900 karakter olabilir.", path: ["sablon"] });
    }
  });
export type KampanyaGirdisi = z.infer<typeof KampanyaGirdisi>;

/** WhatsApp (Cloud API) kampanyasına özel özet. */
export type WhatsappOzeti = {
  sablonAdi: string;
  dil: string;
  kategori: string;
  baglantiVar: boolean;
  /** Bağlantının test modu: yalnızca test numaraları. */
  testModu: boolean;
  kalite: Kalite | null;
  /** Meta limitinin bu uygulamaya ayrılan payı (24 saatte ileti); null: sınırsız. */
  limitPayi: number | null;
  son24Saat: number;
  birimFiyatUsd: number | null;
  tahminiUcretUsd: number | null;
  fiyatTarihi: string;
  fiyatDogrulandi: boolean;
  /** İlk (en fazla) üç uygun alıcının şablon metni. */
  onizlemeler: string[];
};

export type KampanyaOzeti = {
  kanal: KuyrukKanali;
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
  whatsapp: WhatsappOzeti | null;
};

type Karar = { kayit: KampanyaAdayi; karar: AliciKarari };

/** WhatsApp: alıcı kuralları + test modu + değişken değerleri; şablon ve bağlantı bilgisi. */
function whatsappKararlari(ctx: TenantContext, g: KampanyaGirdisi, adaylar: KampanyaAdayi[], simdi: Date) {
  const sablon = g.sablonId ? sablonGetir(ctx, g.sablonId) : null;
  if (!sablon) throw new KampanyaHatasi("Şablon bulunamadı; Ayarlar'dan şablonları senkronize edin.");
  if (sablon.destekNedeni) throw new KampanyaHatasi(`Bu şablon kampanyada kullanılamaz: ${sablon.destekNedeni}`);
  const eslem: DegiskenEslemi = g.degiskenEslem ?? {};
  const c = whatsappBaglantisiCoz(ctx);
  const testModu = !g.testModu && (c?.baglanti.testModu ?? true);
  const testNumaralari = new Set(c?.gizli.testNumaralari ?? []);
  const waBilgisi = whatsappKisileriGetir(ctx, adaylar.map((k) => k.id));
  const engelli = engelSorgusuOlustur(ctx, adaylar);
  const kararlar: Karar[] = adaylar.map((kayit) => {
    let karar = aliciDegerlendir({ ...kayit, whatsapp: waBilgisi.get(kayit.id) ?? null }, "whatsapp_api", engelli, { simdi });
    if (karar.uygun && testModu && (karar.kaynak !== "kayit" || !testNumaralari.has(karar.adres!))) {
      karar = { uygun: false, neden: "test_modu" };
    }
    if (karar.uygun && !degiskenDegerleri(sablon.degiskenler, eslem, kayit)) karar = { uygun: false, neden: "degisken_bos" };
    return { kayit, karar };
  });
  return { sablon, eslem, c, testModu, kararlar };
}

function whatsappOzeti(
  ctx: TenantContext,
  w: ReturnType<typeof whatsappKararlari>,
  gonderilecek: number,
  simdi: Date,
): WhatsappOzeti {
  const { sablon, eslem, c } = w;
  const limit = c ? (limitKatmaniSayisi(c.baglanti.limitKatmani) ?? 250) : null;
  const fiyat = birimFiyat(sablon.kategori);
  return {
    sablonAdi: sablon.ad,
    dil: sablon.dil,
    kategori: sablon.kategori,
    baglantiVar: Boolean(c),
    testModu: w.testModu,
    kalite: (c?.baglanti.kalite as Kalite | null) ?? null,
    limitPayi: limit === null || !Number.isFinite(limit) ? null : Math.max(1, Math.floor((limit * c!.baglanti.uygulamaPayi) / 100)),
    son24Saat: c ? whatsappSon24Saat(ctx, simdi, "") : 0,
    birimFiyatUsd: fiyat,
    tahminiUcretUsd: fiyat === null ? null : Math.round(fiyat * gonderilecek * 10_000) / 10_000,
    fiyatTarihi: WHATSAPP_FIYATLARI.tarih,
    fiyatDogrulandi: WHATSAPP_FIYATLARI.dogrulandi,
    onizlemeler: w.kararlar
      .filter((x) => x.karar.uygun)
      .slice(0, 3)
      .map((x) => sablonMetni(sablon.bilesenler, degiskenDegerleri(sablon.degiskenler, eslem, x.kayit)!)),
  };
}

function hazirla(ctx: TenantContext, g: KampanyaGirdisi, simdi: Date) {
  const adaylar = kampanyaAdaylari(ctx, g.filtre);
  if (adaylar.length > KAMPANYA_AZAMI_ALICI) {
    throw new KampanyaHatasi(`Bir kampanyada en fazla ${KAMPANYA_AZAMI_ALICI} alıcı olabilir; filtreyi daraltın.`);
  }
  const wa = g.kanal === "whatsapp_api" ? whatsappKararlari(ctx, g, adaylar, simdi) : null;
  const kanal = g.kanal;
  const kararlar: Karar[] =
    wa?.kararlar ??
    (kanal === "whatsapp_api"
      ? []
      : (() => {
          const engelli = engelSorgusuOlustur(ctx, adaylar);
          return adaylar.map((k) => ({ kayit: k, karar: aliciDegerlendir(k, kanal, engelli) }));
        })());

  const ayar = iletiAyarlariGetir(ctx);
  // WhatsApp'ta "test (sandbox)" yalnızca açıkça seçilirse; bağlantı yoksa gerçek kampanya başlatılamaz.
  const sandbox = kanal === "whatsapp_api" ? g.testModu : g.testModu || !saglayiciDurumlari(ctx)[kanal].tanimli;
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
  let bugunKalan = Math.max(0, sinir - sayacDegeri(ctx, g.kanal, gunAnahtari(baslangic)));
  const ilk = kararlar.find((x) => x.karar.uygun)?.kayit;
  const whatsapp = wa ? whatsappOzeti(ctx, wa, gonderilecek, simdi) : null;
  if (whatsapp && !sandbox && whatsapp.limitPayi !== null) {
    bugunKalan = Math.min(bugunKalan, Math.max(0, whatsapp.limitPayi - whatsapp.son24Saat));
  }
  const onizleme = whatsapp
    ? (whatsapp.onizlemeler[0] ?? null)
    : ilk
      ? sablonDoldur(g.sablon ?? "", ilk.isletmeAdi, g.bosIsimHitabi)
      : null;

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
    whatsapp,
    smsParca: g.kanal === "sms" && onizleme !== null ? smsUzunlugu(`${onizleme}
${smsAltbilgisi(ayar)}`).parca : null,
  };
  return { ozet, kararlar, sablon: wa?.sablon ?? null };
}

export function kampanyaOzeti(ctx: TenantContext, g: KampanyaGirdisi, simdi = new Date()): KampanyaOzeti {
  return hazirla(ctx, g, simdi).ozet;
}

export function kampanyaBaslat(ctx: TenantContext, g: KampanyaGirdisi, simdi = new Date()): Kampanya {
  if (g.kanal === "whatsapp_api") yoneticiOlmali(ctx); // Meta ücreti var (K12)
  const { ozet, kararlar, sablon } = hazirla(ctx, g, simdi);
  if (ozet.whatsapp && !ozet.sandbox && !ozet.whatsapp.baglantiVar) {
    throw new KampanyaHatasi("WhatsApp Business bağlantısı tanımlı değil (Ayarlar → WhatsApp Business (API)).");
  }
  if (ozet.whatsapp?.kalite === "RED" && !ozet.sandbox) {
    throw new KampanyaHatasi("Numaranın kalite puanı düşük (kırmızı); kalite düzelene kadar kampanya başlatılamaz.");
  }
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
      sablon: sablon ? `${sablon.ad} (${sablon.dil})` : (g.sablon ?? ""),
      bosIsimHitabi: g.bosIsimHitabi || null,
      sablonId: sablon?.id ?? null,
      degiskenEslem: sablon ? (g.degiskenEslem ?? {}) : null,
      filtre: g.filtre,
      sandbox: ozet.sandbox,
      planlananTarih: g.planlananTarih ? new Date(g.planlananTarih) : null,
    },
    kararlar.map(({ kayit, karar }) => ({ leadId: kayit.id, haric: karar.uygun ? undefined : karar.neden })),
    simdi,
  );
}

/**
 * Duraklatılmış WhatsApp kampanyasını devam ettirir (yalnızca yönetici). Kalite nedeniyle durduysa kalite Meta'dan
 * yeniden okunur; hâlâ kırmızıysa devam ettirilmez.
 */
export async function kampanyayiDevamEttir(ctx: TenantContext, id: string): Promise<void> {
  yoneticiOlmali(ctx);
  const k = kampanyaGetir(ctx, id);
  if (!k) throw new KampanyaHatasi("Kampanya bulunamadı.");
  if (k.durum !== "duraklatildi") throw new KampanyaHatasi("Kampanya duraklatılmış değil.");
  if (k.kanal === "whatsapp_api" && !k.sandbox) {
    try {
      await baglantiyiTestEt(ctx);
    } catch {
      /* Meta'ya ulaşılamadıysa son bilinen kalite kullanılır */
    }
    const c = whatsappBaglantisiCoz(ctx);
    if (!c) throw new KampanyaHatasi("WhatsApp Business bağlantısı tanımlı değil.");
    if (c.baglanti.kalite === "RED") {
      throw new KampanyaHatasi("Numaranın kalite puanı hâlâ düşük (kırmızı); kampanya devam ettirilemez.");
    }
  }
  if (!kampanyaDevamEttir(ctx, id)) throw new KampanyaHatasi("Kampanya devam ettirilemedi.");
}
