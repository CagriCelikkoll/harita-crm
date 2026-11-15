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

// --- Günlük yedek (npm run yedek; canlıda systemd zamanlayıcısı) ---
// Ayrı klasördedir (YEDEK_KLASORU, canlıda /var/backups/harita-crm): app.db → app-<damga>.db.gz. Migration yedeklerinden
// (yedek/ altındaki .db dosyaları) ayrı tutulur ve ayrı kuralla silinir: son 14 gün kalır, en yeni yedek her zaman kalır
// (sunucu uzun süre kapalı kalsa ya da saat yanlış olsa bile elde en az bir yedek olsun).

export const GUNLUK_YEDEK_SAKLAMA_GUN = 14;

/** Günlük yedek klasörü: YEDEK_KLASORU, yoksa veritabanı klasöründeki gunluk-yedek/. */
export const gunlukYedekKlasoru = (dosyaYolu: string, ortam = process.env.YEDEK_KLASORU) =>
  ortam?.trim() ? path.resolve(ortam.trim()) : path.join(path.dirname(path.resolve(dosyaYolu)), "gunluk-yedek");

/** Bu veritabanının günlük yedekleri, en yeni önce. Klasör yoksa boş. */
export function gunlukYedekleri(klasor: string, dosyaYolu: string): { yol: string; an: Date }[] {
  if (!fs.existsSync(klasor)) return [];
  const tam = path.resolve(dosyaYolu);
  const uzanti = path.extname(tam) || ".db";
  const desen = new RegExp(
    `^${kacis(path.basename(tam, path.extname(tam)))}-(\\d{4})(\\d{2})(\\d{2})-(\\d{2})(\\d{2})(\\d{2})(\\d{3})${kacis(uzanti)}\\.gz$`,
  );
  const sonuc: { yol: string; an: Date }[] = [];
  for (const ad of fs.readdirSync(klasor)) {
    const m = desen.exec(ad);
    if (!m) continue;
    const [y, a, g, s, d, sn, ms] = m.slice(1).map(Number);
    sonuc.push({ yol: path.join(klasor, ad), an: new Date(Date.UTC(y, a - 1, g, s, d, sn, ms)) });
  }
  return sonuc.sort((x, y) => y.an.getTime() - x.an.getTime());
}

/** Saklama süresi dolan günlük yedekleri siler (en yeni her zaman kalır); silinenlerin yollarını döndürür. */
export function eskiGunlukYedekleriSil(klasor: string, dosyaYolu: string, simdi = new Date(), gun = GUNLUK_YEDEK_SAKLAMA_GUN): string[] {
  const sinir = simdi.getTime() - gun * 24 * 3600 * 1000;
  const silinen: string[] = [];
  gunlukYedekleri(klasor, dosyaYolu).forEach((y, i) => {
    if (i === 0 || y.an.getTime() >= sinir) return;
    fs.rmSync(y.yol, { force: true });
    silinen.push(y.yol);
  });
  return silinen;
}
