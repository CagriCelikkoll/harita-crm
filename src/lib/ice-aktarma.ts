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

/** Dosya sütunlarının eşlenebileceği alanlar. */
export const ICE_AKTARMA_ALANLARI = [
  "isletmeAdi",
  "yetkiliAdi",
  "telefon",
  "eposta",
  "etiketler",
  "aliciTuru",
  "whatsappIzni",
  "izinTarihi",
  "izinKaynagi",
  "not",
] as const;
export type IceAktarmaAlani = (typeof ICE_AKTARMA_ALANLARI)[number];
/** Alan → sütun sırası (0'dan). Eşlenmeyen alan yoktur. */
export type SutunEslemi = Partial<Record<IceAktarmaAlani, number>>;

export const ICE_AKTARMA_ALAN_ADLARI: Record<IceAktarmaAlani, string> = {
  isletmeAdi: "İşletme adı",
  yetkiliAdi: "Ad soyad / yetkili",
  telefon: "Telefon",
  eposta: "E-posta",
  etiketler: "Etiketler (virgülle)",
  aliciTuru: "Alıcı türü",
  whatsappIzni: "WhatsApp izni",
  izinTarihi: "İzin tarihi",
  izinKaynagi: "İzin kaynağı",
  not: "Not",
};

/** Sütun başlığından alan tahmini (küçük harf, Türkçe karakterler sadeleştirilmiş başlıkta geçen kelimeler). */
const BASLIK_IPUCLARI: [IceAktarmaAlani, RegExp][] = [
  ["izinTarihi", /izin.*tarih|onay.*tarih|consent.*date/],
  ["izinKaynagi", /izin.*kayna[kg]|onay.*kayna[kg]|consent.*source/],
  ["whatsappIzni", /whatsapp|izin|onay|consent|opt.?in/],
  ["eposta", /e.?posta|e.?mail|mail/],
  ["telefon", /telefon|tel\b|gsm|cep|phone|mobile|numara/],
  ["isletmeAdi", /isletme|firma|sirket|unvan|company|business/],
  ["yetkiliAdi", /ad.?soyad|isim|^ad$|adi|yetkili|kisi|musteri|name/],
  ["etiketler", /etiket|tag|grup|segment/],
  ["aliciTuru", /alici.*tur|tur|tip|bireysel|kurumsal/],
  ["not", /not|aciklama|note/],
];

export const basligiSadelestir = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();

/** Başlıklardan önerilen eşleme; her alan ve her sütun en fazla bir kez. */
export function eslemOner(basliklar: string[]): SutunEslemi {
  const eslem: SutunEslemi = {};
  const kullanilan = new Set<number>();
  for (const [alan, desen] of BASLIK_IPUCLARI) {
    const i = basliklar.findIndex((b, j) => !kullanilan.has(j) && desen.test(basligiSadelestir(b)));
    if (i >= 0 && eslem[alan] === undefined) {
      eslem[alan] = i;
      kullanilan.add(i);
    }
  }
  return eslem;
}

export type CakismaPolitikasi = "atla" | "bos_doldur";
export const CAKISMA_POLITIKA_ADLARI: Record<CakismaPolitikasi, string> = {
  atla: "Atla ve raporla",
  bos_doldur: "Yalnızca boş alanları doldur",
};

/** Önizleme raporunda bir satırın sonucu. satir: dosyadaki satır numarası (başlık 1. satır). */
export type SatirSorunu = { satir: number; neden: string };
