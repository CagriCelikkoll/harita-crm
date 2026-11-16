import type { Metadata } from "next";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayfaBaglami } from "@/server/oturum";
import { sohbetListesi } from "@/server/servisler/gelen-kutusu";
import { GelenKutusu } from "./gelen-kutusu";

export const metadata: Metadata = { title: "Gelen kutusu" };

// WhatsApp sohbetleri: herkes tüm sohbetleri görür; atama yalnızca sorumluluğu gösterir. Canlı yenileme kısa yoklamayla
// (görünür sekmede 3 sn, arka planda 20 sn). ?sohbet=<id> ile belirli sohbet açılır.
export default async function GelenKutusuSayfasi({ searchParams }: PageProps<"/gelen-kutusu">) {
  const { ctx, oturum } = await sayfaBaglami();
  const sp = await searchParams;
  const ilkSohbet = typeof sp.sohbet === "string" ? sp.sohbet : null;
  return (
    <>
      <SayfaBasligi baslik="Gelen kutusu" aciklama="WhatsApp numaralarınıza gelen mesajlar; 24 saat içinde yanıt verin, sonra onaylı şablonla yazın." />
      <GelenKutusu ilk={sohbetListesi(ctx, { durum: "acik" })} ilkSohbet={ilkSohbet} kullaniciId={oturum.user.id} />
    </>
  );
}
