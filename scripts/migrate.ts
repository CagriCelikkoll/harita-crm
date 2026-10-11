// drizzle-kit ile üretilen migration'ları (drizzle/ klasörü) uygular.
// Kullanım: npm run db:migrate
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { veritabaniAc } from "../src/server/db";

const db = veritabaniAc();
migrate(db, { migrationsFolder: "./drizzle" });
console.log(`Migration'lar uygulandı: ${process.env.DATABASE_PATH ?? "./data/app.db"}`);
