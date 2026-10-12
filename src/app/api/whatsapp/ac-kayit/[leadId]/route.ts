// Kayıt detayı için "WhatsApp'ta aç": liste öğesindeki kurallarla aynı (oturum, kiracı, ret / engel / izin,
// günlük sınır); numara ek_telefon ya da Places (kota düşer, saklanmaz). Uygunsa wa.me'ye 302, değilse kayda
// nedeniyle geri döner. Origin kontrolü yok (üst düzey GET gezinmesi): bkz. src/server/whatsapp-yonlendirme.ts.
import { apiBaglami } from "@/server/oturum";
import { donusAdresi, kayitWhatsappAc } from "@/server/servisler/whatsapp";
import { caprazSiteMi, disariYonlendir, iceriYonlendir } from "@/server/whatsapp-yonlendirme";

export async function GET(istek: Request, { params }: RouteContext<"/api/whatsapp/ac-kayit/[leadId]">) {
  const { leadId } = await params;
  if (caprazSiteMi(istek)) return iceriYonlendir("/kayitlar?wa=capraz");
  const ctx = await apiBaglami();
  if (!ctx) return iceriYonlendir("/giris");
  const sonuc = await kayitWhatsappAc(ctx, leadId);
  if (!sonuc) return iceriYonlendir("/kayitlar?wa=bulunamadi");
  return sonuc.tur === "yonlendir"
    ? disariYonlendir(sonuc.url)
    : iceriYonlendir(donusAdresi(`/kayitlar?secili=${encodeURIComponent(leadId)}`, sonuc));
}
