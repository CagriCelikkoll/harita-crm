import type { Metadata } from "next";
import { AyarBolumu } from "@/components/arayuz/kart";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { ayarBolumuBaglami } from "../erisim";
import { GonderenAyarlari } from "../mesajlasma-ayarlari";

export const metadata: Metadata = { title: "Gönderen bilgileri · Ayarlar" };

export default async function Sayfa() {
  const { ctx } = await ayarBolumuBaglami("gonderen");
  return (
    <AyarBolumu baslik="Gönderen bilgileri" aciklama="Kampanya mesajlarının altında görünür. Bu bilgiler olmadan yalnızca test gönderimi yapılabilir.">
      <GonderenAyarlari ilk={mesajlasmaAyarlariDto(ctx)} />
    </AyarBolumu>
  );
}
