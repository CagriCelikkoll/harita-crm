// Üretim gizli anahtarlarını üretip env dosyasına yazar. Değerleri EKRANA YAZMAZ; yalnızca hangi anahtarların
// eklendiğini ve hangilerinin zaten dolu olduğu için korunduğunu söyler. Dolu değerin üzerine asla yazmaz.
//
// Kullanım: npm run anahtar:uret -- <env dosyası>      (canlıda: /opt/harita-crm/.env.production.local)
// Dosya önceden var olmalı (.env.production.example'dan kopyalanır). Yazdıktan sonra izin 0600 yapılır.
import fs from "node:fs";
import path from "node:path";
import { anahtarlariEkle } from "./anahtar-uret-yardimci";

const hedef = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!hedef) {
  console.error("Kullanım: npm run anahtar:uret -- <env dosyası>   (ör. .env.production.local)");
  process.exit(1);
}
const dosya = path.resolve(hedef);
if (!fs.existsSync(dosya)) {
  console.error(`${dosya} bulunamadı. Önce oluşturun: cp .env.production.example ${hedef}`);
  process.exit(1);
}

const sonuc = anahtarlariEkle(fs.readFileSync(dosya, "utf8"));
if (sonuc.eklenen.length) {
  fs.writeFileSync(dosya, sonuc.metin, { mode: 0o600 });
}
try {
  fs.chmodSync(dosya, 0o600);
} catch {
  // Windows: izin biti yok.
}
for (const ad of sonuc.eklenen) console.log(`✓ ${ad} üretildi ve yazıldı.`);
for (const ad of sonuc.korunan) console.log(`• ${ad} zaten dolu; dokunulmadı.`);
console.log(`Dosya: ${dosya} (izin 0600). Değerler ekrana yazılmaz; dosyayı yedekleyin: kaybolursa şifreli bilgiler çözülemez.`);
