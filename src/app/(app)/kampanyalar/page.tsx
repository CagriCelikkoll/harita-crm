import type { Metadata } from "next";
import Link from "next/link";
import { IlerlemeCubugu } from "@/components/arayuz/gosterge";
import { DurumRozeti, type RozetTonu } from "@/components/arayuz/rozet";
import { SekmeGrubu } from "@/components/arayuz/sekmeler";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import { KAMPANYA_DURUM_ADLARI, KANAL_ADLARI, whatsappDonusMetni, type KampanyaDurumu } from "@/lib/mesajlasma";
import { sayfaBaglami } from "@/server/oturum";
import { kampanyalariListele } from "@/server/repo/kampanyalar";
import { etiketleriListele } from "@/server/repo/kayitlar";
import { WhatsappListesi } from "./whatsapp-listesi";

export const metadata: Metadata = { title: "Kampanyalar" };

const DURUM_TONU: Partial<Record<KampanyaDurumu, RozetTonu>> = {
  tamamlandi: "ana",
  calisiyor: "mavi",
  zamanlandi: "mor",
  duraklatildi: "uyari",
  iptal: "notr",
};

// Kampanyalar: kampanya listesi ve WhatsApp günlük liste (?sekme=whatsapp). Yeni kampanya adım adım sihirbazla
// (/kampanyalar/yeni) oluşturulur.
export default async function KampanyalarSayfasi({ searchParams }: PageProps<"/kampanyalar">) {
  const p = await searchParams;
  const tek = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { ctx } = await sayfaBaglami();
  const sekme = tek(p.sekme) === "whatsapp" ? "whatsapp" : "kampanyalar";
  const kampanyalar = sekme === "kampanyalar" ? kampanyalariListele(ctx) : [];

  return (
    <>
      <SayfaBasligi
        baslik="Kampanyalar"
        aciklama="E-posta, SMS ve WhatsApp kampanyaları ile WhatsApp günlük listeniz; ret ve izin kuralları her mesajdan önce yeniden kontrol edilir."
      >
        <Link href="/kampanyalar/yeni" className="dugme-ana">
          Yeni kampanya
        </Link>
      </SayfaBasligi>

      <div className="mb-6">
        <SekmeGrubu
          etiket="Kampanya görünümü"
          secili={sekme}
          secenekler={[
            { deger: "kampanyalar", ad: "Kampanyalar", href: "/kampanyalar" },
            { deger: "whatsapp", ad: "WhatsApp günlük liste", href: "/kampanyalar?sekme=whatsapp" },
          ]}
        />
      </div>

      {sekme === "whatsapp" ? (
        <WhatsappListesi etiketler={etiketleriListele(ctx)} donus={whatsappDonusMetni(tek(p.wa), tek(p.neden))} />
      ) : kampanyalar.length === 0 ? (
        <section className="rounded-kart border border-kenar bg-white p-7">
          <p className="font-semibold">Henüz kampanya yok.</p>
          <p className="mt-1 text-soluk">
            <Link href="/kampanyalar/yeni" className="text-ana underline">
              Yeni kampanya
            </Link>{" "}
            ile kanal, alıcılar ve mesajı adım adım seçerek ilk kampanyanızı oluşturun.
          </p>
        </section>
      ) : (
        <section aria-label="Kampanya listesi" className="overflow-hidden rounded-kart border border-kenar bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="text-[13px] text-soluk">
                <tr>
                  <th className="border-b border-cizgi px-5 py-3.5 font-semibold">Kampanya</th>
                  <th className="border-b border-cizgi px-3 py-3.5 font-semibold">Kanal</th>
                  <th className="border-b border-cizgi px-3 py-3.5 font-semibold">Durum</th>
                  <th className="border-b border-cizgi px-3 py-3.5 font-semibold">Gönderim</th>
                  <th className="border-b border-cizgi py-3.5 pr-5 pl-3 font-semibold">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {kampanyalar.map((k) => {
                  const hedef = k.sayilar.kuyrukta + k.sayilar.gonderiliyor + k.sayilar.gonderildi + k.sayilar.basarisiz;
                  return (
                    <tr key={k.id} className="border-b border-[#f0f2ef] hover:bg-kart-alt">
                      <td className="px-5 py-3">
                        <Link href={`/kampanyalar/${k.id}`} className="font-semibold text-metin hover:underline">
                          {k.ad}
                        </Link>
                        <p className="text-[13px] text-soluk">
                          {k.sayilar.haric > 0 && `${sayiYaz(k.sayilar.haric)} hariç`}
                          {k.sayilar.basarisiz > 0 && ` · ${sayiYaz(k.sayilar.basarisiz)} başarısız`}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex flex-wrap gap-1.5">
                          <DurumRozeti ton="notr">{KANAL_ADLARI[k.kanal]}</DurumRozeti>
                          {k.sandbox && <DurumRozeti ton="uyari">Test</DurumRozeti>}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <DurumRozeti ton={DURUM_TONU[k.durum] ?? "notr"}>{KAMPANYA_DURUM_ADLARI[k.durum]}</DurumRozeti>
                      </td>
                      <td className="min-w-40 px-3 py-3">
                        <p className="mb-1 text-[13px] tabular-nums">
                          {sayiYaz(k.sayilar.gonderildi)} / {sayiYaz(hedef)}
                        </p>
                        <IlerlemeCubugu yuzde={hedef ? (k.sayilar.gonderildi / hedef) * 100 : 0} etiket={`${k.ad}: gönderilen`} />
                      </td>
                      <td className="py-3 pr-5 pl-3 whitespace-nowrap text-metin-ikincil">
                        {k.durum === "zamanlandi" && k.planlananTarih ? `Planlanan: ${tarihYaz(k.planlananTarih)}` : tarihYaz(k.olusturmaTarihi)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
