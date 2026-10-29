// Alıcı adresleri: normalleştirme ve engel listesi özeti.
import "server-only";
import type { EngelTuru } from "@/lib/mesajlasma";
import { epostaNormallestir, telefonNormallestir } from "@/lib/adres-normal";
import { hmac, imzaAnahtari } from "./anahtarlar";

export { cepMi, epostaNormallestir, telefonNormallestir } from "@/lib/adres-normal";

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
