// SMS / WhatsApp için telefon: kayıtta ek_telefon yoksa gönderim anında Places'tan canlı alınır.
// Numara SAKLANMAZ (ne kayda ne kuyruğa): yalnızca o gönderimde kullanılır. Çağrı kiracının Places kotasından
// "telefon" (Place Details Enterprise) birimi düşer; kota doluysa çağrı yapılmaz.
import type { TenantContext } from "../repo/baglam";
import { canliBilgiGetir } from "./canli-bilgi";

export type PlacesTelefonu =
  | { durum: "tamam"; telefon: string | null; ad: string }
  | { durum: "bulunamadi" }
  | { durum: "kota" }
  | { durum: "hata"; mesaj: string };

export async function placesTelefonuGetir(ctx: TenantContext, placeId: string): Promise<PlacesTelefonu> {
  const sonuc = (await canliBilgiGetir(ctx, [placeId], "telefon")).get(placeId);
  if (!sonuc) return { durum: "hata", mesaj: "Places yanıtı alınamadı." };
  if (sonuc.durum === "tamam") {
    return { durum: "tamam", telefon: sonuc.yer.telefonUluslararasi ?? sonuc.yer.telefon ?? null, ad: sonuc.yer.ad };
  }
  return sonuc;
}
