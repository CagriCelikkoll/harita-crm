// WABA şablonları: Meta'dan senkronize edilen kopya. Uygulamada şablon oluşturulmaz.
import { and, asc, eq, ne, notInArray } from "drizzle-orm";
import { sablonCozumle } from "@/lib/whatsapp-api";
import { db } from "../db";
import { whatsappBaglantilari, whatsappSablonlari, type WhatsappSablonu } from "../db/schema";
import { yoneticiOlmali, type TenantContext } from "./baglam";

export type { WhatsappSablonu };

export function sablonlariListele(ctx: TenantContext): WhatsappSablonu[] {
  return db
    .select()
    .from(whatsappSablonlari)
    .where(eq(whatsappSablonlari.tenantId, ctx.tenantId))
    .orderBy(asc(whatsappSablonlari.ad), asc(whatsappSablonlari.dil))
    .all();
}

export function sablonGetir(ctx: TenantContext, id: string): WhatsappSablonu | null {
  return (
    db
      .select()
      .from(whatsappSablonlari)
      .where(and(eq(whatsappSablonlari.id, id), eq(whatsappSablonlari.tenantId, ctx.tenantId)))
      .get() ?? null
  );
}

export type SenkronSablonu = Omit<WhatsappSablonu, "id" | "tenantId" | "senkronTarihi">;

/**
 * Meta'dan gelen listeyi uygular: (ad, dil) ile ekle/güncelle; listede olmayanlar "SILINDI" olur (kampanya
 * geçmişi bozulmasın diye satır silinmez). Senkron tarihi bağlantıya yazılır.
 */
export function sablonlariSenkronla(ctx: TenantContext, sablonlar: SenkronSablonu[], simdi = new Date()) {
  yoneticiOlmali(ctx);
  return db.transaction((tx) => {
    let eklenen = 0;
    let guncellenen = 0;
    const idler: string[] = [];
    for (const s of sablonlar) {
      const eski = tx
        .select({ id: whatsappSablonlari.id })
        .from(whatsappSablonlari)
        .where(and(eq(whatsappSablonlari.tenantId, ctx.tenantId), eq(whatsappSablonlari.ad, s.ad), eq(whatsappSablonlari.dil, s.dil)))
        .get();
      if (eski) {
        tx.update(whatsappSablonlari).set({ ...s, senkronTarihi: simdi }).where(eq(whatsappSablonlari.id, eski.id)).run();
        idler.push(eski.id);
        guncellenen++;
      } else {
        const id = crypto.randomUUID();
        tx.insert(whatsappSablonlari).values({ id, tenantId: ctx.tenantId, ...s, senkronTarihi: simdi }).run();
        idler.push(id);
        eklenen++;
      }
    }
    const kosul = idler.length
      ? and(eq(whatsappSablonlari.tenantId, ctx.tenantId), notInArray(whatsappSablonlari.id, idler))
      : eq(whatsappSablonlari.tenantId, ctx.tenantId);
    const silinen = tx
      .update(whatsappSablonlari)
      .set({ durum: "SILINDI", destekNedeni: "Şablon Meta'da yok (silinmiş)", senkronTarihi: simdi })
      .where(and(kosul, ne(whatsappSablonlari.durum, "SILINDI")))
      .returning({ id: whatsappSablonlari.id })
      .all().length;
    tx.update(whatsappBaglantilari)
      .set({ sablonSenkronTarihi: simdi })
      .where(eq(whatsappBaglantilari.tenantId, ctx.tenantId))
      .run();
    return { eklenen, guncellenen, silinen };
  });
}

/** Şablon durum bildirimi (webhook): durum değişir, kampanyada kullanılabilirlik yeniden hesaplanır. */
export function sablonDurumuYaz(ctx: TenantContext, s: { metaId: string | null; ad: string; dil: string; durum: string }): boolean {
  const kosul = s.metaId
    ? and(eq(whatsappSablonlari.tenantId, ctx.tenantId), eq(whatsappSablonlari.metaId, s.metaId))
    : and(eq(whatsappSablonlari.tenantId, ctx.tenantId), eq(whatsappSablonlari.ad, s.ad), eq(whatsappSablonlari.dil, s.dil));
  const eski = db.select().from(whatsappSablonlari).where(kosul).get();
  if (!eski) return false;
  const c = sablonCozumle({ kategori: eski.kategori, durum: s.durum, bilesenler: eski.bilesenler });
  db.update(whatsappSablonlari)
    .set({ durum: s.durum, destekNedeni: c.destekNedeni, senkronTarihi: new Date() })
    .where(eq(whatsappSablonlari.id, eski.id))
    .run();
  return true;
}
