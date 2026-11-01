import type { Metadata } from "next";
import { AyarBolumu, Kart } from "@/components/arayuz/kart";
import { IlerlemeCubugu } from "@/components/arayuz/gosterge";
import { BilgiNotu } from "@/components/arayuz/not";
import { kotaDonemiMetni, kullanimOzeti } from "@/lib/arayuz";
import { OTOMATIK_GOSTERIM_SINIRI_METNI, SINIR_ARTIRMA_METNI } from "@/lib/sabitler";
import { ayAnahtari } from "@/lib/zaman";
import { kotaDurumu } from "@/server/repo/kullanim";
import { ayarBolumuBaglami } from "../erisim";

export const metadata: Metadata = { title: "Kullanım ve paket · Ayarlar" };

// Kullanım yalnızca yüzde olarak gösterilir (birim ya da işlem başı maliyet yok).
export default async function KullanimSayfasi() {
  const { ctx } = await ayarBolumuBaglami("kullanim");
  const ozet = kullanimOzeti(kotaDurumu(ctx));
  const renk = ozet.seviye === "doldu" ? "bg-tehlike" : ozet.seviye === "uyari" ? "bg-amber-500" : "bg-ana";

  return (
    <AyarBolumu baslik="Kullanım ve paket" aciklama="Bu ay işletme bilgilerini görüntülemek ve bölge taramak için ne kadar kullandığınız.">
      <Kart className="flex flex-col gap-5 p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[13px] text-soluk">Bu ayki kullanım</p>
            <p className="text-4xl leading-none font-bold tabular-nums">%{ozet.yuzde}</p>
          </div>
          <p className="text-[13px] text-soluk">{kotaDonemiMetni(ayAnahtari())}</p>
        </div>
        <IlerlemeCubugu yuzde={ozet.yuzde} etiket="Bu ayki kullanım" kalin renk={renk} />
        {ozet.seviye === "doldu" ? (
          <BilgiNotu ton="tehlike" uyariRolu>
            Bu ayki kullanımınız doldu. İşletme bilgileri ve yeni taramalar ay sonuna kadar durduruldu; kendi
            verileriniz görünmeye devam eder.
          </BilgiNotu>
        ) : ozet.seviye === "uyari" ? (
          <BilgiNotu ton="uyari">{OTOMATIK_GOSTERIM_SINIRI_METNI}</BilgiNotu>
        ) : null}
        <BilgiNotu>
          Kendi kaydınıza adını yazdığınız işletmeler kullanım harcamaz. Görüştüğünüz işletmelerin adını kaydetmek
          kullanımınızı azaltır.
        </BilgiNotu>
      </Kart>

      <Kart className="flex flex-wrap items-center justify-between gap-4 px-7 py-6">
        <div>
          <p className="text-[13px] text-soluk">Aylık kullanım sınırı</p>
          <p className="text-lg font-bold">Çalışma alanınıza tanımlı sınır</p>
        </div>
        <p className="max-w-sm text-[13px] text-soluk">{SINIR_ARTIRMA_METNI}</p>
      </Kart>
    </AyarBolumu>
  );
}
