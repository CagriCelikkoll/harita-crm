"use client";
// Bölge tara > taramanın sonuçları (docs/tasarim/Tarama.dc.html): 280 px'lik kart ızgarası, kartta Google'daki ad,
// adres ve merkeze mesafe; İlgilen / Geç, karar sonrası etiket ve Geri al.
// Kartlar Google'dan kendiliğinden veri çekmez (listeyi açmak kullanım harcamaz): adı girilmemiş kayıtta nötr yer tutucu
// ve "Google'dan getir" (yalnızca o kayıt için; "aylık kullanımdan düşer"). Getirilen ad, adres ve konum yalnızca
// bellekte tutulur (components/google-bilgisi.tsx); önbellekte olan kayıt istek yapmadan gösterilir. İlgilen'e basınca ad alanı açılmaz: işletmenin adı Kayıtlar'da,
// kendi kaydınıza yazılır (Google'daki ad bu alana aktarılmaz).
import { Dugme } from "@/components/arayuz/dugme";
import { useState } from "react";
import Link from "next/link";
import { Sayfalama } from "@/components/arayuz/sayfalama";
import { useRouter } from "next/navigation";
import { GoogleEtiketi } from "@/components/arayuz/rozet";
import { SekmeGrubu } from "@/components/arayuz/sekmeler";
import { GoogleAtfi } from "@/components/google-atfi";
import { useGoogleBilgisi } from "@/components/google-bilgisi";
import { apiIstek } from "@/lib/api-istemci";
import { mesafeMetni } from "@/lib/arayuz";
import { googleKaynakNotu } from "@/lib/google-kaynak-notu";
import { sayiYaz } from "@/lib/bicim";
import {
  GOOGLE_ADSIZ,
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
  /** Sayfalama: sayfasız adres (?tarama=&karar=), sayfa ?sonuc= parametresinde. */
  sayfalama: { sayfa: number; sayfaSayisi: number; toplam: number; boyut: number; taban: string };
}) {
  const router = useRouter();
  // Otomatik istek yok: yalnızca önbellekte olanlar hemen görünür (istek yapılmaz); gerisi "Google'dan getir" ile.
  const google = useGoogleBilgisi(props.satirlar.map((s) => s.id));
  // Bu ekranda kullanıcının Google'dan getirdikleri (not: "aylık kullanımdan düşer"); diğerleri önbellekten.
  const [getirilenler, setGetirilenler] = useState<ReadonlySet<string>>(new Set());
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
          <h2 id="sonuclar-baslik" className="text-xl font-semibold">
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

      {(hata || google.hata) && (
        <p role="alert" className="text-sm text-tehlike">
          {hata ?? google.hata}
        </p>
      )}

      {props.satirlar.length === 0 ? (
        <p className="kart text-soluk">Bu süzgeçte sonuç yok.</p>
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
                      <span className="text-base font-semibold">{s.isletmeAdi}</span>
                    ) : yer ? (
                      <span className="flex flex-wrap items-center gap-2 text-base font-semibold">
                        {yer.ad} <GoogleEtiketi />
                      </span>
                    ) : (
                      <span className="text-soluk">{GOOGLE_ADSIZ}</span>
                    )}
                    {yer ? (
                      <>
                        {yer.adres && <span className="text-ufak text-soluk">{yer.adres}</span>}
                        <span role="note" className="text-xs text-soluk">
                          {googleKaynakNotu(getirilenler.has(s.id) ? { tur: "google" } : { tur: "onbellek" })}
                        </span>
                      </>
                    ) : b && "hata" in b ? (
                      <span className="text-ufak text-soluk">{b.hata}</span>
                    ) : (
                      !s.isletmeAdi && (
                        <span className="flex flex-wrap items-baseline gap-x-2 text-ufak">
                          <Dugme
                            tur="metin"
                            yukleniyor={yukleniyor}
                            onClick={() => {
                              setGetirilenler((g) => new Set(g).add(s.id));
                              void google.goster([s.id]);
                            }}
                          >
                            {"Google'dan getir"}
                          </Dugme>
                          <span className="text-xs text-soluk">aylık kullanımdan düşer</span>
                        </span>
                      )
                    )}
                  </div>
                  {yer?.konum && props.merkez && (
                    <span className="text-ufak whitespace-nowrap text-soluk">{mesafeMetni(props.merkez, yer.konum)}</span>
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
                      <Link href={`/kayitlar?grup=tum&secili=${s.id}`} className="text-ufak font-semibold text-ana-koyu hover:underline">
                        Kayıtlara eklendi
                      </Link>
                    ) : (
                      <span className="text-ufak text-soluk">Geçildi</span>
                    )}
                    <Dugme tur="metin" className="text-ufak" disabled={mesgul} onClick={() => void isaretle([s.id], "incelenmedi")}>
                      Geri al
                    </Dugme>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ufak text-soluk">
          Google bilgileri yalnızca istediğiniz kayıt için getirilir, kaydedilmez. İlgilendikleriniz Kayıtlar&apos;a eklenir.
          <GoogleAtfi />
        </span>
        <div className="flex flex-wrap gap-2">
          {kararsiz.length > 0 && (
            <button type="button" className="dugme dugme-kucuk" disabled={mesgul} onClick={() => void isaretle(kararsiz, "ilgilenmiyor")}>
              Bu sayfadakileri geç
            </button>
          )}
        </div>
      </div>
      <Sayfalama className="mt-3" {...props.sayfalama} param="sonuc" kayitAdi="sonuç" />
    </section>
  );
}
