"use client";
// Gelen kutusu: gelen mesajdaki Türkiye cep numaraları tıklanabilir (lib/telefon-algilama). Menü: "Kayıtlarda aç"
// (numara kayıtlıysa), "Kişi olarak ekle" (kayıtlı değilse), "Şablon gönder" (herkes; kullanıcı başına günde
// TEKIL_GUNLUK_SINIR, dolunca nedeni pencerede) ve "Kopyala".
// "Şablon gönder" penceresi sablon-gonder-penceresi.tsx; yalnızca açılınca yüklenir (gelen kutusu sihirbaz kodunu taşımaz).
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bildir } from "@/components/bildirim";
import { DonerGosterge } from "@/components/arayuz/doner-gosterge";
import { telefonBicimle } from "@/lib/adres-normal";
import { apiIstek } from "@/lib/api-istemci";
import { useDisariTiklama } from "@/lib/disari-tiklama";
import { TEKIL_GUNLUK_SINIR } from "@/lib/mesajlasma";
import { telefonlaParcala, YENI_KISI_ON_DOLUM, yerelTelefon, type BulunanTelefon } from "@/lib/telefon-algilama";
import type { YonlendirmeBilgisi } from "@/server/servisler/yonlendirme";

const SablonGonderPenceresi = dynamic(() => import("./sablon-gonder-penceresi").then((m) => m.SablonGonderPenceresi), { ssr: false });

const MENU_OGESI = "rounded-md px-3 py-2 text-left max-sm:min-h-11 hover:bg-uzerine-gelme active:bg-basili disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

/** Gelen mesaj metni: numaralar menülü düğme, geri kalanı düz metin. */
export function NumaraliMetin(props: { metin: string; sohbetId: string; onSohbetAc: (id: string) => void }) {
  const parcalar = useMemo(() => telefonlaParcala(props.metin), [props.metin]);
  return (
    <>
      {parcalar.map((p, i) =>
        "metin" in p ? (
          <Fragment key={i}>{p.metin}</Fragment>
        ) : (
          <NumaraMenusu key={i} telefon={p.telefon} sohbetId={props.sohbetId} onSohbetAc={props.onSohbetAc} />
        ),
      )}
    </>
  );
}

const MENU_GENISLIK = 224; // w-56
const KENAR = 8;

/** Sabit menünün konumu: düğmenin altında (alt yarıdaysa üstünde), ekranın iki yanından KENAR içeride. Saf işlev. */
export function menuKonumu(r: { left: number; top: number; bottom: number }, genislik: number, yukseklik: number): CSSProperties {
  const left = Math.max(KENAR, Math.min(r.left, genislik - MENU_GENISLIK - KENAR));
  return r.top > yukseklik / 2 ? { left, bottom: yukseklik - r.top + 4 } : { left, top: r.bottom + 4 };
}

