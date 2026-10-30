// Kullanım: npm run cleanup   (cron ile günde bir kez çalıştırın, README'ye bakın)
import "./ortam";
import { temizlikYap, tumYarimKalanTaramalariKapat } from "../src/server/repo/sistem/bakim";

const sonuc = temizlikYap();
const yarim = tumYarimKalanTaramalariKapat();
console.log(
  `[${new Date().toISOString()}] Temizlik: ${sonuc.silinenKonum} Places konumu (30+ gün), ` +
    `${sonuc.temizlenenMerkez} tarama merkezi (30+ gün), ` +
    `${sonuc.silinenKayit} kayıt (saklama süresi), ${sonuc.silinenDavet} süresi dolmuş davet, ` +
    `${sonuc.kapatilanIceAktarma} süresi dolmuş içe aktarma oturumu, ${sonuc.silinenGelenKimlik} eski WhatsApp ileti kimliği, ` +
    `${yarim} yarıda kalmış tarama.`,
);
