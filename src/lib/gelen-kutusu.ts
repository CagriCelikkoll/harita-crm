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

/** Medya türleri; hepsi işçi tarafından indirilir (MEDYA_INDIRILEN_TURLER). */
export const MEDYA_TURLERI: readonly SohbetMesajTuru[] = ["image", "video", "document", "audio", "sticker"];

/** İşçinin indirdiği medya türleri ve her birinin en büyük boyutu (WhatsApp'ın kendi sınırları). */
export const MEDYA_AZAMI_BAYT = {
  image: 5 * 1024 * 1024,
  sticker: 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
} as const;
export type IndirilenMedyaTuru = keyof typeof MEDYA_AZAMI_BAYT;
export const MEDYA_INDIRILEN_TURLER = Object.keys(MEDYA_AZAMI_BAYT) as IndirilenMedyaTuru[];
export const medyaIndirilir = (t: SohbetMesajTuru): t is IndirilenMedyaTuru => (MEDYA_INDIRILEN_TURLER as string[]).includes(t);

/** Çalışma alanı başına indirilen medyanın toplam üst sınırı; dolunca yeni medya indirilmez. */
export const MEDYA_KOTA_BAYT = 5 * 1024 * 1024 * 1024;

/**
 * bekliyor: işçi indirecek (geçici hatada yeniden dener); indirildi; hata: indirilemedi (Meta'daki süre doldu, kalıcı
 * hata ya da deneme hakkı bitti); reddedildi: tür, boyut, adres ya da özet (sha256) kurala uymadı; silindi: saklama
 * süresi doldu.
 */
export const MEDYA_DURUMLARI = ["bekliyor", "indirildi", "hata", "reddedildi", "silindi"] as const;
export type MedyaDurumu = (typeof MEDYA_DURUMLARI)[number];

/** Gösterim biçimi: görseller satır içi, ses ve video oynatıcıyla (dosya olarak iner), belge indirme bağlantısıyla. */
export type MedyaGorunumu = "gorsel" | "ses" | "video" | "belge";

/**
 * MIME beyaz listesi (Content-Type bu listeden verilir, dosyanın içeriğinden değil). SVG, HTML ve betik içerebilecek
 * hiçbir tür yoktur. Görsel türleri belge olarak gönderilse de görsel olarak gösterilir.
 */
export const MEDYA_MIME_TURLERI: Record<string, { gorunum: MedyaGorunumu; uzanti: string }> = {
  "image/jpeg": { gorunum: "gorsel", uzanti: "jpg" },
  "image/png": { gorunum: "gorsel", uzanti: "png" },
  "image/webp": { gorunum: "gorsel", uzanti: "webp" },
  "audio/ogg": { gorunum: "ses", uzanti: "ogg" },
  "audio/mpeg": { gorunum: "ses", uzanti: "mp3" },
  "audio/mp4": { gorunum: "ses", uzanti: "m4a" },
  "audio/aac": { gorunum: "ses", uzanti: "aac" },
  "audio/amr": { gorunum: "ses", uzanti: "amr" },
  "video/mp4": { gorunum: "video", uzanti: "mp4" },
  "video/3gpp": { gorunum: "video", uzanti: "3gp" },
  "application/pdf": { gorunum: "belge", uzanti: "pdf" },
  "text/plain": { gorunum: "belge", uzanti: "txt" },
  "application/msword": { gorunum: "belge", uzanti: "doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { gorunum: "belge", uzanti: "docx" },
  "application/vnd.ms-excel": { gorunum: "belge", uzanti: "xls" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { gorunum: "belge", uzanti: "xlsx" },
  "application/vnd.ms-powerpoint": { gorunum: "belge", uzanti: "ppt" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { gorunum: "belge", uzanti: "pptx" },
};

/** "audio/ogg; codecs=opus" → "audio/ogg"; listede yoksa null. */
export function medyaMimeSadelestir(mime: string | null | undefined): string | null {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  return Object.hasOwn(MEDYA_MIME_TURLERI, m) ? m : null;
}

export type MedyaDto = {
  id: string;
  durum: MedyaDurumu;
  gorunum: MedyaGorunumu | null;
  dosyaAdi: string | null;
  boyut: number | null;
  /** Gösterilemiyorsa nedeni (kullanıcıya). */
  neden: string | null;
};

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
  /** Fotoğraf, video, belge, ses: indirme durumu. Medyasız iletide null. */
  medya: MedyaDto | null;
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
