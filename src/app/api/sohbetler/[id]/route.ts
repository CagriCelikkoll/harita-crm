// Sohbet ayrıntısı (son mesajlar, iç notlar, üyeler, şablonlar). ?once=<ISO tarih>: daha eski mesajlar.
// PATCH { durum?: "acik" | "kapali", atananKullanici?: string | null }: kapat / yeniden aç, ata (yalnızca bu çalışma
// alanının üyesine). Başka çalışma alanının sohbeti 404.
import { NextResponse } from "next/server";
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { KayitKuraliHatasi } from "@/server/repo/baglam";
import { eskiMesajlar, sohbetAyrintisi, SohbetDegisikligi, sohbetiGuncelle } from "@/server/servisler/gelen-kutusu";

const BASLIK = { "Cache-Control": "no-store" };

export async function GET(istek: Request, { params }: RouteContext<"/api/sohbetler/[id]">) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const once = new URL(istek.url).searchParams.get("once");
  if (once) {
    const tarih = new Date(once);
    if (Number.isNaN(tarih.getTime())) return gecersiz("Geçersiz tarih.");
    const mesajlar = eskiMesajlar(ctx, id, tarih);
    return mesajlar ? NextResponse.json({ mesajlar }, { headers: BASLIK }) : bulunamadi();
  }
  const a = sohbetAyrintisi(ctx, id);
  return a ? NextResponse.json(a, { headers: BASLIK }) : bulunamadi();
}

export async function PATCH(istek: Request, { params }: RouteContext<"/api/sohbetler/[id]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const sonuc = SohbetDegisikligi.safeParse(await istek.json().catch(() => null));
  if (!sonuc.success) return gecersiz(sonuc.error.issues[0]?.message ?? "Geçersiz değer.");
  try {
    if (!sohbetiGuncelle(ctx, id, sonuc.data)) return bulunamadi();
  } catch (hata) {
    if (hata instanceof KayitKuraliHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durum });
    throw hata;
  }
  return NextResponse.json(sohbetAyrintisi(ctx, id), { headers: BASLIK });
}
