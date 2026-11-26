// Gelen mesajdaki numaranın menüsü: numara bu çalışma alanında kayıtlı mı, gönderen numaralar ve şablonlar (yönetici).
// POST: numara gövdede (adreste / erişim günlüğünde görünmez). Hiçbir şey yazmaz.
import { NextResponse } from "next/server";
import { z } from "zod";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YonlendirmeHatasi, yonlendirmeBilgisi } from "@/server/servisler/yonlendirme";

const Girdi = z.object({ sohbetId: z.string().min(1).max(64), telefon: z.string().trim().min(1).max(40) }).strict();

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = Girdi.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz("Geçersiz istek.");
  try {
    return NextResponse.json(yonlendirmeBilgisi(ctx, g.data.sohbetId, g.data.telefon), { headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof YonlendirmeHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durum });
    throw hata;
  }
}
