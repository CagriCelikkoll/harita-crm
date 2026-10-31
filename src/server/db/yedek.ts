// Migration öncesi veritabanı yedeği (npm run db:migrate her çalıştırmada önce bunu yapar).
//
// SQLite çevrimiçi yedekleme API'si (better-sqlite3 `backup`) kullanılır: WAL dosyasında olup henüz ana dosyaya
// yazılmamış (checkpoint edilmemiş) işlemler de yedeğe girer ve yedek tek, tutarlı bir dosyadır. Ana dosyayı ve
// -wal / -shm dosyalarını ayrı ayrı kopyalamak, kopyalama sırasında yazılırsa tutarsız yedek verebilir.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { yedekKlasoru } from "../yedek-saklama";

/** "20261030-143005123" (UTC): aynı saniyede iki çalıştırma bile ayrı dosyaya yazar. */
const damga = (t: Date) => t.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(".", "").replace("Z", "");

/**
 * Veritabanını, dosyanın bulunduğu klasördeki `yedek/` altına zaman damgalı olarak yedekler (varsayılan
 * ./data/app.db → ./data/yedek/app-<damga>.db). Dosya henüz yoksa (ilk kurulum) ya da bellek içiyse null.
 * Saklama süresi dolan yedekler eskiYedekleriSil (src/server/yedek-saklama.ts) ile silinir.
 */
export async function veritabaniYedekle(sqlite: Database.Database, dosyaYolu: string, simdi = new Date()): Promise<string | null> {
  if (dosyaYolu === ":memory:" || !fs.existsSync(dosyaYolu)) return null;
  const tam = path.resolve(dosyaYolu);
  const klasor = yedekKlasoru(tam);
  fs.mkdirSync(klasor, { recursive: true });
  const uzanti = path.extname(tam) || ".db";
  const hedef = path.join(klasor, `${path.basename(tam, path.extname(tam))}-${damga(simdi)}${uzanti}`);
  await sqlite.backup(hedef);
  // Yedek, kaynağın WAL kipini taşır; tek başına (yanında -wal/-shm olmadan, salt okunur da) açılabilsin diye
  // klasik günlük kipine alınır.
  const y = new Database(hedef);
  try {
    y.pragma("journal_mode = DELETE");
  } finally {
    y.close();
  }
  return hedef;
}
