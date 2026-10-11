// Places içeriğini görüntüleme anında canlı çeker. Sonuçlar SAKLANMAZ ve önbelleğe alınmaz;
// yalnızca bu isteğin belleğinde yaşar. (Tek istisna: konum, 30 günlük place_locations tablosuna.)
import { placesIstemcisiOlustur } from "../places/istemci";
import type { DetayKapsami, YerBilgisi } from "../places/tipler";
import type { TenantContext } from "../repo/baglam";
import { konumlariKaydet } from "../repo/konumlar";
import { placesIstegiSay } from "../repo/kullanim";

export type CanliSonuc = { durum: "tamam"; yer: YerBilgisi } | { durum: "bulunamadi" } | { durum: "hata"; mesaj: string };

const ES_ZAMANLI = 5;

export async function canliBilgiGetir(
  ctx: TenantContext,
  placeIdler: string[],
  kapsam: DetayKapsami,
): Promise<Map<string, CanliSonuc>> {
  const istemci = placesIstemcisiOlustur({ istekSayaci: (adet) => placesIstegiSay(ctx, adet) });
  const sonuclar = new Map<string, CanliSonuc>();
  const kuyruk = [...new Set(placeIdler)];

  async function isci() {
    for (let placeId = kuyruk.shift(); placeId; placeId = kuyruk.shift()) {
      try {
        const yer = await istemci.yerDetayi(placeId, kapsam);
        sonuclar.set(placeId, yer ? { durum: "tamam", yer } : { durum: "bulunamadi" });
      } catch (hata) {
        sonuclar.set(placeId, { durum: "hata", mesaj: (hata as Error).message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(ES_ZAMANLI, kuyruk.length) }, isci));

  const konumlar = [...sonuclar.values()].flatMap((s) =>
    s.durum === "tamam" && s.yer.konum ? [{ placeId: s.yer.id, ...s.yer.konum }] : [],
  );
  konumlariKaydet(ctx, konumlar);
  return sonuclar;
}

export async function adresiKonumaCevir(ctx: TenantContext, metin: string) {
  const istemci = placesIstemcisiOlustur({ istekSayaci: (adet) => placesIstegiSay(ctx, adet) });
  return istemci.adresBul(metin);
}
