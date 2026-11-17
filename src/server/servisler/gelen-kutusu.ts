// Gelen kutusu servisi: sohbet listesi ve ayrıntısı, temsilcinin yanıtı, okundu bildirimi, atama, durum, iç notlar ve
// canlı yenileme (kısa yoklama). Herkes tüm sohbetleri görür; atama yalnızca sorumluluğu gösterir.
//
// Gönderme kuralları (sunucu, gönderimden hemen önce; arayüz yalnızca kısıt değildir):
//  - Numara kaldırılmışsa / sahipliği doğrulanmamışsa, Meta hesap kilidi varsa, kalite kırmızıysa gönderim yok.
//  - Test modu açıksa yalnızca o numaranın test numaralarına.
//  - Elle serbest METİN: yalnızca 24 saat penceresinde (kişinin bu numaraya son yazdığı andan itibaren). Bu müşteri
//    hizmeti yanıtıdır: WhatsApp izni "yok" olsa da (B3) ya da kişi RET vermiş olsa da (K4) gönderilebilir, çünkü
//    müşteri kendisi yazdı. RET'li kişiye her yanıt olay geçmişine "RET'li kişiye hizmet yanıtı" olarak yazılır.
//  - ŞABLON (her kategori): kampanya alıcı kurallarının tamamı (WhatsApp izni, RET, engel listesi, bireyselde İYS
//    beyanı, WhatsApp yok). RET'li ya da engelli kişiye şablon HİÇBİR koşulda gitmez (403). Şablon numaranın WABA'sında
//    ve kullanılabilir olmalı; test modu kapalıyken gönderen bilgileri tam olmalı; günlük WhatsApp sınırına ve Meta
//    portföy limitinin uygulama payına (kampanyalarla ortak, kayan 24 saat) sayılır.
//  - Gönderim istekte yapılır (kuyruğa girmez). Belirsiz sonuç (zaman aşımı, 5xx) tekrar denenmez: mesaj "gönderilemedi,
//    durum belirsiz" olarak yazılır. Aynı istemci kimliğiyle ikinci istek ilk mesajı döner (çift gönderim yok).
//  - Bot ve kampanya bu yoldan geçmez (kampanya işçide, bot C grubunda).
import "server-only";
import { z } from "zod";
import {
  MESAJ_SAYFA_BOYUTU,
  NOT_AZAMI,
  pencereAcik,
  pencereBitisi,
  mesajOzeti,
  YANIT_AZAMI,
  type SohbetAyrintiDto,
  type SohbetDurumu,
  type SohbetMesajiDto,
  type SohbetNotuDto,
  type SohbetOzetiDto,
} from "@/lib/gelen-kutusu";
import { HARIC_NEDEN_ADLARI, WHATSAPP_IZIN_KAYNAK_ADLARI } from "@/lib/mesajlasma";
import {
  degiskenDegerleri,
  hesapKilidiMesaji,
  hesapKilidiNedeni,
  metaLimitPayi,
  numaraEtiketi,
  sablonMetni,
  sablonParametreleri,
  type DegiskenEslemi,
} from "@/lib/whatsapp-api";
import { gunAnahtari } from "@/lib/zaman";
import { adresOzeti, telefonNormallestir } from "../messaging/adres";
import { aliciDegerlendir } from "../messaging/alici-kurallari";
import type { TenantContext } from "../repo/baglam";
import { retIsle } from "../repo/engel-listesi";
import {
  atanabilirUyeler,
  degisenSohbetler,
  gelenKutusuSurumuGetir,
  gidenMesajYaz,
  istemciMesajiBul,
  notEkle,
  notlariListele,
  okunduIsaretle,
  okunmamisSayilari,
  sohbetGetir,
  sohbetGuncelle,
  sohbetleriListele,
  sohbetMesajlariGetir,
  type SohbetFiltresi,
  type SohbetMesajiSatiri,
  type SohbetSatiri,
} from "../repo/gelen-kutusu";
import { sayacAyir, sayacIade } from "../repo/gonderim-sayaci";
import { iletiAyarlariGetir } from "../repo/ileti-ayarlari";
import { whatsappKampanyalariniDuraklat } from "../repo/kampanyalar";
import { kayitGetir } from "../repo/kayitlar";
import { whatsappSon24Saat } from "../repo/kuyruk";
import { sistemOlayiEkle } from "../repo/olaylar";
import { baglantiGetir, baglantilariListele, hesapKilidiYaz } from "../repo/whatsapp-baglantilari";
import { whatsappIzniAyarla, whatsappKisisiGetir, whatsappYokIsaretle } from "../repo/whatsapp-kisileri";
import { sablonGetir } from "../repo/whatsapp-sablonlari";
import { GraphHatasi, whatsappApiIstemcisi } from "../whatsapp-api";
import { engelSorgusuOlustur, gunlukSinir, ticariIletiEksikleri } from "./ileti";
import { medyaDto } from "./medya";
import { sablonlar, whatsappBaglantisiCoz, type SablonDto } from "./whatsapp-api";

