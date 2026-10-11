import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, isNull } from "drizzle-orm";
import type { Rol } from "@/lib/sabitler";
import { db } from "../db";
import { invitations, memberships, tenants, user } from "../db/schema";
import { type TenantContext, YetkiHatasi, yoneticiOlmali } from "./baglam";

export const DAVET_GECERLILIK_GUN = 7;

export function calismaAlaniGetir(ctx: TenantContext) {
  return db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).get() ?? null;
}

export function calismaAlaniGuncelle(ctx: TenantContext, alanlar: { ad?: string; veriSaklamaGun?: number | null }) {
  yoneticiOlmali(ctx);
  return db.update(tenants).set(alanlar).where(eq(tenants.id, ctx.tenantId)).returning().get() ?? null;
}

export function uyeleriListele(ctx: TenantContext) {
  return db
    .select({ userId: memberships.userId, rol: memberships.rol, ad: user.name, eposta: user.email })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(eq(memberships.tenantId, ctx.tenantId))
    .orderBy(asc(user.name))
    .all();
}

/** Üyeyi çalışma alanından çıkarır. Son yönetici çıkarılamaz. Üye bu kiracıda değilse false. */
export function uyeCikar(ctx: TenantContext, userId: string): boolean {
  yoneticiOlmali(ctx);
  return db.transaction((tx) => {
    const uye = tx
      .select({ rol: memberships.rol })
      .from(memberships)
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, userId)))
      .get();
    if (!uye) return false;
    if (uye.rol === "yonetici") {
      const yoneticiSayisi =
        tx
          .select({ n: count() })
          .from(memberships)
          .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.rol, "yonetici")))
          .get()?.n ?? 0;
      if (yoneticiSayisi <= 1) throw new YetkiHatasi("Çalışma alanının son yöneticisi çıkarılamaz.");
    }
    tx.delete(memberships)
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, userId)))
      .run();
    return true;
  });
}

export function davetOlustur(ctx: TenantContext, girdi: { eposta: string; rol: Rol }) {
  yoneticiOlmali(ctx);
  return db
    .insert(invitations)
    .values({
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId,
      eposta: girdi.eposta.trim().toLowerCase(),
      rol: girdi.rol,
      token: randomBytes(32).toString("base64url"),
      davetEden: ctx.userId,
      sonGecerlilik: new Date(Date.now() + DAVET_GECERLILIK_GUN * 24 * 60 * 60 * 1000),
    })
    .returning()
    .get();
}

/** Bekleyen (kabul edilmemiş, süresi dolmamış) davetler. */
export function davetleriListele(ctx: TenantContext) {
  return db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.tenantId, ctx.tenantId),
        isNull(invitations.kabulTarihi),
        gt(invitations.sonGecerlilik, new Date()),
      ),
    )
    .orderBy(desc(invitations.olusturmaTarihi))
    .all();
}

export function davetIptal(ctx: TenantContext, id: string): boolean {
  yoneticiOlmali(ctx);
  return Boolean(
    db
      .delete(invitations)
      .where(and(eq(invitations.id, id), eq(invitations.tenantId, ctx.tenantId), isNull(invitations.kabulTarihi)))
      .returning({ id: invitations.id })
      .get(),
  );
}
