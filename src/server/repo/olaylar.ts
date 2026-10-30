import { and, desc, eq } from "drizzle-orm";
import type { OlayTuru } from "@/lib/sabitler";
import { db } from "../db";
import { leadEvents, leads, user, type KayitOlayi } from "../db/schema";
import type { TenantContext } from "./baglam";

export type { KayitOlayi };

export function olaylariListele(ctx: TenantContext, leadId: string) {
  return db
    .select({
      id: leadEvents.id,
      tur: leadEvents.tur,
      aciklama: leadEvents.aciklama,
      sistem: leadEvents.sistem,
      tarih: leadEvents.tarih,
      kullaniciId: leadEvents.kullaniciId,
      kullaniciAdi: user.name,
    })
    .from(leadEvents)
    .leftJoin(user, eq(user.id, leadEvents.kullaniciId))
    .where(and(eq(leadEvents.tenantId, ctx.tenantId), eq(leadEvents.leadId, leadId)))
    .orderBy(desc(leadEvents.tarih))
    .all();
}

export function olayGetir(ctx: TenantContext, id: string): KayitOlayi | null {
  return (
    db
      .select()
      .from(leadEvents)
      .where(and(eq(leadEvents.id, id), eq(leadEvents.tenantId, ctx.tenantId)))
      .get() ?? null
  );
}

/**
 * Kayda olay ekler. Kayıt bu kiracıya ait değilse null döner. Ayrıca lead_events'teki
 * (tenant_id, lead_id) bileşik yabancı anahtarı, başka kiracının kaydına bağlanmayı
 * veritabanı seviyesinde de engeller.
 */
export function olayEkle(ctx: TenantContext, leadId: string, tur: OlayTuru, aciklama?: string): KayitOlayi | null {
  return db.transaction((tx) => {
    const kayit = tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId)))
      .get();
    if (!kayit) return null;
    tx.update(leads)
      .set({ guncellemeTarihi: new Date() })
      .where(and(eq(leads.id, kayit.id), eq(leads.tenantId, ctx.tenantId)))
      .run();
    return tx
      .insert(leadEvents)
      .values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        leadId: kayit.id,
        tur,
        aciklama: aciklama?.trim() || null,
        kullaniciId: ctx.userId,
      })
      .returning()
      .get();
  });
}

const kendiNotum = (ctx: TenantContext, id: string) =>
  and(
    eq(leadEvents.id, id),
    eq(leadEvents.tenantId, ctx.tenantId),
    eq(leadEvents.tur, "not"),
    eq(leadEvents.sistem, false),
    eq(leadEvents.kullaniciId, ctx.userId),
  );

/** Kullanıcı yalnızca kendi yazdığı "not" olayını düzenleyebilir; diğer olaylar değişmez kayıttır. */
export function notOlayiGuncelle(ctx: TenantContext, id: string, aciklama: string): KayitOlayi | null {
  return (
    db
      .update(leadEvents)
      .set({ aciklama: aciklama.trim() })
      .where(kendiNotum(ctx, id))
      .returning()
      .get() ?? null
  );
}

export function notOlayiSil(ctx: TenantContext, id: string): boolean {
  return Boolean(db.delete(leadEvents).where(kendiNotum(ctx, id)).returning({ id: leadEvents.id }).get());
}

/** Sistem olayı (kullanıcısız; ör. WhatsApp webhook'u). Kayıt bu kiracının değilse null. */
export function sistemOlayiEkle(ctx: TenantContext, leadId: string, tur: OlayTuru, aciklama: string): KayitOlayi | null {
  return db.transaction((tx) => {
    const kayit = tx
      .update(leads)
      .set({ guncellemeTarihi: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId)))
      .returning({ id: leads.id })
      .get();
    if (!kayit) return null;
    return tx
      .insert(leadEvents)
      .values({ id: crypto.randomUUID(), tenantId: ctx.tenantId, leadId: kayit.id, tur, aciklama, kullaniciId: null, sistem: true })
      .returning()
      .get();
  });
}
