import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tüm sayfalar oturuma bağlı ve her istekte canlı veri (Places) gösterir; bu yüzden
  // Cache Components / Partial Prefetching kapalı, sayfalar klasik dinamik render ile çalışır.
  // Places içeriği hiçbir katmanda önbelleğe alınmamalıdır.
  serverExternalPackages: ["better-sqlite3", "exceljs"],
  poweredByHeader: false,
  // Geliştirme simgesi sol alttaki "Çıkış yap"ın üstüne biniyordu; menü solda olduğu için sağ alta alınır.
  devIndicators: { position: "bottom-right" },
  // Eski adresler (yeni düzen): İletişim → Kampanyalar. Geçici (307); sorgu parametreleri hedefe aynen geçer.
  async redirects() {
    return [
      { source: "/iletisim", destination: "/kampanyalar", permanent: false },
      { source: "/iletisim/kampanya/:id", destination: "/kampanyalar/:id", permanent: false },
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
