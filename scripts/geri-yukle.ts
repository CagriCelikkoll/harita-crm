// Yedekten geri yükleme. Canlıda doğrudan değil, deploy/geri-yukle.sh ile çalıştırın: servisleri durdurur, bunu çağırır,
// migration'ları uygular ve servisleri başlatır.
//
// Kullanım: npm run yedek:geri-yukle -- <yedek.db.gz | yedek.db> --evet [--zorla]
//   --evet   Onay. Olmadan yalnızca ne yapılacağını yazar ve çıkar.
//   --zorla  Mevcut veritabanı bozuk olduğu için yedeği alınamıyorsa dosyayı <ad>.bozuk-<damga> olarak kenara taşır.
// Mevcut veritabanının yedeği önce migration yedek klasörüne (veritabanı klasörü/yedek/) alınır: geri dönülebilir.
import "./ortam";
import path from "node:path";
import { yedektenGeriYukle } from "../src/server/db/gunluk-yedek";

const argumanlar = process.argv.slice(2);
const yedek = argumanlar.find((a) => !a.startsWith("--"));
const dosya = path.resolve(process.env.DATABASE_PATH ?? "./data/app.db");

if (!yedek) {
  console.error("Kullanım: npm run yedek:geri-yukle -- <yedek.db.gz> --evet [--zorla]");
  process.exit(1);
}
if (!argumanlar.includes("--evet")) {
  console.log(`Geri yüklenecek: ${path.resolve(yedek)}`);
  console.log(`Yerine konacak veritabanı: ${dosya}`);
  console.log("Web ve işçi servisleri durdurulmuş olmalı. Mevcut veritabanının yedeği önce alınır.");
  console.log("Onaylamak için komutu --evet ile yeniden çalıştırın.");
  process.exit(1);
}

yedektenGeriYukle(yedek, dosya, { zorla: argumanlar.includes("--zorla") })
  .then((s) => {
    if (s.oncekiYedek) console.log(`Mevcut veritabanının yedeği: ${s.oncekiYedek}`);
    if (s.bozukTasinan) console.log(`Bozuk veritabanı kenara taşındı: ${s.bozukTasinan}`);
    console.log(`Geri yüklendi: ${dosya}`);
    console.log("Sonraki adım: npm run db:migrate (yedek eski sürümdense şemayı günceller), sonra servisleri başlatın.");
  })
  .catch((hata: Error) => {
    console.error(`Geri yüklenemedi (veritabanı değiştirilmedi): ${hata.message}`);
    process.exit(1);
  });
