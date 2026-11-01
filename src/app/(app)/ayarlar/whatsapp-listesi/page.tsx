import type { Metadata } from "next";
import { AyarBolumu } from "@/components/arayuz/kart";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { ayarBolumuBaglami } from "../erisim";
import { WhatsappListesiAyarlari } from "../mesajlasma-ayarlari";

export const metadata: Metadata = { title: "WhatsApp listesi · Ayarlar" };

export default async function Sayfa() {
  const { ctx } = await ayarBolumuBaglami("whatsapp-listesi");
  return (
    <AyarBolumu baslik="WhatsApp listesi" aciklama="Mesajları kendi WhatsApp'ınızdan, her sohbeti kendiniz açarak gönderirsiniz; uygulama sırayı ve mesajı hazırlar.">
      <WhatsappListesiAyarlari ilk={mesajlasmaAyarlariDto(ctx)} yonetici={ctx.rol === "yonetici"} />
    </AyarBolumu>
  );
}
