// Görselli WhatsApp şablonu için kampanya görseli yükleme (yalnızca yönetici). Gövde akış halinde, sınırla okunur;
// tür dosyanın imzasından belirlenir (JPEG / PNG), dosya adı ve bildirilen tür dikkate alınmaz. Yanıt: görselin
// kimliği ve önizleme adresi (/api/medya/{id}, oturum ve çalışma alanı denetimli).
import { NextResponse } from "next/server";
import { KAMPANYA_GORSEL_AZAMI_BAYT } from "@/lib/whatsapp-api";
import { ayniKaynakMi, cokBuyuk, gecersiz, govdeOku, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YetkiHatasi } from "@/server/repo/baglam";
import { KampanyaGorselHatasi, kampanyaGorseliYukle } from "@/server/servisler/kampanya-gorseli";

/** Multipart gövde: dosya sınırı + sınır çizgileri ve alan başlıkları için pay. */
const AZAMI_GOVDE = KAMPANYA_GORSEL_AZAMI_BAYT + 64 * 1024;

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const govde = await govdeOku(istek, AZAMI_GOVDE);
  if (!govde) return cokBuyuk("Görsel en fazla 5 MB olabilir.");
  const tur = istek.headers.get("content-type") ?? "";
  const form = await new Response(govde, { headers: { "content-type": tur } }).formData().catch(() => null);
  const dosya = form?.get("dosya");
  if (!(dosya instanceof File)) return gecersiz("Görsel seçin.");
  try {
    const gorsel = kampanyaGorseliYukle(ctx, dosya.name, new Uint8Array(await dosya.arrayBuffer()));
    return NextResponse.json({ gorsel }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof KampanyaGorselHatasi) return gecersiz(hata.message);
    if (hata instanceof YetkiHatasi) return yasak("Kampanya görselini yalnızca yönetici yükleyebilir.");
    throw hata;
  }
}
