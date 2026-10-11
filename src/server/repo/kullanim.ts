// Places kullanım sayacı ve aylık kota (birim cinsinden; ağırlıklar src/lib/places-birimleri.ts).
//
// Her ücretli Places isteğinden ÖNCE kotaAyir() çağrılır. Kontrol ve artırma TEK bir SQL ifadesindedir
// (INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING): SQLite her ifadeyi atomik yürüttüğü için
// eşzamanlı istekler — aynı süreçte ya da ayrı süreçlerde — kotayı aşamaz.
// Kota ayı Europe/Istanbul takvimine göredir. (Sütun adı places_istek_sayisi tarihseldir; değer birimdir.)
import { and, eq, sql } from "drizzle-orm";
import { KOTA_UYARI_ORANI } from "@/lib/sabitler";
import { ayAnahtari } from "@/lib/zaman";
import { db } from "../db";
import { tenants, usageCounters } from "../db/schema";
import type { TenantContext } from "./baglam";

export { ayAnahtari };

/**
 * `ay` için `birim` kadar kota ayırır. Kota yetiyorsa sayacı artırıp true, yetmiyorsa hiçbir şey
 * yazmadan false döner.
 */
export function kotaAyir(ctx: TenantContext, birim = 1, ay = ayAnahtari()): boolean {
  const kota = sql`(select ${tenants.aylikPlacesKotasi} from ${tenants} where ${tenants.id} = ${ctx.tenantId})`;
  const satir = db.get<{ n: number } | undefined>(sql`
    insert into ${usageCounters} (tenant_id, ay, places_istek_sayisi)
    select ${ctx.tenantId}, ${ay}, ${birim} where ${birim} <= ${kota}
    on conflict (tenant_id, ay) do update
      set places_istek_sayisi = ${usageCounters}.places_istek_sayisi + excluded.places_istek_sayisi
      where ${usageCounters}.places_istek_sayisi + excluded.places_istek_sayisi <= ${kota}
    returning places_istek_sayisi as n`);
  return satir !== undefined;
}

/** Yapılamayan (ağ hatası / Google tarafından reddedilen) istek için ayrılan birimleri, ayrıldığı aya iade eder. */
export function kotaIadeEt(ctx: TenantContext, birim = 1, ay = ayAnahtari()) {
  db.update(usageCounters)
    .set({ placesIstekSayisi: sql`max(0, ${usageCounters.placesIstekSayisi} - ${birim})` })
    .where(and(eq(usageCounters.tenantId, ctx.tenantId), eq(usageCounters.ay, ay)))
    .run();
}

export function aylikPlacesBirimi(ctx: TenantContext, ay = ayAnahtari()): number {
  return (
    db
      .select({ n: usageCounters.placesIstekSayisi })
      .from(usageCounters)
      .where(and(eq(usageCounters.tenantId, ctx.tenantId), eq(usageCounters.ay, ay)))
      .get()?.n ?? 0
  );
}

export type KotaDurumu = {
  kullanilan: number;
  kota: number;
  kalan: number;
  /** 0–1 arası (kota 0 ise 1). */
  oran: number;
  uyari: boolean; // %80 ve üstü
  doldu: boolean;
};

export function kotaDurumu(ctx: TenantContext, ay = ayAnahtari()): KotaDurumu {
  const kota = db.select({ k: tenants.aylikPlacesKotasi }).from(tenants).where(eq(tenants.id, ctx.tenantId)).get()?.k ?? 0;
  const kullanilan = aylikPlacesBirimi(ctx, ay);
  const oran = kota > 0 ? Math.min(1, kullanilan / kota) : 1;
  return {
    kullanilan,
    kota,
    kalan: Math.max(0, kota - kullanilan),
    oran,
    uyari: oran >= KOTA_UYARI_ORANI,
    doldu: kullanilan >= kota,
  };
}
