// Places içeriğini görüntüleme anında canlı çeker. Sonuçlar SAKLANMAZ ve önbelleğe alınmaz;
// yalnızca bu isteğin belleğinde yaşar. (Tek istisna: konum, 30 günlük place_locations tablosuna.)
// Her istekten önce kiracının aylık kotası ayrılır; kota doluysa istek yapılmaz ve sonuç "kota" olur.
import { placesIstemcisiOlustur } from "../places/istemci";
import { KotaDolduHatasi, type DetayKapsami, type YerBilgisi } from "../places/tipler";
import type { TenantContext } from "../repo/baglam";
import { konumlariKaydet } from "../repo/konumlar";
import { kotaKapisi } from "./kota";

export type CanliSonuc =
  | { durum: "tamam"; yer: YerBilgisi }
  | { durum: "bulunamadi" }
  | { durum: "kota" } // aylık kota dolu: Places çağrısı yapılmadı
  | { durum: "hata"; mesaj: string };

const ES_ZAMANLI = 5;

export async function canliBilgiGetir(
  ctx: TenantContext,
  placeIdler: string[],
  kapsam: DetayKapsami,
): Promise<Map<string, CanliSonuc>> {
  const istemci = placesIstemcisiOlustur({ kota: kotaKapisi(ctx) });
  const sonuclar = new Map<string, CanliSonuc>();
  const kuyruk = [...new Set(placeIdler)];
  let kotaDoldu = false;

  async function isci() {
    for (let placeId = kuyruk.shift(); placeId; placeId = kuyruk.shift()) {
      if (kotaDoldu) {
        sonuclar.set(placeId, { durum: "kota" });
        continue;
      }
      try {
        const yer = await istemci.yerDetayi(placeId, kapsam);
        sonuclar.set(placeId, yer ? { durum: "tamam", yer } : { durum: "bulunamadi" });
      } catch (hata) {
        if (hata instanceof KotaDolduHatasi) {
          kotaDoldu = true;
          sonuclar.set(placeId, { durum: "kota" });
        } else {
          sonuclar.set(placeId, { durum: "hata", mesaj: (hata as Error).message });
        }
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
  return placesIstemcisiOlustur({ kota: kotaKapisi(ctx) }).adresBul(metin);
}

/** Listede / incelemede / kampanya alıcılarında istenince gösterilen Google bilgisi (yalnızca ad ve adres). */
export type ListeBilgisi = { ad: string; adres: string | null } | { hata: string };

export function listeBilgisi(c: CanliSonuc | undefined): ListeBilgisi {
  if (c?.durum === "tamam") return { ad: c.yer.ad, adres: c.yer.adres ?? null };
  if (c?.durum === "kota") return { hata: "İşletme bilgisi gösterilemiyor (kota doldu)" };
  if (c?.durum === "bulunamadi") return { hata: "Google'da artık bulunmuyor" };
  return { hata: "Bilgi alınamadı" };
}
