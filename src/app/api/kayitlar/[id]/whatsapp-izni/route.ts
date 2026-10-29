// Kaydın WhatsApp (Cloud API) izni. 'ret' ret akışından geçer (tüm kanallar, engel listesi) ve geri alınamaz.
import { NextResponse } from "next/server";
import { z } from "zod";
import { WHATSAPP_IZIN_KAYNAKLARI } from "@/lib/mesajlasma";
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { retIsle } from "@/server/repo/engel-listesi";
import { kayitGetir } from "@/server/repo/kayitlar";
import { whatsappIzniAyarla, whatsappKisisiGetir } from "@/server/repo/whatsapp-kisileri";
import { whatsappKisiDto } from "@/server/servisler/kayit-dto";

const Izin = z.discriminatedUnion("izin", [
  z
    .object({
      izin: z.literal("var"),
      kaynak: z.enum(WHATSAPP_IZIN_KAYNAKLARI),
      tarih: z.iso.date().nullish(),
      not: z.string().trim().max(1000).nullish(),
      iysBeyani: z.boolean().default(false),
    })
    .strict(),
  z.object({ izin: z.literal("yok"), not: z.string().trim().max(1000).nullish() }).strict(),
  z.object({ izin: z.literal("ret") }).strict(),
]);

export async function PUT(istek: Request, { params }: RouteContext<"/api/kayitlar/[id]/whatsapp-izni">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const id = (await params).id;
  const g = Izin.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz değer.");
  if (!kayitGetir(ctx, id)) return bulunamadi();

  if (g.data.izin === "ret") {
    retIsle(ctx, { leadId: id, adresler: [], kaynak: "kayit_ret", aciklama: "WhatsApp reddi elle işaretlendi" });
  } else {
    const tarih = g.data.izin === "var" && g.data.tarih ? new Date(`${g.data.tarih}T09:00:00Z`) : null;
    if (tarih && tarih.getTime() > Date.now() + 86_400_000) return gecersiz("İzin tarihi gelecekte olamaz.");
    const sonuc = whatsappIzniAyarla(ctx, id, {
      izin: g.data.izin,
      kaynak: g.data.izin === "var" ? g.data.kaynak : null,
      tarih,
      not: g.data.not ?? null,
      iysBeyani: g.data.izin === "var" && g.data.iysBeyani,
    });
    if (!sonuc.tamam) {
      return sonuc.neden === "ret" ? gecersiz("Ret verilmiş bir kişinin izni değiştirilemez.") : bulunamadi();
    }
  }
  return NextResponse.json(
    { whatsapp: whatsappKisiDto(whatsappKisisiGetir(ctx, id)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
