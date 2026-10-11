import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Kiracı izolasyonu: veritabanına yalnızca src/server/repo/ altındaki depo fonksiyonları erişir.
// Route handler, server action, sayfa, bileşen ve servisler db'yi ya da sürücüleri içe aktaramaz.
const VERITABANI_YASAK = {
  patterns: [
    {
      group: ["@/server/db", "@/server/db/*", "**/server/db", "**/server/db/*", "**/db", "**/db/*"],
      message: "Veritabanına doğrudan erişilemez. src/server/repo/ altındaki, TenantContext alan depo fonksiyonlarını kullanın.",
    },
    {
      group: ["drizzle-orm", "drizzle-orm/*", "better-sqlite3"],
      message: "Sorgular yalnızca src/server/repo/ içinde yazılır.",
    },
    {
      group: ["@/server/repo/baglam"],
      importNames: ["_baglamDamgala"],
      message: "TenantContext yalnızca oturumdan (src/server/oturum.ts) üretilir.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", VERITABANI_YASAK] },
  },
  {
    // Veritabanına erişmesine izin verilen tek yerler.
    files: ["src/server/repo/**", "src/server/db/**", "src/server/auth.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**"]),
]);

export default eslintConfig;
