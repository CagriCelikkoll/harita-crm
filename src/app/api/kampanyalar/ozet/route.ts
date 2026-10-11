// Gönderim öncesi özet: gönderilecek alıcı sayısı, nedenlere göre hariç tutulanlar, günlük sınır, önizleme.
// Hiçbir şey yazmaz (POST, çünkü gövde kampanya taslağıdır).
import { NextResponse } from "next/server";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { KampanyaGirdisi, KampanyaHatasi, kampanyaOzeti } from "@/server/servisler/kampanya";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const girdi = KampanyaGirdisi.safeParse(await istek.json().catch(() => null));
  if (!girdi.success) return gecersiz(girdi.error.issues[0]?.message ?? "Geçersiz kampanya.");
  try {
    return NextResponse.json({ ozet: kampanyaOzeti(ctx, girdi.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof KampanyaHatasi) return gecersiz(hata.message);
    throw hata;
  }
}
