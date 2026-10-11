import type { Metadata } from "next";
import Link from "next/link";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import { KAMPANYA_DURUM_ADLARI, KANAL_ADLARI } from "@/lib/mesajlasma";
import { sayfaBaglami } from "@/server/oturum";
import { kampanyalariListele } from "@/server/repo/kampanyalar";
import { etiketleriListele } from "@/server/repo/kayitlar";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { YeniKampanya } from "./yeni-kampanya";

export const metadata: Metadata = { title: "İletişim" };

export default async function IletisimSayfasi() {
  const { ctx } = await sayfaBaglami();
  const kampanyalar = kampanyalariListele(ctx);
  const ayarlar = mesajlasmaAyarlariDto(ctx);

  return (
    <>
      <SayfaBasligi
        baslik="İletişim"
        aciklama="E-posta kampanyaları. İleti reddi, engel listesi ve izinsiz bireysel kayıtlar her zaman hariç tutulur; kurallar her mesajdan hemen önce yeniden kontrol edilir."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <YeniKampanya
          etiketler={etiketleriListele(ctx)}
          saglayicilar={ayarlar.saglayicilar}
          eksikAyarlar={ayarlar.eksikAyarlar}
        />

        <section className="kart self-start" aria-labelledby="kampanyalar-baslik">
          <h2 id="kampanyalar-baslik" className="mb-3 font-semibold">
            Kampanyalar
          </h2>
          {kampanyalar.length === 0 ? (
            <p className="text-sm text-soluk">Henüz kampanya yok. Soldaki formdan ilk kampanyanızı oluşturun.</p>
          ) : (
            <ul className="divide-y divide-kenar">
              {kampanyalar.map((k) => {
                const hedef = k.sayilar.kuyrukta + k.sayilar.gonderiliyor + k.sayilar.gonderildi + k.sayilar.basarisiz;
                return (
                  <li key={k.id} className="py-2.5">
                    <Link href={`/iletisim/kampanya/${k.id}`} className="group flex flex-col gap-1 text-sm">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium group-hover:text-ana group-hover:underline">{k.ad}</span>
                        <span className="rozet">{KANAL_ADLARI[k.kanal]}</span>
                        {k.sandbox && <span className="rozet bg-amber-100 text-amber-800">Sandbox</span>}
                        <span className="text-xs text-soluk">{KAMPANYA_DURUM_ADLARI[k.durum]}</span>
                      </span>
                      <span className="text-xs text-soluk tabular-nums">
                        {sayiYaz(k.sayilar.gonderildi)} / {sayiYaz(hedef)} gönderildi
                        {k.sayilar.haric > 0 && ` · ${sayiYaz(k.sayilar.haric)} hariç`}
                        {k.sayilar.basarisiz > 0 && ` · ${sayiYaz(k.sayilar.basarisiz)} başarısız`} ·{" "}
                        {k.durum === "zamanlandi" && k.planlananTarih
                          ? `Planlanan: ${tarihYaz(k.planlananTarih)}`
                          : tarihYaz(k.olusturmaTarihi)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
