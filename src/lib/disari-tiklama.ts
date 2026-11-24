// Açılır menü / panellerin ortak kapanma davranışı: dışarı tıklayınca (pointerdown, yakalama aşamasında) ve Esc ile.
// Menüyü açan düğme de "içeride" sayılmalıdır (yoksa pointerdown kapatır, ardından gelen tıklama yeniden açar).
// Esc başka bir öğe tarafından zaten işlendiyse (preventDefault) yok sayılır; işlenirse olay durdurulur, böylece aynı
// Esc arkadaki paneli (ör. dar ekrandaki ayrıntı çekmecesini) ayrıca kapatmaz.
// Modal <dialog> pencereleri için ayrıca: arka plana (pencerenin dışına) tıklayınca kapanma (pencereDisinaTiklaninca).
import { useEffect, useRef, type RefObject } from "react";

export type KapanmaNedeni = "disari" | "esc";

type OlayOzeti = { type: string; key?: string; target: EventTarget | null; defaultPrevented?: boolean };

/** Olay menüyü kapatmalı mı? Saf işlev (testte DOM gerekmez). */
export function kapanmaNedeni(olay: OlayOzeti, icindeMi: (hedef: EventTarget | null) => boolean): KapanmaNedeni | null {
  if (olay.type === "keydown") return olay.key === "Escape" && !olay.defaultPrevented ? "esc" : null;
  if (olay.type === "pointerdown") return icindeMi(olay.target) ? null : "disari";
  return null;
}

/** Belgeye dinleyicileri ekler; kaldırma işlevini döndürür. */
export function disariTiklamaDinle(
  belge: EventTarget,
  icindeMi: (hedef: EventTarget | null) => boolean,
  kapat: (neden: KapanmaNedeni) => void,
): () => void {
  const dinle = (e: Event) => {
    const neden = kapanmaNedeni({ type: e.type, key: (e as KeyboardEvent).key, target: e.target, defaultPrevented: e.defaultPrevented }, icindeMi);
    if (!neden) return;
    if (neden === "esc") {
      e.preventDefault();
      e.stopPropagation();
    }
    kapat(neden);
  };
  belge.addEventListener("pointerdown", dinle, { capture: true });
  belge.addEventListener("keydown", dinle);
  return () => {
    belge.removeEventListener("pointerdown", dinle, { capture: true });
    belge.removeEventListener("keydown", dinle);
  };
}

/**
 * `acik` iken dışarı tıklama ve Esc `kapat`ı çağırır. `icerik`: içeride sayılan öğeler (panel ve onu açan düğme).
 */
export function useDisariTiklama(acik: boolean, icerik: RefObject<HTMLElement | null>[], kapat: (neden: KapanmaNedeni) => void) {
  const son = useRef({ icerik, kapat });
  useEffect(() => {
    son.current = { icerik, kapat };
  });
  useEffect(() => {
    if (!acik) return;
    return disariTiklamaDinle(
      document,
      (hedef) => hedef instanceof Node && son.current.icerik.some((r) => r.current?.contains(hedef)),
      (neden) => son.current.kapat(neden),
    );
  }, [acik]);
}

/** Nokta dikdörtgenin dışında mı (modal pencerenin arka planına tıklama). */
export const noktaDisindaMi = (r: { left: number; right: number; top: number; bottom: number }, x: number, y: number) =>
  x < r.left || x > r.right || y < r.top || y > r.bottom;

/**
 * Modal <dialog> onClick'i: arka plana tıklanınca pencereyi kapatır (Esc tarayıcıda zaten kapatır). Pencerenin kendi
 * dolgusuna tıklama (hedef yine <dialog>) kapatmaz; klavyeyle tetiklenen tıklama (koordinat 0) da kapatmaz.
 */
export function pencereDisinaTiklaninca(e: { target: EventTarget; currentTarget: HTMLDialogElement; clientX: number; clientY: number; detail: number }) {
  if (e.target !== e.currentTarget || e.detail === 0) return;
  if (noktaDisindaMi(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)) e.currentTarget.close();
}
