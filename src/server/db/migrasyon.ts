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

export function migrasyonlariUygula(db: DB, klasor = path.resolve(process.cwd(), "drizzle")) {
  const sqlite = db.$client;
  sqlite.pragma("foreign_keys = OFF");
  try {
    migrate(db, { migrationsFolder: klasor });
    telefonNormalleriniDoldur(db);
    const ihlaller = sqlite.pragma("foreign_key_check") as unknown[];
    if (ihlaller.length) {
      throw new Error(`Migration sonrası ${ihlaller.length} yabancı anahtar ihlali: ${JSON.stringify(ihlaller.slice(0, 5))}`);
    }
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}
