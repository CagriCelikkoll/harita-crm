// Takvim hesapları Europe/Istanbul saat dilimine göre yapılır (kota ayı, günlük gönderim sınırları,
// gönderim saatleri). Sunucunun kendi saat dilimi önemsizdir.

export const SAAT_DILIMI = "Europe/Istanbul";

const parcalayici = new Intl.DateTimeFormat("en-CA", {
  timeZone: SAAT_DILIMI,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parcalar(tarih: Date) {
  const p = Object.fromEntries(parcalayici.formatToParts(tarih).map((x) => [x.type, x.value]));
  return { yil: p.year, ay: p.month, gun: p.day, saat: Number(p.hour), dakika: Number(p.minute) };
}

/** İstanbul takvimine göre "YYYY-MM-DD". */
export function gunAnahtari(tarih = new Date()): string {
  const p = parcalar(tarih);
  return `${p.yil}-${p.ay}-${p.gun}`;
}

/** İstanbul takvimine göre "YYYY-MM". */
export function ayAnahtari(tarih = new Date()): string {
  return gunAnahtari(tarih).slice(0, 7);
}

/** İstanbul saatine göre gece yarısından bu yana geçen dakika (0–1439). */
export function gunIciDakika(tarih = new Date()): number {
  const p = parcalar(tarih);
  return p.saat * 60 + p.dakika;
}
