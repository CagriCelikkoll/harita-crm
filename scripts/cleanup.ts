// Kullanım: npm run cleanup   (cron ile günde bir kez çalıştırın, README'ye bakın)
import { temizlikYap } from "../src/server/repo/sistem/bakim";

const sonuc = temizlikYap();
console.log(
  `[${new Date().toISOString()}] Temizlik: ${sonuc.silinenKonum} Places konumu (30+ gün), ` +
    `${sonuc.silinenKayit} kayıt (saklama süresi), ${sonuc.silinenDavet} süresi dolmuş davet silindi.`,
);
