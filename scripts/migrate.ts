// drizzle-kit ile üretilen migration'ları (drizzle/ klasörü) uygular.
// Kullanım: npm run db:migrate
import { veritabaniAc } from "../src/server/db";
import { migrasyonlariUygula } from "../src/server/db/migrasyon";

const db = veritabaniAc();
migrasyonlariUygula(db);
console.log(`Migration'lar uygulandı: ${process.env.DATABASE_PATH ?? "./data/app.db"}`);
