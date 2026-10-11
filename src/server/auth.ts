import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import * as authSchema from "./db/auth-schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  advanced: {
    // Oturum çerezleri her zaman httpOnly'dir (Better Auth varsayılanı) ve Secure olarak işaretlenir.
    // Chrome/Firefox/Safari http://localhost üzerinde Secure çerezleri kabul eder. Yalnızca localhost
    // dışındaki düz HTTP bir geliştirme ortamı için AUTH_INSECURE_COOKIES=true verilebilir.
    useSecureCookies: process.env.AUTH_INSECURE_COOKIES !== "true",
  },
  plugins: [nextCookies()], // son eklenti olmalı
});
