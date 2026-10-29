// Telefon ve e-posta normalleştirme. Saf fonksiyonlar: sunucu, istemci ve betikler (migration) ortak kullanır.

/** Türkiye numarası → "90XXXXXXXXXX" (12 hane). Tanınmayan biçimde null. */
export function telefonNormallestir(metin: string | null | undefined): string | null {
  if (!metin) return null;
  let rakam = metin.replace(/\D/g, "");
  if (rakam.startsWith("00")) rakam = rakam.slice(2);
  if (rakam.length === 11 && rakam.startsWith("0")) rakam = `90${rakam.slice(1)}`;
  if (rakam.length === 10) rakam = `90${rakam}`;
  return /^90[2-9]\d{9}$/.test(rakam) ? rakam : null;
}

/** Türkiye cep telefonu (90 5XX …). */
export const cepMi = (normal: string | null): normal is string => normal !== null && /^905\d{9}$/.test(normal);

export function epostaNormallestir(metin: string | null | undefined): string | null {
  const e = metin?.trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
