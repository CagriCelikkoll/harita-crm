// Gelen kutusu servisi: sohbet listesi ve ayrıntısı, temsilcinin yanıtı, okundu bildirimi, atama, durum, iç notlar ve
// canlı yenileme (kısa yoklama). Herkes tüm sohbetleri görür; atama yalnızca sorumluluğu gösterir.
//
// Gönderme kuralları (sunucu, gönderimden hemen önce; arayüz yalnızca kısıt değildir):
//  - Numara kaldırılmışsa / sahipliği doğrulanmamışsa, Meta hesap kilidi varsa, kalite kırmızıysa gönderim yok.
//  - Test modu açıksa yalnızca o numaranın test numaralarına.
//  - Elle serbest METİN: yalnızca 24 saat penceresinde (kişinin bu numaraya son yazdığı andan itibaren). Bu müşteri
//    hizmeti yanıtıdır: WhatsApp izni "yok" olsa da (B3) ya da kişi RET vermiş olsa da (K4) gönderilebilir, çünkü
//    müşteri kendisi yazdı. RET'li kişiye her yanıt olay geçmişine "RET'li kişiye hizmet yanıtı" olarak yazılır.
//  - Elle MEDYA (görsel, video, belge): metinle aynı kurallar; dosya içerikten doğrulanır (giden-medya.ts), medya kotasına
//    sayılır, gelen medyanın klasörüne yazılır ve Meta'ya yüklenip gönderilir. Meta reddederse mesaj "failed" ve
//    nedeniyle yazılır, aynı dosyayla yeniden denenebilir. Metin ve medya bir mesaja yanıt olabilir (context.message_id).
//  - ŞABLON (her kategori): kampanya alıcı kurallarının tamamı (WhatsApp izni, RET, engel listesi, bireyselde İYS
//    beyanı, WhatsApp yok). RET'li ya da engelli kişiye şablon HİÇBİR koşulda gitmez (403). Şablon numaranın WABA'sında
//    ve kullanılabilir olmalı; test modu kapalıyken gönderen bilgileri tam olmalı; günlük WhatsApp sınırına ve Meta
//    portföy limitinin uygulama payına (kampanyalarla ortak, kayan 24 saat) sayılır.
//  - Gönderim istekte yapılır (kuyruğa girmez). Belirsiz sonuç (zaman aşımı, 5xx) tekrar denenmez: mesaj "gönderilemedi,
//    durum belirsiz" olarak yazılır. Aynı istemci kimliğiyle ikinci istek ilk mesajı döner (çift gönderim yok).
//  - Bot ve kampanya bu yoldan geçmez (kampanya işçide, bot C grubunda).
import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  ACIKLAMA_AZAMI,
  ciplerCoz,
  MEDYA_KOTA_BAYT,
  medyaGonderimHataMetni,
  MESAJ_SAYFA_BOYUTU,
  MESAJ_TUR_ADLARI,
  type GidenMedyaTuru,
  NOT_AZAMI,
  pencereAcik,
  pencereBitisi,
  mesajOzeti,
  silmeOnayiDogruMu,
  TOPLU_KAPATMA_AZAMI,
  YANIT_AZAMI,
  type SohbetCipi,
  type SohbetAyrintiDto,
  type SohbetDurumu,
  type SohbetMesajiDto,
  type SohbetNotuDto,
  type SohbetOzetiDto,
} from "@/lib/gelen-kutusu";
import { HARIC_NEDEN_ADLARI, WHATSAPP_IZIN_KAYNAK_ADLARI } from "@/lib/mesajlasma";
import {
  baslikBicimiBul,
  degiskenDegerleri,
  GORSEL_BASLIK,
  hesapKilidiMesaji,
  hesapKilidiNedeni,
  metaLimitPayi,
  numaraEtiketi,
  numaraKayitsizGonderimMesaji,
  numaraKayitsizKoduMu,
  sablonMetni,
  sablonParametreleri,
  type DegiskenEslemi,
} from "@/lib/whatsapp-api";
import { gunAnahtari } from "@/lib/zaman";
import { adresOzeti, telefonNormallestir } from "../messaging/adres";
import { aliciDegerlendir } from "../messaging/alici-kurallari";
import { KayitKuraliHatasi, YetkiHatasi, type TenantContext } from "../repo/baglam";
import { retIsle } from "../repo/engel-listesi";
import {
  atanabilirUyeler,
  cipSayilari,
  degisenSohbetler,
  gelenKutusuSurumuGetir,
  gidenMesajYaz,
  gidenMesajSonucuYaz,
  istemciMesajiBul,
  mesajSatiriGetir,
  notEkle,
  notlariListele,
  okunduIsaretle,
  okunmamisSayilari,
  sohbetGetir,
  sohbetGuncelle,
  sohbetleriKapat,
  sohbetleriListele,
  sohbetSil,
  sohbetMesajlariGetir,
  type SohbetFiltresi,
  type SohbetMesajiSatiri,
  type SohbetSatiri,
} from "../repo/gelen-kutusu";
import { sayacAyir, sayacIade } from "../repo/gonderim-sayaci";
import { medyaKotaKullanimi } from "../repo/sistem/medya";
import { iletiAyarlariGetir } from "../repo/ileti-ayarlari";
import { whatsappKampanyalariniDuraklat } from "../repo/kampanyalar";
import { kayitGetir } from "../repo/kayitlar";
import { whatsappSon24Saat } from "../repo/kuyruk";
import { sistemOlayiEkle } from "../repo/olaylar";
import { baglantiGetir, baglantilariListele, hesapKilidiYaz, sonHataYaz } from "../repo/whatsapp-baglantilari";
import { whatsappIzniAyarla, whatsappKisisiGetir, whatsappYokIsaretle } from "../repo/whatsapp-kisileri";
import { sablonGetir } from "../repo/whatsapp-sablonlari";
import { GraphHatasi, whatsappApiIstemcisi } from "../whatsapp-api";
import { GidenMedyaHatasi, gidenMedyaDogrula } from "./giden-medya";
import { engelSorgusuOlustur, gunlukSinir, ticariIletiEksikleri } from "./ileti";
import { medyaDto } from "./medya";
import { medyaTamYolu, yeniMedyaYolu } from "./medya-dosyalari";
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
    sonMesaj: s.sonTur
      ? mesajOzeti({ tur: s.sonTur, metin: s.sonMetin, icerikSilindi: Boolean(s.sonIcerikSilindi), dosyaAdi: s.sonDosyaAdi })
      : null,
    sonMesajTarihi: s.sonMesajTarihi?.toISOString() ?? null,
    sonGelenTarihi: s.sonGelenTarihi?.toISOString() ?? null,
    okunmamis: s.okunmamis,
    teklifIstegi: s.teklifIstegiTarihi?.toISOString() ?? null,
    ret: Boolean(s.ret),
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
    sablonGorseli: m.tur === "template" && m.kampanyaGorselId ? `/api/medya/${m.kampanyaGorselId}` : null,
    teslimDurumu: m.teslimDurumu,
    teslimHataKodu: m.teslimHataKodu,
    hataMetni: m.hataMetni ?? (m.teslimDurumu === "failed" ? medyaGonderimHataMetni(m.teslimHataKodu) : null),
    tekrarDenenebilir:
      m.yon === "giden" && m.kaynak === "temsilci" && m.teslimDurumu === "failed" && m.medya?.durum === "indirildi" && Boolean(m.medya.yol),
    yanit: m.yanitWamid
      ? m.yanitlanan
        ? { id: m.yanitlanan.id, yon: m.yanitlanan.yon, ozet: mesajOzeti(m.yanitlanan) }
        : { id: null, yon: null, ozet: "Önceki bir mesaj" }
      : null,
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
  /** Çip sayıları: süzgecin geri kalanıyla (seçili diğer çipler hariç). */
  cipSayilari: Record<SohbetCipi, number>;
  surum: number;
};

