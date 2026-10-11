// Mesajlaşma (kampanya, kuyruk, ret) sabitleri. İstemci ve sunucuda ortak; veritabanına bağımlılığı yoktur.

/** 'tacir_esnaf': işletme (Places'tan gelen kayıtların varsayılanı). 'bireysel': yalnızca açık onayla. */
export const ALICI_TURLERI = ["tacir_esnaf", "bireysel"] as const;
/** Kuyruktan gönderilen kanallar (WhatsApp kullanıcı tarafından elle gönderilir, kuyruğa girmez). */
export const KANALLAR = ["eposta", "sms"] as const;
export const KAMPANYA_DURUMLARI = ["zamanlandi", "calisiyor", "tamamlandi", "iptal"] as const;
export const MESAJ_DURUMLARI = ["kuyrukta", "gonderiliyor", "gonderildi", "basarisiz", "haric", "iptal"] as const;
/** Alıcı kurallarının hariç tutma nedenleri (aliciDegerlendir). */
export const HARIC_NEDENLERI = ["ret", "engel", "iletisim_yok", "bireysel_izinsiz", "cep_degil"] as const;
export const ENGEL_TURLERI = ["eposta", "telefon"] as const;
export const ENGEL_KAYNAKLARI = ["abonelik", "kayit_ret", "sms_ret", "iys_ret", "whatsapp_ret"] as const;

export type AliciTuru = (typeof ALICI_TURLERI)[number];
export type Kanal = (typeof KANALLAR)[number];
export type KampanyaDurumu = (typeof KAMPANYA_DURUMLARI)[number];
export type MesajDurumu = (typeof MESAJ_DURUMLARI)[number];
export type HaricNedeni = (typeof HARIC_NEDENLERI)[number];
export type EngelTuru = (typeof ENGEL_TURLERI)[number];
export type EngelKaynagi = (typeof ENGEL_KAYNAKLARI)[number];

export const ALICI_TURU_ADLARI: Record<AliciTuru, string> = {
  tacir_esnaf: "Tacir / esnaf",
  bireysel: "Bireysel",
};

export const KANAL_ADLARI: Record<Kanal, string> = { eposta: "E-posta", sms: "SMS" };

export const KAMPANYA_DURUM_ADLARI: Record<KampanyaDurumu, string> = {
  zamanlandi: "Zamanlandı",
  calisiyor: "Gönderiliyor",
  tamamlandi: "Tamamlandı",
  iptal: "İptal edildi",
};

export const MESAJ_DURUM_ADLARI: Record<MesajDurumu, string> = {
  kuyrukta: "Kuyrukta",
  gonderiliyor: "Gönderiliyor",
  gonderildi: "Gönderildi",
  basarisiz: "Başarısız",
  haric: "Hariç",
  iptal: "İptal",
};

export const HARIC_NEDEN_ADLARI: Record<HaricNedeni, string> = {
  ret: "İleti reddi",
  engel: "Engel listesinde",
  iletisim_yok: "İletişim bilgisi yok",
  bireysel_izinsiz: "Bireysel ve onay yok",
  cep_degil: "Cep telefonu değil",
};

/** Kuyrukta bekleyen mesajın bekleme nedeni (hariç değil; koşul sağlanınca gönderilir). */
export const BEKLEME_NEDEN_ADLARI: Record<string, string> = {
  gonderim_saati: "Gönderim saatini bekliyor",
  gunluk_sinir: "Günlük sınır doldu, ertesi güne kaldı",
  kota: "Places kotası bekleniyor",
  gecici_hata: "Geçici hata, yeniden denenecek",
};

/** Yer tutucu: kaydın kullanıcı tarafından girilen işletme adı. Places içeriği ASLA kullanılmaz. */
export const ISLETME_YER_TUTUCUSU = "{isletme}";

export const VARSAYILAN_GUNLUK_SINIR: Record<Kanal, number> = { eposta: 300, sms: 200 };
/** Varsayılan gönderim penceresi, İstanbul saatiyle gece yarısından itibaren dakika: 09:00–20:00. */
export const VARSAYILAN_GONDERIM_BASLANGIC_DK = 9 * 60;
export const VARSAYILAN_GONDERIM_BITIS_DK = 20 * 60;
/** Geçici hatada en fazla deneme sayısı ve denemeler arası bekleme (dakika). */
export const AZAMI_DENEME = 3;
export const YENIDEN_DENEME_DK = [1, 5, 15] as const;
/** Bu süreden uzun "gönderiliyor" kalan mesaj (işçi çöktü) "belirsiz" sayılır ve yeniden denenmez. */
export const BELIRSIZ_MESAJ_DAKIKA = 10;
/** Test gönderimi (e-posta/SMS) kiracı başına saatlik üst sınır. */
export const TEST_GONDERIM_SAATLIK_SINIR = 5;
/** Tek kampanyada en fazla alıcı. */
export const KAMPANYA_AZAMI_ALICI = 5000;
export const SMTP_IZINLI_PORTLAR = [25, 465, 587, 2525] as const;

export const ZORUNLU_ONAY_METNI =
  "Ticari elektronik ileti gönderimlerinde İYS kaydı ve 6563 sayılı Kanun kapsamındaki yükümlülüklerin sorumluluğu çalışma alanımıza aittir.";

export const dakikadanSaate = (dk: number) =>
  `${String(Math.floor(dk / 60)).padStart(2, "0")}:${String(dk % 60).padStart(2, "0")}`;
