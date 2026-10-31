// Uygulamayı demo ortamında başlatır: ./data/demo.db, PLACES_MOCK=true, WHATSAPP_API_MOCK=1 (demo-ortam.ts).
// .env.local'deki gerçek ayarlar değiştirilmez; yalnızca bu süreç ve başlattığı `next dev` demo değerlerini görür.
// Kullanım: npm run demo:hazirla (bir kez) → npm run demo → http://localhost:3000
// Normal `npm run dev` aynı anda çalışmamalıdır (aynı port ve .next klasörü).
import { DEMO_ADRESI, DEMO_VERITABANI } from "./demo-ortam";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

if (!fs.existsSync(DEMO_VERITABANI)) {
  console.error(`Demo veritabanı yok (${DEMO_VERITABANI}). Önce: npm run demo:hazirla`);
  process.exit(1);
}

console.log(`[demo] ${DEMO_VERITABANI} · Places ve WhatsApp sahte istemcilerle · ${DEMO_ADRESI}`);
const next = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "dev", "--port", "3000"], {
  stdio: "inherit",
  env: process.env,
});
next.on("exit", (kod) => process.exit(kod ?? 0));
for (const sinyal of ["SIGINT", "SIGTERM"] as const) process.on(sinyal, () => next.kill(sinyal));