export class GelenKutusuHatasi extends Error {
  constructor(
    mesaj: string,
    readonly durum: 400 | 403 | 404 | 409 | 429 | 502,
  ) {
    super(mesaj);
    this.name = "GelenKutusuHatasi";
  }
}

const kisiAdi = (s: { isletmeAdi: string | null; yetkiliAdi: string | null; telefon: string | null }) =>
  s.isletmeAdi?.trim() || s.yetkiliAdi?.trim() || s.telefon?.trim() || "İsimsiz kişi";

function ozetDto(s: SohbetSatiri, etiketler: Map<string, string>): SohbetOzetiDto {
  return {
    id: s.id,
    baglantiId: s.baglantiId,
    numara: etiketler.get(s.baglantiId) ?? numaraEtiketi(null),
    leadId: s.leadId,
    ad: kisiAdi(s),
    telefon: s.telefon,
    durum: s.durum,
    atananKullanici: s.atananKullanici,
    atananAd: s.atananAd,
    sonMesaj: s.sonTur ? mesajOzeti({ tur: s.sonTur, metin: s.sonMetin, icerikSilindi: Boolean(s.sonIcerikSilindi) }) : null,
    sonMesajTarihi: s.sonMesajTarihi?.toISOString() ?? null,
    sonGelenTarihi: s.sonGelenTarihi?.toISOString() ?? null,
    okunmamis: s.okunmamis,
    surum: s.surum,
  };
}

export function mesajDto(m: SohbetMesajiSatiri): SohbetMesajiDto {
  return {
    id: m.id,
    yon: m.yon,
    kaynak: m.kaynak,
    tur: m.tur,
    metin: m.metin,
    icerikSilindi: m.icerikSilindi,
    medya: m.medya ? medyaDto(m.medya) : null,
    gonderen: m.gonderenAd,
    kampanyaId: m.kampanyaId,
    teslimDurumu: m.teslimDurumu,
    teslimHataKodu: m.teslimHataKodu,
    tarih: m.tarih.toISOString(),
    surum: m.surum,
  };
}

const etiketler = (ctx: TenantContext) => new Map(baglantilariListele(ctx).map((b) => [b.id, numaraEtiketi(b)]));

export type SohbetListesi = {
  sohbetler: SohbetOzetiDto[];
  toplam: number;
  /** Numara kimliği → okunmamış; "toplam" anahtarı hepsinin toplamı. */
  okunmamis: Record<string, number>;
  numaralar: { id: string; etiket: string }[];
  surum: number;
};

export function sohbetListesi(ctx: TenantContext, f: SohbetFiltresi): SohbetListesi {
  // Sürüm sorgulardan ÖNCE okunur: arada gelen değişiklik bir sonraki yoklamada yeniden gelir (kaybolmaz).
  const surum = gelenKutusuSurumuGetir(ctx);
  const e = etiketler(ctx);
  const { satirlar, toplam } = sohbetleriListele(ctx, f);
  const sayilar = okunmamisSayilari(ctx);
  const okunmamis: Record<string, number> = { toplam: [...sayilar.values()].reduce((a, b) => a + b, 0) };
  for (const [b, n] of sayilar) okunmamis[b] = n;
  return {
    sohbetler: satirlar.map((s) => ozetDto(s, e)),
    toplam,
    okunmamis,
    numaralar: [...e].map(([id, etiket]) => ({ id, etiket })),
    surum,
  };
}

