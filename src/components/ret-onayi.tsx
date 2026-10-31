"use client";
// Ret onay penceresi. Ret geri alınamaz: düğme önce bu pencereyi açar; ret isteği yalnızca "Ret ver" ile gönderilir
// (sunucu da retOnayi: true olmayan ret isteklerini reddeder). Detay paneli ve WhatsApp günlük liste kullanır.
// Pencere document.body'ye taşınır (portal) ve kendi formu yoktur: düğme bir formun içinde olsa bile (ör. WhatsApp izni
// formu) iç içe form oluşmaz ve "Ret ver" dıştaki formu göndermez.
import { useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { RET_ONAY_METNI } from "@/lib/mesajlasma";

const bosAbone = () => () => {};

export function RetDugmesi(props: { ad: string; etiket: string; disabled?: boolean; onOnay: () => void }) {
  const pencere = useRef<HTMLDialogElement>(null);
  const baslikId = useId();
  const tarayicida = useSyncExternalStore(bosAbone, () => true, () => false);
  const kapat = () => pencere.current?.close();
  return (
    <>
      <button type="button" className="dugme-tehlike" disabled={props.disabled} onClick={() => pencere.current?.showModal()}>
        {props.etiket}
      </button>
      {tarayicida &&
        createPortal(
          <dialog
            ref={pencere}
            aria-labelledby={baslikId}
            className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-kenar bg-white p-5 text-sm shadow-lg backdrop:bg-black/40"
          >
            <div className="flex flex-col gap-3">
              <h2 id={baslikId} className="text-base font-semibold">
                Ret: {props.ad}
              </h2>
              <p>{RET_ONAY_METNI}</p>
              <div className="flex justify-end gap-2">
                <button type="button" className="dugme" autoFocus onClick={kapat}>
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="dugme-tehlike"
                  onClick={() => {
                    kapat();
                    props.onOnay();
                  }}
                >
                  Ret ver
                </button>
              </div>
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
