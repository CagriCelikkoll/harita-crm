// Gönderilemeyen medya mesajını yeniden dene (aynı dosya, aynı mesaj satırı). Kurallar servistedir
// (servisler/gelen-kutusu.ts medyaMesajiniTekrarDene); başka çalışma alanının ya da başka sohbetin mesajı 404.
import { NextResponse } from "next/server";
import { ayniKaynakMi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { GelenKutusuHatasi, medyaMesajiniTekrarDene } from "@/server/servisler/gelen-kutusu";

export async function POST(istek: Request, { params }: RouteContext<"/api/sohbetler/[id]/mesaj/[mesajId]/tekrar">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id, mesajId } = await params;
  try {
    return NextResponse.json(await medyaMesajiniTekrarDene(ctx, id, mesajId), { headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof GelenKutusuHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durum });
    throw hata;
  }
}
