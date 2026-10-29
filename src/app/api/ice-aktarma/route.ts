// Kişi içe aktarma: dosya yükleme (CSV / XLSX). Dosya ayrıştırılır, satırlar oturumda geçici tutulur;
// yanıtta başlıklar, ilk 20 satır ve önerilen sütun eşlemesi döner. Hiçbir kayıt yazılmaz.
import { NextResponse } from "next/server";
import { ICE_AKTARMA_AZAMI_BAYT } from "@/lib/ice-aktarma";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { IceAktarmaHatasi, iceAktarmaBaslat } from "@/server/servisler/ice-aktarma";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  // Gövde (multipart) dosya sınırının biraz üstündeyse okumadan reddet.
  if (Number(istek.headers.get("content-length") ?? 0) > ICE_AKTARMA_AZAMI_BAYT + 64 * 1024) {
    return gecersiz("Dosya en fazla 5 MB olabilir.");
  }
  const form = await istek.formData().catch(() => null);
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
