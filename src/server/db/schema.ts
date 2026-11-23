// Uygulama şeması.
//
// GOOGLE PLACES SAKLAMA KURALI: Places içeriği (işletme adı, telefon, adres, web sitesi, puan vb.)
// hiçbir tabloya YAZILMAZ. Süresiz saklanabilen tek Places verisi place_id'dir.
// Places'tan gelen enlem/boylam yalnızca place_locations tablosunda en fazla 30 gün tutulur
// (npm run cleanup siler). tests/sema.test.ts bu kuralı denetler.
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";
import {
  ILETI_IZINLERI,
  INCELEME_DURUMLARI,
  KAYIT_DURUMLARI,
  KAYIT_KAYNAKLARI,
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
  KUYRUK_KANALLARI,
  MESAJ_DURUMLARI,
  VARSAYILAN_GONDERIM_BASLANGIC_DK,
  VARSAYILAN_GONDERIM_BITIS_DK,
  WHATSAPP_DURUMLARI,
  WHATSAPP_IZIN_KAYNAKLARI,
  WHATSAPP_IZINLERI,
} from "../../lib/mesajlasma";
import { ICE_AKTARMA_BICIMLERI, ICE_AKTARMA_DURUMLARI } from "../../lib/ice-aktarma";
import {
  MEDYA_DURUMLARI,
  MESAJ_KAYNAKLARI,
  MESAJ_YONLERI,
  SOHBET_DURUMLARI,
  SOHBET_MESAJ_TURLERI,
  VARSAYILAN_MEDYA_SAKLAMA_GUN,
  VARSAYILAN_MESAJ_SAKLAMA_GUN,
} from "../../lib/gelen-kutusu";
import type { DegiskenEslemi, MetaSablonBileseni, SablonDegiskeni } from "../../lib/whatsapp-api";

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
  // PLACES_AYLIK_KOTA ortam değişkeninden (yoksa 30.000 = 30 $) başlar; değiştirmek için: npm run kota -- <slug> <birim>
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
    // Merkez koordinatının İLK alındığı an: 30 gün bu andan sayılır. "Tekrar kullan" ile aynı merkez kopyalanınca
    // en eski taramanınki devralınır (süre sıfırlanmaz). Boşsa olusturma_tarihi.
    merkezTarihi: zaman("merkez_tarihi"),
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
    // 'google' dışındaki kaynaklarda place_id yoktur (leads_kaynak_place_ck).
    kaynak: text("kaynak", { enum: KAYIT_KAYNAKLARI }).notNull().default("google"),
    placeId: text("place_id"),
    scanId: text("scan_id").references(() => scans.id, { onDelete: "set null" }),
    durum: text("durum", { enum: KAYIT_DURUMLARI }).notNull().default("yeni"),
    // Aşağıdakiler kullanıcının kendi girdiği verilerdir.
    yetkiliAdi: text("yetkili_adi"),
    eposta: text("eposta"),
    ekTelefon: text("ek_telefon"),
    // ek_telefon'un normalize hali (905XXXXXXXXX); yalnızca repo yazar. Çakışma kontrolü ve WhatsApp eşleştirmesi için.
    telefonE164: text("telefon_e164"),
    notlar: text("notlar"),
    etiketler: text("etiketler", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    iletiIzni: text("ileti_izni", { enum: ILETI_IZINLERI }).notNull().default("bekliyor"),
    // Kampanya mesajlarındaki {isletme}: kullanıcının girdiği ad (Places'tan gelen ad buraya YAZILMAZ).
    isletmeAdi: text("isletme_adi"),
    aliciTuru: text("alici_turu", { enum: ALICI_TURLERI }).notNull().default("tacir_esnaf"),
    // Tarama sonucunun incelenmesi (sabitler.ts INCELEME_DURUMLARI): tarama "incelenmedi" ekler; mevcut ve Google dışı
    // kayıtlar "ilgileniyor". "ilgilenmiyor" kayıt silinmez, listede gizlenir ve kampanyalara girmez.
    inceleme: text("inceleme", { enum: INCELEME_DURUMLARI }).notNull().default("ilgileniyor"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
    guncellemeTarihi: zaman("guncelleme_tarihi").notNull().default(simdi),
  },
  (t) => [
    // NULL place_id'ler (Google dışı kayıtlar) birbiriyle çakışmaz.
    uniqueIndex("leads_tenant_place_uq").on(t.tenantId, t.placeId),
    // lead_events'teki bileşik yabancı anahtar için.
    uniqueIndex("leads_tenant_id_uq").on(t.tenantId, t.id),
    index("leads_tenant_guncelleme_idx").on(t.tenantId, t.guncellemeTarihi),
    index("leads_tenant_telefon_idx").on(t.tenantId, t.telefonE164),
    check("leads_kaynak_place_ck", sql`(${t.kaynak} = 'google') = (${t.placeId} is not null)`),
  ],
);

