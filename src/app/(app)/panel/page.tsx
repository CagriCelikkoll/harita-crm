import type { Metadata } from "next";
import Link from "next/link";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { TaramaDurumuRozeti } from "@/components/tarama-durumu";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import { kategoriBul } from "@/lib/kategoriler";
import { KAYIT_DURUM_ADLARI, KAYIT_DURUMLARI } from "@/lib/sabitler";
import { sayfaBaglami } from "@/server/oturum";
import { durumSayilari } from "@/server/repo/kayitlar";
import { aylikPlacesIstegi } from "@/server/repo/kullanim";
import { taramalariListele, yarimKalanTaramalariKapat } from "@/server/repo/taramalar";

export const metadata: Metadata = { title: "Panel" };

export default async function PanelSayfasi() {
  const { ctx } = await sayfaBaglami();
  const sayilar = durumSayilari(ctx);
  const toplam = KAYIT_DURUMLARI.reduce((t, d) => t + sayilar[d], 0);
  yarimKalanTaramalariKapat(ctx);
  const taramalar = taramalariListele(ctx, 5);
  const istek = aylikPlacesIstegi(ctx);
  const enBuyuk = Math.max(1, ...KAYIT_DURUMLARI.map((d) => sayilar[d]));

  return (
    <>
      <SayfaBasligi baslik="Panel" />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Özet">
        <Ozet baslik="Toplam kayıt" deger={sayiYaz(toplam)} />
        <Ozet baslik="İletişimde + görüşme" deger={sayiYaz(sayilar.iletisimde + sayilar.gorusme)} />
        <Ozet baslik="Kazanıldı" deger={sayiYaz(sayilar.kazanildi)} />
        <Ozet baslik="Bu ay Places isteği" deger={sayiYaz(istek)} alt="maliyet takibi için" />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="kart">
          <h2 className="mb-3 font-semibold">Durum hunisi</h2>
          <ul className="flex flex-col gap-2.5">
            {KAYIT_DURUMLARI.map((d) => (
              <li key={d}>
                <Link href={`/kayitlar?durum=${d}`} className="group block">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="group-hover:text-ana">{KAYIT_DURUM_ADLARI[d]}</span>
                    <span className="font-medium tabular-nums">{sayiYaz(sayilar[d])}</span>
                  </div>
                  <div className="h-2 rounded-full bg-zemin">
                    <div
                      className={`h-2 rounded-full ${d === "ilgilenmiyor" ? "bg-soluk/40" : "bg-ana"}`}
                      style={{ width: `${(sayilar[d] / enBuyuk) * 100}%` }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="kart">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Son taramalar</h2>
            <Link href="/tarama" className="text-sm font-medium text-ana">
              Yeni tarama
            </Link>
          </div>
          {taramalar.length === 0 ? (
            <p className="text-sm text-soluk">Henüz tarama yok.</p>
          ) : (
            <ul className="divide-y divide-kenar">
              {taramalar.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {kategoriBul(t.kategori)?.etiket ?? t.kategori} · {t.yaricapM / 1000} km
                    </p>
                    <p className="text-xs text-soluk">
                      {tarihYaz(t.olusturmaTarihi)} · {sayiYaz(t.bulunanSayisi)} işletme · {t.istekSayisi} istek
                    </p>
                    {t.durum === "hata" && t.hataMesaji && <p className="text-xs text-tehlike">{t.hataMesaji}</p>}
                  </div>
                  <TaramaDurumuRozeti durum={t.durum} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Ozet({ baslik, deger, alt }: { baslik: string; deger: string; alt?: string }) {
  return (
    <div className="kart">
      <p className="text-xs font-medium text-soluk">{baslik}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{deger}</p>
      {alt && <p className="text-xs text-soluk">{alt}</p>}
    </div>
  );
}
