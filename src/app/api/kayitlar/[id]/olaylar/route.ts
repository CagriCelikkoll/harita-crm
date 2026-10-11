// Kayda kullanıcı olayı ekler: not, arama ("Ara" düğmesi), e-posta ("E-posta" düğmesi).
import { NextResponse } from "next/server";
import { z } from "zod";
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { olayEkle } from "@/server/repo/olaylar";

const Govde = z.discriminatedUnion("tur", [
  z.object({ tur: z.literal("not"), aciklama: z.string().trim().min(1, "Not boş olamaz.").max(2000) }),
  z.object({ tur: z.literal("arama") }),
  z.object({ tur: z.literal("eposta") }),
]);

const ACIKLAMA = { arama: "Arama başlatıldı", eposta: "E-posta penceresi açıldı" } as const;

export async function POST(istek: Request, { params }: RouteContext<"/api/kayitlar/[id]/olaylar">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const sonuc = Govde.safeParse(await istek.json().catch(() => null));
  if (!sonuc.success) return gecersiz(sonuc.error.issues[0]?.message ?? "Geçersiz değer.");
  const g = sonuc.data;
  const olay = olayEkle(ctx, (await params).id, g.tur, g.tur === "not" ? g.aciklama : ACIKLAMA[g.tur]);
  return olay ? NextResponse.json({ olay: { id: olay.id } }, { status: 201 }) : bulunamadi();
}
