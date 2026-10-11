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

/** İstanbul takvimindeki "YYYY-MM-DD" gününün `dakika`'sına (gece yarısından) karşılık gelen an. */
export function istanbulAni(gun: string, dakika = 0): Date {
  const [y, a, g] = gun.split("-").map(Number);
  const yerelUtc = Date.UTC(y, a - 1, g, 0, dakika);
  // Saat dilimi farkı o andaki duvar saatinden hesaplanır (yaz saati uygulansa da doğru kalır).
  const tahmin = new Date(yerelUtc - 3 * 3_600_000);
  const p = parcalar(tahmin);
  const tahminYerel = Date.UTC(Number(p.yil), Number(p.ay) - 1, Number(p.gun), p.saat, p.dakika);
  return new Date(tahmin.getTime() + (yerelUtc - tahminYerel));
}

/** "YYYY-MM-DD" gününe n gün ekler. */
export function gunEkle(gun: string, n: number): string {
  const [y, a, g] = gun.split("-").map(Number);
  return new Date(Date.UTC(y, a - 1, g + n)).toISOString().slice(0, 10);
}

/** İstanbul saatiyle [baslangicDk, bitisDk) aralığında mı? */
export function penceredeMi(tarih: Date, baslangicDk: number, bitisDk: number): boolean {
  const dk = gunIciDakika(tarih);
  return dk >= baslangicDk && dk < bitisDk;
}

/** Pencere içindeyse `tarih`in kendisi; değilse bir sonraki pencere başlangıcı. */
export function sonrakiPencere(tarih: Date, baslangicDk: number, bitisDk: number): Date {
  if (penceredeMi(tarih, baslangicDk, bitisDk)) return tarih;
  const gun = gunAnahtari(tarih);
  const bugunBaslangic = istanbulAni(gun, baslangicDk);
  return tarih < bugunBaslangic ? bugunBaslangic : istanbulAni(gunEkle(gun, 1), baslangicDk);
}
