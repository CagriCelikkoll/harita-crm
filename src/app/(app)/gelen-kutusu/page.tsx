import type { Metadata } from "next";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayfaBaglami } from "@/server/oturum";
import { gelenKutusuFiltresiCoz, gelenKutusuTercihi } from "@/lib/gelen-kutusu";
import { GELEN_KUTUSU_TERCIH_ALANLARI } from "@/lib/liste-tercihi";
import { baglantilariListele } from "@/server/repo/whatsapp-baglantilari";
import { sohbetFiltresiCoz, sohbetListesi } from "@/server/servisler/gelen-kutusu";
import { GelenKutusu } from "./gelen-kutusu";

export const metadata: Metadata = { title: "Gelen kutusu" };

// WhatsApp sohbetleri: herkes tüm sohbetleri görür; atama yalnızca sorumluluğu gösterir. Canlı yenileme kısa yoklamayla
// (görünür sekmede 3 sn, arka planda 20 sn). ?sohbet=<id> ile belirli sohbet açılır. Liste süzgeci adreste
// (?numara=&durum=acik|kapali|tum&atanan=ben|yok); adreste yoksa istemci kayıtlı tercihi uygular (lib/liste-tercihi).
export default async function GelenKutusuSayfasi({ searchParams }: PageProps<"/gelen-kutusu">) {
  const { ctx, oturum } = await sayfaBaglami();
  const sp = await searchParams;
  const ilkSohbet = typeof sp.sohbet === "string" ? sp.sohbet : null;
  const al = (ad: string) => (typeof sp[ad] === "string" ? sp[ad] : undefined);
  const adresteFiltre = GELEN_KUTUSU_TERCIH_ALANLARI.some((a) => al(a) !== undefined);
  const ilkFiltre = gelenKutusuFiltresiCoz(al, baglantilariListele(ctx).map((b) => b.id));
  return (
    <>
      <SayfaBasligi baslik="Gelen kutusu" aciklama="WhatsApp numaralarınıza gelen mesajlar; 24 saat içinde yanıt verin, sonra onaylı şablonla yazın." />
      <GelenKutusu
        ilk={sohbetListesi(ctx, sohbetFiltresiCoz(ctx, new URLSearchParams(gelenKutusuTercihi(ilkFiltre))))}
        ilkSohbet={ilkSohbet}
        kullaniciId={oturum.user.id}
        tenantId={ctx.tenantId}
        ilkFiltre={ilkFiltre}
        adresteFiltre={adresteFiltre}
      />
    </>
  );
}
