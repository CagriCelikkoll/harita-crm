"use client";
import { useState } from "react";
import Link from "next/link";
import { tarihYaz } from "@/lib/bicim";
import { ILETI_IZNI_ADLARI, KAYIT_DURUM_ADLARI, type IletiIzni, type KayitDurumu, KAYIT_KAYNAK_ADLARI, type KayitKaynagi } from "@/lib/sabitler";
import type { WhatsappIzni } from "@/lib/mesajlasma";

export type TabloSatiri = {
  id: string;
  durum: KayitDurumu;
  iletiIzni: IletiIzni;
  etiketler: string[];
  yetkiliAdi: string | null;
  guncellemeTarihi: string;
  kaynak: KayitKaynagi;
  /** WhatsApp (Cloud API) izni ve reklam kaynaklı ücretsiz pencere açık mı. */
  whatsappIzni: WhatsappIzni;
  waPencereAcik: boolean;
  // Places içeriği (yalnızca ad ve adres, Place Details Pro): canlı çekildi, saklanmıyor.
  canli: { ad: string; adres: string | null } | { hata: string };
};

export function KayitTablosu(props: {
  satirlar: TabloSatiri[];
  seciliId: string | null;
  seciliBaglantisi: (id: string) => string;
  onSec: (id: string) => void;
}) {
  const [suzgec, setSuzgec] = useState("");
  const kucuk = suzgec.trim().toLocaleLowerCase("tr");
  const gorunen = kucuk
    ? props.satirlar.filter((s) => "ad" in s.canli && s.canli.ad.toLocaleLowerCase("tr").includes(kucuk))
    : props.satirlar;

  if (props.satirlar.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-soluk">
        Kayıt yok. <Link href="/tarama" className="font-medium text-ana">Bölge taraması</Link> ile işletme ekleyin.
      </p>
    );
  }

  return (
    <>
      <label className="etiket mb-3 max-w-xs">
        Bu sayfada işletme adına göre süz
        <input value={suzgec} onChange={(e) => setSuzgec(e.target.value)} className="girdi" placeholder="ör. emlak" />
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-kenar text-xs text-soluk">
            <tr>
              <th className="py-2 pr-3 font-medium">İşletme</th>
              <th className="py-2 pr-3 font-medium">Adres</th>
              <th className="py-2 pr-3 font-medium">Durum</th>
              <th className="py-2 pr-3 font-medium">İleti izni</th>
              <th className="py-2 pr-3 font-medium">Etiketler</th>
              <th className="py-2 font-medium">Güncelleme</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kenar">
            {gorunen.map((s) => (
              <tr key={s.id} className={s.id === props.seciliId ? "bg-ana-acik/60" : "hover:bg-zemin"}>
                <td className="py-2 pr-3">
                  <a
                    href={props.seciliBaglantisi(s.id)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // yeni sekme vb.
                      e.preventDefault();
                      props.onSec(s.id);
                    }}
                    aria-current={s.id === props.seciliId ? "true" : undefined}
                    className="font-medium text-ana hover:underline"
                  >
                    {"ad" in s.canli ? s.canli.ad : <span className="text-soluk italic">{s.canli.hata}</span>}
                  </a>
                  {s.yetkiliAdi && <p className="text-xs text-soluk">{s.yetkiliAdi}</p>}
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {s.kaynak !== "google" && <span className="rozet">{KAYIT_KAYNAK_ADLARI[s.kaynak]}</span>}
                    {s.whatsappIzni === "var" && <span className="rozet">WhatsApp izni</span>}
                    {s.waPencereAcik && (
                      <span className="rozet bg-green-100 text-green-800" title="Reklamdan yazan kişi: ücretsiz giriş penceresi açık">
                        WhatsApp penceresi açık
                      </span>
                    )}
                  </div>
                </td>
                <td className="max-w-72 py-2 pr-3 text-soluk">{"ad" in s.canli ? (s.canli.adres ?? "—") : "—"}</td>
                <td className="py-2 pr-3">
                  <span className="rozet">{KAYIT_DURUM_ADLARI[s.durum]}</span>
                </td>
                <td className={`py-2 pr-3 ${s.iletiIzni === "ret" ? "font-medium text-tehlike" : ""}`}>
                  {ILETI_IZNI_ADLARI[s.iletiIzni]}
                </td>
                <td className="py-2 pr-3 text-xs">{s.etiketler.join(", ")}</td>
                <td className="py-2 text-xs whitespace-nowrap text-soluk">{tarihYaz(s.guncellemeTarihi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {gorunen.length === 0 && <p className="py-4 text-center text-sm text-soluk">Bu sayfada eşleşen işletme yok.</p>}
      </div>
    </>
  );
}
