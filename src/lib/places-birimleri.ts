// Places kota birimleri — ağırlıkların TEK kaynağı (sunucu ve Ayarlar ekranı buradan okur).
//
// Kota maliyete göre ağırlıklıdır: en ucuz ücretli SKU = 1 birim, diğerleri fiyatına oranla
// (tam sayıya yuvarlanmış), ücretsiz SKU'lar 0 birim. Fiyatlar Google Maps Platform fiyat listesinin
// ilk kademesidir (1.000 istek başına USD). Fiyat değişirse yalnızca FIYATLAR güncellenir.
// Kaynak: https://developers.google.com/maps/billing-and-pricing/pricing

export const PLACES_FIYAT_TARIHI = "Ekim 2026";

export const PLACES_SKULARI = {
  textSearchIdsOnly: { ad: "Text Search Essentials (IDs Only)", fiyat: 0 },
  placeDetailsEssentials: { ad: "Place Details Essentials", fiyat: 5 },
  placeDetailsPro: { ad: "Place Details Pro", fiyat: 17 },
  placeDetailsEnterprise: { ad: "Place Details Enterprise", fiyat: 20 },
  textSearchPro: { ad: "Text Search Pro", fiyat: 32 },
} as const;

export type PlacesSku = keyof typeof PLACES_SKULARI;

const ucretliFiyatlar = Object.values(PLACES_SKULARI)
  .map((s) => s.fiyat)
  .filter((f) => f > 0);

/** Birim tabanı: en ucuz ücretli SKU'nun fiyatı. */
export const TABAN_FIYAT = Math.min(...ucretliFiyatlar);

export function birimHesapla(fiyat: number): number {
  if (fiyat <= 0) return 0;
  return Math.max(1, Math.round(fiyat / TABAN_FIYAT));
}

export const PLACES_BIRIMLERI = Object.fromEntries(
  Object.entries(PLACES_SKULARI).map(([sku, s]) => [sku, birimHesapla(s.fiyat)]),
) as Record<PlacesSku, number>;

/** Uygulamadaki işlemler ve kullandıkları SKU (Ayarlar'daki açıklama tablosu). */
export const PLACES_ISLEMLERI: { islem: string; sku: PlacesSku }[] = [
  { islem: "Bölge taraması, dairenin içindeki alanlar (sayfa başına)", sku: "textSearchIdsOnly" },
  { islem: "Bölge taraması, dairenin sınırındaki alanlar (sayfa başına)", sku: "textSearchPro" },
  { islem: "Adresle merkez arama", sku: "textSearchPro" },
  { islem: "Kayıt listesinde / incelemede istenince gösterilen bir satır (ad + adres)", sku: "placeDetailsPro" },
  { islem: "Kayıt detayı (telefon, web sitesi, puan)", sku: "placeDetailsEnterprise" },
  { islem: "SMS / WhatsApp: kayıtta telefon yoksa gönderim anında telefon", sku: "placeDetailsEnterprise" },
];