/**
 * Bir taramanın bulduğu kayıtlar (yalnızca kimlikler; Places içeriği yok). leads.scan_id yalnızca kaydı İLK bulan
 * taramayı tutar; aynı işletme sonraki bir taramada yeniden bulunursa o taramanın sonuçlarında da görünsün diye
 * eşleşme burada tutulur. Tarama ya da kayıt silinince satır da silinir.
 */
export const taramaSonuclari = sqliteTable(
  "tarama_sonuclari",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    scanId: text("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.scanId, t.leadId] }), index("tarama_sonuclari_tenant_scan_idx").on(t.tenantId, t.scanId)],
);

/**
 * Kaydın WhatsApp (Cloud API) bilgileri, leads ile 1:1. İzin kanıtı (tarih, kaynak, not, içe aktarma) burada tutulur.
 * bsuid: Meta'nın işletmeye özel kullanıcı kimliği; kişi eşleştirmesi önce bununla, yoksa telefon_e164 ile yapılır.
 * Gelen mesajların metni yalnızca gelen kutusunda (sohbet_mesajlari) ve saklama süresi boyunca tutulur.
 */
export const whatsappKisileri = sqliteTable(
  "whatsapp_kisileri",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: text("lead_id").notNull(),
    bsuid: text("bsuid"),
    // Yalnızca gösterim için (kullanıcı WhatsApp kullanıcı adı açmışsa).
    waKullaniciAdi: text("wa_kullanici_adi"),
    izin: text("izin", { enum: WHATSAPP_IZINLERI }).notNull().default("yok"),
    izinTarihi: zaman("izin_tarihi"),
    izinKaynagi: text("izin_kaynagi", { enum: WHATSAPP_IZIN_KAYNAKLARI }),
    izinNotu: text("izin_notu"),
    izinIceAktarmaId: text("izin_ice_aktarma_id"),
    // Bireysel alıcı: izinin İYS'ye kaydedildiğine dair çalışma alanının beyanı (tarih).
    iysBeyanTarihi: zaman("iys_beyan_tarihi"),
    // Meta "alıcıda WhatsApp yok / teslim edilemez" bildirdiğinde.
    whatsappYokTarihi: zaman("whatsapp_yok_tarihi"),
    // Click-to-WhatsApp reklamından gelen kişi.
    reklamKimligi: text("reklam_kimligi"),
    reklamBasligi: text("reklam_basligi"),
    ctwaClid: text("ctwa_clid"),
    pencereBitis: zaman("pencere_bitis"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
    guncellemeTarihi: zaman("guncelleme_tarihi").notNull().default(simdi),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.leadId] }),
    foreignKey({ columns: [t.tenantId, t.leadId], foreignColumns: [leads.tenantId, leads.id] }).onDelete("cascade"),
    uniqueIndex("whatsapp_kisileri_bsuid_uq").on(t.tenantId, t.bsuid).where(sql`${t.bsuid} is not null`),
  ],
);

/**
 * İçe aktarma oturumu ve izi. satirlar: ayrıştırılmış dosya satırları, GEÇİCİ (tamamlanınca ya da süresi dolunca
 * silinir). Beyan onayı (izinli içe aktarma) kanıt olarak kalıcı tutulur.
 */
