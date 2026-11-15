// Bu numaranın WABA'sını çalışma alanının Meta uygulamasının webhook'larına abone eder (POST /{waba-id}/subscribed_apps).
// Yalnızca yöneticinin açık isteğiyle.
import { NextResponse } from "next/server";
import { ayniKaynakMi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { yoneticiOlmali } from "@/server/repo/baglam";
import { webhookAboneligiEtkinlestir } from "@/server/servisler/whatsapp-api";
import { BASLIK, hataYaniti } from "@/server/whatsapp-api-yanit";

export async function POST(istek: Request, { params }: RouteContext<"/api/ayarlar/whatsapp-api/[id]/abonelik">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  try {
    yoneticiOlmali(ctx);
    await webhookAboneligiEtkinlestir(ctx, id);
  } catch (hata) {
    return hataYaniti(hata);
  }
  return NextResponse.json({ tamam: true }, { headers: BASLIK });
}
