// Günlük veritabanı yedeği. Canlıda deploy/harita-yedek.timer her gün çalıştırır; elle de çalıştırılabilir.
//
// Kullanım: npm run yedek
// Hedef: YEDEK_KLASORU (canlıda /var/backups/harita-crm), yoksa veritabanı klasöründeki gunluk-yedek/.
// Dosya: app-<damga>.db.gz (0600). Bütünlük denetiminden geçmeyen yedek bırakılmaz (çıkış kodu 1).
// Saklama: son 14 gün; en yeni yedek her zaman kalır. Uygulamayı durdurmak gerekmez (çevrimiçi yedek).
import "./ortam";
import { gunlukYedekAl } from "../src/server/db/gunluk-yedek";
import { gunlukYedekKlasoru } from "../src/server/yedek-saklama";

const dosya = process.env.DATABASE_PATH ?? "./data/app.db";
const klasor = gunlukYedekKlasoru(dosya);

gunlukYedekAl(dosya, klasor)
  .then((s) => {
    console.log(`Yedek alındı: ${s.yol} (${(s.boyut / 1024 / 1024).toFixed(1)} MB, bütünlük denetimi geçti)`);
    if (s.silinen.length) console.log(`Saklama süresi (14 gün) dolan ${s.silinen.length} eski yedek silindi.`);
  })
  .catch((hata: Error) => {
    console.error(`Yedek alınamadı: ${hata.message}`);
    process.exit(1);
  });
