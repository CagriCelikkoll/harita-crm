// Her test dosyası kendi geçici SQLite veritabanıyla, migration'lar uygulanmış olarak başlar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const klasor = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-test-"));
process.env.DATABASE_PATH = path.join(klasor, "test.db");
process.env.PLACES_MOCK = "true";
process.env.PLACES_MOCK_GECIKME_MS = "0";
// Mesajlaşma anahtarları: her test dosyası için rastgele.
const { randomBytes } = await import("node:crypto");
process.env.ILETI_SIFRELEME_ANAHTARI = randomBytes(32).toString("base64");
process.env.ILETI_IMZA_ANAHTARI = randomBytes(32).toString("base64");
process.env.BETTER_AUTH_URL = "https://crm.ornek.test";
delete (globalThis as { __haritaCrmDb?: unknown }).__haritaCrmDb;

const { db } = await import("@/server/db");
const { migrasyonlariUygula } = await import("@/server/db/migrasyon");
migrasyonlariUygula(db, path.resolve(__dirname, "../../drizzle"));

afterAll(() => {
  db.$client.close();
  fs.rmSync(klasor, { recursive: true, force: true });
});
