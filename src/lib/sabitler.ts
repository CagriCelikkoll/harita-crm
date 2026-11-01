// İstemci ve sunucuda ortak kullanılan sabitler. Veritabanına bağımlılığı yoktur.

export const ROLLER = ["yonetici", "uye"] as const;
export const TARAMA_DURUMLARI = ["kuyrukta", "calisiyor", "tamamlandi", "hata"] as const;
export const KAYIT_DURUMLARI = ["yeni", "iletisimde", "gorusme", "kazanildi", "ilgilenmiyor"] as const;
export const ILETI_IZINLERI = ["bekliyor", "onayli", "ret"] as const;
/** Kayıtlar ekranının sekmeleri (anlamları repo/kayitlar.ts, KayitFiltresi.grup). */
export const KAYIT_GRUPLARI = ["ilgi", "incelenmemis", "tum"] as const;
export type KayitGrubu = (typeof KAYIT_GRUPLARI)[number];
export const KAYIT_GRUP_ADLARI: Record<KayitGrubu, string> = { ilgi: "İlgilendiklerim", incelenmemis: "İncelenmemiş", tum: "Tümü" };
export const OLAY_TURLERI = [
  "eklendi",
  "durum",
  "arama",
  "eposta",
  "sms",
  "whatsapp",
  "not",
  // Kayıt bilgisi değişikliği (ad, e-posta, telefon, etiket, kayıt notu…). Eski kayıtlarda bu olaylar "not" + sistem.
  "bilgi",
  "ret",
  "izin",
  "whatsapp_api",
  "whatsapp_gelen",
] as const;
/**
 * Kaydın nereden geldiği. Yalnızca 'google' kayıtlarında place_id vardır ve Places saklama kuralı geçerlidir;
 * diğerlerinde ad ve telefon kullanıcının (çalışma alanının) kendi verisidir.
 */
export const KAYIT_KAYNAKLARI = ["google", "ice_aktarma", "elle", "meta_reklam"] as const;
export const MERKEZ_KAYNAKLARI = ["harita", "adres"] as const;
/**
 * Tarama sonucunun incelenmesi: yeni Google kayıtları "incelenmedi" gelir; kullanıcı "İlgilen" / "İlgilenme" der.
 * "ilgilenmiyor" kayıtlar silinmez (sonraki taramada geri gelmesin), listede varsayılan olarak gizlenir ve hiçbir
 * kampanyaya / WhatsApp listesine girmez. Google dışı ve eski kayıtlar "ilgileniyor" sayılır.
 */
export const INCELEME_DURUMLARI = ["incelenmedi", "ilgileniyor", "ilgilenmiyor"] as const;

export type Rol = (typeof ROLLER)[number];
export type TaramaDurumu = (typeof TARAMA_DURUMLARI)[number];
export type KayitDurumu = (typeof KAYIT_DURUMLARI)[number];
export type IletiIzni = (typeof ILETI_IZINLERI)[number];
export type OlayTuru = (typeof OLAY_TURLERI)[number];
export type MerkezKaynagi = (typeof MERKEZ_KAYNAKLARI)[number];
export type KayitKaynagi = (typeof KAYIT_KAYNAKLARI)[number];
export type IncelemeDurumu = (typeof INCELEME_DURUMLARI)[number];

export const ROL_ADLARI: Record<Rol, string> = { yonetici: "Yönetici", uye: "Üye" };

export const TARAMA_DURUM_ADLARI: Record<TaramaDurumu, string> = {
  kuyrukta: "Kuyrukta",
  calisiyor: "Çalışıyor",
  tamamlandi: "Tamamlandı",
  hata: "Hata",
};

export const KAYIT_DURUM_ADLARI: Record<KayitDurumu, string> = {
  yeni: "Yeni",
  iletisimde: "İletişimde",
  gorusme: "Görüşme",
  kazanildi: "Kazanıldı",
  ilgilenmiyor: "İlgilenmiyor",
};

