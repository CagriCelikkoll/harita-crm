"use client";
// Kayıt tablosu. Varsayılan olarak YALNIZCA kullanıcının verisini gösterir (kendi girdiği ad, durum, izinler,
// etiketler, son işlem, kaynak); Places'a gitmez. Google kayıtlarının adı ve adresi satır başına ya da sayfa için
// "Göster" ile, maliyet önceden yazılarak istenir ve yalnızca bellekte tutulur (components/google-bilgisi.tsx).
import { useState } from "react";
import Link from "next/link";
import { GoogleBilgisiHucresi, maliyetMetni } from "@/components/google-bilgisi";
import { tarihYaz } from "@/lib/bicim";
import {
  GOOGLE_ADSIZ,
  ILETI_IZNI_ADLARI,
  INCELEME_ADLARI,
  KAYIT_DURUM_ADLARI,
  KAYIT_KAYNAK_ADLARI,
  type IletiIzni,
  type IncelemeDurumu,
  type KayitDurumu,
  type KayitKaynagi,
} from "@/lib/sabitler";
import type { WhatsappIzni } from "@/lib/mesajlasma";
import type { ListeBilgisi } from "@/server/servisler/canli-bilgi";

export type TabloSatiri = {
  id: string;
  durum: KayitDurumu;
  iletiIzni: IletiIzni;
  etiketler: string[];
  /** Kullanıcının girdiği işletme adı (Places adı değil). */
  isletmeAdi: string | null;
  yetkiliAdi: string | null;
  guncellemeTarihi: string;
  kaynak: KayitKaynagi;
  inceleme: IncelemeDurumu;
  /** WhatsApp (Cloud API) izni ve reklam kaynaklı ücretsiz pencere açık mı. */
  whatsappIzni: WhatsappIzni;
  waPencereAcik: boolean;
  /** Kendi adreslerinden biri engel listesinde (ret vermemiş görünse de gönderilmez). */
  engelli: boolean;
};

/** Satırda gösterilen ad: yalnızca kullanıcının verisi. */
export const satirAdi = (s: Pick<TabloSatiri, "isletmeAdi" | "yetkiliAdi" | "kaynak">) =>
  s.isletmeAdi ?? (s.kaynak === "google" ? GOOGLE_ADSIZ : (s.yetkiliAdi ?? "(adsız kişi)"));

export function KayitTablosu(props: {
  satirlar: TabloSatiri[];
  seciliId: string | null;
  seciliBaglantisi: (id: string) => string;
  onSec: (id: string) => void;
  google: { bilgi: ReadonlyMap<string, ListeBilgisi>; yukleniyor: ReadonlySet<string>; hata: string | null; goster: (idler: string[]) => void };
}) {
  const [suzgec, setSuzgec] = useState("");
  const { bilgi, yukleniyor, goster } = props.google;
  const kucuk = suzgec.trim().toLocaleLowerCase("tr");
  const adlar = (s: TabloSatiri) => {
    const g = bilgi.get(s.id);
    return [satirAdi(s), s.yetkiliAdi ?? "", g && "ad" in g ? g.ad : ""].join(" ").toLocaleLowerCase("tr");
  };
  const gorunen = kucuk ? props.satirlar.filter((s) => adlar(s).includes(kucuk)) : props.satirlar;
  const gosterilmemis = props.satirlar.filter((s) => s.kaynak === "google" && !bilgi.has(s.id)).map((s) => s.id);

  if (props.satirlar.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-soluk">
        Kayıt yok. <Link href="/tarama" className="font-medium text-ana">Bölge taraması</Link> ile işletme ekleyin.
      </p>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <label className="etiket max-w-xs">
          Bu sayfada ada göre süz
          <input value={suzgec} onChange={(e) => setSuzgec(e.target.value)} className="girdi" placeholder="ör. emlak" />
          <span className="text-xs font-normal text-soluk">Kendi girdiğiniz adlarda ve gösterilen Google adlarında arar.</span>
        </label>
        {gosterilmemis.length > 0 && (
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              className="dugme"
              disabled={gosterilmemis.some((id) => yukleniyor.has(id))}
              onClick={() => goster(gosterilmemis)}
            >
              Bu sayfadaki Google bilgilerini göster ({maliyetMetni(gosterilmemis.length)})
            </button>
            <span className="text-xs text-soluk">Ad ve adres Google&apos;dan çekilir, saklanmaz; sayfadan ayrılınca silinir.</span>
          </div>
        )}
      </div>
      {props.google.hata && (
        <p role="alert" className="mb-2 text-sm text-tehlike">
          {props.google.hata}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-kenar text-xs text-soluk">
            <tr>
              <th className="py-2 pr-3 font-medium">İşletme</th>
              <th className="py-2 pr-3 font-medium">Google adresi</th>
              <th className="py-2 pr-3 font-medium">Durum</th>
              <th className="py-2 pr-3 font-medium">İleti izni</th>
              <th className="py-2 pr-3 font-medium">Etiketler</th>
              <th className="py-2 font-medium">Son işlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kenar">
            {gorunen.map((s) => {
              const google = s.kaynak === "google";
              const ad = satirAdi(s);
              return (
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
                      className={`font-medium hover:underline ${s.isletmeAdi || !google ? "text-ana" : "text-soluk italic"}`}
                    >
                      {ad}
                    </a>
                    {s.yetkiliAdi && ad !== s.yetkiliAdi && <p className="text-xs text-soluk">{s.yetkiliAdi}</p>}
                    {google && bilgi.has(s.id) && (
                      <p>
                        <GoogleBilgisiHucresi id={s.id} alan="ad" bilgi={bilgi.get(s.id)} yukleniyor={false} onGoster={goster} />
                      </p>
                    )}
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {!google && <span className="rozet">{KAYIT_KAYNAK_ADLARI[s.kaynak]}</span>}
                      {s.inceleme !== "ilgileniyor" && <span className="rozet">{INCELEME_ADLARI[s.inceleme]}</span>}
                      {s.engelli && s.iletiIzni !== "ret" && (
                        <span className="rozet bg-red-100 text-tehlike" title="Adreslerinden biri engel listesinde; hiçbir kanaldan gönderilmez">
                          Engelli
                        </span>
                      )}
                      {s.whatsappIzni === "var" && <span className="rozet">WhatsApp izni</span>}
                      {s.waPencereAcik && (
                        <span className="rozet bg-green-100 text-green-800" title="Reklamdan yazan kişi: ücretsiz giriş penceresi açık">
                          WhatsApp penceresi açık
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="max-w-72 py-2 pr-3 text-soluk">
                    {google ? (
                      <GoogleBilgisiHucresi id={s.id} alan="adres" bilgi={bilgi.get(s.id)} yukleniyor={yukleniyor.has(s.id)} onGoster={goster} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="rozet">{KAYIT_DURUM_ADLARI[s.durum]}</span>
                  </td>
                  <td className={`py-2 pr-3 ${s.iletiIzni === "ret" ? "font-medium text-tehlike" : ""}`}>
                    {ILETI_IZNI_ADLARI[s.iletiIzni]}
                  </td>
                  <td className="py-2 pr-3 text-xs">{s.etiketler.join(", ")}</td>
                  <td className="py-2 text-xs whitespace-nowrap text-soluk">{tarihYaz(s.guncellemeTarihi)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {gorunen.length === 0 && <p className="py-4 text-center text-sm text-soluk">Bu sayfada eşleşen kayıt yok.</p>}
      </div>
    </>
  );
}
