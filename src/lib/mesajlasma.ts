// Mesajlaşma (kampanya, kuyruk, ret) sabitleri. İstemci ve sunucuda ortak; veritabanına bağımlılığı yoktur.

/** 'tacir_esnaf': işletme (Places'tan gelen kayıtların varsayılanı). 'bireysel': yalnızca açık onayla. */
export const ALICI_TURLERI = ["tacir_esnaf", "bireysel"] as const;
/** Sağlayıcı (MessageProvider) kanalları: e-posta ve SMS. Yarı otomatik WhatsApp listesi kuyruğa girmez. */
export const KANALLAR = ["eposta", "sms"] as const;
/** Kampanya ve kuyruk kanalları: sağlayıcı kanalları + WhatsApp Business Platform (Cloud API, onaylı şablon). */
export const KUYRUK_KANALLARI = [...KANALLAR, "whatsapp_api"] as const;
/** duraklatildi: sistem durdurdu (WhatsApp kalite düşük, şablon duraklatıldı, spam sınırı, yetki); yönetici devam ettirir. */
export const KAMPANYA_DURUMLARI = ["zamanlandi", "calisiyor", "duraklatildi", "tamamlandi", "iptal"] as const;
export const MESAJ_DURUMLARI = ["kuyrukta", "gonderiliyor", "gonderildi", "basarisiz", "haric", "iptal"] as const;
/** Alıcı kurallarının hariç tutma nedenleri (aliciDegerlendir). */
export const HARIC_NEDENLERI = [
  "ret",
  "engel",
  "iletisim_yok",
  "bireysel_izinsiz",
  "cep_degil",
  "ilgilenmiyor",
  // WhatsApp (Cloud API)
  "whatsapp_izni_yok",
  "iys_beyani_yok",
  "whatsapp_yok",
  "test_modu",
  "degisken_bos",
] as const;
/** wa_kimlik: WhatsApp işletmeye özel kullanıcı kimliği (BSUID); telefonu bilinmeyen WhatsApp kişisi için. */
export const ENGEL_TURLERI = ["eposta", "telefon", "wa_kimlik"] as const;
export const ENGEL_KAYNAKLARI = ["abonelik", "kayit_ret", "sms_ret", "iys_ret", "whatsapp_ret"] as const;

/** Kanal bazlı WhatsApp (Cloud API) izni. Genel ileti izninden (ileti_izni) ayrıdır; ikisinden biri 'ret' ise gönderilmez. */
export const WHATSAPP_IZINLERI = ["yok", "var", "ret"] as const;
export const WHATSAPP_IZIN_KAYNAKLARI = ["form", "sozlesme", "sozlu", "kendisi_yazdi", "reklam"] as const;

export type AliciTuru = (typeof ALICI_TURLERI)[number];
export type WhatsappIzni = (typeof WHATSAPP_IZINLERI)[number];
export type WhatsappIzinKaynagi = (typeof WHATSAPP_IZIN_KAYNAKLARI)[number];
export type Kanal = (typeof KANALLAR)[number];
export type KuyrukKanali = (typeof KUYRUK_KANALLARI)[number];
export type KampanyaDurumu = (typeof KAMPANYA_DURUMLARI)[number];
export type MesajDurumu = (typeof MESAJ_DURUMLARI)[number];
export type HaricNedeni = (typeof HARIC_NEDENLERI)[number];
export type EngelTuru = (typeof ENGEL_TURLERI)[number];
export type EngelKaynagi = (typeof ENGEL_KAYNAKLARI)[number];

export const ALICI_TURU_ADLARI: Record<AliciTuru, string> = {
  tacir_esnaf: "Tacir / esnaf",
  bireysel: "Bireysel",
};

/** Kişi eklerken / içe aktarırken alıcı türü seçimi (varsayılan yoktur; kullanıcı seçmek zorundadır). */
export const ALICI_TURU_SECIM_ADLARI: Record<AliciTuru, string> = {
  tacir_esnaf: "Tacir/esnaf (işletme)",
  bireysel: "Bireysel (kişi)",
};
export const ALICI_TURU_ACIKLAMASI =
  "Bireysel kişilere ticari ileti göndermek için kişinin onayı ve bu onayın İYS'ye kayıtlı olması ayrıca gerekir.";

