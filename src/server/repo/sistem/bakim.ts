// Zamanlanmış bakım işleri (npm run cleanup). Kiracılar arası çalışır; HTTP'den çağrılmaz.
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { PLACES_KONUM_SAKLAMA_GUN } from "@/lib/sabitler";
import { db } from "../../db";
import { invitations, leads, placeLocations, tenants } from "../../db/schema";

const GUN_MS = 24 * 60 * 60 * 1000;

export function temizlikYap(simdi = new Date()) {
  return db.transaction((tx) => {
    // 1) Google kuralı: Places enlem/boylamı 30 günden fazla tutulmaz.
    const konumSiniri = new Date(simdi.getTime() - PLACES_KONUM_SAKLAMA_GUN * GUN_MS);
    const silinenKonum = tx
      .delete(placeLocations)
      .where(lt(placeLocations.alinmaTarihi, konumSiniri))
      .returning({ placeId: placeLocations.placeId })
      .all().length;

    // 2) Çalışma alanının veri saklama süresi: o süredir güncellenmeyen kayıtlar (olaylarıyla) silinir.
    let silinenKayit = 0;
    const sureliAlanlar = tx
      .select({ id: tenants.id, gun: tenants.veriSaklamaGun })
      .from(tenants)
      .where(isNotNull(tenants.veriSaklamaGun))
      .all();
    for (const alan of sureliAlanlar) {
      const sinir = new Date(simdi.getTime() - (alan.gun ?? 0) * GUN_MS);
      silinenKayit += tx
        .delete(leads)
        .where(and(eq(leads.tenantId, alan.id), lt(leads.guncellemeTarihi, sinir)))
        .returning({ id: leads.id })
        .all().length;
    }

    // 3) Süresi dolmuş, kabul edilmemiş davetler.
    const silinenDavet = tx
      .delete(invitations)
      .where(and(lt(invitations.sonGecerlilik, simdi), sql`${invitations.kabulTarihi} is null`))
      .returning({ id: invitations.id })
      .all().length;

    return { silinenKonum, silinenKayit, silinenDavet };
  });
}
