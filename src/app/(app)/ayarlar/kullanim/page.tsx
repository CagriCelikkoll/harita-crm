import type { Metadata } from "next";
import { AyarBolumu, Kart } from "@/components/arayuz/kart";
import { IlerlemeCubugu } from "@/components/arayuz/gosterge";
import { BilgiNotu } from "@/components/arayuz/not";
import { kotaDonemiMetni, kullanimOzeti } from "@/lib/arayuz";
import { KULLANIM_DOLDU_METNI, OTOMATIK_GOSTERIM_SINIRI_METNI, SINIR_ARTIRMA_METNI } from "@/lib/sabitler";
import { ayAnahtari } from "@/lib/zaman";
import { kotaDurumu, kullanimDokumu, type KullanimKalemi } from "@/server/repo/kullanim";
import { ayarBolumuBaglami } from "../erisim";

export const metadata: Metadata = { title: "Kullanım ve paket · Ayarlar" };

// Kullanım yalnızca yüzde olarak gösterilir (birim ya da işlem başı maliyet yok). Kalem kutuları, bu ayki
// kullanımın kalemlere göre payını gösterir.
const KALEMLER: { anahtar: KullanimKalemi; ad: string; aciklama: string }[] = [
  { anahtar: "isletmeBilgisi", ad: "İşletme bilgileri", aciklama: "Listede ve tarama sonuçlarında ad ve adres" },
  { anahtar: "iletisimBilgisi", ad: "Telefon ve web sitesi", aciklama: "Kayıt ayrıntısı, arama, WhatsApp ve SMS numarası" },
  { anahtar: "tarama", ad: "Taramalar", aciklama: "Bölge sınırındaki aramalar ve adres araması" },
];
export default async function KullanimSayfasi() {
  const { ctx } = await ayarBolumuBaglami("kullanim");
  const ozet = kullanimOzeti(kotaDurumu(ctx));
  const dokum = kullanimDokumu(ctx);
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 pt-1">
          {KALEMLER.map((k) => (
            <div key={k.anahtar} className="flex flex-col gap-1 rounded-[10px] bg-ic-kutu p-4">
              <p className="flex justify-between gap-2 font-semibold">
                {k.ad} <span className="tabular-nums">%{dokum[k.anahtar]}</span>
              </p>
              <p className="mb-1.5 text-[13px] text-soluk">{k.aciklama}</p>
              <IlerlemeCubugu yuzde={dokum[k.anahtar]} etiket={`${k.ad}: bu ayki kullanımın payı`} zemin="bg-kenar" />
            </div>
          ))}
        </div>
        {ozet.seviye === "doldu" ? (
          <BilgiNotu ton="tehlike" uyariRolu>
            {KULLANIM_DOLDU_METNI}
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
