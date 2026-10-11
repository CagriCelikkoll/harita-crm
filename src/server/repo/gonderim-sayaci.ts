// Gönderim sayaçları: kanal bazında günlük sınır (İstanbul günü) ve test gönderimi hız sınırı.
// Ayırma, Places kotasıyla aynı kalıpta TEK SQL ifadesidir (INSERT … ON CONFLICT DO UPDATE … WHERE …
// RETURNING): eşzamanlı işçiler ve istekler sınırı aşamaz.
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { gonderimSayaclari } from "../db/schema";
import type { TenantContext } from "./baglam";

/** `donem` için 1 birim ayırır; sınır doluysa hiçbir şey yazmadan false. kullaniciId '' = alan geneli. */
export function sayacAyir(ctx: TenantContext, kanal: string, donem: string, sinir: number, kullaniciId = ""): boolean {
  const satir = db.get<{ n: number } | undefined>(sql`
    insert into ${gonderimSayaclari} (tenant_id, kanal, kullanici_id, donem, adet)
    select ${ctx.tenantId}, ${kanal}, ${kullaniciId}, ${donem}, 1 where 1 <= ${sinir}
    on conflict (tenant_id, kanal, kullanici_id, donem) do update
      set adet = ${gonderimSayaclari}.adet + 1
      where ${gonderimSayaclari}.adet + 1 <= ${sinir}
    returning adet as n`);
  return satir !== undefined;
}

/** Gönderilemeyen mesajın birimini geri verir. */
export function sayacIade(ctx: TenantContext, kanal: string, donem: string, kullaniciId = "") {
  db.update(gonderimSayaclari)
    .set({ adet: sql`max(0, ${gonderimSayaclari.adet} - 1)` })
    .where(
      and(
        eq(gonderimSayaclari.tenantId, ctx.tenantId),
        eq(gonderimSayaclari.kanal, kanal),
        eq(gonderimSayaclari.kullaniciId, kullaniciId),
        eq(gonderimSayaclari.donem, donem),
      ),
    )
    .run();
}

export function sayacDegeri(ctx: TenantContext, kanal: string, donem: string, kullaniciId = ""): number {
  return (
    db
      .select({ n: gonderimSayaclari.adet })
      .from(gonderimSayaclari)
      .where(
        and(
          eq(gonderimSayaclari.tenantId, ctx.tenantId),
          eq(gonderimSayaclari.kanal, kanal),
          eq(gonderimSayaclari.kullaniciId, kullaniciId),
          eq(gonderimSayaclari.donem, donem),
        ),
      )
      .get()?.n ?? 0
  );
}
