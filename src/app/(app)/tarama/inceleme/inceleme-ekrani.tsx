"use client";
// Tarama sonuçlarını inceleme. Google adı ve adresi yalnızca "Göster" ile gelir (maliyet önceden yazılır) ve bu
// bileşenin belleğinde tutulur. "İlgilen" denince ad girme alanı açılır: alan BOŞ gelir, yanında Google'daki ad
// gösterilmez (o satırın Google bilgisi gizlenir); Places içeriğini kullanıcının kaydına aktarmayı kolaylaştıran
// ipucu, kopyalama ya da otomatik doldurma yoktur.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAtfi } from "@/components/google-atfi";
import { GoogleBilgisiHucresi, useGoogleBilgisi } from "@/components/google-bilgisi";
import { apiIstek } from "@/lib/api-istemci";
import { sayiYaz } from "@/lib/bicim";
import { AD_GIRME_IPUCU, GOOGLE_ADSIZ, type IncelemeDurumu } from "@/lib/sabitler";

type Satir = { id: string; isletmeAdi: string | null };
type Karar = "ilgileniyor" | "ad" | "ilgilenmiyor";

export function IncelemeEkrani(props: { satirlar: Satir[]; kalan: number }) {
  const router = useRouter();
  const google = useGoogleBilgisi(props.satirlar.map((s) => s.id));
  const [kararlar, setKararlar] = useState<Record<string, Karar>>({});
  const [adlar, setAdlar] = useState<Record<string, string>>({});
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const kararsiz = props.satirlar.filter((s) => !kararlar[s.id]).map((s) => s.id);
  const gosterilmemis = props.satirlar.filter((s) => !google.bilgi.has(s.id)).map((s) => s.id);

  async function isaretle(idler: string[], inceleme: IncelemeDurumu, karar: Karar | null) {
    setHata(null);
    setMesgul(true);
    const s = await apiIstek("/api/kayitlar/inceleme", { method: "POST", govde: { idler, inceleme } });
    setMesgul(false);
    if (!s.ok) return setHata(s.hata);
    setKararlar((k) => {
      const yeni = { ...k };
      for (const id of idler) {
        if (karar) yeni[id] = karar;
        else delete yeni[id];
      }
      return yeni;
    });
  }

  async function adKaydet(id: string) {
    const ad = (adlar[id] ?? "").trim();
    if (!ad) return setKararlar((k) => ({ ...k, [id]: "ilgileniyor" }));
    setMesgul(true);
    const s = await apiIstek(`/api/kayitlar/${id}`, { method: "PATCH", govde: { isletmeAdi: ad } });
    setMesgul(false);
    if (!s.ok) return setHata(s.hata);
    setKararlar((k) => ({ ...k, [id]: "ilgileniyor" }));
  }

  if (props.satirlar.length === 0) {
    return (
      <section className="kart text-sm">
        <p>İncelenecek sonuç kalmadı.</p>
      </section>
    );
  }

  return (
    <section className="kart space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-soluk">
          {sayiYaz(props.kalan)} incelenmemiş sonuç · bu sayfada {sayiYaz(props.satirlar.length)}
        </p>
        <div className="flex flex-wrap gap-2">
          {gosterilmemis.length > 0 && (
            <button
              type="button"
              className="dugme-ana"
              disabled={gosterilmemis.some((id) => google.yukleniyor.has(id))}
              onClick={() => void google.goster(gosterilmemis)}
            >
              Bu sayfanın Google bilgilerini göster
            </button>
          )}
          {kararsiz.length > 0 && (
            <button type="button" className="dugme" disabled={mesgul} onClick={() => void isaretle(kararsiz, "ilgilenmiyor", "ilgilenmiyor")}>
              Kalan {sayiYaz(kararsiz.length)} sonucun hiçbiriyle ilgilenme
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-soluk">
        Ad ve adres Google&apos;dan çekilir ve saklanmaz; bu sayfadan ayrılınca silinir. İlgilenmediğiniz işletmeler
        Kayıtlar&apos;da varsayılan olarak gizlenir ve hiçbir kampanyaya girmez.
      </p>
      {(hata || google.hata) && (
        <p role="alert" className="text-sm text-tehlike">
          {hata ?? google.hata}
        </p>
      )}

      <ul className="divide-y divide-kenar">
        {props.satirlar.map((s) => {
          const karar = kararlar[s.id];
          return (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
              {karar === "ad" ? (
                // Ad girme: bu satırın Google bilgisi gösterilmez; alan boş gelir.
                <form
                  className="flex min-w-0 flex-1 flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void adKaydet(s.id);
                  }}
                >
                  <label className="etiket min-w-56 flex-1">
                    İşletme adı (sizin kaydınız)
                    <input
                      className="girdi"
                      maxLength={160}
                      placeholder={AD_GIRME_IPUCU}
                      autoComplete="off"
                      value={adlar[s.id] ?? ""}
                      onChange={(e) => setAdlar((a) => ({ ...a, [s.id]: e.target.value }))}
                    />
                  </label>
                  <button type="submit" className="dugme-ana" disabled={mesgul}>
                    Kaydet
                  </button>
                  <button type="button" className="dugme" onClick={() => setKararlar((k) => ({ ...k, [s.id]: "ilgileniyor" }))}>
                    Şimdilik boş bırak
                  </button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className={s.isletmeAdi || adlar[s.id] ? "font-medium" : "text-soluk italic"}>
                      {adlar[s.id]?.trim() || s.isletmeAdi || GOOGLE_ADSIZ}
                    </p>
                    {google.bilgi.has(s.id) && (
                      <p>
                        <GoogleBilgisiHucresi id={s.id} alan="ad" bilgi={google.bilgi.get(s.id)} yukleniyor={false} onGoster={google.goster} />
                      </p>
                    )}
                    <p className="text-xs text-soluk">
                      <GoogleBilgisiHucresi
                        id={s.id}
                        alan="adres"
                        bilgi={google.bilgi.get(s.id)}
                        yukleniyor={google.yukleniyor.has(s.id)}
                        onGoster={google.goster}
                      />
                    </p>
                  </div>
                  {karar ? (
                    <span className="flex items-center gap-2">
                      <span className={`rozet ${karar === "ilgilenmiyor" ? "bg-zemin text-soluk line-through" : "bg-ana-acik"}`}>
                        {karar === "ilgilenmiyor" ? "İlgilenilmiyor" : "İlgilenilen"}
                      </span>
                      <button type="button" className="text-xs text-soluk underline" disabled={mesgul} onClick={() => void isaretle([s.id], "incelenmedi", null)}>
                        Geri al
                      </button>
                    </span>
                  ) : (
                    <span className="flex gap-2">
                      <button type="button" className="dugme-ana" disabled={mesgul} onClick={() => void isaretle([s.id], "ilgileniyor", "ad")}>
                        İlgilen
                      </button>
                      <button type="button" className="dugme" disabled={mesgul} onClick={() => void isaretle([s.id], "ilgilenmiyor", "ilgilenmiyor")}>
                        İlgilenme
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <GoogleAtfi />
        {kararsiz.length === 0 && (
          <button type="button" className="dugme-ana" onClick={() => router.refresh()}>
            {props.kalan > props.satirlar.length ? "Sonraki sonuçlar" : "Bitir"}
          </button>
        )}
      </div>
    </section>
  );
}
