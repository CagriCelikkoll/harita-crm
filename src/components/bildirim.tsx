"use client";
// Görünür geri bildirim:
// - bildir(metin): ekranın sağ üstünde birkaç saniye görünen onay bildirimi (role="status", ekran okuyucuya duyurulur).
//   Sayfa değişse de (istemci gezinmesi) görünür kalır; (app) düzenindeki <BildirimAlani /> gösterir.
// - <SonucMesaji />: formun yanındaki sonuç / hata metni. Ekran dışında kalıyorsa görünür alana kaydırılır;
//   başarılıysa ayrıca bildirim olarak da gösterilir.
import { useEffect, useRef, useState } from "react";

const OLAY = "harita-bildirim";
type Bildirim = { id: number; metin: string; tur: "tamam" | "hata" };

export function bildir(metin: string, tur: Bildirim["tur"] = "tamam") {
  window.dispatchEvent(new CustomEvent<Omit<Bildirim, "id">>(OLAY, { detail: { metin, tur } }));
}

export function BildirimAlani() {
  const [liste, setListe] = useState<Bildirim[]>([]);
  useEffect(() => {
    let sayac = 0;
    const dinle = (e: Event) => {
      const b = { ...(e as CustomEvent<Omit<Bildirim, "id">>).detail, id: ++sayac };
      setListe((l) => [...l.slice(-2), b]);
      setTimeout(() => setListe((l) => l.filter((x) => x.id !== b.id)), 4000);
    };
    window.addEventListener(OLAY, dinle);
    return () => window.removeEventListener(OLAY, dinle);
  }, []);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed top-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {liste.map((b) => (
        <p
          key={b.id}
          className={`pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-md ${
            b.tur === "hata" ? "border-tehlike/40 bg-red-50 text-tehlike" : "border-ana/30 bg-white text-ana"
          }`}
        >
          {b.tur === "tamam" ? "✓ " : ""}
          {b.metin}
        </p>
      ))}
    </div>
  );
}

/** Formun yanındaki sonuç metni: görünür alana kaydırılır; başarılıysa bildirim olarak da gösterilir. */
export function SonucMesaji(props: { tur: "tamam" | "hata"; metin: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { tur, metin } = props;
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (tur === "tamam") bildir(metin);
  }, [tur, metin]);
  return (
    <p ref={ref} role={tur === "hata" ? "alert" : "status"} className={`text-sm ${tur === "hata" ? "text-tehlike" : "text-ana"} ${props.className ?? ""}`}>
      {metin}
    </p>
  );
}
