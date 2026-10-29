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

/**
 * Yerel kısım yalnızca RFC 5322 "atext" karakterleri (tırnak, yorum parantezi, <>, ;, ,, :, \ yok); alan adı ASCII
 * etiketler (IDN için xn--). Tırnaklı/yorumlu adresler reddedilir: nodemailer'ın addressparser'ındaki bu tür
 * adreslerle ilgili açıklar (GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h) tetiklenemez.
 */
const EPOSTA_DESENI =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function epostaNormallestir(metin: string | null | undefined): string | null {
  const e = metin?.trim().toLowerCase();
  return e && e.length <= 254 && EPOSTA_DESENI.test(e) ? e : null;
}
