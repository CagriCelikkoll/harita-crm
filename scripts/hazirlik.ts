// Ofis günü (WhatsApp gerçek denemesi) öncesi tek komutla hazırlık denetimi. Her madde ✓/✗; ✗ için Türkçe çözüm.
// Hiçbir gizli değeri yazdırmaz. Veritabanını salt okunur açar, hiçbir şeyi değiştirmez. Tek dış istek: Places
// anahtarının ücretsiz denemesi (npm run places:dogrula ile aynı; kotadan birim düşmez). Meta'ya istek atılmaz.
//
// Kullanım: npm run hazirlik                    ortam, veritabanı, Places, cloudflared, 3000 portu, WhatsApp, işçi kilidi
//           npm run hazirlik -- --tam           + typecheck ve testler (birkaç dakika sürer)
//           npm run hazirlik -- <tenant-slug>   WhatsApp denetimi yalnızca bu çalışma alanı için
// Çıkış kodu: hepsi ✓ ise 0, en az bir ✗ varsa 1.
import "./ortam";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { loadEnvConfig } from "@next/env";
import { anahtariDogrula } from "../src/server/places/istemci";
import {
  cloudflaredKontrolu,
  isciKilidiKontrolu,
  migrasyonKontrolu,
  ortamKontrolleri,
  placesKontrolu,
  portKontrolu,
  whatsappKontrolleri,
  type Sonuc,
} from "./hazirlik-kontrolleri";
import { saltOkunurAc, veritabaniYolu } from "./salt-okunur-db";

const argumanlar = process.argv.slice(2);
const tam = argumanlar.includes("--tam");
const slug = argumanlar.find((a) => !a.startsWith("--"));
let hataSayisi = 0;

function yaz(grup: string | null, sonuclar: Sonuc[]) {
  if (grup) console.log(`\n${grup}`);
  for (const s of sonuclar) {
    console.log(`  ${s.tamam ? "✓" : "✗"} ${s.baslik}`);
    if (!s.tamam) {
      hataSayisi++;
      if (s.cozum) console.log(`      Çözüm: ${s.cozum}`);
    }
  }
}

/** --tam: npm betiği çalıştırır; env dosyalarından yüklenen değişkenler alt sürece geçmez (terminalden çalıştırmakla aynı). */
function komut(ad: string, betik: string, cozum: string): Sonuc {
  const { loadedEnvFiles } = loadEnvConfig(process.cwd(), false, { info: () => {}, error: () => {} });
  const env = { ...process.env };
  for (const dosya of loadedEnvFiles) for (const k of Object.keys(dosya.env)) delete env[k];
  console.log(`  … ${ad} çalışıyor`);
  const s = spawnSync("npm", ["run", betik], { encoding: "utf8", shell: true, env, maxBuffer: 64 * 1024 * 1024 });
  if (s.status === 0) return { tamam: true, baslik: `${ad} geçti` };
  const son = `${s.stdout ?? ""}${s.stderr ?? ""}`.trim().split(/\r?\n/).slice(-15).join("\n        ");
  return { tamam: false, baslik: `${ad} geçmedi`, cozum: `${cozum}\n        ${son}` };
}

async function main() {
  console.log(`Ofis günü hazırlık denetimi (veritabanı: ${veritabaniYolu()})`);

  yaz("Ortam değişkenleri", ortamKontrolleri(process.env, fs.existsSync(".env.local")));

  let sqlite: ReturnType<typeof saltOkunurAc> | null = null;
  try {
    sqlite = saltOkunurAc();
  } catch (e) {
    yaz("Veritabanı", [
      {
        tamam: false,
        baslik: `Veritabanı açılamadı: ${(e as Error).message}`,
        cozum: "DATABASE_PATH doğru mu bakın; dosya yoksa npm run db:migrate ile oluşturun.",
      },
    ]);
  }
  if (sqlite) {
    yaz("Veritabanı", [{ tamam: true, baslik: "Veritabanı açılıyor" }, migrasyonKontrolu(sqlite)]);
    try {
      yaz("WhatsApp bağlantısı", whatsappKontrolleri(sqlite, slug));
      yaz("Gönderim işçisi", [isciKilidiKontrolu(sqlite, Math.max(10, Number(process.env.ISCI_KILIT_SN ?? 120)) * 1000)]);
    } catch (e) {
      // Migration'lar eksikse tablolar ya da sütunlar olmayabilir.
      yaz("WhatsApp bağlantısı ve işçi kilidi", [
        { tamam: false, baslik: `Okunamadı: ${(e as Error).message}`, cozum: "Önce npm run db:migrate çalıştırın." },
      ]);
    } finally {
      sqlite.close();
    }
  }

  yaz("Google Places", [await placesKontrolu(Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim()), () => anahtariDogrula())]);
  yaz("Tünel ve port", [cloudflaredKontrolu(), await portKontrolu(3000)]);

  if (tam) {
    console.log("\nKod denetimi (--tam)");
    const cozum = "Hatayı geliştiriciye iletin; ofis gününde kodu değiştirmeyin.";
    yaz(null, [komut("typecheck", "typecheck", cozum)]);
    yaz(null, [komut("Testler", "test", cozum)]);
  }

  console.log(
    hataSayisi === 0
      ? "\nSonuç: her şey hazır ✓"
      : `\nSonuç: ${hataSayisi} madde ✗. Çözümleri uygulayıp npm run hazirlik'i yeniden çalıştırın.`,
  );
  process.exitCode = hataSayisi === 0 ? 0 : 1;
}

main().catch((e: unknown) => {
  console.error(`Beklenmeyen hata: ${(e as Error).message}`);
  process.exitCode = 1;
});
