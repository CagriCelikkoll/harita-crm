// Gelen kutusu: bir müşterinin mesajında yönlendirdiği numaraya tek kişilik şablon gönderimi.
//
// Akış (tek transaction): numara bu çalışma alanında kayıtlı değilse kayıt açılır (kaynak 'yonlendirme', "Yönlendirme —
// <yönlendiren>", yönlendiren sohbet, "eklendi" olayı); WhatsApp izni seçilen kaynakla ve işlemi yapan kullanıcıyla
// yazılır; tek alıcılı kampanya (servisler/kampanya.ts tekilKampanyaBaslat) toplu kampanyanın bütün kurallarıyla
// değerlendirilir. Engel varsa (RET, engel listesi, "Numarada WhatsApp yok", İYS, test modu, günlük sınır / Meta payı,
// şablon WABA'sı, numara durumu) HİÇBİR ŞEY yazılmaz (transaction geri alınır) ve neden döner. Engel yoksa kampanya
// kuyruğa yazılır (işçi gönderir; teslim durumu ve Meta ücreti diğer kampanyalardaki gibi izlenir), yeni kişinin sohbeti
// açılır, yönlendiren sohbete iç not düşer.
//
// Ön kontrol (özet) aynı yolu çalıştırıp sonunda geri alır: pencerede gösterilen neden, gönderimdekiyle aynıdır.
// Üyeler de kullanabilir (toplu WhatsApp kampanyası yalnızca yönetici); kullanıcı başına günde TEKIL_GUNLUK_SINIR gönderim
// (İstanbul günü; sayım ve yazma aynı transaction'da, eşzamanlı ikinci istek sınırı aşamaz).
import "server-only";
import { z } from "zod";
import { cepMi, telefonNormallestir } from "@/lib/adres-normal";
import {
  ALICI_TURLERI,
  TEKIL_GUNLUK_SINIR,
  TEKIL_SINIR_DOLDU,
  WHATSAPP_IZIN_KAYNAK_ADLARI,
  YONLENDIRME_IZIN_KAYNAKLARI,
  yonlendirmeIzniSecilebilir,
  type AliciTuru,
} from "@/lib/mesajlasma";
import { tarihYaz } from "@/lib/bicim";
import { gunAnahtari, istanbulAni } from "@/lib/zaman";
import { yerelTelefon } from "@/lib/telefon-algilama";
import { tekIslemde, type TenantContext } from "../repo/baglam";
import { atanabilirUyeler, notEkle, sohbetBaslat, sohbetGetir } from "../repo/gelen-kutusu";
import { kampanyaAdayiGetir, tekilKampanyaSayisi } from "../repo/kampanyalar";
import { kayitGetir, kisileriEkle, telefonlaKayitlar } from "../repo/kayitlar";
import { sistemOlayiEkle } from "../repo/olaylar";
import { whatsappIzniAyarla, whatsappKisisiGetir } from "../repo/whatsapp-kisileri";
import { DegiskenEslemGirdisi, KampanyaHatasi, tekilKampanyaBaslat, tekilKampanyaDegerlendir, type KampanyaGirdisi } from "./kampanya";
import { numaraOzetleri, sablonlar, type NumaraOzeti, type SablonDto } from "./whatsapp-api";

export class YonlendirmeHatasi extends Error {
  constructor(
    mesaj: string,
    readonly durum: 400 | 403 | 404,
  ) {
    super(mesaj);
    this.name = "YonlendirmeHatasi";
  }
}

export const MUSTERI_YONLENDIRDI_BIREYSEL =
  "“Müşteri yönlendirdi” yalnızca Tacir/esnaf alıcıda seçilebilir; bireysel kişiye ancak kişinin kendi izniyle gönderilir.";

const telefonAlani = z
  .string()
  .trim()
  .max(40)
  .refine((t) => cepMi(telefonNormallestir(t)), "Türkiye cep telefonu numarası girin (ör. 0532 123 45 67).");

