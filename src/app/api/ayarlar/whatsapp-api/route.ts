// WhatsApp Business (Cloud API) bağlantısı. Yalnızca yönetici. Yanıtlar erişim anahtarı / App Secret / verify token
// İÇERMEZ (yalnızca tanımlı / tanımlı değil). İlk kayıtta üretilen verify token yalnızca o yanıtta bir kez döner.
import { NextResponse } from "next/server";
import { z } from "zod";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { yoneticiOlmali } from "@/server/repo/baglam";
import { baglantiSil } from "@/server/repo/whatsapp-baglantilari";
import {
  baglantiDurumu,
  testModuDegistir,
  testNumaralariKaydet,
  uygulamaPayiKaydet,
  whatsappBaglantisiKaydet,
} from "@/server/servisler/whatsapp-api";
import { BASLIK, hataYaniti } from "@/server/whatsapp-api-yanit";

const kimlik = (ad: string) => z.string().trim().regex(/^\d{5,30}$/, `${ad} yalnızca rakamlardan oluşmalı.`);
const gizli = z.string().trim().max(1000).nullish();

const Kayit = z
  .object({ wabaId: kimlik("WABA ID"), phoneNumberId: kimlik("Phone Number ID"), erisimAnahtari: gizli, appSecret: gizli })
  .strict();

const Ayar = z
  .object({
    testModu: z.boolean(),
    testNumaralari: z.array(z.string().max(40)).max(20),
    uygulamaPayi: z.number().int(),
  })
  .partial()
  .strict();

export async function GET() {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  try {
    yoneticiOlmali(ctx);
  } catch (hata) {
    return hataYaniti(hata);
  }
  return NextResponse.json({ baglanti: baglantiDurumu(ctx) }, { headers: BASLIK });
}

export async function PUT(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = Kayit.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz değer.");
  try {
    const { verifyToken } = whatsappBaglantisiKaydet(ctx, g.data);
    return NextResponse.json({ baglanti: baglantiDurumu(ctx), verifyToken }, { headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}

/** Test modu, test numaraları, uygulama payı. Test modu kapatma koşulları sunucuda denetlenir. */
export async function PATCH(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = Ayar.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz değer.");
  try {
    yoneticiOlmali(ctx);
    if (g.data.testNumaralari) testNumaralariKaydet(ctx, g.data.testNumaralari);
    if (g.data.uygulamaPayi !== undefined) uygulamaPayiKaydet(ctx, g.data.uygulamaPayi);
    if (g.data.testModu !== undefined) testModuDegistir(ctx, g.data.testModu);
  } catch (hata) {
    return hataYaniti(hata);
  }
  return NextResponse.json({ baglanti: baglantiDurumu(ctx) }, { headers: BASLIK });
}

export async function DELETE(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  try {
    baglantiSil(ctx);
  } catch (hata) {
    return hataYaniti(hata);
  }
  return NextResponse.json({ baglanti: baglantiDurumu(ctx) }, { headers: BASLIK });
}
