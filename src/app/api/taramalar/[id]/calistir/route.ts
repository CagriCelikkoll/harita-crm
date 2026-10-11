import { NextResponse } from "next/server";
import { bulunamadi, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { taramaCalistir } from "@/server/servisler/tarama";

/** 1. aşama: tarama bu istek içinde senkron çalışır; ilerleme scans tablosundan okunur. */
export async function POST(_istek: Request, { params }: RouteContext<"/api/taramalar/[id]/calistir">) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const tarama = await taramaCalistir(ctx, (await params).id);
  return tarama ? NextResponse.json(tarama) : bulunamadi();
}
