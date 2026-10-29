// WABA şablonları: listele (tüm üyeler; kampanya oluştururken) ve Meta'dan senkronize et (yalnızca yönetici).
import { NextResponse } from "next/server";
import { ayniKaynakMi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { yoneticiOlmali } from "@/server/repo/baglam";
import { sablonlar, sablonlariSenkronizeEt } from "@/server/servisler/whatsapp-api";
import { BASLIK, hataYaniti } from "@/server/whatsapp-api-yanit";

export async function GET() {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  return NextResponse.json({ sablonlar: sablonlar(ctx) }, { headers: BASLIK });
}

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  try {
    yoneticiOlmali(ctx);
    const sonuc = await sablonlariSenkronizeEt(ctx);
    return NextResponse.json({ sonuc, sablonlar: sablonlar(ctx) }, { headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}
