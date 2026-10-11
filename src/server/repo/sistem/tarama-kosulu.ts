import { and, eq, lt, or } from "drizzle-orm";
import { YARIM_KALAN_TARAMA_DAKIKA } from "@/lib/sabitler";
import { scans } from "../../db/schema";

/** Bu ana kadar 10 dakika dolmuş sınır zamanı. */
export const yarimKalmaSiniri = (simdi = new Date()) =>
  new Date(simdi.getTime() - YARIM_KALAN_TARAMA_DAKIKA * 60 * 1000);

/**
 * Yarıda kalmış tarama:
 *  - "calisiyor" ve başlayalı 10 dakikadan uzun (süreç tarama sırasında kapanmış), veya
 *  - "kuyrukta" ve oluşturulalı 10 dakikadan uzun (çalıştırma isteği hiç gelmemiş, ör. sekme kapandı).
 */
export function yarimKalanKosulu(simdi = new Date()) {
  const sinir = yarimKalmaSiniri(simdi);
  return or(
    and(eq(scans.durum, "calisiyor"), lt(scans.baslamaTarihi, sinir)),
    and(eq(scans.durum, "kuyrukta"), lt(scans.olusturmaTarihi, sinir)),
  )!;
}
