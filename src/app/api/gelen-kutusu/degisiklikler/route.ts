// Canlı yenileme (kısa yoklama; SSE değil, plan B4): ?sonra=<sürüm> ve liste süzgeci (numara, durum, atanan, q, sayfa),
// isteğe bağlı ?sohbet=<id>. Değişiklik yoksa { degisti: false, surum } (küçük yanıt); varsa liste ve açık sohbetin
// yalnızca bu sürümden sonraki mesajları. Her istek oturum ve üyelik denetiminden geçer.
import { NextResponse } from "next/server";
import { gecersiz, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { degisiklikler, sohbetFiltresiCoz } from "@/server/servisler/gelen-kutusu";

export async function GET(istek: Request) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const p = new URL(istek.url).searchParams;
  const sonra = Number(p.get("sonra") ?? 0);
  if (!Number.isInteger(sonra) || sonra < 0) return gecersiz("Geçersiz sürüm.");
  return NextResponse.json(degisiklikler(ctx, sonra, sohbetFiltresiCoz(ctx, p), p.get("sohbet")), {
    headers: { "Cache-Control": "no-store" },
  });
}
