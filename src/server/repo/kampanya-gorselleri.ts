// Görselli WhatsApp kampanyasının görseli. Dosya gelen medyayla aynı altyapıdadır: sohbet_medyalari satırı (mesaj_id
// boş, durum "indirildi"), aynı medya klasörü ve aynı çalışma alanı kotası (medyaKotaKullanimi bu satırları da sayar).
// Meta'ya yüklenmiş kimlik (media id), yüklendiği numara ve tarih kampanya satırındadır.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { kampanyalar, sohbetMedyalari, type SohbetMedyasi } from "../db/schema";
import { yoneticiOlmali, type TenantContext } from "./baglam";

export type KampanyaGorseli = SohbetMedyasi;

/** Yeni kampanya görseli (dosya diske yazılmış ve doğrulanmış olmalı). Yalnızca yönetici (WhatsApp kampanyası K12). */
export function kampanyaGorseliEkle(
  ctx: TenantContext,
  g: { yol: string; mime: string; boyut: number; sha256: string; dosyaAdi: string },
  simdi = new Date(),
): KampanyaGorseli {
  yoneticiOlmali(ctx);
  return db
    .insert(sohbetMedyalari)
    .values({
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId,
      mesajId: null,
      metaMedyaId: null,
      mime: g.mime,
      boyut: g.boyut,
      sha256: g.sha256,
      dosyaAdi: g.dosyaAdi.slice(0, 255),
      yol: g.yol,
      durum: "indirildi",
      indirmeTarihi: simdi,
      olusturmaTarihi: simdi,
    })
    .returning()
    .get();
}

/** Bu çalışma alanının kampanya görseli (gelen medya satırları dönmez); yoksa null. */
export function kampanyaGorseliGetir(ctx: TenantContext, id: string): KampanyaGorseli | null {
  return (
    db
      .select()
      .from(sohbetMedyalari)
      .where(
        and(
          eq(sohbetMedyalari.tenantId, ctx.tenantId),
          eq(sohbetMedyalari.id, id),
          isNull(sohbetMedyalari.mesajId),
          eq(sohbetMedyalari.durum, "indirildi"),
        ),
      )
      .get() ?? null
  );
}

/** Kampanyanın görsel alanları, veritabanından taze (işçi turu boyunca aynı kampanya nesnesi eskir). */
export function kampanyaGorselAlanlari(ctx: TenantContext, kampanyaId: string) {
  return (
    db
      .select({
        id: kampanyalar.id,
        gorselMedyaId: kampanyalar.gorselMedyaId,
        metaGorselId: kampanyalar.metaGorselId,
        metaGorselNumarasi: kampanyalar.metaGorselNumarasi,
        metaGorselTarihi: kampanyalar.metaGorselTarihi,
      })
      .from(kampanyalar)
      .where(and(eq(kampanyalar.tenantId, ctx.tenantId), eq(kampanyalar.id, kampanyaId)))
      .get() ?? null
  );
}

/**
 * Görselin Meta'daki kimliğini kampanyaya yazar (gönderen numara ve yükleme zamanıyla). metaId null: kimlik silinir,
 * sonraki gönderim görseli yeniden yükler (Meta görseli işleyemedi ya da yükleme reddedildi).
 */
export function kampanyaMetaGorselYaz(
  ctx: TenantContext,
  kampanyaId: string,
  g: { metaId: string; numara: string; tarih: Date } | null,
): boolean {
  return (
    db
      .update(kampanyalar)
      .set({ metaGorselId: g?.metaId ?? null, metaGorselNumarasi: g?.numara ?? null, metaGorselTarihi: g?.tarih ?? null })
      .where(and(eq(kampanyalar.tenantId, ctx.tenantId), eq(kampanyalar.id, kampanyaId)))
      .returning({ id: kampanyalar.id })
      .all().length > 0
  );
}
