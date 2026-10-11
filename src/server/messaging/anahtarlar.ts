// Mesajlaşma gizli anahtarları (yalnızca sunucuda, ortam değişkenlerinden).
//
// ILETI_SIFRELEME_ANAHTARI: sağlayıcı kimlik bilgilerinin AES-256-GCM anahtarı (32 bayt, base64).
// ILETI_IMZA_ANAHTARI:      abonelikten çıkma belirteci imzası, engel listesi özeti ve webhook anahtarı
//                           özetleri için HMAC kök anahtarı (en az 32 bayt, base64). DEĞİŞTİRİLMEZ: değişirse
//                           eski abonelik bağlantıları geçersiz olur ve engel listesi eşleşmez.
// Üretmek için: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
import "server-only";
import { createHmac, hkdfSync } from "node:crypto";

export class AnahtarEksikHatasi extends Error {
  constructor(ad: string) {
    super(`${ad} tanımlı değil veya geçersiz (32 baytlık base64 değer olmalı). README'deki "Mesajlaşma" bölümüne bakın.`);
    this.name = "AnahtarEksikHatasi";
  }
}

function anahtarOku(ad: string): Buffer {
  const deger = process.env[ad];
  const bayt = deger ? Buffer.from(deger, "base64") : Buffer.alloc(0);
  if (bayt.length < 32) throw new AnahtarEksikHatasi(ad);
  return bayt;
}

export const sifrelemeAnahtari = () => anahtarOku("ILETI_SIFRELEME_ANAHTARI").subarray(0, 32);

/** İmza kök anahtarından amaca özgü alt anahtar (HKDF-SHA256): bir amacın imzası diğerinde geçmez. */
export function imzaAnahtari(amac: "abonelik" | "engel" | "webhook"): Buffer {
  return Buffer.from(hkdfSync("sha256", anahtarOku("ILETI_IMZA_ANAHTARI"), Buffer.alloc(0), `harita-crm/${amac}`, 32));
}

export const hmac = (anahtar: Buffer, veri: string | Buffer) => createHmac("sha256", anahtar).update(veri).digest();
