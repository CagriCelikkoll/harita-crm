// Tarama kategorileri → Places (New) Table A türü + metin sorgusu.
// Text Search'te `includedType` + `strictTypeFiltering: true` ile yalnızca o türdeki yerler döner.
export type Kategori = { anahtar: string; etiket: string; tur: string; sorgu: string };

export const KATEGORILER: readonly Kategori[] = [
  { anahtar: "emlak_ofisi", etiket: "Emlak ofisi", tur: "real_estate_agency", sorgu: "emlak ofisi" },
  { anahtar: "oto_galeri", etiket: "Oto galeri", tur: "car_dealer", sorgu: "oto galeri" },
  { anahtar: "oto_servis", etiket: "Oto servis", tur: "car_repair", sorgu: "oto servis" },
  { anahtar: "restoran", etiket: "Restoran", tur: "restaurant", sorgu: "restoran" },
  { anahtar: "kafe", etiket: "Kafe", tur: "cafe", sorgu: "kafe" },
  { anahtar: "kuafor", etiket: "Kuaför / berber", tur: "hair_care", sorgu: "kuaför" },
  { anahtar: "guzellik", etiket: "Güzellik salonu", tur: "beauty_salon", sorgu: "güzellik salonu" },
  { anahtar: "dis_klinigi", etiket: "Diş kliniği", tur: "dentist", sorgu: "diş kliniği" },
  { anahtar: "eczane", etiket: "Eczane", tur: "pharmacy", sorgu: "eczane" },
  { anahtar: "avukat", etiket: "Avukatlık bürosu", tur: "lawyer", sorgu: "avukat" },
  { anahtar: "muhasebe", etiket: "Mali müşavir", tur: "accounting", sorgu: "mali müşavir" },
  { anahtar: "spor_salonu", etiket: "Spor salonu", tur: "gym", sorgu: "spor salonu" },
];

export function kategoriBul(anahtar: string) {
  return KATEGORILER.find((k) => k.anahtar === anahtar) ?? null;
}
