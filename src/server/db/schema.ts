// Uygulama şeması.
//
// GOOGLE PLACES SAKLAMA KURALI: Places içeriği (işletme adı, telefon, adres, web sitesi, puan vb.)
// hiçbir tabloya YAZILMAZ. Süresiz saklanabilen tek Places verisi place_id'dir.
// Places'tan gelen enlem/boylam yalnızca place_locations tablosunda en fazla 30 gün tutulur
// (npm run cleanup siler). tests/sema.test.ts bu kuralı denetler.
import { sql } from "drizzle-orm";
import { foreignKey, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";
import { ILETI_IZINLERI, KAYIT_DURUMLARI, OLAY_TURLERI, ROLLER, TARAMA_DURUMLARI } from "../../lib/sabitler";

export * from "./auth-schema";

const simdi = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const zaman = (ad: string) => integer(ad, { mode: "timestamp_ms" });


export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  ad: text("ad").notNull(),
  slug: text("slug").notNull().unique(),
  // Kullanıcı verisinin (kayıtlar ve olaylar) saklama süresi; null = süresiz.
  veriSaklamaGun: integer("veri_saklama_gun"),
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
    // Kullanıcının haritada seçtiği nokta (Places içeriği değil).
    merkezLat: real("merkez_lat").notNull(),
    merkezLng: real("merkez_lng").notNull(),
    yaricapM: integer("yaricap_m").notNull(),
    kategori: text("kategori").notNull(),
    durum: text("durum", { enum: TARAMA_DURUMLARI }).notNull().default("kuyrukta"),
    bulunanSayisi: integer("bulunan_sayisi").notNull().default(0),
    istekSayisi: integer("istek_sayisi").notNull().default(0),
    // Bütçe bittiği için alanın tamamı taranamadıysa false.
    kapsamTamam: integer("kapsam_tamam", { mode: "boolean" }),
    hataMesaji: text("hata_mesaji"),
    olusturmaTarihi: zaman("olusturma_tarihi").notNull().default(simdi),
    tamamlanmaTarihi: zaman("tamamlanma_tarihi"),
  },
  (t) => [index("scans_tenant_idx").on(t.tenantId, t.olusturmaTarihi)],
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
    ay: text("ay").notNull(), // "YYYY-MM" (UTC)
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

export type Tarama = typeof scans.$inferSelect;
export type Kayit = typeof leads.$inferSelect;
export type KayitOlayi = typeof leadEvents.$inferSelect;
