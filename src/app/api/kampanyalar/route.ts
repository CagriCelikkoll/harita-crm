// Kampanya oluşturma. Alıcı kuralları sunucuda uygulanır; istemciden gelen alıcı listesi kabul edilmez,
// alıcılar filtreden bu kiracının kayıtları arasından seçilir.
import { NextResponse } from "next/server";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YetkiHatasi } from "@/server/repo/baglam";
import { KampanyaGirdisi, KampanyaHatasi, kampanyaBaslat } from "@/server/servisler/kampanya";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const girdi = KampanyaGirdisi.safeParse(await istek.json().catch(() => null));
  if (!girdi.success) return gecersiz(girdi.error.issues[0]?.message ?? "Geçersiz kampanya.");
  try {
    const kampanya = kampanyaBaslat(ctx, girdi.data);
    return NextResponse.json({ id: kampanya.id }, { status: 201 });
  } catch (hata) {
    if (hata instanceof KampanyaHatasi) return gecersiz(hata.message);
    if (hata instanceof YetkiHatasi) return yasak("WhatsApp kampanyasını yalnızca yönetici başlatabilir (Meta ücreti).");
    throw hata;
  }
}
