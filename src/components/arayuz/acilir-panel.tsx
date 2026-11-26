"use client";
// Düğmeyle açılan panel (ör. Kayıtlar "Filtreler"): dışarı tıklayınca ve Esc ile kapanır (lib/disari-tiklama).
// Panel kapanınca içeriği DOM'da kalır (yalnızca gizlenir): panelde seçilip "Uygula"ya basılmamış değişiklikler ne
// sessizce kaybolur ne de sessizce uygulanır; yeniden açınca aynen durur. Böyle bir değişiklik varken düğmede
// "uygulanmadı" işareti, panelin üstünde "Geri al" görünür. Panelden form gönderilince ya da bir bağlantıya
// tıklanınca panel kapanır.
// Panel düğmeye hizalanır (panelSinifi, ör. right-0); ekranın kenarından taşacaksa açılınca görünür alana kaydırılır
// (dar ekranda düğme solda kalınca sağa hizalı panel sola, ekran dışına taşıyordu).
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useDisariTiklama } from "@/lib/disari-tiklama";

/** Panelin görünür alana girmesi için yatay kaydırma (px). Saf işlev: `kenar` ekran kenarından bırakılan boşluk. */
export function ekranaSigdir(sol: number, sag: number, ekranGenisligi: number, kenar = 8): number {
  if (sag - sol > ekranGenisligi - 2 * kenar) return kenar - sol; // ekrandan genişse soldan hizala
  if (sol < kenar) return kenar - sol;
  if (sag > ekranGenisligi - kenar) return ekranGenisligi - kenar - sag;
  return 0;
}

/** Panel ekranın altından taşıyorsa verilecek en büyük yükseklik (en az 240 px); sığıyorsa null. */
export function panelYuksekligi(ust: number, yukseklik: number, ekranYuksekligi: number, kenar = 12): number | null {
  if (ust + yukseklik <= ekranYuksekligi - kenar) return null;
  return Math.max(240, Math.floor(ekranYuksekligi - ust - kenar));
}

/** Formda varsayılan (sunucudan gelen) değerinden farklı alan var mı. */
function formDegistiMi(form: HTMLFormElement): boolean {
  for (const el of Array.from(form.elements)) {
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked !== el.defaultChecked) return true;
      } else if (el.type !== "hidden" && el.type !== "submit" && el.value !== el.defaultValue) return true;
    } else if (el instanceof HTMLSelectElement) {
      if (Array.from(el.options).some((o) => o.selected !== o.defaultSelected)) return true;
    } else if (el instanceof HTMLTextAreaElement && el.value !== el.defaultValue) return true;
  }
  return false;
}

export function AcilirPanel(props: { dugme: ReactNode; panelSinifi: string; children: ReactNode }) {
  const [acik, setAcik] = useState(false);
  const [degisti, setDegisti] = useState(false);
  const kok = useRef<HTMLDivElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useDisariTiklama(
    acik,
    [kok],
    (neden) => {
      setAcik(false);
      if (neden === "esc") dugme.current?.focus();
    },
    { tiklamayiYut: true },
  );

  // Açılınca (ve pencere boyutu değişince) panel ekran dışına taşıyorsa yatayda kaydırılır.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!acik || !el) return;
    const yerlestir = () => {
      el.style.translate = "";
      el.style.maxHeight = "";
      el.style.overflowY = "";
      const r = el.getBoundingClientRect();
      const dx = ekranaSigdir(r.left, r.right, document.documentElement.clientWidth);
      if (dx) el.style.translate = `${Math.round(dx)}px 0`;
      // Alttan taşıyorsa görünür alana sığdır, içi kaysın (panelin düğmeleri sticky ise altta görünür kalır).
      const yukseklik = panelYuksekligi(r.top, r.height, window.innerHeight);
      if (yukseklik !== null) {
        el.style.maxHeight = `${yukseklik}px`;
        el.style.overflowY = "auto";
      }
    };
    yerlestir();
    window.addEventListener("resize", yerlestir);
    return () => window.removeEventListener("resize", yerlestir);
  }, [acik]);

  const denetle = () => {
    const form = panel.current?.querySelector("form");
    setDegisti(!!form && formDegistiMi(form));
  };
  const geriAl = () => {
    panel.current?.querySelector("form")?.reset();
    setDegisti(false);
  };

  return (
    <div ref={kok} className="relative">
      <button ref={dugme} type="button" className="dugme" aria-expanded={acik} aria-controls={panelId} onClick={() => setAcik((x) => !x)}>
        {props.dugme}
        {degisti && (
          <span className="size-2 rounded-full bg-uyari" title="Uygulanmamış değişiklik var">
            <span className="sr-only">(uygulanmamış değişiklik var)</span>
          </span>
        )}
      </button>
      <div
        ref={panel}
        id={panelId}
        hidden={!acik}
        className={props.panelSinifi}
        onChange={denetle}
        onInput={denetle}
        onSubmit={() => {
          setAcik(false);
          setDegisti(false);
        }}
        onClick={(e) => {
          if ((e.target as Element).closest("a")) {
            setAcik(false);
            setDegisti(false);
          }
        }}
      >
        {degisti && (
          <p className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-uyari-acik px-3 py-2 text-xs text-uyari" role="status">
            Uygulanmamış değişiklik var: listeye yansıması için &quot;Uygula&quot;ya basın.
            <button type="button" className="dugme-metin !text-uyari" onClick={geriAl}>
              Geri al
            </button>
          </p>
        )}
        {props.children}
      </div>
    </div>
  );
}
