// Uygulama şeması.
//
// GOOGLE PLACES SAKLAMA KURALI: Places içeriği (işletme adı, telefon, adres, web sitesi, puan vb.)
// hiçbir tabloya YAZILMAZ. Süresiz saklanabilen tek Places verisi place_id'dir.
// Places'tan gelen enlem/boylam yalnızca place_locations tablosunda en fazla 30 gün tutulur
// (npm run cleanup siler). tests/sema.test.ts bu kuralı denetler.
import { sql } from "drizzle-orm";
import { foreignKey, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";
import {
  ILETI_IZINLERI,
  KAYIT_DURUMLARI,
  MERKEZ_KAYNAKLARI,
  OLAY_TURLERI,
  ROLLER,
  TARAMA_DURUMLARI,
  VARSAYILAN_AYLIK_PLACES_KOTASI,
} from "../../lib/sabitler";
import {
  ALICI_TURLERI,
  ENGEL_KAYNAKLARI,
  ENGEL_TURLERI,
  KAMPANYA_DURUMLARI,
  KANALLAR,
  MESAJ_DURUMLARI,
  VARSAYILAN_GONDERIM_BASLANGIC_DK,
  VARSAYILAN_GONDERIM_BITIS_DK,
  WHATSAPP_DURUMLARI,
} from "../../lib/mesajlasma";

export * from "./auth-schema";

const simdi = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const zaman = (ad: string) => integer(ad, { mode: "timestamp_ms" });


export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  ad: text("ad").notNull(),
  slug: text("slug").notNull().unique(),
  // Kullanıcı verisinin (kayıtlar ve olaylar) saklama süresi; null = süresiz.
  veriSaklamaGun: integer("veri_saklama_gun"),
  // Aylık Places kotası, BİRİM cinsinden (maliyet koruması; src/lib/places-birimleri.ts). Yeni alanlar
  // PLACES_AYLIK_KOTA ortam değişkeninden (yoksa 6.000) başlar; değiştirmek için: npm run kota -- <slug> <birim>
  aylikPlacesKotasi: integer("aylik_places_kotasi").notNull().default(VARSAYILAN_AYLIK_PLACES_KOTASI),
  olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
});

export const memberships = sqliteTable(
  "memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    rol: text("rol", { enum: ROLLER }).notNull(),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tenantId] }), index("memberships_tenant_idx").on(t.tenantId)],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eposta: text("eposta").notNull(),
    rol: text("rol", { enum: ROLLER }).notNull(),
    token: text("token").notNull().unique(),
    davetEden: text("davet_eden")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sonGecerlilik: zaman("son_gecerlilik").notNull(),
    kabulTarihi: zaman("kabul_tarihi"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
  },
  (t) => [index("invitations_tenant_idx").on(t.tenantId)],
);

export const scans = sqliteTable(
  "scans",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    olusturan: text("olusturan").references(() => user.id, { onDelete: "set null" }),
    // Merkezin kaynağı (yalnızca bilgi amaçlı): 'harita' = haritaya tıklama / elle giriş, 'adres' = adres araması.
    // Kaynaktan BAĞIMSIZ olarak merkez_lat/lng 30 gün sonra null yapılır (scripts/cleanup.ts);
    // adres_metni ve yarıçap kalır, tarama "Tekrar kullan" ile yeniden çalıştırılabilir.
    merkezKaynagi: text("merkez_kaynagi", { enum: MERKEZ_KAYNAKLARI }).notNull().default("harita"),
    merkezLat: real("merkez_lat"),
    merkezLng: real("merkez_lng"),
    adresMetni: text("adres_metni"), // kullanıcının yazdığı adres (kullanıcı verisi)
    yaricapM: integer("yaricap_m").notNull(),
    kategori: text("kategori").notNull(),
    durum: text("durum", { enum: TARAMA_DURUMLARI }).notNull().default("kuyrukta"),
    bulunanSayisi: integer("bulunan_sayisi").notNull().default(0),
    istekSayisi: integer("istek_sayisi").notNull().default(0),
    // Bütçe bittiği için alanın tamamı taranamadıysa false.
    kapsamTamam: integer("kapsam_tamam", { mode: "boolean" }),
    hataMesaji: text("hata_mesaji"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
    // "calisiyor" durumuna geçiş anı; uzun süre bu durumda kalan taramalar yarıda kalmış sayılır.
    baslamaTarihi: zaman("baslama_tarihi"),
    tamamlanmaTarihi: zaman("tamamlanma_tarihi"),
  },
  (t) => [
    index("scans_tenant_idx").on(t.tenantId, t.olusturmaTarihi),
    index("scans_durum_idx").on(t.durum, t.baslamaTarihi),
  ],
);

