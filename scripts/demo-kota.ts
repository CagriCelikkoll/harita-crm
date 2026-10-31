// Demo çalışma alanının aylık Places kotasını değiştirir (yalnızca ./data/demo.db; gerçek veritabanı için npm run kota).
// Kullanım: npm run demo:kota -- <birim>      ör. npm run demo:kota -- 0   (kota dolu)   ·   npm run demo:kota -- 1000
import { DEMO_ALAN_ADI } from "./demo-ortam";
import { kotaAyarla } from "../src/server/repo/sistem/kota";
import { slugUret } from "../src/server/repo/sistem/uyelik";

const sayi = Number(process.argv[2]);
if (!process.argv[2] || !Number.isInteger(sayi) || sayi < 0) {
  console.error("Kullanım: npm run demo:kota -- <birim>   (0 veya daha büyük tam sayı)");
  process.exit(1);
}
const sonuc = kotaAyarla(slugUret(DEMO_ALAN_ADI), sayi);
if (!sonuc) {
  console.error("Demo çalışma alanı bulunamadı. Önce: npm run demo:hazirla");
  process.exit(1);
}
console.log(`${sonuc.ad} aylık Places kotası: ${sonuc.kota} birim (sayfayı yenileyin).`);