/** Menüdeki rozet: bütün sohbetlerin okunmamış toplamı. */
export function toplamOkunmamis(ctx: TenantContext): number {
  return [...okunmamisSayilari(ctx).values()].reduce((a, b) => a + b, 0);
}

export type SohbetAyrintisi = {
  sohbet: SohbetAyrintiDto;
  mesajlar: SohbetMesajiDto[];
  dahaEski: boolean;
  notlar: SohbetNotuDto[];
  uyeler: { id: string; ad: string }[];
  /** Bu numaranın WABA'sındaki kullanılabilir şablonlar (pencere kapalıyken ya da şablon göndermek için). */
  sablonlar: SablonDto[];
  surum: number;
};

function ayrintiDto(ctx: TenantContext, id: string, simdi: Date): SohbetAyrintiDto | null {
  const satir = sohbetleriListele(ctx, { idler: [id] }).satirlar[0];
  if (!satir) return null;
  const kayit = kayitGetir(ctx, satir.leadId)!;
  const wa = whatsappKisisiGetir(ctx, satir.leadId);
  const b = baglantiGetir(ctx, satir.baglantiId);
  const retVerdi = kayit.iletiIzni === "ret" || wa?.izin === "ret";
  const kilit = b?.hesapKilidiKodu ? hesapKilidiMesaji(b.hesapKilidiKodu) : null;
  return {
    ...ozetDto(satir, etiketler(ctx)),
    izin: retVerdi ? "ret" : wa?.izin === "var" ? "var" : "yok",
    izinKaynagi: !retVerdi && wa?.izin === "var" && wa.izinKaynagi ? WHATSAPP_IZIN_KAYNAK_ADLARI[wa.izinKaynagi] : null,
    bireysel: kayit.aliciTuru === "bireysel",
    iysBeyani: Boolean(wa?.iysBeyanTarihi),
    reklamdan: kayit.kaynak === "meta_reklam",
    retVerdi,
    pencereBitis: pencereAcik(satir.sonGelenTarihi, simdi) ? (pencereBitisi(satir.sonGelenTarihi)?.toISOString() ?? null) : null,
    testModu: b?.testModu ?? false,
    numaraKilitli: kilit ?? (b?.kalite === "RED" ? "Numaranın kalitesi düşük (kırmızı): gönderim durduruldu." : null),
  };
}

export function sohbetAyrintisi(ctx: TenantContext, id: string, simdi = new Date()): SohbetAyrintisi | null {
  const surum = gelenKutusuSurumuGetir(ctx);
  const sohbet = ayrintiDto(ctx, id, simdi);
  if (!sohbet) return null;
  const mesajlar = sohbetMesajlariGetir(ctx, id);
  return {
    sohbet,
    mesajlar: mesajlar.map(mesajDto),
    dahaEski: mesajlar.length >= MESAJ_SAYFA_BOYUTU,
    notlar: notlariDto(ctx, id),
    uyeler: atanabilirUyeler(ctx),
    sablonlar: sablonlar(ctx, sohbet.baglantiId).filter((s) => s.kullanilabilir),
    surum,
  };
}

/** Geriye kaydırma: bu tarihten eski mesajlar. */
export function eskiMesajlar(ctx: TenantContext, id: string, once: Date): SohbetMesajiDto[] | null {
  if (!sohbetGetir(ctx, id)) return null;
  return sohbetMesajlariGetir(ctx, id, { onceTarih: once }).map(mesajDto);
}

export type Degisiklikler =
  | { degisti: false; surum: number }
  | {
      degisti: true;
      surum: number;
      liste: SohbetListesi;
      /** Açık sohbet: ayrıntı ve yalnızca bu sürümden sonra eklenen ya da değişen mesajlar. */
      sohbet: { ayrinti: SohbetAyrintiDto | null; mesajlar: SohbetMesajiDto[]; notlar: SohbetNotuDto[] } | null;
    };

