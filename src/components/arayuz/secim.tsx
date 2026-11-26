// Seçim kutusu (select): "normal" form alanıyla aynı görünüm (girdi); "kompakt" liste altbilgisindeki küçük seçimler
// (Sırala, Sayfa başına). Durumlar ortak: üzerine gelme kenarı, odak halkası, devre dışı; telefonda 44 px yükseklik.
import type { SelectHTMLAttributes } from "react";

export function Secim({ boyut = "normal", className, ...secim }: SelectHTMLAttributes<HTMLSelectElement> & { boyut?: "normal" | "kompakt" }) {
  const sinif =
    boyut === "kompakt"
      ? "min-h-8 cursor-pointer rounded-md border border-kenar-alan bg-white px-2 py-0.5 text-ufak text-metin focus:border-odak focus:ring-2 focus:ring-odak/25 focus:outline-none"
      : "girdi cursor-pointer";
  return <select className={`${sinif}${className ? ` ${className}` : ""}`} {...secim} />;
}
