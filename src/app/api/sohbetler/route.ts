// Gelen kutusu: sohbet listesi (sayfalı). Süzgeç: ?numara=<id>&durum=acik|kapali&atanan=ben|yok&q=<ad/telefon>&sayfa=N.
// Herkes tüm sohbetleri görür.
import { NextResponse } from "next/server";
import { yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { sohbetFiltresiCoz, sohbetListesi } from "@/server/servisler/gelen-kutusu";

export async function GET(istek: Request) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const f = sohbetFiltresiCoz(ctx, new URL(istek.url).searchParams);
  return NextResponse.json(sohbetListesi(ctx, f), { headers: { "Cache-Control": "no-store" } });
}
