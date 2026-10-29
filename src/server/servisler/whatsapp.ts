// WhatsApp günlük liste (yarı otomatik). Uygulama yalnızca hazırlar: alıcı kuralları, sıra ve kişiselleştirilmiş
// mesaj. Gönderimi kullanıcı yapar: her sohbet, kullanıcının tıkladığı "WhatsApp'ta aç" ile açılır. WhatsApp Web
// otomasyonu, gayriresmî kütüphane ya da otomatik gönderim YOKTUR (bilinçli ürün sınırı).
//
// Numara çözümleme YALNIZCA "WhatsApp'ta aç" yönlendirmesinde yapılır (whatsappAc / kayitWhatsappAc):
// önce ek_telefon; yoksa Places'tan canlı (4 birim). Numara hiçbir yere yazılmaz (liste öğesinde yalnızca
// engel listesi özeti). Liste ekranını açmak ya da yenilemek Places çağrısı yapmaz.
// Kullanıcı başına günlük sayaç (İstanbul günü): "Gönderdim" (liste ya da kayıt detayı) sayılır.
import { z } from "zod";
import { ALICI_TURLERI, WHATSAPP_AZAMI_GUNLUK, waMeBaglantisi, type HaricNedeni } from "@/lib/mesajlasma";
import { KAYIT_DURUMLARI } from "@/lib/sabitler";
import { sablonDoldur, whatsappAltbilgisi } from "@/lib/sablon";
import { gunAnahtari } from "@/lib/zaman";
import type { TenantContext } from "../repo/baglam";
import { retIsle, type EngelAdresi } from "../repo/engel-listesi";
import { sayacAyir, sayacDegeri } from "../repo/gonderim-sayaci";
import { iletiAyarlariGetir, type IletiAyarlari } from "../repo/ileti-ayarlari";
import { kampanyaAdaylari } from "../repo/kampanyalar";
import { kayitGetir, type Kayit } from "../repo/kayitlar";
import { varsayilanGunlukSinir } from "../repo/sistem/sinir";
import {
  gunlukListe,
  gunlukListedekiKayitlar,
  listeyeEkle,
  ogeAdresOzetiYaz,
  ogeGetir,
  ogeSonuclandir,
  whatsappGonderimiKaydet,
} from "../repo/whatsapp-listesi";
import { adresOzeti } from "../messaging/adres";
import { aliciDegerlendir } from "../messaging/alici-kurallari";
import { engelSorgusuOlustur } from "./ileti";
import { placesTelefonuGetir } from "./telefon";

export class WhatsappHatasi extends Error {
  constructor(
    mesaj: string,
    readonly durumKodu = 400,
  ) {
    super(mesaj);
    this.name = "WhatsappHatasi";
  }
}

export const ListeFiltresi = z
  .object({
    durum: z.enum(KAYIT_DURUMLARI).optional(),
    etiket: z.string().trim().toLowerCase().max(40).optional(),
    aliciTuru: z.enum(ALICI_TURLERI).optional(),
  })
  .strict();

const SINIR_DOLDU = "Bugünkü WhatsApp sınırınıza ulaştınız; yarın (İstanbul saatiyle) sıfırlanır.";

export const whatsappSiniri = (a: IletiAyarlari) =>
  Math.min(WHATSAPP_AZAMI_GUNLUK, a.whatsappGunlukSinir ?? varsayilanGunlukSinir("whatsapp"));

/** wa.me mesajı: {isletme} yalnızca kullanıcının girdiği addan; sonuna gönderen ve ret notu. */
export function whatsappMesaji(a: IletiAyarlari, isletmeAdi: string | null) {
  return `${sablonDoldur(a.whatsappSablonu ?? "", isletmeAdi)}\n\n${whatsappAltbilgisi(a.gonderenUnvani)}`;
}

/** 905321234567 → "+90 532 123 45 67" (gösterim). */
const telefonGoster = (n: string) => `+90 ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8, 10)} ${n.slice(10)}`;

function gunlukSayac(ctx: TenantContext, ayar: IletiAyarlari, gun: string) {
  const sinir = whatsappSiniri(ayar);
  const gonderilen = sayacDegeri(ctx, "whatsapp", gun, ctx.userId);
  return { sinir, gonderilen, kalan: Math.max(0, sinir - gonderilen) };
}

/** Places'a gitmeden kurallar: ek_telefon varsa numarası da; yoksa "Places'tan açılışta alınacak". */
function kuralKontrolu(ctx: TenantContext, kayit: Kayit) {
  return aliciDegerlendir(kayit, "whatsapp", engelSorgusuOlustur(ctx, [kayit]));
}

