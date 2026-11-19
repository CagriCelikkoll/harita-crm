// Hazır cevaplar (gelen kutusundaki seçici için): bu çalışma alanının listesi. Ekleme ve düzenleme Ayarlar → Hazır
// cevaplar'dan (yalnızca yönetici). Gönderim yapmaz: seçilen metin yanıt kutusuna konur.
import { NextResponse } from "next/server";
import type { HazirCevapDto } from "@/lib/hazir-cevaplar";
import { yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { hazirCevaplariListele } from "@/server/repo/hazir-cevaplar";

export async function GET() {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const cevaplar: HazirCevapDto[] = hazirCevaplariListele(ctx).map(({ id, baslik, metin }) => ({ id, baslik, metin }));
  return NextResponse.json({ cevaplar }, { headers: { "Cache-Control": "no-store" } });
}
