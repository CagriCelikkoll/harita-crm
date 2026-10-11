import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { usageCounters } from "../db/schema";
import type { TenantContext } from "./baglam";

export const ayAnahtari = (tarih = new Date()) => tarih.toISOString().slice(0, 7); // "YYYY-MM" (UTC)

/** Places isteklerini aylık sayaca işler (maliyet takibi). */
export function placesIstegiSay(ctx: TenantContext, adet = 1) {
  db.insert(usageCounters)
    .values({ tenantId: ctx.tenantId, ay: ayAnahtari(), placesIstekSayisi: adet })
    .onConflictDoUpdate({
      target: [usageCounters.tenantId, usageCounters.ay],
      set: { placesIstekSayisi: sql`${usageCounters.placesIstekSayisi} + ${adet}` },
    })
    .run();
}

export function aylikPlacesIstegi(ctx: TenantContext, ay = ayAnahtari()): number {
  return (
    db
      .select({ n: usageCounters.placesIstekSayisi })
      .from(usageCounters)
      .where(and(eq(usageCounters.tenantId, ctx.tenantId), eq(usageCounters.ay, ay)))
      .get()?.n ?? 0
  );
}