export type SiradakiKayit = {
  ogeId: string;
  leadId: string;
  isletmeAdi: string | null;
  /** Yalnızca kayıtta ek_telefon varsa (kullanıcının kendi verisi); Places numarası ekranda gösterilmez. */
  telefon: string | null;
  mesaj: string;
  /** Sunucu yönlendirmesi: numarayı çözer ve wa.me'ye 302 ile gönderir. */
  baglanti: string;
};

export type ListeDurumu = {
  gun: string;
  sinir: number;
  gonderilen: number;
  kalan: number;
  sablonVar: boolean;
  ogeler: ReturnType<typeof gunlukListe>;
  siradaki: SiradakiKayit | null;
};

/**
 * Bugünkü liste ve sıradaki kayıt. Places çağrısı YAPMAZ: kurallara uymayan ya da ek_telefon'u cep olmayan
 * öğeler burada otomatik atlanır; telefonu kayıtta olmayanlar "WhatsApp'ta aç"ta çözülür.
 */
export function listeDurumu(ctx: TenantContext, simdi = new Date()): ListeDurumu {
  const ayar = iletiAyarlariGetir(ctx);
  const gun = gunAnahtari(simdi);
  const sayac = gunlukSayac(ctx, ayar, gun);
  const sablonVar = Boolean(ayar.whatsappSablonu?.trim());
  let siradaki: SiradakiKayit | null = null;
  if (sablonVar && sayac.kalan > 0) {
    for (const oge of gunlukListe(ctx, gun).filter((o) => o.durum === "bekliyor")) {
      const kayit = kayitGetir(ctx, oge.leadId);
      if (!kayit) continue;
      const karar = kuralKontrolu(ctx, kayit);
      if (!karar.uygun) {
        ogeSonuclandir(ctx, oge.id, "otomatik_atlandi", karar.neden);
        continue;
      }
      siradaki = {
        ogeId: oge.id,
        leadId: oge.leadId,
        isletmeAdi: kayit.isletmeAdi,
        telefon: karar.adres ? telefonGoster(karar.adres) : null,
        mesaj: whatsappMesaji(ayar, kayit.isletmeAdi),
        baglanti: `/api/whatsapp/ac/${oge.id}`,
      };
      break;
    }
  }
  return { gun, ...sayac, sablonVar, ogeler: gunlukListe(ctx, gun), siradaki };
}

/**
 * Bugünkü listeye, kullanıcının kalan sınırı kadar kayıt ekler (sırada bekleyenler de sayılır). Alıcı kuralları
 * uygulanır; bugün herhangi bir kullanıcının listesinde olan kayıtlar eklenmez.
 */
export function listeHazirla(ctx: TenantContext, filtre: z.infer<typeof ListeFiltresi>, simdi = new Date()) {
  const ayar = iletiAyarlariGetir(ctx);
  if (!ayar.whatsappSablonu?.trim()) throw new WhatsappHatasi("Önce Ayarlar'da WhatsApp mesaj şablonunu tanımlayın.");
  const gun = gunAnahtari(simdi);
  const { kalan } = gunlukSayac(ctx, ayar, gun);
  const bekleyen = gunlukListe(ctx, gun).filter((o) => o.durum === "bekliyor").length;
  const kapasite = Math.max(0, kalan - bekleyen);
  if (kapasite === 0) return { eklenen: 0, haricler: {} as Partial<Record<HaricNedeni, number>>, kapasite };

  const listede = gunlukListedekiKayitlar(ctx, gun);
  const adaylar = kampanyaAdaylari(ctx, filtre).filter((k) => !listede.has(k.id));
  const engelli = engelSorgusuOlustur(ctx, adaylar);
  const haricler: Partial<Record<HaricNedeni, number>> = {};
  const secilen: string[] = [];
  for (const k of adaylar) {
    if (secilen.length >= kapasite) break;
    const karar = aliciDegerlendir(k, "whatsapp", engelli);
    if (karar.uygun) secilen.push(k.id);
    else haricler[karar.neden] = (haricler[karar.neden] ?? 0) + 1;
  }
  return { eklenen: listeyeEkle(ctx, gun, secilen), haricler, kapasite };
}

/** Yönlendirme sonucu: wa.me'ye git ya da nedeni koduyla geri dön (WHATSAPP_DONUS_MESAJLARI). */
export type AcSonucu = { tur: "yonlendir"; url: string } | { tur: "geri"; kod: string; neden?: HaricNedeni };

