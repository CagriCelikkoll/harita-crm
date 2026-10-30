import { and, desc, eq, min, sql } from "drizzle-orm";
import { YARIM_KALDI_MESAJI, type MerkezKaynagi } from "@/lib/sabitler";
import { db } from "../db";
import { scans, type Tarama } from "../db/schema";
import type { TenantContext } from "./baglam";
import { yarimKalanKosulu } from "./sistem/tarama-kosulu";

export type { Tarama };

export function taramaOlustur(
  ctx: TenantContext,
  girdi: {
    merkezLat: number;
    merkezLng: number;
    yaricapM: number;
    kategori: string;
    merkezKaynagi?: MerkezKaynagi;
    adresMetni?: string | null;
  },
): Tarama {
  const kaynak = girdi.merkezKaynagi ?? "harita";
  const simdi = new Date();
  // "Tekrar kullan" (ya da son taramanın merkeziyle yeni tarama): aynı merkez bu kiracının eski bir taramasında hâlâ
  // duruyorsa 30 günlük süre en eskisinden devralınır; kopyalamak süreyi sıfırlamaz.
  const eski = db
    .select({ t: min(sql<number>`coalesce(${scans.merkezTarihi}, ${scans.olusturmaTarihi})`) })
    .from(scans)
    .where(and(eq(scans.tenantId, ctx.tenantId), eq(scans.merkezLat, girdi.merkezLat), eq(scans.merkezLng, girdi.merkezLng)))
    .get()?.t;
  return db
    .insert(scans)
    .values({
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId, // her zaman bağlamdan
      olusturan: ctx.userId,
      merkezKaynagi: kaynak,
      merkezLat: girdi.merkezLat,
      merkezLng: girdi.merkezLng,
      merkezTarihi: eski != null && Number(eski) < simdi.getTime() ? new Date(Number(eski)) : simdi,
      adresMetni: kaynak === "adres" ? (girdi.adresMetni?.trim() || null) : null,
      yaricapM: girdi.yaricapM,
      kategori: girdi.kategori,
      durum: "kuyrukta",
    })
    .returning()
    .get();
}

/**
 * Bu kiracının yarıda kalmış taramalarını "hata" yapar: 10 dakikadan uzun süredir "calisiyor"
 * (süreç kapandı) veya "kuyrukta" (çalıştırma isteği gelmedi) olanlar. Tarama listesi yüklenmeden
 * önce çağrılır. Etkilenen sayı döner.
 */
export function yarimKalanTaramalariKapat(ctx: TenantContext, simdi = new Date()): number {
  return db
    .update(scans)
    .set({ durum: "hata", hataMesaji: YARIM_KALDI_MESAJI, tamamlanmaTarihi: simdi })
    .where(and(eq(scans.tenantId, ctx.tenantId), yarimKalanKosulu(simdi)))
    .returning({ id: scans.id })
    .all().length;
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
      .set({ durum: "calisiyor", baslamaTarihi: new Date() })
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
