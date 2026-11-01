import type { Metadata } from "next";
import Link from "next/link";
import { Kart, KartBaslik } from "@/components/arayuz/kart";
import { DURUM_TONU, DurumRozeti, TON_DOLGUSU } from "@/components/arayuz/rozet";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { TaramaDurumuRozeti } from "@/components/tarama-durumu";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import { kategoriBul } from "@/lib/kategoriler";
import { isciDurumu, KAMPANYA_DURUM_ADLARI, KANAL_ADLARI } from "@/lib/mesajlasma";
import { siradakiIsler } from "@/lib/panel";
import { KAYIT_DURUM_ADLARI, KAYIT_DURUMLARI } from "@/lib/sabitler";
import { gunAnahtari } from "@/lib/zaman";
import { sayfaBaglami } from "@/server/oturum";
import { buAyGonderilenMesaj, kampanyalariListele } from "@/server/repo/kampanyalar";
import { durumSayilari, grupSayilari } from "@/server/repo/kayitlar";
import { isciSonNabiz } from "@/server/repo/sistem/isci";
import { taramalariListele, yarimKalanTaramalariKapat } from "@/server/repo/taramalar";
import { gunlukListe } from "@/server/repo/whatsapp-listesi";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { baglantiDurumu } from "@/server/servisler/whatsapp-api";

export const metadata: Metadata = { title: "Panel" };

