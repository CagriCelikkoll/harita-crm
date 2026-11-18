// Gelen medyanın diskteki dosyaları: klasör, güvenli yol ve günlük bakım (saklama süresi, artakalan dosyalar).
// "server-only" içermez: npm run cleanup da çağırır.
//
// Klasör: MEDYA_KLASORU; yoksa veritabanının klasöründe "medya" (canlıda /var/lib/harita-crm/medya). Yol kullanıcı
// girdisinden üretilmez: "<tenant>/<yyyy-mm>/<uuid>".
import fs from "node:fs";
import path from "node:path";
import { medyaYoluKayitli, saklamasiDolanMedyalariIsaretle } from "../repo/sistem/medya";

/** İndirme yarıda kalırsa ".part" kalır; artakalan dosyalar bu süreden eskiyse silinir (süren indirmeye dokunulmaz). */
const ARTAKALAN_SURE_MS = 3600_000;

export function medyaKlasoru(): string {
  const ozel = process.env.MEDYA_KLASORU?.trim();
  if (ozel) return path.resolve(/*turbopackIgnore: true*/ ozel);
  return path.join(path.dirname(path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? "./data/app.db")), "medya");
}

/** Göreli medya yolunun tam yolu; klasörün dışına çıkan yol reddedilir. */
export function medyaTamYolu(goreli: string): string {
  const kok = medyaKlasoru();
  const tam = path.resolve(/*turbopackIgnore: true*/ kok, goreli);
  if (!tam.startsWith(kok + path.sep)) throw new Error("Medya yolu klasörün dışında.");
  return tam;
}

/** Yeni dosyanın göreli yolu: "<tenant>/<yyyy-mm>/<uuid>". */
export function yeniMedyaYolu(tenantId: string, simdi: Date): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tenantId)) throw new Error("Çalışma alanı kimliği geçersiz.");
  return `${tenantId}/${simdi.toISOString().slice(0, 7)}/${crypto.randomUUID()}`;
}

function sessizSil(tam: string): boolean {
  try {
    fs.unlinkSync(tam);
    return true;
  } catch {
    return false;
  }
}

/** Klasördeki dosyalar (göreli yol, "/" ayraçlı) ve son değişiklik zamanları. */
function dosyalar(kok: string): { goreli: string; tam: string; mtimeMs: number }[] {
  const sonuc: { goreli: string; tam: string; mtimeMs: number }[] = [];
  const gez = (klasor: string) => {
    let girdiler: fs.Dirent[];
    try {
      girdiler = fs.readdirSync(klasor, { withFileTypes: true });
    } catch {
      return;
    }
    for (const g of girdiler) {
      const tam = path.join(klasor, g.name);
      if (g.isDirectory()) gez(tam);
      else if (g.isFile()) {
        try {
          sonuc.push({ goreli: path.relative(kok, tam).split(path.sep).join("/"), tam, mtimeMs: fs.statSync(tam).mtimeMs });
        } catch {
          // dosya bu arada silindi
        }
      }
    }
  };
  gez(kok);
  return sonuc;
}

/**
 * Günlük bakım: saklama süresi dolan medyanın dosyası silinir (satır "silindi"); hiçbir indirilmiş medya satırına ait
 * olmayan dosyalar (mesajı ya da kaydı silinmiş, yarıda kalmış indirme) bir saatten eskiyse silinir.
 */
export function medyaBakimi(simdi = new Date()): { suresiDolan: number; artakalan: number } {
  let suresiDolan = 0;
  for (const yol of saklamasiDolanMedyalariIsaretle(simdi)) {
    try {
      if (sessizSil(medyaTamYolu(yol))) suresiDolan++;
    } catch {
      // geçersiz yol: satır zaten "silindi"
    }
  }
  let artakalan = 0;
  const kok = medyaKlasoru();
  // Dosyanın yaşı gerçek saatle ölçülür (simdi saklama süresi içindir): süren indirmenin dosyasına dokunulmaz.
  const gercekSimdi = Date.now();
  for (const d of dosyalar(kok)) {
    if (gercekSimdi - d.mtimeMs < ARTAKALAN_SURE_MS) continue;
    if (!d.goreli.endsWith(".part") && medyaYoluKayitli(d.goreli)) continue;
    if (sessizSil(d.tam)) artakalan++;
  }
  return { suresiDolan, artakalan };
}

/** "bytes=a-b", "bytes=a-", "bytes=-n" → kapalı aralık; başlık yoksa ya da çok parçalıysa null (tüm dosya); karşılanamazsa "gecersiz". */
export function aralikCoz(baslik: string | null, boyut: number): { bas: number; son: number } | null | "gecersiz" {
  if (!baslik) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(baslik.trim());
  if (!m) return baslik.includes(",") ? null : "gecersiz";
  const [, a, b] = m;
  if (a === "" && b === "") return "gecersiz";
  let bas: number;
  let son: number;
  if (a === "") {
    const n = Number(b);
    if (n === 0) return "gecersiz";
    bas = Math.max(0, boyut - n);
    son = boyut - 1;
  } else {
    bas = Number(a);
    son = b === "" ? boyut - 1 : Math.min(Number(b), boyut - 1);
    if (b !== "" && Number(b) < bas) return "gecersiz";
  }
  if (bas >= boyut || !Number.isSafeInteger(bas) || !Number.isSafeInteger(son)) return "gecersiz";
  return { bas, son };
}
