// Bağlantıyı test et: Graph API'den numara, kalite ve portföy mesajlaşma limitini okur. Yalnızca yönetici.
import { NextResponse } from "next/server";
import { ayniKaynakMi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { yoneticiOlmali } from "@/server/repo/baglam";
import { baglantiyiTestEt } from "@/server/servisler/whatsapp-api";
import { BASLIK, hataYaniti } from "@/server/whatsapp-api-yanit";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  try {
    yoneticiOlmali(ctx);
    return NextResponse.json({ baglanti: await baglantiyiTestEt(ctx) }, { headers: BASLIK });
  } catch (hata) {
    return hataYaniti(hata);
  }
}
