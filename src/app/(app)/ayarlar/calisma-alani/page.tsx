import type { Metadata } from "next";
import { AyarBolumu, Kart } from "@/components/arayuz/kart";
import { calismaAlaniGetir } from "@/server/repo/calisma-alani";
import { ayarBolumuBaglami } from "../erisim";
import { AlanAdiFormu } from "../formlar";

export const metadata: Metadata = { title: "Çalışma alanı · Ayarlar" };

export default async function CalismaAlaniSayfasi() {
  const { ctx } = await ayarBolumuBaglami("calisma-alani");
  const alan = calismaAlaniGetir(ctx)!;
  const girisAdresi = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/giris`;
  return (
    <AyarBolumu baslik="Çalışma alanı" aciklama="Ekibinizin ve gönderilen mesajların altında görünen temel bilgiler.">
      <Kart>
        <AlanAdiFormu ad={alan.ad} duzenlenebilir={ctx.rol === "yonetici"} girisAdresi={girisAdresi} />
      </Kart>
    </AyarBolumu>
  );
}