// Panel: özet sayılar, "Sıradaki işler", durum hunisi, son taramalar ve son kampanyalar. Kullanım yüzdesi burada
// gösterilmez (yalnızca menüde ve Ayarlar > Kullanım'da). Bu sayfa Places'a gitmez.
export default async function PanelSayfasi() {
  const { ctx } = await sayfaBaglami();
  const yonetici = ctx.rol === "yonetici";
  const sayilar = durumSayilari(ctx);
  const toplam = KAYIT_DURUMLARI.reduce((t, d) => t + sayilar[d], 0);
  yarimKalanTaramalariKapat(ctx);
  const taramalar = taramalariListele(ctx, 3);
  const kampanyalar = kampanyalariListele(ctx, 50);
  const gonderimde = kampanyalar.filter((k) => k.durum === "calisiyor" || k.durum === "zamanlandi");
  const kuyrukVar = gonderimde.some((k) => k.sayilar.kuyrukta > 0);
  const wa = yonetici ? baglantiDurumu(ctx) : null;
  const isler = siradakiIsler({
    yonetici,
    incelenmemis: grupSayilari(ctx).incelenmemis,
    waBekleyen: gunlukListe(ctx, gunAnahtari()).filter((o) => o.durum === "bekliyor").length,
    gonderimdekiKampanya: gonderimde.length,
    isciUyari: kuyrukVar && isciDurumu(isciSonNabiz(), new Date()).uyari,
    eksikAyarlar: yonetici ? mesajlasmaAyarlariDto(ctx).eksikAyarlar : [],
    waTestModu: Boolean(wa?.tanimli && wa.testModu),
  });
  const enBuyuk = Math.max(1, ...KAYIT_DURUMLARI.map((d) => sayilar[d]));
  const ozetler = [
    { baslik: "Toplam kayıt", deger: toplam, href: "/kayitlar?grup=tum" },
    { baslik: "İletişimde + görüşme", deger: sayilar.iletisimde + sayilar.gorusme, href: "/kayitlar?grup=tum&durum=iletisimde" },
    { baslik: "Kazanıldı", deger: sayilar.kazanildi, href: "/kayitlar?grup=tum&durum=kazanildi" },
    { baslik: "Bu ay gönderilen mesaj", deger: buAyGonderilenMesaj(ctx), href: "/kampanyalar" },
  ];

  return (
    <>
      <SayfaBasligi baslik="Panel" aciklama="Bugün nereden devam edeceğinizi gösterir." />

      <div className="flex flex-col gap-6">
        <section className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4" aria-label="Özet">
          {ozetler.map((o) => (
            <Link key={o.baslik} href={o.href} className="rounded-kart border border-kenar bg-white px-6 py-5 hover:border-ana">
              <p className="text-[13px] text-soluk">{o.baslik}</p>
              <p className="mt-1 text-[28px] leading-tight font-bold tabular-nums">{sayiYaz(o.deger)}</p>
            </Link>
          ))}
        </section>

        <Kart etiket="Sıradaki işler">
          <KartBaslik baslik="Sıradaki işler" aciklama="Bugün bakmanız gerekenler." />
          {isler.length === 0 ? (
            <p className="border-t border-cizgi px-7 py-5 text-soluk">
              Şu an bekleyen iş yok.{" "}
              <Link href="/tarama" className="text-ana underline">
                Yeni bir bölge tarayabilirsiniz
              </Link>
              .
            </p>
          ) : (
            <ul>
              {isler.map((i) => (
                <li key={i.metin} className="flex flex-wrap items-center gap-4 border-t border-cizgi px-7 py-4">
                  <span
                    aria-hidden="true"
                    className={`size-2.5 shrink-0 rounded-full ${i.ton === "tehlike" ? "bg-tehlike" : i.ton === "uyari" ? "bg-[#b45309]" : "bg-ana"}`}
                  />
                  <div className="min-w-0 flex-[1_1_260px]">
                    <p className={`font-semibold ${i.ton === "tehlike" ? "text-tehlike" : ""}`}>{i.metin}</p>
                    <p className="text-[13px] text-soluk">{i.aciklama}</p>
                  </div>
                  <Link href={i.href} className="dugme dugme-kucuk">
                    {i.eylem}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Kart>

        <div className="flex flex-wrap items-start gap-6">
          <Kart etiket="Durum hunisi" className="min-w-0 flex-[1_1_380px]">
            <KartBaslik baslik="Durum hunisi" aciklama="Kayıtlarınızın durumlara göre dağılımı." />
            <ul className="flex flex-col gap-3 px-7 pb-6">
              {KAYIT_DURUMLARI.map((d) => (
                <li key={d}>
                  <Link href={`/kayitlar?grup=tum&durum=${d}`} className="group block">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="group-hover:text-ana">{KAYIT_DURUM_ADLARI[d]}</span>
                      <span className="font-semibold tabular-nums">{sayiYaz(sayilar[d])}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zemin">
                      <div className={`h-2 rounded-full ${TON_DOLGUSU[DURUM_TONU[d]]}`} style={{ width: `${(sayilar[d] / enBuyuk) * 100}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Kart>

          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-6">
            <Kart etiket="Son taramalar">
              <KartBaslik baslik="Son taramalar">
                <Link href="/tarama" className="dugme dugme-kucuk">
                  Yeni tarama
                </Link>
              </KartBaslik>
              {taramalar.length === 0 ? (
                <p className="border-t border-cizgi px-7 py-4 text-sm text-soluk">Henüz tarama yok.</p>
              ) : (
                <ul>
                  {taramalar.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 border-t border-cizgi px-7 py-3.5 text-sm">
                      <Link href={`/tarama?tarama=${t.id}`} className="min-w-0 hover:underline">
                        <p className="truncate font-semibold">
                          {kategoriBul(t.kategori)?.etiket ?? t.kategori} · {t.yaricapM / 1000} km
                        </p>
                        <p className="text-[13px] text-soluk">
                          {tarihYaz(t.olusturmaTarihi)} · {sayiYaz(t.bulunanSayisi)} işletme
                        </p>
                      </Link>
                      <TaramaDurumuRozeti durum={t.durum} />
                    </li>
                  ))}
                </ul>
              )}
            </Kart>

            <Kart etiket="Son kampanyalar">
              <KartBaslik baslik="Son kampanyalar">
                <Link href="/kampanyalar/yeni" className="dugme dugme-kucuk">
                  Yeni kampanya
                </Link>
              </KartBaslik>
              {kampanyalar.length === 0 ? (
                <p className="border-t border-cizgi px-7 py-4 text-sm text-soluk">Henüz kampanya yok.</p>
              ) : (
                <ul>
                  {kampanyalar.slice(0, 3).map((k) => (
                    <li key={k.id} className="flex items-center justify-between gap-3 border-t border-cizgi px-7 py-3.5 text-sm">
                      <Link href={`/kampanyalar/${k.id}`} className="min-w-0 hover:underline">
                        <p className="truncate font-semibold">{k.ad}</p>
                        <p className="text-[13px] text-soluk">
                          {KANAL_ADLARI[k.kanal]} · {sayiYaz(k.sayilar.gonderildi)} gönderildi · {tarihYaz(k.olusturmaTarihi)}
                        </p>
                      </Link>
                      <DurumRozeti ton={k.durum === "tamamlandi" ? "ana" : k.durum === "duraklatildi" ? "uyari" : "notr"}>
                        {KAMPANYA_DURUM_ADLARI[k.durum]}
                      </DurumRozeti>
                    </li>
                  ))}
                </ul>
              )}
            </Kart>
          </div>
        </div>
      </div>
    </>
  );
}
