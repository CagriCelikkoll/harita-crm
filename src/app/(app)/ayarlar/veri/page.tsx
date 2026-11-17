import type { Metadata } from "next";
import { AyarBolumu, AyarSatiri, Kart } from "@/components/arayuz/kart";
import { boyutYaz, sayiYaz } from "@/lib/bicim";
import { MEDYA_KOTA_BAYT } from "@/lib/gelen-kutusu";
import { PLACES_KONUM_SAKLAMA_GUN } from "@/lib/sabitler";
import { calismaAlaniGetir } from "@/server/repo/calisma-alani";
import { ayarBolumuBaglami } from "../erisim";
import { GelenKutusuSaklamaFormu, VeriSaklamaFormu } from "../formlar";
import { medyaKullanimi } from "@/server/repo/gelen-kutusu";
import { iletiAyarlariGetir } from "@/server/repo/ileti-ayarlari";

export const metadata: Metadata = { title: "Veri saklama · Ayarlar" };

// Dosya indirme (API); sayfa gezinmesi değil.
const DISA_AKTARMA_ADRESI = "/api/kayitlar/disa-aktar";

export default async function VeriSaklamaSayfasi() {
  const { ctx } = await ayarBolumuBaglami("veri");
  const alan = calismaAlaniGetir(ctx)!;
  const ileti = iletiAyarlariGetir(ctx);
  const medya = medyaKullanimi(ctx);
  const doluluk = medya.bayt / MEDYA_KOTA_BAYT;
  return (
    <AyarBolumu baslik="Veri saklama" aciklama="Kişisel verilerin ne kadar süre tutulacağı ve dışa aktarma.">
      <Kart>
        <VeriSaklamaFormu veriSaklamaGun={alan.veriSaklamaGun} />
      </Kart>
      <Kart>
        <GelenKutusuSaklamaFormu
          mesajSaklamaGun={ileti.mesajSaklamaGun}
          medyaSaklamaGun={ileti.medyaSaklamaGun}
          okunduBildirimi={ileti.okunduBildirimi}
          yonetici={ctx.rol === "yonetici"}
        />
        <AyarSatiri
          baslik="Gelen medyanın kapladığı alan"
          aciklama="Alan dolunca yeni fotoğraf, belge ve sesler indirilmez (sohbette “telefondan bakın” görünür). Saklama süresini kısaltmak yer açar."
        >
          <p className={`text-[13px] ${doluluk >= 0.9 ? "font-semibold text-tehlike" : "text-metin-ikincil"}`}>
            {boyutYaz(medya.bayt)} / {boyutYaz(MEDYA_KOTA_BAYT)} ({sayiYaz(medya.adet)} dosya)
            {doluluk >= 1 ? " — alan doldu, yeni medya indirilmiyor." : doluluk >= 0.9 ? " — alan dolmak üzere." : ""}
          </p>
        </AyarSatiri>
      </Kart>
      <Kart>
        <AyarSatiri baslik="Verilerinizi dışa aktarın" aciklama="Kendi girdiğiniz kayıtlar Excel uyumlu CSV olarak. Google'dan gelen bilgiler dosyada yer almaz.">
          <a href={DISA_AKTARMA_ADRESI} download className="dugme">
            CSV indir
          </a>
        </AyarSatiri>
        <AyarSatiri baslik="Google Haritalar bilgileri" aciklama="Bu çalışma alanı için otomatik uygulanır.">
          <p className="text-[13px] text-metin-ikincil">
            İşletme adı, adres, telefon gibi Google bilgileri hiç saklanmaz; her görüntülemede anlık gösterilir.
            Google&apos;dan gelen konumlar ve tarama merkezleri en fazla {PLACES_KONUM_SAKLAMA_GUN} gün tutulur ve sonra
            otomatik silinir.
          </p>
        </AyarSatiri>
      </Kart>
    </AyarBolumu>
  );
}