export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    placeId: text("place_id").notNull(),
    scanId: text("scan_id").references(() => scans.id, { onDelete: "set null" }),
    durum: text("durum", { enum: KAYIT_DURUMLARI }).notNull().default("yeni"),
    // Aşağıdakiler kullanıcının kendi girdiği verilerdir.
    yetkiliAdi: text("yetkili_adi"),
    eposta: text("eposta"),
    ekTelefon: text("ek_telefon"),
    notlar: text("notlar"),
    etiketler: text("etiketler", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    iletiIzni: text("ileti_izni", { enum: ILETI_IZINLERI }).notNull().default("bekliyor"),
    // Kampanya mesajlarındaki {isletme}: kullanıcının girdiği ad (Places'tan gelen ad buraya YAZILMAZ).
    isletmeAdi: text("isletme_adi"),
    aliciTuru: text("alici_turu", { enum: ALICI_TURLERI }).notNull().default("tacir_esnaf"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
    guncellemeTarihi: zaman("guncelleme_tarihi").notNull().default(simdi),
  },
  (t) => [
    uniqueIndex("leads_tenant_place_uq").on(t.tenantId, t.placeId),
    // lead_events'teki bileşik yabancı anahtar için.
    uniqueIndex("leads_tenant_id_uq").on(t.tenantId, t.id),
    index("leads_tenant_guncelleme_idx").on(t.tenantId, t.guncellemeTarihi),
  ],
);

export const leadEvents = sqliteTable(
  "lead_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: text("lead_id").notNull(),
    tur: text("tur", { enum: OLAY_TURLERI }).notNull(),
    aciklama: text("aciklama"),
    kullaniciId: text("kullanici_id").references(() => user.id, { onDelete: "set null" }),
    // true: sistemin ürettiği olay (durum/bilgi değişikliği, tarama). Yalnızca false olan "not"lar düzenlenebilir.
    sistem: integer("sistem", { mode: "boolean" }).notNull().default(false),
    tarih: zaman("tarih").notNull().default(simdi),
  },
  (t) => [
    // Olay yalnızca AYNI kiracının kaydına bağlanabilir (veritabanı seviyesinde ek güvence).
    foreignKey({ columns: [t.tenantId, t.leadId], foreignColumns: [leads.tenantId, leads.id] }).onDelete("cascade"),
    index("lead_events_lead_idx").on(t.tenantId, t.leadId, t.tarih),
  ],
);

export const usageCounters = sqliteTable(
  "usage_counters",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ay: text("ay").notNull(), // "YYYY-MM" (Europe/Istanbul)
    // Tarihsel ad: değer, ayın kullanılan Places BİRİMİdir (src/lib/places-birimleri.ts).
    placesIstekSayisi: integer("places_istek_sayisi").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.ay] })],
);

// Places'tan gelen konum: en fazla 30 gün saklanır (scripts/cleanup.ts).
export const placeLocations = sqliteTable(
  "place_locations",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    placeId: text("place_id").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    alinmaTarihi: zaman("alinma_tarihi").notNull().default(simdi),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.placeId] }), index("place_locations_alinma_idx").on(t.alinmaTarihi)],
);

// ---------------------------------------------------------------------------------------------
// Mesajlaşma (2. aşama). Hepsi kullanıcı / çalışma alanı verisidir; Places içeriği içermez.

/** Çalışma alanı başına ticari ileti bilgileri ve gönderim kuralları (tek satır). */
export const iletiAyarlari = sqliteTable("ileti_ayarlari", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  gonderenUnvani: text("gonderen_unvani"),
  iletisimBilgisi: text("iletisim_bilgisi"),
  iysNo: text("iys_no"),
  // "Ticari elektronik ileti … sorumluluğu çalışma alanımıza aittir." onayı: kim, ne zaman.
  sorumlulukOnayTarihi: zaman("sorumluluk_onay_tarihi"),
  sorumlulukOnaylayan: text("sorumluluk_onaylayan").references(() => user.id, { onDelete: "set null" }),
  // İstanbul saatiyle gece yarısından itibaren dakika.
  gonderimBaslangicDk: integer("gonderim_baslangic_dk").notNull().default(VARSAYILAN_GONDERIM_BASLANGIC_DK),
  gonderimBitisDk: integer("gonderim_bitis_dk").notNull().default(VARSAYILAN_GONDERIM_BITIS_DK),
  // null = ortam değişkeni / varsayılan. Değiştirmek için: npm run sinir -- <slug> <kanal> <sayı>
  gunlukEpostaSiniri: integer("gunluk_eposta_siniri"),
  gunlukSmsSiniri: integer("gunluk_sms_siniri"),
  // SMS ret yolu: alıcıların "RET" yazıp gönderdiği (gelen SMS alabilen) numara. Her SMS'e eklenir.
  smsRetNumarasi: text("sms_ret_numarasi"),
  // Test SMS'leri YALNIZCA bu numaraya gider.
  yetkiliTelefonu: text("yetkili_telefonu"),
  // WhatsApp günlük liste: {isletme} yer tutuculu şablon ve kullanıcı başına günlük sınır (null = varsayılan 30, en fazla 50).
  whatsappSablonu: text("whatsapp_sablonu"),
  whatsappGunlukSinir: integer("whatsapp_gunluk_sinir"),
  guncellemeTarihi: zaman("guncelleme_tarihi").notNull().default(simdi),
});