export function sohbetListesi(ctx: TenantContext, filtre: SohbetFiltresi, simdi = new Date()): SohbetListesi {
  // Sürüm sorgulardan ÖNCE okunur: arada gelen değişiklik bir sonraki yoklamada yeniden gelir (kaybolmaz).
  const surum = gelenKutusuSurumuGetir(ctx);
  const f = { ...filtre, simdi: filtre.simdi ?? simdi };
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
    cipSayilari: cipSayilari(ctx, f),
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
    iysKontrolu: iletiAyarlariGetir(ctx).iysKontrolu,
    reklamdan: kayit.kaynak === "meta_reklam",
    retVerdi,
    pencereBitis: pencereAcik(satir.sonGelenTarihi, simdi) ? (pencereBitisi(satir.sonGelenTarihi)?.toISOString() ?? null) : null,
    testModu: b?.testModu ?? false,
    numaraKilitli: kilit ?? (b?.kalite === "RED" ? "Numaranın kalitesi düşük (kırmızı): gönderim durduruldu." : null),
    gonderenNumara: b?.gorunenNumara?.replace(/\D/g, "") || null,
    yonlendiren:
      kayit.kaynak === "yonlendirme" && kayit.kaynakAyrintisi
        ? { metin: kayit.kaynakAyrintisi, sohbetId: kayit.yonlendirenSohbetId && sohbetGetir(ctx, kayit.yonlendirenSohbetId) ? kayit.yonlendirenSohbetId : null }
        : null,
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
    // Görselli şablon yalnızca kampanyadan gönderilir (görsel kampanyada yüklenir); gelen kutusunda listelenmez.
    sablonlar: sablonlar(ctx, sohbet.baglantiId).filter((s) => s.kullanilabilir && s.baslikBicimi !== GORSEL_BASLIK),
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
  const liste = sohbetListesi(ctx, f, simdi);
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

export const TopluKapatmaGirdisi = z
  .object({ idler: z.array(z.string().min(1).max(64)).min(1, "Sohbet seçin.").max(TOPLU_KAPATMA_AZAMI, `Bir seferde en fazla ${TOPLU_KAPATMA_AZAMI} sohbet kapatılabilir.`) })
  .strict();

/** "Seçilenleri kapat": herkes (atama gibi); yalnızca bu çalışma alanının açık sohbetleri. Kapanan sayısı. */
export function sohbetleriTopluKapat(ctx: TenantContext, idler: string[]): { kapatilan: number } {
  return { kapatilan: sohbetleriKapat(ctx, idler) };
}

export const SilmeGirdisi = z.object({ onay: z.string().max(300) }).strict();

/**
 * Sohbeti yalnızca Harita CRM'den kalıcı olarak siler (yalnızca yönetici; onay: sohbetin adı yazılmalı). Mesajlar,
 * medya dosyaları ve iç notlar silinir; kayıt, izin / RET ve kampanya istatistikleri korunur; denetim kaydına yazılır.
 */
export function sohbetiSil(ctx: TenantContext, id: string, onay: string, simdi = new Date()): { mesaj: number; medya: number; not: number } {
  if (ctx.rol !== "yonetici") throw new GelenKutusuHatasi("Sohbeti yalnızca yönetici silebilir.", 403);
  const satir = sohbetleriListele(ctx, { idler: [id] }).satirlar[0];
  if (!satir) throw new GelenKutusuHatasi("Sohbet bulunamadı.", 404);
  const ad = kisiAdi(satir);
  if (!silmeOnayiDogruMu(onay, ad)) throw new GelenKutusuHatasi(`Onay için sohbetin adını aynen yazın: ${ad}`, 400);
  let sonuc: ReturnType<typeof sohbetSil>;
  try {
    sonuc = sohbetSil(ctx, id, { ad, numara: etiketler(ctx).get(satir.baglantiId) ?? numaraEtiketi(null) }, simdi);
  } catch (h) {
    if (h instanceof YetkiHatasi) throw new GelenKutusuHatasi("Sohbeti yalnızca yönetici silebilir.", 403);
    if (h instanceof KayitKuraliHatasi) throw new GelenKutusuHatasi(h.message, h.durum);
    throw h;
  }
  if (!sonuc) throw new GelenKutusuHatasi("Sohbet bulunamadı.", 404);
  // Dosyalar işlemden sonra silinir; silinemeyen kalırsa günlük medya bakımı (artakalan) siler.
  for (const yol of sonuc.dosyalar) {
    try {
      fs.rmSync(medyaTamYolu(yol), { force: true });
    } catch {
      // geçersiz yol ya da erişim hatası: bakım temizler
    }
  }
  return { mesaj: sonuc.mesaj, medya: sonuc.medya, not: sonuc.not };
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
/** Yanıtlanan mesaj (bu sohbetin, wamid'i olan): gönderimde context.message_id. */
const yanitlananId = z.string().min(1).max(64).nullish();
export const MesajGirdisi = z.discriminatedUnion("tur", [
  z
    .object({
      tur: z.literal("metin"),
      metin: z.string().trim().min(1, "Mesaj boş olamaz.").max(YANIT_AZAMI, `Mesaj en fazla ${YANIT_AZAMI} karakter olabilir.`),
      yanitlananId,
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

/** Medya gönderiminin dosya dışındaki alanları (multipart; rota ayrıştırır). Açıklama görsel, video ve belgeye eklenir. */
export const MedyaGirdisi = z
  .object({
    aciklama: z
      .string()
      .trim()
      .max(ACIKLAMA_AZAMI, `Açıklama en fazla ${ACIKLAMA_AZAMI} karakter olabilir.`)
      .transform((s) => s || null)
      .nullish(),
    yanitlananId,
    istemciKimligi,
  })
  .strict();
export type MedyaGirdisi = z.infer<typeof MedyaGirdisi>;

export const MEDYA_KOTASI_DOLU = "Medya için ayrılan disk alanı doldu; dosya gönderilemedi. Ayarlar'dan saklama süresini kısaltabilirsiniz.";

/** Aynı istemci kimliğiyle (ya da aynı mesajın yeniden denenmesiyle) eşzamanlı ikinci istek: çift gönderim olmasın. */
const isleniyor = new Set<string>();

async function tekSeferde<T>(anahtar: string, fn: () => Promise<T>): Promise<T> {
  if (isleniyor.has(anahtar)) throw new GelenKutusuHatasi("Bu mesaj zaten gönderiliyor.", 409);
  isleniyor.add(anahtar);
  try {
    return await fn();
  } finally {
    isleniyor.delete(anahtar);
  }
}

export type GonderimSonucu = { mesaj: SohbetMesajiDto; tekrar: boolean; uyari: string | null };

type SohbetKaydi = NonNullable<ReturnType<typeof sohbetGetir>>;

/** Sohbet bu çalışma alanının olmalı; aynı istemci kimliğiyle yazılmış mesaj varsa o döner (ikinci kez gönderilmez). */
async function istemciKimligiyle(
  ctx: TenantContext,
  sohbetId: string,
  kimlik: string,
  fn: (sohbet: SohbetKaydi) => Promise<GonderimSonucu>,
): Promise<GonderimSonucu> {
  const sohbet = sohbetGetir(ctx, sohbetId);
  if (!sohbet) throw new GelenKutusuHatasi("Sohbet bulunamadı.", 404);
  const onceki = istemciMesajiBul(ctx, kimlik);
  if (onceki) {
    if (onceki.sohbetId !== sohbetId) throw new GelenKutusuHatasi("Geçersiz istemci kimliği.", 400);
    return { mesaj: mesajDto(mesajSatiriGetir(ctx, onceki.id)!), tekrar: true, uyari: null };
  }
  return tekSeferde(`${ctx.tenantId}|${kimlik}`, () => fn(sohbet));
}

export async function sohbetMesajiGonder(ctx: TenantContext, sohbetId: string, g: MesajGirdisi, simdi = new Date()): Promise<GonderimSonucu> {
  return istemciKimligiyle(ctx, sohbetId, g.istemciKimligi, (sohbet) => gonder(ctx, sohbet, g, simdi));
}

/** Her gönderimin ön koşulları: numara bağlı ve doğrulanmış, hesap kilidi yok, kalite kırmızı değil, test modu kuralı. */
function numaraHazirla(ctx: TenantContext, sohbet: SohbetKaydi) {
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
  const istemci = whatsappApiIstemcisi({ wabaId: c.baglanti.wabaId, phoneNumberId: c.baglanti.phoneNumberId, erisimAnahtari: c.gizli.erisimAnahtari });
  return { c, kayit, wa, retVerdi, telefon, numara: c.baglanti.ad, istemci };
}
type NumaraHazir = ReturnType<typeof numaraHazirla>;
type Alici = { tur: "telefon" | "bsuid"; deger: string };

/**
 * Serbest (metin ve medya) gönderim: müşteri hizmeti yanıtı, yalnızca 24 saat penceresinde; WhatsApp izni ve RET
 * aranmaz (K4, B3: kişi kendisi yazdı). Alıcı: telefon, yoksa BSUID.
 */
function serbestAlici(sohbet: SohbetKaydi, h: NumaraHazir, simdi: Date): Alici {
  if (!pencereAcik(sohbet.sonGelenTarihi, simdi)) {
    throw new GelenKutusuHatasi(
      h.retVerdi
        ? "RET verdi; yalnızca kendisi yazarsa 24 saat içinde yanıt verebilirsiniz."
        : "24 saatlik pencere kapalı: serbest metin gönderilemez, onaylı bir şablon seçin.",
      400,
    );
  }
  const alici = h.telefon ? { tur: "telefon" as const, deger: h.telefon } : h.wa?.bsuid ? { tur: "bsuid" as const, deger: h.wa.bsuid } : null;
  if (!alici) throw new GelenKutusuHatasi("Kişinin WhatsApp numarası ya da kimliği yok.", 400);
  return alici;
}

/** Yanıtlanan mesajın wamid'i: aynı sohbette olmalı ve WhatsApp'a ulaşmış (wamid'li) olmalı. */
function yanitWamidBul(ctx: TenantContext, sohbet: SohbetKaydi, id: string | null | undefined): string | null {
  if (!id) return null;
  const m = mesajSatiriGetir(ctx, id);
  if (!m || m.sohbetId !== sohbet.id || !m.wamid) throw new GelenKutusuHatasi("Yanıtlanan mesaj bulunamadı ya da WhatsApp'a ulaşmamış.", 400);
  return m.wamid;
}

const serbestOlay = (h: NumaraHazir) =>
  h.retVerdi ? `RET'li kişiye hizmet yanıtı (${h.numara} numarası)` : `WhatsApp yanıtı gönderildi (${h.numara} numarası)`;

/** Gidip gitmediği bilinmeyen sonuç (ağ, zaman aşımı, 5xx, 131000): tekrar denenmez. */
const belirsizMi = (hata: unknown) => {
  const e = hata instanceof GraphHatasi ? hata : null;
  return !e || e.http === 0 || e.http >= 500 || e.kod === 131000;
};

/**
 * Kesin Meta hatası (gönderim reddedildi): yan etkiler (hesap kilidi → kampanyalar durur; numara kayıtsız; WhatsApp yok
 * işareti; 131050 → ret akışı) uygulanır, kullanıcıya gösterilecek hata döner.
 */
function metaHatasi(ctx: TenantContext, sohbet: SohbetKaydi, kayitId: string, alici: Alici, e: GraphHatasi, simdi: Date): GelenKutusuHatasi {
  const kilit = hesapKilidiNedeni(e.kod);
  if (kilit) {
    whatsappKampanyalariniDuraklat(ctx, kilit, { baglantiIdler: hesapKilidiYaz(ctx, sohbet.baglantiId, e.kod!, simdi) });
    return new GelenKutusuHatasi(hesapKilidiMesaji(e.kod!), 409);
  }
  if (numaraKayitsizKoduMu(e.kod)) {
    // Numara Cloud API'ye kayıtlı değil (133010): kampanya işçisiyle aynı davranış, yalnızca bu numara.
    const metin = numaraKayitsizGonderimMesaji(e.kod!);
    sonHataYaz(ctx, sohbet.baglantiId, metin);
    whatsappKampanyalariniDuraklat(ctx, "numara_kayitsiz", { baglantiIdler: [sohbet.baglantiId] });
    return new GelenKutusuHatasi(metin, 409);
  }
  switch (e.kod) {
    case 131026:
      whatsappYokIsaretle(ctx, kayitId, simdi);
      break;
    case 131050: {
      const engelTuru = alici.tur === "bsuid" ? "wa_kimlik" : "telefon";
      retIsle(ctx, {
        leadId: kayitId,
        adresler: [{ tur: engelTuru, ozet: adresOzeti(ctx.tenantId, engelTuru, alici.deger) }],
        kaynak: "whatsapp_ret",
        aciklama: "Kişi WhatsApp'ta bu işletmeden pazarlama iletilerini durdurmuş (Meta 131050)",
      });
      return new GelenKutusuHatasi("Kişi bu işletmeden pazarlama iletilerini durdurmuş; şablon gönderilemez.", 403);
    }
  }
  const medyaMetni = medyaGonderimHataMetni(e.kod);
  if (medyaMetni) return new GelenKutusuHatasi(medyaMetni, 400);
  if (e.http === 429 || e.kod === 130429 || e.kod === 131056) return new GelenKutusuHatasi("Meta hız sınırı: biraz sonra tekrar deneyin.", 429);
  return new GelenKutusuHatasi(`Meta gönderimi reddetti: ${e.message.slice(0, 200)}`, 502);
}

async function gonder(ctx: TenantContext, sohbet: SohbetKaydi, g: MesajGirdisi, simdi: Date): Promise<GonderimSonucu> {
  const hz = numaraHazirla(ctx, sohbet);
  const { kayit, wa, c } = hz;

  // Gönderim ve sonuç (her iki tür için ortak).
  type Hazir = {
    alici: Alici;
    gonderim: () => Promise<{ wamid: string }>;
    tur: "text" | "template";
    metin: string;
    olay: string;
    iade: (() => void) | null;
    yanitWamid: string | null;
  };
  let h: Hazir;

  if (g.tur === "metin") {
    const alici = serbestAlici(sohbet, hz, simdi);
    const yanitWamid = yanitWamidBul(ctx, sohbet, g.yanitlananId);
    h = {
      alici,
      gonderim: () => hz.istemci.metinGonder({ alici, metin: g.metin, yanitWamid }),
      tur: "text",
      metin: g.metin,
      olay: serbestOlay(hz),
      iade: null,
      yanitWamid,
    };
  } else {
    // Şablon: kampanya alıcı kurallarının tamamı. RET'li / engelli kişiye hiçbir koşulda gitmez.
    const karar = aliciDegerlendir({ ...kayit, whatsapp: wa }, "whatsapp_api", engelSorgusuOlustur(ctx, [kayit]), {
      simdi,
      testNumaralari: c.baglanti.testModu ? new Set(c.gizli.testNumaralari) : undefined,
      iysKontrolu: iletiAyarlariGetir(ctx).iysKontrolu,
    });
    if (!karar.uygun) throw new GelenKutusuHatasi(`Bu kişiye şablon gönderilemez: ${HARIC_NEDEN_ADLARI[karar.neden]}.`, 403);
    if (karar.adres === null) throw new GelenKutusuHatasi("Kişinin WhatsApp numarası yok.", 400);
    const sablon = sablonGetir(ctx, g.sablonId);
    if (!sablon || sablon.wabaId !== c.baglanti.wabaId) throw new GelenKutusuHatasi("Bu şablon bu numaranın WhatsApp hesabında yok.", 400);
    if (sablon.destekNedeni !== null) throw new GelenKutusuHatasi("Bu şablon şu an kullanılamaz.", 400);
    if (baslikBicimiBul(sablon.bilesenler) === GORSEL_BASLIK) {
      throw new GelenKutusuHatasi("Görselli şablon gelen kutusundan gönderilemez; kampanya olarak gönderin.", 400);
    }
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
        hz.istemci.mesajGonder({
          alici,
          sablonAdi: sablon.ad,
          dil: sablon.dil,
          bilesenler: sablonParametreleri(sablon.degiskenler, degerler, sablon.parametreBicimi === "NAMED"),
        }),
      tur: "template",
      metin: sablonMetni(sablon.bilesenler, degerler),
      olay: `WhatsApp şablonu gönderildi: ${sablon.ad} (${hz.numara} numarası)`,
      iade: () => sayacIade(ctx, "whatsapp_api", gun),
      yanitWamid: null,
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
        yanitWamid: h.yanitWamid,
      },
      simdi,
    );

  try {
    const yanit = await h.gonderim();
    const mesaj = yaz(yanit.wamid, "gonderildi");
    sistemOlayiEkle(ctx, kayit.id, "whatsapp_yanit", h.olay);
    return { mesaj: mesajDto(mesajSatiriGetir(ctx, mesaj.id)!), tekrar: false, uyari: null };
  } catch (hata) {
    // Gidip gitmediği bilinmiyor: tekrar denenmez, sayaçtan düşülmez; temsilci görsün diye mesaj yazılır.
    if (belirsizMi(hata)) {
      const mesaj = yaz(null, "belirsiz");
      sistemOlayiEkle(ctx, kayit.id, "whatsapp_yanit", `${h.olay} — sonuç belirsiz`);
      return { mesaj: mesajDto(mesajSatiriGetir(ctx, mesaj.id)!), tekrar: false, uyari: BELIRSIZ_UYARISI };
    }
    h.iade?.();
    throw metaHatasi(ctx, sohbet, kayit.id, h.alici, hata as GraphHatasi, simdi);
  }
}

const BELIRSIZ_UYARISI = "Meta'dan yanıt alınamadı: mesaj gitmiş de olabilir, gitmemiş de. Tekrar göndermeden önce müşteriyle teyit edin.";

// --- Medya gönderme ---

type Iletim =
  | { durum: "gonderildi"; wamid: string; metaMedyaId: string }
  | { durum: "belirsiz"; metaMedyaId: string }
  | { durum: "failed"; kod: number | null; metin: string; metaMedyaId: string | null };

/** Yükleme (/media) başarısız: ileti gitmedi (zaman aşımı dahil); tekrar denenebilir. */
function yuklemeHatasi(ctx: TenantContext, sohbet: SohbetKaydi, kayitId: string, alici: Alici, hata: unknown, simdi: Date): Iletim {
  const e = hata instanceof GraphHatasi ? hata : null;
  if (e && (hesapKilidiNedeni(e.kod) || numaraKayitsizKoduMu(e.kod))) {
    return { durum: "failed", kod: e.kod, metin: metaHatasi(ctx, sohbet, kayitId, alici, e, simdi).message, metaMedyaId: null };
  }
  const metin = !e || e.gecici
    ? "Dosya Meta'ya yüklenemedi (bağlantı ya da Meta'nın geçici hatası). Tekrar deneyin."
    : (medyaGonderimHataMetni(e.kod) ?? `Meta dosyayı kabul etmedi (yükleme reddedildi): ${e.message.slice(0, 160)}`);
  return { durum: "failed", kod: e?.kod ?? null, metin, metaMedyaId: null };
}

/** Dosyayı gönderen numarayla Meta'ya yükler (/media) ve iletiyi gönderir. Hata fırlatmaz: sonucu döner. */
async function medyaIlet(
  ctx: TenantContext,
  sohbet: SohbetKaydi,
  hz: NumaraHazir,
  alici: Alici,
  d: { tur: GidenMedyaTuru; mime: string; icerik: Uint8Array; dosyaAdi: string; aciklama: string | null; yanitWamid: string | null },
  simdi: Date,
): Promise<Iletim> {
  let metaMedyaId: string;
  try {
    metaMedyaId = await hz.istemci.medyaYukle({ icerik: d.icerik, mime: d.mime, dosyaAdi: d.dosyaAdi });
  } catch (hata) {
    return yuklemeHatasi(ctx, sohbet, hz.kayit.id, alici, hata, simdi);
  }
  try {
    const y = await hz.istemci.medyaGonder({
      alici,
      tur: d.tur,
      medyaId: metaMedyaId,
      aciklama: d.aciklama,
      dosyaAdi: d.tur === "document" ? d.dosyaAdi : null,
      yanitWamid: d.yanitWamid,
    });
    return { durum: "gonderildi", wamid: y.wamid, metaMedyaId };
  } catch (hata) {
    if (belirsizMi(hata)) return { durum: "belirsiz", metaMedyaId };
    const e = hata as GraphHatasi;
    return { durum: "failed", kod: e.kod, metin: metaHatasi(ctx, sohbet, hz.kayit.id, alici, e, simdi).message, metaMedyaId };
  }
}

const iletimAlanlari = (s: Iletim) => ({
  wamid: s.durum === "gonderildi" ? s.wamid : null,
  teslimDurumu: s.durum,
  teslimHataKodu: s.durum === "failed" ? s.kod : null,
  hataMetni: s.durum === "failed" ? s.metin : null,
});

function iletimOlayi(ctx: TenantContext, hz: NumaraHazir, tur: GidenMedyaTuru, s: Iletim) {
  const ad = MESAJ_TUR_ADLARI[tur];
  if (s.durum === "gonderildi") sistemOlayiEkle(ctx, hz.kayit.id, "whatsapp_yanit", `${serbestOlay(hz)} — ${ad}`);
  else if (s.durum === "belirsiz") sistemOlayiEkle(ctx, hz.kayit.id, "whatsapp_yanit", `${serbestOlay(hz)} — ${ad}, sonuç belirsiz`);
}

const iletimUyarisi = (s: Iletim) => (s.durum === "belirsiz" ? BELIRSIZ_UYARISI : s.durum === "failed" ? s.metin : null);

/**
 * Gelen kutusundan dosya (görsel, video, belge): metinle aynı kurallar (24 saat penceresi, RET'li kişiye yalnızca
 * pencere içinde hizmet yanıtı, test modu, kilit). Dosya içeriğinden doğrulanır (gidenMedyaDogrula), çalışma alanının
 * medya kotasına sayılır ve gelen medyanın klasörüne yazılır (aynı saklama süresi). Meta'ya yüklenip gönderilir.
 * Meta reddederse (yükleme ya da gönderim) mesaj "failed" ve nedeniyle yazılır; dosya durduğu için yeniden denenebilir
 * (medyaMesajiniTekrarDene). Sonucu belirsiz gönderim tekrar denenmez.
 */
export async function sohbetMedyasiGonder(
  ctx: TenantContext,
  sohbetId: string,
  g: MedyaGirdisi & { dosyaAdi: string; bayt: Uint8Array },
  simdi = new Date(),
): Promise<GonderimSonucu> {
  return istemciKimligiyle(ctx, sohbetId, g.istemciKimligi, async (sohbet) => {
    let d: ReturnType<typeof gidenMedyaDogrula>;
    try {
      d = gidenMedyaDogrula(g.dosyaAdi, g.bayt);
    } catch (h) {
      if (h instanceof GidenMedyaHatasi) throw new GelenKutusuHatasi(h.message, 400);
      throw h;
    }
    const hz = numaraHazirla(ctx, sohbet);
    const alici = serbestAlici(sohbet, hz, simdi);
    const yanitWamid = yanitWamidBul(ctx, sohbet, g.yanitlananId);
    if (medyaKotaKullanimi(ctx.tenantId) + g.bayt.byteLength > MEDYA_KOTA_BAYT) throw new GelenKutusuHatasi(MEDYA_KOTASI_DOLU, 409);

    const sha256 = createHash("sha256").update(g.bayt).digest("hex");
    const yol = yeniMedyaYolu(ctx.tenantId, simdi);
    const tam = medyaTamYolu(yol);
    fs.mkdirSync(path.dirname(tam), { recursive: true });
    fs.writeFileSync(tam, g.bayt, { mode: 0o600, flag: "wx" });

    const sonuc = await medyaIlet(ctx, sohbet, hz, alici, { ...d, icerik: g.bayt, aciklama: g.aciklama ?? null, yanitWamid }, simdi);
    let mesajId: string;
    try {
      mesajId = gidenMesajYaz(
        ctx,
        {
          baglantiId: sohbet.baglantiId,
          leadId: sohbet.leadId,
          kaynak: "temsilci",
          tur: d.tur,
          metin: g.aciklama ?? null,
          istemciKimligi: g.istemciKimligi,
          gonderenKullanici: ctx.userId || null,
          ilkDurum: "acik",
          yanitWamid,
          ...iletimAlanlari(sonuc),
          medya: { yol, mime: d.mime, boyut: g.bayt.byteLength, sha256, dosyaAdi: d.dosyaAdi, metaMedyaId: sonuc.metaMedyaId },
        },
        simdi,
      ).id;
    } catch (hata) {
      fs.rmSync(tam, { force: true });
      throw hata;
    }
    iletimOlayi(ctx, hz, d.tur, sonuc);
    return { mesaj: mesajDto(mesajSatiriGetir(ctx, mesajId)!), tekrar: false, uyari: iletimUyarisi(sonuc) };
  });
}

/**
 * Gönderilemeyen ("failed") medya mesajını aynı dosyayla yeniden dener: kurallar yeniden uygulanır, dosya diskten okunup
 * özeti doğrulanır, Meta'ya yeniden yüklenir; aynı mesaj satırı güncellenir. Yalnızca temsilcinin medya mesajı.
 */
export async function medyaMesajiniTekrarDene(ctx: TenantContext, sohbetId: string, mesajId: string, simdi = new Date()): Promise<GonderimSonucu> {
  const sohbet = sohbetGetir(ctx, sohbetId);
  const m = sohbet ? mesajSatiriGetir(ctx, mesajId) : null;
  if (!sohbet || !m || m.sohbetId !== sohbet.id) throw new GelenKutusuHatasi("Mesaj bulunamadı.", 404);
  return tekSeferde(`${ctx.tenantId}|tekrar|${m.id}`, async () => {
    const medya = m.medya;
    const tur = m.tur as GidenMedyaTuru;
    if (
      m.yon !== "giden" ||
      m.kaynak !== "temsilci" ||
      m.teslimDurumu !== "failed" ||
      !["image", "video", "document"].includes(m.tur) ||
      medya?.durum !== "indirildi" ||
      !medya.yol ||
      !medya.mime
    ) {
      throw new GelenKutusuHatasi("Bu mesaj yeniden denenemez.", 409);
    }
    const hz = numaraHazirla(ctx, sohbet);
    const alici = serbestAlici(sohbet, hz, simdi);
    let icerik: Uint8Array;
    try {
      icerik = fs.readFileSync(medyaTamYolu(medya.yol));
    } catch {
      throw new GelenKutusuHatasi("Dosya artık yok (saklama süresi dolmuş olabilir); yeniden ekleyip gönderin.", 409);
    }
    if (createHash("sha256").update(icerik).digest("hex") !== medya.sha256) {
      throw new GelenKutusuHatasi("Dosya değişmiş (özet uyuşmuyor); yeniden ekleyip gönderin.", 409);
    }
    const sonuc = await medyaIlet(
      ctx,
      sohbet,
      hz,
      alici,
      { tur, mime: medya.mime, icerik, dosyaAdi: medya.dosyaAdi ?? "dosya", aciklama: m.metin, yanitWamid: m.yanitWamid },
      simdi,
    );
    gidenMesajSonucuYaz(ctx, m.id, { ...iletimAlanlari(sonuc), metaMedyaId: sonuc.metaMedyaId });
    iletimOlayi(ctx, hz, tur, sonuc);
    return { mesaj: mesajDto(mesajSatiriGetir(ctx, m.id)!), tekrar: false, uyari: iletimUyarisi(sonuc) };
  });
}

/** Liste süzgeci sorgu parametrelerinden: numara, durum (acik | kapali), atanan (ben | yok), q, sayfa. */
export function sohbetFiltresiCoz(ctx: TenantContext, p: URLSearchParams): SohbetFiltresi {
  const durum = p.get("durum");
  const atanan = p.get("atanan");
  return {
    baglantiId: p.get("numara") || undefined,
    durum: durum === "acik" || durum === "kapali" ? durum : undefined,
    atanan: atanan === "ben" ? ctx.userId : atanan === "yok" ? "yok" : undefined,
    cipler: ciplerCoz(p.get("cip")),
    arama: p.get("q")?.slice(0, 100) || undefined,
    sayfa: Math.max(1, Number(p.get("sayfa") ?? 1) || 1),
  };
}
