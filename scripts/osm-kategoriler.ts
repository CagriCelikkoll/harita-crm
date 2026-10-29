// OSM kapsam ölçümü kategorileri (yalnızca scripts/osm-deneme.ts kullanır; uygulamaya entegre DEĞİLDİR).
// Her kategori: komut satırı anahtarı, Türkçe ad ve OSM etiketleri ("anahtar=değer"). Bir öğe birden fazla
// kategorinin etiketine uyuyorsa her birinde sayılır.
// adDeseni: emlak gibi etiketlemenin zayıf olduğu kategorilerde, adı desene uyan ve office=* / shop=* etiketli
// diğer noktalar da kategoriye katılır (Overpass regex'i; ",i" yalnızca ASCII'yi eşlediği için Türkçe harfler sınıfla).

export interface OsmKategori {
  anahtar: string;
  ad: string;
  etiketler: string[];
  adDeseni?: string;
}

export const OSM_KATEGORILERI: readonly OsmKategori[] = [
  {
    anahtar: "emlak",
    ad: "Emlak ofisi",
    etiketler: ["office=estate_agent", "shop=estate_agent"],
    adDeseni: "emlak|gayr[iİIı]menkul|real estate",
  },
  { anahtar: "oto-galeri", ad: "Oto galeri", etiketler: ["shop=car"] },
  { anahtar: "oto-servis", ad: "Oto servis", etiketler: ["shop=car_repair", "shop=tyres"] },
  { anahtar: "oto-kiralama", ad: "Oto kiralama", etiketler: ["amenity=car_rental"] },
  { anahtar: "eczane", ad: "Eczane", etiketler: ["amenity=pharmacy"] },
  { anahtar: "dis", ad: "Diş kliniği", etiketler: ["amenity=dentist"] },
  { anahtar: "klinik", ad: "Klinik / doktor", etiketler: ["amenity=clinic", "amenity=doctors"] },
  { anahtar: "veteriner", ad: "Veteriner", etiketler: ["amenity=veterinary"] },
  { anahtar: "optik", ad: "Optik", etiketler: ["shop=optician"] },
  { anahtar: "kuafor", ad: "Kuaför / güzellik", etiketler: ["shop=hairdresser", "shop=beauty"] },
  { anahtar: "spor", ad: "Spor salonu", etiketler: ["leisure=fitness_centre"] },
  { anahtar: "restoran", ad: "Restoran", etiketler: ["amenity=restaurant"] },
  { anahtar: "kafe", ad: "Kafe", etiketler: ["amenity=cafe"] },
  { anahtar: "fast-food", ad: "Fast food", etiketler: ["amenity=fast_food"] },
  { anahtar: "firin", ad: "Fırın / pastane", etiketler: ["shop=bakery", "shop=pastry"] },
  { anahtar: "otel", ad: "Otel / pansiyon", etiketler: ["tourism=hotel", "tourism=guest_house", "tourism=hostel"] },
  { anahtar: "market", ad: "Market", etiketler: ["shop=supermarket", "shop=convenience"] },
  { anahtar: "mobilya", ad: "Mobilya", etiketler: ["shop=furniture"] },
  { anahtar: "yapi-market", ad: "Yapı market / hırdavat", etiketler: ["shop=hardware", "shop=doityourself"] },
  { anahtar: "cicekci", ad: "Çiçekçi", etiketler: ["shop=florist"] },
  { anahtar: "avukat", ad: "Avukat", etiketler: ["office=lawyer"] },
  { anahtar: "muhasebe", ad: "Muhasebe", etiketler: ["office=accountant"] },
  { anahtar: "sigorta", ad: "Sigorta", etiketler: ["office=insurance"] },
  { anahtar: "surucu-kursu", ad: "Sürücü kursu", etiketler: ["amenity=driving_school"] },
  { anahtar: "kurs", ad: "Dil / eğitim kursu", etiketler: ["amenity=language_school", "amenity=training"] },
  { anahtar: "dugun-salonu", ad: "Düğün / etkinlik salonu", etiketler: ["amenity=events_venue"] },
];
