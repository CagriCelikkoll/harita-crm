// Sağlık ucu (/api/saglik) için kiracıdan bağımsız tek sorgu: veritabanı cevap veriyor mu? Hiçbir veri okunmaz.
import { sql } from "drizzle-orm";
import { db } from "../../db";

export function veritabaniCevapVeriyor(): boolean {
  try {
    return db.get<{ bir: number }>(sql`select 1 as bir`)?.bir === 1;
  } catch {
    return false;
  }
}

/** Veritabanı dosyasının yolu (disk doluluğu için); bellek içiyse null. */
export function veritabaniYolu(): string | null {
  const ad = db.$client.name;
  return ad && ad !== ":memory:" ? ad : null;
}
