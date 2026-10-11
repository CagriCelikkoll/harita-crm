// PLACES_MOCK=true iken kullanılan sahte Places istemcisi. Gerçek API'nin davranışını taklit eder:
// - Text Search istek başına en fazla 20, toplam en fazla 60 sonuç (3 sayfa) döndürür.
// - Konum yalnızca istenirse döner.
// Sahte işletmeler sabit bir enlem/boylam ızgarasına deterministik olarak yerleştirilir.
import { cagriBirimi, type IstemciSecenekleri } from "./istemci";
import { kotaKontrol, type LatLng, type MetinAramaIstegi, type PlacesIstemcisi, type YerBilgisi } from "./tipler";

const ADIM = 0.004; // ≈ 445 m enlem
const YOGUNLUK = 0.35; // ızgara noktalarının ne kadarında işletme var
const SAYFA = 20;
const AZAMI = 60;

function ozet(...parcalar: (string | number)[]) {
  let h = 2166136261;
  for (const c of parcalar.join("|")) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296; // [0, 1)
}

function noktaKonumu(tur: string, i: number, j: number): LatLng {
  return {
    lat: (i + 0.15 + 0.7 * ozet("y", tur, i, j)) * ADIM,
    lng: (j + 0.15 + 0.7 * ozet("x", tur, i, j)) * ADIM,
  };
}

function idCoz(id: string) {
  const m = /^mock_([a-z_]+)_(-?\d+)_(-?\d+)$/.exec(id);
  return m ? { tur: m[1], i: Number(m[2]), j: Number(m[3]) } : null;
}

const TUR_ADI: Record<string, string> = {
  real_estate_agency: "Emlak",
  car_dealer: "Otomotiv",
  car_repair: "Oto Servis",
  restaurant: "Lokanta",
  cafe: "Kafe",
  hair_care: "Kuaför",
  beauty_salon: "Güzellik",
  dentist: "Diş Kliniği",
  pharmacy: "Eczanesi",
  lawyer: "Hukuk Bürosu",
  accounting: "Mali Müşavirlik",
  gym: "Spor Merkezi",
};
const ISIMLER = ["Yıldız", "Deniz", "Güneş", "Mavi", "Ege", "Anadolu", "Çınar", "Lale", "Pera", "Kordon", "Liman", "Bora"];

export function mockPlacesIstemcisi({ kota, istekSayaci }: IstemciSecenekleri = {}): PlacesIstemcisi {
  const gecikme = () => new Promise((r) => setTimeout(r, Number(process.env.PLACES_MOCK_GECIKME_MS ?? 120)));

  return {
    async metinAra(istek: MetinAramaIstegi) {
      kotaKontrol(kota, cagriBirimi(istek.konumIste ? "taramaKonumlu" : "taramaYalnizcaId")); // gerçek istemci gibi: kota yoksa istek yapılmaz
      await gecikme();
      istekSayaci?.(1);
      const { alan, tur } = istek;
      const bulunan: { id: string; konum: LatLng; sira: number }[] = [];
      for (let i = Math.floor(alan.guney / ADIM); i <= Math.floor(alan.kuzey / ADIM); i++) {
        for (let j = Math.floor(alan.bati / ADIM); j <= Math.floor(alan.dogu / ADIM); j++) {
          if (ozet("var", tur, i, j) >= YOGUNLUK) continue;
          const konum = noktaKonumu(tur, i, j);
          if (konum.lat < alan.guney || konum.lat > alan.kuzey || konum.lng < alan.bati || konum.lng > alan.dogu) continue;
          bulunan.push({ id: `mock_${tur}_${i}_${j}`, konum, sira: ozet("sira", tur, i, j) });
        }
      }
      bulunan.sort((a, b) => a.sira - b.sira); // "alaka" sırası
      const baslangic = Number(istek.sayfaTokeni ?? 0);
      const toplam = Math.min(bulunan.length, AZAMI);
      const sayfa = bulunan.slice(baslangic, Math.min(baslangic + SAYFA, toplam));
      const sonraki = baslangic + SAYFA < toplam ? String(baslangic + SAYFA) : undefined;
      return {
        yerler: sayfa.map((y) => (istek.konumIste ? { id: y.id, konum: y.konum } : { id: y.id })),
        sonrakiSayfaTokeni: sonraki,
      };
    },

    async yerDetayi(placeId: string, kapsam): Promise<YerBilgisi | null> {
      kotaKontrol(kota, cagriBirimi(kapsam)); // gerçek istemci gibi: kota yoksa istek yapılmaz
      await gecikme();
      istekSayaci?.(1);
      const c = idCoz(placeId);
      if (!c) return null;
      const temel = mockTemelBilgi(placeId, c);
      // Gerçek API gibi: liste maskesi yalnızca ad ve adres döndürür.
      return kapsam === "liste" ? { id: placeId, ad: temel.ad, adres: temel.adres } : temel;
    },

    async adresBul(metin: string) {
      kotaKontrol(kota, cagriBirimi("adres")); // gerçek istemci gibi: kota yoksa istek yapılmaz
      await gecikme();
      istekSayaci?.(1);
      // Kadıköy çevresinde metne göre küçük bir sapma.
      return {
        lat: 40.99 + (ozet("lat", metin) - 0.5) * 0.04,
        lng: 29.03 + (ozet("lng", metin) - 0.5) * 0.04,
        adres: `${metin} (örnek konum)`,
      };
    },
  };
}

function mockTemelBilgi(placeId: string, c: { tur: string; i: number; j: number }): YerBilgisi {
  const konum = noktaKonumu(c.tur, c.i, c.j);
  const n = Math.floor(ozet("no", placeId) * 900) + 100;
  const tel = String(Math.floor(ozet("tel", placeId) * 1e7)).padStart(7, "0");
  const isim = ISIMLER[Math.floor(ozet("ad", placeId) * ISIMLER.length)];
  return {
    id: placeId,
    ad: `${isim} ${TUR_ADI[c.tur] ?? "İşletme"} ${n}`,
    adres: `Örnek Mah. ${n % 90}. Sk. No:${(n % 40) + 1}, Kadıköy/İstanbul (örnek veri)`,
    telefon: `0 (216) ${tel.slice(0, 3)} ${tel.slice(3, 5)} ${tel.slice(5)}`,
    telefonUluslararasi: `+90 216 ${tel.slice(0, 3)} ${tel.slice(3, 5)} ${tel.slice(5)}`,
    webSitesi: ozet("web", placeId) < 0.5 ? `https://ornek-${n}.example.com` : undefined,
    googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${konum.lat},${konum.lng}`,
    puan: Math.round((3 + ozet("puan", placeId) * 2) * 10) / 10,
    puanSayisi: Math.floor(ozet("sayi", placeId) * 300),
    konum,
    isletmeDurumu: "OPERATIONAL",
  };
}
