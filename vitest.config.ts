import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" Next.js dışında hata fırlatır; testlerde boş modülle değiştirilir.
      "server-only": path.resolve(__dirname, "tests/yardimci/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    pool: "forks",
    // Varsayılan 5 sn, makine yüklüyken (paralel işçiler, alt süreç başlatan betik testleri, ilk dönüştürme) normalde
    // 1-2 sn süren testleri ara sıra düşürüyordu. Takılan test yine yakalanır; daha uzun sınır isteyen testler kendi
    // sınırını verir.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["tests/yardimci/kurulum.ts"],
  },
});
