// Çalışma alanının günlük gönderim sınırını değiştirir (kanal bazında, İstanbul günü).
// Kullanım: npm run sinir -- <tenant-slug> <eposta|sms|whatsapp_api|whatsapp> <sayi|varsayilan>
//   ör. npm run sinir -- ege-satis eposta 500
//       npm run sinir -- ege-satis sms varsayilan   (GUNLUK_SMS_SINIRI ya da 200)
import "./ortam";
import { KUYRUK_KANALLARI } from "../src/lib/mesajlasma";
import { gunlukSinirAyarla, type SinirKanali } from "../src/server/repo/sistem/sinir";

const KANAL_SECENEKLERI: string[] = [...KUYRUK_KANALLARI, "whatsapp"];

const [slug, kanal, deger] = process.argv.slice(2);
const sayi = deger === "varsayilan" ? null : Number(deger);
if (
  !slug ||
  !KANAL_SECENEKLERI.includes(kanal) ||
  !deger ||
  (sayi !== null && (!Number.isInteger(sayi) || sayi < 0))
) {
  console.error(`Kullanım: npm run sinir -- <tenant-slug> <${KANAL_SECENEKLERI.join("|")}> <sayi|varsayilan>  (WhatsApp: kullanıcı başına, en fazla 50)`);
  process.exit(1);
}
let sonuc;
try {
  sonuc = gunlukSinirAyarla(slug, kanal as SinirKanali, sayi);
} catch (hata) {
  console.error((hata as Error).message);
  process.exit(1);
}
if (!sonuc) {
  console.error(`"${slug}" slug'ına sahip çalışma alanı bulunamadı.`);
  process.exit(1);
}
console.log(`${sonuc.ad} (${sonuc.slug}) günlük ${sonuc.kanal} sınırı: ${sonuc.sinir}${sayi === null ? " (varsayılan)" : ""}`);
