// Kullanıcının kendi yazdığı notu düzenleme/silme. Sistem olayları ve başkasının notları değişmez;
// bu kiracıya ait değilse veya koşullar sağlanmıyorsa 404.
import { NextResponse } from "next/server";
import { z } from "zod";
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { notOlayiGuncelle, notOlayiSil } from "@/server/repo/olaylar";

const Govde = z.object({ aciklama: z.string().trim().min(1, "Not boş olamaz.").max(2000) });

export async function PATCH(istek: Request, { params }: RouteContext<"/api/olaylar/[id]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const sonuc = Govde.safeParse(await istek.json().catch(() => null));
  if (!sonuc.success) return gecersiz(sonuc.error.issues[0]?.message ?? "Geçersiz değer.");
  return notOlayiGuncelle(ctx, (await params).id, sonuc.data.aciklama)
    ? NextResponse.json({ tamam: true })
    : bulunamadi();
}

export async function DELETE(istek: Request, { params }: RouteContext<"/api/olaylar/[id]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  return notOlayiSil(ctx, (await params).id) ? new Response(null, { status: 204 }) : bulunamadi();
}
