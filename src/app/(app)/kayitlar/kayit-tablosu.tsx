"use client";
// Kayıt tablosu (docs/tasarim/Kayitlar.dc.html): İşletme, Durum, İzin, Son işlem, Etiket. Satırda kullanıcının
// verisi görünür; adı girilmemiş Google kayıtlarının adı ve adresi Google Haritalar'dan anlık gelir ("Google"
// etiketiyle; otomatik ya da "Göster" ile) ve yalnızca bellekte tutulur (components/google-bilgisi.tsx).
import Link from "next/link";
import { DurumRozeti, GoogleEtiketi, type RozetTonu } from "@/components/arayuz/rozet";
import { Simge } from "@/components/arayuz/simge";
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

/** Kayıt durumlarının rozet renkleri (taslaktaki eşleme; metin her zaman yazılı). */
export const DURUM_TONU: Record<KayitDurumu, RozetTonu> = {
  yeni: "mavi",
  iletisimde: "uyari",
  gorusme: "mor",
  kazanildi: "ana",
  ilgilenmiyor: "notr",
};
export const IZIN_TONU: Record<IletiIzni, RozetTonu> = { onayli: "ana", bekliyor: "uyari", ret: "tehlike" };

/** Satırda gösterilen ad: yalnızca kullanıcının verisi. */
export const satirAdi = (s: Pick<TabloSatiri, "isletmeAdi" | "yetkiliAdi" | "kaynak">) =>
  s.isletmeAdi ?? (s.kaynak === "google" ? GOOGLE_ADSIZ : (s.yetkiliAdi ?? "(adsız kişi)"));

type GoogleDurumu = { bilgi: ReadonlyMap<string, ListeBilgisi>; yukleniyor: ReadonlySet<string>; goster: (idler: string[]) => void };

/** İşletme hücresi: kendi adı; adı girilmemiş Google kaydında Google'daki ad + "Google" etiketi, adres ikinci satırda. */
function IsletmeHucresi({ s, google }: { s: TabloSatiri; google: GoogleDurumu }) {
  const g = s.kaynak === "google" && !s.isletmeAdi ? google.bilgi.get(s.id) : undefined;
  const yukleniyor = google.yukleniyor.has(s.id);
  const adGoogle = g && !("hata" in g) ? g : null;
  const ikinciSatir =
    adGoogle?.adres ?? (s.yetkiliAdi && s.isletmeAdi ? s.yetkiliAdi : s.kaynak !== "google" ? KAYIT_KAYNAK_ADLARI[s.kaynak] : null);
  return (
    <>
      <span className="flex flex-wrap items-center gap-2">
        {adGoogle ? (
          <>
            <span className="font-semibold">{adGoogle.ad}</span>
            <GoogleEtiketi />
          </>
        ) : (
          <span className={s.isletmeAdi || s.kaynak !== "google" ? "font-semibold" : "text-soluk italic"}>{satirAdi(s)}</span>
        )}
      </span>
      {yukleniyor ? (
        <span className="text-[13px] text-soluk">Yükleniyor…</span>
      ) : g && "hata" in g ? (
        <span className="text-[13px] text-soluk italic">{g.hata}</span>
      ) : (
        ikinciSatir && <span className="text-[13px] text-soluk">{ikinciSatir}</span>
      )}
    </>
  );
}

