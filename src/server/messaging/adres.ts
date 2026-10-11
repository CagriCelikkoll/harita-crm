// Alıcı adresleri: normalleştirme ve engel listesi özeti.
import "server-only";
import type { EngelTuru } from "@/lib/mesajlasma";
import { hmac, imzaAnahtari } from "./anahtarlar";

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

/**
 * Engel listesinde tutulan anahtarlı özet (HMAC-SHA256, hex). Kiracıya bağlıdır: aynı adres iki kiracıda
 * farklı özet üretir. Değer önceden normalleştirilmiş olmalıdır.
 */
export function adresOzeti(tenantId: string, tur: EngelTuru, normalDeger: string): string {
  return hmac(imzaAnahtari("engel"), `${tenantId}|${tur}|${normalDeger}`).toString("hex");
}

/** Bir kaydın kendi (kullanıcının girdiği) adreslerinin özetleri: ret işaretlenince engel listesine yazılır. */
export function kayitAdresOzetleri(
  tenantId: string,
  kayit: { eposta: string | null; ekTelefon: string | null },
): { tur: EngelTuru; ozet: string }[] {
  const sonuc: { tur: EngelTuru; ozet: string }[] = [];
  const eposta = epostaNormallestir(kayit.eposta);
  if (eposta) sonuc.push({ tur: "eposta", ozet: adresOzeti(tenantId, "eposta", eposta) });
  const telefon = telefonNormallestir(kayit.ekTelefon);
  if (telefon) sonuc.push({ tur: "telefon", ozet: adresOzeti(tenantId, "telefon", telefon) });
  return sonuc;
}
