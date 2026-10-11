// Sağlayıcı kimlik bilgilerinin veritabanında şifreli saklanması: AES-256-GCM.
// Biçim: "v1:" + base64(iv[12] | etiket[16] | şifreli metin). Ek doğrulanmış veri (AAD) = kiracı|kanal:
// bir kiracının şifreli değeri başka kiracının (ya da başka kanalın) satırına kopyalanırsa çözülemez.
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sifrelemeAnahtari } from "./anahtarlar";

const SURUM = "v1:";

export class SifreCozmeHatasi extends Error {
  constructor() {
    super("Sağlayıcı bilgileri çözülemedi (anahtar değişmiş olabilir). Bilgileri Ayarlar'dan yeniden girin.");
    this.name = "SifreCozmeHatasi";
  }
}

const ekVeri = (tenantId: string, kanal: string) => Buffer.from(`${tenantId}|${kanal}`, "utf8");

export function sifrele(veri: unknown, tenantId: string, kanal: string): string {
  const iv = randomBytes(12);
  const sifreleyici = createCipheriv("aes-256-gcm", sifrelemeAnahtari(), iv);
  sifreleyici.setAAD(ekVeri(tenantId, kanal));
  const metin = Buffer.concat([sifreleyici.update(JSON.stringify(veri), "utf8"), sifreleyici.final()]);
  return SURUM + Buffer.concat([iv, sifreleyici.getAuthTag(), metin]).toString("base64");
}

export function coz<T>(sifreli: string, tenantId: string, kanal: string): T {
  if (!sifreli.startsWith(SURUM)) throw new SifreCozmeHatasi();
  const bayt = Buffer.from(sifreli.slice(SURUM.length), "base64");
  try {
    const cozucu = createDecipheriv("aes-256-gcm", sifrelemeAnahtari(), bayt.subarray(0, 12));
    cozucu.setAAD(ekVeri(tenantId, kanal));
    cozucu.setAuthTag(bayt.subarray(12, 28));
    const metin = Buffer.concat([cozucu.update(bayt.subarray(28)), cozucu.final()]).toString("utf8");
    return JSON.parse(metin) as T;
  } catch {
    throw new SifreCozmeHatasi();
  }
}
