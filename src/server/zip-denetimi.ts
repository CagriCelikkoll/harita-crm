// ZIP (XLSX) sıkıştırma bombası denetimi: dosya ayrıştırıcıya (exceljs) verilmeden ÖNCE çalışır.
//
// 1. Merkez dizindeki (central directory) dosya sayısı ve beyan edilen açılmış boyut toplamı sınırlanır.
// 2. Merkez dizin yalan söyleyebileceği için her dosya ayrıca gerçekten açılır; açma, kalan bütçeyle sınırlı
//    (zlib maxOutputLength) yapılır: bütçe aşılınca açma durur, bellekte en fazla bütçe kadar veri oluşur.
// ZIP64 ve deflate dışı sıkıştırma yöntemleri reddedilir (5 MB'lık bir XLSX'te gerekmez).
// Biçim: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT (4.3.7 yerel başlık, 4.3.12 merkez dizin, 4.3.16 EOCD)
import "server-only";
import { inflateRawSync } from "node:zlib";

export type ZipDenetimi =
  | { tamam: true; dosyaSayisi: number; acikBayt: number }
  | { tamam: false; neden: "bozuk" | "desteklenmiyor" | "dosya_sayisi" | "boyut" };

const EOCD_IMZA = 0x06054b50;
const MERKEZ_IMZA = 0x02014b50;
const YEREL_IMZA = 0x04034b50;

export function zipDenetle(bayt: Uint8Array, sinir: { azamiAcikBayt: number; azamiDosya: number }): ZipDenetimi {
  const b = Buffer.from(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  const bozuk = { tamam: false, neden: "bozuk" } as const;
  const desteklenmiyor = { tamam: false, neden: "desteklenmiyor" } as const;
  const buyuk = { tamam: false, neden: "boyut" } as const;
  if (b.length < 22) return bozuk;

  // Merkez dizinin sonu (EOCD): sondan geriye, en fazla 64 KB yorum.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b.readUInt32LE(i) === EOCD_IMZA) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return bozuk;
  const kayitSayisi = b.readUInt16LE(eocd + 10);
  const dizinBoyutu = b.readUInt32LE(eocd + 12);
  const dizinOfseti = b.readUInt32LE(eocd + 16);
  if (kayitSayisi === 0xffff || dizinBoyutu === 0xffffffff || dizinOfseti === 0xffffffff) return desteklenmiyor; // ZIP64
  if (kayitSayisi > sinir.azamiDosya) return { tamam: false, neden: "dosya_sayisi" };
  if (dizinOfseti + dizinBoyutu > eocd) return bozuk;

  let p = dizinOfseti;
  let beyan = 0;
  let acik = 0;
  for (let n = 0; n < kayitSayisi; n++) {
    if (p + 46 > eocd || b.readUInt32LE(p) !== MERKEZ_IMZA) return bozuk;
    const yontem = b.readUInt16LE(p + 10);
    const sikisik = b.readUInt32LE(p + 20);
    const acikBoyut = b.readUInt32LE(p + 24);
    const adUzunlugu = b.readUInt16LE(p + 28);
    const ekUzunlugu = b.readUInt16LE(p + 30);
    const yorumUzunlugu = b.readUInt16LE(p + 32);
    const yerel = b.readUInt32LE(p + 42);
    if (sikisik === 0xffffffff || acikBoyut === 0xffffffff || yerel === 0xffffffff) return desteklenmiyor;
    beyan += acikBoyut;
    if (beyan > sinir.azamiAcikBayt) return buyuk;

    // Gerçek açılmış boyut (merkez dizindeki beyana güvenilmez).
    if (yerel + 30 > b.length || b.readUInt32LE(yerel) !== YEREL_IMZA) return bozuk;
    const veriBasi = yerel + 30 + b.readUInt16LE(yerel + 26) + b.readUInt16LE(yerel + 28);
    if (veriBasi + sikisik > b.length) return bozuk;
    const veri = b.subarray(veriBasi, veriBasi + sikisik);
    const kalan = sinir.azamiAcikBayt - acik;
    if (yontem === 0) {
      acik += sikisik;
    } else if (yontem === 8) {
      try {
        acik += inflateRawSync(veri, { maxOutputLength: Math.max(1, kalan) }).length;
      } catch (hata) {
        return (hata as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE" ? buyuk : bozuk;
      }
    } else {
      return desteklenmiyor;
    }
    if (acik > sinir.azamiAcikBayt) return buyuk;
    p += 46 + adUzunlugu + ekUzunlugu + yorumUzunlugu;
  }
  return { tamam: true, dosyaSayisi: kayitSayisi, acikBayt: acik };
}
