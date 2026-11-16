import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getIP } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import * as authSchema from "./db/auth-schema";
import { kayitIzni } from "./repo/sistem/uyelik";
import { COK_FAZLA_DENEME_MESAJI, denemeIzinli, sinirliUc } from "./giris-siniri";

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
  // Kaba kuvvet koruması: giriş ve kayıtta IP ve e-posta başına sınır (giris-siniri.ts). Yalnızca HTTP isteği.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const uc = sinirliUc(ctx.path);
      if (!uc || !ctx.request) return;
      const eposta = (ctx.body as { email?: unknown } | undefined)?.email;
      if (!denemeIzinli(uc, getIP(ctx.request, ctx.context.options), eposta)) {
        throw new APIError("TOO_MANY_REQUESTS", { message: COK_FAZLA_DENEME_MESAJI, code: "COK_FAZLA_DENEME" });
      }
    }),
  },
  advanced: {
    // Oturum çerezleri her zaman httpOnly'dir (Better Auth varsayılanı) ve Secure olarak işaretlenir.
    // Chrome/Firefox/Safari http://localhost üzerinde Secure çerezleri kabul eder. Yalnızca localhost
    // dışındaki düz HTTP bir geliştirme ortamı için AUTH_INSECURE_COOKIES=true verilebilir.
    useSecureCookies: process.env.AUTH_INSECURE_COOKIES !== "true",
  },
  plugins: [nextCookies()], // son eklenti olmalı
});
