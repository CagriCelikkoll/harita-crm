// Yeni webhook verify token üretir; YALNIZCA bu yanıtta bir kez döner. Webhook yeniden doğrulanana kadar test modu
// açık kalır. Yalnızca yönetici.
import { NextResponse } from "next/server";
import { ayniKaynakMi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { yoneticiOlmali } from "@/server/repo/baglam";
import { baglantiDurumu, verifyTokenYenile } from "@/server/servisler/whatsapp-api";
import { BASLIK, hataYaniti } from "@/server/whatsapp-api-yanit";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  try {
    yoneticiOlmali(ctx);
    const verifyToken = verifyTokenYenile(ctx);
    return NextResponse.json({ baglanti: baglantiDurumu(ctx), verifyToken }, { headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}
