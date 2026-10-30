// Migration'ları güvenli şekilde uygular.
//
// SQLite'ta tablo yapısını değiştirmek (ör. NOT NULL kaldırmak) tabloyu yeniden oluşturmayı gerektirir
// (drizzle-kit: CREATE __new_x → INSERT … SELECT → DROP x → RENAME). Yabancı anahtarlar AÇIKKEN
// "DROP TABLE x" örtük bir DELETE yapar ve x'e bağlı tablolardaki ON DELETE SET NULL / CASCADE
// kuralları tetiklenir (ör. leads.scan_id NULL olur). drizzle-kit'in migration içindeki
// "PRAGMA foreign_keys=OFF" satırı transaction içinde ETKİSİZDİR. Bu yüzden denetim burada,
// transaction dışında kapatılır; bütünlük COMMIT öncesinde doğrulanır (ihlal → ROLLBACK), sonra yeniden açılır.
// Ayrıntı: https://www.sqlite.org/lang_altertable.html#otheralter
//
// UYARI: düz `drizzle-kit migrate` (ya da drizzle-orm `migrate`) yabancı anahtarlar AÇIKKEN çalışır ve tablo yeniden
// oluşturan migration'larda bağlı satırları SİLER (0007: lead_events, message_queue, whatsapp_listesi). Yalnızca
// `npm run db:migrate` kullanın (önce yedek alır, sonra bu fonksiyonu çağırır).
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { telefonNormallestir } from "../../lib/adres-normal";
import type { DB } from "./index";

/**
 * Veri adımı (0007): leads.telefon_e164, ek_telefon'un normalize hali. Normalleştirme SQL'de yazılamadığı için
 * migration'dan sonra burada doldurulur. Her çalıştırmada yalnızca boş olanlara bakar (idempotent).
 */
function telefonNormalleriniDoldur(db: DB) {
  const sqlite = db.$client;
  const sutunVar = (sqlite.prepare("pragma table_info(leads)").all() as { name: string }[]).some(
    (s) => s.name === "telefon_e164",
  );
  if (!sutunVar) return;
  const satirlar = sqlite
    .prepare("select id, ek_telefon from leads where ek_telefon is not null and telefon_e164 is null")
    .all() as { id: string; ek_telefon: string }[];
  const yaz = sqlite.prepare("update leads set telefon_e164 = ? where id = ?");
  sqlite.transaction(() => {
    for (const s of satirlar) {
      const normal = telefonNormallestir(s.ek_telefon);
      if (normal) yaz.run(normal, s.id);
    }
  })();
}

/**
 * Bekleyen migration'ları TEK transaction'da uygular; veri adımı ve `foreign_key_check` COMMIT'TEN ÖNCE çalışır:
 * ihlal varsa her şey geri alınır (veritabanı migration öncesindeki haliyle kalır). drizzle-orm'un migrator'ıyla aynı
 * dosyaları (readMigrationFiles) ve aynı `__drizzle_migrations` kayıtlarını kullanır; drizzle'ın kendi `migrate`'i
 * COMMIT'i kendisi yaptığı için denetimi araya sokmaya izin vermez.
 */
export function migrasyonlariUygula(db: DB, klasor = path.resolve(process.cwd(), "drizzle")) {
  const sqlite = db.$client;
  const migrasyonlar = readMigrationFiles({ migrationsFolder: klasor });
  sqlite.pragma("foreign_keys = OFF");
  try {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);
    const son = sqlite.prepare(`SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`).get() as
      | { created_at: number | string }
      | undefined;
    const kaydet = sqlite.prepare(`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)`);
    sqlite.exec("BEGIN");
    try {
      for (const m of migrasyonlar) {
        if (son && Number(son.created_at) >= m.folderMillis) continue;
        for (const ifade of m.sql) if (ifade.trim()) sqlite.exec(ifade);
        kaydet.run(m.hash, m.folderMillis);
      }
      telefonNormalleriniDoldur(db);
      const ihlaller = sqlite.pragma("foreign_key_check") as unknown[];
      if (ihlaller.length) {
        throw new Error(
          `Migration sonrası ${ihlaller.length} yabancı anahtar ihlali; değişiklikler geri alındı: ${JSON.stringify(ihlaller.slice(0, 5))}`,
        );
      }
      sqlite.exec("COMMIT");
    } catch (hata) {
      if (sqlite.inTransaction) sqlite.exec("ROLLBACK");
      throw hata;
    }
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}
