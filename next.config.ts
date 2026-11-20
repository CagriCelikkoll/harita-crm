import type { NextConfig } from "next";
import { tunelHostDeseni } from "./src/lib/tunel";

const nextConfig: NextConfig = {
  // Tüm sayfalar oturuma bağlı ve her istekte canlı veri (Places) gösterir; bu yüzden
  // Cache Components / Partial Prefetching kapalı, sayfalar klasik dinamik render ile çalışır.
  // Places içeriği hiçbir katmanda önbelleğe alınmamalıdır.
  serverExternalPackages: ["better-sqlite3", "exceljs", "web-push"],
  poweredByHeader: false,
  // Geliştirme simgesi sol alttaki "Çıkış yap"ın üstüne biniyordu; menü solda olduğu için sağ alta alınır.
  devIndicators: { position: "bottom-right" },
  // Eski adresler (yeni düzen): İletişim → Kampanyalar. Geçici (307); sorgu parametreleri hedefe aynen geçer.
  // Tünelden gelen isteğe uygulanmaz (yönlendirmeler proxy'den önce çalışır; proxy tüneli 404 ile keser).
  async redirects() {
    const tunelDisi = [{ type: "host" as const, value: tunelHostDeseni({ genelAdres: process.env.GENEL_ADRES, uygulamaAdresi: process.env.BETTER_AUTH_URL }) }];
    return [
      { source: "/iletisim", destination: "/kampanyalar", permanent: false, missing: tunelDisi },
      { source: "/iletisim/kampanya/:id", destination: "/kampanyalar/:id", permanent: false, missing: tunelDisi },
    ];
  },
  // Servis çalışanı (gelen kutusu bildirimleri): her açılışta güncel sürüm alınsın; yalnızca kendi kaynağından betik.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
