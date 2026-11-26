// Gelen kutusu: yönlendirilen numaraya tek kişilik şablon gönderimi (servisler/yonlendirme.ts). Üyeler de kullanır; kullanıcı başına günlük sınır.
// Engel varsa 400 ve neden; hiçbir şey yazılmaz. Numara gövdede taşınır (adreste / erişim günlüğünde görünmez).
import { NextResponse } from "next/server";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YonlendirmeGirdisi, YonlendirmeHatasi, yonlendirmeGonder } from "@/server/servisler/yonlendirme";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = YonlendirmeGirdisi.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz istek.");
  try {
    return NextResponse.json(yonlendirmeGonder(ctx, g.data), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof YonlendirmeHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durum });
    throw hata;
  }
}
