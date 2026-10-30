// drizzle-kit ile üretilen migration'ları (drizzle/ klasörü) uygular. Her çalıştırmada ÖNCE veritabanının zaman
// damgalı yedeği alınır (data/yedek/; WAL'daki işlemler dahil); yedek alınamazsa migration uygulanmaz.
// Kullanım: npm run db:migrate   (düz `drizzle-kit migrate` KULLANMAYIN: bağlı satırları siler, README)
import fs from "node:fs";
import "./ortam";
import { veritabaniAc } from "../src/server/db";
import { migrasyonlariUygula } from "../src/server/db/migrasyon";
import { veritabaniYedekle } from "../src/server/db/yedek";

async function calistir() {
  const dosya = process.env.DATABASE_PATH ?? "./data/app.db";
  const vardi = dosya !== ":memory:" && fs.existsSync(dosya); // açmak dosyayı oluşturur: önce bakılır
  const db = veritabaniAc(dosya);
  const yedek = vardi ? await veritabaniYedekle(db.$client, dosya) : null;
  console.log(yedek ? `Yedek alındı: ${yedek}` : "Veritabanı henüz yok; yedek gerekmedi.");
  migrasyonlariUygula(db);
  db.$client.close();
  console.log(`Migration'lar uygulandı: ${dosya}`);
}

calistir().catch((hata) => {
  console.error("Migration uygulanamadı (veritabanı değiştirilmedi; yedek varsa yukarıda):", hata);
  process.exit(1);
});
