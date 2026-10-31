"use client";
// Tablo + detay paneli. Kayıt seçmek ve kayıt üzerinde işlem yapmak sunucuda sayfayı yeniden çizmez. Liste
// Places'a kendiliğinden gitmez; Google bilgisi yalnızca istenince gelir ve bu bileşenin belleğinde tutulur.
// Detay panelinin Places sonucu da aynı sayfa görünümünde bellekte tutulur: aynı kayıt yeniden açılınca yeniden
// çağrılmaz. Sayfa / süzgeç değişince bileşen yeniden oluşur ve ikisi de silinir (tarayıcı depolamasına yazılmaz).
import { useCallback, useState } from "react";
import Link from "next/link";
import { GoogleAtfi } from "@/components/google-atfi";
import { useGoogleBilgisi } from "@/components/google-bilgisi";
import { sayiYaz } from "@/lib/bicim";
import type { CanliSonuc } from "@/server/servisler/canli-bilgi";
import type { KayitDto } from "@/server/servisler/kayit-dto";
import { DetayPaneli } from "./detay-paneli";
import { KayitTablosu, type TabloSatiri } from "./kayit-tablosu";

export function KayitlarEkrani(props: {
  satirlar: TabloSatiri[];
  toplam: number;
  seciliIlk: string | null;
  kullaniciId: string;
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
  const google = useGoogleBilgisi();
  const [detayOnbellegi] = useState(() => new Map<string, CanliSonuc>());

  const seciliBaglantisi = useCallback(
    (id: string | null) => {
      const s = new URLSearchParams(props.sorgu);
      if (id) s.set("secili", id);
      return `/kayitlar${s.size ? `?${s}` : ""}`;
    },
    [props.sorgu],
  );

  function sec(id: string | null) {
    setSecili(id);
    // Paylaşılabilir bağlantı için adres çubuğunu güncelle (sunucuya gitmeden).
    window.history.replaceState(null, "", seciliBaglantisi(id));
    if (id && window.matchMedia("(max-width: 1279px)").matches) {
      requestAnimationFrame(() => document.getElementById("detay-alani")?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  const kayitDegisti = useCallback((k: KayitDto) => {
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
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="kart min-w-0">
        <p className="mb-3 text-sm text-soluk">{sayiYaz(toplam)} kayıt</p>
        <KayitTablosu satirlar={satirlar} seciliId={secili} seciliBaglantisi={seciliBaglantisi} onSec={sec} google={google} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <GoogleAtfi />
          {props.sayfaSayisi > 1 && (
            <nav aria-label="Sayfalar" className="flex items-center gap-2 text-sm">
              {props.oncekiBaglanti && (
                <Link className="dugme" href={props.oncekiBaglanti}>
                  Önceki
                </Link>
              )}
              <span className="text-soluk">
                Sayfa {props.sayfa} / {props.sayfaSayisi}
              </span>
              {props.sonrakiBaglanti && (
                <Link className="dugme" href={props.sonrakiBaglanti}>
                  Sonraki
                </Link>
              )}
            </nav>
          )}
        </div>
      </section>

      <div id="detay-alani">
        {secili ? (
          <DetayPaneli
            key={secili}
            id={secili}
            kullaniciId={props.kullaniciId}
            canliOnbellegi={detayOnbellegi}
            onKapat={() => sec(null)}
            onKayitDegisti={kayitDegisti}
            onSilindi={silindi}
          />
        ) : (
          <aside className="kart hidden text-sm text-soluk xl:block">Ayrıntıları görmek için listeden bir kayıt seçin.</aside>
        )}
      </div>
    </div>
  );
}
