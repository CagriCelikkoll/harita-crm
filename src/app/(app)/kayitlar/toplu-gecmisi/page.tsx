import type { Metadata } from "next";
import Link from "next/link";
import { BilgiNotu } from "@/components/arayuz/not";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import { DENETIM_TOPLU_KAYIT, topluDenetimOzeti } from "@/lib/denetim";
import { sayfaBaglami } from "@/server/oturum";
import { denetimKayitlariListele } from "@/server/repo/denetim";

export const metadata: Metadata = { title: "Toplu işlem geçmişi" };

// Kayıtlar > Toplu işlem geçmişi: toplu işlemlerin denetim kayıtları (tarih, kişi, işlem, kayıt sayısı, WhatsApp izninde
// izin kaynağı ve beyan). Yalnızca yönetici görür (toplu işlemi de yalnızca yönetici yapar); bu çalışma alanının
// kayıtları, yeniden eskiye, en fazla 200.
export default async function TopluGecmisiSayfasi() {
  const { ctx } = await sayfaBaglami();
  const yonetici = ctx.rol === "yonetici";
  const kayitlar = yonetici ? denetimKayitlariListele(ctx, { olay: DENETIM_TOPLU_KAYIT, limit: 200 }) : [];
  return (
    <>
      <SayfaBasligi baslik="Toplu işlem geçmişi" aciklama="Kayıtlar listesinde yapılan toplu işlemler: kim, ne zaman, ne yaptı, kaç kayıt değişti.">
        <Link href="/kayitlar" className="dugme">
          Kayıtlara dön
        </Link>
      </SayfaBasligi>
      {!yonetici ? (
        <BilgiNotu>Toplu işlem geçmişini yalnızca yönetici görebilir.</BilgiNotu>
      ) : kayitlar.length === 0 ? (
        <section className="kart text-soluk">Henüz toplu işlem yapılmadı.</section>
      ) : (
        <section aria-label="Toplu işlem geçmişi" className="kart-cerceve">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-sm break-words">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[26%]" />
                <col className="w-[14%]" />
                <col />
              </colgroup>
              <thead className="text-ufak text-soluk">
                <tr>
                  <th className="border-b border-cizgi px-5 py-3 font-semibold">Tarih</th>
                  <th className="border-b border-cizgi px-3 py-3 font-semibold">Kişi</th>
                  <th className="border-b border-cizgi px-3 py-3 font-semibold">İşlem</th>
                  <th className="border-b border-cizgi px-3 py-3 font-semibold">Kayıt sayısı</th>
                  <th className="border-b border-cizgi py-3 pr-5 pl-3 font-semibold">İzin kaynağı / beyan</th>
                </tr>
              </thead>
              <tbody>
                {kayitlar.map((k) => {
                  const o = topluDenetimOzeti(k.deger, k.aciklama);
                  return (
                    <tr key={k.id} className="border-b border-cizgi align-top last:border-0">
                      <td className="px-5 py-3 whitespace-nowrap">{tarihYaz(k.tarih)}</td>
                      <td className="px-3 py-3">{k.kullaniciAdi ?? "Silinmiş kullanıcı"}</td>
                      <td className="px-3 py-3">
                        <span className="font-semibold">{o.islem}</span>
                        {o.ayrinti && o.ayrinti !== o.islem && <span className="block text-ufak text-soluk">{o.ayrinti}</span>}
                        {o.secim && <span className="block text-ufak text-soluk">{o.secim}</span>}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {o.hedef !== null && o.degisen !== null ? (
                          <>
                            {sayiYaz(o.degisen)} değişti
                            <span className="block text-ufak text-soluk">{sayiYaz(o.hedef)} seçili</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 pr-5 pl-3">
                        {o.beyan === null ? (
                          <span className="text-soluk">—</span>
                        ) : (
                          <>
                            {o.izinKaynagi ?? "—"}
                            <span className={`block text-ufak ${o.beyan ? "text-ana" : "text-tehlike"}`}>
                              {o.beyan ? "Beyan onaylandı" : "Beyan kaydı yok"}
                            </span>
                          </>
                        )}
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