/** Gönderim servisi (işçi) bu süreden uzun süredir çalışmıyorsa yöneticiye uyarı gösterilir. */
export const ISCI_UYARI_DAKIKA = 5;

/**
 * Kampanya detayında gönderim servisinin durumu. sonNabiz: işçinin en son çalıştığı an (isci_kilitleri.son_nabiz).
 * Dönüş: gösterilecek metin ve uyarı gerekip gerekmediği (5 dakikadan uzun süredir çalışmıyor ya da hiç çalışmadı).
 */
export function isciDurumu(sonNabiz: Date | null, simdi: Date): { metin: string; uyari: boolean } {
  if (!sonNabiz) return { metin: "Gönderim kuyrukta — gönderim servisi henüz hiç çalışmadı.", uyari: true };
  const dakika = Math.max(0, Math.floor((simdi.getTime() - sonNabiz.getTime()) / 60_000));
  const ne = dakika < 1 ? "az önce" : `en son ${dakika} dakika önce`;
  return { metin: `Gönderim kuyrukta — gönderim servisi ${ne} çalıştı.`, uyari: dakika >= ISCI_UYARI_DAKIKA };
}

/** Ret onay penceresinin metni; ret isteği onaysız gönderilemez (API'ler retOnayi: true ister). */
export const RET_ONAY_METNI = "Bu kişiye hiçbir kanaldan ileti gönderilmeyecek ve bu işlem geri alınamaz.";
export const RET_ONAYI_GEREKLI = "Ret geri alınamaz; onay penceresinde onaylanmalıdır.";

export const WHATSAPP_IZNI_ADLARI: Record<WhatsappIzni, string> = { yok: "İzin yok", var: "İzin var", ret: "Ret" };

export const WHATSAPP_IZIN_KAYNAK_ADLARI: Record<WhatsappIzinKaynagi, string> = {
  form: "Form",
  sozlesme: "Sözleşme",
  sozlu: "Sözlü",
  kendisi_yazdi: "WhatsApp'tan kendisi yazdı",
  reklam: "Reklam",
};

export const KANAL_ADLARI: Record<KuyrukKanali, string> = { eposta: "E-posta", sms: "SMS", whatsapp_api: "WhatsApp (API)" };

export const KAMPANYA_DURUM_ADLARI: Record<KampanyaDurumu, string> = {
  zamanlandi: "Zamanlandı",
  calisiyor: "Gönderiliyor",
  duraklatildi: "Duraklatıldı",
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
  ilgilenmiyor: "İlgilenilmiyor olarak işaretli",
  whatsapp_izni_yok: "WhatsApp izni yok",
  iys_beyani_yok: "Bireysel; İYS beyanı yok",
  whatsapp_yok: "Numarada WhatsApp yok",
  test_modu: "Test modu: test numarası değil",
  degisken_bos: "Şablon değişkeni boş",
};

/** Kuyrukta bekleyen mesajın bekleme nedeni (hariç değil; koşul sağlanınca gönderilir). */
export const BEKLEME_NEDEN_ADLARI: Record<string, string> = {
  gonderim_saati: "Gönderim saatini bekliyor",
  gunluk_sinir: "Günlük sınır doldu, ertesi güne kaldı",
  kota: "Places kotası bekleniyor",
  gecici_hata: "Geçici hata, yeniden denenecek",
  whatsapp_limit: "Meta mesajlaşma limiti (bu uygulamanın payı) doldu, ertesi güne kaldı",
};

