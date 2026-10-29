// Önizleme raporu: geçerli / hatalı / çakışan / engelli / izinli satır sayıları. Hiçbir şey yazmaz.
import { NextResponse } from "next/server";
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { EslemVeSecenekler } from "@/server/ice-aktarma-semasi";
import { apiBaglami } from "@/server/oturum";
import { IceAktarmaHatasi, iceAktarmaOnizle } from "@/server/servisler/ice-aktarma";

export async function POST(istek: Request, { params }: RouteContext<"/api/ice-aktarma/[id]/onizleme">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = EslemVeSecenekler.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz istek.");
  try {
    const rapor = iceAktarmaOnizle(ctx, (await params).id, g.data.eslem, g.data.secenekler);
    return NextResponse.json({ rapor }, { headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof IceAktarmaHatasi) return hata.kod === "bulunamadi" ? bulunamadi() : gecersiz(hata.message);
    throw hata;
  }
}
