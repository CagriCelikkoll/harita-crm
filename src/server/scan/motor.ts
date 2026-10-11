// Bölge tarama motoru. Saf modüldür: Places istemcisini parametre olarak alır, veritabanına dokunmaz.
//
// Algoritma (dörtlü ağaç):
//  1. Daireyi kapsayan kareyle başla.
//  2. Daire dışındaki hücreleri atla.
//  3. Tamamen daire içindeki hücrede yalnızca ID iste (Text Search Essentials IDs Only, ücretsiz).
//     Sınırı kesen hücrede konumu da iste (Text Search Pro) ve daire dışındaki sonuçları ele.
//  4. Hücrenin ilk sayfası doluysa ve devamı varsa (Places en fazla 60 sonuç verir) hücre doymuş
//     demektir: hücre bölünebiliyorsa 4'e böl ve kalan sayfaları ÇEKME (alt hücreler kapsar).
//     En küçük hücre boyutundaysa 3 sayfaya kadar devam et; 3. sayfa da doluysa kapsam eksik sayılır.
//  5. Sonuçları place_id ile tekilleştir. İstek bütçesi bitince dur ve kapsamın eksik olduğunu bildir.
//  Kuyruk genişlik öncelikli işlenir; bütçe bittiğinde alanın tamamı kaba çözünürlükte taranmış olur.
import { KotaDolduHatasi, type LatLng, type PlacesIstemcisi } from "../places/tipler";
import { daireyiKapsayanKare, hucreIliskisi, hucreKenariM, hucreyiBol, mesafeM } from "./geometri";

export const PLACES_AZAMI_SAYFA = 3;
export const SAYFA_BOYUTU = 20;

export type TaramaParametreleri = {
  merkez: LatLng;
  yaricapM: number;
  sorgu: string;
  tur: string;
  /** Bu taramada yapılabilecek en fazla Places isteği. */
  butce: number;
  /** Bu boyutun altındaki hücreler bölünmez (metre). */
  minHucreM?: number;
  istemci: PlacesIstemcisi;
  ilerleme?: (durum: { istekSayisi: number; bulunanSayisi: number }) => void;
};

export type TaramaSonucu = {
  placeIdler: string[];
  /** Yalnızca sınır hücrelerinden gelen (konumu istenen) yerler. En fazla 30 gün saklanabilir. */
  konumlar: { placeId: string; lat: number; lng: number }[];
  istekSayisi: number;
  hucreSayisi: number;
  /** false: bütçe bitti, aylık kota doldu veya en küçük hücrede 60'tan fazla sonuç vardı. */
  kapsamTamam: boolean;
  /** Tarama, çalışma alanının aylık Places kotası dolduğu için durdu. */
  kotaDoldu: boolean;
};

export async function bolgeTara(p: TaramaParametreleri): Promise<TaramaSonucu> {
  const minHucreM = p.minHucreM ?? 400;
  const bulunan = new Map<string, LatLng | undefined>();
  const kuyruk = [daireyiKapsayanKare(p.merkez, p.yaricapM)];
  let istekSayisi = 0;
  let hucreSayisi = 0;
  let kapsamTamam = true;
  let kotaDoldu = false;

  disDongu: while (kuyruk.length) {
    const hucre = kuyruk.shift()!;
    const iliski = hucreIliskisi(hucre, p.merkez, p.yaricapM);
    if (iliski === "disarida") continue;

    hucreSayisi++;
    const konumIste = iliski === "kesisiyor";
    const bolunebilir = hucreKenariM(hucre) / 2 >= minHucreM;
    let sayfaTokeni: string | undefined;
    let sonSayfaDolu = false;

    for (let sayfa = 0; sayfa < PLACES_AZAMI_SAYFA; sayfa++) {
      if (istekSayisi >= p.butce) {
        kapsamTamam = false;
        break disDongu;
      }
      let yanit: Awaited<ReturnType<PlacesIstemcisi["metinAra"]>>;
      try {
        yanit = await p.istemci.metinAra({ sorgu: p.sorgu, tur: p.tur, alan: hucre, konumIste, sayfaTokeni });
      } catch (hata) {
        if (!(hata instanceof KotaDolduHatasi)) throw hata;
        // Aylık kota doldu: istek yapılmadı. Bütçe bitmiş gibi dur; bulunanlar kısmi sonuçtur.
        kapsamTamam = false;
        kotaDoldu = true;
        break disDongu;
      }
      istekSayisi++;

      for (const yer of yanit.yerler) {
        if (konumIste && (!yer.konum || mesafeM(yer.konum, p.merkez) > p.yaricapM)) continue;
        if (!bulunan.has(yer.id) || (yer.konum && !bulunan.get(yer.id))) bulunan.set(yer.id, yer.konum);
      }
      p.ilerleme?.({ istekSayisi, bulunanSayisi: bulunan.size });

      sonSayfaDolu = sayfa === PLACES_AZAMI_SAYFA - 1 && yanit.yerler.length >= SAYFA_BOYUTU;
      sayfaTokeni = yanit.sonrakiSayfaTokeni;
      if (!sayfaTokeni) break;
      if (bolunebilir) {
        kuyruk.push(...hucreyiBol(hucre)); // doymuş hücre: alt hücrelerle devam et
        break;
      }
    }
    // Places 60 sonuçtan sonra sayfa tokeni vermez. En küçük hücrede 3. sayfa da doluysa
    // hücrede 60'tan fazla yer olabilir: o hücredeki her sonuç alınamamış olabilir.
    if (sonSayfaDolu) kapsamTamam = false;
  }

  return {
    placeIdler: [...bulunan.keys()],
    konumlar: [...bulunan.entries()]
      .filter((e): e is [string, LatLng] => Boolean(e[1]))
      .map(([placeId, k]) => ({ placeId, lat: k.lat, lng: k.lng })),
    istekSayisi,
    hucreSayisi,
    kapsamTamam,
    kotaDoldu,
  };
}
