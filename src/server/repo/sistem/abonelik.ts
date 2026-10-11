// Oturumsuz ret akışları için kiracı bağlamı: abonelikten çıkma (imzalı belirteç) ve SMS ret webhook'u
// (kiracıya özgü gizli anahtar). Çağıran, belirteci / anahtarı DOĞRULADIKTAN sonra çağırır.
// Bağlamın userId'si "" dir (olaylar kullanıcısız, sistem olayı olarak yazılır).
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { saglayiciAyarlari, tenants } from "../../db/schema";
import { _baglamDamgala, type TenantContext } from "../baglam";

export function dogrulanmisSistemBaglami(tenantId: string): TenantContext | null {
  const var_ = db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).get();
  return var_ ? _baglamDamgala({ tenantId, userId: "", rol: "uye" }) : null;
}

/** SMS ret webhook'u: anahtar özetinden kiracı (yoksa null). Çağıran özeti sabit zamanlı HMAC ile üretir. */
export function webhookKiracisi(ozet: string): string | null {
  return (
    db
      .select({ tenantId: saglayiciAyarlari.tenantId })
      .from(saglayiciAyarlari)
      .where(eq(saglayiciAyarlari.webhookOzeti, ozet))
      .get()?.tenantId ?? null
  );
}