/**
 * Sağlayıcı kimlik bilgileri (SMTP, SMS). sifreli_veri: AES-256-GCM, anahtar ILETI_SIFRELEME_ANAHTARI,
 * ek doğrulanmış veri = kiracı|kanal. Hiçbir API yanıtında döndürülmez.
 */
export const saglayiciAyarlari = sqliteTable(
  "saglayici_ayarlari",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kanal: text("kanal", { enum: KANALLAR }).notNull(),
    saglayici: text("saglayici").notNull(),
    sifreliVeri: text("sifreli_veri").notNull(),
    // SMS ret webhook'u: kiracıya özgü gizli anahtarın özeti (HMAC). Anahtarın kendisi saklanmaz.
    webhookOzeti: text("webhook_ozeti"),
    guncelleyen: text("guncelleyen").references(() => user.id, { onDelete: "set null" }),
    guncellemeTarihi: zaman("guncelleme_tarihi").notNull().default(simdi),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.kanal] }), uniqueIndex("saglayici_webhook_uq").on(t.webhookOzeti)],
);

/**
 * Engel listesi (suppression). Ret gelen her adres buraya yazılır; kayıt silinse ya da yeniden bulunsa da
 * gönderim yapılmaz. Adresin kendisi değil, anahtarlı özeti (HMAC-SHA256) tutulur: eşleşme için yeterlidir
 * ve Places'tan gelmiş bir telefon numarası bile düz metin olarak saklanmaz. Temizlikte SİLİNMEZ.
 */
export const engelListesi = sqliteTable(
  "engel_listesi",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    tur: text("tur", { enum: ENGEL_TURLERI }).notNull(),
    ozet: text("ozet").notNull(),
    kaynak: text("kaynak", { enum: ENGEL_KAYNAKLARI }).notNull(),
    // Bilgi amaçlı; kayıt silinince de satır kalır (yabancı anahtar yok).
    leadId: text("lead_id"),
    tarih: zaman("tarih").notNull().default(simdi),
  },
  (t) => [uniqueIndex("engel_listesi_uq").on(t.tenantId, t.tur, t.ozet)],
);

export type KampanyaFiltresi = {
  durum?: (typeof KAYIT_DURUMLARI)[number];
  etiket?: string;
  aliciTuru?: (typeof ALICI_TURLERI)[number];
};

export const kampanyalar = sqliteTable(
  "kampanyalar",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    olusturan: text("olusturan").references(() => user.id, { onDelete: "set null" }),
    kanal: text("kanal", { enum: KANALLAR }).notNull(),
    ad: text("ad").notNull(),
    konu: text("konu"), // yalnızca e-posta
    sablon: text("sablon").notNull(),
    // İşletme adı girilmemiş kayıtlarda {isletme} yerine; boşsa yer tutucu çevresiyle birlikte kaldırılır.
    bosIsimHitabi: text("bos_isim_hitabi"),
    filtre: text("filtre", { mode: "json" }).$type<KampanyaFiltresi>().notNull(),
    // true: sağlayıcı yok veya test modu; gerçek gönderim yapılmaz, mesaj kuyruk satırına kaydedilir.
    sandbox: integer("sandbox", { mode: "boolean" }).notNull(),
    durum: text("durum", { enum: KAMPANYA_DURUMLARI }).notNull(),
    planlananTarih: zaman("planlanan_tarih"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
    baslamaTarihi: zaman("baslama_tarihi"),
    tamamlanmaTarihi: zaman("tamamlanma_tarihi"),
  },
  (t) => [
    uniqueIndex("kampanyalar_tenant_id_uq").on(t.tenantId, t.id),
    index("kampanyalar_tenant_idx").on(t.tenantId, t.olusturmaTarihi),
    index("kampanyalar_durum_idx").on(t.durum, t.planlananTarih),
  ],
);

