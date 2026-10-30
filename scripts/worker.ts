// Gönderim işçisi: message_queue'yu küçük partiler halinde işler. Web sunucusundan AYRI, sürekli çalışan bir
// süreç olarak başlatın (README → "Gönderim işçisi").
//
// Kullanım:
//   npm run worker              sürekli (WORKER_ARALIK_SN saniyede bir; dolu parti varsa beklemeden devam)
//   npm run worker -- --bir-kez tek tur çalışır ve çıkar (cron ile de kullanılabilir)
//
// Aynı anda yalnızca bir işçi turu çalışır (veritabanındaki süresi dolan işçi kilidi, ISCI_KILIT_SN, varsayılan 120 sn;
// tur boyunca nabızla uzatılır). Kilit başka işçideyse tur bir şey yapmadan biter; cron ile üst üste binen
// `--bir-kez` çalıştırmaları güvenlidir. Bir mesaj iki kez gönderilmez (satırlar atomik olarak alınır).
// SIGINT/SIGTERM: eldeki tur bitirilir, sonra çıkılır.
import "./ortam";
import { isciTuru } from "../src/server/servisler/isci";

const birKez = process.argv.includes("--bir-kez");
const aralikMs = Math.max(5, Number(process.env.WORKER_ARALIK_SN ?? 30)) * 1000;
const parti = Math.max(1, Number(process.env.WORKER_PARTI ?? 20));
let durdur = false;

for (const sinyal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinyal, () => {
    if (durdur) process.exit(1);
    durdur = true;
    console.log(`[işçi] ${sinyal} alındı; tur bitince çıkılacak.`);
  });
}

const bekle = (ms: number) =>
  new Promise<void>((coz) => {
    const bitis = Date.now() + ms;
    const zamanlayici = setInterval(() => {
      if (durdur || Date.now() >= bitis) {
        clearInterval(zamanlayici);
        coz();
      }
    }, 250);
  });

async function calistir() {
  console.log(`[işçi] başladı (parti ${parti}, aralık ${aralikMs / 1000} sn${birKez ? ", tek tur" : ""}).`);
  do {
    let sonuc;
    try {
      sonuc = await isciTuru({ parti });
    } catch (hata) {
      console.error(`[işçi] tur hatası:`, hata);
      if (birKez) process.exitCode = 1;
      await bekle(aralikMs);
      continue;
    }
    if (sonuc.kilitAlinamadi) {
      console.log(`[${new Date().toISOString()}] başka bir işçi turu çalışıyor; bu tur atlandı.`);
      if (!birKez) await bekle(aralikMs);
      continue;
    }
    const { alinan, gonderilen, bekletilen, haric, basarisiz, belirsiz, atlanan, baslatilanKampanya, tamamlananKampanya } = sonuc;
    if (alinan || belirsiz || baslatilanKampanya || tamamlananKampanya) {
      console.log(
        `[${new Date().toISOString()}] alınan ${alinan}, gönderilen ${gonderilen}, bekletilen ${bekletilen}, ` +
          `hariç ${haric}, başarısız ${basarisiz}, belirsiz ${belirsiz}, atlanan ${atlanan}, başlayan kampanya ${baslatilanKampanya}, ` +
          `biten kampanya ${tamamlananKampanya}`,
      );
    }
    // Parti doluysa kuyrukta daha fazlası olabilir: beklemeden devam.
    if (!birKez && alinan < parti) await bekle(aralikMs);
  } while (!birKez && !durdur);
  console.log("[işçi] durdu.");
}

void calistir();
