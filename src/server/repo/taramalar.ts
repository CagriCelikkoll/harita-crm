import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { scans, type Tarama } from "../db/schema";
import type { TenantContext } from "./baglam";

export type { Tarama };

export function taramaOlustur(
  ctx: TenantContext,
  girdi: { merkezLat: number; merkezLng: number; yaricapM: number; kategori: string },
): Tarama {
  return db
    .insert(scans)
    .values({
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId, // her zaman bağlamdan
      olusturan: ctx.userId,
      merkezLat: girdi.merkezLat,
      merkezLng: girdi.merkezLng,
      yaricapM: girdi.yaricapM,
      kategori: girdi.kategori,
      durum: "kuyrukta",
    })
    .returning()
    .get();
}

export function taramalariListele(ctx: TenantContext, limit = 20): Tarama[] {
  return db
    .select()
    .from(scans)
    .where(eq(scans.tenantId, ctx.tenantId))
    .orderBy(desc(scans.olusturmaTarihi))
    .limit(limit)
    .all();
}

export function taramaGetir(ctx: TenantContext, id: string): Tarama | null {
  return db.select().from(scans).where(and(eq(scans.id, id), eq(scans.tenantId, ctx.tenantId))).get() ?? null;
}

/**
 * Kuyruktaki taramayı atomik olarak "calisiyor" durumuna alır. Tarama bu kiracıya ait değilse
 * veya zaten başlatılmışsa null döner (aynı taramanın iki kez çalışmasını önler).
 */
export function taramaBaslat(ctx: TenantContext, id: string): Tarama | null {
  return (
    db
      .update(scans)
      .set({ durum: "calisiyor" })
      .where(and(eq(scans.id, id), eq(scans.tenantId, ctx.tenantId), eq(scans.durum, "kuyrukta")))
      .returning()
      .get() ?? null
  );
}

export type TaramaGuncellemesi = Partial<
  Pick<Tarama, "durum" | "bulunanSayisi" | "istekSayisi" | "kapsamTamam" | "hataMesaji" | "tamamlanmaTarihi">
>;

export function taramaGuncelle(ctx: TenantContext, id: string, alanlar: TaramaGuncellemesi): Tarama | null {
  return (
    db
      .update(scans)
      .set(alanlar)
      .where(and(eq(scans.id, id), eq(scans.tenantId, ctx.tenantId)))
      .returning()
      .get() ?? null
  );
}

/** Tarama geçmişinden siler; bulunan kayıtlar kalır (scan_id null olur). */
export function taramaSil(ctx: TenantContext, id: string): boolean {
  const silinen = db
    .delete(scans)
    .where(and(eq(scans.id, id), eq(scans.tenantId, ctx.tenantId)))
    .returning({ id: scans.id })
    .get();
  return Boolean(silinen);
}
