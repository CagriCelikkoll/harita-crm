import type { Metadata } from "next";
import { KotaCubugu } from "@/components/kota-cubugu";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { tarihYaz } from "@/lib/bicim";
import { PLACES_BIRIMLERI, PLACES_FIYAT_TARIHI, PLACES_ISLEMLERI, PLACES_SKULARI } from "@/lib/places-birimleri";
import { PLACES_KONUM_SAKLAMA_GUN, ROL_ADLARI } from "@/lib/sabitler";
import { sayfaBaglami } from "@/server/oturum";
import { calismaAlaniGetir, davetleriListele, uyeleriListele } from "@/server/repo/calisma-alani";
import { kotaDurumu } from "@/server/repo/kullanim";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import { davetiIptalEt } from "./eylemler";
import { MesajlasmaAyarlari } from "./mesajlasma-ayarlari";
import { AlanFormu, DavetFormu, UyeCikarFormu } from "./formlar";

export const metadata: Metadata = { title: "Ayarlar" };

export default async function AyarlarSayfasi() {
  const { ctx } = await sayfaBaglami();
  const alan = calismaAlaniGetir(ctx)!;
  const uyeler = uyeleriListele(ctx);
  const yonetici = ctx.rol === "yonetici";
  const davetler = yonetici ? davetleriListele(ctx) : [];
  const taban = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  return (
    <>
      <SayfaBasligi baslik="Ayarlar" />
      <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <section className="kart">
          <h2 className="mb-3 font-semibold">Çalışma alanı</h2>
          <AlanFormu ad={alan.ad} veriSaklamaGun={alan.veriSaklamaGun} duzenlenebilir={yonetici} />
          <div className="mt-4 rounded-md bg-zemin p-3 text-xs text-soluk">
            <p className="font-medium text-metin">Google Places verisi</p>
            <p className="mt-1">
              İşletme adı, adres, telefon gibi Places içeriği hiç saklanmaz; her görüntülemede canlı çekilir. Places&apos;tan
              gelen konumlar ve tarama merkezleri en fazla {PLACES_KONUM_SAKLAMA_GUN} gün tutulur ve sonra otomatik silinir.
            </p>
          </div>
        </section>

        <section className="kart lg:col-span-2" aria-label="Places kotası">
          <h2 className="mb-3 font-semibold">Places kullanımı</h2>
          <KotaCubugu durum={kotaDurumu(ctx)} />
          <p className="mt-3 text-xs text-soluk">
            Aylık kota maliyeti sınırlar ve birim cinsindendir: her ücretli Places isteğinden önce o işlemin birimi
            ayrılır. Kota dolduğunda taramalar kısmi olarak durur, kayıt listesi ve detayda işletme bilgileri
            gösterilmez; kendi verileriniz (durum, notlar, iletişim bilgileri) görünmeye devam eder. Kota her ayın
            1&apos;inde 00:00&apos;da (İstanbul saati) sıfırlanır. Kotayı değiştirmek için sunucu yöneticisi şu komutu
            çalıştırır: <code className="rounded bg-zemin px-1">npm run kota -- {alan.slug} &lt;birim&gt;</code>
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="mb-1.5 text-left font-medium text-metin">Hangi işlem kaç birim?</caption>
              <thead className="text-soluk">
                <tr className="border-b border-kenar">
                  <th className="py-1.5 pr-3 text-left font-medium">İşlem</th>
                  <th className="py-1.5 pr-3 text-left font-medium">Google SKU</th>
                  <th className="py-1.5 text-right font-medium">Birim</th>
                </tr>
              </thead>
              <tbody>
                {PLACES_ISLEMLERI.map((i) => (
                  <tr key={i.islem} className="border-b border-kenar last:border-0">
                    <td className="py-1.5 pr-3">{i.islem}</td>
                    <td className="py-1.5 pr-3 text-soluk">{PLACES_SKULARI[i.sku].ad}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {PLACES_BIRIMLERI[i.sku] === 0 ? "0 (ücretsiz)" : PLACES_BIRIMLERI[i.sku]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-xs text-soluk">
              Birimler Google&apos;ın fiyatlarına orantılıdır ({PLACES_FIYAT_TARIHI} fiyat listesi; en ucuz ücretli
              işlem 1 birim). Ücretsiz istekler kotadan düşmez ama tarama başına istek sınırına sayılır.
            </p>
          </div>
        </section>

        <MesajlasmaAyarlari ilk={mesajlasmaAyarlariDto(ctx)} yonetici={yonetici} slug={alan.slug} />

        <section className="kart">
          <h2 className="mb-3 font-semibold">Üyeler</h2>
          <ul className="divide-y divide-kenar">
            {uyeler.map((u) => (
              <li key={u.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {u.ad} {u.userId === ctx.userId && <span className="text-soluk">(siz)</span>}
                  </p>
                  <p className="truncate text-xs text-soluk">{u.eposta}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rozet">{ROL_ADLARI[u.rol]}</span>
                  {yonetici && u.userId !== ctx.userId && <UyeCikarFormu userId={u.userId} ad={u.ad} />}
                </div>
              </li>
            ))}
          </ul>

          {yonetici ? (
            <div className="mt-4 border-t border-kenar pt-4">
              <h3 className="mb-2 text-sm font-semibold">E-posta ile üye davet et</h3>
              <DavetFormu />
              {davetler.length > 0 && (
                <>
                  <h3 className="mt-4 mb-2 text-sm font-semibold">Bekleyen davetler</h3>
                  <ul className="flex flex-col gap-2 text-sm">
                    {davetler.map((d) => (
                      <li key={d.id} className="rounded-md border border-kenar p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {d.eposta} · {ROL_ADLARI[d.rol]}
                          </span>
                          <form action={davetiIptalEt}>
                            <input type="hidden" name="id" value={d.id} />
                            <button type="submit" className="text-xs text-tehlike underline">
                              İptal et
                            </button>
                          </form>
                        </div>
                        <p className="text-xs text-soluk">Son geçerlilik: {tarihYaz(d.sonGecerlilik)}</p>
                        <input
                          readOnly
                          aria-label={`${d.eposta} davet bağlantısı`}
                          value={`${taban}/davet/${d.token}`}
                          className="girdi mt-1 text-xs"
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-soluk">Üye davet etmek için yönetici yetkisi gerekir.</p>
          )}
        </section>
      </div>
    </>
  );
}
