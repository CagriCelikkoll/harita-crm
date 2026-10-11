import { NextResponse } from "next/server";
import { z } from "zod";
import { kategoriBul } from "@/lib/kategoriler";
import { YARICAP_MAX_KM, YARICAP_MIN_KM } from "@/lib/sabitler";
import { gecersiz, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { taramaOlustur } from "@/server/repo/taramalar";

const Govde = z.object({
  merkezLat: z.number("Enlem sayı olmalı.").min(-90, "Geçersiz enlem.").max(90, "Geçersiz enlem."),
  merkezLng: z.number("Boylam sayı olmalı.").min(-180, "Geçersiz boylam.").max(180, "Geçersiz boylam."),
  yaricapKm: z
    .number("Yarıçap sayı olmalı.")
    .min(YARICAP_MIN_KM, `Yarıçap en az ${YARICAP_MIN_KM} km olmalı.`)
    .max(YARICAP_MAX_KM, `Yarıçap en fazla ${YARICAP_MAX_KM} km olabilir.`),
  kategori: z.string("Kategori seçin.").refine((k) => kategoriBul(k) !== null, "Bilinmeyen kategori."),
});

/** Taramayı "kuyrukta" olarak oluşturur; çalıştırma ayrı istekle yapılır (ilerleme izlenebilsin diye). */
export async function POST(istek: Request) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const sonuc = Govde.safeParse(await istek.json().catch(() => null));
  if (!sonuc.success) return gecersiz(sonuc.error.issues.map((i) => i.message).join("; "));
  const { merkezLat, merkezLng, yaricapKm, kategori } = sonuc.data;
  const tarama = taramaOlustur(ctx, { merkezLat, merkezLng, yaricapM: Math.round(yaricapKm * 1000), kategori });
  return NextResponse.json(tarama, { status: 201 });
}
