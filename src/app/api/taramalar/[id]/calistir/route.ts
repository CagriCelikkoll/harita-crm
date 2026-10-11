import { NextResponse } from "next/server";
import { ayniKaynakMi, bulunamadi, yetkisiz, yasak } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { taramaCalistir } from "@/server/servisler/tarama";

/** 1. aşama: tarama bu istek içinde senkron çalışır; ilerleme scans tablosundan okunur. */
export async function POST(istek: Request, { params }: RouteContext<"/api/taramalar/[id]/calistir">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const tarama = await taramaCalistir(ctx, (await params).id);
  return tarama ? NextResponse.json(tarama) : bulunamadi();
}