export const iceAktarmalar = sqliteTable(
  "ice_aktarmalar",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kullaniciId: text("kullanici_id").references(() => user.id, { onDelete: "set null" }),
    dosyaAdi: text("dosya_adi").notNull(),
    // genel: kullanıcının kendi tablosu; google: Google Kişiler dışa aktarması (ön işlemden geçmiş satırlar).
    bicim: text("bicim", { enum: ICE_AKTARMA_BICIMLERI }).notNull().default("genel"),
    // Google biçiminde dosya içinde telefona göre birleşen satır sayısı.
    birlesen: integer("birlesen").notNull().default(0),
    durum: text("durum", { enum: ICE_AKTARMA_DURUMLARI }).notNull().default("hazirlaniyor"),
    satirlar: text("satirlar", { mode: "json" }).$type<string[][]>(),
    eslem: text("eslem", { mode: "json" }).$type<Record<string, number>>(),
    toplam: integer("toplam").notNull().default(0),
    eklenen: integer("eklenen").notNull().default(0),
    guncellenen: integer("guncellenen").notNull().default(0),
    hatali: integer("hatali").notNull().default(0),
    cakisan: integer("cakisan").notNull().default(0),
    engelli: integer("engelli").notNull().default(0),
    beyanOnayTarihi: zaman("beyan_onay_tarihi"),
    beyanSurumu: text("beyan_surumu"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
    tamamlanmaTarihi: zaman("tamamlanma_tarihi"),
  },
  (t) => [
    uniqueIndex("ice_aktarmalar_tenant_id_uq").on(t.tenantId, t.id),
    index("ice_aktarmalar_tenant_idx").on(t.tenantId, t.olusturmaTarihi),
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
    // Tarihsel ad: değer, ayın kullanılan BİRİMİdir (1 birim = 0,001 $; src/lib/places-birimleri.ts), harita dahil.
    placesIstekSayisi: integer("places_istek_sayisi").notNull().default(0),
    // Kalemlere göre döküm (Ayarlar > Kullanım); toplam her zaman places_istek_sayisi'dır ve kota onunla denetlenir.
    // İşletme bilgileri: liste / incelemede ad ve adres (Place Details Pro).
    isletmeBilgisiBirim: integer("isletme_bilgisi_birim").notNull().default(0),
    // Telefon ve web sitesi: kayıt detayı, arama, WhatsApp / SMS numarası (Place Details Enterprise).
    iletisimBilgisiBirim: integer("iletisim_bilgisi_birim").notNull().default(0),
    // Taramalar: sınır hücreleri ve adres araması (Text Search Pro).
    taramaBirim: integer("tarama_birim").notNull().default(0),
    // Harita: tarayıcıda her harita oluşturuluşu (Dynamic Maps). Yalnızca sayılır; kota dolsa da harita engellenmez.
    haritaBirim: integer("harita_birim").notNull().default(0),
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
  gunlukWhatsappApiSiniri: integer("gunluk_whatsapp_api_siniri"),
  // SMS ret yolu: alıcıların "RET" yazıp gönderdiği (gelen SMS alabilen) numara. Her SMS'e eklenir.
  smsRetNumarasi: text("sms_ret_numarasi"),
  // Test SMS'leri YALNIZCA bu numaraya gider.
  yetkiliTelefonu: text("yetkili_telefonu"),
  // WhatsApp günlük liste: {isletme} yer tutuculu şablon ve kullanıcı başına günlük sınır (null = varsayılan 30, en fazla 50).
  whatsappSablonu: text("whatsapp_sablonu"),
  whatsappGunlukSinir: integer("whatsapp_gunluk_sinir"),
  // Gelen kutusu (0020): yazışma metni ve medya saklama süresi (gün); sohbet açılınca okundu bildirimi.
  mesajSaklamaGun: integer("mesaj_saklama_gun").notNull().default(VARSAYILAN_MESAJ_SAKLAMA_GUN),
  medyaSaklamaGun: integer("medya_saklama_gun").notNull().default(VARSAYILAN_MEDYA_SAKLAMA_GUN),
  okunduBildirimi: integer("okundu_bildirimi", { mode: "boolean" }).notNull().default(true),
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
    kanal: text("kanal", { enum: KUYRUK_KANALLARI }).notNull(),
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
    // Yalnızca WhatsApp (Cloud API): onaylı şablon ve değişken eşlemesi; sistemin duraklatma nedeni.
    sablonId: text("sablon_id"),
    degiskenEslem: text("degisken_eslem", { mode: "json" }).$type<DegiskenEslemi>(),
    duraklatmaNedeni: text("duraklatma_nedeni"),
    // Yalnızca WhatsApp: gönderen numara (whatsapp_baglantilari.id). Yabancı anahtar yok: bağlantı silinse de kampanya
    // geçmişi kalır ("silinmiş numara"); çalışan kampanya bağlantı bulunamayınca duraklar. Kiracı denetimi serviste.
    baglantiId: text("baglanti_id"),
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
    kanal: text("kanal", { enum: KUYRUK_KANALLARI }).notNull(),
    durum: text("durum", { enum: MESAJ_DURUMLARI }).notNull(),
    // Hariç / başarısız / bekleme nedeni (kod) ve sağlayıcı hata metni.
    neden: text("neden"),
    hata: text("hata"),
    denemeSayisi: integer("deneme_sayisi").notNull().default(0),
    sonrakiDeneme: zaman("sonraki_deneme"),
    kilitZamani: zaman("kilit_zamani"),
    // Satırı "gonderiliyor"a alan işçi turunun kimliği: gönderimden hemen önce satırın hâlâ bu işçide olduğu doğrulanır.
    kilitSahibi: text("kilit_sahibi"),
    // Yalnızca WhatsApp: iletinin gönderildiği numara (phone_number_id). Durum bildirimi test modu kilidini yalnızca
    // bağlantının mevcut numarasından gönderilmiş iletide açar.
    gonderenNumara: text("gonderen_numara"),
    // Günlük sınır sayacından ayrılan gün (iade için).
    sayacGunu: text("sayac_gunu"),
    saglayiciKimligi: text("saglayici_kimligi"),
    // Gönderildiği adresin engel listesi özeti (adresin kendisi değil): gelen RET yanıtını kayda bağlamak için.
    adresOzeti: text("adres_ozeti"),
    // Yalnızca sandbox: gönderilecek olan metin (gerçek gönderim yerine kaydedilir).
    sandboxIcerik: text("sandbox_icerik"),
    gonderimTarihi: zaman("gonderim_tarihi"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
    // WhatsApp (Cloud API) teslim bildirimi (webhook statuses): sent | delivered | read | failed, hata kodu, ücret.
    teslimDurumu: text("teslim_durumu"),
    teslimHataKodu: integer("teslim_hata_kodu"),
    teslimGuncelleme: zaman("teslim_guncelleme"),
    ucretKategorisi: text("ucret_kategorisi"),
    ucretli: integer("ucretli", { mode: "boolean" }),
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
    // WhatsApp durum bildirimleri wamid ile eşleşir; kayan 24 saat sayımı.
    index("message_queue_saglayici_idx").on(t.tenantId, t.saglayiciKimligi),
    index("message_queue_kanal_gonderim_idx").on(t.tenantId, t.kanal, t.gonderimTarihi),
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

/**
 * WhatsApp Business Platform (Cloud API) bağlantısı, çalışma alanı başına bir. Kalıcı erişim anahtarı, App Secret,
 * verify token ve test numaraları sifreli_veri'de (AES-GCM, kiracı|whatsapp_api); API yanıtlarında asla dönmez.
 * webhook_kimligi: çalışma alanına özel webhook URL'sindeki rastgele kimlik. Test modu varsayılan AÇIK; ancak webhook
 * doğrulaması yapılmış ve imzası doğrulanmış bir durum bildirimi alınmışsa kapatılabilir. numara_dogrulama_tarihi:
 * phone_number_id'nin WABA'ya ait olduğu kiracının kendi anahtarıyla Graph API'den doğrulandı; boşsa bağlantı
 * kullanılmaz (gönderim, webhook, şablon senkronu).
 */
/**
 * WhatsApp Cloud API bağlantıları: çalışma alanı başına birden çok numara (0019). Her satırın kendi test modu, test
 * numaraları, uygulama payı, kalitesi, hesap kilidi ve webhook kimliği vardır. Şablonlar WABA'ya aittir
 * (whatsapp_sablonlari.waba_id): aynı WABA'daki numaralar aynı şablonları kullanır.
 */
export const whatsappBaglantilari = sqliteTable(
  "whatsapp_baglantilari",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Ekranlarda gösterilen ad ("Merkez", "Şube 2"); çalışma alanında benzersiz.
    ad: text("ad").notNull(),
    sira: integer("sira").notNull().default(0),
    webhookKimligi: text("webhook_kimligi").notNull(),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    sifreliVeri: text("sifreli_veri").notNull(),
    testModu: integer("test_modu", { mode: "boolean" }).notNull().default(true),
    uygulamaPayi: integer("uygulama_payi").notNull().default(10),
    webhookDogrulamaTarihi: zaman("webhook_dogrulama_tarihi"),
    sonImzaliDurumTarihi: zaman("son_imzali_durum_tarihi"),
    numaraDogrulamaTarihi: zaman("numara_dogrulama_tarihi"),
    // Son bağlantı testinden (Graph API) çalışma alanının kendi numarasının bilgileri.
    gorunenNumara: text("gorunen_numara"),
    dogrulanmisAd: text("dogrulanmis_ad"),
    kalite: text("kalite"),
    limitKatmani: text("limit_katmani"),
    // Numaranın Meta'daki durumu (status: CONNECTED, PENDING, OFFLINE…); null: henüz okunmadı (0025 öncesi satırlar da).
    metaDurumu: text("meta_durumu"),
    sonKontrol: zaman("son_kontrol"),
    sonHata: text("son_hata"),
    // Meta hesap düzeyi hata kodu (131031, 368, 131042; lib/whatsapp-api HESAP_KILIDI_KODLARI): doluyken hiçbir mesaj
    // gönderilmez. Yalnızca "Bağlantıyı test et" Meta'dan gönderime açık (health_status BLOCKED değil) okuyunca silinir.
    hesapKilidiKodu: integer("hesap_kilidi_kodu"),
    hesapKilidiTarihi: zaman("hesap_kilidi_tarihi"),
    sablonSenkronTarihi: zaman("sablon_senkron_tarihi"),
    guncelleyen: text("guncelleyen").references(() => user.id, { onDelete: "set null" }),
    guncellemeTarihi: zaman("guncelleme_tarihi").notNull().default(simdi),
  },
  (t) => [
    uniqueIndex("whatsapp_baglantilari_webhook_uq").on(t.webhookKimligi),
    // Aynı numara iki kez (iki çalışma alanına ya da aynı alanda iki satıra) bağlanamaz.
    uniqueIndex("whatsapp_baglantilari_numara_uq").on(t.phoneNumberId),
    uniqueIndex("whatsapp_baglantilari_tenant_id_uq").on(t.tenantId, t.id),
    uniqueIndex("whatsapp_baglantilari_ad_uq").on(t.tenantId, t.ad),
  ],
);

/** WABA'daki şablonlar (Meta'dan senkronize; uygulamada şablon oluşturulmaz). Meta'da silinen şablon "SILINDI". */
export const whatsappSablonlari = sqliteTable(
  "whatsapp_sablonlari",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Şablonun ait olduğu WhatsApp Business hesabı: aynı WABA'daki tüm numaralar kullanır (0019).
    wabaId: text("waba_id").notNull(),
    metaId: text("meta_id").notNull(),
    ad: text("ad").notNull(),
    dil: text("dil").notNull(),
    kategori: text("kategori").notNull(),
    durum: text("durum").notNull(),
    parametreBicimi: text("parametre_bicimi"),
    bilesenler: text("bilesenler", { mode: "json" }).$type<MetaSablonBileseni[]>().notNull(),
    degiskenler: text("degiskenler", { mode: "json" }).$type<SablonDegiskeni[]>().notNull(),
    abonelikButonu: integer("abonelik_butonu", { mode: "boolean" }).notNull(),
    // null: kampanyada kullanılabilir.
    destekNedeni: text("destek_nedeni"),
    kalite: text("kalite"),
    senkronTarihi: zaman("senkron_tarihi").notNull().default(simdi),
  },
  (t) => [
    uniqueIndex("whatsapp_sablonlari_uq").on(t.tenantId, t.wabaId, t.ad, t.dil),
    uniqueIndex("whatsapp_sablonlari_tenant_id_uq").on(t.tenantId, t.id),
  ],
);

/**
 * İşlenmiş gelen WhatsApp iletilerinin kimlikleri (wamid): Meta aynı webhook'u yeniden gönderebilir, ikinci kez
 * olay üretilmesin diye. İleti İÇERİĞİ yoktur; 7 gün sonra temizlikte silinir.
 */
export const whatsappGelenKimlikleri = sqliteTable(
  "whatsapp_gelen_kimlikleri",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    wamid: text("wamid").notNull(),
    tarih: zaman("tarih").notNull().default(simdi),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.wamid] }), index("whatsapp_gelen_tarih_idx").on(t.tarih)],
);

