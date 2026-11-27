// Gelen kutusu: "Seçilenleri kapat" (toplu). POST { idler: string[] } → { kapatilan }. Herkes (kapat / yeniden aç gibi);
// yalnızca bu çalışma alanının açık sohbetleri kapanır, başka çalışma alanının kimliği sessizce sayılmaz.
import { NextResponse } from "next/server";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { sohbetleriTopluKapat, TopluKapatmaGirdisi } from "@/server/servisler/gelen-kutusu";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const sonuc = TopluKapatmaGirdisi.safeParse(await istek.json().catch(() => null));
  if (!sonuc.success) return gecersiz(sonuc.error.issues[0]?.message ?? "Geçersiz değer.");
  return NextResponse.json(sohbetleriTopluKapat(ctx, sonuc.data.idler), { headers: { "Cache-Control": "no-store" } });
}
