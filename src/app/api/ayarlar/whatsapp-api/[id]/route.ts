// Tek WhatsApp numarası. Yalnızca yönetici. Numara bu çalışma alanının değilse 404.
// GET: durum. PUT: kimlikler ve gizli bilgiler (sahiplik yeniden doğrulanır). PATCH: ad, test modu, test numaraları,
// uygulama payı (test modu kapatma koşulları sunucuda, bu numara için denetlenir). DELETE: numarayı kaldırır (bu
// numaranın çalışan kampanyaları duraklar). Yanıtlar erişim anahtarı / App Secret / verify token İÇERMEZ.
import { NextResponse } from "next/server";
import { z } from "zod";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { yoneticiOlmali } from "@/server/repo/baglam";
import {
  baglantiDurumu,
  baglantilarDurumu,
  numaraAdiKaydet,
  testModuDegistir,
  testNumaralariKaydet,
  uygulamaPayiKaydet,
  whatsappBaglantisiKaldir,
  whatsappBaglantisiKaydet,
} from "@/server/servisler/whatsapp-api";
import { BASLIK, hataYaniti } from "@/server/whatsapp-api-yanit";
import { BaglantiKimlikleri } from "../sema";

const Kayit = BaglantiKimlikleri.strict();

const Ayar = z
  .object({
    ad: z.string().max(80),
    testModu: z.boolean(),
    testNumaralari: z.array(z.string().max(40)).max(20),
    uygulamaPayi: z.number().int(),
  })
  .partial()
  .strict();

type Baglam = RouteContext<"/api/ayarlar/whatsapp-api/[id]">;

export async function GET(_istek: Request, { params }: Baglam) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  try {
    yoneticiOlmali(ctx);
    return NextResponse.json({ baglanti: baglantiDurumu(ctx, id) }, { headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}

export async function PUT(istek: Request, { params }: Baglam) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const g = Kayit.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz değer.");
  try {
    const { verifyToken } = await whatsappBaglantisiKaydet(ctx, id, g.data);
    return NextResponse.json({ baglanti: baglantiDurumu(ctx, id), baglantilar: baglantilarDurumu(ctx), verifyToken }, { headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}

export async function PATCH(istek: Request, { params }: Baglam) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const g = Ayar.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz değer.");
  try {
    yoneticiOlmali(ctx);
    if (g.data.ad !== undefined) numaraAdiKaydet(ctx, id, g.data.ad);
    if (g.data.testNumaralari) testNumaralariKaydet(ctx, id, g.data.testNumaralari);
    if (g.data.uygulamaPayi !== undefined) uygulamaPayiKaydet(ctx, id, g.data.uygulamaPayi);
    if (g.data.testModu !== undefined) testModuDegistir(ctx, id, g.data.testModu);
    return NextResponse.json({ baglanti: baglantiDurumu(ctx, id), baglantilar: baglantilarDurumu(ctx) }, { headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}

export async function DELETE(istek: Request, { params }: Baglam) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  try {
    whatsappBaglantisiKaldir(ctx, id);
    return NextResponse.json({ baglantilar: baglantilarDurumu(ctx) }, { headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}
