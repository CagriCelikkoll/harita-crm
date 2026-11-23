// WABA şablonları: Meta'dan senkronize edilen kopya. Uygulamada şablon oluşturulmaz. Şablon WABA'ya aittir: aynı
// WABA'daki numaralar aynı şablonları kullanır; başka WABA'daki numara bu şablonla gönderemez (servis denetler).
import { and, asc, eq, exists, ne, not, notInArray } from "drizzle-orm";
import { sablonCozumle } from "@/lib/whatsapp-api";
import { db } from "../db";
import { kampanyalar, whatsappBaglantilari, whatsappSablonlari, type WhatsappSablonu } from "../db/schema";
import { yoneticiOlmali, type TenantContext } from "./baglam";

export type { WhatsappSablonu };

/** Çalışma alanının şablonları; wabaId verilirse yalnızca o WABA'nınkiler. */
export function sablonlariListele(ctx: TenantContext, wabaId?: string): WhatsappSablonu[] {
  return db
    .select()
    .from(whatsappSablonlari)
    .where(and(eq(whatsappSablonlari.tenantId, ctx.tenantId), wabaId !== undefined ? eq(whatsappSablonlari.wabaId, wabaId) : undefined))
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

export type SenkronSablonu = Omit<WhatsappSablonu, "id" | "tenantId" | "wabaId" | "senkronTarihi">;

/**
 * Bir WABA için Meta'dan gelen listeyi uygular: (ad, dil) ile ekle/güncelle. Bu WABA'da kayıtlı olup Meta listesinde
 * olmayanlar: hiçbir kampanyada kullanılmadıysa SİLİNİR (yanlış WABA'ya düşmüş ya da Meta'da silinmiş kayıt bir sonraki
 * yenilemede temizlenir); kullanıldıysa kampanya geçmişi bozulmasın diye "SILINDI" kalır (listelerde gösterilmez).
 * Başka WABA'nın ve başka çalışma alanının şablonlarına dokunulmaz. Senkron tarihi bu WABA'daki tüm numaralara yazılır.
 */
export function sablonlariSenkronla(ctx: TenantContext, wabaId: string, sablonlar: SenkronSablonu[], simdi = new Date()) {
  yoneticiOlmali(ctx);
  const buWaba = and(eq(whatsappSablonlari.tenantId, ctx.tenantId), eq(whatsappSablonlari.wabaId, wabaId));
  return db.transaction((tx) => {
    let eklenen = 0;
    let guncellenen = 0;
    const idler: string[] = [];
    for (const s of sablonlar) {
      const eski = tx
        .select({ id: whatsappSablonlari.id })
        .from(whatsappSablonlari)
        .where(and(buWaba, eq(whatsappSablonlari.ad, s.ad), eq(whatsappSablonlari.dil, s.dil)))
        .get();
      if (eski) {
        tx.update(whatsappSablonlari).set({ ...s, senkronTarihi: simdi }).where(eq(whatsappSablonlari.id, eski.id)).run();
        idler.push(eski.id);
        guncellenen++;
      } else {
        const id = crypto.randomUUID();
        tx.insert(whatsappSablonlari).values({ id, tenantId: ctx.tenantId, wabaId, ...s, senkronTarihi: simdi }).run();
        idler.push(id);
        eklenen++;
      }
    }
    const kosul = idler.length ? and(buWaba, notInArray(whatsappSablonlari.id, idler)) : buWaba;
    const kullanildi = exists(
      tx
        .select({ id: kampanyalar.id })
        .from(kampanyalar)
        .where(and(eq(kampanyalar.tenantId, whatsappSablonlari.tenantId), eq(kampanyalar.sablonId, whatsappSablonlari.id))),
    );
    const kaldirilan = tx.delete(whatsappSablonlari).where(and(kosul, not(kullanildi))).returning({ id: whatsappSablonlari.id }).all().length;
    const silinen =
      kaldirilan +
      tx
        .update(whatsappSablonlari)
        .set({ durum: "SILINDI", destekNedeni: "Şablon Meta'da yok (silinmiş)", senkronTarihi: simdi })
        .where(and(kosul, kullanildi, ne(whatsappSablonlari.durum, "SILINDI")))
        .returning({ id: whatsappSablonlari.id })
        .all().length;
    tx.update(whatsappBaglantilari)
      .set({ sablonSenkronTarihi: simdi })
      .where(and(eq(whatsappBaglantilari.tenantId, ctx.tenantId), eq(whatsappBaglantilari.wabaId, wabaId)))
      .run();
    return { eklenen, guncellenen, silinen };
  });
}

/**
 * Şablon durum bildirimi (webhook): durum değişir, kampanyada kullanılabilirlik yeniden hesaplanır. Yalnızca
 * bildirimin geldiği WABA'nın şablonu.
 */
export function sablonDurumuYaz(
  ctx: TenantContext,
  wabaId: string,
  s: { metaId: string | null; ad: string; dil: string; durum: string },
): boolean {
  const buWaba = and(eq(whatsappSablonlari.tenantId, ctx.tenantId), eq(whatsappSablonlari.wabaId, wabaId));
  const kosul = s.metaId
    ? and(buWaba, eq(whatsappSablonlari.metaId, s.metaId))
    : and(buWaba, eq(whatsappSablonlari.ad, s.ad), eq(whatsappSablonlari.dil, s.dil));
  const eski = db.select().from(whatsappSablonlari).where(kosul).get();
  if (!eski) return false;
  const c = sablonCozumle({ kategori: eski.kategori, durum: s.durum, bilesenler: eski.bilesenler });
  db.update(whatsappSablonlari)
    .set({ durum: s.durum, destekNedeni: c.destekNedeni, senkronTarihi: new Date() })
    .where(eq(whatsappSablonlari.id, eski.id))
    .run();
  return true;
}