export const ILETI_IZNI_ADLARI: Record<IletiIzni, string> = {
  bekliyor: "Bekliyor",
  onayli: "Onaylı",
  ret: "Ret",
};

export const OLAY_TURU_ADLARI: Record<OlayTuru, string> = {
  eklendi: "Eklendi",
  durum: "Durum değişti",
  arama: "Arama",
  eposta: "E-posta",
  sms: "SMS",
  whatsapp: "WhatsApp",
  not: "Not",
  bilgi: "Bilgi güncellendi",
  ret: "İleti reddi",
  izin: "İzin değişti",
  whatsapp_api: "WhatsApp kampanyası",
  whatsapp_gelen: "Gelen WhatsApp mesajı",
};

export const KAYIT_KAYNAK_ADLARI: Record<KayitKaynagi, string> = {
  google: "Google tarama",
  ice_aktarma: "İçe aktarma",
  elle: "Elle eklendi",
  meta_reklam: "Meta reklamı",
};

export const INCELEME_ADLARI: Record<IncelemeDurumu, string> = {
  incelenmedi: "İncelenmedi",
  ilgileniyor: "İlgilenilen",
  ilgilenmiyor: "İlgilenilmiyor",
};

/** Google kaydında kullanıcının kendi işletme adı yoksa listelerde gösterilen ad (Places adı saklanmaz). */
export const GOOGLE_ADSIZ = "Google kaydı · ad girilmemiş";
/** Ad girme alanının ipucu. Places içeriği kullanıcının kaydına aktarılmaz; alan hep boş gelir. */
export const AD_GIRME_IPUCU = "İşletmeyle görüştüğünüzde adını buraya yazın";

export const SAYFA_BOYUTU = 20;
export const YARICAP_MIN_KM = 1;
export const YARICAP_MAX_KM = 25;
/** Google kuralı: Places'tan gelen enlem/boylam en fazla 30 gün saklanabilir. */
export const PLACES_KONUM_SAKLAMA_GUN = 30;
/** Bu süreden uzun "calisiyor" durumunda kalan tarama yarıda kalmış sayılır. */
export const YARIM_KALAN_TARAMA_DAKIKA = 10;
export const YARIM_KALDI_MESAJI = "Tarama yarıda kaldı, yeniden başlatın.";

/**
 * Yeni çalışma alanlarının aylık Places kotası, BİRİM cinsinden (PLACES_AYLIK_KOTA ile değiştirilebilir).
 * Birim ağırlıkları: src/lib/places-birimleri.ts.
 */
export const VARSAYILAN_AYLIK_PLACES_KOTASI = 6000;
/** Kullanım bu orana ulaşınca uyarı gösterilir. */
export const KOTA_UYARI_ORANI = 0.8;
/** Kota %80'e ulaşınca Google bilgilerinin otomatik gösterimi durur (Kayıtlar, detay, Ayarlar > Kullanım). */
export const OTOMATIK_GOSTERIM_SINIRI_METNI = "Bu ay otomatik gösterim sınırına ulaşıldı; bilgileri istediğinizde gösterilir.";
/** Kota dolunca (sayı yazmadan): Kayıtlar ve Ayarlar > Kullanım. */
export const KULLANIM_DOLDU_METNI =
  "Bu ayki kullanımınız doldu. İşletme bilgileri ve yeni taramalar ay sonuna kadar durduruldu; kendi verileriniz görünmeye devam eder.";
export const KOTA_DOLDU_MESAJI = "Bu ayki veri kotanız doldu.";
/** Kota ve günlük sınırlar arayüzden değiştirilmez; komutlar yalnızca README'de (arayüzde komut gösterilmez). */
export const SINIR_ARTIRMA_METNI = "Kotanızı veya sınırlarınızı artırmak için yöneticinizle/destekle iletişime geçin.";
