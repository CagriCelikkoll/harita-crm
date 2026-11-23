// Çalışma alanının denetim kaydı (denetim_kayitlari): ayar değişikliklerinin kim / ne zaman / ne. Satırlar ayarı
// değiştiren repo fonksiyonunun işleminde eklenir (ör. ileti-ayarlari.iysKontroluDegistir); burada yalnızca okunur.
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { denetimKayitlari, type DenetimKaydi } from "../db/schema";
import type { TenantContext } from "./baglam";

export type { DenetimKaydi };

/** Bu çalışma alanının denetim kayıtları, yeniden eskiye; olay verilirse yalnızca o olay. */
export function denetimKayitlariListele(ctx: TenantContext, f: { olay?: string; limit?: number } = {}): DenetimKaydi[] {
  return db
    .select()
    .from(denetimKayitlari)
    .where(and(eq(denetimKayitlari.tenantId, ctx.tenantId), f.olay ? eq(denetimKayitlari.olay, f.olay) : undefined))
    .orderBy(desc(denetimKayitlari.tarih), desc(denetimKayitlari.id))
    .limit(Math.min(Math.max(1, f.limit ?? 50), 200))
    .all();
}
