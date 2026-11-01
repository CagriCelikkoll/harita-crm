"use client";
// Ana menü (docs/tasarim/): 232 px koyu sütun; logo, simgeli 44 px bağlantılar, altta "Bu ayki kullanım" göstergesi
// ve kullanıcı kartı. Telefon genişliğinde üst çubuk + açılır menü.
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { aktifAlanSec, cikisYap } from "@/app/eylemler/oturum";
import { Simge, type SimgeAdi } from "@/components/arayuz/simge";
import { KullanimGostergesi } from "@/components/kullanim-gostergesi";
import { basHarfler, type KullanimOzeti } from "@/lib/arayuz";
import { googleOnbellekleriniTemizle } from "@/lib/google-onbellegi";

// "Kampanyalar" şimdilik /iletisim'e gider; rota Kampanyalar grubunda /kampanyalar olur.
const BAGLANTILAR: { href: string; ad: string; simge: SimgeAdi }[] = [
  { href: "/panel", ad: "Panel", simge: "panel" },
  { href: "/tarama", ad: "Bölge tara", simge: "tarama" },
  { href: "/kayitlar", ad: "Kayıtlar", simge: "kayitlar" },
  { href: "/iletisim", ad: "Kampanyalar", simge: "kampanyalar" },
  { href: "/ayarlar", ad: "Ayarlar", simge: "ayarlar" },
];

type Alan = { tenantId: string; ad: string };

export function Menu(props: {
  kullaniciAdi: string;
  kullaniciEposta: string;
  rolAdi: string;
  aktifAlan: Alan;
  alanlar: Alan[];
  kullanim: KullanimOzeti;
}) {
  const yol = usePathname();
  const [acik, setAcik] = useState(false);

  return (
    <aside className="bg-menu text-[#e8ece9] md:sticky md:top-0 md:flex md:h-screen md:w-58 md:shrink-0 md:flex-col md:gap-7 md:px-4 md:py-6">
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-2 md:py-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-ana text-white">
            <Simge ad="konum" />
          </span>
          <span className="truncate text-base font-bold">Harita CRM</span>
        </div>
        <button
          type="button"
          className="min-h-10 rounded-lg px-3 text-sm text-menu-metin ring-1 ring-white/20 md:hidden"
          aria-expanded={acik}
          aria-controls="ana-menu"
          onClick={() => setAcik((a) => !a)}
        >
          {acik ? "Kapat" : "Menü"}
        </button>
      </div>

      <div id="ana-menu" className={`${acik ? "flex" : "hidden"} flex-1 flex-col gap-7 px-4 pb-6 md:flex md:p-0`}>
        <nav aria-label="Ana menü" className="flex flex-col gap-1">
          {BAGLANTILAR.map((b) => {
            const aktif = yol === b.href || yol.startsWith(`${b.href}/`);
            return (
              <Link
                key={b.href}
                href={b.href}
                onClick={() => setAcik(false)}
                aria-current={aktif ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm ${
                  aktif ? "bg-ana font-semibold text-white" : "text-menu-metin hover:bg-menu-acik hover:text-white"
                }`}
              >
                <Simge ad={b.simge} />
                {b.ad}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-4 md:px-2">
          <KullanimGostergesi ilk={props.kullanim} />
          {props.alanlar.length > 1 && (
            <form key={props.aktifAlan.tenantId} action={aktifAlanSec} onSubmit={googleOnbellekleriniTemizle}>
              <label className="flex flex-col gap-1 text-xs text-menu-soluk">
                Çalışma alanı
                <select
                  name="tenantId"
                  defaultValue={props.aktifAlan.tenantId}
                  className="min-h-10 rounded-lg bg-menu-acik px-2.5 text-sm text-white"
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                >
                  {props.alanlar.map((a) => (
                    <option key={a.tenantId} value={a.tenantId}>
                      {a.ad}
                    </option>
                  ))}
                </select>
              </label>
            </form>
          )}
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-menu-cizgi text-[13px] font-semibold"
            >
              {basHarfler(props.kullaniciAdi)}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-semibold" title={props.kullaniciEposta}>
                {props.kullaniciAdi}
              </span>
              <span className="truncate text-xs text-menu-soluk">
                {props.rolAdi} · {props.aktifAlan.ad}
              </span>
            </div>
          </div>
          {/* Çıkışta Google bilgilerinin bellek önbelleği silinir (lib/google-onbellegi.ts). */}
          <form action={cikisYap} onSubmit={googleOnbellekleriniTemizle}>
            <button type="submit" className="text-xs text-menu-metin underline hover:text-white">
              Çıkış yap
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
