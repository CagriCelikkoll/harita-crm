// Google Places API (New) — TÜM Places çağrıları bu modülden geçer ve yalnızca sunucuda çalışır.
// API anahtarı (GOOGLE_PLACES_API_KEY) tarayıcıya asla gönderilmez.
//
// Alan maskeleri ve SKU'lar (Ekim 2026 fiyat listesi, README'de ayrıntı). Bir istek, maskedeki
// en yüksek katmandan TEK olay olarak faturalanır.
//   Tarama, daire içi hücre : places.id,nextPageToken                 → Text Search Essentials (IDs Only), ücretsiz
//   Tarama, sınır hücresi   : places.id,places.location,nextPageToken → Text Search Pro
//   Liste satırı            : id,displayName,formattedAddress,location → Place Details Pro
//                             (displayName Pro katmanındadır; ad istenince Essentials mümkün değil)
//   Detay paneli (ayrı)     : telefon, web sitesi, puan + ad/adres/konum/googleMapsUri → Place Details Enterprise
//   Adres arama             : places.location,places.formattedAddress  → Text Search Pro
//   SMS/WhatsApp telefonu   : id,nationalPhoneNumber,internationalPhoneNumber → Place Details Enterprise
import { PLACES_BIRIMLERI, type PlacesSku } from "@/lib/places-birimleri";
import type { KullanimKalemi } from "../repo/kullanim";
import { mockPlacesIstemcisi } from "./mock";
import {
  kotaKontrol,
  PlacesHatasi,
  type KotaKapisi,
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
  // Enterprise alanı (telefon, web sitesi, puan, çalışma saatleri) EKLEMEYİN: tüm liste Enterprise'a çıkar.
  // location Essentials alanıdır (Bölge tara kartlarında mesafe); istek zaten Pro faturalandığı için ek ücret yok.
  liste: "id,displayName,formattedAddress,location",
  detay:
    "id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri," +
    "googleMapsUri,rating,userRatingCount,location,businessStatus",
  adres: "places.location,places.formattedAddress",
  // SMS / WhatsApp gönderimi anında, kayıtta telefon yoksa. Sonuç SAKLANMAZ (yalnızca o gönderimde kullanılır).
  // displayName (Pro) da istenir: WhatsApp listesinde gösterilir; SKU yine Enterprise (en yüksek katman).
  telefon: "id,displayName,nationalPhoneNumber,internationalPhoneNumber",
} as const;

/** Her çağrının faturalandığı SKU; kota birimi buradan (src/lib/places-birimleri.ts) okunur. */
export const CAGRI_SKULARI = {
  taramaYalnizcaId: "textSearchIdsOnly",
  taramaKonumlu: "textSearchPro",
  liste: "placeDetailsPro",
  detay: "placeDetailsEnterprise",
  adres: "textSearchPro",
  telefon: "placeDetailsEnterprise",
} as const satisfies Record<keyof typeof ALAN_MASKELERI, PlacesSku>;

export const cagriBirimi = (cagri: keyof typeof CAGRI_SKULARI) => PLACES_BIRIMLERI[CAGRI_SKULARI[cagri]];

/** Her çağrının kullanım kalemi (Ayarlar > Kullanım dökümü). */
export const CAGRI_KALEMLERI = {
  taramaYalnizcaId: "tarama",
  taramaKonumlu: "tarama",
  liste: "isletmeBilgisi",
  detay: "iletisimBilgisi",
  adres: "tarama",
  telefon: "iletisimBilgisi",
} as const satisfies Record<keyof typeof ALAN_MASKELERI, KullanimKalemi>;

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
  /**
   * Kiracının aylık kotası. Her ücretli istekten ÖNCE SKU'nun birimi ayrılır; ayrılamazsa istek
   * yapılmaz ve KotaDolduHatasi fırlatılır. Ağ hatası veya reddedilen istekte birimler iade edilir.
   */
  kota?: KotaKapisi;
  /** Yapılan her Places isteğinden (ücretsizler dahil) sonra çağrılır (scans.istek_sayisi). */
  istekSayaci?: (adet: number) => void;
};

export function placesIstemcisiOlustur(secenekler: IstemciSecenekleri = {}): PlacesIstemcisi {
  if (process.env.PLACES_MOCK === "true") return mockPlacesIstemcisi(secenekler);
  return gercekPlacesIstemcisi(secenekler);
}

function gercekPlacesIstemcisi({ kota, istekSayaci }: IstemciSecenekleri): PlacesIstemcisi {
  async function istek<T>(yol: string, cagri: keyof typeof ALAN_MASKELERI, govde?: object): Promise<T | null> {
    const alanMaskesi = ALAN_MASKELERI[cagri];
    const anahtar = process.env.GOOGLE_PLACES_API_KEY;
    if (!anahtar) throw new PlacesHatasi("GOOGLE_PLACES_API_KEY tanımlı değil (veya PLACES_MOCK=true kullanın).");
    const iade = kotaKontrol(kota, cagriBirimi(cagri), CAGRI_KALEMLERI[cagri]); // kota yoksa istek YAPILMAZ
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
      iade(); // istek Google'a ulaşmadı
      throw new PlacesHatasi(`Places API'ye ulaşılamadı: ${(hata as Error).message}`);
    }
    istekSayaci?.(1);
    if (yanit.status === 404) return null;
    if (!yanit.ok) {
      iade(); // başarısız istek faturalanmaz
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
      const cagri = i.konumIste ? "taramaKonumlu" : "taramaYalnizcaId";
      const veri = await istek<{ places?: GooglePlace[]; nextPageToken?: string }>("/places:searchText", cagri, govde);
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
        kapsam,
      );
      return veri ? yerDonustur(veri) : null;
    },

    async adresBul(metin: string) {
      const veri = await istek<{ places?: GooglePlace[] }>("/places:searchText", "adres", {
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
