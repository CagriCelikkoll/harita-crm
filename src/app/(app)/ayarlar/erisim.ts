// Ayar bölümü sayfaları için: bölüm bu role açık değilse (ör. üye, kanal ayarları) ilk bölüme yönlendirir.
// Yalnızca gezinme içindir; değişiklikler sunucuda ayrıca yetki denetiminden geçer.
import "server-only";
import { redirect } from "next/navigation";
import { ayarBolumuAcikMi, ILK_AYAR_BOLUMU } from "@/lib/ayar-bolumleri";
import { sayfaBaglami } from "@/server/oturum";

export async function ayarBolumuBaglami(yol: string) {
  const b = await sayfaBaglami();
  if (!ayarBolumuAcikMi(yol, b.ctx.rol)) redirect(ILK_AYAR_BOLUMU);
  return b;
}
