// Migration yedeklerinin saklama kuralı (README → "Alınan kararlar"): veritabanı klasöründeki yedek/ altında, o
// veritabanına ait yedeklerden EN SON 10 tanesi ve son 30 gün içinde alınanların HEPSİ saklanır; diğerleri silinir.
// npm run db:migrate sonunda ve gönderim işçisinin günlük bakımında çalışır.
//
// Yalnızca bu veritabanının adıyla eşleşen yedeklere dokunulur (app.db → app-YYYYMMDD-HHMMSSmmm.db); başka
// veritabanlarının yedekleri (ör. demo.db) ve klasördeki diğer dosyalar silinmez. Yedeğin anı dosya adındaki zaman
// damgasından okunur (dosya kopyalanınca değişen değişiklik tarihinden değil).
import fs from "node:fs";
import path from "node:path";

export const YEDEK_SAKLAMA_ADET = 10;
export const YEDEK_SAKLAMA_GUN = 30;

/** Veritabanı dosyasının yedek klasörü: ./data/app.db → ./data/yedek */
export const yedekKlasoru = (dosyaYolu: string) => path.join(path.dirname(path.resolve(dosyaYolu)), "yedek");

const kacis = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Saklama kuralının dışında kalan yedekleri siler; silinen dosyaların tam yollarını döndürür.
 * Bellek içi veritabanı ya da yedek klasörü yoksa bir şey yapmaz.
 */
export function eskiYedekleriSil(
  dosyaYolu: string,
  simdi = new Date(),
  kural: { adet: number; gun: number } = { adet: YEDEK_SAKLAMA_ADET, gun: YEDEK_SAKLAMA_GUN },
): string[] {
  if (dosyaYolu === ":memory:") return [];
  const klasor = yedekKlasoru(dosyaYolu);
  if (!fs.existsSync(klasor)) return [];
  const tam = path.resolve(dosyaYolu);
  const uzanti = path.extname(tam) || ".db";
  const desen = new RegExp(
    `^${kacis(path.basename(tam, path.extname(tam)))}-(\\d{4})(\\d{2})(\\d{2})-(\\d{2})(\\d{2})(\\d{2})(\\d{3})${kacis(uzanti)}$`,
  );

  const yedekler: { ad: string; an: number }[] = [];
  for (const ad of fs.readdirSync(klasor)) {
    const m = desen.exec(ad);
    if (!m) continue;
    const [y, a, g, s, d, sn, ms] = m.slice(1).map(Number);
    yedekler.push({ ad, an: Date.UTC(y, a - 1, g, s, d, sn, ms) });
  }
  yedekler.sort((x, y) => y.an - x.an); // en yeni önce

  const sinir = simdi.getTime() - kural.gun * 24 * 3600 * 1000;
  const silinen: string[] = [];
  yedekler.forEach((y, i) => {
    if (i < kural.adet || y.an >= sinir) return;
    const hedef = path.join(klasor, y.ad);
    fs.rmSync(hedef, { force: true });
    silinen.push(hedef);
  });
  return silinen;
}
