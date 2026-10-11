// Places'tan gelen enlem/boylam: Google kuralı gereği en fazla 30 gün saklanır.
// Okurken de 30 günden eski satırlar yok sayılır; fiziksel silme scripts/cleanup.ts ile yapılır.
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { PLACES_KONUM_SAKLAMA_GUN } from "@/lib/sabitler";
import { db } from "../db";
import { placeLocations } from "../db/schema";
import type { TenantContext } from "./baglam";

export type PlaceKonumu = { placeId: string; lat: number; lng: number };

export function konumlariKaydet(ctx: TenantContext, konumlar: PlaceKonumu[]) {
  if (!konumlar.length) return;
  const simdi = new Date();
  db.transaction((tx) => {
    for (let i = 0; i < konumlar.length; i += 200) {
      tx.insert(placeLocations)
        .values(konumlar.slice(i, i + 200).map((k) => ({ ...k, tenantId: ctx.tenantId, alinmaTarihi: simdi })))
        .onConflictDoUpdate({
          target: [placeLocations.tenantId, placeLocations.placeId],
          set: { lat: sql`excluded.lat`, lng: sql`excluded.lng`, alinmaTarihi: simdi },
        })
        .run();
    }
  });
}

export function konumlariGetir(ctx: TenantContext, placeIdler: string[]): PlaceKonumu[] {
  if (!placeIdler.length) return [];
  const sinir = new Date(Date.now() - PLACES_KONUM_SAKLAMA_GUN * 24 * 60 * 60 * 1000);
  return db
    .select({ placeId: placeLocations.placeId, lat: placeLocations.lat, lng: placeLocations.lng })
    .from(placeLocations)
    .where(
      and(
        eq(placeLocations.tenantId, ctx.tenantId),
        inArray(placeLocations.placeId, placeIdler),
        gt(placeLocations.alinmaTarihi, sinir),
      ),
    )
    .all();
}
