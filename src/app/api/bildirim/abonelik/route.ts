// Bu cihazın gelen kutusu bildirimi aboneliği (Web Push). POST: kaydet ya da yenile (izin kullanıcı düğmeye basınca
// tarayıcıda istenir); DELETE: sil (bildirimi kapatma). Her kullanıcı yalnızca kendi aboneliğini yönetir.
// Adres yalnızca bilinen push sunucularından biri olabilir (src/lib/bildirim.ts). Gönderim işçide. Uygulama her
// açılışta (izin verilmişse) bu cihazın aboneliğini yeniden gönderir: ortak cihazda abonelik oturumdaki kişiye geçer.
import { NextResponse } from "next/server";
import { cihazAciklamasi, PushAboneligiGirdisi, PushAdresiGirdisi } from "@/lib/bildirim";
import { ayniKaynakMi, cokBuyuk, gecersiz, govdeOku, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { pushAboneligiKaydet, pushAboneligiSil } from "@/server/repo/push-abonelikleri";
import { pushAdresiniDevral } from "@/server/repo/sistem/bildirim";
import { vapidAyarlari } from "@/server/servisler/bildirim";

const GOVDE_AZAMI = 8 * 1024;
const yanit = (veri: unknown, durum = 200) => NextResponse.json(veri, { status: durum, headers: { "Cache-Control": "no-store" } });

const BUYUK = Symbol("buyuk");

async function jsonOku(istek: Request): Promise<unknown> {
  const govde = await govdeOku(istek, GOVDE_AZAMI);
  if (!govde) return BUYUK;
  try {
    return JSON.parse(new TextDecoder().decode(govde));
  } catch {
    return null;
  }
}

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  if (!vapidAyarlari()) return yanit({ hata: "Bildirimler bu sunucuda kapalı (VAPID anahtarları tanımlı değil)." }, 409);
  const veri = await jsonOku(istek);
  if (veri === BUYUK) return cokBuyuk();
  const sonuc = PushAboneligiGirdisi.safeParse(veri);
  if (!sonuc.success) return gecersiz(sonuc.error.issues[0]?.message ?? "Geçersiz abonelik.");
  const cihaz = pushAboneligiKaydet(ctx, sonuc.data, cihazAciklamasi(istek.headers.get("user-agent")));
  // Aynı tarayıcıda önceden oturum açmış başka kullanıcının aboneliği bu kullanıcıya geçer (ortak cihaz).
  pushAdresiniDevral(sonuc.data.endpoint, ctx.userId);
  return yanit({ id: cihaz.id });
}

export async function DELETE(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const veri = await jsonOku(istek);
  if (veri === BUYUK) return cokBuyuk();
  const sonuc = PushAdresiGirdisi.safeParse(veri);
  if (!sonuc.success) return gecersiz("Geçersiz istek.");
  return yanit({ silindi: pushAboneligiSil(ctx, sonuc.data.endpoint) });
}
