// Şema kontrolü: Google Places saklama kuralı.
// - leads tablosunda Places içeriği (ad, adres, telefon, web sitesi, puan, konum…) tutan sütun yoktur.
// - Uygulama tablolarının TÜM sütunları bu beyaz listededir; yeni sütun eklemek bilinçli bir
//   inceleme gerektirir (Places içeriği mi, kullanıcı verisi mi?).
// - Places konumu yalnızca place_locations'ta, alınma tarihiyle (30 gün kuralı) tutulur.
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";

function sutunlar(tablo: string): string[] {
  return (db.$client.prepare(`pragma table_info(${tablo})`).all() as { name: string }[]).map((s) => s.name).sort();
}

const BEYAZ_LISTE: Record<string, string[]> = {
  tenants: ["id", "ad", "slug", "veri_saklama_gun", "aylik_places_kotasi", "olusturma_tarihi"], // ad = çalışma alanı adı
  memberships: ["user_id", "tenant_id", "rol", "olusturma_tarihi"],
  invitations: ["id", "tenant_id", "eposta", "rol", "token", "davet_eden", "son_gecerlilik", "kabul_tarihi", "olusturma_tarihi"],
  scans: [
    "id", "tenant_id", "olusturan",
    // merkez: 'harita' = kullanıcının seçtiği nokta (saklanır); 'adres' = Places sonucu (30 gün sonra null)
    "merkez_kaynagi", "merkez_lat", "merkez_lng", "adres_metni",
    "yaricap_m", "kategori", "durum", "bulunan_sayisi", "istek_sayisi", "kapsam_tamam", "hata_mesaji",
    "olusturma_tarihi", "baslama_tarihi", "tamamlanma_tarihi",
  ],
  leads: [
    "id", "tenant_id", "place_id", "scan_id", "durum",
    // kullanıcının girdiği veriler:
    "yetkili_adi", "eposta", "ek_telefon", "notlar", "etiketler", "ileti_izni",
    // isletme_adi: kullanıcının elle girdiği ad (kampanyalardaki {isletme}); Places'tan gelen ad YAZILMAZ.
    "isletme_adi", "alici_turu",
    "olusturma_tarihi", "guncelleme_tarihi",
  ],
  lead_events: ["id", "tenant_id", "lead_id", "tur", "aciklama", "kullanici_id", "sistem", "tarih"],
  usage_counters: ["tenant_id", "ay", "places_istek_sayisi"],
  place_locations: ["tenant_id", "place_id", "lat", "lng", "alinma_tarihi"],
  // Mesajlaşma: çalışma alanı / kullanıcı verisi. Alıcı adresi kuyrukta tutulmaz; engel listesinde yalnızca özet.
  ileti_ayarlari: [
    "tenant_id", "gonderen_unvani", "iletisim_bilgisi", "iys_no", "sorumluluk_onay_tarihi", "sorumluluk_onaylayan",
    "gonderim_baslangic_dk", "gonderim_bitis_dk", "gunluk_eposta_siniri", "gunluk_sms_siniri", "guncelleme_tarihi",
    "sms_ret_numarasi", "yetkili_telefonu", // çalışma alanının kendi numaraları
    "whatsapp_sablonu", "whatsapp_gunluk_sinir",
  ],
  saglayici_ayarlari: ["tenant_id", "kanal", "saglayici", "sifreli_veri", "webhook_ozeti", "guncelleyen", "guncelleme_tarihi"],
  engel_listesi: ["id", "tenant_id", "tur", "ozet", "kaynak", "lead_id", "tarih"],
  kampanyalar: [
    "id", "tenant_id", "olusturan", "kanal", "ad", "konu", "sablon", "bos_isim_hitabi", "filtre", "sandbox", "durum",
    "planlanan_tarih", "olusturma_tarihi", "baslama_tarihi", "tamamlanma_tarihi",
  ],
  message_queue: [
    "id", "tenant_id", "kampanya_id", "lead_id", "kanal", "durum", "neden", "hata", "deneme_sayisi", "sonraki_deneme",
    "kilit_zamani", "sayac_gunu", "saglayici_kimligi", "sandbox_icerik", "gonderim_tarihi", "olusturma_tarihi",
    "adres_ozeti", // gönderilen adresin özeti; adresin kendisi (Places telefonu dahil) saklanmaz
  ],
  // Telefon numarası yok; yalnızca "WhatsApp'ta aç"ta çözülen numaranın özeti.
  whatsapp_listesi: ["id", "tenant_id", "kullanici_id", "gun", "lead_id", "sira", "durum", "neden", "adres_ozeti", "guncelleme_tarihi"],
  gonderim_sayaclari: ["tenant_id", "kanal", "kullanici_id", "donem", "adet"],
};

// Places'tan gelebilecek içeriği çağrıştıran sütun adları.
const PLACES_ICERIK_DESENI =
  /(^|_)(display|name|isim|isletme|adres|address|formatted|phone|telefon|website|web|uri|url|puan|rating|review|yorum|lat|lng|latitude|longitude|location|konum|saat|hours|foto|photo)($|_)/;

describe("şema: Places saklama kuralı", () => {
  it("leads tablosunda Places içeriği tutan sütun yok", () => {
    const leads = sutunlar("leads");
    expect(leads).toEqual(BEYAZ_LISTE.leads.slice().sort());
    // Kullanıcının kendi girdiği ek_telefon ve isletme_adi dışında hiçbir sütun Places içeriği desenine uymamalı.
    const supheli = leads.filter((s) => PLACES_ICERIK_DESENI.test(s) && !["ek_telefon", "isletme_adi"].includes(s));
    expect(supheli).toEqual([]);
  });

  it("place_id dışında Places kimliği/içeriği yalnızca place_locations'ta ve tarihli tutulur", () => {
    expect(sutunlar("place_locations")).toContain("alinma_tarihi");
  });

  it("uygulama tablolarının tüm sütunları beyaz listede", () => {
    const tablolar = (
      db.$client
        .prepare(
          "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'",
        )
        .all() as { name: string }[]
    ).map((t) => t.name);
    const authTablolari = ["user", "session", "account", "verification"];
    const uygulamaTablolari = tablolar.filter((t) => !authTablolari.includes(t)).sort();
    expect(uygulamaTablolari).toEqual(Object.keys(BEYAZ_LISTE).sort());
    for (const tablo of uygulamaTablolari) {
      expect(sutunlar(tablo), tablo).toEqual(BEYAZ_LISTE[tablo].slice().sort());
    }
  });
});
