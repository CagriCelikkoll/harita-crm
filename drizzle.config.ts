// UYARI: Migration'ları `npm run db:migrate` ile uygulayın; düz `drizzle-kit migrate` KULLANMAYIN.
// drizzle-kit migrate yabancı anahtarlar AÇIKKEN çalışır ve tablo yeniden oluşturan migration'larda (ör. 0007, leads)
// bağlı tablolardaki satırları SİLER (lead_events, message_queue, whatsapp_listesi; ON DELETE CASCADE). npm run
// db:migrate ise önce yedek alır, yabancı anahtar denetimini kapatıp bütünlüğü COMMIT'ten önce doğrular
// (src/server/db/migrasyon.ts). Bu yüzden aşağıdaki koruma `drizzle-kit migrate`'i reddeder; `generate` çalışır.
import { defineConfig } from "drizzle-kit";

if (process.argv.slice(2).includes("migrate")) {
  throw new Error(
    "drizzle-kit migrate bu projede devre dışı: bağlı satırları silebilir. Bunun yerine `npm run db:migrate` kullanın (README → Veritabanı ve migration'lar).",
  );
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "./data/app.db" },
  strict: true,
  verbose: true,
});
