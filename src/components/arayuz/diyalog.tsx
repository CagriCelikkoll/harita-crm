"use client";
// Diyalog: tek modal pencere bileşeni (ret onayı, toplu işlem onayı, İYS kontrolünü kapatma). Yerleşik <dialog> modal
// açılır (arka plan etkisizleşir), aria-modal, odak tuzağı (Tab / Shift+Tab pencerede döner), Esc ile kapanır, arka
// plana tıklayınca kapanır; kapanınca odak pencereyi açan öğeye döner. document.body'ye taşınır (portal): kendi formu
// olmadığından dıştaki bir formun içinde açılsa da iç içe form oluşmaz.
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pencereDisinaTiklaninca } from "@/lib/disari-tiklama";

const bosAbone = () => () => {};
const ODAKLANABILIR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Tab'ın pencere içinde dönmesi için sıradaki odak (saf işlev): ilkten geri → son, sondan ileri → ilk; aksi halde null. */
export function tuzakHedefi<T>(ogeler: T[], aktif: T | null, geri: boolean): T | null {
  if (!ogeler.length) return null;
  const ilk = ogeler[0];
  const son = ogeler[ogeler.length - 1];
  if (geri && (aktif === ilk || aktif === null || !ogeler.includes(aktif))) return son;
  if (!geri && (aktif === son || aktif === null || !ogeler.includes(aktif))) return ilk;
  return null;
}

export function Diyalog(props: {
  acik: boolean;
  onKapat: () => void;
  baslik: ReactNode;
  children: ReactNode;
  /** Alt sağdaki düğmeler (Vazgeç / Onayla). */
  eylemler?: ReactNode;
  genislik?: "dar" | "orta";
}) {
  const pencere = useRef<HTMLDialogElement>(null);
  const acan = useRef<Element | null>(null);
  const baslikId = useId();
  const tarayicida = useSyncExternalStore(bosAbone, () => true, () => false);
  const { acik } = props;

  useEffect(() => {
    const d = pencere.current;
    if (!d) return;
    if (acik && !d.open) {
      acan.current = document.activeElement;
      d.showModal();
    } else if (!acik && d.open) d.close();
  }, [acik, tarayicida]);

  if (!tarayicida) return null;
  return createPortal(
    <dialog
      ref={pencere}
      aria-modal="true"
      aria-labelledby={baslikId}
      onClick={pencereDisinaTiklaninca}
      onClose={() => {
        if (acik) props.onKapat();
        (acan.current as HTMLElement | null)?.focus?.();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const ogeler = [...e.currentTarget.querySelectorAll<HTMLElement>(ODAKLANABILIR)];
        const hedef = tuzakHedefi(ogeler, document.activeElement as HTMLElement | null, e.shiftKey);
        if (hedef) {
          e.preventDefault();
          hedef.focus();
        }
      }}
      className={`m-auto ${props.genislik === "orta" ? "w-[min(30rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]"} rounded-kart border border-kenar bg-white p-5 text-sm shadow-yukselti backdrop:bg-black/40`}
    >
      <div className="flex flex-col gap-3">
        <h2 id={baslikId} className="text-base font-semibold">
          {props.baslik}
        </h2>
        {props.children}
        {props.eylemler && <div className="flex flex-wrap justify-end gap-2">{props.eylemler}</div>}
      </div>
    </dialog>,
    document.body,
  );
}
