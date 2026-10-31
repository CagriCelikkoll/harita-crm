// Liste öğesi için "WhatsApp'ta aç": oturum + kiracı + kullanıcı sahipliği, şablon, günlük sınır ve alıcı kuralları;
// numara ek_telefon'dan ya da gerekirse Places'tan canlı (kota düşer, hiçbir yere yazılmaz). Cep numarasıysa
// wa.me'ye 302; değilse öğe "otomatik_atlandi" olur ve liste nedeniyle birlikte gösterilir.
// Origin kontrolü yok (üst düzey GET gezinmesi): bkz. src/server/whatsapp-yonlendirme.ts.
import { NextResponse } from "next/server";
import { ayniKaynakMi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { donusAdresi, whatsappAc } from "@/server/servisler/whatsapp";
import { caprazSiteMi, disariYonlendir, iceriYonlendir } from "@/server/whatsapp-yonlendirme";

export async function GET(istek: Request, { params }: RouteContext<"/api/whatsapp/ac/[id]">) {
  if (caprazSiteMi(istek)) return iceriYonlendir("/iletisim?wa=capraz#whatsapp");
  const ctx = await apiBaglami();
  if (!ctx) return iceriYonlendir("/giris");
  const sonuc = await whatsappAc(ctx, (await params).id);
  return sonuc.tur === "yonlendir" ? disariYonlendir(sonuc.url) : iceriYonlendir(`${donusAdresi("/iletisim", sonuc)}#whatsapp`);
}

/**
 * Aynı işlem, liste ekranının sayfa içi çağrısı için (JSON): { url, googleAd? } ya da { geri }. İstemci yeni sekmeyi
 * tıklama anında açar ve adresi buna göre verir; numara Places'tan çözüldüyse aynı çağrının döndürdüğü ad (kaydın
 * kendi adı yoksa) yalnızca o sayfa görünümünün belleğinde gösterilir. Origin denetimi yapılır (sayfa içi istek).
 */
export async function POST(istek: Request, { params }: RouteContext<"/api/whatsapp/ac/[id]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const sonuc = await whatsappAc(ctx, (await params).id);
  const govde =
    sonuc.tur === "yonlendir"
      ? { url: sonuc.url, ...(sonuc.googleAd ? { googleAd: sonuc.googleAd } : {}) }
      : { geri: `${donusAdresi("/iletisim", sonuc)}#whatsapp` };
  return NextResponse.json(govde, { headers: { "Cache-Control": "no-store" } });
}
