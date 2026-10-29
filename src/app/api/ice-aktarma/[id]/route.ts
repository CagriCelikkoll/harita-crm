// İçe aktarma oturumunu iptal eder (geçici satırlar silinir).
import { ayniKaynakMi, bulunamadi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { iceAktarmaIptal } from "@/server/repo/ice-aktarmalar";

export async function DELETE(istek: Request, { params }: RouteContext<"/api/ice-aktarma/[id]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  return iceAktarmaIptal(ctx, (await params).id) ? new Response(null, { status: 204 }) : bulunamadi();
}
