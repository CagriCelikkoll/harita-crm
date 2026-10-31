// Elle deneme (demo) ortamı: npm run demo:hazirla, npm run demo ve npm run demo:isci bunu İLK içe aktarım olarak
// yükler. .env / .env.local dosyalarına dokunulmaz; aşağıdaki değerler yalnızca bu süreçte (ve başlattığı alt
// süreçte) geçerlidir. @next/env süreçte zaten tanımlı değişkenleri ezmediği için .env.local'deki gerçek
// DATABASE_PATH, anahtarlar vb. demo süreçlerinde kullanılmaz.
//
// - Veritabanı her zaman ./data/demo.db (gerçek veritabanı açılmaz).
// - Places ve WhatsApp Cloud API sahte istemcilerle çalışır: ağa çıkılmaz, ücret oluşmaz.
// - Şifreleme / imza / oturum anahtarları demo için sabittir (gerçek anahtarlarla demo verisi şifrelenmez).
//   Gizli değildir; demo.db'ye gerçek kişi verisi girmeyin.
import path from "node:path";

export const DEMO_VERITABANI = path.resolve(process.cwd(), "data", "demo.db");
export const DEMO_ADRESI = "http://localhost:3000";
export const DEMO_ALAN_ADI = "Demo Emlak (Sahte Veri)";

const sabitAnahtar = (tohum: string) => Buffer.alloc(32, tohum).toString("base64");

Object.assign(process.env, {
  DATABASE_PATH: DEMO_VERITABANI,
  PLACES_MOCK: "true",
  WHATSAPP_API_MOCK: "1",
  BETTER_AUTH_URL: DEMO_ADRESI,
  BETTER_AUTH_SECRET: sabitAnahtar("harita-crm-demo-oturum"),
  AUTH_INSECURE_COOKIES: "false",
  ILETI_SIFRELEME_ANAHTARI: sabitAnahtar("harita-crm-demo-sifreleme"),
  ILETI_IMZA_ANAHTARI: sabitAnahtar("harita-crm-demo-imza"),
});
