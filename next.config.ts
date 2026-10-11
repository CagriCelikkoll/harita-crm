import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tüm sayfalar oturuma bağlı ve her istekte canlı veri (Places) gösterir; bu yüzden
  // Cache Components / Partial Prefetching kapalı, sayfalar klasik dinamik render ile çalışır.
  // Places içeriği hiçbir katmanda önbelleğe alınmamalıdır.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
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