// ---------------------------------------------------------------------------------------------
// Gelen kutusu (0020). Müşteri yazışmaları burada saklanır: metin ileti_ayarlari.mesaj_saklama_gun (varsayılan 365)
// sonra boşaltılır, satır ve teslim bilgisi kalır. Kişi × numara başına bir sohbet. Herkes tüm sohbetleri görür;
// atama yalnızca sorumluluğu gösterir.

/** Kişi × numara başına sohbet. 24 saatlik pencere son_gelen_tarihi + 24 saattir. */
export const sohbetler = sqliteTable(
  "sohbetler",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // whatsapp_baglantilari.id; yabancı anahtar yok: numara kaldırılsa da yazışma geçmişi kalır ("Silinmiş numara").
    baglantiId: text("baglanti_id").notNull(),
    leadId: text("lead_id").notNull(),
    durum: text("durum", { enum: SOHBET_DURUMLARI }).notNull().default("acik"),
    atananKullanici: text("atanan_kullanici").references(() => user.id, { onDelete: "set null" }),
    sonMesajTarihi: zaman("son_mesaj_tarihi"),
    sonGelenTarihi: zaman("son_gelen_tarihi"),
    okunmamis: integer("okunmamis").notNull().default(0),
    // Bot (C grubu): bu ana kadar susar.
    botSusBitis: zaman("bot_sus_bitis"),
    // gelen_kutusu_surumu imleci: sohbet satırını değiştiren son işlem.
    surum: integer("surum").notNull().default(0),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.leadId], foreignColumns: [leads.tenantId, leads.id] }).onDelete("cascade"),
    uniqueIndex("sohbetler_tenant_id_uq").on(t.tenantId, t.id),
    uniqueIndex("sohbetler_kisi_numara_uq").on(t.tenantId, t.baglantiId, t.leadId),
    index("sohbetler_numara_son_idx").on(t.tenantId, t.baglantiId, t.sonMesajTarihi),
    index("sohbetler_son_idx").on(t.tenantId, t.sonMesajTarihi),
    index("sohbetler_surum_idx").on(t.tenantId, t.surum),
  ],
);

