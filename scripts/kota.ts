// Çalışma alanının aylık Places kotasını değiştirir.
// Kullanım: npm run kota -- <tenant-slug> <sayi>      ör. npm run kota -- ege-satis 5000
import { kotaAyarla } from "../src/server/repo/sistem/kota";

const [slug, sayiMetni] = process.argv.slice(2);
const sayi = Number(sayiMetni);
if (!slug || !sayiMetni || !Number.isInteger(sayi) || sayi < 0) {
  console.error("Kullanım: npm run kota -- <tenant-slug> <sayi>   (sayı: 0 veya daha büyük tam sayı)");
  process.exit(1);
}
const sonuc = kotaAyarla(slug, sayi);
if (!sonuc) {
  console.error(`"${slug}" slug'ına sahip çalışma alanı bulunamadı.`);
  process.exit(1);
}
console.log(`${sonuc.ad} (${sonuc.slug}) aylık Places kotası: ${sonuc.kota}`);
