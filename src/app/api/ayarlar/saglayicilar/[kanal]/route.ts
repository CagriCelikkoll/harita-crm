// Sağlayıcı kimlik bilgileri: kaydet (PUT) / kaldır (DELETE). Yalnızca yönetici.
// Yanıtlar kimlik bilgisi İÇERMEZ: yalnızca "tanımlı / tanımlı değil" (mesajlasmaAyarlariDto).
import { NextResponse } from "next/server";
import { KANALLAR, type Kanal } from "@/lib/mesajlasma";
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YetkiHatasi, yoneticiOlmali } from "@/server/repo/baglam";
import { saglayiciSil } from "@/server/repo/saglayicilar";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { SaglayiciHatasi, saglayiciBilgisiKaydet } from "@/server/servisler/saglayici";

const BASLIK = { "Cache-Control": "no-store" };
const kanalMi = (k: string): k is Kanal => (KANALLAR as readonly string[]).includes(k);

export async function PUT(istek: Request, { params }: RouteContext<"/api/ayarlar/saglayicilar/[kanal]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { kanal } = await params;
  if (!kanalMi(kanal)) return bulunamadi();
  try {
    yoneticiOlmali(ctx);
    await saglayiciBilgisiKaydet(ctx, kanal, await istek.json().catch(() => null));
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return yasak(hata.message);
    if (hata instanceof SaglayiciHatasi) return gecersiz(hata.message);
    throw hata;
  }
  return NextResponse.json({ ayarlar: mesajlasmaAyarlariDto(ctx) }, { headers: BASLIK });
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
