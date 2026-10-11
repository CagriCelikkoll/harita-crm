import type { Metadata } from "next";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { tarihYaz } from "@/lib/bicim";
import { PLACES_KONUM_SAKLAMA_GUN, ROL_ADLARI } from "@/lib/sabitler";
import { sayfaBaglami } from "@/server/oturum";
import { calismaAlaniGetir, davetleriListele, uyeleriListele } from "@/server/repo/calisma-alani";
import { davetiIptalEt } from "./eylemler";
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
              gelen konum (harita işaretçileri için) en fazla {PLACES_KONUM_SAKLAMA_GUN} gün tutulur ve sonra otomatik silinir.
            </p>
          </div>
        </section>

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
