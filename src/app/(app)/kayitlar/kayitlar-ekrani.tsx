"use client";
// Tablo + ayrıntı paneli. Kayıt seçmek ve kayıt üzerinde işlem yapmak sunucuda sayfayı yeniden çizmez.
// Adı girilmemiş Google kayıtlarının adı ve adresi, kullanım %80'e ulaşana kadar açılışta otomatik istenir (eşik
// sunucuda); sonra satırlar "Göster" düğmesine döner. Google bilgileri yalnızca bellekte tutulur (en fazla 30 dakika,
// lib/google-onbellegi.ts; tarayıcı depolamasına yazılmaz).
// Geniş ekranda panel tablonun sağındadır; dar ekranda sağdan açılan çekmecedir.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BilgiNotu } from "@/components/arayuz/not";
import { GoogleAtfi } from "@/components/google-atfi";
import { useGoogleBilgisi } from "@/components/google-bilgisi";
import { sayiYaz } from "@/lib/bicim";
import { OTOMATIK_GOSTERIM_SINIRI_METNI } from "@/lib/sabitler";
import type { KayitDto } from "@/server/servisler/kayit-dto";
import { DetayPaneli } from "./detay-paneli";
import { KayitTablosu, type TabloSatiri } from "./kayit-tablosu";

export function KayitlarEkrani(props: {
  satirlar: TabloSatiri[];
  toplam: number;
  seciliIlk: string | null;
  kullaniciId: string;
  /** Kullanım uyarı eşiğinin altında: adı girilmemiş Google kayıtları açılışta otomatik istenir. */
  otomatik: boolean;
  /** Mevcut filtre + sayfa sorgusu (secili hariç). */
  sorgu: string;
  sayfa: number;
  sayfaSayisi: number;
  oncekiBaglanti: string | null;
  sonrakiBaglanti: string | null;
}) {
  const [satirlar, setSatirlar] = useState(props.satirlar);
  const [toplam, setToplam] = useState(props.toplam);
  const [secili, setSecili] = useState<string | null>(props.seciliIlk);
  const google = useGoogleBilgisi(
    props.satirlar.map((s) => s.id),
    { otomatikIdler: props.otomatik ? props.satirlar.filter((s) => s.kaynak === "google" && !s.isletmeAdi).map((s) => s.id) : [] },
  );

  const seciliBaglantisi = useCallback(
    (id: string | null) => {
      const s = new URLSearchParams(props.sorgu);
      if (id) s.set("secili", id);
      return `/kayitlar${s.size ? `?${s}` : ""}`;
    },
    [props.sorgu],
  );

  const sec = useCallback(
    (id: string | null) => {
      setSecili(id);
      // Paylaşılabilir bağlantı için adres çubuğunu güncelle (sunucuya gitmeden).
      window.history.replaceState(null, "", seciliBaglantisi(id));
    },
    [seciliBaglantisi],
  );

  // Dar ekranda çekmece Escape ile kapanır.
  useEffect(() => {
    if (!secili) return;
    const dinle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && window.matchMedia("(max-width: 1279px)").matches) sec(null);
    };
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, [secili, sec]);

  const kayitDegisti = useCallback((k: KayitDto, ek: { whatsappIzni: TabloSatiri["whatsappIzni"]; engelli: boolean }) => {
    setSatirlar((onceki) =>
      onceki.map((s) =>
        s.id === k.id
          ? {
              ...s,
              durum: k.durum,
              iletiIzni: k.iletiIzni,
              etiketler: k.etiketler,
              isletmeAdi: k.isletmeAdi,
              yetkiliAdi: k.yetkiliAdi,
              inceleme: k.inceleme,
              guncellemeTarihi: k.guncellemeTarihi,
              whatsappIzni: ek.whatsappIzni,
              engelli: ek.engelli,
            }
          : s,
      ),
    );
  }, []);

  function silindi(id: string) {
    setSatirlar((onceki) => onceki.filter((s) => s.id !== id));
    setToplam((t) => Math.max(0, t - 1));
    sec(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {google.otomatikKapali && <BilgiNotu ton="uyari">{OTOMATIK_GOSTERIM_SINIRI_METNI}</BilgiNotu>}
      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Kayıt listesi" className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-kart border border-kenar bg-white">
          <KayitTablosu satirlar={satirlar} seciliId={secili} seciliBaglantisi={seciliBaglantisi} onSec={sec} google={google} />
          <div className="flex flex-wrap items-center justify-between gap-3 bg-kart-alt px-5 py-3.5 text-[13px] text-soluk">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{sayiYaz(toplam)} kayıt</span>
              <span>&quot;Google&quot; etiketli bilgiler Google Haritalar&apos;dan anlık gösterilir, kaydedilmez.</span>
              <GoogleAtfi />
            </span>
            {props.sayfaSayisi > 1 && (
              <nav aria-label="Sayfalar" className="flex items-center gap-2">
                {props.oncekiBaglanti ? (
                  <Link className="dugme dugme-kucuk" href={props.oncekiBaglanti} aria-label="Önceki sayfa">
                    ‹
                  </Link>
                ) : (
                  <span className="dugme dugme-kucuk opacity-40" aria-hidden="true">
                    ‹
                  </span>
                )}
                <span className="tabular-nums">
                  {props.sayfa} / {props.sayfaSayisi}
                </span>
                {props.sonrakiBaglanti ? (
                  <Link className="dugme dugme-kucuk" href={props.sonrakiBaglanti} aria-label="Sonraki sayfa">
                    ›
                  </Link>
                ) : (
                  <span className="dugme dugme-kucuk opacity-40" aria-hidden="true">
                    ›
                  </span>
                )}
              </nav>
            )}
          </div>
        </section>

        {secili && (
          <div
            id="detay-alani"
            className="min-w-0 flex-[1_1_380px] xl:max-w-[460px] max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:w-full max-xl:max-w-[460px] max-xl:overflow-y-auto max-xl:shadow-2xl"
          >
            <DetayPaneli
              key={secili}
              id={secili}
              kullaniciId={props.kullaniciId}
              googleBilgisi={google.bilgi.get(secili)}
              onKapat={() => sec(null)}
              onKayitDegisti={kayitDegisti}
              onSilindi={silindi}
            />
          </div>
        )}
      </div>
    </div>
  );
}