export const YonlendirmeGirdisi = z
  .object({
    /** Numaranın geçtiği (yönlendiren) sohbet. */
    sohbetId: z.string().min(1).max(64),
    telefon: telefonAlani,
    ad: z
      .string()
      .trim()
      .max(120, "Ad en fazla 120 karakter olabilir.")
      .transform((s) => s || null)
      .nullish(),
    aliciTuru: z.enum(ALICI_TURLERI, "Alıcı türünü seçin: Bireysel ya da Tacir/esnaf."),
    izinKaynagi: z.enum(YONLENDIRME_IZIN_KAYNAKLARI, "İzin kaynağını seçin."),
    /** Bireysel alıcı: izin İYS'ye kaydedildi beyanı (İYS kontrolü açıkken bireysele bunsuz gönderilmez). */
    iysBeyani: z.boolean().default(false),
    baglantiId: z.string().min(1, "Gönderen WhatsApp numarasını seçin.").max(100),
    sablonId: z.string().min(1, "WhatsApp şablonu seçin.").max(100),
    gorselId: z.string().max(100).optional(),
    degiskenEslem: DegiskenEslemGirdisi.optional(),
  })
  .strict()
  .refine((g) => yonlendirmeIzniSecilebilir(g.izinKaynagi, g.aliciTuru), { message: MUSTERI_YONLENDIRDI_BIREYSEL, path: ["izinKaynagi"] });
export type YonlendirmeGirdisi = z.infer<typeof YonlendirmeGirdisi>;

export type YonlendirmeKaydi = { id: string; ad: string; aliciTuru: AliciTuru };

export type YonlendirmeBilgisi = {
  telefon: string;
  yerel: string;
  /** Numara bu çalışma alanında kayıtlıysa kayıt ("Kayıtlarda aç"; alıcı türü kayıttan gelir, değiştirilmez). */
  kayit: YonlendirmeKaydi | null;
  /** Bu kullanıcının bugün kalan tekil gönderim hakkı. */
  kalanHak: number;
  /** Gönderen numaralar ve her birinin kullanılabilir şablonları. */
  numaralar: (NumaraOzeti & { sablonlar: SablonDto[] })[];
  /** Yönlendiren sohbetin numarası (varsayılan gönderen). */
  varsayilanNumara: string;
};

const kayitAdi = (k: { yetkiliAdi: string | null; isletmeAdi: string | null; telefonE164: string | null }) =>
  k.yetkiliAdi?.trim() || k.isletmeAdi?.trim() || (k.telefonE164 ? yerelTelefon(k.telefonE164) : "Adsız kişi");

function numaradakiKayit(ctx: TenantContext, normal: string) {
  const bulunan = telefonlaKayitlar(ctx, [normal])[0];
  return bulunan ? kayitGetir(ctx, bulunan.id) : null;
}

function sohbetiAl(ctx: TenantContext, sohbetId: string) {
  const sohbet = sohbetGetir(ctx, sohbetId);
  if (!sohbet) throw new YonlendirmeHatasi("Sohbet bulunamadı.", 404);
  return sohbet;
}

/** Numara menüsü ve pencere için: numara kayıtlı mı, gönderen numaralar ve şablonlar. Hiçbir şey yazmaz. */
export function yonlendirmeBilgisi(ctx: TenantContext, sohbetId: string, telefonHam: string, simdi = new Date()): YonlendirmeBilgisi {
  const sohbet = sohbetiAl(ctx, sohbetId);
  const normal = telefonNormallestir(telefonHam);
  if (!cepMi(normal)) throw new YonlendirmeHatasi("Türkiye cep telefonu numarası değil.", 400);
  const k = numaradakiKayit(ctx, normal);
  return {
    telefon: normal,
    yerel: yerelTelefon(normal),
    kayit: k ? { id: k.id, ad: kayitAdi(k), aliciTuru: k.aliciTuru } : null,
    kalanHak: Math.max(0, TEKIL_GUNLUK_SINIR - tekilKampanyaSayisi(ctx, istanbulAni(gunAnahtari(simdi)))),
    numaralar: numaraOzetleri(ctx).map((n) => ({ ...n, sablonlar: sablonlar(ctx, n.id).filter((s) => s.kullanilabilir) })),
    varsayilanNumara: sohbet.baglantiId,
  };
}

