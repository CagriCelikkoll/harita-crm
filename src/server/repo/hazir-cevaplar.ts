// Hazır cevaplar (gelen kutusu): ekibin ortak yanıt metinleri. Herkes listeler; ekleme, düzenleme ve silme yalnızca
// yönetici. Her sorgu bağlamın çalışma alanıyla sınırlıdır.
import { and, count, eq, ne } from "drizzle-orm";
import { baslikAnahtari, HAZIR_CEVAP_AZAMI, type HazirCevapGirdisi } from "@/lib/hazir-cevaplar";
import { db } from "../db";
import { hazirCevaplar, type HazirCevap } from "../db/schema";
import { KayitKuraliHatasi, yoneticiOlmali, type TenantContext } from "./baglam";

const ayniBaslik = () => new KayitKuraliHatasi("Bu başlıkta bir hazır cevap zaten var.", 400);

/** Başlığa göre (Türkçe sıralama). */
export function hazirCevaplariListele(ctx: TenantContext): HazirCevap[] {
  return db
    .select()
    .from(hazirCevaplar)
    .where(eq(hazirCevaplar.tenantId, ctx.tenantId))
    .all()
    .sort((a, b) => a.baslik.localeCompare(b.baslik, "tr"));
}

export function hazirCevapGetir(ctx: TenantContext, id: string): HazirCevap | null {
  return (
    db
      .select()
      .from(hazirCevaplar)
      .where(and(eq(hazirCevaplar.tenantId, ctx.tenantId), eq(hazirCevaplar.id, id)))
      .get() ?? null
  );
}

function baslikKullaniliyor(ctx: TenantContext, anahtar: string, haric?: string): boolean {
  const kosul = and(
    eq(hazirCevaplar.tenantId, ctx.tenantId),
    eq(hazirCevaplar.baslikAnahtari, anahtar),
    haric ? ne(hazirCevaplar.id, haric) : undefined,
  );
  return !!db.select({ id: hazirCevaplar.id }).from(hazirCevaplar).where(kosul).get();
}

/** Yalnızca yönetici. Aynı başlık (Türkçe harf duyarsız) ya da sınır dolmuşsa KayitKuraliHatasi (400). */
export function hazirCevapEkle(ctx: TenantContext, girdi: HazirCevapGirdisi): HazirCevap {
  yoneticiOlmali(ctx);
  const anahtar = baslikAnahtari(girdi.baslik);
  return db.transaction((tx) => {
    const [{ adet }] = tx.select({ adet: count() }).from(hazirCevaplar).where(eq(hazirCevaplar.tenantId, ctx.tenantId)).all();
    if (adet >= HAZIR_CEVAP_AZAMI) throw new KayitKuraliHatasi(`En fazla ${HAZIR_CEVAP_AZAMI} hazır cevap kaydedilebilir.`, 400);
    if (baslikKullaniliyor(ctx, anahtar)) throw ayniBaslik();
    return tx
      .insert(hazirCevaplar)
      .values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        baslik: girdi.baslik.trim(),
        baslikAnahtari: anahtar,
        metin: girdi.metin.trim(),
        olusturan: ctx.userId || null,
      })
      .returning()
      .get();
  });
}

/** Yalnızca yönetici. Bu çalışma alanında yoksa null (404). */
export function hazirCevapGuncelle(ctx: TenantContext, id: string, girdi: HazirCevapGirdisi): HazirCevap | null {
  yoneticiOlmali(ctx);
  const anahtar = baslikAnahtari(girdi.baslik);
  return db.transaction((tx) => {
    if (!hazirCevapGetir(ctx, id)) return null;
    if (baslikKullaniliyor(ctx, anahtar, id)) throw ayniBaslik();
    return (
      tx
        .update(hazirCevaplar)
        .set({ baslik: girdi.baslik.trim(), baslikAnahtari: anahtar, metin: girdi.metin.trim(), guncellemeTarihi: new Date() })
        .where(and(eq(hazirCevaplar.tenantId, ctx.tenantId), eq(hazirCevaplar.id, id)))
        .returning()
        .get() ?? null
    );
  });
}

/** Yalnızca yönetici. Silindiyse true. */
export function hazirCevapSil(ctx: TenantContext, id: string): boolean {
  yoneticiOlmali(ctx);
  return (
    db
      .delete(hazirCevaplar)
      .where(and(eq(hazirCevaplar.tenantId, ctx.tenantId), eq(hazirCevaplar.id, id)))
      .run().changes > 0
  );
}
