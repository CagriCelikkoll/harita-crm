"use client";
// Tablo + ayrıntı paneli. Kayıt seçmek ve kayıt üzerinde işlem yapmak sunucuda sayfayı yeniden çizmez.
// Liste Google'dan hiç anlık veri çekmez (yalnızca kayıtlı ad / yetkili; kayit-tablosu.tsx): gezinmek kullanım
// harcamaz. Google ayrıntısı yalnızca bir kaydın ayrıntı paneli açılınca, o kayıt için getirilir ve panelde harcanan
// birim gösterilir (detay-paneli.tsx; yalnızca bellekte, lib/google-onbellegi.ts).
// Geniş ekranda panel tablonun sağındadır; dar ekranda sağdan açılan çekmecedir.
// Yönetici satırları seçip toplu işlem yapabilir (toplu-islem.tsx); işlemden sonra liste sunucudan yenilenir.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BilgiNotu } from "@/components/arayuz/not";
import { Sayfalama } from "@/components/arayuz/sayfalama";
import { GoogleAtfi } from "@/components/google-atfi";
import {
  KAYIT_SAYFA_BOYUTLARI,
  KAYIT_SIRA_ADLARI,
  KAYIT_SIRALARI,
  type KayitSayfaBoyutu,
  type KayitSirasi,
} from "@/lib/sabitler";
import type { KayitDto } from "@/server/servisler/kayit-dto";
import { DetayPaneli } from "./detay-paneli";
import { KayitTablosu, type TabloSatiri } from "./kayit-tablosu";
import { topluOzetMetni, TopluIslemCubugu } from "./toplu-islem";

