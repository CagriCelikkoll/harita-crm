import { NextResponse } from "next/server";
import { z } from "zod";
import { KOTA_DOLDU_MESAJI } from "@/lib/sabitler";
import { KotaDolduHatasi } from "@/server/places/tipler";
import { ayniKaynakMi, gecersiz, yetkisiz, yasak } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { adresiKonumaCevir } from "@/server/servisler/canli-bilgi";

const Govde = z.object({ metin: z.string().trim().min(2).max(200) });

/**
 * Adres → konum. Sonuç Google içeriğidir; bununla başlatılan taramada merkez_kaynagi = 'adres' olur.
 * Tüm tarama merkezleri 30 gün sonra temizlenir (scripts/cleanup.ts). Aylık kota doluysa 429.
 */
export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const sonuc = Govde.safeParse(await istek.json().catch(() => null));
  if (!sonuc.success) return gecersiz("Adres en az 2 karakter olmalı.");
  try {
    const konum = await adresiKonumaCevir(ctx, sonuc.data.metin);
    return konum
      ? NextResponse.json(konum, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ hata: "Adres bulunamadı." }, { status: 404 });
  } catch (hata) {
    if (hata instanceof KotaDolduHatasi) return NextResponse.json({ hata: KOTA_DOLDU_MESAJI }, { status: 429 });
    return NextResponse.json({ hata: (hata as Error).message }, { status: 502 });
  }
}
