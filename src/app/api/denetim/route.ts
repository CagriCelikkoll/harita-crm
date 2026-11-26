// Denetim kaydı geçmişi (yalnızca yönetici; üye 403): ?olay=iys_kontrolu | toplu_kayit_islemi. Yalnızca bu çalışma
// alanının kayıtları, yeniden eskiye, en fazla 200. Ayarlar > Gönderen bilgileri "Geçmişi göster" ve Kayıtlar > Toplu
// işlem geçmişi kullanır.
import { NextResponse } from "next/server";
import { GECMIS_OLAYLARI, type DenetimSatiri } from "@/lib/denetim";
import { gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YetkiHatasi } from "@/server/repo/baglam";
import { denetimKayitlariListele } from "@/server/repo/denetim";

export async function GET(istek: Request) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  if (ctx.rol !== "yonetici") return yasak(new YetkiHatasi().message);
  const olay = GECMIS_OLAYLARI.find((o) => o === new URL(istek.url).searchParams.get("olay"));
  if (!olay) return gecersiz("Geçersiz olay.");
  const kayitlar: DenetimSatiri[] = denetimKayitlariListele(ctx, { olay, limit: 200 }).map((k) => ({
    id: k.id,
    tarih: k.tarih.toISOString(),
    kullanici: k.kullaniciAdi,
    deger: k.deger,
    aciklama: k.aciklama,
  }));
  return NextResponse.json({ kayitlar }, { headers: { "Cache-Control": "no-store" } });
}