/**
 * Sohbetin mesajları. wamid (Meta ileti kimliği) çalışma alanında benzersiz: Meta aynı bildirimi tekrar gönderse de
 * mesaj bir kez yazılır. istemci_kimligi: gelen kutusundan gönderimde aynı mesajın iki kez gitmemesi için.
 * metin: yalnızca metin ve başlık (medya baytları burada değil); saklama süresi dolunca null, icerik_silindi = 1.
 */
export const sohbetMesajlari = sqliteTable(
  "sohbet_mesajlari",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sohbetId: text("sohbet_id").notNull(),
    yon: text("yon", { enum: MESAJ_YONLERI }).notNull(),
    kaynak: text("kaynak", { enum: MESAJ_KAYNAKLARI }).notNull(),
    wamid: text("wamid"),
    istemciKimligi: text("istemci_kimligi"),
    tur: text("tur", { enum: SOHBET_MESAJ_TURLERI }).notNull(),
    metin: text("metin"),
    medyaId: text("medya_id"),
    icerikSilindi: integer("icerik_silindi", { mode: "boolean" }).notNull().default(false),
    gonderenKullanici: text("gonderen_kullanici").references(() => user.id, { onDelete: "set null" }),
    kampanyaId: text("kampanya_id"),
    teslimDurumu: text("teslim_durumu"),
    teslimHataKodu: integer("teslim_hata_kodu"),
    // Meta'nın bildirdiği zaman (gelen iletide mesajın yazıldığı an); sıralama "tarih" ile yapılır.
    metaZamani: zaman("meta_zamani"),
    tarih: zaman("tarih").notNull(),
    surum: integer("surum").notNull().default(0),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.sohbetId], foreignColumns: [sohbetler.tenantId, sohbetler.id] }).onDelete("cascade"),
    uniqueIndex("sohbet_mesajlari_tenant_id_uq").on(t.tenantId, t.id),
    uniqueIndex("sohbet_mesajlari_wamid_uq").on(t.tenantId, t.wamid).where(sql`${t.wamid} is not null`),
    uniqueIndex("sohbet_mesajlari_istemci_uq").on(t.tenantId, t.istemciKimligi).where(sql`${t.istemciKimligi} is not null`),
    index("sohbet_mesajlari_sohbet_idx").on(t.tenantId, t.sohbetId, t.tarih),
    index("sohbet_mesajlari_surum_idx").on(t.tenantId, t.surum),
    index("sohbet_mesajlari_tarih_idx").on(t.tarih),
  ],
);

