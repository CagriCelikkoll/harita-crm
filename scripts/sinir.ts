// Çalışma alanının günlük gönderim sınırını değiştirir (kanal bazında, İstanbul günü).
// Kullanım: npm run sinir -- <tenant-slug> <eposta|sms> <sayi|varsayilan>
//   ör. npm run sinir -- ege-satis eposta 500
//       npm run sinir -- ege-satis sms varsayilan   (GUNLUK_SMS_SINIRI ya da 200)
import "./ortam";
import { KANALLAR, type Kanal } from "../src/lib/mesajlasma";
import { gunlukSinirAyarla } from "../src/server/repo/sistem/sinir";

const [slug, kanal, deger] = process.argv.slice(2);
const sayi = deger === "varsayilan" ? null : Number(deger);
if (
  !slug ||
  !(KANALLAR as readonly string[]).includes(kanal) ||
  !deger ||
  (sayi !== null && (!Number.isInteger(sayi) || sayi < 0))
) {
  console.error(`Kullanım: npm run sinir -- <tenant-slug> <${KANALLAR.join("|")}> <sayi|varsayilan>`);
  process.exit(1);
}
const sonuc = gunlukSinirAyarla(slug, kanal as Kanal, sayi);
if (!sonuc) {
  console.error(`"${slug}" slug'ına sahip çalışma alanı bulunamadı.`);
  process.exit(1);
}
console.log(`${sonuc.ad} (${sonuc.slug}) günlük ${sonuc.kanal} sınırı: ${sonuc.sinir}${sayi === null ? " (varsayılan)" : ""}`);
