// Menüdeki "Bu ayki kullanım" göstergesi: yalnızca yüzde ve seviye. Birim, kota ya da kalan miktar döndürülmez
// (arayüzde kullanım yalnızca yüzde olarak görünür; ayrıntı Ayarlar > Kullanım'da).
import { NextResponse } from "next/server";
import { kullanimOzeti } from "@/lib/arayuz";
import { yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { kotaDurumu } from "@/server/repo/kullanim";

export async function GET() {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  return NextResponse.json(kullanimOzeti(kotaDurumu(ctx)), { headers: { "Cache-Control": "no-store" } });
}