/**
 * Gelen kutusunun hazır cevapları (ekibin ortak yanıt metinleri). baslik_anahtari: Türkçe küçük harfe çevrilmiş başlık
 * (SQLite lower() Türkçe harfleri çevirmez); aynı çalışma alanında aynı başlık iki kez olamaz.
 */
export const hazirCevaplar = sqliteTable(
  "hazir_cevaplar",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    baslik: text("baslik").notNull(),
    baslikAnahtari: text("baslik_anahtari").notNull(),
    metin: text("metin").notNull(),
    olusturan: text("olusturan").references(() => user.id, { onDelete: "set null" }),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
    guncellemeTarihi: zaman("guncelleme_tarihi").notNull().default(simdi),
  },
  (t) => [uniqueIndex("hazir_cevaplar_baslik_uq").on(t.tenantId, t.baslikAnahtari)],
);
export type HazirCevap = typeof hazirCevaplar.$inferSelect;

/**
 * Gelen kutusu bildirimi (Web Push) abonelikleri: kullanıcının izin verdiği her tarayıcı/cihaz bir satır. endpoint
 * yalnızca izinli push sunucularından biri (src/lib/bildirim.ts); p256dh ve auth tarayıcının açık anahtarı ve sırrıdır
 * (gizli değil ama yalnızca bildirimi şifrelemek için). Kullanıcı çalışma alanından çıkarılınca satırlar silinir.
 * ardisik_hata: üst üste geçici hata sayısı (sınırı aşınca abonelik silinir).
 */
