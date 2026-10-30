// Kişi içe aktarma: dosya yükleme (CSV / XLSX). Dosya ayrıştırılır, satırlar oturumda geçici tutulur;
// yanıtta başlıklar, ilk 20 satır ve önerilen sütun eşlemesi döner. Hiçbir kayıt yazılmaz.
import { NextResponse } from "next/server";
import { ICE_AKTARMA_AZAMI_BAYT } from "@/lib/ice-aktarma";
import { ayniKaynakMi, cokBuyuk, gecersiz, govdeOku, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { IceAktarmaHatasi, iceAktarmaBaslat } from "@/server/servisler/ice-aktarma";

/** Multipart gövde: dosya sınırı + sınır çizgileri ve alan başlıkları için pay. */
const AZAMI_GOVDE = ICE_AKTARMA_AZAMI_BAYT + 64 * 1024;

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  // Gövde akış halinde, sayaçla okunur (chunked istekte Content-Length yoktur); sınır aşılınca okuma kesilir.
  const govde = await govdeOku(istek, AZAMI_GOVDE);
  if (!govde) return cokBuyuk("Dosya en fazla 5 MB olabilir.");
  const tur = istek.headers.get("content-type") ?? "";
  const form = await new Response(govde, { headers: { "content-type": tur } }).formData().catch(() => null);
  const dosya = form?.get("dosya");
  if (!(dosya instanceof File)) return gecersiz("Dosya seçin.");
  try {
    const sonuc = await iceAktarmaBaslat(ctx, dosya.name, new Uint8Array(await dosya.arrayBuffer()));
    return NextResponse.json(sonuc, { headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof IceAktarmaHatasi) return gecersiz(hata.message);
    throw hata;
  }
}
