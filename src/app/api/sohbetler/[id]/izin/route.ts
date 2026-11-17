// Kişi sohbette pazarlama iletisi istedi: temsilci WhatsApp iznini 'var' kaydeder (kaynak "WhatsApp sohbeti", tarih,
// temsilci). { iysBeyani } yalnızca bireysel alıcıda anlamlıdır; yoksa kampanya ve şablon yine gitmez. RET'li ya da
// engelli kişide 409. Kurallar servistedir (servisler/gelen-kutusu.ts pazarlamaIzniKaydet).
import { NextResponse } from "next/server";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { GelenKutusuHatasi, IzinGirdisi, pazarlamaIzniKaydet } from "@/server/servisler/gelen-kutusu";

export async function POST(istek: Request, { params }: RouteContext<"/api/sohbetler/[id]/izin">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const girdi = IzinGirdisi.safeParse(await istek.json().catch(() => null));
  if (!girdi.success) return gecersiz(girdi.error.issues[0]?.message ?? "Geçersiz değer.");
  try {
    return NextResponse.json({ sohbet: pazarlamaIzniKaydet(ctx, id, girdi.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof GelenKutusuHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durum });
    throw hata;
  }
}
