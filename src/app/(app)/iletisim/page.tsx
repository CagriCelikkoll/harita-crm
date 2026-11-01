import type { Metadata } from "next";
import Link from "next/link";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import { KAMPANYA_DURUM_ADLARI, KANAL_ADLARI, whatsappDonusMetni } from "@/lib/mesajlasma";
import { smsAltbilgisi } from "@/lib/sablon";
import { sayfaBaglami } from "@/server/oturum";
import { kampanyalariListele } from "@/server/repo/kampanyalar";
import { etiketleriListele } from "@/server/repo/kayitlar";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { baglantiDurumu, sablonlar } from "@/server/servisler/whatsapp-api";
import { WhatsappListesi } from "./whatsapp-listesi";
import { YeniKampanya } from "./yeni-kampanya";

export const metadata: Metadata = { title: "Kampanyalar" };

export default async function IletisimSayfasi({ searchParams }: PageProps<"/iletisim">) {
  const p = await searchParams;
  const tek = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { ctx } = await sayfaBaglami();
  const kampanyalar = kampanyalariListele(ctx);
  const ayarlar = mesajlasmaAyarlariDto(ctx);
  const etiketler = etiketleriListele(ctx);

  return (
    <>
      <SayfaBasligi
        baslik="Kampanyalar"
        aciklama="E-posta, SMS ve WhatsApp kampanyaları ile WhatsApp günlük listeniz; ret ve izin kuralları her mesajdan önce yeniden kontrol edilir."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <YeniKampanya
          etiketler={etiketler}
          saglayicilar={ayarlar.saglayicilar}
          eksikAyarlar={ayarlar.eksikAyarlar}
          smsAltbilgisi={smsAltbilgisi(ayarlar)}
          whatsapp={{
            yonetici: ctx.rol === "yonetici",
            bagli: baglantiDurumu(ctx).tanimli,
            sablonlar: ctx.rol === "yonetici" ? sablonlar(ctx).filter((x) => x.kullanilabilir) : [],
          }}
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

        <div className="xl:col-span-2">
          <WhatsappListesi etiketler={etiketler} donus={whatsappDonusMetni(tek(p.wa), tek(p.neden))} />
        </div>
      </div>
    </>
  );
}
