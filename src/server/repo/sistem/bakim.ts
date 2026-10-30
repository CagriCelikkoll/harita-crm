// Zamanlanmış bakım işleri (npm run cleanup) ve uygulama başlangıcı. Kiracılar arası çalışır;
// HTTP'den çağrılmaz.
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { PLACES_KONUM_SAKLAMA_GUN, YARIM_KALDI_MESAJI } from "@/lib/sabitler";
import { db } from "../../db";
import { iceAktarmalar, invitations, leads, placeLocations, scans, tenants, whatsappGelenKimlikleri } from "../../db/schema";
import { ICE_AKTARMA_OTURUM_DAKIKA } from "@/lib/ice-aktarma";
import { yarimKalanKosulu } from "./tarama-kosulu";

const GUN_MS = 24 * 60 * 60 * 1000;

/**
 * Uygulama başlarken: tüm kiracılarda 10 dakikadan uzun süredir "calisiyor" veya "kuyrukta" kalan
 * taramaları "hata" yapar (önceki süreç tarama sırasında kapanmış ya da çalıştırma isteği gelmemiş).
 */
export function tumYarimKalanTaramalariKapat(simdi = new Date()): number {
  return db
    .update(scans)
    .set({ durum: "hata", hataMesaji: YARIM_KALDI_MESAJI, tamamlanmaTarihi: simdi })
    .where(yarimKalanKosulu(simdi))
    .returning({ id: scans.id })
    .all().length;
}

/**
 * Süresi dolmuş (ICE_AKTARMA_OTURUM_DAKIKA) tamamlanmamış içe aktarma oturumları: dosya satırları (kişisel veri)
 * silinir, oturum 'iptal' olur. Gönderim işçisi saatte bir, günlük temizlik de çalıştırır.
 */
export function suresiDolanIceAktarmalariKapat(simdi = new Date(), tx: Pick<typeof db, "update"> = db): number {
  return tx
    .update(iceAktarmalar)
    .set({ durum: "iptal", satirlar: null })
    .where(
      and(
        eq(iceAktarmalar.durum, "hazirlaniyor"),
        lt(iceAktarmalar.olusturmaTarihi, new Date(simdi.getTime() - ICE_AKTARMA_OTURUM_DAKIKA * 60_000)),
      ),
    )
    .returning({ id: iceAktarmalar.id })
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

    // 2) Tarama merkezlerinin koordinatları, kaynağı ne olursa olsun ('harita' veya 'adres') 30 gün sonra
    //    silinir. Kullanıcının yazdığı adres metni ve yarıçap kalır (tarama "Tekrar kullan" ile yeniden
    //    çalıştırılabilir: adres varsa yeniden aranır, yoksa haritada yeni nokta seçilir). Süre merkezin ilk
    //    alındığı andan (merkez_tarihi; "Tekrar kullan" kopyası en eskisini devralır) sayılır.
    const temizlenenMerkez = tx
      .update(scans)
      .set({ merkezLat: null, merkezLng: null })
      .where(and(lt(sql`coalesce(${scans.merkezTarihi}, ${scans.olusturmaTarihi})`, konumSiniri.getTime()), isNotNull(scans.merkezLat)))
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

    // 5) Tamamlanmamış içe aktarma oturumları (işçi bunu saatte bir de çalıştırır).
    const kapatilanIceAktarma = suresiDolanIceAktarmalariKapat(simdi, tx);

    // 6) Gelen WhatsApp ileti kimlikleri (yalnızca tekrar eleme için) 7 gün sonra.
    const silinenGelenKimlik = tx
      .delete(whatsappGelenKimlikleri)
      .where(lt(whatsappGelenKimlikleri.tarih, new Date(simdi.getTime() - 7 * GUN_MS)))
      .returning({ wamid: whatsappGelenKimlikleri.wamid })
      .all().length;

    return { silinenKonum, temizlenenMerkez, silinenKayit, silinenDavet, kapatilanIceAktarma, silinenGelenKimlik };
  });
}
