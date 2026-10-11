// Mesaj şablonu: {isletme} yer tutucusu YALNIZCA kaydın kullanıcı tarafından girilen işletme adıyla dolar.
// Places içeriği hiçbir koşulda mesaj gövdesine girmez. (İstemcide canlı önizlemede de kullanılır.)
import { ISLETME_YER_TUTUCUSU } from "./mesajlasma";

const YER_TUTUCU = /\{isletme\}/g;

/**
 * - İşletme adı varsa: {isletme} → ad.
 * - Yoksa ve kampanyada "boş isim hitabı" tanımlıysa: {isletme} → hitap.
 * - İkisi de yoksa: yer tutucu kaldırılır. Satırda önünde metin varsa, önündeki boşluk ve virgül de
 *   silinir ("Merhaba {isletme}," → "Merhaba,"; "Merhaba, {isletme}!" → "Merhaba!"); satır başındaysa
 *   arkasındaki boşluk ve virgül silinir ("{isletme}, hoş geldiniz" → "hoş geldiniz").
 */
export function sablonDoldur(sablon: string, isletmeAdi: string | null | undefined, bosIsimHitabi?: string | null) {
  const ad = isletmeAdi?.trim();
  if (ad) return sablon.replace(YER_TUTUCU, () => ad);
  const hitap = bosIsimHitabi?.trim();
  if (hitap) return sablon.replace(YER_TUTUCU, () => hitap);
  return sablon
    .replace(/([^\s,\n])[ \t,]*\{isletme\}/g, "$1")
    .replace(/(^|\n)[ \t]*\{isletme\}[ \t,]*/g, "$1")
    .replace(YER_TUTUCU, "");
}

export const yerTutucuVarMi = (sablon: string) => sablon.includes(ISLETME_YER_TUTUCUSU);
