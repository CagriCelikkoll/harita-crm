import type { Metadata } from "next";
import { AyarBolumu } from "@/components/arayuz/kart";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { ayarBolumuBaglami } from "../erisim";
import { EpostaAyarlari } from "../mesajlasma-ayarlari";

export const metadata: Metadata = { title: "E-posta · Ayarlar" };

export default async function Sayfa() {
  const { ctx } = await ayarBolumuBaglami("eposta");
  return (
    <AyarBolumu baslik="E-posta" aciklama="Kendi alan adınızdaki e-posta hesabıyla, kendi gönderen adresinizden gönderim yapılır.">
      <EpostaAyarlari ilk={mesajlasmaAyarlariDto(ctx)} />
    </AyarBolumu>
  );
}
