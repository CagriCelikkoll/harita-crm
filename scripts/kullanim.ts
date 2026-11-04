// Çalışma alanının bu ayki Places kullanımını birim ve dolar olarak yazar: toplam ve kalemler (tarama, işletme
// bilgisi, iletişim bilgisi, harita). SALT OKUNUR: veritabanında hiçbir şeyi değiştirmez, Google'a istek atmaz.
// Kullanım: npm run kullanim -- <tenant-slug> [ay]      ör. npm run kullanim -- ege-satis   ya da   … ege-satis 2026-10
import "./ortam";
import { ayAnahtari } from "../src/lib/zaman";
import { kullanimRaporu } from "./kullanim-raporu";
import { saltOkunurAc, veritabaniYolu } from "./salt-okunur-db";

const [slug, ay = ayAnahtari()] = process.argv.slice(2);
if (!slug || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ay)) {
  console.error("Kullanım: npm run kullanim -- <tenant-slug> [ay]   (ay: YYYY-AA, varsayılan bu ay, İstanbul saati)");
  process.exit(1);
}
let sqlite;
try {
  sqlite = saltOkunurAc();
} catch (hata) {
  console.error(`Veritabanı açılamadı (${veritabaniYolu()}): ${(hata as Error).message}`);
  process.exit(1);
}
const satirlar = kullanimRaporu(sqlite, slug, ay);
sqlite.close();
if (!satirlar) {
  console.error(`"${slug}" slug'ına sahip çalışma alanı bulunamadı.`);
  process.exit(1);
}
console.log(satirlar.join("\n"));
