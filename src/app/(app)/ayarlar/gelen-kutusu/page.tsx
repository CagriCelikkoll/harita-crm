import type { Metadata } from "next";
import { AyarBolumu, Kart } from "@/components/arayuz/kart";
import { gonderimGeriAlGetir } from "@/server/repo/gelen-kutusu";
import { iletiAyarlariGetir } from "@/server/repo/ileti-ayarlari";
import { ayarBolumuBaglami } from "../erisim";
import { GonderimGeriAlFormu, OtomatikKapatmaFormu } from "./formlar";

export const metadata: Metadata = { title: "Gelen kutusu · Ayarlar" };

// Herkes görür: "Gönderimi geri al" kişisel tercihtir; otomatik kapatmayı yalnızca yönetici değiştirir.
export default async function Sayfa() {
  const { ctx } = await ayarBolumuBaglami("gelen-kutusu");
  return (
    <AyarBolumu baslik="Gelen kutusu" aciklama="WhatsApp sohbetlerinde gönderim ve arşiv.">
      <Kart etiket="Gönderim">
        <GonderimGeriAlFormu acik={gonderimGeriAlGetir(ctx)} />
      </Kart>
      <Kart etiket="Arşiv">
        <OtomatikKapatmaFormu gun={iletiAyarlariGetir(ctx).otomatikKapatmaGun} yonetici={ctx.rol === "yonetici"} />
      </Kart>
    </AyarBolumu>
  );
}
