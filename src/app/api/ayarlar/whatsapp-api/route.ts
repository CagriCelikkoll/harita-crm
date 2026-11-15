// WhatsApp Business (Cloud API) numaraları. Yalnızca yönetici.
// GET: bütün numaraların durumu. POST: yeni numara (numara sahipliği Graph API'den doğrulanır; üretilen verify token
// yalnızca bu yanıtta bir kez döner). Yanıtlar erişim anahtarı / App Secret / verify token İÇERMEZ.
// Tek numaranın işlemleri: /api/ayarlar/whatsapp-api/[id].
import { NextResponse } from "next/server";
import { z } from "zod";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { yoneticiOlmali } from "@/server/repo/baglam";
import { baglantilarDurumu, whatsappBaglantisiEkle } from "@/server/servisler/whatsapp-api";
import { BASLIK, hataYaniti } from "@/server/whatsapp-api-yanit";
import { BaglantiKimlikleri } from "./sema";

const Yeni = BaglantiKimlikleri.extend({ ad: z.string().max(80) }).strict();

export async function GET() {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  try {
    yoneticiOlmali(ctx);
  } catch (hata) {
    return hataYaniti(hata);
  }
  return NextResponse.json({ baglantilar: baglantilarDurumu(ctx) }, { headers: BASLIK });
}

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = Yeni.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz değer.");
  try {
    const { baglanti, verifyToken } = await whatsappBaglantisiEkle(ctx, g.data);
    return NextResponse.json({ baglanti, baglantilar: baglantilarDurumu(ctx), verifyToken }, { status: 201, headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}
