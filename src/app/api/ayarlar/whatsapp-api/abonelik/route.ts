// WABA'yı bu çalışma alanının Meta uygulamasının webhook'larına abone eder (POST /{waba-id}/subscribed_apps).
// Yalnızca yöneticinin açık isteğiyle.
import { NextResponse } from "next/server";
import { ayniKaynakMi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { yoneticiOlmali } from "@/server/repo/baglam";
import { webhookAboneligiEtkinlestir } from "@/server/servisler/whatsapp-api";
import { BASLIK, hataYaniti } from "@/server/whatsapp-api-yanit";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  try {
    yoneticiOlmali(ctx);
    await webhookAboneligiEtkinlestir(ctx);
  } catch (hata) {
    return hataYaniti(hata);
  }
  return NextResponse.json({ tamam: true }, { headers: BASLIK });
}
