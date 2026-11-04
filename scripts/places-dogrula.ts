// GOOGLE_PLACES_API_KEY'i ücretsiz bir istekle doğrular (Text Search Essentials IDs Only, tek sayfa).
// Kotadan birim düşmez, veritabanına dokunmaz; anahtar hiçbir çıktıya yazılmaz.
// Kullanım: npm run places:dogrula
import "./ortam";
import { anahtariDogrula } from "../src/server/places/istemci";

async function main() {
  if (process.env.PLACES_MOCK === "true") console.log("Not: PLACES_MOCK=true; uygulama şu an Places'a istek göndermiyor.");
  const sonuc = await anahtariDogrula();
  if (sonuc.tamam) {
    console.log(`Places anahtarı çalışıyor: Places API (New) yanıt verdi (${sonuc.kimlikSayisi} yer kimliği, ücretsiz istek).`);
    return;
  }
  console.error(`Places anahtarı doğrulanamadı.\n${sonuc.neden}`);
  process.exitCode = 1;
}

main().catch((hata: unknown) => {
  console.error(`Beklenmeyen hata: ${(hata as Error).message}`);
  process.exitCode = 1;
});
