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

/**
 * Paneli kapatan dışarı tıklamanın ardından gelen `click` olayını bir kez yutar (alttaki satır / bağlantı / düğme
 * tetiklenmez). Dinleyici kendini kaldırır: ilk click'te, bir sonraki pointerdown'da ya da kısa bir süre sonra
 * (sürükleme gibi click üretmeyen hareketlerde sonraki gerçek tıklamayı yutmasın diye).
 */
export function sonrakiTiklamayiYut(belge: EventTarget, sure = 800): () => void {
  let bitti = false;
  const kaldir = () => {
    bitti = true;
    belge.removeEventListener("click", yut, { capture: true });
    belge.removeEventListener("pointerdown", kaldirSonraki, { capture: true });
    clearTimeout(zamanlayici);
  };
  const yut = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation(); // belgedeki diğer dinleyiciler de (stopPropagation alt öğeleri zaten keser)
    kaldir();
  };
  // Bu pointerdown'un kendisi değil, sonraki pointerdown kaldırır.
  const kaldirSonraki = () => kaldir();
  belge.addEventListener("click", yut, { capture: true });
  setTimeout(() => {
    if (!bitti) belge.addEventListener("pointerdown", kaldirSonraki, { capture: true, once: true });
  }, 0);
  const zamanlayici = setTimeout(kaldir, sure);
  return kaldir;
}

/** Belgeye dinleyicileri ekler; kaldırma işlevini döndürür. `tiklamayiYut`: dışarı tıklama alttaki öğeyi tetiklemez. */
export function disariTiklamaDinle(
  belge: EventTarget,
  icindeMi: (hedef: EventTarget | null) => boolean,
  kapat: (neden: KapanmaNedeni) => void,
  secenek: { tiklamayiYut?: boolean } = {},
): () => void {
  const dinle = (e: Event) => {
    const neden = kapanmaNedeni({ type: e.type, key: (e as KeyboardEvent).key, target: e.target, defaultPrevented: e.defaultPrevented }, icindeMi);
    if (!neden) return;
    if (neden === "esc") {
      e.preventDefault();
      e.stopPropagation();
    } else if (secenek.tiklamayiYut) sonrakiTiklamayiYut(belge);
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
export function useDisariTiklama(
  acik: boolean,
  icerik: RefObject<HTMLElement | null>[],
  kapat: (neden: KapanmaNedeni) => void,
  secenek: { tiklamayiYut?: boolean } = {},
) {
  const son = useRef({ icerik, kapat });
  useEffect(() => {
    son.current = { icerik, kapat };
  });
  const yut = secenek.tiklamayiYut === true;
  useEffect(() => {
    if (!acik) return;
    return disariTiklamaDinle(
      document,
      (hedef) => hedef instanceof Node && son.current.icerik.some((r) => r.current?.contains(hedef)),
      (neden) => son.current.kapat(neden),
      { tiklamayiYut: yut },
    );
  }, [acik, yut]);
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
