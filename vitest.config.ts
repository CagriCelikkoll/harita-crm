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
    setupFiles: ["tests/yardimci/kurulum.ts"],
  },
});
