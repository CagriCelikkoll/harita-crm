"use client";
// Ayarlar'ın sol menüsü: gruplanmış bölümler; etkin bölüm adresten bulunur. Kanallarda bağlıysa yeşil nokta,
// değilse gri halka (yanında ekran okuyucu için "bağlı" / "bağlı değil").
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AyarBolumuTanimi } from "@/lib/ayar-bolumleri";

export function AyarMenusu(props: {
  gruplar: { ad: string; bolumler: AyarBolumuTanimi[] }[];
  kanalBagli: Record<NonNullable<AyarBolumuTanimi["kanal"]>, boolean>;
}) {
  const yol = usePathname();
  return (
    <nav aria-label="Ayar bölümleri" className="flex w-full flex-col gap-6 lg:w-[240px] lg:shrink-0">
      {props.gruplar.map((g) => (
        <div key={g.ad} className="flex flex-col gap-0.5">
          <span className="px-3 pb-1.5 text-xs font-semibold tracking-[0.06em] text-soluk uppercase">{g.ad}</span>
          {g.bolumler.map((b) => {
            const href = `/ayarlar/${b.yol}`;
            const aktif = yol === href || yol.startsWith(`${href}/`);
            const bagli = b.kanal ? props.kanalBagli[b.kanal] : null;
            return (
              <Link
                key={b.yol}
                href={href}
                aria-current={aktif ? "page" : undefined}
                className={`flex h-10 items-center justify-between gap-2 rounded-lg px-3 text-sm ${
                  aktif ? "bg-ana-acik font-semibold text-ana-koyu" : "font-medium text-metin-ikincil hover:bg-white"
                }`}
              >
                <span>{b.ad}</span>
                {bagli !== null && (
                  <span className="flex items-center">
                    <span
                      aria-hidden="true"
                      className={`size-2 rounded-full ${bagli ? "bg-[#2e9e6b]" : "border-2 border-pasif"}`}
                    />
                    <span className="sr-only">{bagli ? "bağlı" : "bağlı değil"}</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
