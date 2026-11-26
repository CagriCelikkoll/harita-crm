"use client";
// Kayıt tablosu (docs/tasarim/Kayitlar.dc.html): İşletme, Durum, İzin, Son işlem, Etiket. Satırda YALNIZCA
// kullanıcının kayıtlı verisi görünür: liste Google'dan hiç anlık veri çekmez (kullanım harcamaz). Ad sırası:
// kendi işletme adı, yoksa yetkili adı, yoksa nötr yer tutucu ("Google kaydı · ad girilmemiş"); "Ad (A-Z)"
// sıralaması da aynı anahtarı kullanır (repo/kayitlar.ts gorunenAd). Google ayrıntısı yalnızca bir kaydın ayrıntı
// paneli açılınca getirilir (detay-paneli.tsx).
import Link from "next/link";
import { OnayKutusu } from "@/components/arayuz/onay-kutusu";
import { DURUM_TONU, DurumRozeti, IZIN_TONU } from "@/components/arayuz/rozet";
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


/**
 * Satırda gösterilen ad: yalnızca kullanıcının verisi; işletme adı, yoksa yetkili adı, yoksa yer tutucu. "Ad (A-Z)"
 * sıralamasının anahtarıyla aynıdır (boş/boşluklu ad yok sayılır).
 */
export const satirAdi = (s: Pick<TabloSatiri, "isletmeAdi" | "yetkiliAdi" | "kaynak">) =>
  s.isletmeAdi?.trim() || s.yetkiliAdi?.trim() || (s.kaynak === "google" ? GOOGLE_ADSIZ : "(adsız kişi)");

/** İşletme hücresi: kayıtlı ad; ikinci satırda yetkili (ad işletme adıysa) ya da kaynak. */
function IsletmeHucresi({ s }: { s: TabloSatiri }) {
  const adVar = Boolean(s.isletmeAdi?.trim() || s.yetkiliAdi?.trim());
  const ikinciSatir = s.isletmeAdi?.trim() && s.yetkiliAdi?.trim() ? s.yetkiliAdi : KAYIT_KAYNAK_ADLARI[s.kaynak];
  return (
    <>
      <span className={adVar ? "font-semibold" : "text-soluk"}>{satirAdi(s)}</span>
      <span className="text-ufak text-soluk">{ikinciSatir}</span>
    </>
  );
}

export function KayitTablosu(props: {
  satirlar: TabloSatiri[];
  seciliId: string | null;
  seciliBaglantisi: (id: string) => string;
  onSec: (id: string) => void;
  /** Süzgeç / arama etkinken boş liste: yeni kayıt önerisi yerine "Süzgeçleri temizle". */
  bosListe?: { temizAdres: string } | null;
  /** Toplu işlem seçimi (yalnızca yönetici): verilirse satır onay kutuları ve "sayfadakilerin tümünü seç" görünür. */
  secim?: { secili: ReadonlySet<string>; degistir: (id: string) => void; sayfayiDegistir: (sec: boolean) => void };
}) {
  const { secim } = props;
  const sayfaSecili = Boolean(secim) && props.satirlar.length > 0 && props.satirlar.every((s) => secim!.secili.has(s.id));
  const sayfaKismen = Boolean(secim) && !sayfaSecili && props.satirlar.some((s) => secim!.secili.has(s.id));

  if (props.satirlar.length === 0) {
    if (props.bosListe) {
      return (
        <p className="px-5 py-10 text-center text-sm text-soluk">
          Bu süzgeçlere uyan kayıt yok.{" "}
          <Link href={props.bosListe.temizAdres} className="font-medium text-ana">
            Süzgeçleri temizle
          </Link>
        </p>
      );
    }
    return (
      <p className="px-5 py-10 text-center text-sm text-soluk">
        Bu görünümde kayıt yok. <Link href="/tarama" className="font-medium text-ana">Bölge tara</Link> ile işletme ekleyin.
      </p>
    );
  }

  return (
    <>
      {/* relative: hücrelerdeki sr-only (mutlak konumlu) metinler kaydırma kabının dışına, sayfaya taşmasın. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead className="text-ufak text-soluk">
            <tr>
              {secim && (
                <th className="w-0 border-b border-cizgi py-3.5 pr-0 pl-5">
                  <OnayKutusu
                    etiket="Sayfadakilerin tümünü seç"
                    checked={sayfaSecili}
                    belirsiz={sayfaKismen}
                    onChange={(e) => secim.sayfayiDegistir(e.target.checked)}
                  />
                </th>
              )}
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
              return (
                <tr key={s.id} className={`border-b border-cizgi ${secili ? "satir-secili" : "satir"}`}>
                  {secim && (
                    <td className="w-0 py-3 pr-0 pl-5 align-top">
                      <OnayKutusu
                        className="mt-1"
                        etiket={`Seç: ${satirAdi(s)}`}
                        checked={secim.secili.has(s.id)}
                        onChange={() => secim.degistir(s.id)}
                      />
                    </td>
                  )}
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
                      <IsletmeHucresi s={s} />
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
                          <Simge ad="whatsapp" boyut={14} kalinlik={2.5} />
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
