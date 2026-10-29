// Kişi içe aktarma sabitleri. İstemci ve sunucuda ortak; veritabanına bağımlılığı yoktur.

export const ICE_AKTARMA_DURUMLARI = ["hazirlaniyor", "tamamlandi", "iptal"] as const;
export type IceAktarmaDurumu = (typeof ICE_AKTARMA_DURUMLARI)[number];

export const ICE_AKTARMA_AZAMI_SATIR = 5000;
export const ICE_AKTARMA_AZAMI_BAYT = 5 * 1024 * 1024;
/** Tamamlanmamış oturumun ayrıştırılmış satırları bu süreden sonra silinir. */
export const ICE_AKTARMA_OTURUM_DAKIKA = 60;

/** İzinli kişileri içe aktarmadan önce onaylanması zorunlu beyan. Metin değişirse sürüm artırılır. */
export const IZIN_BEYANI_SURUMU = "2026-10-1";
export const IZIN_BEYANI_METNI =
  "Bu listedeki 'izin var' işaretli kişilerden işletmemizden WhatsApp ile ticari ileti almak için onay alınmıştır; " +
  "sorumluluk çalışma alanımıza aittir.";