function NumaraMenusu(props: { telefon: BulunanTelefon; sohbetId: string; onSohbetAc: (id: string) => void }) {
  const router = useRouter();
  const [acik, setAcik] = useState(false);
  // Menü ekrana sabit konumlanır (mesaj listesinin kaydırma kabında kesilmez, telefonda sağa taşmaz); sayfa ya da liste
  // kayınca kapanır.
  const [konum, setKonum] = useState<CSSProperties>({});
  const [bilgi, setBilgi] = useState<YonlendirmeBilgisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [pencere, setPencere] = useState(false);
  const kok = useRef<HTMLSpanElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  const yerel = yerelTelefon(props.telefon.normal);
  useDisariTiklama(acik, [kok], (neden) => {
    setAcik(false);
    if (neden === "esc") dugme.current?.focus();
  });
  useEffect(() => {
    if (!acik) return;
    const kapat = (e: Event) => {
      if (!(e.target instanceof Node && kok.current?.contains(e.target))) setAcik(false);
    };
    window.addEventListener("scroll", kapat, true);
    window.addEventListener("resize", kapat);
    return () => {
      window.removeEventListener("scroll", kapat, true);
      window.removeEventListener("resize", kapat);
    };
  }, [acik]);

  const ac = async () => {
    if (acik) return setAcik(false);
    const r = dugme.current?.getBoundingClientRect();
    // clientWidth: dikey kaydırma çubuğu hariç genişlik (menü çubuğun üstüne binmez).
    if (r) setKonum(menuKonumu(r, document.documentElement.clientWidth, window.innerHeight));
    setAcik(true);
    if (bilgi) return;
    setHata(null);
    const y = await apiIstek<YonlendirmeBilgisi>("/api/yonlendirme/bilgi", { method: "POST", govde: { sohbetId: props.sohbetId, telefon: props.telefon.normal } });
    if (y.ok) setBilgi(y.veri);
    else setHata(y.hata);
  };
  const kopyala = async () => {
    setAcik(false);
    try {
      await navigator.clipboard.writeText(yerel);
      bildir("Numara kopyalandı.");
    } catch {
      bildir("Numara kopyalanamadı.", "hata");
    }
  };
  const kisiEkle = () => {
    try {
      window.sessionStorage.setItem(YENI_KISI_ON_DOLUM, JSON.stringify({ ekTelefon: yerel }));
    } catch {
      /* depo kapalıysa form boş açılır */
    }
    router.push("/kayitlar/yeni");
  };

  return (
    <span ref={kok} className="relative inline">
      <button
        ref={dugme}
        type="button"
        aria-haspopup="menu"
        aria-expanded={acik}
        title="Numara işlemleri"
        className="rounded-md font-medium text-ana-koyu underline decoration-dotted underline-offset-2 hover:decoration-solid"
        onClick={() => void ac()}
      >
        {props.telefon.ham}
      </button>
      {acik && (
        <span
          role="menu"
          aria-label={`${yerel} numarası`}
          style={konum}
          className="fixed z-30 flex w-56 flex-col rounded-lg border border-kenar bg-white p-1 text-sm font-normal whitespace-normal text-metin shadow-yukselti"
        >
          <span className="px-3 pt-1.5 pb-1 text-xs text-soluk tabular-nums">{telefonBicimle(props.telefon.normal)}</span>
          {!bilgi && !hata && (
            <span className="px-3 py-2">
              <DonerGosterge boyut={14} etiket="Bakılıyor…" />
            </span>
          )}
          {hata && <span className="px-3 py-2 text-xs text-tehlike">{hata}</span>}
          {bilgi?.kayit && (
            <Link role="menuitem" href={`/kayitlar?grup=tum&secili=${bilgi.kayit.id}`} className={MENU_OGESI}>
              Kayıtlarda aç <span className="text-xs text-soluk">({bilgi.kayit.ad})</span>
            </Link>
          )}
          {bilgi && !bilgi.kayit && (
            <button type="button" role="menuitem" className={MENU_OGESI} onClick={kisiEkle}>
              Kişi olarak ekle
            </button>
          )}
          {bilgi && (
            <button
              type="button"
              role="menuitem"
              className={MENU_OGESI}
              onClick={() => {
                setAcik(false);
                setPencere(true);
              }}
            >
              Şablon gönder
              <span className="block text-xs text-soluk">
                Bugün kalan hakkınız: {bilgi.kalanHak} / {TEKIL_GUNLUK_SINIR}
              </span>
            </button>
          )}
          <button type="button" role="menuitem" className={MENU_OGESI} onClick={() => void kopyala()}>
            Kopyala
          </button>
        </span>
      )}
      {pencere && bilgi && (
        <SablonGonderPenceresi
          bilgi={bilgi}
          sohbetId={props.sohbetId}
          onKapat={() => setPencere(false)}
          onGonderildi={(s) => {
            setPencere(false);
            props.onSohbetAc(s.sohbetId);
          }}
        />
      )}
    </span>
  );
}
