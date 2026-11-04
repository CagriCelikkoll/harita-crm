// Google kullanım birimleri: ağırlıkların TEK kaynağı (sunucu ve Ayarlar ekranı buradan okur).
//
// 1 birim = 0,001 $: bir isteğin birimi, SKU'nun 1.000 istek başına liste fiyatıdır (Text Search Pro $32 → 32 birim);
// ücretsiz SKU'lar 0 birim. Fiyatlar Google Maps Platform fiyat listesinin ilk kademesidir (1.000 istek başına USD).
// Aylık ücretsiz kullanım payları birime yansıtılmaz (fatura hesabı başına, tüm çalışma alanları ortak kullanır).
// Fiyat değişirse yalnızca FIYATLAR güncellenir.
// Kaynak: https://developers.google.com/maps/billing-and-pricing/pricing

export const PLACES_FIYAT_TARIHI = "Kasım 2026";

/** Bir birimin dolar karşılığı. */
export const BIRIM_DOLAR = 0.001;

export const PLACES_SKULARI = {
  textSearchIdsOnly: { ad: "Text Search Essentials (IDs Only)", fiyat: 0 },
  placeDetailsEssentials: { ad: "Place Details Essentials", fiyat: 5 },
  placeDetailsPro: { ad: "Place Details Pro", fiyat: 17 },
  placeDetailsEnterprise: { ad: "Place Details Enterprise", fiyat: 20 },
  textSearchPro: { ad: "Text Search Pro", fiyat: 32 },
  // Places değil, Maps JavaScript API: tarayıcıda her harita oluşturuluşu bir yükleme olarak faturalanır.
  dynamicMaps: { ad: "Dynamic Maps", fiyat: 7 },
} as const;

export type PlacesSku = keyof typeof PLACES_SKULARI;

/** 1.000 istek başına dolar fiyatı → istek başına birim (1 birim = 0,001 $). Ücretli bir SKU hiçbir zaman 0 olmaz. */
export function birimHesapla(fiyat: number): number {
  if (fiyat <= 0) return 0;
  return Math.max(1, Math.round(fiyat / 1000 / BIRIM_DOLAR));
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
  { islem: "Bölge tara ekranında haritanın her açılışı", sku: "dynamicMaps" },
];
