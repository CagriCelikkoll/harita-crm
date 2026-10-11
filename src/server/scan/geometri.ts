import type { Dikdortgen, LatLng } from "../places/tipler";

const DUNYA_YARICAPI_M = 6_371_008.8;
const RAD = Math.PI / 180;
const DERECE_BASINA_M = DUNYA_YARICAPI_M * RAD; // ≈ 111 195 m (enlem)

/** İki nokta arası büyük daire mesafesi (haversine), metre. */
export function mesafeM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * DUNYA_YARICAPI_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Daireyi tam kapsayan enlem/boylam karesi. */
export function daireyiKapsayanKare(merkez: LatLng, yaricapM: number): Dikdortgen {
  const dLat = yaricapM / DERECE_BASINA_M;
  const dLng = yaricapM / (DERECE_BASINA_M * Math.cos(merkez.lat * RAD));
  return { guney: merkez.lat - dLat, kuzey: merkez.lat + dLat, bati: merkez.lng - dLng, dogu: merkez.lng + dLng };
}

export type HucreIliskisi = "disarida" | "icinde" | "kesisiyor";

/**
 * Hücrenin daireye göre konumu. Belirsiz durumlar her zaman "kesisiyor" sayılır; bu hücrelerde
 * konum istenip sonuçlar tek tek filtrelendiği için yanlış sınıflandırma daire dışı sonuç sızdırmaz.
 */
export function hucreIliskisi(h: Dikdortgen, merkez: LatLng, yaricapM: number): HucreIliskisi {
  const koseler: LatLng[] = [
    { lat: h.guney, lng: h.bati },
    { lat: h.guney, lng: h.dogu },
    { lat: h.kuzey, lng: h.bati },
    { lat: h.kuzey, lng: h.dogu },
  ];
  // Tüm köşeler (küçük bir güvenlik payıyla) dairenin içindeyse hücre tamamen içeridedir.
  if (koseler.every((k) => mesafeM(k, merkez) <= yaricapM * 0.995)) return "icinde";

  // Merkeze en yakın hücre noktası: merkezin hücreye kıstırılmış hâli.
  const enYakin: LatLng = {
    lat: Math.min(Math.max(merkez.lat, h.guney), h.kuzey),
    lng: Math.min(Math.max(merkez.lng, h.bati), h.dogu),
  };
  if (mesafeM(enYakin, merkez) > yaricapM * 1.005) return "disarida";
  return "kesisiyor";
}

/** Hücreyi 4 eşit alt hücreye böler (dörtlü ağaç). */
export function hucreyiBol(h: Dikdortgen): Dikdortgen[] {
  const ortaLat = (h.guney + h.kuzey) / 2;
  const ortaLng = (h.bati + h.dogu) / 2;
  return [
    { guney: h.guney, bati: h.bati, kuzey: ortaLat, dogu: ortaLng },
    { guney: h.guney, bati: ortaLng, kuzey: ortaLat, dogu: h.dogu },
    { guney: ortaLat, bati: h.bati, kuzey: h.kuzey, dogu: ortaLng },
    { guney: ortaLat, bati: ortaLng, kuzey: h.kuzey, dogu: h.dogu },
  ];
}

/** Hücrenin uzun kenarı, metre. */
export function hucreKenariM(h: Dikdortgen): number {
  const ortaLat = (h.guney + h.kuzey) / 2;
  const yukseklik = (h.kuzey - h.guney) * DERECE_BASINA_M;
  const genislik = (h.dogu - h.bati) * DERECE_BASINA_M * Math.cos(ortaLat * RAD);
  return Math.max(yukseklik, genislik);
}
