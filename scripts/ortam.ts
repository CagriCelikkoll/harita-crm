// Komut satırı betikleri için ortam değişkenleri: Next.js sunucusuyla aynı dosyalar (.env, .env.production,
// .env.local) aynı öncelikle yüklenir. Süreçte zaten tanımlı olan değişkenler (systemd, Docker vb.) ezilmez.
// Her betiğin İLK içe aktarımı olmalıdır (veritabanı modülü DATABASE_PATH'i yüklenirken okur).
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