export function KayitTablosu(props: {
  satirlar: TabloSatiri[];
  seciliId: string | null;
  seciliBaglantisi: (id: string) => string;
  onSec: (id: string) => void;
  google: GoogleDurumu & { hata: string | null };
}) {
  const { bilgi, yukleniyor, goster } = props.google;
  const gosterilmemis = props.satirlar
    .filter((s) => s.kaynak === "google" && !s.isletmeAdi && !bilgi.has(s.id) && !yukleniyor.has(s.id))
    .map((s) => s.id);

  if (props.satirlar.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-soluk">
        Bu görünümde kayıt yok. <Link href="/tarama" className="font-medium text-ana">Bölge tara</Link> ile işletme ekleyin.
      </p>
    );
  }

  return (
    <>
      {(gosterilmemis.length > 0 || props.google.hata) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cizgi px-5 py-3">
          {props.google.hata ? (
            <p role="alert" className="text-sm text-tehlike">
              {props.google.hata}
            </p>
          ) : (
            <span className="text-[13px] text-soluk">Bu sayfada adı gösterilmeyen {gosterilmemis.length} Google kaydı var.</span>
          )}
          {gosterilmemis.length > 0 && (
            <button type="button" className="dugme dugme-kucuk" onClick={() => goster(gosterilmemis)}>
              Bu sayfadaki Google bilgilerini göster
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead className="text-[13px] text-soluk">
            <tr>
              <th className="border-b border-cizgi px-5 py-3.5 font-semibold">İşletme</th>
              <th className="border-b border-cizgi px-3 py-3.5 font-semibold">Durum</th>
              <th className="border-b border-cizgi px-3 py-3.5 font-semibold">İzin</th>
              <th className="border-b border-cizgi px-3 py-3.5 font-semibold">Son işlem</th>
              <th className="border-b border-cizgi py-3.5 pr-5 pl-3 font-semibold">Etiket</th>
            </tr>
          </thead>
          <tbody>
            {props.satirlar.map((s) => {
              const secili = s.id === props.seciliId;
              const google = s.kaynak === "google" && !s.isletmeAdi;
              const gosterilebilir = google && !bilgi.has(s.id) && !yukleniyor.has(s.id);
              return (
                <tr key={s.id} className={`border-b border-[#f0f2ef] ${secili ? "bg-[#f1f7f5]" : "hover:bg-kart-alt"}`}>
                  <td className="px-5 py-3">
                    <a
                      href={props.seciliBaglantisi(s.id)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // yeni sekme vb.
                        e.preventDefault();
                        props.onSec(s.id);
                      }}
                      aria-current={secili ? "true" : undefined}
                      className="flex flex-col gap-0.5 py-1 text-metin hover:underline"
                    >
                      <IsletmeHucresi s={s} google={props.google} />
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {gosterilebilir && (
                        <button
                          type="button"
                          className="text-xs font-medium text-ana underline-offset-2 hover:underline"
                          onClick={() => goster([s.id])}
                          title="Google Haritalar'dan anlık gösterilir; saklanmaz"
                        >
                          Göster
                        </button>
                      )}
                      {s.inceleme === "incelenmedi" && <DurumRozeti ton="notr">{INCELEME_ADLARI[s.inceleme]}</DurumRozeti>}
                      {s.engelli && s.iletiIzni !== "ret" && (
                        <DurumRozeti ton="tehlike" title="Adreslerinden biri engel listesinde; hiçbir kanaldan gönderilmez">
                          Engelli
                        </DurumRozeti>
                      )}
                      {s.waPencereAcik && (
                        <DurumRozeti ton="ana" title="Reklamdan yazan kişi: ücretsiz giriş penceresi açık">
                          WhatsApp penceresi açık
                        </DurumRozeti>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <DurumRozeti ton={DURUM_TONU[s.durum]}>{KAYIT_DURUM_ADLARI[s.durum]}</DurumRozeti>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <DurumRozeti ton={IZIN_TONU[s.iletiIzni]}>{ILETI_IZNI_ADLARI[s.iletiIzni]}</DurumRozeti>
                      {s.whatsappIzni === "var" && (
                        <span title="WhatsApp izni var" className="inline-flex size-[22px] items-center justify-center rounded-full bg-ana-acik text-ana">
                          <Simge ad="whatsapp" boyut={12} kalinlik={2.5} />
                          <span className="sr-only">WhatsApp izni var</span>
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-metin-ikincil">{tarihYaz(s.guncellemeTarihi)}</td>
                  <td className="py-3 pr-5 pl-3 text-metin-ikincil">{s.etiketler.length ? s.etiketler.join(", ") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
