// Veritabanı bağlantısı.
// Bu modülü YALNIZCA src/server/repo/, src/server/auth.ts ve scripts/ içe aktarabilir
// (eslint.config.mjs içindeki no-restricted-imports kuralı).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function veritabaniAc(dosyaYolu = process.env.DATABASE_PATH ?? "./data/app.db") {
  // Yol çalışma zamanında DATABASE_PATH'ten gelir; derleyicinin tüm projeyi izlemesini önle.
  if (dosyaYolu !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(/*turbopackIgnore: true*/ dosyaYolu)), { recursive: true });
  }
  const sqlite = new Database(dosyaYolu);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

export type DB = ReturnType<typeof veritabaniAc>;

// Geliştirme modunda modül yeniden yüklendiğinde aynı bağlantıyı kullan.
const kuresel = globalThis as unknown as { __haritaCrmDb?: DB };
export const db: DB = kuresel.__haritaCrmDb ?? (kuresel.__haritaCrmDb = veritabaniAc());
