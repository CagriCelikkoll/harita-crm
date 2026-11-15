// npm run anahtar:uret için saf yardımcı (test edilir): env dosyası metnine eksik gizli anahtarları ekler.
// Değeri dolu olan anahtara DOKUNULMAZ: ILETI_IMZA_ANAHTARI değişirse engel listesi eşleşmez ve eski abonelik
// bağlantıları geçersiz olur; ILETI_SIFRELEME_ANAHTARI değişirse kayıtlı sağlayıcı ve WhatsApp bilgileri çözülemez.
import { randomBytes } from "node:crypto";

export const URETILECEK_ANAHTARLAR = ["BETTER_AUTH_SECRET", "ILETI_SIFRELEME_ANAHTARI", "ILETI_IMZA_ANAHTARI"] as const;

export const rastgeleAnahtar = () => randomBytes(32).toString("base64");

/** "KEY=değer" satırındaki değer (tırnaklar ve satır sonu yorumu atılmış); satır yoksa null. */
function satirDegeri(satir: string, ad: string): string | null {
  const m = new RegExp(`^\\s*(?:export\\s+)?${ad}\\s*=(.*)$`).exec(satir);
  if (!m) return null;
  let d = m[1].trim();
  if (d.startsWith("#")) return "";
  if ((d.startsWith('"') && d.endsWith('"')) || (d.startsWith("'") && d.endsWith("'"))) d = d.slice(1, -1).trim();
  else d = d.replace(/\s+#.*$/, "").trim();
  return d;
}

export type AnahtarSonucu = { metin: string; eklenen: string[]; korunan: string[] };

export function anahtarlariEkle(metin: string, uret: () => string = rastgeleAnahtar): AnahtarSonucu {
  const satirSonu = metin.includes("\r\n") ? "\r\n" : "\n";
  const satirlar = metin.length ? metin.split(/\r?\n/) : [];
  const eklenen: string[] = [];
  const korunan: string[] = [];
  for (const ad of URETILECEK_ANAHTARLAR) {
    const i = satirlar.findIndex((s) => satirDegeri(s, ad) !== null);
    if (i >= 0 && satirDegeri(satirlar[i], ad)) {
      korunan.push(ad);
      continue;
    }
    const yeni = `${ad}=${uret()}`;
    if (i >= 0) satirlar[i] = yeni;
    else {
      // Dosya sonundaki boş satırdan önce ekle.
      const son = satirlar.length && satirlar[satirlar.length - 1] === "" ? satirlar.length - 1 : satirlar.length;
      satirlar.splice(son, 0, yeni);
    }
    eklenen.push(ad);
  }
  let sonuc = satirlar.join(satirSonu);
  if (!sonuc.endsWith(satirSonu)) sonuc += satirSonu;
  return { metin: sonuc, eklenen, korunan };
}
