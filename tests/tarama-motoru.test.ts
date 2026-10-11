// Tarama hücre bölme ve tekilleştirme mantığı için birim testleri (veritabanı ve ağ yok).
import { describe, expect, it } from "vitest";
import type { Dikdortgen, LatLng, MetinAramaIstegi, PlacesIstemcisi } from "@/server/places/tipler";
import { daireyiKapsayanKare, hucreIliskisi, hucreyiBol, mesafeM } from "@/server/scan/geometri";
import { bolgeTara } from "@/server/scan/motor";

const MERKEZ: LatLng = { lat: 41.0, lng: 29.0 };

type Nokta = { id: string } & LatLng;

/** Places Text Search'ü taklit eder: dikdörtgen içindekileri, sayfa başı 20, en fazla 60 döndürür. */
function sahteIstemci(noktalar: Nokta[]) {
  const cagrilar: MetinAramaIstegi[] = [];
  const icindeMi = (n: LatLng, a: Dikdortgen) => n.lat >= a.guney && n.lat <= a.kuzey && n.lng >= a.bati && n.lng <= a.dogu;
  const istemci: PlacesIstemcisi = {
    async metinAra(istek) {
      cagrilar.push(istek);
      const hepsi = noktalar.filter((n) => icindeMi(n, istek.alan)).slice(0, 60);
      const bas = Number(istek.sayfaTokeni ?? 0);
      const sayfa = hepsi.slice(bas, bas + 20);
      return {
        yerler: sayfa.map((n) => (istek.konumIste ? { id: n.id, konum: { lat: n.lat, lng: n.lng } } : { id: n.id })),
        sonrakiSayfaTokeni: bas + 20 < hepsi.length ? String(bas + 20) : undefined,
      };
    },
    yerDetayi: async () => null,
    adresBul: async () => null,
  };
  return { istemci, cagrilar };
}

/** Merkez çevresinde, verilen yarı kenar (derece) içinde düzenli ızgara noktaları. */
function izgara(adet: number, yariKenar: number): Nokta[] {
  const kenar = Math.ceil(Math.sqrt(adet));
  const noktalar: Nokta[] = [];
  for (let i = 0; i < kenar; i++)
    for (let j = 0; j < kenar && noktalar.length < adet; j++)
      noktalar.push({
        id: `p${i}_${j}`,
        lat: MERKEZ.lat - yariKenar + ((i + 0.5) / kenar) * 2 * yariKenar,
        lng: MERKEZ.lng - yariKenar + ((j + 0.5) / kenar) * 2 * yariKenar,
      });
  return noktalar;
}

const temelParametreler = { merkez: MERKEZ, sorgu: "emlak ofisi", tur: "real_estate_agency", minHucreM: 200 };

describe("geometri", () => {
  it("kapsayan kare daireyi içerir, köşeleri dairenin dışındadır", () => {
    const kare = daireyiKapsayanKare(MERKEZ, 5000);
    expect(mesafeM(MERKEZ, { lat: kare.kuzey, lng: MERKEZ.lng })).toBeCloseTo(5000, -1);
    expect(mesafeM(MERKEZ, { lat: MERKEZ.lat, lng: kare.dogu })).toBeCloseTo(5000, -1);
    expect(mesafeM(MERKEZ, { lat: kare.kuzey, lng: kare.dogu })).toBeGreaterThan(5000);
    expect(hucreIliskisi(kare, MERKEZ, 5000)).toBe("kesisiyor");
  });

  it("hücre/daire ilişkisini doğru sınıflandırır", () => {
    const kucukMerkezde: Dikdortgen = { guney: 40.999, kuzey: 41.001, bati: 28.999, dogu: 29.001 };
    expect(hucreIliskisi(kucukMerkezde, MERKEZ, 5000)).toBe("icinde");
    const uzak: Dikdortgen = { guney: 41.5, kuzey: 41.6, bati: 29.5, dogu: 29.6 };
    expect(hucreIliskisi(uzak, MERKEZ, 5000)).toBe("disarida");
  });

  it("bölme 4 hücre üretir ve üst hücreyi tam kaplar", () => {
    const h: Dikdortgen = { guney: 0, kuzey: 2, bati: 10, dogu: 14 };
    const alt = hucreyiBol(h);
    expect(alt).toHaveLength(4);
    expect(Math.min(...alt.map((a) => a.guney))).toBe(0);
    expect(Math.max(...alt.map((a) => a.kuzey))).toBe(2);
    expect(Math.min(...alt.map((a) => a.bati))).toBe(10);
    expect(Math.max(...alt.map((a) => a.dogu))).toBe(14);
    const alan = (x: Dikdortgen) => (x.kuzey - x.guney) * (x.dogu - x.bati);
    expect(alt.reduce((t, a) => t + alan(a), 0)).toBeCloseTo(alan(h));
  });
});

