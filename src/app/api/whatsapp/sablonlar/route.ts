// Bir numaranın (WABA'sının) şablonları: listele (tüm üyeler; kampanya oluştururken) ve Meta'dan senkronize et
// (yalnızca yönetici). ?baglanti=<numara kimliği> zorunlu; numara bu çalışma alanının değilse liste boş / 404.
import { NextResponse } from "next/server";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { yoneticiOlmali } from "@/server/repo/baglam";
import { baglantiDurumu, sablonlar, sablonlariSenkronizeEt } from "@/server/servisler/whatsapp-api";
import { BASLIK, hataYaniti } from "@/server/whatsapp-api-yanit";

const numara = (istek: Request) => new URL(istek.url).searchParams.get("baglanti")?.slice(0, 100) ?? "";

export async function GET(istek: Request) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const id = numara(istek);
  if (!id) return gecersiz("Numara seçin (baglanti).");
  return NextResponse.json({ sablonlar: sablonlar(ctx, id) }, { headers: BASLIK });
}

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const id = numara(istek);
  if (!id) return gecersiz("Numara seçin (baglanti).");
  try {
    yoneticiOlmali(ctx);
    const sonuc = await sablonlariSenkronizeEt(ctx, id);
    return NextResponse.json({ sonuc, sablonlar: sablonlar(ctx, id), baglanti: baglantiDurumu(ctx, id) }, { headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}