export const pushAbonelikleri = sqliteTable(
  "push_abonelikleri",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** Kısa cihaz açıklaması (ör. "iPhone · Safari"); yalnızca listede gösterim için. */
    cihaz: text("cihaz"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
    sonKayitTarihi: zaman("son_kayit_tarihi").notNull().default(simdi),
    sonBasariTarihi: zaman("son_basari_tarihi"),
    ardisikHata: integer("ardisik_hata").notNull().default(0),
  },
  (t) => [
    foreignKey({ columns: [t.userId, t.tenantId], foreignColumns: [memberships.userId, memberships.tenantId] }).onDelete("cascade"),
    uniqueIndex("push_abonelikleri_adres_uq").on(t.tenantId, t.endpoint),
    index("push_abonelikleri_kullanici_idx").on(t.tenantId, t.userId),
  ],
);
export type PushAboneligi = typeof pushAbonelikleri.$inferSelect;

/**
 * Gönderilecek bildirimler: webhook yeni gelen mesajda sohbet başına bir satır yazar (ağ isteği yapmaz); aynı sohbetten
 * art arda gelen mesajlar tek satırda birleşir. İşçi turu gönderir ve satırı siler. profil_adi: WhatsApp profil adı
 * (kayıtta ad yoksa bildirimde kullanılır). Mesaj içeriği burada tutulmaz.
 */
export const bildirimKuyrugu = sqliteTable(
  "bildirim_kuyrugu",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sohbetId: text("sohbet_id").notNull(),
    profilAdi: text("profil_adi"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.sohbetId] }),
    foreignKey({ columns: [t.tenantId, t.sohbetId], foreignColumns: [sohbetler.tenantId, sohbetler.id] }).onDelete("cascade"),
    index("bildirim_kuyrugu_tarih_idx").on(t.olusturmaTarihi),
  ],
);

/** İç notlar: yalnızca ekip görür, Meta'ya hiçbir koşulda gitmez. */
export const sohbetNotlari = sqliteTable(
  "sohbet_notlari",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sohbetId: text("sohbet_id").notNull(),
    kullaniciId: text("kullanici_id").references(() => user.id, { onDelete: "set null" }),
    metin: text("metin").notNull(),
    tarih: zaman("tarih").notNull().default(simdi),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.sohbetId], foreignColumns: [sohbetler.tenantId, sohbetler.id] }).onDelete("cascade"),
    index("sohbet_notlari_sohbet_idx").on(t.tenantId, t.sohbetId, t.tarih),
  ],
);

