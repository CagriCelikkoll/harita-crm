// Düğme: ortak türler ve boyutlar (globals.css dugme* sınıfları). Durumlar sınıflarda: üzerine gelme, basılı, devre dışı,
// odak (ortak halka). `yukleniyor`: düğme devre dışı + aria-busy, metnin önünde döner gösterge; metin korunur
// (düğmenin genişliği zıplamaz, ne yapıldığı okunur).
import type { ButtonHTMLAttributes } from "react";
import { DonerGosterge } from "./doner-gosterge";

export type DugmeTuru = "ana" | "ikincil" | "tehlike" | "metin" | "ikon";
export type DugmeBoyutu = "normal" | "kucuk";

const TUR_SINIFI: Record<DugmeTuru, string> = {
  ana: "dugme-ana",
  ikincil: "dugme",
  tehlike: "dugme-tehlike",
  metin: "dugme-metin",
  ikon: "dugme-ikon",
};

/** Sınıf adı (bağlantıları düğme gibi göstermek için de: <Link className={dugmeSinifi("ana")}>). */
export const dugmeSinifi = (tur: DugmeTuru = "ikincil", boyut: DugmeBoyutu = "normal") =>
  `${TUR_SINIFI[tur]}${boyut === "kucuk" && tur !== "metin" && tur !== "ikon" ? " dugme-kucuk" : ""}`;

export function Dugme({
  tur = "ikincil",
  boyut = "normal",
  yukleniyor = false,
  className,
  disabled,
  type = "button",
  children,
  ...dugme
}: ButtonHTMLAttributes<HTMLButtonElement> & { tur?: DugmeTuru; boyut?: DugmeBoyutu; yukleniyor?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || yukleniyor}
      aria-busy={yukleniyor || undefined}
      className={`${dugmeSinifi(tur, boyut)}${className ? ` ${className}` : ""}`}
      {...dugme}
    >
      {yukleniyor && <DonerGosterge boyut={tur === "metin" ? 14 : 16} />}
      {children}
    </button>
  );
}