/** Numara çözümü: ek_telefon ya da Places (kota düşer); saklanmaz. Uygunsa normal numara. */
async function numaraCoz(
  ctx: TenantContext,
  kayit: Kayit,
): Promise<{ tamam: true; numara: string } | { tamam: false; kod: string; neden?: HaricNedeni }> {
  let karar = kuralKontrolu(ctx, kayit);
  if (karar.uygun && karar.adres === null) {
    const tel = await placesTelefonuGetir(ctx, karar.placeId);
    if (tel.durum === "kota") return { tamam: false, kod: "kota" };
    if (tel.durum === "hata") return { tamam: false, kod: "hata" };
    karar = aliciDegerlendir(kayit, "whatsapp", engelSorgusuOlustur(ctx, [kayit]), {
      placesTelefonu: tel.durum === "tamam" ? tel.telefon : null,
    });
  }
  if (!karar.uygun) return { tamam: false, kod: "atlandi", neden: karar.neden };
  if (karar.adres === null) return { tamam: false, kod: "atlandi", neden: "iletisim_yok" };
  return { tamam: true, numara: karar.adres };
}

/**
 * Liste öğesi için "WhatsApp'ta aç": kullanıcının kendi bekleyen öğesi, şablon, günlük sınır, alıcı kuralları;
 * numara çözülür. Cep değilse ya da numara yoksa öğe "otomatik_atlandi" olur ve listeye geri dönülür.
 */
export async function whatsappAc(ctx: TenantContext, ogeId: string, simdi = new Date()): Promise<AcSonucu> {
  const oge = ogeGetir(ctx, ogeId);
  if (!oge || oge.durum !== "bekliyor") return { tur: "geri", kod: "bulunamadi" };
  const ayar = iletiAyarlariGetir(ctx);
  if (!ayar.whatsappSablonu?.trim()) return { tur: "geri", kod: "sablon_yok" };
  if (gunlukSayac(ctx, ayar, gunAnahtari(simdi)).kalan <= 0) return { tur: "geri", kod: "sinir_doldu" };
  const kayit = kayitGetir(ctx, oge.leadId);
  if (!kayit) return { tur: "geri", kod: "bulunamadi" };
  const cozum = await numaraCoz(ctx, kayit);
  if (!cozum.tamam) {
    if (cozum.kod === "atlandi") ogeSonuclandir(ctx, oge.id, "otomatik_atlandi", cozum.neden ?? null);
    return { tur: "geri", kod: cozum.kod, neden: cozum.neden };
  }
  ogeAdresOzetiYaz(ctx, oge.id, adresOzeti(ctx.tenantId, "telefon", cozum.numara));
  return { tur: "yonlendir", url: waMeBaglantisi(cozum.numara, whatsappMesaji(ayar, kayit.isletmeAdi)) };
}

export const SonucGirdisi = z.object({ sonuc: z.enum(["gonderdim", "atla", "ret"]) }).strict();

/** Liste öğesinin sonucu. "gonderdim" günlük sayacı atomik olarak artırır; sınır doluysa 429. */
export function sonucBildir(ctx: TenantContext, ogeId: string, g: z.infer<typeof SonucGirdisi>) {
  const oge = ogeGetir(ctx, ogeId);
  if (!oge) throw new WhatsappHatasi("Bulunamadı.", 404);
  if (oge.durum !== "bekliyor") throw new WhatsappHatasi("Bu kayıt için sonuç zaten bildirildi.", 409);
  if (g.sonuc === "atla") {
    ogeSonuclandir(ctx, oge.id, "atlandi");
    return;
  }
  if (g.sonuc === "ret") {
    // Kaydın kendi adresleri retIsle'de eklenir; Places'tan çözülen numara için açılışta yazılan özet kullanılır.
    const adresler: EngelAdresi[] = oge.adresOzeti ? [{ tur: "telefon", ozet: oge.adresOzeti }] : [];
    retIsle(ctx, { leadId: oge.leadId, adresler, kaynak: "whatsapp_ret", aciklama: "WhatsApp'ta ret istedi" });
    ogeSonuclandir(ctx, oge.id, "ret");
    return;
  }
  const ayar = iletiAyarlariGetir(ctx);
  if (!sayacAyir(ctx, "whatsapp", oge.gun, whatsappSiniri(ayar), ctx.userId)) throw new WhatsappHatasi(SINIR_DOLDU, 429);
  whatsappGonderimiKaydet(ctx, oge.leadId, oge.gun);
}

