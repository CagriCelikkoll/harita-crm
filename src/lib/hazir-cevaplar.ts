// Gelen kutusunun hazır cevapları: ekibin ortak, kayıtlı yanıt metinleri. Yönetici ekler, düzenler, siler; herkes
// sohbette seçip yanıt kutusuna koyar. Gönderim her zamanki serbest metin yanıtıdır (24 saat penceresi, RET ve test
// modu kuralları aynı); hazır cevap kendi başına hiçbir şey göndermez.
import { z } from "zod";
import { YANIT_AZAMI } from "./gelen-kutusu";

export const HAZIR_CEVAP_BASLIK_AZAMI = 60;
/** Çalışma alanı başına en fazla bu kadar hazır cevap. */
export const HAZIR_CEVAP_AZAMI = 200;

export const HazirCevapGirdisi = z.object({
  baslik: z
    .string()
    .trim()
    .min(1, "Başlık girin.")
    .max(HAZIR_CEVAP_BASLIK_AZAMI, `Başlık en fazla ${HAZIR_CEVAP_BASLIK_AZAMI} karakter olabilir.`),
  metin: z
    .string()
    .trim()
    .min(1, "Metin girin.")
    .max(YANIT_AZAMI, `Metin en fazla ${YANIT_AZAMI} karakter olabilir.`),
});
export type HazirCevapGirdisi = z.infer<typeof HazirCevapGirdisi>;

export type HazirCevapDto = { id: string; baslik: string; metin: string };

/** Aynı başlık sayılır mı: Türkçe büyük/küçük harf ve baştaki/sondaki boşluk farkı yok sayılır ("İlan" = "ilan"). */
export const baslikAnahtari = (baslik: string) => baslik.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");

/** Arama: başlıkta ya da metinde geçen (Türkçe harf duyarsız); başlıkta geçenler önce. */
export function hazirCevapAra<T extends HazirCevapDto>(cevaplar: T[], sorgu: string): T[] {
  const q = baslikAnahtari(sorgu);
  if (!q) return cevaplar;
  const baslikta = cevaplar.filter((c) => baslikAnahtari(c.baslik).includes(q));
  const metinde = cevaplar.filter((c) => !baslikta.includes(c) && c.metin.toLocaleLowerCase("tr").includes(q));
  return [...baslikta, ...metinde];
}

/** Yanıt kutusuna koyma: kutu boşsa metin onun yerine geçer, doluysa alt satıra eklenir; yanıt sınırını aşmaz. */
export function yanitaEkle(mevcut: string, metin: string): string {
  const birlesik = mevcut.trim() ? `${mevcut.replace(/\s+$/, "")}\n${metin}` : metin;
  return birlesik.slice(0, YANIT_AZAMI);
}
