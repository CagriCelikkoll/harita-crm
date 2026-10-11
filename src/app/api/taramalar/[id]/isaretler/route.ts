import { NextResponse } from "next/server";
import { bulunamadi, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { taramaKayitlari } from "@/server/repo/kayitlar";
import { konumlariGetir } from "@/server/repo/konumlar";
import { taramaGetir } from "@/server/repo/taramalar";

/**
 * Bir taramanın kayıtları için harita işaretçileri. Yalnızca son 30 gün içinde Places'tan alınmış
 * konumu olan kayıtlar döner (sınır hücrelerinden veya detay görüntülemeden).
 */
export async function GET(_istek: Request, { params }: RouteContext<"/api/taramalar/[id]/isaretler">) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const id = (await params).id;
  if (!taramaGetir(ctx, id)) return bulunamadi();
  const kayitlar = taramaKayitlari(ctx, id);
  const konumlar = new Map(konumlariGetir(ctx, kayitlar.map((k) => k.placeId)).map((k) => [k.placeId, k]));
  const isaretler = kayitlar.flatMap((k) => {
    const konum = konumlar.get(k.placeId);
    return konum ? [{ kayitId: k.id, durum: k.durum, lat: konum.lat, lng: konum.lng }] : [];
  });
  return NextResponse.json(
    { toplam: kayitlar.length, isaretler },
    { headers: { "Cache-Control": "no-store" } },
  );
}
