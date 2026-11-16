// Temsilci sohbeti açtı: okunmamış sıfırlanır; ayar açıksa son gelen mesaja bir kez okundu bildirimi gider.
import { NextResponse } from "next/server";
import { ayniKaynakMi, bulunamadi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { sohbetOkundu } from "@/server/servisler/gelen-kutusu";

export async function POST(istek: Request, { params }: RouteContext<"/api/sohbetler/[id]/okundu">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const sonuc = await sohbetOkundu(ctx, id);
  return sonuc ? NextResponse.json(sonuc) : bulunamadi();
}
