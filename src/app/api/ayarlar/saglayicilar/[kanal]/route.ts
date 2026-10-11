// Sağlayıcı kimlik bilgileri: kaydet (PUT) / kaldır (DELETE). Yalnızca yönetici.
// Yanıtlar kimlik bilgisi İÇERMEZ: yalnızca "tanımlı / tanımlı değil" (mesajlasmaAyarlariDto).
// SMS'te yeni üretilen gelen-SMS webhook adresi YALNIZCA bu yanıtta bir kez döner (?webhookYenile=1 ile yenilenir).
import { NextResponse } from "next/server";
import { KANALLAR, type Kanal } from "@/lib/mesajlasma";
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YetkiHatasi, yoneticiOlmali } from "@/server/repo/baglam";
import { saglayiciSil } from "@/server/repo/saglayicilar";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { uygulamaAdresi } from "@/server/messaging/abonelik-belirteci";
import { SaglayiciHatasi, saglayiciBilgisiKaydet } from "@/server/servisler/saglayici";

const BASLIK = { "Cache-Control": "no-store" };
const kanalMi = (k: string): k is Kanal => (KANALLAR as readonly string[]).includes(k);

export async function PUT(istek: Request, { params }: RouteContext<"/api/ayarlar/saglayicilar/[kanal]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { kanal } = await params;
  if (!kanalMi(kanal)) return bulunamadi();
  let webhookAdresi: string | undefined;
  try {
    yoneticiOlmali(ctx);
    const sonuc = await saglayiciBilgisiKaydet(ctx, kanal, await istek.json().catch(() => null), {
      webhookYenile: new URL(istek.url).searchParams.get("webhookYenile") === "1",
    });
    if (sonuc.webhookAnahtari) webhookAdresi = `${uygulamaAdresi()}/api/webhook/sms/${sonuc.webhookAnahtari}`;
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return yasak(hata.message);
    if (hata instanceof SaglayiciHatasi) return gecersiz(hata.message);
    throw hata;
  }
  return NextResponse.json({ ayarlar: mesajlasmaAyarlariDto(ctx), webhookAdresi }, { headers: BASLIK });
}

export async function DELETE(istek: Request, { params }: RouteContext<"/api/ayarlar/saglayicilar/[kanal]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { kanal } = await params;
  if (!kanalMi(kanal)) return bulunamadi();
  try {
    saglayiciSil(ctx, kanal);
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return yasak(hata.message);
    throw hata;
  }
  return NextResponse.json({ ayarlar: mesajlasmaAyarlariDto(ctx) }, { headers: BASLIK });
}