export function KayitlarEkrani(props: {
  satirlar: TabloSatiri[];
  toplam: number;
  seciliIlk: string | null;
  kullaniciId: string;
  /** Mevcut filtre + sayfa sorgusu (secili hariç). */
  sorgu: string;
  sayfa: number;
  sayfaSayisi: number;
  /** Sayfasız liste adresi (sayfalama bağlantıları bundan üretilir). */
  sayfaTabani: string;
  /** Toplu işlem yalnızca yöneticiye açık. */
  yonetici: boolean;
  /** Süzgeç sorgusu (sayfa, sıra, boyut ve secili hariç): "filtreye uyan tümü" ve sıra / boyut bağlantıları. */
  filtreSorgusu: string;
  sira: KayitSirasi;
  boyut: KayitSayfaBoyutu;
  etiketler: string[];
  /** Süzgeç ya da arama etkinken boş liste: "Süzgeçleri temizle" bağlantısı (yoksa null: yeni kayıt önerisi). */
  bosListe?: { temizAdres: string } | null;
}) {
  const router = useRouter();
  const [satirlar, setSatirlar] = useState(props.satirlar);
  const [toplam, setToplam] = useState(props.toplam);
  // Toplu işlemden sonra router.refresh() yeni satırları getirir: yerel kopya onlarla değişir.
  const [gelen, setGelen] = useState(props.satirlar);
  if (gelen !== props.satirlar) {
    setGelen(props.satirlar);
    setSatirlar(props.satirlar);
    setToplam(props.toplam);
  }
  const [seciliIdler, setSeciliIdler] = useState<ReadonlySet<string>>(new Set());
  const [tumFiltre, setTumFiltre] = useState(false);
  const [ozet, setOzet] = useState<string | null>(null);

  function secimDegistir(id: string) {
    setTumFiltre(false);
    setSeciliIdler((o) => {
      const y = new Set(o);
      if (!y.delete(id)) y.add(id);
      return y;
    });
  }
  function sayfayiDegistir(sec: boolean) {
    setTumFiltre(false);
    setSeciliIdler(sec ? new Set(satirlar.map((s) => s.id)) : new Set());
  }
  function secimiTemizle() {
    setTumFiltre(false);
    setSeciliIdler(new Set());
  }
  const seciliSayi = tumFiltre ? toplam : seciliIdler.size;

  const listeAdresi = (degisiklik: { sira?: KayitSirasi; boyut?: KayitSayfaBoyutu }) => {
    const s = new URLSearchParams(props.filtreSorgusu);
    const sira = degisiklik.sira ?? props.sira;
    const boyut = degisiklik.boyut ?? props.boyut;
    if (sira !== KAYIT_SIRALARI[0]) s.set("sira", sira);
    else s.delete("sira");
    if (boyut !== KAYIT_SAYFA_BOYUTLARI[0]) s.set("boyut", String(boyut));
    else s.delete("boyut");
    return `/kayitlar${s.size ? `?${s}` : ""}`;
  };
  const [secili, setSecili] = useState<string | null>(props.seciliIlk);

  const seciliBaglantisi = useCallback(
    (id: string | null) => {
      const s = new URLSearchParams(props.sorgu);
      if (id) s.set("secili", id);
      return `/kayitlar${s.size ? `?${s}` : ""}`;
    },
    [props.sorgu],
  );

  const sec = useCallback(
    (id: string | null) => {
      setSecili(id);
      // Paylaşılabilir bağlantı için adres çubuğunu güncelle (sunucuya gitmeden).
      window.history.replaceState(null, "", seciliBaglantisi(id));
    },
    [seciliBaglantisi],
  );

  // Dar ekranda çekmece Escape ile kapanır.
  useEffect(() => {
    if (!secili) return;
    const dinle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && window.matchMedia("(max-width: 1279px)").matches) sec(null);
    };
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, [secili, sec]);

  const kayitDegisti = useCallback((k: KayitDto, ek: { whatsappIzni: TabloSatiri["whatsappIzni"]; engelli: boolean }) => {
    setSatirlar((onceki) =>
      onceki.map((s) =>
        s.id === k.id
          ? {
              ...s,
              durum: k.durum,
              iletiIzni: k.iletiIzni,
              etiketler: k.etiketler,
              isletmeAdi: k.isletmeAdi,
              yetkiliAdi: k.yetkiliAdi,
              inceleme: k.inceleme,
              guncellemeTarihi: k.guncellemeTarihi,
              whatsappIzni: ek.whatsappIzni,
              engelli: ek.engelli,
            }
          : s,
      ),
    );
  }, []);

  function silindi(id: string) {
    setSatirlar((onceki) => onceki.filter((s) => s.id !== id));
    setToplam((t) => Math.max(0, t - 1));
    sec(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Kayıt listesi" className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-kart border border-kenar bg-white">
          {ozet && (
            <div className="border-b border-cizgi px-5 py-3">
              <BilgiNotu>
                <span role="status">Toplu işlem tamamlandı. {ozet}</span>{" "}
                <button type="button" className="font-medium underline" onClick={() => setOzet(null)}>
                  Kapat
                </button>
              </BilgiNotu>
            </div>
          )}
          {props.yonetici && seciliSayi > 0 && (
            <TopluIslemCubugu
              sayi={seciliSayi}
              tumFiltre={tumFiltre}
              tumunuOner={!tumFiltre && toplam > seciliIdler.size && satirlar.every((s) => seciliIdler.has(s.id))}
              toplam={toplam}
              etiketler={props.etiketler}
              secim={tumFiltre ? { tur: "filtre", sorgu: props.filtreSorgusu, beklenenToplam: toplam } : { tur: "idler", idler: [...seciliIdler] }}
              onTumFiltreSec={() => setTumFiltre(true)}
              onTemizle={secimiTemizle}
              onTamam={(sonuc) => {
                setOzet(topluOzetMetni(sonuc));
                secimiTemizle();
                router.refresh();
              }}
              onSayiDegisti={() => {
                secimiTemizle();
                router.refresh();
              }}
            />
          )}
          <KayitTablosu
            satirlar={satirlar}
            seciliId={secili}
            seciliBaglantisi={seciliBaglantisi}
            onSec={sec}
            bosListe={props.bosListe ?? null}
            secim={props.yonetici ? { secili: seciliIdler, degistir: secimDegistir, sayfayiDegistir } : undefined}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 bg-kart-alt px-5 py-3.5 text-[13px] text-soluk">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="flex items-center gap-1.5">
                Sırala
                <select
                  className="rounded border border-kenar bg-white px-1.5 py-0.5 text-metin"
                  value={props.sira}
                  onChange={(e) => router.push(listeAdresi({ sira: e.target.value as KayitSirasi }))}
                >
                  {KAYIT_SIRALARI.map((s) => (
                    <option key={s} value={s}>
                      {KAYIT_SIRA_ADLARI[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                Sayfa başına
                <select
                  className="rounded border border-kenar bg-white px-1.5 py-0.5 text-metin"
                  value={props.boyut}
                  onChange={(e) => router.push(listeAdresi({ boyut: Number(e.target.value) as KayitSayfaBoyutu }))}
                >
                  {KAYIT_SAYFA_BOYUTLARI.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <span>Listede yalnızca kayıtlı bilgiler görünür; Google bilgileri bir kaydı açınca getirilir, kaydedilmez.</span>
              <GoogleAtfi />
            </span>
          </div>
          <Sayfalama
            className="border-t border-cizgi bg-kart-alt px-5 py-3"
            sayfa={props.sayfa}
            sayfaSayisi={props.sayfaSayisi}
            toplam={toplam}
            boyut={props.boyut}
            taban={props.sayfaTabani}
          />
        </section>

        {secili && (
          <div
            id="detay-alani"
            className="min-w-0 flex-[1_1_380px] xl:max-w-[460px] max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:w-full max-xl:max-w-[460px] max-xl:overflow-y-auto max-xl:shadow-2xl"
          >
            <DetayPaneli
              key={secili}
              id={secili}
              kullaniciId={props.kullaniciId}
              onKapat={() => sec(null)}
              onKayitDegisti={kayitDegisti}
              onSilindi={silindi}
            />
          </div>
        )}
      </div>
    </div>
  );
}
