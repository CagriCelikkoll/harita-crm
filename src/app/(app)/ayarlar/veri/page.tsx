import type { Metadata } from "next";
import { AyarBolumu, AyarSatiri, Kart } from "@/components/arayuz/kart";
import { PLACES_KONUM_SAKLAMA_GUN } from "@/lib/sabitler";
import { calismaAlaniGetir } from "@/server/repo/calisma-alani";
import { ayarBolumuBaglami } from "../erisim";
import { VeriSaklamaFormu } from "../formlar";

export const metadata: Metadata = { title: "Veri saklama · Ayarlar" };

// Dosya indirme (API); sayfa gezinmesi değil.
const DISA_AKTARMA_ADRESI = "/api/kayitlar/disa-aktar";

export default async function VeriSaklamaSayfasi() {
  const { ctx } = await ayarBolumuBaglami("veri");
  const alan = calismaAlaniGetir(ctx)!;
  return (
    <AyarBolumu baslik="Veri saklama" aciklama="Kişisel verilerin ne kadar süre tutulacağı ve dışa aktarma.">
      <Kart>
        <VeriSaklamaFormu veriSaklamaGun={alan.veriSaklamaGun} />
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
