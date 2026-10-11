// Google Places API (New) — TÜM Places çağrıları bu modülden geçer ve yalnızca sunucuda çalışır.
// API anahtarı (GOOGLE_PLACES_API_KEY) tarayıcıya asla gönderilmez.
//
// Alan maskeleri ve SKU'lar (Ekim 2026 fiyat listesi, README'de ayrıntı):
//   Tarama, daire içi hücre : places.id,nextPageToken                 → Text Search Essentials (IDs Only), ücretsiz
//   Tarama, sınır hücresi   : places.id,places.location,nextPageToken → Text Search Pro
//   Liste satırı            : ad, adres, ulusal telefon, googleMapsUri → Place Details Enterprise
//   Detay paneli            : + web sitesi, puan, konum, işletme durumu → Place Details Enterprise
//   Adres arama             : places.location,places.formattedAddress  → Text Search Pro
import { mockPlacesIstemcisi } from "./mock";
import {
  PlacesHatasi,
  type DetayKapsami,
  type MetinAramaIstegi,
  type MetinAramaYaniti,
  type PlacesIstemcisi,
  type YerBilgisi,
} from "./tipler";

const TABAN = "https://places.googleapis.com/v1";

export const ALAN_MASKELERI = {
  taramaYalnizcaId: "places.id,nextPageToken",
  taramaKonumlu: "places.id,places.location,nextPageToken",
  liste: "id,displayName,formattedAddress,nationalPhoneNumber,googleMapsUri",
  detay:
    "id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri," +
    "googleMapsUri,rating,userRatingCount,location,businessStatus",
  adres: "places.location,places.formattedAddress",
} as const;

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude: number; longitude: number };
  businessStatus?: string;
};

export type IstemciSecenekleri = {
  /** Her Places HTTP isteğinden sonra çağrılır (usage_counters / scans.istek_sayisi). */
  istekSayaci?: (adet: number) => void;
};

export function placesIstemcisiOlustur(secenekler: IstemciSecenekleri = {}): PlacesIstemcisi {
  if (process.env.PLACES_MOCK === "true") return mockPlacesIstemcisi(secenekler);
  return gercekPlacesIstemcisi(secenekler);
}

function gercekPlacesIstemcisi({ istekSayaci }: IstemciSecenekleri): PlacesIstemcisi {
  async function istek<T>(yol: string, alanMaskesi: string, govde?: object): Promise<T | null> {
    const anahtar = process.env.GOOGLE_PLACES_API_KEY;
    if (!anahtar) throw new PlacesHatasi("GOOGLE_PLACES_API_KEY tanımlı değil (veya PLACES_MOCK=true kullanın).");
    let yanit: Response;
    try {
      yanit = await fetch(`${TABAN}${yol}`, {
        method: govde ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": anahtar,
          "X-Goog-FieldMask": alanMaskesi,
        },
        body: govde ? JSON.stringify(govde) : undefined,
        cache: "no-store", // Places içeriği önbelleğe alınmaz
        signal: AbortSignal.timeout(15_000),
      });
    } catch (hata) {
      throw new PlacesHatasi(`Places API'ye ulaşılamadı: ${(hata as Error).message}`);
    }
    istekSayaci?.(1);
    if (yanit.status === 404) return null;
    if (!yanit.ok) {
      const metin = (await yanit.text()).slice(0, 300);
      throw new PlacesHatasi(`Places API hatası (${yanit.status}): ${metin}`, yanit.status);
    }
    return (await yanit.json()) as T;
  }

  const yerDonustur = (p: GooglePlace): YerBilgisi => ({
    id: p.id ?? "",
    ad: p.displayName?.text ?? "(adsız)",
    adres: p.formattedAddress,
    telefon: p.nationalPhoneNumber,
    telefonUluslararasi: p.internationalPhoneNumber,
    webSitesi: p.websiteUri,
    googleMapsUri: p.googleMapsUri,
    puan: p.rating,
    puanSayisi: p.userRatingCount,
    konum: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : undefined,
    isletmeDurumu: p.businessStatus,
  });

  return {
    async metinAra(i: MetinAramaIstegi): Promise<MetinAramaYaniti> {
      const govde = {
        textQuery: i.sorgu,
        includedType: i.tur,
        strictTypeFiltering: true,
        pageSize: 20,
        languageCode: "tr",
        regionCode: "TR",
        locationRestriction: {
          rectangle: {
            low: { latitude: i.alan.guney, longitude: i.alan.bati },
            high: { latitude: i.alan.kuzey, longitude: i.alan.dogu },
          },
        },
        ...(i.sayfaTokeni ? { pageToken: i.sayfaTokeni } : {}),
      };
      const maske = i.konumIste ? ALAN_MASKELERI.taramaKonumlu : ALAN_MASKELERI.taramaYalnizcaId;
      const veri = await istek<{ places?: GooglePlace[]; nextPageToken?: string }>("/places:searchText", maske, govde);
      return {
        yerler: (veri?.places ?? [])
          .filter((p): p is GooglePlace & { id: string } => Boolean(p.id))
          .map((p) => ({
            id: p.id,
            konum: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : undefined,
          })),
        sonrakiSayfaTokeni: veri?.nextPageToken || undefined,
      };
    },

    async yerDetayi(placeId: string, kapsam: DetayKapsami) {
      if (!/^[A-Za-z0-9_-]+$/.test(placeId)) return null;
      const veri = await istek<GooglePlace>(
        `/places/${placeId}?languageCode=tr&regionCode=TR`,
        kapsam === "detay" ? ALAN_MASKELERI.detay : ALAN_MASKELERI.liste,
      );
      return veri ? yerDonustur(veri) : null;
    },

    async adresBul(metin: string) {
      const veri = await istek<{ places?: GooglePlace[] }>("/places:searchText", ALAN_MASKELERI.adres, {
        textQuery: metin,
        pageSize: 1,
        languageCode: "tr",
        regionCode: "TR",
      });
      const yer = veri?.places?.[0];
      return yer?.location
        ? { lat: yer.location.latitude, lng: yer.location.longitude, adres: yer.formattedAddress }
        : null;
    },
  };
}