/** Kısa yoklama: sonra sürümünden beri değişiklik yoksa küçük yanıt; varsa liste ve açık sohbetin yenileri. */
export function degisiklikler(ctx: TenantContext, sonra: number, f: SohbetFiltresi, sohbetId: string | null, simdi = new Date()): Degisiklikler {
  const surum = gelenKutusuSurumuGetir(ctx);
  if (surum <= sonra) return { degisti: false, surum };
  const liste = sohbetListesi(ctx, f);
  let sohbet = null;
  if (sohbetId && degisenSohbetler(ctx, sonra).includes(sohbetId)) {
    sohbet = {
      ayrinti: ayrintiDto(ctx, sohbetId, simdi),
      mesajlar: sohbetMesajlariGetir(ctx, sohbetId, { sonraSurum: sonra }).map(mesajDto),
      notlar: notlariDto(ctx, sohbetId),
    };
  }
  return { degisti: true, surum: liste.surum, liste, sohbet };
}

// --- Okundu, atama, durum, notlar ---

/**
 * Temsilci sohbeti açtı: okunmamış sıfırlanır; ayar açıksa son gelen mesaja bir kez okundu bildirimi gider. Numara
 * kilitliyse ya da test modunda test numarası olmayan kişiyse bildirim gönderilmez. Meta hatası yok sayılır.
 */
export async function sohbetOkundu(ctx: TenantContext, id: string): Promise<{ bildirildi: boolean } | null> {
  const sohbet = sohbetGetir(ctx, id);
  if (!sohbet) return null;
  const wamid = okunduIsaretle(ctx, id);
  if (!wamid || !iletiAyarlariGetir(ctx).okunduBildirimi) return { bildirildi: false };
  const c = whatsappBaglantisiCoz(ctx, sohbet.baglantiId);
  if (!c || hesapKilidiNedeni(c.baglanti.hesapKilidiKodu)) return { bildirildi: false };
  if (c.baglanti.testModu) {
    const tel = telefonNormallestir(kayitGetir(ctx, sohbet.leadId)?.ekTelefon);
    if (!tel || !c.gizli.testNumaralari.includes(tel)) return { bildirildi: false };
  }
  try {
    await whatsappApiIstemcisi({ wabaId: c.baglanti.wabaId, phoneNumberId: c.baglanti.phoneNumberId, erisimAnahtari: c.gizli.erisimAnahtari }).okunduBildir(wamid);
    return { bildirildi: true };
  } catch {
    return { bildirildi: false };
  }
}

export const SohbetDegisikligi = z
  .object({
    durum: z.enum(["acik", "kapali"]),
    atananKullanici: z.string().min(1).max(100).nullable(),
  })
  .partial()
  .strict();

export function sohbetiGuncelle(ctx: TenantContext, id: string, d: { durum?: SohbetDurumu; atananKullanici?: string | null }) {
  return sohbetGuncelle(ctx, id, d);
}

export const NotGirdisi = z.object({ metin: z.string().trim().min(1, "Not boş olamaz.").max(NOT_AZAMI, `Not en fazla ${NOT_AZAMI} karakter olabilir.`) }).strict();

/** İç not: yalnızca ekip görür; Meta'ya hiçbir koşulda gitmez. */
export function notYaz(ctx: TenantContext, id: string, metin: string): SohbetNotuDto[] | null {
  if (!notEkle(ctx, id, metin)) return null;
  return notlariDto(ctx, id);
}

const notlariDto = (ctx: TenantContext, id: string): SohbetNotuDto[] =>
  notlariListele(ctx, id).map((n) => ({ id: n.id, kullanici: n.kullanici, metin: n.metin, tarih: n.tarih.toISOString() }));

// --- Pazarlama izni (sohbetten) ---

export const IzinGirdisi = z.object({ iysBeyani: z.boolean().default(false) }).strict();