/** WhatsApp kampanyasının duraklatılma nedenleri. */
export const DURAKLATMA_NEDEN_ADLARI: Record<string, string> = {
  kalite_dusuk: "Numaranın kalite puanı düşük (kırmızı). Kalite düzelince yönetici devam ettirebilir.",
  sablon_kullanilamaz: "Şablon artık kullanılamıyor (duraklatıldı, devre dışı ya da silindi).",
  spam_siniri: "Meta bu numaradan gönderimi kısıtladı (spam sınırı). Kaliteyi WhatsApp Manager'da kontrol edin.",
  yetki: "Meta erişimi reddetti; Ayarlar'da erişim anahtarını kontrol edin.",
  baglanti_yok: "WhatsApp Business bağlantısı tanımlı değil.",
};

/** Yer tutucu: kaydın kullanıcı tarafından girilen işletme adı. Places içeriği ASLA kullanılmaz. */
export const ISLETME_YER_TUTUCUSU = "{isletme}";

export const VARSAYILAN_GUNLUK_SINIR: Record<KuyrukKanali, number> = { eposta: 300, sms: 200, whatsapp_api: 1000 };
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

// --- WhatsApp günlük liste (yarı otomatik: hazırlık uygulamada, gönderim kullanıcıda) ---
export const WHATSAPP_DURUMLARI = ["bekliyor", "gonderildi", "atlandi", "ret", "otomatik_atlandi"] as const;
export type WhatsappDurumu = (typeof WHATSAPP_DURUMLARI)[number];
export const WHATSAPP_DURUM_ADLARI: Record<WhatsappDurumu, string> = {
  bekliyor: "Sırada",
  gonderildi: "Gönderildi",
  atlandi: "Atlandı",
  ret: "Ret istedi",
  otomatik_atlandi: "Otomatik atlandı",
};
/** Kullanıcı başına günlük WhatsApp sınırı: varsayılan 30, çalışma alanı en fazla 50'ye çıkarabilir. */
export const WHATSAPP_VARSAYILAN_GUNLUK = 30;
export const WHATSAPP_AZAMI_GUNLUK = 50;

/** wa.me bağlantısı: numara yalnızca rakam ve 90 ile başlar; metin encodeURIComponent ile. */
export function waMeBaglantisi(normalNumara: string, mesaj: string): string {
  if (!/^90\d{10}$/.test(normalNumara)) throw new Error("Numara 90 ile başlayan 12 haneli olmalı.");
  return `https://wa.me/${normalNumara}?text=${encodeURIComponent(mesaj)}`;
}

/** "WhatsApp'ta aç" yönlendirmesi başarısız olunca listeye / kayda dönüşte gösterilen mesajlar (?wa=<kod>). */
export const WHATSAPP_DONUS_MESAJLARI: Record<string, string> = {
  atlandi: "Kayıt otomatik atlandı",
  sinir_doldu: "Bugünkü WhatsApp sınırınıza ulaştınız; yarın (İstanbul saatiyle) sıfırlanır.",
  kota: "Bu ayki veri kotanız doldu; telefonu kayıtta olmayan işletmelerin numarası alınamıyor.",
  hata: "Numara alınamadı; biraz sonra tekrar deneyin.",
  sablon_yok: "Ayarlar'da WhatsApp mesaj şablonu tanımlı değil.",
  bulunamadi: "Bu liste kaydı bulunamadı ya da sonucu zaten bildirildi.",
  kural: "Bu kayda WhatsApp mesajı gönderilemez",
  capraz: "İstek başka bir siteden geldiği için reddedildi.",
};

/** Yönlendirme başarısız olunca (?wa=<kod>&neden=<neden>) gösterilen metin; bilinmeyen kodda null. */
export function whatsappDonusMetni(kod: string | undefined, neden: string | undefined): string | null {
  if (!kod || !Object.hasOwn(WHATSAPP_DONUS_MESAJLARI, kod)) return null;
  const n = neden && Object.hasOwn(HARIC_NEDEN_ADLARI, neden) ? HARIC_NEDEN_ADLARI[neden as HaricNedeni] : undefined;
  return n ? `${WHATSAPP_DONUS_MESAJLARI[kod]}: ${n}.` : WHATSAPP_DONUS_MESAJLARI[kod];
}
