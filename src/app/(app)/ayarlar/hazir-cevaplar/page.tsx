import type { Metadata } from "next";
import { AyarBolumu, Kart, KartBaslik } from "@/components/arayuz/kart";
import { baslikAnahtari, HAZIR_CEVAP_AZAMI, ORNEK_HAZIR_CEVAPLAR } from "@/lib/hazir-cevaplar";
import { hazirCevaplariListele } from "@/server/repo/hazir-cevaplar";
import { ayarBolumuBaglami } from "../erisim";
import { HazirCevapFormu, HazirCevapSatiri } from "./formlar";

export const metadata: Metadata = { title: "Hazır cevaplar · Ayarlar" };

// Herkes görür (gelen kutusunda kullanır); yalnızca yönetici ekler, düzenler, siler.
export default async function Sayfa() {
  const { ctx } = await ayarBolumuBaglami("hazir-cevaplar");
  const yonetici = ctx.rol === "yonetici";
  const cevaplar = hazirCevaplariListele(ctx);
  // Örnekler yalnızca öneri: aynı başlıkta kayıt yoksa "Yeni hazır cevap" formunda gösterilir, seçilince forma dolar.
  const kayitliBasliklar = new Set(cevaplar.map((c) => c.baslikAnahtari));
  const oneriler = ORNEK_HAZIR_CEVAPLAR.filter((o) => !kayitliBasliklar.has(baslikAnahtari(o.baslik)));
  return (
    <AyarBolumu
      baslik="Hazır cevaplar"
      aciklama="Gelen kutusunda yanıt yazarken seçilen kayıtlı metinler. Seçilen metin yanıt kutusuna gelir; göndermeden önce düzenleyebilirsiniz."
    >
      {yonetici && cevaplar.length < HAZIR_CEVAP_AZAMI && (
        <Kart etiket="Yeni hazır cevap">
          <KartBaslik baslik="Yeni hazır cevap" />
          <HazirCevapFormu oneriler={oneriler} />
        </Kart>
      )}
      <Kart etiket="Kayıtlı hazır cevaplar">
        <KartBaslik
          baslik="Kayıtlı hazır cevaplar"
          aciklama={`${cevaplar.length} / ${HAZIR_CEVAP_AZAMI}${yonetici ? "" : " · Yalnızca yöneticiler değiştirebilir."}`}
        />
        {cevaplar.length === 0 ? (
          <p className="border-t border-cizgi px-7 py-6 text-sm text-soluk">
            Henüz hazır cevap yok.{yonetici ? " Yukarıdan ekleyin." : " Yöneticiniz ekleyebilir."}
          </p>
        ) : (
          <ul>
            {cevaplar.map((c) => (
              <HazirCevapSatiri key={`${c.id}-${c.guncellemeTarihi.getTime()}`} cevap={{ id: c.id, baslik: c.baslik, metin: c.metin }} yonetici={yonetici} />
            ))}
          </ul>
        )}
      </Kart>
    </AyarBolumu>
  );
}
