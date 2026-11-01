import type { Metadata } from "next";
import { AyarBolumu } from "@/components/arayuz/kart";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { ayarBolumuBaglami } from "../erisim";
import { SaatlerAyarlari } from "../mesajlasma-ayarlari";

export const metadata: Metadata = { title: "Saatler ve sınırlar · Ayarlar" };

export default async function Sayfa() {
  const { ctx } = await ayarBolumuBaglami("saatler");
  return (
    <AyarBolumu baslik="Saatler ve sınırlar" aciklama="Kampanyalar yalnızca bu saatlerde ve bu sınırlar içinde gönderilir.">
      <SaatlerAyarlari ilk={mesajlasmaAyarlariDto(ctx)} yonetici={ctx.rol === "yonetici"} />
    </AyarBolumu>
  );
}