/**
 * Gönderim kuyruğu: kampanya × kayıt başına tek satır. Alıcı adresi burada TUTULMAZ; gönderim anında
 * kayıttan (ve gerekirse canlı Places'tan) okunur, alıcı kuralları o anda yeniden uygulanır.
 */
export const messageQueue = sqliteTable(
  "message_queue",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kampanyaId: text("kampanya_id").notNull(),
    leadId: text("lead_id").notNull(),
    kanal: text("kanal", { enum: KANALLAR }).notNull(),
    durum: text("durum", { enum: MESAJ_DURUMLARI }).notNull(),
    // Hariç / başarısız / bekleme nedeni (kod) ve sağlayıcı hata metni.
    neden: text("neden"),
    hata: text("hata"),
    denemeSayisi: integer("deneme_sayisi").notNull().default(0),
    sonrakiDeneme: zaman("sonraki_deneme"),
    kilitZamani: zaman("kilit_zamani"),
    // Günlük sınır sayacından ayrılan gün (iade için).
    sayacGunu: text("sayac_gunu"),
    saglayiciKimligi: text("saglayici_kimligi"),
    // Gönderildiği adresin engel listesi özeti (adresin kendisi değil): gelen RET yanıtını kayda bağlamak için.
    adresOzeti: text("adres_ozeti"),
    // Yalnızca sandbox: gönderilecek olan metin (gerçek gönderim yerine kaydedilir).
    sandboxIcerik: text("sandbox_icerik"),
    gonderimTarihi: zaman("gonderim_tarihi"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.kampanyaId], foreignColumns: [kampanyalar.tenantId, kampanyalar.id] }).onDelete(
      "cascade",
    ),
    foreignKey({ columns: [t.tenantId, t.leadId], foreignColumns: [leads.tenantId, leads.id] }).onDelete("cascade"),
    uniqueIndex("message_queue_kampanya_lead_uq").on(t.kampanyaId, t.leadId),
    index("message_queue_bekleyen_idx").on(t.durum, t.sonrakiDeneme),
    index("message_queue_kampanya_idx").on(t.tenantId, t.kampanyaId, t.durum),
    index("message_queue_adres_idx").on(t.tenantId, t.adresOzeti),
  ],
);

/**
 * Sayaçlar: kanal bazında günlük gönderim sınırı (İstanbul günü) ve test gönderimi hız sınırı (saat).
 * kullanici_id '' = çalışma alanı geneli.
 */
export const gonderimSayaclari = sqliteTable(
  "gonderim_sayaclari",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kanal: text("kanal").notNull(),
    kullaniciId: text("kullanici_id").notNull().default(""),
    donem: text("donem").notNull(), // "YYYY-MM-DD" ya da test sınırı için "YYYY-MM-DDTHH"
    adet: integer("adet").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.kanal, t.kullaniciId, t.donem] })],
);

/**
 * WhatsApp günlük liste: kullanıcının bugünkü (İstanbul günü) sırası. Gönderimi kullanıcı yapar (wa.me bağlantısı);
 * uygulama yalnızca sırayı hazırlar ve sonucu kaydeder. Telefon numarası burada TUTULMAZ (yalnızca özeti).
 * Benzersiz (kiracı, gün, kayıt): aynı kayıt aynı gün iki kullanıcının listesine girmez.
 */
export const whatsappListesi = sqliteTable(
  "whatsapp_listesi",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kullaniciId: text("kullanici_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gun: text("gun").notNull(), // "YYYY-MM-DD" (Europe/Istanbul)
    leadId: text("lead_id").notNull(),
    sira: integer("sira").notNull(),
    durum: text("durum", { enum: WHATSAPP_DURUMLARI }).notNull().default("bekliyor"),
    neden: text("neden"),
    // "WhatsApp'ta aç" sırasında çözülen numaranın engel listesi özeti (numaranın kendisi değil): "Ret istedi" için.
    adresOzeti: text("adres_ozeti"),
    guncellemeTarihi: zaman("guncelleme_tarihi").notNull().default(simdi),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.leadId], foreignColumns: [leads.tenantId, leads.id] }).onDelete("cascade"),
    uniqueIndex("whatsapp_listesi_uq").on(t.tenantId, t.gun, t.leadId),
    index("whatsapp_listesi_kullanici_idx").on(t.tenantId, t.kullaniciId, t.gun, t.sira),
  ],
);

export type Tarama = typeof scans.$inferSelect;
export type Kayit = typeof leads.$inferSelect;
export type KayitOlayi = typeof leadEvents.$inferSelect;
export type IletiAyarlari = typeof iletiAyarlari.$inferSelect;
export type Kampanya = typeof kampanyalar.$inferSelect;
export type KuyrukMesaji = typeof messageQueue.$inferSelect;
