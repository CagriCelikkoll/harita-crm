import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IlerlemeCubugu } from "@/components/arayuz/gosterge";
import { Sayfalama } from "@/components/arayuz/sayfalama";
import { DurumRozeti, type RozetTonu } from "@/components/arayuz/rozet";
import { SekmeGrubu } from "@/components/arayuz/sekmeler";
import { ListeTercihi } from "@/components/liste-tercihi";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import { KAMPANYA_TERCIH_ALANLARI } from "@/lib/liste-tercihi";
import { adrestekiSayfa, sayfaAdresi } from "@/lib/sayfalama";
import { KAMPANYA_DURUM_ADLARI, KANAL_ADLARI, whatsappDonusMetni, type KampanyaDurumu } from "@/lib/mesajlasma";
import { sayfaBaglami } from "@/server/oturum";
import { kampanyaSayfasi } from "@/server/repo/kampanyalar";
import { etiketleriListele } from "@/server/repo/kayitlar";
import { numaraEtiketleri } from "@/server/servisler/whatsapp-api";
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
// (/kampanyalar/yeni) oluşturulur. Seçilen sekme hatırlanır (components/liste-tercihi): sekme bağlantıları ?sekme=
// parametresini her zaman açıkça taşır; parametresiz adres (menüden gelindi) kayıtlı sekmeyi açar.
export default async function KampanyalarSayfasi({ searchParams }: PageProps<"/kampanyalar">) {
  const p = await searchParams;
  const tek = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { ctx } = await sayfaBaglami();
  const sekme = tek(p.sekme) === "whatsapp" ? "whatsapp" : "kampanyalar";
  // Sayfa bağlantıları ?sekme= taşır: sekmesiz adres kayıtlı sekmeyi uygular ve sayfayı düşürürdü (liste-tercihi).
  const sayfaTabani = "/kampanyalar?sekme=kampanyalar";
  const istenenSayfa = tek(p.sayfa);
  const liste = sekme === "kampanyalar" ? kampanyaSayfasi(ctx, { sayfa: adrestekiSayfa(istenenSayfa) }) : null;
  // Aralık dışı ya da geçersiz ?sayfa= : en yakın geçerli sayfaya geçilir.
  if (liste && istenenSayfa !== undefined && istenenSayfa !== String(liste.sayfa) && !(liste.sayfa === 1 && istenenSayfa === "")) {
    redirect(sayfaAdresi(sayfaTabani, liste.sayfa));
  }
  const kampanyalar = liste?.kampanyalar ?? [];
  const numaralar = numaraEtiketleri(ctx);

  return (
    <>
      <ListeTercihi
        liste="kampanyalar"
        tenantId={ctx.tenantId}
        kullaniciId={ctx.userId}
        yol="/kampanyalar"
        arama={new URLSearchParams(Object.entries(p).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString()}
        alanlar={KAMPANYA_TERCIH_ALANLARI}
      />
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
            { deger: "kampanyalar", ad: "Kampanyalar", href: "/kampanyalar?sekme=kampanyalar" },
            { deger: "whatsapp", ad: "WhatsApp günlük liste", href: "/kampanyalar?sekme=whatsapp" },
          ]}
        />
      </div>

      {sekme === "whatsapp" ? (
        <WhatsappListesi etiketler={etiketleriListele(ctx)} donus={whatsappDonusMetni(tek(p.wa), tek(p.neden))} />
      ) : kampanyalar.length === 0 ? (
        <section className="kart">
          <p className="font-semibold">Henüz kampanya yok.</p>
          <p className="mt-1 text-soluk">
            <Link href="/kampanyalar/yeni" className="text-ana underline">
              Yeni kampanya
            </Link>{" "}
            ile kanal, alıcılar ve mesajı adım adım seçerek ilk kampanyanızı oluşturun.
          </p>
        </section>
      ) : (
        <section aria-label="Kampanya listesi" className="kart-cerceve">
          {/* ≤ 640 px: kart listesi (yatay kaydırma yok); her satırın tamamı kampanyaya giden bağlantı. */}
          <ul className="sm:hidden">
            {kampanyalar.map((k) => {
              const hedef = k.sayilar.kuyrukta + k.sayilar.gonderiliyor + k.sayilar.gonderildi + k.sayilar.basarisiz;
              return (
                <li key={k.id} className="border-b border-cizgi last:border-0">
                  <Link href={`/kampanyalar/${k.id}`} className="satir flex min-h-11 flex-col gap-1.5 px-4 py-3">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-semibold break-words text-metin">{k.ad}</span>
                      <span className="flex shrink-0 gap-1.5">
                        {k.sandbox && <DurumRozeti ton="uyari">Test</DurumRozeti>}
                        <DurumRozeti ton={DURUM_TONU[k.durum] ?? "notr"}>{KAMPANYA_DURUM_ADLARI[k.durum]}</DurumRozeti>
                      </span>
                    </span>
                    <span className="text-ufak break-words text-soluk">
                      {KANAL_ADLARI[k.kanal]}
                      {k.kanal === "whatsapp_api" && ` · ${(k.baglantiId && numaralar.get(k.baglantiId)) || "Silinmiş numara"}`}
                    </span>
                    <span className="text-ufak text-metin-ikincil tabular-nums">
                      Gönderim: {sayiYaz(k.sayilar.gonderildi)} / {sayiYaz(hedef)}
                      {k.sayilar.haric > 0 && ` · ${sayiYaz(k.sayilar.haric)} hariç`}
                      {k.sayilar.basarisiz > 0 && ` · ${sayiYaz(k.sayilar.basarisiz)} başarısız`}
                    </span>
                    <span className="text-xs text-soluk">
                      {k.durum === "zamanlandi" && k.planlananTarih ? `Planlanan: ${tarihYaz(k.planlananTarih)}` : tarihYaz(k.olusturmaTarihi)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="overflow-x-auto max-sm:hidden">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="text-ufak text-soluk">
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
                    <tr key={k.id} className="satir border-b border-cizgi">
                      <td className="px-5 py-3">
                        <Link href={`/kampanyalar/${k.id}`} className="font-semibold text-metin hover:underline">
                          {k.ad}
                        </Link>
                        <p className="text-ufak text-soluk">
                          {k.sayilar.haric > 0 && `${sayiYaz(k.sayilar.haric)} hariç`}
                          {k.sayilar.basarisiz > 0 && ` · ${sayiYaz(k.sayilar.basarisiz)} başarısız`}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex flex-wrap gap-1.5">
                          <DurumRozeti ton="notr">{KANAL_ADLARI[k.kanal]}</DurumRozeti>
                          {k.kanal === "whatsapp_api" && (
                            <DurumRozeti ton="notr">{(k.baglantiId && numaralar.get(k.baglantiId)) || "Silinmiş numara"}</DurumRozeti>
                          )}
                          {k.sandbox && <DurumRozeti ton="uyari">Test</DurumRozeti>}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <DurumRozeti ton={DURUM_TONU[k.durum] ?? "notr"}>{KAMPANYA_DURUM_ADLARI[k.durum]}</DurumRozeti>
                      </td>
                      <td className="min-w-40 px-3 py-3">
                        <p className="mb-1 text-ufak tabular-nums">
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
          {liste && (
            <Sayfalama
              className="border-t border-cizgi bg-kart-alt px-5 py-3"
              sayfa={liste.sayfa}
              sayfaSayisi={liste.sayfaSayisi}
              toplam={liste.toplam}
              boyut={liste.boyut}
              taban={sayfaTabani}
              kayitAdi="kampanya"
            />
          )}
        </section>
      )}
    </>
  );
}