export type YonlendirmeOzeti = {
  /** Gönderimi engelleyen neden (pencerede gösterilir); null: gönderilebilir. */
  engel: string | null;
  /** Kayıt yoksa gönderimde açılacak. */
  yeniKayit: boolean;
  aliciTuru: AliciTuru;
  numara: string | null;
  sablonAdi: string | null;
  /** Alıcıya gidecek şablon metni (değişkenler doldurulmuş). */
  onizleme: string | null;
  tahminiUcretUsd: number | null;
  fiyatTarihi: string | null;
  testModu: boolean;
};

export type YonlendirmeSonucu = { kampanyaId: string; sohbetId: string; leadId: string; yeniKayit: boolean };

/** Ön kontrolde transaction'ı geri almak için (sonuç taşır). */
class GeriAl extends Error {
  constructor(readonly ozet: YonlendirmeOzeti) {
    super("geri al");
  }
}

function calistir(ctx: TenantContext, g: YonlendirmeGirdisi, simdi: Date, yaz: boolean): YonlendirmeOzeti | YonlendirmeSonucu {
  const sohbet = sohbetiAl(ctx, g.sohbetId);
  const normal = telefonNormallestir(g.telefon)!;
  const yonlendiren = kayitGetir(ctx, sohbet.leadId);
  const mevcut = numaradakiKayit(ctx, normal);
  if (mevcut && mevcut.id === sohbet.leadId) {
    throw new YonlendirmeHatasi("Bu numara sohbetteki kişinin kendi numarası; şablonu bu sohbetten gönderin.", 400);
  }
  // Kayıtlı kişide alıcı türü kayıttan gelir (pencereden değiştirilmez: İYS kuralı alıcı türüne bağlıdır).
  const aliciTuru = mevcut?.aliciTuru ?? g.aliciTuru;
  if (!yonlendirmeIzniSecilebilir(g.izinKaynagi, aliciTuru)) throw new YonlendirmeHatasi(MUSTERI_YONLENDIRDI_BIREYSEL, 400);

  const yonlendirenAdi = yonlendiren
    ? [yonlendiren.yetkiliAdi?.trim() || yonlendiren.isletmeAdi?.trim(), yonlendiren.telefonE164 ? yerelTelefon(yonlendiren.telefonE164) : null]
        .filter(Boolean)
        .join(", ") || "Adsız kişi"
    : "Silinmiş kişi";
  const kaynakAyrintisi = `Yönlendirme — ${yonlendirenAdi}`;
  const kullaniciAdi = atanabilirUyeler(ctx).find((u) => u.id === ctx.userId)?.ad ?? "bilinmiyor";
  const yerel = yerelTelefon(normal);

  try {
    return tekIslemde(() => {
      const leadId =
        mevcut?.id ??
        kisileriEkle(
          ctx,
          [{ kaynak: "yonlendirme", yetkiliAdi: g.ad ?? null, ekTelefon: normal, aliciTuru, kaynakAyrintisi, yonlendirenSohbetId: sohbet.id }],
          `${kaynakAyrintisi} (gelen kutusu; ekleyen: ${kullaniciAdi})`,
        )[0].id;
      // İzin: seçilen kaynak, tarih ve kaydeden (izin_kaydeden_id = ctx.userId). RET'li kişide whatsappIzniAyarla yazmaz;
      // ileti reddi olan kayıtta alıcı kuralı "ret" der ve her şey geri alınır.
      const onceki = whatsappKisisiGetir(ctx, leadId);
      whatsappIzniAyarla(ctx, leadId, {
        izin: "var",
        kaynak: g.izinKaynagi,
        tarih: simdi,
        not: `${WHATSAPP_IZIN_KAYNAK_ADLARI[g.izinKaynagi]}; ${kaynakAyrintisi}; kaydeden: ${kullaniciAdi}`,
        iysBeyani: aliciTuru === "bireysel" && (g.iysBeyani || Boolean(onceki?.iysBeyanTarihi)),
      });
      const aday = kampanyaAdayiGetir(ctx, leadId)!;
      const kampanya: KampanyaGirdisi = {
        kanal: "whatsapp_api",
        ad: `Yönlendirme — ${tarihYaz(simdi)}`,
        baglantiId: g.baglantiId,
        sablonId: g.sablonId,
        gorselId: g.gorselId,
        degiskenEslem: g.degiskenEslem ?? {},
        filtre: {},
        testModu: false,
        planlananTarih: null,
      };
      const kural = tekilKampanyaDegerlendir(ctx, kampanya, aday, simdi);
      const { hazir } = kural;
      const sinirDoldu = tekilKampanyaSayisi(ctx, istanbulAni(gunAnahtari(simdi))) >= TEKIL_GUNLUK_SINIR;
      const engel = sinirDoldu ? TEKIL_SINIR_DOLDU : kural.engel;
      const w = hazir.ozet.whatsapp;
      const ozet: YonlendirmeOzeti = {
        engel,
        yeniKayit: !mevcut,
        aliciTuru,
        numara: w?.numara.etiket ?? null,
        sablonAdi: w ? `${w.sablonAdi} (${w.dil})` : null,
        onizleme: hazir.ozet.onizleme,
        tahminiUcretUsd: w?.birimFiyatUsd ?? null,
        fiyatTarihi: w?.fiyatTarihi ?? null,
        testModu: w?.testModu ?? false,
      };
      if (!yaz || engel) throw new GeriAl(ozet);

      const k = tekilKampanyaBaslat(ctx, kampanya, aday, simdi);
      const yeniSohbet = sohbetBaslat(ctx, g.baglantiId, leadId, simdi);
      notEkle(ctx, sohbet.id, `→ ${yerel} numarasına şablon gönderime alındı`, simdi);
      if (mevcut) sistemOlayiEkle(ctx, leadId, "whatsapp_api", `${kaynakAyrintisi}: gelen kutusundan şablon gönderildi (${kullaniciAdi})`);
      return { kampanyaId: k.id, sohbetId: yeniSohbet.id, leadId, yeniKayit: !mevcut };
    });
  } catch (hata) {
    if (hata instanceof GeriAl) return hata.ozet;
    if (hata instanceof KampanyaHatasi) {
      // Şablon / numara / görsel bulunamadı gibi: gönderimde de aynı nedenle durur.
      if (!yaz) return { ...bosOzet(!mevcut, aliciTuru), engel: hata.message };
      throw new YonlendirmeHatasi(hata.message, 400);
    }
    throw hata;
  }
}

const bosOzet = (yeniKayit: boolean, aliciTuru: AliciTuru): YonlendirmeOzeti => ({
  engel: null,
  yeniKayit,
  aliciTuru,
  numara: null,
  sablonAdi: null,
  onizleme: null,
  tahminiUcretUsd: null,
  fiyatTarihi: null,
  testModu: false,
});

/** Pencerenin ön kontrolü: gönderimle aynı kurallar; hiçbir şey kalıcı yazılmaz. */
export function yonlendirmeOzeti(ctx: TenantContext, g: YonlendirmeGirdisi, simdi = new Date()): YonlendirmeOzeti {
  return calistir(ctx, g, simdi, false) as YonlendirmeOzeti;
}

/** Gönderim: engel varsa YonlendirmeHatasi (400; hiçbir şey yazılmaz). */
export function yonlendirmeGonder(ctx: TenantContext, g: YonlendirmeGirdisi, simdi = new Date()): YonlendirmeSonucu {
  const sonuc = calistir(ctx, g, simdi, true);
  if ("engel" in sonuc) throw new YonlendirmeHatasi(sonuc.engel ?? "Gönderilemedi.", 400);
  return sonuc;
}