describe("bolgeTara", () => {
  it("doymuş hücreleri bölerek 60 sonuç sınırının ötesindeki tüm yerleri bulur ve tekilleştirir", async () => {
    // 3 km yarıçaplı dairenin kapsadığı karede 400 yer; tek istekle en fazla 60 alınabilir.
    const noktalar = izgara(400, 0.025);
    const { istemci, cagrilar } = sahteIstemci(noktalar);
    const sonuc = await bolgeTara({ ...temelParametreler, yaricapM: 3000, butce: 500, istemci });

    const beklenen = noktalar.filter((n) => mesafeM(n, MERKEZ) <= 3000).map((n) => n.id).sort();
    expect(sonuc.placeIdler.slice().sort()).toEqual(beklenen);
    expect(new Set(sonuc.placeIdler).size).toBe(sonuc.placeIdler.length); // tekil
    expect(sonuc.kapsamTamam).toBe(true);
    expect(sonuc.istekSayisi).toBe(cagrilar.length);
    expect(cagrilar.length).toBeGreaterThan(1); // bölme gerçekleşti
  });

  it("daire dışındaki (karenin köşelerindeki) sonuçları eler", async () => {
    const koseler: Nokta[] = [
      { id: "ko-kd", lat: 41.04, lng: 29.05 },
      { id: "ko-gb", lat: 40.96, lng: 28.95 },
    ];
    const icerde: Nokta = { id: "merkez", lat: 41.0005, lng: 29.0005 };
    const { istemci } = sahteIstemci([...koseler, icerde]);
    const sonuc = await bolgeTara({ ...temelParametreler, yaricapM: 5000, butce: 50, istemci });
    expect(sonuc.placeIdler).toEqual(["merkez"]);
  });

  it("tamamen daire içindeki hücrelerde konum istemez (ücretsiz IDs Only), sınır hücrelerinde ister", async () => {
    const { istemci, cagrilar } = sahteIstemci(izgara(400, 0.025));
    await bolgeTara({ ...temelParametreler, yaricapM: 3000, butce: 500, istemci });
    for (const c of cagrilar) {
      expect(c.konumIste).toBe(hucreIliskisi(c.alan, MERKEZ, 3000) === "kesisiyor");
    }
    expect(cagrilar.some((c) => !c.konumIste)).toBe(true);
    expect(cagrilar.some((c) => hucreIliskisi(c.alan, MERKEZ, 3000) === "disarida")).toBe(false);
  });

  it("konumsuz (iç hücre) sonuçlar konum listesine girmez; sınır sonuçlarının konumu döner", async () => {
    const { istemci } = sahteIstemci(izgara(400, 0.025));
    const sonuc = await bolgeTara({ ...temelParametreler, yaricapM: 3000, butce: 500, istemci });
    expect(sonuc.konumlar.length).toBeGreaterThan(0);
    expect(sonuc.konumlar.length).toBeLessThan(sonuc.placeIdler.length);
    for (const k of sonuc.konumlar) expect(mesafeM(k, MERKEZ)).toBeLessThanOrEqual(3000);
  });

  it("istek bütçesini aşmaz ve eksik kapsamı bildirir", async () => {
    const { istemci, cagrilar } = sahteIstemci(izgara(400, 0.025));
    const sonuc = await bolgeTara({ ...temelParametreler, yaricapM: 3000, butce: 3, istemci });
    expect(cagrilar).toHaveLength(3);
    expect(sonuc.istekSayisi).toBe(3);
    expect(sonuc.kapsamTamam).toBe(false);
  });

  it("seyrek bölgede bölmeden tek istekle biter", async () => {
    const { istemci, cagrilar } = sahteIstemci(izgara(9, 0.01));
    const sonuc = await bolgeTara({ ...temelParametreler, yaricapM: 3000, butce: 50, istemci });
    expect(cagrilar).toHaveLength(1);
    expect(sonuc.placeIdler.length).toBeGreaterThan(0);
    expect(sonuc.kapsamTamam).toBe(true);
  });

  it("en küçük hücrede 60'tan fazla sonuç varsa 3 sayfa çeker ve kapsamı eksik bildirir", async () => {
    // 100 yer, merkezden biraz uzakta ~90 m'lik bir kümede; hücre en küçük boyuta inse de 60 sınırı aşılır.
    const kume = izgara(100, 0.0004).map((n) => ({ ...n, lat: n.lat + 0.002, lng: n.lng + 0.002 }));
    const { istemci } = sahteIstemci(kume);
    const sonuc = await bolgeTara({ ...temelParametreler, yaricapM: 1000, butce: 200, istemci, minHucreM: 400 });
    expect(sonuc.kapsamTamam).toBe(false);
    expect(sonuc.placeIdler).toHaveLength(60); // Places sınırı
  });
});