/**
 * Kişi sohbette pazarlama iletisi istedi: temsilci tek tıkla WhatsApp iznini 'var' kaydeder (kaynak "WhatsApp sohbeti",
 * tarih şimdi, temsilci olayda ve notta). Bireysel alıcıda İYS beyanı ayrıca işaretlenmezse kampanya ve şablon yine
 * gitmez (kayıt ekranındaki kural aynen). RET'li kişide ve adresi engel listesindeyse izin yazılmaz (409): RET geri
 * alınamaz. İzin zaten 'var' ise yalnızca İYS beyanı eklenebilir; mevcut kaynak ve tarih korunur.
 */
export function pazarlamaIzniKaydet(ctx: TenantContext, sohbetId: string, g: { iysBeyani: boolean }): SohbetAyrintiDto {
  const sohbet = sohbetGetir(ctx, sohbetId);
  if (!sohbet) throw new GelenKutusuHatasi("Sohbet bulunamadı.", 404);
  const kayit = kayitGetir(ctx, sohbet.leadId);
  if (!kayit) throw new GelenKutusuHatasi("Kişi bulunamadı.", 404);
  const wa = whatsappKisisiGetir(ctx, kayit.id);
  if (kayit.iletiIzni === "ret" || wa?.izin === "ret") {
    throw new GelenKutusuHatasi("RET verdi: pazarlama izni kaydedilemez (ret geri alınamaz).", 409);
  }
  const engelli = engelSorgusuOlustur(ctx, [kayit]);
  const telefon = telefonNormallestir(kayit.ekTelefon);
  if ((telefon && engelli("telefon", telefon)) || (wa?.bsuid && engelli("wa_kimlik", wa.bsuid))) {
    throw new GelenKutusuHatasi("Kişinin adresi engel listesinde: pazarlama izni kaydedilemez.", 409);
  }
  const iysBeyani = kayit.aliciTuru === "bireysel" && g.iysBeyani;
  const numara = baglantiGetir(ctx, sohbet.baglantiId)?.ad ?? "silinmiş";
  const kullaniciAdi = atanabilirUyeler(ctx).find((u) => u.id === ctx.userId)?.ad ?? "bilinmiyor";
  const sonuc =
    wa?.izin === "var"
      ? whatsappIzniAyarla(ctx, kayit.id, {
          izin: "var",
          kaynak: wa.izinKaynagi,
          tarih: wa.izinTarihi,
          not: wa.izinNotu,
          iceAktarmaId: wa.izinIceAktarmaId,
          iysBeyani: iysBeyani || Boolean(wa.iysBeyanTarihi),
        })
      : whatsappIzniAyarla(ctx, kayit.id, {
          izin: "var",
          kaynak: "whatsapp_sohbeti",
          tarih: new Date(),
          not: `Kişi WhatsApp sohbetinde pazarlama iletisi istedi (${numara} numarası); kaydeden: ${kullaniciAdi}`,
          iysBeyani,
        });
  if (!sonuc.tamam) throw new GelenKutusuHatasi(sonuc.neden === "ret" ? "RET verdi: pazarlama izni kaydedilemez." : "Kişi bulunamadı.", sonuc.neden === "ret" ? 409 : 404);
  return ayrintiDto(ctx, sohbetId, new Date())!;
}

// --- Gönderme ---

const istemciKimligi = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Geçersiz istemci kimliği.");
export const MesajGirdisi = z.discriminatedUnion("tur", [
  z
    .object({
      tur: z.literal("metin"),
      metin: z.string().trim().min(1, "Mesaj boş olamaz.").max(YANIT_AZAMI, `Mesaj en fazla ${YANIT_AZAMI} karakter olabilir.`),
      istemciKimligi,
    })
    .strict(),
  z
    .object({
      tur: z.literal("sablon"),
      sablonId: z.string().min(1).max(100),
      /** Değişken anahtarı ("body:1", "header:ad") → değer. */
      degiskenler: z.record(z.string().max(100), z.string().max(1000)).default({}),
      istemciKimligi,
    })
    .strict(),
]);
export type MesajGirdisi = z.infer<typeof MesajGirdisi>;

/** Aynı istemci kimliğiyle eşzamanlı ikinci istek (ilk henüz bitmeden): çift gönderim olmasın. */
const isleniyor = new Set<string>();

