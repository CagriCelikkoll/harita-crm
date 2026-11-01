"use client";
// Seçim parçaları:
// - SekmeGrubu: segment düğmeleri (gri zemin, seçili beyaz). `href` verilirse bağlantıdır (durum URL'de), yoksa düğme.
// - Sekmeler: alt çizgili sekmeler (role="tab"); içerik `sekmePaneliId` / `sekmeId` ile bağlanır.
// - SecimCipi: aria-pressed ile seçilebilir yuvarlak çip (durum, kategori).
// Klavye: ok tuşları, Home / End (sekmeKlavye); yalnızca seçili sekme Tab sırasındadır.
import { useRef } from "react";
import Link from "next/link";
import { sekmeKlavye } from "@/lib/arayuz";
import { sayiYaz } from "@/lib/bicim";

type Secenek<T extends string> = { deger: T; ad: string; sayi?: number; href?: string };

export function SekmeGrubu<T extends string>(props: { etiket: string; secenekler: Secenek<T>[]; secili: T; onSec?: (d: T) => void }) {
  return (
    <div role="group" aria-label={props.etiket} className="flex flex-wrap gap-0.5 rounded-[10px] bg-segment p-1">
      {props.secenekler.map((s) => {
        const secili = s.deger === props.secili;
        const sinif = `inline-flex h-9 items-center gap-1.5 rounded-[7px] px-3.5 text-sm ${
          secili ? "bg-white font-semibold text-metin shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-metin-ikincil hover:text-metin"
        }`;
        const icerik = (
          <>
            {s.ad}
            {s.sayi !== undefined && <span className="tabular-nums opacity-70">{sayiYaz(s.sayi)}</span>}
          </>
        );
        return s.href ? (
          <Link key={s.deger} href={s.href} aria-current={secili ? "page" : undefined} className={sinif}>
            {icerik}
          </Link>
        ) : (
          <button key={s.deger} type="button" aria-pressed={secili} className={sinif} onClick={() => props.onSec?.(s.deger)}>
            {icerik}
          </button>
        );
      })}
    </div>
  );
}

export const sekmeId = (onEk: string, deger: string) => `${onEk}-${deger}-sekme`;
export const sekmePaneliId = (onEk: string, deger: string) => `${onEk}-${deger}-panel`;

export function Sekmeler<T extends string>(props: {
  etiket: string;
  onEk: string;
  sekmeler: { deger: T; ad: string }[];
  secili: T;
  onSec: (d: T) => void;
}) {
  const dugmeler = useRef<(HTMLButtonElement | null)[]>([]);
  const simdiki = props.sekmeler.findIndex((s) => s.deger === props.secili);
  return (
    <div role="tablist" aria-label={props.etiket} className="flex gap-1 border-b border-cizgi">
      {props.sekmeler.map((s, i) => {
        const secili = i === simdiki;
        return (
          <button
            key={s.deger}
            ref={(el) => {
              dugmeler.current[i] = el;
            }}
            type="button"
            role="tab"
            id={sekmeId(props.onEk, s.deger)}
            aria-selected={secili}
            aria-controls={sekmePaneliId(props.onEk, s.deger)}
            tabIndex={secili ? 0 : -1}
            onClick={() => props.onSec(s.deger)}
            onKeyDown={(e) => {
              const yeni = sekmeKlavye(i, e.key, props.sekmeler.length);
              if (yeni === null) return;
              e.preventDefault();
              props.onSec(props.sekmeler[yeni].deger);
              dugmeler.current[yeni]?.focus();
            }}
            className={`-mb-px h-11 border-b-2 px-3 text-sm ${
              secili ? "border-ana font-semibold text-ana-koyu" : "border-transparent text-soluk hover:text-metin"
            }`}
          >
            {s.ad}
          </button>
        );
      })}
    </div>
  );
}

export function SecimCipi(props: { secili: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={props.secili}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`h-[38px] rounded-full border px-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
        props.secili ? "border-ana bg-ana font-semibold text-white" : "border-kenar-alan bg-white text-metin hover:bg-zemin"
      }`}
    >
      {props.children}
    </button>
  );
}
