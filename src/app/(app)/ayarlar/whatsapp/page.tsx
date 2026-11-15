import type { Metadata } from "next";
import { AyarBolumu } from "@/components/arayuz/kart";
import { baglantilarDurumu, sablonlar } from "@/server/servisler/whatsapp-api";
import { ayarBolumuBaglami } from "../erisim";
import { WhatsappNumaralari } from "../whatsapp-numaralari";

export const metadata: Metadata = { title: "WhatsApp (Meta) · Ayarlar" };

export default async function WhatsappSayfasi({ searchParams }: PageProps<"/ayarlar/whatsapp">) {
  const { ctx } = await ayarBolumuBaglami("whatsapp");
  const p = await searchParams;
  const numara = typeof p.numara === "string" ? p.numara : null;
  const liste = baglantilarDurumu(ctx);
  return (
    <AyarBolumu
      baslik="WhatsApp (Meta Business)"
      aciklama="Meta Business hesabınızdaki WhatsApp numaralarıyla onaylı şablon mesajları gönderin. Her numaranın kurulumu ve test modu ayrıdır. Meta mesaj ücretini doğrudan işletmenizin hesabından keser."
    >
      <WhatsappNumaralari
        ilk={liste}
        ilkSablonlar={Object.fromEntries(liste.map((b) => [b.id!, sablonlar(ctx, b.id!)]))}
        ilkSecili={numara}
      />
    </AyarBolumu>
  );
}
