"use client";
// Ana menüdeki "Bu ayki kullanım %N" göstergesi. Yalnızca yüzde gösterilir (birim ya da sayı yok; ayrıntı
// Ayarlar > Kullanım'da). Menü layout'ta olduğu için istemci gezinmesinde yeniden çizilmez: rota değişince ve
// kullanım değiştiren bir işlemden sonra (kullanimDegisti()) GET /api/kullanim ile yenilenir.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { KullanimOzeti } from "@/lib/arayuz";

const OLAY = "harita-kullanim";

/** Places kullanan bir işlemden sonra (Göster, detay, tarama) menüdeki göstergeyi yeniler. */
export function kullanimDegisti() {
  window.dispatchEvent(new Event(OLAY));
}

const RENK = { normal: "bg-menu-vurgu", uyari: "bg-amber-400", doldu: "bg-red-400" } as const;

export function KullanimGostergesi({ ilk }: { ilk: KullanimOzeti }) {
  const yol = usePathname();
  const [ozet, setOzet] = useState(ilk);

  useEffect(() => {
    let iptal = false;
    const yenile = async () => {
      try {
        const yanit = await fetch("/api/kullanim", { cache: "no-store" });
        if (yanit.ok && !iptal) setOzet((await yanit.json()) as KullanimOzeti);
      } catch {
        // Ağ hatası: son bilinen değer kalır.
      }
    };
    void yenile();
    window.addEventListener(OLAY, yenile);
    return () => {
      iptal = true;
      window.removeEventListener(OLAY, yenile);
    };
  }, [yol]);

  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-menu-acik p-3.5">
      <div className="flex justify-between text-[13px]">
        <span className="text-menu-metin">Bu ayki kullanım</span>
        <span className="font-semibold tabular-nums">%{ozet.yuzde}</span>
      </div>
      <div
        role="meter"
        aria-label="Bu ayki kullanım"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ozet.yuzde}
        aria-valuetext={`%${ozet.yuzde}${ozet.seviye === "doldu" ? ", doldu" : ozet.seviye === "uyari" ? ", sınıra yaklaşıldı" : ""}`}
        className="h-1.5 overflow-hidden rounded-full bg-menu-cizgi"
      >
        <div className={`h-1.5 rounded-full ${RENK[ozet.seviye]}`} style={{ width: `${ozet.yuzde}%` }} />
      </div>
      {ozet.seviye === "doldu" && <p className="text-xs text-red-300">Bu ayki kullanımınız doldu.</p>}
    </div>
  );
}
