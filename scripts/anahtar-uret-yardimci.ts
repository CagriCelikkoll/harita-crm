// npm run anahtar:uret için saf yardımcı (test edilir): env dosyası metnine eksik gizli anahtarları ekler.
// Değeri dolu olan anahtara DOKUNULMAZ: ILETI_IMZA_ANAHTARI değişirse engel listesi eşleşmez ve eski abonelik
// bağlantıları geçersiz olur; ILETI_SIFRELEME_ANAHTARI değişirse kayıtlı sağlayıcı ve WhatsApp bilgileri çözülemez.
// VAPID (gelen kutusu bildirimi) anahtarları bir P-256 çiftidir ve birlikte üretilir: ikisi de doluysa dokunulmaz,
// ikisi de boşsa üretilir, yalnızca biri doluysa hiçbir şey yazılmadan hata verilir (çift bozuk; bildirimler çalışmaz).
// VAPID çifti değişirse tüm cihazların bildirimi yeniden açması gerekir.
import { createECDH, randomBytes } from "node:crypto";

export const URETILECEK_ANAHTARLAR = ["BETTER_AUTH_SECRET", "ILETI_SIFRELEME_ANAHTARI", "ILETI_IMZA_ANAHTARI"] as const;

export const rastgeleAnahtar = () => randomBytes(32).toString("base64");

export const VAPID_ANAHTARLARI = ["VAPID_ACIK_ANAHTAR", "VAPID_GIZLI_ANAHTAR"] as const;
export type VapidCifti = { acik: string; gizli: string };

/** P-256 anahtar çifti, base64url: açık anahtar sıkıştırılmamış 65 bayt, gizli anahtar 32 bayt (web-push biçimi). */
export function vapidCiftiUret(): VapidCifti {
  const ec = createECDH("prime256v1");
  ec.generateKeys();
  const gizli = ec.getPrivateKey();
  const tam = gizli.length < 32 ? Buffer.concat([Buffer.alloc(32 - gizli.length), gizli]) : gizli;
  return { acik: ec.getPublicKey().toString("base64url"), gizli: tam.toString("base64url") };
}

export class VapidCiftiHatasi extends Error {}

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

export function anahtarlariEkle(metin: string, uret: () => string = rastgeleAnahtar, vapidUret: () => VapidCifti = vapidCiftiUret): AnahtarSonucu {
  const satirSonu = metin.includes("\r\n") ? "\r\n" : "\n";
  const satirlar = metin.length ? metin.split(/\r?\n/) : [];
  const eklenen: string[] = [];
  const korunan: string[] = [];
  const satirNo = (ad: string) => satirlar.findIndex((s) => satirDegeri(s, ad) !== null);
  const dolu = (ad: string) => {
    const i = satirNo(ad);
    return i >= 0 && !!satirDegeri(satirlar[i], ad);
  };
  const yaz = (ad: string, deger: string) => {
    const i = satirNo(ad);
    const yeni = `${ad}=${deger}`;
    if (i >= 0) satirlar[i] = yeni;
    else {
      // Dosya sonundaki boş satırdan önce ekle.
      const son = satirlar.length && satirlar[satirlar.length - 1] === "" ? satirlar.length - 1 : satirlar.length;
      satirlar.splice(son, 0, yeni);
    }
    eklenen.push(ad);
  };
  const vapidDolu = VAPID_ANAHTARLARI.filter(dolu);
  if (vapidDolu.length === 1) {
    throw new VapidCiftiHatasi(
      `${vapidDolu[0]} dolu ama ${VAPID_ANAHTARLARI.find((a) => a !== vapidDolu[0])} boş: VAPID anahtarları birlikte üretilir. ` +
        "Doğru çifti geri koyun ya da ikisini de boşaltın (yeni çift üretilir; cihazlar bildirimi yeniden açar). Dosyaya yazılmadı.",
    );
  }
  for (const ad of URETILECEK_ANAHTARLAR) {
    if (dolu(ad)) korunan.push(ad);
    else yaz(ad, uret());
  }
  if (vapidDolu.length === 2) korunan.push(...VAPID_ANAHTARLARI);
  else {
    const cift = vapidUret();
    yaz("VAPID_ACIK_ANAHTAR", cift.acik);
    yaz("VAPID_GIZLI_ANAHTAR", cift.gizli);
  }
  let sonuc = satirlar.join(satirSonu);
  if (!sonuc.endsWith(satirSonu)) sonuc += satirSonu;
  return { metin: sonuc, eklenen, korunan };
}
