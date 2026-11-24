// Gelen kutusundan dosya gönderme (görsel, video, belge): multipart gövde, alanlar: dosya, istemciKimligi, aciklama?,
// yanitlananId?. Gövde akış halinde, sınırla okunur (en büyük tür belge, 20 MB; sunucunun gövde sınırı 25 MB). Tür ve
// boyut kuralları, 24 saat penceresi, kota ve Meta'ya yükleme servistedir (servisler/gelen-kutusu.ts sohbetMedyasiGonder).
// Meta reddederse 201 ile "failed" mesaj ve uyarı döner (mesaj sohbette görünür, yeniden denenebilir).
import { NextResponse } from "next/server";
import { GIDEN_MEDYA_KURALLARI } from "@/lib/gelen-kutusu";
import { ayniKaynakMi, cokBuyuk, gecersiz, govdeOku, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { GelenKutusuHatasi, MedyaGirdisi, sohbetMedyasiGonder } from "@/server/servisler/gelen-kutusu";

/** En büyük dosya + sınır çizgileri, alan başlıkları ve açıklama için pay. */
const AZAMI_GOVDE = GIDEN_MEDYA_KURALLARI.document.azami + 64 * 1024;

const metinAlani = (f: FormData, ad: string) => {
  const v = f.get(ad);
  return typeof v === "string" ? v : undefined;
};

export async function POST(istek: Request, { params }: RouteContext<"/api/sohbetler/[id]/medya">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const govde = await govdeOku(istek, AZAMI_GOVDE);
  if (!govde) return cokBuyuk("Dosya çok büyük: görsel en fazla 5 MB, video 16 MB, belge 20 MB olabilir.");
  const form = await new Response(govde, { headers: { "content-type": istek.headers.get("content-type") ?? "" } }).formData().catch(() => null);
  const dosya = form?.get("dosya");
  if (!form || !(dosya instanceof File)) return gecersiz("Dosya seçin.");
  const alanlar = MedyaGirdisi.safeParse({
    istemciKimligi: metinAlani(form, "istemciKimligi"),
    aciklama: metinAlani(form, "aciklama"),
    yanitlananId: metinAlani(form, "yanitlananId") || undefined,
  });
  if (!alanlar.success) return gecersiz(alanlar.error.issues[0]?.message ?? "Geçersiz istek.");
  try {
    const sonuc = await sohbetMedyasiGonder(ctx, id, { ...alanlar.data, dosyaAdi: dosya.name, bayt: new Uint8Array(await dosya.arrayBuffer()) });
    return NextResponse.json(sonuc, { status: sonuc.tekrar ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof GelenKutusuHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durum });
    throw hata;
  }
}