export type KayitWhatsapp = {
  durum: "hazir" | HaricNedeni | "sinir_doldu" | "sablon_yok";
  mesaj: string | null;
  /** Yalnızca ek_telefon varsa. */
  telefon: string | null;
  kalan: number;
  baglanti: string | null;
};

const NEDEN_METNI: Record<HaricNedeni | "sinir_doldu" | "sablon_yok", string> = {
  ret: "Kayıt ileti reddi verdi.",
  engel: "Numara engel listesinde.",
  iletisim_yok: "Telefon numarası yok.",
  bireysel_izinsiz: "Bireysel kayıt; ileti izni onaylı değil.",
  cep_degil: "Numara cep telefonu değil.",
  sinir_doldu: SINIR_DOLDU,
  sablon_yok: "Ayarlar'da WhatsApp mesaj şablonu tanımlı değil.",
};

/** Kayıt detayı için durum (Places çağrısı yapmaz): buton etkin mi, neden pasif. */
export function kayitWhatsapp(ctx: TenantContext, leadId: string, simdi = new Date()): KayitWhatsapp | null {
  const kayit = kayitGetir(ctx, leadId);
  if (!kayit) return null;
  const ayar = iletiAyarlariGetir(ctx);
  const { kalan } = gunlukSayac(ctx, ayar, gunAnahtari(simdi));
  const pasif = (durum: keyof typeof NEDEN_METNI): KayitWhatsapp => ({ durum, mesaj: NEDEN_METNI[durum], telefon: null, kalan, baglanti: null });
  if (!ayar.whatsappSablonu?.trim()) return pasif("sablon_yok");
  const karar = kuralKontrolu(ctx, kayit);
  if (!karar.uygun) return pasif(karar.neden);
  if (kalan <= 0) return pasif("sinir_doldu");
  return {
    durum: "hazir",
    mesaj: null,
    telefon: karar.adres ? telefonGoster(karar.adres) : null,
    kalan,
    baglanti: `/api/whatsapp/ac-kayit/${leadId}`,
  };
}

/** Kayıt detayından "WhatsApp'ta aç" (sunucu yönlendirmesi). */
export async function kayitWhatsappAc(ctx: TenantContext, leadId: string, simdi = new Date()): Promise<AcSonucu | null> {
  const durum = kayitWhatsapp(ctx, leadId, simdi);
  if (!durum) return null;
  if (durum.durum !== "hazir") {
    return durum.durum === "sinir_doldu" || durum.durum === "sablon_yok"
      ? { tur: "geri", kod: durum.durum }
      : { tur: "geri", kod: "kural", neden: durum.durum };
  }
  const kayit = kayitGetir(ctx, leadId)!;
  const cozum = await numaraCoz(ctx, kayit);
  if (!cozum.tamam) return { tur: "geri", kod: cozum.kod === "atlandi" ? "kural" : cozum.kod, neden: cozum.neden };
  return { tur: "yonlendir", url: waMeBaglantisi(cozum.numara, whatsappMesaji(iletiAyarlariGetir(ctx), kayit.isletmeAdi)) };
}

/** Kayıt detayından "Gönderdim": kurallar (Places'sız), günlük sayaç (atomik), olay ve durum. */
export function kayitWhatsappGonderildi(ctx: TenantContext, leadId: string, simdi = new Date()) {
  const durum = kayitWhatsapp(ctx, leadId, simdi);
  if (!durum) throw new WhatsappHatasi("Bulunamadı.", 404);
  if (durum.durum !== "hazir") throw new WhatsappHatasi(durum.mesaj ?? "Gönderilemez.", durum.durum === "sinir_doldu" ? 429 : 400);
  const gun = gunAnahtari(simdi);
  if (!sayacAyir(ctx, "whatsapp", gun, whatsappSiniri(iletiAyarlariGetir(ctx)), ctx.userId)) {
    throw new WhatsappHatasi(SINIR_DOLDU, 429);
  }
  whatsappGonderimiKaydet(ctx, leadId, gun);
}

/** Dönüş adresi (yalnızca uygulama içi yol). */
export function donusAdresi(taban: string, sonuc: Extract<AcSonucu, { tur: "geri" }>) {
  const q = new URLSearchParams({ wa: sonuc.kod, ...(sonuc.neden ? { neden: sonuc.neden } : {}) });
  return `${taban}${taban.includes("?") ? "&" : "?"}${q}`;
}
