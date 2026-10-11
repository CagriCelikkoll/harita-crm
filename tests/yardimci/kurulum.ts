// Her test dosyası kendi geçici SQLite veritabanıyla, migration'lar uygulanmış olarak başlar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const klasor = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-test-"));
process.env.DATABASE_PATH = path.join(klasor, "test.db");
process.env.PLACES_MOCK = "true";
process.env.PLACES_MOCK_GECIKME_MS = "0";
delete (globalThis as { __haritaCrmDb?: unknown }).__haritaCrmDb;

const { db } = await import("@/server/db");
const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });

afterAll(() => {
  db.$client.close();
  fs.rmSync(klasor, { recursive: true, force: true });
});
