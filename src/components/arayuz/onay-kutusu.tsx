"use client";
// Onay kutusu: 18 px görünüm (globals.css), etiket sarmalayıcısı sayesinde telefonda 44×44 px dokunma hedefi
// (etiketin genişletilmiş alanına dokunmak kutuyu işaretler). Yazısız kullanımda erişilebilir ad `etiket` ile verilir.
// `belirsiz`: kısmi seçim (ör. "sayfadakilerin tümünü seç").
import type { InputHTMLAttributes, ReactNode } from "react";

export function OnayKutusu({
  etiket,
  belirsiz,
  children,
  className,
  ...girdi
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  /** Görünür yazı yoksa erişilebilir ad (aria-label) ve ipucu. */
  etiket?: string;
  belirsiz?: boolean;
  children?: ReactNode;
}) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 has-disabled:cursor-not-allowed ${className ?? ""}`}>
      <input
        type="checkbox"
        aria-label={children ? undefined : etiket}
        title={children ? undefined : etiket}
        ref={(el) => {
          if (el) el.indeterminate = Boolean(belirsiz);
        }}
        {...girdi}
      />
      {children}
    </label>
  );
}
