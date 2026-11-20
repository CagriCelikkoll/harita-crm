// Gelen kutusu bildirimleri: işçinin gönderim kuyruğu ve alıcı seçimi (çalışma alanları arası), ayrıca cihaz
// adresinin oturumdaki kullanıcıya geçmesi ve çıkışta bırakılması (kullanıcıya göre, çalışma alanları arası).
//
// Alıcılar: sohbet birine atanmışsa ve o kişi hâlâ çalışma alanının üyesiyse yalnızca onun cihazları; atanmamışsa
// (ya da atanan artık üye değilse) çalışma alanındaki herkesin cihazları.
import { and, asc, eq, lt, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import { bildirimKuyrugu, leads, memberships, pushAbonelikleri, sohbetler, type PushAboneligi } from "../../db/schema";

/** Bu kadar eski bildirim gönderilmez (işçi uzun süre durduysa eski mesajlar için cihazlar çalmasın). */
export const BILDIRIM_OMRU_MS = 3600_000;
/** Üst üste bu kadar geçici hatadan sonra abonelik silinir. */
export const PUSH_AZAMI_ARDISIK_HATA = 10;

export type GonderilecekBildirim = {
  tenantId: string;
  sohbetId: string;
  atanan: string | null;
  isletmeAdi: string | null;
  yetkiliAdi: string | null;
  profilAdi: string | null;
  telefon: string | null;
};

/**
 * Sırası gelen bildirimleri alır ve kuyruktan siler (aynı bildirim iki kez gönderilmez; gönderim işçi kilidi altında).
 * Ömrü dolanlar gönderilmeden silinir.
 */
export function bildirimleriAl(simdi: Date, adet: number): { bildirimler: GonderilecekBildirim[]; eskiyen: number } {
  return db.transaction((tx) => {
    const eskiyen = tx
      .delete(bildirimKuyrugu)
      .where(lt(bildirimKuyrugu.olusturmaTarihi, new Date(simdi.getTime() - BILDIRIM_OMRU_MS)))
      .run().changes;
    const bildirimler = tx
      .select({
        tenantId: bildirimKuyrugu.tenantId,
        sohbetId: bildirimKuyrugu.sohbetId,
        atanan: sohbetler.atananKullanici,
        isletmeAdi: leads.isletmeAdi,
        yetkiliAdi: leads.yetkiliAdi,
        profilAdi: bildirimKuyrugu.profilAdi,
        telefon: leads.ekTelefon,
      })
      .from(bildirimKuyrugu)
      .innerJoin(sohbetler, and(eq(sohbetler.tenantId, bildirimKuyrugu.tenantId), eq(sohbetler.id, bildirimKuyrugu.sohbetId)))
      .leftJoin(leads, and(eq(leads.tenantId, sohbetler.tenantId), eq(leads.id, sohbetler.leadId)))
      .orderBy(asc(bildirimKuyrugu.olusturmaTarihi))
      .limit(adet)
      .all();
    for (const b of bildirimler) {
      tx.delete(bildirimKuyrugu)
        .where(and(eq(bildirimKuyrugu.tenantId, b.tenantId), eq(bildirimKuyrugu.sohbetId, b.sohbetId)))
        .run();
    }
    return { bildirimler, eskiyen };
  });
}

/** Bildirim kapalıyken (VAPID anahtarı yok) kuyruk birikmesin. */
export function bildirimKuyrugunuBosalt(): number {
  return db.delete(bildirimKuyrugu).run().changes;
}

/** Bildirimin gideceği abonelikler (bkz. dosya başı). */
export function bildirimAlicilari(tenantId: string, atanan: string | null): PushAboneligi[] {
  const atananUye =
    atanan &&
    db
      .select({ u: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, atanan)))
      .get();
  return db
    .select()
    .from(pushAbonelikleri)
    .where(and(eq(pushAbonelikleri.tenantId, tenantId), atananUye ? eq(pushAbonelikleri.userId, atanan) : undefined))
    .all();
}

export type PushSonucu = "basarili" | "kalici" | "gecici";

/** Gönderim sonucu: başarılıysa hata sayacı sıfırlanır; kalıcı hatada ya da üst üste çok geçici hatada silinir. */
export function pushSonucuYaz(id: string, sonuc: PushSonucu, simdi = new Date()): "guncellendi" | "silindi" {
  if (sonuc === "basarili") {
    db.update(pushAbonelikleri).set({ sonBasariTarihi: simdi, ardisikHata: 0 }).where(eq(pushAbonelikleri.id, id)).run();
    return "guncellendi";
  }
  if (sonuc === "gecici") {
    const s = db
      .update(pushAbonelikleri)
      .set({ ardisikHata: sql`${pushAbonelikleri.ardisikHata} + 1` })
      .where(eq(pushAbonelikleri.id, id))
      .returning({ hata: pushAbonelikleri.ardisikHata })
      .get();
    if (!s || s.hata < PUSH_AZAMI_ARDISIK_HATA) return "guncellendi";
  }
  db.delete(pushAbonelikleri).where(eq(pushAbonelikleri.id, id)).run();
  return "silindi";
}

/**
 * Bir push adresi tek tarayıcıya aittir. O tarayıcıda oturum açan kullanıcı aboneliği kaydettiğinde (kanıt: geçerli
 * oturum + tarayıcının kendi aboneliği) aynı adresin başka kullanıcılara ait satırları silinir: ortak cihazda önceki
 * kişinin bildirimleri yeni kişiye görünmez. Aynı kullanıcının diğer çalışma alanlarındaki satırları kalır.
 */
export function pushAdresiniDevral(endpoint: string, userId: string): number {
  return db.delete(pushAbonelikleri).where(and(eq(pushAbonelikleri.endpoint, endpoint), ne(pushAbonelikleri.userId, userId))).run().changes;
}

/** Çıkış: kullanıcının bu cihazdaki aboneliği (tüm çalışma alanlarında) silinir; o cihaza bildirim gitmez. */
export function pushAdresiniBirak(endpoint: string, userId: string): number {
  return db.delete(pushAbonelikleri).where(and(eq(pushAbonelikleri.endpoint, endpoint), eq(pushAbonelikleri.userId, userId))).run().changes;
}
