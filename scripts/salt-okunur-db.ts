// Komut satırı denetimleri (npm run kullanim, npm run hazirlik) için veritabanını SALT OKUNUR açar: dosya yoksa
// oluşturulmaz, hiçbir şey yazılamaz. (src/server/db'deki `db` içe aktarılınca dosya yoksa oluşturulur; o yüzden
// bu betikler onu kullanmaz.)
import Database from "better-sqlite3";

export const veritabaniYolu = () => process.env.DATABASE_PATH ?? "./data/app.db";

export function saltOkunurAc(dosya = veritabaniYolu()) {
  const sqlite = new Database(dosya, { readonly: true, fileMustExist: true });
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}
