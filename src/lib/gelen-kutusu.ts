// Gelen kutusu (WhatsApp sohbetleri): istemci ve sunucuda ortak sabitler ve tipler. Veritabanına bağımlılığı yoktur.

export const SOHBET_DURUMLARI = ["acik", "kapali"] as const;
export type SohbetDurumu = (typeof SOHBET_DURUMLARI)[number];

export const MESAJ_YONLERI = ["gelen", "giden"] as const;
export type MesajYonu = (typeof MESAJ_YONLERI)[number];

/**
 * Mesajın kaynağı. musteri: kişinin yazdığı; temsilci: gelen kutusundan elle; bot ve telefon (Coexistence yansıması),
 * gecmis (geçmiş içe aktarma) sonraki gruplar için ayrılmıştır; kampanya: işçinin gönderdiği şablon.
 */
export const MESAJ_KAYNAKLARI = ["musteri", "temsilci", "bot", "kampanya", "telefon", "gecmis"] as const;
export type MesajKaynagi = (typeof MESAJ_KAYNAKLARI)[number];

/** Meta'nın ileti türleri (tanınmayan "unsupported" yazılır). */
export const SOHBET_MESAJ_TURLERI = [
  "text",
  "image",
  "video",
  "document",
  "audio",
  "sticker",
  "location",
  "button",
  "interactive",
  "template",
  "reaction",
  "contacts",
  "unsupported",
] as const;
export type SohbetMesajTuru = (typeof SOHBET_MESAJ_TURLERI)[number];
export const sohbetMesajTuru = (t: string | undefined): SohbetMesajTuru =>
  (SOHBET_MESAJ_TURLERI as readonly string[]).includes(t ?? "") ? (t as SohbetMesajTuru) : "unsupported";

/** Medya türleri: B1'de içerik indirilmez ("telefondan bakın"); B2 grubu indirir. */
export const MEDYA_TURLERI: readonly SohbetMesajTuru[] = ["image", "video", "document", "audio", "sticker"];

export const MESAJ_TUR_ADLARI: Record<SohbetMesajTuru, string> = {
  text: "Metin",
  image: "Fotoğraf",
  video: "Video",
  document: "Belge",
  audio: "Ses kaydı",
  sticker: "Çıkartma",
  location: "Konum",
  button: "Buton yanıtı",
  interactive: "Seçim yanıtı",
  template: "Şablon",
  reaction: "Tepki",
  contacts: "Kişi kartı",
  unsupported: "Desteklenmeyen ileti",
};

/**
 * Teslim durumu. sent/delivered/read/failed Meta'nın bildirimleridir (yalnızca ileri gider); gonderildi: Meta kabul
 * etti, henüz bildirim yok; belirsiz: istek gitti ama sonucu bilinmiyor (tekrar denenmez).
 */
export const TESLIM_ADLARI: Record<string, string> = {
  gonderildi: "Gönderildi",
  sent: "Gönderildi",
  delivered: "İletildi",
  read: "Okundu",
  failed: "İletilemedi",
  belirsiz: "Gönderilemedi, durum belirsiz",
};

/** Müşteri hizmeti penceresi: kişinin son mesajından itibaren 24 saat (numara başına). */
export const PENCERE_SAAT = 24;
export const PENCERE_MS = PENCERE_SAAT * 3_600_000;

export function pencereBitisi(sonGelen: Date | null | undefined): Date | null {
  return sonGelen ? new Date(sonGelen.getTime() + PENCERE_MS) : null;
}
export function pencereAcik(sonGelen: Date | null | undefined, simdi = new Date()): boolean {
  return Boolean(sonGelen && simdi.getTime() < sonGelen.getTime() + PENCERE_MS);
}

/** Metin yanıtının en fazla uzunluğu (Meta: 4096). */
export const YANIT_AZAMI = 4096;
export const SOHBET_SAYFA_BOYUTU = 50;
export const MESAJ_SAYFA_BOYUTU = 100;
export const NOT_AZAMI = 2000;

export const VARSAYILAN_MESAJ_SAKLAMA_GUN = 365;
export const VARSAYILAN_MEDYA_SAKLAMA_GUN = 90;

export const RET_UYARISI = "RET verdi: yalnızca sorusuna yanıt verin, pazarlama içeriği göndermeyin";

// --- API yanıt tipleri (istemci bileşenleri kullanır) ---

export type SohbetOzetiDto = {
  id: string;
  baglantiId: string;
  numara: string;
  leadId: string;
  ad: string;
  telefon: string | null;
  durum: SohbetDurumu;
  atananKullanici: string | null;
  atananAd: string | null;
  sonMesaj: string | null;
  sonMesajTarihi: string | null;
  sonGelenTarihi: string | null;
  okunmamis: number;
  surum: number;
};

export type SohbetMesajiDto = {
  id: string;
  yon: MesajYonu;
  kaynak: MesajKaynagi;
  tur: SohbetMesajTuru;
  metin: string | null;
  /** Metin saklama süresi dolduğu için boşaltıldı. */
  icerikSilindi: boolean;
  medya: boolean;
  gonderen: string | null;
  kampanyaId: string | null;
  teslimDurumu: string | null;
  teslimHataKodu: number | null;
  tarih: string;
  surum: number;
};

export type SohbetNotuDto = { id: string; kullanici: string | null; metin: string; tarih: string };

export type SohbetAyrintiDto = SohbetOzetiDto & {
  /** Kişinin izin durumu: var | yok | ret (WhatsApp) ya da kaydın ileti reddi. */
  izin: "var" | "yok" | "ret";
  /** İzin 'var' ise kaynağının adı (ör. "WhatsApp sohbeti"). */
  izinKaynagi: string | null;
  bireysel: boolean;
  /** Bireysel alıcıda izin İYS'ye kaydedildi beyanı. */
  iysBeyani: boolean;
  /** Kayıt Click-to-WhatsApp reklamından açıldı ("Reklamdan yazdı"). */
  reklamdan: boolean;
  retVerdi: boolean;
  pencereBitis: string | null;
  testModu: boolean;
  numaraKilitli: string | null;
};

/** Mesajın kısa hali (liste satırı). */
export function mesajOzeti(m: { tur: SohbetMesajTuru; metin: string | null; icerikSilindi?: boolean }): string {
  if (m.icerikSilindi) return "(içerik saklama süresi doldu)";
  if (m.metin) return m.metin.length > 120 ? `${m.metin.slice(0, 117)}…` : m.metin;
  return `[${MESAJ_TUR_ADLARI[m.tur]}]`;
}
