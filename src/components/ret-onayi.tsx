"use client";
// Ret onay penceresi. Ret geri alınamaz: düğme önce bu pencereyi açar; ret isteği yalnızca "Ret ver" ile gönderilir
// (sunucu da retOnayi: true olmayan ret isteklerini reddeder). Detay paneli ve WhatsApp günlük liste kullanır.
import { useId, useRef } from "react";
import { RET_ONAY_METNI } from "@/lib/mesajlasma";

export function RetDugmesi(props: { ad: string; etiket: string; disabled?: boolean; onOnay: () => void }) {
  const pencere = useRef<HTMLDialogElement>(null);
  const baslikId = useId();
  return (
    <>
      <button type="button" className="dugme-tehlike" disabled={props.disabled} onClick={() => pencere.current?.showModal()}>
        {props.etiket}
      </button>
      <dialog
        ref={pencere}
        aria-labelledby={baslikId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-kenar bg-white p-5 text-sm shadow-lg backdrop:bg-black/40"
      >
        <form method="dialog" className="flex flex-col gap-3">
          <h2 id={baslikId} className="text-base font-semibold">
            Ret: {props.ad}
          </h2>
          <p>{RET_ONAY_METNI}</p>
          <div className="flex justify-end gap-2">
            <button value="vazgec" className="dugme" autoFocus>
              Vazgeç
            </button>
            <button value="onay" className="dugme-tehlike" onClick={props.onOnay}>
              Ret ver
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
