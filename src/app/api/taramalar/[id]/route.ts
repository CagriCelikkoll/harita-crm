import { NextResponse } from "next/server";
import { bulunamadi, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { taramaGetir } from "@/server/repo/taramalar";

/** Tarama durumu (arayüz ilerleme için yoklar). */
export async function GET(_istek: Request, { params }: RouteContext<"/api/taramalar/[id]">) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const tarama = taramaGetir(ctx, (await params).id);
  return tarama ? NextResponse.json(tarama, { headers: { "Cache-Control": "no-store" } }) : bulunamadi();
}
