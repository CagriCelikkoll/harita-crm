import type { Metadata } from "next";
import { AyarBolumu } from "@/components/arayuz/kart";
import { baglantiDurumu, sablonlar } from "@/server/servisler/whatsapp-api";
import { ayarBolumuBaglami } from "../erisim";
import { WhatsappApiAyarlari } from "../whatsapp-api-ayarlari";

export const metadata: Metadata = { title: "WhatsApp (Meta) · Ayarlar" };

export default async function WhatsappSayfasi() {
  const { ctx } = await ayarBolumuBaglami("whatsapp");
  return (
    <AyarBolumu
      baslik="WhatsApp (Meta Business)"
      aciklama="Meta Business hesabınızdaki WhatsApp numarasıyla onaylı şablon mesajları gönderin. Meta mesaj ücretini doğrudan işletmenizin hesabından keser."
    >
      <WhatsappApiAyarlari ilk={baglantiDurumu(ctx)} ilkSablonlar={sablonlar(ctx)} />
    </AyarBolumu>
  );
}
