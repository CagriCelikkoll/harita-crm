// Migration'ları güvenli şekilde uygular.
//
// SQLite'ta tablo yapısını değiştirmek (ör. NOT NULL kaldırmak) tabloyu yeniden oluşturmayı gerektirir
// (drizzle-kit: CREATE __new_x → INSERT … SELECT → DROP x → RENAME). Yabancı anahtarlar AÇIKKEN
// "DROP TABLE x" örtük bir DELETE yapar ve x'e bağlı tablolardaki ON DELETE SET NULL / CASCADE
// kuralları tetiklenir (ör. leads.scan_id NULL olur). drizzle-kit'in migration içindeki
// "PRAGMA foreign_keys=OFF" satırı transaction içinde ETKİSİZDİR. Bu yüzden denetim burada,
// transaction dışında kapatılır; sonra bütünlük doğrulanıp yeniden açılır.
// Ayrıntı: https://www.sqlite.org/lang_altertable.html#otheralter
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { DB } from "./index";

export function migrasyonlariUygula(db: DB, klasor = path.resolve(process.cwd(), "drizzle")) {
  const sqlite = db.$client;
  sqlite.pragma("foreign_keys = OFF");
  try {
    migrate(db, { migrationsFolder: klasor });
    const ihlaller = sqlite.pragma("foreign_key_check") as unknown[];
    if (ihlaller.length) {
      throw new Error(`Migration sonrası ${ihlaller.length} yabancı anahtar ihlali: ${JSON.stringify(ihlaller.slice(0, 5))}`);
    }
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}
