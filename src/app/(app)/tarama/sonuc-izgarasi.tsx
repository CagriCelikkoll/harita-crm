"use client";
// Bölge tara > taramanın sonuçları (docs/tasarim/Tarama.dc.html): 280 px'lik kart ızgarası, kartta Google'daki ad,
// adres ve merkeze mesafe; İlgilen / Geç, karar sonrası etiket ve Geri al.
// Ad, adres ve konum kullanım %80'e ulaşana kadar otomatik gelir (eşik sunucuda), sonra kartta "Göster" kalır; yalnızca
// bellekte tutulur (components/google-bilgisi.tsx). İlgilen'e basınca ad alanı açılmaz: işletmenin adı Kayıtlar'da,
// kendi kaydınıza yazılır (Google'daki ad bu alana aktarılmaz).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BilgiNotu } from "@/components/arayuz/not";
import { GoogleEtiketi } from "@/components/arayuz/rozet";
import { SekmeGrubu } from "@/components/arayuz/sekmeler";
import { GoogleAtfi } from "@/components/google-atfi";
import { useGoogleBilgisi } from "@/components/google-bilgisi";
import { apiIstek } from "@/lib/api-istemci";
import { mesafeMetni } from "@/lib/arayuz";
import { sayiYaz } from "@/lib/bicim";
import {
  GOOGLE_ADSIZ,
  OTOMATIK_GOSTERIM_SINIRI_METNI,
  TARAMA_KARAR_ADLARI,
  TARAMA_KARARLARI,
  type IncelemeDurumu,
  type TaramaKarari,
} from "@/lib/sabitler";

export type SonucSatiri = { id: string; isletmeAdi: string | null; inceleme: IncelemeDurumu };

