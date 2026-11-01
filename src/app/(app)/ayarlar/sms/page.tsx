import type { Metadata } from "next";
import { AyarBolumu } from "@/components/arayuz/kart";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { ayarBolumuBaglami } from "../erisim";
import { SmsAyarlari } from "../mesajlasma-ayarlari";

export const metadata: Metadata = { title: "SMS · Ayarlar" };

export default async function Sayfa() {
  const { ctx } = await ayarBolumuBaglami("sms");
  return (
    <AyarBolumu baslik="SMS" aciklama="Netgsm hesabınız ve onaylı SMS başlığınızla gönderim yapılır.">
      <SmsAyarlari ilk={mesajlasmaAyarlariDto(ctx)} />
    </AyarBolumu>
  );
}
