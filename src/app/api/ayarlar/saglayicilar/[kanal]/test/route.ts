// Test gönderimi. Alıcı istemciden ALINMAZ: e-posta yalnızca SMTP'de kayıtlı gönderen adresine gider.
// Yalnızca yönetici; kiracı başına saatte en fazla 5.
import { NextResponse } from "next/server";
import { KANALLAR, type Kanal } from "@/lib/mesajlasma";
import { ayniKaynakMi, bulunamadi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YetkiHatasi, yoneticiOlmali } from "@/server/repo/baglam";
import { SaglayiciHatasi, testGonder } from "@/server/servisler/saglayici";

const kanalMi = (k: string): k is Kanal => (KANALLAR as readonly string[]).includes(k);

export async function POST(istek: Request, { params }: RouteContext<"/api/ayarlar/saglayicilar/[kanal]/test">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { kanal } = await params;
  if (!kanalMi(kanal)) return bulunamadi();
  try {
    yoneticiOlmali(ctx);
    const sonuc = await testGonder(ctx, kanal);
    if (sonuc.durum !== "gonderildi") return NextResponse.json({ hata: sonuc.hata }, { status: 502 });
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return yasak(hata.message);
    if (hata instanceof SaglayiciHatasi) {
      return NextResponse.json({ hata: hata.message }, { status: hata.durumKodu });
    }
    throw hata;
  }
  return NextResponse.json(
    { tamam: true, mesaj: kanal === "eposta" ? "Test e-postası gönderen adresinize gönderildi." : "Test SMS'i gönderildi." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