export function SonucIzgarasi(props: {
  taramaId: string;
  baslik: string;
  merkez: { lat: number; lng: number } | null;
  satirlar: SonucSatiri[];
  sayilar: { bulunan: number; incelenmedi: number; ilgilenilen: number; gecilen: number };
  karar: TaramaKarari;
  /** Süzgeç ve sayfa bağlantıları sunucuda üretilir (adres ?tarama=&karar=&sonuc=). */
  kararBaglantisi: Record<TaramaKarari, string>;
  sonrakiBaglanti: string | null;
  oncekiBaglanti: string | null;
  otomatik: boolean;
}) {
  const router = useRouter();
  const google = useGoogleBilgisi(
    props.satirlar.map((s) => s.id),
    { otomatikIdler: props.otomatik ? props.satirlar.filter((s) => !s.isletmeAdi).map((s) => s.id) : [] },
  );
  const [kararlar, setKararlar] = useState<Record<string, IncelemeDurumu>>(() =>
    Object.fromEntries(props.satirlar.map((s) => [s.id, s.inceleme])),
  );
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const kararsiz = props.satirlar.filter((s) => kararlar[s.id] === "incelenmedi").map((s) => s.id);

  async function isaretle(idler: string[], inceleme: IncelemeDurumu) {
    setHata(null);
    setMesgul(true);
    const s = await apiIstek("/api/kayitlar/inceleme", { method: "POST", govde: { idler, inceleme } });
    setMesgul(false);
    if (!s.ok) return setHata(s.hata);
    setKararlar((k) => ({ ...k, ...Object.fromEntries(idler.map((id) => [id, inceleme])) }));
    router.refresh(); // özet sayıları (Places'a gitmez)
  }

  return (
    <section aria-labelledby="sonuclar-baslik" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="sonuclar-baslik" className="text-xl font-bold">
            Son tarama: {props.baslik}
          </h2>
          <p className="text-soluk">
            {sayiYaz(props.sayilar.bulunan)} işletme bulundu ·{" "}
            <strong className="text-metin">{sayiYaz(props.sayilar.incelenmedi)} incelenmedi</strong> ·{" "}
            {sayiYaz(props.sayilar.ilgilenilen)} ilgilenilen
          </p>
        </div>
        <SekmeGrubu
          etiket="Sonuç süzgeci"
          secili={props.karar}
          secenekler={TARAMA_KARARLARI.map((k) => ({ deger: k, ad: TARAMA_KARAR_ADLARI[k], href: props.kararBaglantisi[k] }))}
        />
      </div>

      {google.otomatikKapali && <BilgiNotu ton="uyari">{OTOMATIK_GOSTERIM_SINIRI_METNI}</BilgiNotu>}
      {(hata || google.hata) && (
        <p role="alert" className="text-sm text-tehlike">
          {hata ?? google.hata}
        </p>
      )}

      {props.satirlar.length === 0 ? (
        <p className="rounded-kart border border-kenar bg-white p-6 text-soluk">Bu süzgeçte sonuç yok.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {props.satirlar.map((s) => {
            const b = google.bilgi.get(s.id);
            const yer = b && !("hata" in b) ? b : null;
            const karar = kararlar[s.id];
            const yukleniyor = google.yukleniyor.has(s.id);
            return (
              <li
                key={s.id}
                className={`flex flex-col gap-3.5 rounded-kart bg-white p-5 ${
                  karar === "ilgileniyor" ? "border-2 border-ana" : karar === "ilgilenmiyor" ? "border border-kenar opacity-60" : "border border-kenar"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    {s.isletmeAdi ? (
                      <span className="text-[15px] font-semibold">{s.isletmeAdi}</span>
                    ) : yer ? (
                      <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                        {yer.ad} <GoogleEtiketi />
                      </span>
                    ) : (
                      <span className="text-soluk italic">{GOOGLE_ADSIZ}</span>
                    )}
                    <span className="text-[13px] text-soluk">
                      {yukleniyor ? (
                        "Yükleniyor…"
                      ) : b && "hata" in b ? (
                        b.hata
                      ) : yer ? (
                        (yer.adres ?? "")
                      ) : (
                        <button
                          type="button"
                          className="font-medium text-ana underline-offset-2 hover:underline"
                          onClick={() => void google.goster([s.id])}
                          title="Google Haritalar'dan anlık gösterilir; saklanmaz"
                        >
                          Göster
                        </button>
                      )}
                    </span>
                  </div>
                  {yer?.konum && props.merkez && (
                    <span className="text-[13px] whitespace-nowrap text-soluk">{mesafeMetni(props.merkez, yer.konum)}</span>
                  )}
                </div>
                {karar === "incelenmedi" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="dugme-ana dugme-kucuk" disabled={mesgul} onClick={() => void isaretle([s.id], "ilgileniyor")}>
                      İlgilen
                    </button>
                    <button type="button" className="dugme dugme-kucuk" disabled={mesgul} onClick={() => void isaretle([s.id], "ilgilenmiyor")}>
                      Geç
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    {karar === "ilgileniyor" ? (
                      <Link href={`/kayitlar?grup=tum&secili=${s.id}`} className="text-[13px] font-semibold text-ana-koyu hover:underline">
                        Kayıtlara eklendi
                      </Link>
                    ) : (
                      <span className="text-[13px] text-soluk">Geçildi</span>
                    )}
                    <button
                      type="button"
                      className="h-8 px-2.5 text-[13px] text-ana hover:underline"
                      disabled={mesgul}
                      onClick={() => void isaretle([s.id], "incelenmedi")}
                    >
                      Geri al
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-soluk">
          İşletme bilgileri Google Haritalar&apos;dan anlık gösterilir. İlgilendikleriniz Kayıtlar&apos;a eklenir.
          <GoogleAtfi />
        </span>
        <div className="flex flex-wrap gap-2">
          {kararsiz.length > 0 && (
            <button type="button" className="dugme dugme-kucuk" disabled={mesgul} onClick={() => void isaretle(kararsiz, "ilgilenmiyor")}>
              Bu sayfadakileri geç
            </button>
          )}
          {props.oncekiBaglanti && (
            <Link href={props.oncekiBaglanti} className="dugme dugme-kucuk">
              Önceki sayfa
            </Link>
          )}
          {props.sonrakiBaglanti && (
            <Link href={props.sonrakiBaglanti} className="dugme dugme-kucuk">
              Sonraki sayfa
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
