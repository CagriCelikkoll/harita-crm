import { NextResponse } from "next/server";
import { z } from "zod";
import { gecersiz, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { adresiKonumaCevir } from "@/server/servisler/canli-bilgi";

const Govde = z.object({ metin: z.string().trim().min(2).max(200) });

/** Adres → konum (yalnızca haritayı ortalamak için; sonuç saklanmaz). */
export async function POST(istek: Request) {
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
    return NextResponse.json({ hata: (hata as Error).message }, { status: 502 });
  }
}
