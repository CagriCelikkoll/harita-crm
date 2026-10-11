"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { aktifAlanSec, cikisYap } from "@/app/eylemler/oturum";

const BAGLANTILAR = [
  { href: "/panel", ad: "Panel" },
  { href: "/tarama", ad: "Bölge taraması" },
  { href: "/kayitlar", ad: "Kayıtlar" },
  { href: "/iletisim", ad: "İletişim" },
  { href: "/ayarlar", ad: "Ayarlar" },
] as const;

type Alan = { tenantId: string; ad: string };

export function Menu(props: { kullaniciAdi: string; kullaniciEposta: string; aktifAlan: Alan; alanlar: Alan[] }) {
  const yol = usePathname();
  const [acik, setAcik] = useState(false);

  return (
    <aside className="bg-menu text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
      {/* Telefon genişliğinde: üst çubuk + açılır menü */}
      <div className="flex items-center justify-between px-4 py-3 md:px-5 md:pt-6 md:pb-4">
        <div className="min-w-0">
          <p className="font-semibold tracking-tight">Harita CRM</p>
          <p className="truncate text-xs text-white/60">{props.aktifAlan.ad}</p>
        </div>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm text-white/80 ring-1 ring-white/20 md:hidden"
          aria-expanded={acik}
          aria-controls="ana-menu"
          onClick={() => setAcik((a) => !a)}
        >
          {acik ? "Kapat" : "Menü"}
        </button>
      </div>

      <div id="ana-menu" className={`${acik ? "flex" : "hidden"} flex-1 flex-col md:flex`}>
        <nav aria-label="Ana menü" className="flex flex-col gap-0.5 px-2">
          {BAGLANTILAR.map((b) => {
            const aktif = yol === b.href || yol.startsWith(`${b.href}/`);
            return (
              <Link
                key={b.href}
                href={b.href}
                onClick={() => setAcik(false)}
                aria-current={aktif ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm ${
                  aktif ? "bg-ana font-medium text-white" : "text-white/75 hover:bg-menu-acik hover:text-white"
                }`}
              >
                {b.ad}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/10 px-4 py-4 text-sm">
          {props.alanlar.length > 1 && (
            <form key={props.aktifAlan.tenantId} action={aktifAlanSec} className="mb-3 flex flex-col gap-1">
              <label className="flex flex-col gap-1 text-xs text-white/60">
                Çalışma alanı
                <select
                  name="tenantId"
                  defaultValue={props.aktifAlan.tenantId}
                  className="rounded-md bg-menu-acik px-2 py-1.5 text-sm text-white"
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
          <p className="truncate font-medium">{props.kullaniciAdi}</p>
          <p className="truncate text-xs text-white/60">{props.kullaniciEposta}</p>
          <form action={cikisYap} className="mt-2">
            <button type="submit" className="text-xs text-white/70 underline hover:text-white">
              Çıkış yap
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
