import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import * as authSchema from "./db/auth-schema";
import { kayitIzni } from "./repo/sistem/uyelik";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  // KAYIT_KIPI=davetle (canlı): yalnızca ilk yönetici ve geçerli daveti olan e-postalar kayıt olur (repo/sistem/uyelik.ts).
  databaseHooks: {
    user: {
      create: {
        before: async (yeni) => {
          const karar = kayitIzni(yeni.email);
          if (!karar.izinli) throw new APIError("FORBIDDEN", { message: karar.mesaj, code: "KAYIT_KAPALI" });
        },
      },
    },
  },
  advanced: {
    // Oturum çerezleri her zaman httpOnly'dir (Better Auth varsayılanı) ve Secure olarak işaretlenir.
    // Chrome/Firefox/Safari http://localhost üzerinde Secure çerezleri kabul eder. Yalnızca localhost
    // dışındaki düz HTTP bir geliştirme ortamı için AUTH_INSECURE_COOKIES=true verilebilir.
    useSecureCookies: process.env.AUTH_INSECURE_COOKIES !== "true",
  },
  plugins: [nextCookies()], // son eklenti olmalı
});
