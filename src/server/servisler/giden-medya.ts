// Gelen kutusundan gönderilecek dosyanın doğrulanması. Tür dosyanın İÇERİĞİNDEN (imza) belirlenir ve uzantının gösterdiği
// türle aynı olmalıdır: uzantısı değiştirilmiş dosya (ör. .exe → .pdf, PNG → .jpg) reddedilir; tarayıcının bildirdiği
// tür dikkate alınmaz. Kurallar ve sınırlar lib/gelen-kutusu.ts (GIDEN_MEDYA_KURALLARI) ile aynıdır.
//  - Görsel: JPEG / PNG imzası.
//  - Video: ISO BMFF ("ftyp"); 3GP markası → video/3gpp, QuickTime (.mov) reddedilir; görüntü H.264 (avc1/avc3) olmalı,
//    ses izi varsa AAC (mp4a). WhatsApp başka kodlamayı (ör. HEVC) teslim etmez.
//  - Belge: PDF ("%PDF-"); DOC/XLS/PPT (OLE2) ve DOCX/XLSX/PPTX (ZIP + Office klasörü) uzantıyla eşleşmeli; TXT: geçerli
//    UTF-8, NUL baytı yok.
import "server-only";
import { DESTEKLENMEYEN_DOSYA_METNI, gidenMedyaOnKontrol, type GidenMedyaTuru } from "@/lib/gelen-kutusu";
import { gorselImzasi } from "@/lib/whatsapp-api";

export class GidenMedyaHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "GidenMedyaHatasi";
  }
}

const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const basliyor = (b: Uint8Array, imza: number[], konum = 0) => b.length >= konum + imza.length && imza.every((x, i) => b[konum + i] === x);
const ascii = (b: Uint8Array, bas: number, son: number) => String.fromCharCode(...b.subarray(bas, son));
const iceriyor = (b: Uint8Array, metin: string) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).indexOf(metin, 0, "latin1") >= 0;

const UYUSMUYOR = "Dosyanın içeriği uzantısıyla uyuşmuyor (uzantısını değiştirmek yetmez). " + DESTEKLENMEYEN_DOSYA_METNI;

/** İçerikten belirlenen MIME (desteklenenlerden biri değilse null) ve videoda kodlama sorunu. */
function icerikMime(b: Uint8Array, uzantiMime: string): { mime: string | null; sorun?: string } {
  const gorsel = gorselImzasi(b);
  if (gorsel) return { mime: gorsel };
  if (b.length >= 12 && ascii(b, 4, 8) === "ftyp") {
    const marka = ascii(b, 8, 12);
    if (marka === "qt  ") return { mime: null, sorun: "QuickTime (.mov) videosu gönderilemez; MP4 olarak kaydedin." };
    const mime = marka.startsWith("3gp") || marka.startsWith("3g2") ? "video/3gpp" : "video/mp4";
    if (!iceriyor(b, "avc1") && !iceriyor(b, "avc3")) {
      return { mime, sorun: "Video H.264 ile kodlanmış olmalı (ör. HEVC/H.265 videoyu WhatsApp teslim etmez)." };
    }
    if (iceriyor(b, "soun") && !iceriyor(b, "mp4a")) return { mime, sorun: "Videonun sesi AAC olmalı." };
    return { mime };
  }
  if (ascii(b, 0, 5) === "%PDF-") return { mime: "application/pdf" };
  if (basliyor(b, OLE2)) {
    // Eski Office biçimleri aynı kapsayıcıyı kullanır; hangisi olduğu uzantıdan (yalnızca bu üçü kabul).
    return { mime: ["application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint"].includes(uzantiMime) ? uzantiMime : null };
  }
  if (basliyor(b, ZIP)) {
    if (!iceriyor(b, "[Content_Types].xml")) return { mime: null };
    if (iceriyor(b, "word/")) return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    if (iceriyor(b, "xl/")) return { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    if (iceriyor(b, "ppt/")) return { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
    return { mime: null };
  }
  if (uzantiMime === "text/plain") {
    if (b.includes(0)) return { mime: null };
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(b);
      return { mime: "text/plain" };
    } catch {
      return { mime: null, sorun: "Metin dosyası UTF-8 olmalı." };
    }
  }
  return { mime: null };
}

/** Karşı tarafa gidecek dosya adı: denetim karakterleri ve yol ayraçları temizlenir, uzantı korunur. */
export function gidenDosyaAdi(ad: string): string {
  const temiz = ad.replace(/[\u0000-\u001f\u007f"\\/<>:|?*]/g, "_").trim();
  if (temiz.length <= 200) return temiz;
  const u = /\.[A-Za-z0-9]{1,5}$/.exec(temiz)?.[0] ?? "";
  return temiz.slice(0, 200 - u.length) + u;
}

/** Boyut, uzantı ve içerik denetimi. Hata metni kullanıcıya gösterilir. */
export function gidenMedyaDogrula(ad: string, bayt: Uint8Array): { tur: GidenMedyaTuru; mime: string; dosyaAdi: string } {
  const on = gidenMedyaOnKontrol(ad, bayt.byteLength);
  if (!on.tamam) throw new GidenMedyaHatasi(on.hata);
  const ic = icerikMime(bayt, on.mime);
  if (ic.sorun) throw new GidenMedyaHatasi(ic.sorun);
  if (ic.mime !== on.mime) throw new GidenMedyaHatasi(UYUSMUYOR);
  return { tur: on.tur, mime: on.mime, dosyaAdi: gidenDosyaAdi(ad) };
}