export type GonderimSonucu = { mesaj: SohbetMesajiDto; tekrar: boolean; uyari: string | null };

export async function sohbetMesajiGonder(ctx: TenantContext, sohbetId: string, g: MesajGirdisi, simdi = new Date()): Promise<GonderimSonucu> {
  const sohbet = sohbetGetir(ctx, sohbetId);
  if (!sohbet) throw new GelenKutusuHatasi("Sohbet bulunamadı.", 404);

  const onceki = istemciMesajiBul(ctx, g.istemciKimligi);
  if (onceki) {
    if (onceki.sohbetId !== sohbetId) throw new GelenKutusuHatasi("Geçersiz istemci kimliği.", 400);
    return { mesaj: mesajDto({ ...onceki, gonderenAd: null, medya: null }), tekrar: true, uyari: null };
  }
  const anahtar = `${ctx.tenantId}|${g.istemciKimligi}`;
  if (isleniyor.has(anahtar)) throw new GelenKutusuHatasi("Bu mesaj zaten gönderiliyor.", 409);
  isleniyor.add(anahtar);
  try {
    return await gonder(ctx, sohbet, g, simdi);
  } finally {
    isleniyor.delete(anahtar);
  }
}

async function gonder(
  ctx: TenantContext,
  sohbet: NonNullable<ReturnType<typeof sohbetGetir>>,
  g: MesajGirdisi,
  simdi: Date,
): Promise<GonderimSonucu> {
  const c = whatsappBaglantisiCoz(ctx, sohbet.baglantiId);
  if (!c) throw new GelenKutusuHatasi("Bu sohbetin WhatsApp numarası kaldırılmış ya da doğrulanmamış.", 409);
  const kilitKodu = c.baglanti.hesapKilidiKodu;
  if (hesapKilidiNedeni(kilitKodu)) throw new GelenKutusuHatasi(hesapKilidiMesaji(kilitKodu!), 409);
  if (c.baglanti.kalite === "RED") throw new GelenKutusuHatasi("Numaranın kalitesi düşük (kırmızı): gönderim durduruldu.", 409);

  const kayit = kayitGetir(ctx, sohbet.leadId);
  if (!kayit) throw new GelenKutusuHatasi("Kişi bulunamadı.", 404);
  const wa = whatsappKisisiGetir(ctx, kayit.id);
  const retVerdi = kayit.iletiIzni === "ret" || wa?.izin === "ret";
  const telefon = telefonNormallestir(kayit.ekTelefon);
  if (c.baglanti.testModu && (!telefon || !c.gizli.testNumaralari.includes(telefon))) {
    throw new GelenKutusuHatasi("Bu numaranın test modu açık: yalnızca Ayarlar'daki test numaralarına gönderilebilir.", 403);
  }
  const numara = c.baglanti.ad;
  const istemci = whatsappApiIstemcisi({ wabaId: c.baglanti.wabaId, phoneNumberId: c.baglanti.phoneNumberId, erisimAnahtari: c.gizli.erisimAnahtari });

  // Gönderim ve sonuç (her iki tür için ortak).
  type Hazir = {
    alici: { tur: "telefon" | "bsuid"; deger: string };
    gonderim: () => Promise<{ wamid: string }>;
    tur: "text" | "template";
    metin: string;
    olay: string;
    iade: (() => void) | null;
    engelTuru: "telefon" | "wa_kimlik";
  };
  let h: Hazir;

  if (g.tur === "metin") {
    // Müşteri hizmeti yanıtı: yalnızca pencere içinde; izin ve RET aranmaz (K4, B3).
    if (!pencereAcik(sohbet.sonGelenTarihi, simdi)) {
      throw new GelenKutusuHatasi(
        retVerdi
          ? "RET verdi; yalnızca kendisi yazarsa 24 saat içinde yanıt verebilirsiniz."
          : "24 saatlik pencere kapalı: serbest metin gönderilemez, onaylı bir şablon seçin.",
        400,
      );
    }
    const alici = telefon ? { tur: "telefon" as const, deger: telefon } : wa?.bsuid ? { tur: "bsuid" as const, deger: wa.bsuid } : null;
    if (!alici) throw new GelenKutusuHatasi("Kişinin WhatsApp numarası ya da kimliği yok.", 400);
    h = {
      alici,
      gonderim: () => istemci.metinGonder({ alici, metin: g.metin }),
      tur: "text",
      metin: g.metin,
      olay: retVerdi ? `RET'li kişiye hizmet yanıtı (${numara} numarası)` : `WhatsApp yanıtı gönderildi (${numara} numarası)`,
      iade: null,
      engelTuru: alici.tur === "bsuid" ? "wa_kimlik" : "telefon",
    };
  } else {
    // Şablon: kampanya alıcı kurallarının tamamı. RET'li / engelli kişiye hiçbir koşulda gitmez.
    const karar = aliciDegerlendir({ ...kayit, whatsapp: wa }, "whatsapp_api", engelSorgusuOlustur(ctx, [kayit]), {
      simdi,
      testNumaralari: c.baglanti.testModu ? new Set(c.gizli.testNumaralari) : undefined,
    });
    if (!karar.uygun) throw new GelenKutusuHatasi(`Bu kişiye şablon gönderilemez: ${HARIC_NEDEN_ADLARI[karar.neden]}.`, 403);
    if (karar.adres === null) throw new GelenKutusuHatasi("Kişinin WhatsApp numarası yok.", 400);
    const sablon = sablonGetir(ctx, g.sablonId);
    if (!sablon || sablon.wabaId !== c.baglanti.wabaId) throw new GelenKutusuHatasi("Bu şablon bu numaranın WhatsApp hesabında yok.", 400);
    if (sablon.destekNedeni !== null) throw new GelenKutusuHatasi("Bu şablon şu an kullanılamaz.", 400);
    const eslem: DegiskenEslemi = Object.fromEntries(Object.entries(g.degiskenler).map(([k, v]) => [k, { kaynak: "sabit" as const, deger: v }]));
    const degerler = degiskenDegerleri(sablon.degiskenler, eslem, kayit);
    if (!degerler) throw new GelenKutusuHatasi("Şablonun bütün değişkenlerini doldurun.", 400);
    if (!c.baglanti.testModu) {
      const eksik = ticariIletiEksikleri(iletiAyarlariGetir(ctx), "whatsapp_api");
      if (eksik.length) throw new GelenKutusuHatasi(`Ticari ileti bilgileri eksik: ${eksik.join(", ")}.`, 400);
    }
    // Meta portföy limitinin payı: kampanyalarla ortak (kayan 24 saat, bütün numaralar).
    const pay = metaLimitPayi(c.baglanti);
    if (Number.isFinite(pay) && whatsappSon24Saat(ctx, simdi) >= pay) {
      throw new GelenKutusuHatasi(
        "Meta mesajlaşma limitinin bu uygulamaya ayrılan payı son 24 saatte doldu (kampanyalarla ortak). Daha sonra tekrar deneyin.",
        429,
      );
    }
    const gun = gunAnahtari(simdi);
    if (!sayacAyir(ctx, "whatsapp_api", gun, gunlukSinir(iletiAyarlariGetir(ctx), "whatsapp_api"))) {
      throw new GelenKutusuHatasi("Bugünkü WhatsApp gönderim sınırı doldu.", 429);
    }
    const alici = { tur: karar.kaynak === "bsuid" ? ("bsuid" as const) : ("telefon" as const), deger: karar.adres };
    h = {
      alici,
      gonderim: () =>
        istemci.mesajGonder({
          alici,
          sablonAdi: sablon.ad,
          dil: sablon.dil,
          bilesenler: sablonParametreleri(sablon.degiskenler, degerler, sablon.parametreBicimi === "NAMED"),
        }),
      tur: "template",
      metin: sablonMetni(sablon.bilesenler, degerler),
      olay: `WhatsApp şablonu gönderildi: ${sablon.ad} (${numara} numarası)`,
      iade: () => sayacIade(ctx, "whatsapp_api", gun),
      engelTuru: alici.tur === "bsuid" ? "wa_kimlik" : "telefon",
    };
  }

  const yaz = (wamid: string | null, teslim: string) =>
    gidenMesajYaz(
      ctx,
      {
        baglantiId: sohbet.baglantiId,
        leadId: sohbet.leadId,
        kaynak: "temsilci",
        tur: h.tur,
        metin: h.metin,
        wamid,
        istemciKimligi: g.istemciKimligi,
        gonderenKullanici: ctx.userId || null,
        teslimDurumu: teslim,
        ilkDurum: "acik",
      },
      simdi,
    );

  try {
    const yanit = await h.gonderim();
    const mesaj = yaz(yanit.wamid, "gonderildi");
    sistemOlayiEkle(ctx, kayit.id, "whatsapp_yanit", h.olay);
    return { mesaj: mesajDto({ ...mesaj, gonderenAd: null, medya: null }), tekrar: false, uyari: null };
  } catch (hata) {
    const e = hata instanceof GraphHatasi ? hata : null;
    // Gidip gitmediği bilinmiyor: tekrar denenmez, sayaçtan düşülmez; temsilci görsün diye mesaj yazılır.
    if (!e || e.http === 0 || e.http >= 500 || e.kod === 131000) {
      const mesaj = yaz(null, "belirsiz");
      sistemOlayiEkle(ctx, kayit.id, "whatsapp_yanit", `${h.olay} — sonuç belirsiz`);
      return {
        mesaj: mesajDto({ ...mesaj, gonderenAd: null, medya: null }),
        tekrar: false,
        uyari: "Meta'dan yanıt alınamadı: mesaj gitmiş de olabilir, gitmemiş de. Tekrar göndermeden önce müşteriyle teyit edin.",
      };
    }
    h.iade?.();
    const kilit = hesapKilidiNedeni(e.kod);
    if (kilit) {
      whatsappKampanyalariniDuraklat(ctx, kilit, { baglantiIdler: hesapKilidiYaz(ctx, sohbet.baglantiId, e.kod!, simdi) });
      throw new GelenKutusuHatasi(hesapKilidiMesaji(e.kod!), 409);
    }
    switch (e.kod) {
      case 131047:
        throw new GelenKutusuHatasi("Meta: 24 saatlik pencere kapanmış. Onaylı bir şablon gönderin.", 400);
      case 131026:
        whatsappYokIsaretle(ctx, kayit.id, simdi);
        throw new GelenKutusuHatasi("Bu kişide WhatsApp yok ya da ileti teslim edilemiyor.", 400);
      case 131050:
        retIsle(ctx, {
          leadId: kayit.id,
          adresler: [{ tur: h.engelTuru, ozet: adresOzeti(ctx.tenantId, h.engelTuru, h.alici.deger) }],
          kaynak: "whatsapp_ret",
          aciklama: "Kişi WhatsApp'ta bu işletmeden pazarlama iletilerini durdurmuş (Meta 131050)",
        });
        throw new GelenKutusuHatasi("Kişi bu işletmeden pazarlama iletilerini durdurmuş; şablon gönderilemez.", 403);
    }
    if (e.http === 429 || e.kod === 130429 || e.kod === 131056) throw new GelenKutusuHatasi("Meta hız sınırı: biraz sonra tekrar deneyin.", 429);
    throw new GelenKutusuHatasi(`Meta gönderimi reddetti: ${e.message.slice(0, 200)}`, 502);
  }
}

/** Liste süzgeci sorgu parametrelerinden: numara, durum (acik | kapali), atanan (ben | yok), q, sayfa. */
export function sohbetFiltresiCoz(ctx: TenantContext, p: URLSearchParams): SohbetFiltresi {
  const durum = p.get("durum");
  const atanan = p.get("atanan");
  return {
    baglantiId: p.get("numara") || undefined,
    durum: durum === "acik" || durum === "kapali" ? durum : undefined,
    atanan: atanan === "ben" ? ctx.userId : atanan === "yok" ? "yok" : undefined,
    arama: p.get("q")?.slice(0, 100) || undefined,
    sayfa: Math.max(1, Number(p.get("sayfa") ?? 1) || 1),
  };
}
