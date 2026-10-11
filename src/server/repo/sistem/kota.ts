// Kota yönetimi (yalnızca komut satırından: npm run kota -- <slug> <sayı>). HTTP'den çağrılmaz.
import { eq } from "drizzle-orm";
import { VARSAYILAN_AYLIK_PLACES_KOTASI } from "@/lib/sabitler";
import { db } from "../../db";
import { tenants } from "../../db/schema";

/** Yeni çalışma alanlarının başlangıç kotası: PLACES_AYLIK_KOTA (geçerli bir tam sayıysa) ya da 2.000. */
export function varsayilanKota(): number {
  const deger = Number(process.env.PLACES_AYLIK_KOTA);
  return Number.isInteger(deger) && deger >= 0 ? deger : VARSAYILAN_AYLIK_PLACES_KOTASI;
}

export function kotaAyarla(slug: string, kota: number) {
  if (!Number.isInteger(kota) || kota < 0) throw new Error("Kota 0 veya daha büyük bir tam sayı olmalı.");
  return (
    db
      .update(tenants)
      .set({ aylikPlacesKotasi: kota })
      .where(eq(tenants.slug, slug))
      .returning({ id: tenants.id, ad: tenants.ad, slug: tenants.slug, kota: tenants.aylikPlacesKotasi })
      .get() ?? null
  );
}
