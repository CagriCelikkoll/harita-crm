export type LatLng = { lat: number; lng: number };

/** Enlem/boylam sınırları (derece). */
export type Dikdortgen = { guney: number; bati: number; kuzey: number; dogu: number };

export type MetinAramaIstegi = {
  sorgu: string;
  /** Places Table A türü (includedType). */
  tur: string;
  alan: Dikdortgen;
  /** true ise places.location da istenir (Text Search Pro SKU); false ise yalnızca ID (Essentials IDs Only). */
  konumIste: boolean;
  sayfaTokeni?: string;
};

export type MetinAramaYaniti = {
  yerler: { id: string; konum?: LatLng }[];
  sonrakiSayfaTokeni?: string;
};

/**
 * Places'tan canlı çekilen işletme bilgisi. SAKLANMAZ: yalnızca istek ömrü boyunca bellekte tutulur.
 */
export type YerBilgisi = {
  id: string;
  ad: string;
  adres?: string;
  telefon?: string;
  telefonUluslararasi?: string;
  webSitesi?: string;
  googleMapsUri?: string;
  puan?: number;
  puanSayisi?: number;
  konum?: LatLng;
  isletmeDurumu?: string;
};

export type DetayKapsami = "liste" | "detay";

export interface PlacesIstemcisi {
  metinAra(istek: MetinAramaIstegi): Promise<MetinAramaYaniti>;
  /** Yer artık yoksa null. */
  yerDetayi(placeId: string, kapsam: DetayKapsami): Promise<YerBilgisi | null>;
  /** Adres → konum (yalnızca haritayı ortalamak için). */
  adresBul(metin: string): Promise<(LatLng & { adres?: string }) | null>;
}

/** Çalışma alanının aylık Places kotası dolu: istek YAPILMADI. */
export class KotaDolduHatasi extends Error {
  constructor() {
    super("Bu ayki veri kotanız doldu.");
    this.name = "KotaDolduHatasi";
  }
}

/** Her Places isteğinden önce ayir(), istek yapılamazsa iade() çağrılır. */
export type KotaKapisi = { ayir: () => boolean; iade: () => void };

/** İstek öncesi kota kapısı: kota ayrılamazsa KotaDolduHatasi (istek yapılmaz). */
export function kotaKontrol(kota: KotaKapisi | undefined) {
  if (kota && !kota.ayir()) throw new KotaDolduHatasi();
}

export class PlacesHatasi extends Error {
  constructor(
    mesaj: string,
    readonly durumKodu?: number,
  ) {
    super(mesaj);
    this.name = "PlacesHatasi";
  }
}
