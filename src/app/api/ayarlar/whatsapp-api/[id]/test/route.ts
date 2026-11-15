// Bu numaranın bağlantısını test et: Graph API'den numara, kalite ve portföy mesajlaşma limitini okur. Yalnızca yönetici.
import { NextResponse } from "next/server";
import { ayniKaynakMi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { yoneticiOlmali } from "@/server/repo/baglam";
import { baglantilarDurumu, baglantiyiTestEt } from "@/server/servisler/whatsapp-api";
import { BASLIK, hataYaniti } from "@/server/whatsapp-api-yanit";

export async function POST(istek: Request, { params }: RouteContext<"/api/ayarlar/whatsapp-api/[id]/test">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  try {
    yoneticiOlmali(ctx);
    const baglanti = await baglantiyiTestEt(ctx, id);
    // Hesap kilidi aynı WABA'daki numaralardan da kalkar: liste de döner.
    return NextResponse.json({ baglanti, baglantilar: baglantilarDurumu(ctx) }, { headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}
