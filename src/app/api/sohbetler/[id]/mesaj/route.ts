// Temsilcinin yanıtı: { tur: "metin", metin, istemciKimligi } (yalnızca 24 saat penceresinde) ya da
// { tur: "sablon", sablonId, degiskenler, istemciKimligi } (kampanya alıcı kurallarının tamamı; RET'li kişiye asla).
// Kurallar servistedir (servisler/gelen-kutusu.ts). Aynı istemci kimliği ikinci kez gönderilmez.
import { NextResponse } from "next/server";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { GelenKutusuHatasi, MesajGirdisi, sohbetMesajiGonder } from "@/server/servisler/gelen-kutusu";

export async function POST(istek: Request, { params }: RouteContext<"/api/sohbetler/[id]/mesaj">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const girdi = MesajGirdisi.safeParse(await istek.json().catch(() => null));
  if (!girdi.success) return gecersiz(girdi.error.issues[0]?.message ?? "Geçersiz mesaj.");
  try {
    const sonuc = await sohbetMesajiGonder(ctx, id, girdi.data);
    return NextResponse.json(sonuc, { status: sonuc.tekrar ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof GelenKutusuHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durum });
    throw hata;
  }
}