/**
 * Gelen medya (fotoğraf, belge, ses): webhook "bekliyor" satırı ekler (ağ isteği yapmaz), işçi Meta'dan indirir.
 * yol: medya klasörüne göre "<tenant>/<yyyy-mm>/<uuid>" (kullanıcı girdisinden üretilmez); mime beyaz listeden.
 * sha256: indirilen dosyanın özeti (hex); meta_sha256: Meta'nın bildirdiği özet. Saklama süresi dolunca dosya silinir,
 * satır "silindi" olur. Mesaj (ya da kayıt) silinince satır da silinir; artakalan dosyayı günlük bakım temizler.
 */
export const sohbetMedyalari = sqliteTable(
  "sohbet_medyalari",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    mesajId: text("mesaj_id").notNull(),
    metaMedyaId: text("meta_medya_id").notNull(),
    mime: text("mime"),
    boyut: integer("boyut"),
    sha256: text("sha256"),
    metaSha256: text("meta_sha256"),
    dosyaAdi: text("dosya_adi"),
    yol: text("yol"),
    durum: text("durum", { enum: MEDYA_DURUMLARI }).notNull().default("bekliyor"),
    neden: text("neden"),
    deneme: integer("deneme").notNull().default(0),
    sonrakiDeneme: zaman("sonraki_deneme"),
    indirmeTarihi: zaman("indirme_tarihi"),
    silinmeTarihi: zaman("silinme_tarihi"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.mesajId], foreignColumns: [sohbetMesajlari.tenantId, sohbetMesajlari.id] }).onDelete("cascade"),
    uniqueIndex("sohbet_medyalari_mesaj_uq").on(t.tenantId, t.mesajId),
    index("sohbet_medyalari_bekleyen_idx").on(t.durum, t.sonrakiDeneme),
    index("sohbet_medyalari_kota_idx").on(t.tenantId, t.durum),
    index("sohbet_medyalari_yol_idx").on(t.yol),
  ],
);

/**
 * Canlı yenileme imleci: sohbeti ya da mesajı değiştiren her işlem çalışma alanının sayacını artırır ve yeni değeri
 * satıra (surum) yazar. İstemci "bu sürümden sonrası" diye sorar (kısa yoklama).
 */
export const gelenKutusuSurumu = sqliteTable("gelen_kutusu_surumu", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  surum: integer("surum").notNull().default(0),
});

export type Tarama = typeof scans.$inferSelect;
export type Kayit = typeof leads.$inferSelect;
export type KayitOlayi = typeof leadEvents.$inferSelect;
export type IletiAyarlari = typeof iletiAyarlari.$inferSelect;
export type Kampanya = typeof kampanyalar.$inferSelect;
export type KuyrukMesaji = typeof messageQueue.$inferSelect;
export type WhatsappKisisi = typeof whatsappKisileri.$inferSelect;
export type IceAktarma = typeof iceAktarmalar.$inferSelect;
export type WhatsappBaglantisi = typeof whatsappBaglantilari.$inferSelect;
export type WhatsappSablonu = typeof whatsappSablonlari.$inferSelect;
export type Sohbet = typeof sohbetler.$inferSelect;
export type SohbetMesaji = typeof sohbetMesajlari.$inferSelect;
export type SohbetMedyasi = typeof sohbetMedyalari.$inferSelect;

/**
 * Gönderim işçisi kilidi: aynı anda yalnızca bir işçi turu çalışır (cron ile üst üste binen `--bir-kez` turları ya
 * da birden çok `npm run worker` süreci). Süresi dolan kiralama (bitis); tur boyunca nabızla uzatılır, çöken işçinin
 * kilidi süre dolunca başkasına geçer. Gerçek saat kullanılır (turun "simdi" değeri değil).
 * Satır tur bitince silinmez (bitis geçmişe çekilir): son_nabiz "gönderim servisi en son ne zaman çalıştı" bilgisidir.
 */
export const isciKilitleri = sqliteTable("isci_kilitleri", {
  ad: text("ad").primaryKey(),
  sahip: text("sahip").notNull(),
  bitis: zaman("bitis").notNull(),
  sonNabiz: zaman("son_nabiz"),
});
