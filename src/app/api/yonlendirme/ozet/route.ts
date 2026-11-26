// Şablon gönder penceresinin ön kontrolü: gönderimle aynı kurallar, hiçbir şey kalıcı yazılmaz (servisler/yonlendirme.ts).
import { NextResponse } from "next/server";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YonlendirmeGirdisi, YonlendirmeHatasi, yonlendirmeOzeti } from "@/server/servisler/yonlendirme";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = YonlendirmeGirdisi.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz istek.");
  try {
    return NextResponse.json({ ozet: yonlendirmeOzeti(ctx, g.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof YonlendirmeHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durum });
    throw hata;
  }
}
