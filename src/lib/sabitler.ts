// İstemci ve sunucuda ortak kullanılan sabitler. Veritabanına bağımlılığı yoktur.

export const ROLLER = ["yonetici", "uye"] as const;
export const TARAMA_DURUMLARI = ["kuyrukta", "calisiyor", "tamamlandi", "hata"] as const;
export const KAYIT_DURUMLARI = ["yeni", "iletisimde", "gorusme", "kazanildi", "ilgilenmiyor"] as const;
export const ILETI_IZINLERI = ["bekliyor", "onayli", "ret"] as const;
export const OLAY_TURLERI = ["eklendi", "durum", "arama", "eposta", "sms", "not", "ret"] as const;
export const MERKEZ_KAYNAKLARI = ["harita", "adres"] as const;

export type Rol = (typeof ROLLER)[number];
export type TaramaDurumu = (typeof TARAMA_DURUMLARI)[number];
export type KayitDurumu = (typeof KAYIT_DURUMLARI)[number];
export type IletiIzni = (typeof ILETI_IZINLERI)[number];
export type OlayTuru = (typeof OLAY_TURLERI)[number];
export type MerkezKaynagi = (typeof MERKEZ_KAYNAKLARI)[number];

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
  not: "Not",
  ret: "İleti reddi",
};

export const SAYFA_BOYUTU = 20;
export const YARICAP_MIN_KM = 1;
export const YARICAP_MAX_KM = 25;
/** Google kuralı: Places'tan gelen enlem/boylam en fazla 30 gün saklanabilir. */
export const PLACES_KONUM_SAKLAMA_GUN = 30;
/** Bu süreden uzun "calisiyor" durumunda kalan tarama yarıda kalmış sayılır. */
export const YARIM_KALAN_TARAMA_DAKIKA = 10;
export const YARIM_KALDI_MESAJI = "Tarama yarıda kaldı, yeniden başlatın.";

/** Yeni çalışma alanlarının aylık Places isteği kotası (PLACES_AYLIK_KOTA ile değiştirilebilir). */
export const VARSAYILAN_AYLIK_PLACES_KOTASI = 2000;
/** Kullanım bu orana ulaşınca uyarı gösterilir. */
export const KOTA_UYARI_ORANI = 0.8;
export const KOTA_DOLDU_MESAJI = "Bu ayki veri kotanız doldu.";
