// İç not ekleme: yalnızca ekip görür, Meta'ya hiçbir koşulda gitmez. Yanıt: sohbetin bütün notları.
import { NextResponse } from "next/server";
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { NotGirdisi, notYaz } from "@/server/servisler/gelen-kutusu";

export async function POST(istek: Request, { params }: RouteContext<"/api/sohbetler/[id]/notlar">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const girdi = NotGirdisi.safeParse(await istek.json().catch(() => null));
  if (!girdi.success) return gecersiz(girdi.error.issues[0]?.message ?? "Geçersiz not.");
  const notlar = notYaz(ctx, id, girdi.data.metin);
  return notlar ? NextResponse.json({ notlar }, { status: 201 }) : bulunamadi();
}
