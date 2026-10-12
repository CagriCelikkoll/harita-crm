// Liste öğesinin sonucu: "gonderdim" (günlük sayaç + olay + durum), "atla", "ret" (ret akışı).
// Öğe kullanıcının kendisine ait değilse 404.
import { NextResponse } from "next/server";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { listeDurumu, SonucGirdisi, sonucBildir, WhatsappHatasi } from "@/server/servisler/whatsapp";

export async function POST(istek: Request, { params }: RouteContext<"/api/whatsapp/liste/[id]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const girdi = SonucGirdisi.safeParse(await istek.json().catch(() => null));
  if (!girdi.success) return gecersiz(girdi.error.issues[0]?.message ?? "Geçersiz sonuç.");
  try {
    sonucBildir(ctx, (await params).id, girdi.data);
  } catch (hata) {
    if (hata instanceof WhatsappHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durumKodu });
    throw hata;
  }
  return NextResponse.json(listeDurumu(ctx), { headers: { "Cache-Control": "no-store" } });
}
