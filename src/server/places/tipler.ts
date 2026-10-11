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

/** liste: ad + adres (Pro). detay: panel (Enterprise). telefon: yalnızca telefon, SMS/WhatsApp gönderimi anında (Enterprise). */
export type DetayKapsami = "liste" | "detay" | "telefon";

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

/**
 * Her ücretli Places isteğinden önce ayir(birim) çağrılır: kota yetiyorsa birimler ayrılır ve istek
 * yapılamazsa çağrılacak iade fonksiyonu döner; yetmiyorsa null (istek yapılmaz).
 */
export type KotaKapisi = { ayir: (birim: number) => { iade: () => void } | null };

/**
 * İstek öncesi kota kapısı. Ücretsiz SKU (0 birim) kotadan düşmez ve kota dolu olsa da yapılabilir.
 * Kota ayrılamazsa KotaDolduHatasi (istek yapılmaz). Dönen fonksiyon, istek başarısız olursa
 * ayrılan birimleri geri verir.
 */
export function kotaKontrol(kota: KotaKapisi | undefined, birim: number): () => void {
  if (!kota || birim <= 0) return () => {};
  const ayrilan = kota.ayir(birim);
  if (!ayrilan) throw new KotaDolduHatasi();
  return ayrilan.iade;
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
