// Zamanlanmış bakım işleri (npm run cleanup) ve uygulama başlangıcı. Kiracılar arası çalışır;
// HTTP'den çağrılmaz.
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { PLACES_KONUM_SAKLAMA_GUN, YARIM_KALDI_MESAJI } from "@/lib/sabitler";
import { db } from "../../db";
import { invitations, leads, placeLocations, scans, tenants } from "../../db/schema";
import { yarimKalmaSiniri } from "../taramalar";

const GUN_MS = 24 * 60 * 60 * 1000;

/**
 * Uygulama başlarken: tüm kiracılarda 10 dakikadan uzun süredir "calisiyor" kalan taramaları
 * "hata" yapar (önceki süreç tarama sırasında kapanmış olabilir).
 */
export function tumYarimKalanTaramalariKapat(simdi = new Date()): number {
  return db
    .update(scans)
    .set({ durum: "hata", hataMesaji: YARIM_KALDI_MESAJI, tamamlanmaTarihi: simdi })
    .where(and(eq(scans.durum, "calisiyor"), lt(scans.baslamaTarihi, yarimKalmaSiniri(simdi))))
    .returning({ id: scans.id })
    .all().length;
}

export function temizlikYap(simdi = new Date()) {
  return db.transaction((tx) => {
    const konumSiniri = new Date(simdi.getTime() - PLACES_KONUM_SAKLAMA_GUN * GUN_MS);

    // 1) Google kuralı: Places enlem/boylamı 30 günden fazla tutulmaz.
    const silinenKonum = tx
      .delete(placeLocations)
      .where(lt(placeLocations.alinmaTarihi, konumSiniri))
      .returning({ placeId: placeLocations.placeId })
      .all().length;

    // 2) Adres aramasıyla (Places) bulunan tarama merkezleri de Google içeriğidir: 30 gün sonra koordinatlar
    //    silinir. Kullanıcının yazdığı adres metni ve yarıçap kalır (tarama yeniden çalıştırılabilir).
    //    Haritaya tıklanarak seçilen merkez ('harita') kullanıcı verisidir ve silinmez.
    const temizlenenMerkez = tx
      .update(scans)
      .set({ merkezLat: null, merkezLng: null })
      .where(and(eq(scans.merkezKaynagi, "adres"), lt(scans.olusturmaTarihi, konumSiniri), isNotNull(scans.merkezLat)))
      .returning({ id: scans.id })
      .all().length;

    // 3) Çalışma alanının veri saklama süresi: o süredir güncellenmeyen kayıtlar (olaylarıyla) silinir.
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

    // 4) Süresi dolmuş, kabul edilmemiş davetler.
    const silinenDavet = tx
      .delete(invitations)
      .where(and(lt(invitations.sonGecerlilik, simdi), sql`${invitations.kabulTarihi} is null`))
      .returning({ id: invitations.id })
      .all().length;

    return { silinenKonum, temizlenenMerkez, silinenKayit, silinenDavet };
  });
}
