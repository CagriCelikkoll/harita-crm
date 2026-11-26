"use client";
// Sayfalı listelerin ortak sayfalama çubuğu (Kayıtlar, Kampanyalar, kampanya alıcıları, tarama sonuçları).
// - İlk / Önceki / numaralı sayfalar (çoksa kısaltma: 1 … 4 5 6 … 11) / Sonraki / Son, "Sayfaya git" kutusu ve
//   "Sayfa 3 / 11 · 201–300 / 1.045 kayıt" bilgisi.
// - Sayfa adreste tutulur: düğmeler bağlantıdır, "Sayfaya git" router.push kullanır; geri tuşu önceki sayfaya döner.
//   Sayfa numarası liste tercihine yazılmaz (lib/liste-tercihi).
// - Dar ekranda numaralar ve "Sayfaya git" gizlenir: İlk / Önceki / "3/11" / Sonraki / Son kalır.
// Hesaplar lib/sayfalama'dadır (testli saf işlevler).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { sayiYaz } from "@/lib/bicim";
import { SAYFA_BOSLUGU, sayfaAdresi, sayfaBilgisi, sayfaGirdisiCoz, sayfaNumaralari, sayfaSinirla } from "@/lib/sayfalama";

const KUTU = "dugme dugme-kucuk min-w-10 px-2.5 tabular-nums";

function Adim(props: { href: string | null; etiket: string; kisa: string; uzun: string }) {
  const icerik: ReactNode = (
    <>
      <span aria-hidden="true">{props.kisa}</span>
      <span className="hidden md:inline">{props.uzun}</span>
    </>
  );
  return props.href ? (
    <Link href={props.href} className={KUTU} aria-label={props.etiket} scroll={false}>
      {icerik}
    </Link>
  ) : (
    <span className={`${KUTU} cursor-not-allowed opacity-40`} aria-disabled="true" aria-label={props.etiket} role="link">
      {icerik}
    </span>
  );
}

export function Sayfalama(props: {
  sayfa: number;
  sayfaSayisi: number;
  toplam: number;
  boyut: number;
  /** Sayfasız adres ("/kayitlar?grup=tum"): diğer parametreler korunur. */
  taban: string;
  /** Adresteki sayfa parametresi (varsayılan "sayfa"). */
  param?: string;
  /** Bilgi satırında sayının yanındaki ad (varsayılan "kayıt"). */
  kayitAdi?: string;
  className?: string;
}) {
  const router = useRouter();
  const girdiId = useId();
  const { sayfaSayisi, toplam, boyut, taban, param = "sayfa", kayitAdi = "kayıt" } = props;
  const sayfa = sayfaSinirla(props.sayfa, sayfaSayisi);
  const [girdi, setGirdi] = useState("");
  const [uyari, setUyari] = useState<string | null>(null);
  useEffect(() => {
    if (!uyari) return;
    const z = setTimeout(() => setUyari(null), 4000);
    return () => clearTimeout(z);
  }, [uyari]);

  const adres = (n: number) => sayfaAdresi(taban, n, param);
  const bilgi = sayfaBilgisi(sayfa, sayfaSayisi, boyut, toplam, kayitAdi);

  function git(e: FormEvent) {
    e.preventDefault();
    const s = sayfaGirdisiCoz(girdi, sayfaSayisi);
    setUyari(s.uyari);
    if (s.tur === "gecersiz") return;
    setGirdi("");
    if (s.sayfa !== sayfa) router.push(adres(s.sayfa), { scroll: false });
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-ufak text-soluk ${props.className ?? ""}`}>
      <span className="tabular-nums">{bilgi}</span>
      {sayfaSayisi > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <nav aria-label="Sayfalar" className="flex items-center gap-1">
            <Adim href={sayfa > 1 ? adres(1) : null} etiket="İlk sayfa" kisa="«" uzun="İlk" />
            <Adim href={sayfa > 1 ? adres(sayfa - 1) : null} etiket="Önceki sayfa" kisa="‹" uzun="Önceki" />
            <span className="px-2 font-medium text-metin tabular-nums sm:hidden">
              {sayfa}/{sayfaSayisi}
            </span>
            <ol className="hidden items-center gap-1 sm:flex">
              {sayfaNumaralari(sayfa, sayfaSayisi).map((n, i) =>
                n === SAYFA_BOSLUGU ? (
                  <li key={`b${i}`} aria-hidden="true" className="px-1">
                    …
                  </li>
                ) : (
                  <li key={n}>
                    {n === sayfa ? (
                      <span className={`${KUTU} border-ana bg-ana-acik font-semibold text-ana-koyu`} aria-current="page">
                        {sayiYaz(n)}
                      </span>
                    ) : (
                      <Link href={adres(n)} className={KUTU} aria-label={`Sayfa ${n}`} scroll={false}>
                        {sayiYaz(n)}
                      </Link>
                    )}
                  </li>
                ),
              )}
            </ol>
            <Adim href={sayfa < sayfaSayisi ? adres(sayfa + 1) : null} etiket="Sonraki sayfa" kisa="›" uzun="Sonraki" />
            <Adim href={sayfa < sayfaSayisi ? adres(sayfaSayisi) : null} etiket="Son sayfa" kisa="»" uzun="Son" />
          </nav>
          <form onSubmit={git} className="hidden items-center gap-1.5 sm:flex">
            <label htmlFor={girdiId}>Sayfaya git</label>
            <input
              id={girdiId}
              inputMode="numeric"
              autoComplete="off"
              value={girdi}
              onChange={(e) => setGirdi(e.target.value)}
              placeholder={String(sayfa)}
              aria-describedby={uyari ? `${girdiId}-uyari` : undefined}
              className="min-h-10 w-16 rounded-lg border border-kenar-alan bg-white px-2 text-center text-sm text-metin tabular-nums focus:border-ana focus:ring-2 focus:ring-ana/25 focus:outline-none"
            />
          </form>
        </div>
      )}
      <span id={`${girdiId}-uyari`} role="status" className={uyari ? "w-full text-right text-uyari" : "sr-only"}>
        {uyari ?? ""}
      </span>
    </div>
  );
}
