"use client";
// Gelen kutusu ekranı: solda sohbet listesi (numara ve durum süzgeci, arama), sağda sohbet (balonlar, yazma alanı ya da
// şablon seçici, atama, kapat / yeniden aç) ve iç notlar. Telefonda liste ve sohbet ayrı ekran.
// Canlı yenileme: imleçli kısa yoklama (/api/gelen-kutusu/degisiklikler): görünür sekmede 3 sn, arka planda 20 sn.
// Kurallar sunucudadır; arayüz yalnızca yol gösterir (pencere kapalıyken yazma alanı yerine şablon seçici; RET uyarısı).
// Dosya gönderme (ekler.tsx): ataş menüsü, sürükle-bırak, yapıştırma; her dosya ayrı mesaj, açıklama ilkine. Bir mesajın
// "Yanıtla"sı gönderimde context.message_id olur; alıntı kutusu gelen ve giden yanıtlarda görünür. Gönderilemeyen medya
// mesajında "Tekrar dene".
// Liste süzgeci (numara, Açık / Kapalı, atama, çipler; arama hariç) adreste ve kullanıcı + çalışma alanı başına tercih
// olarak tutulur (lib/liste-tercihi): adreste süzgeç yoksa kayıtlı tercih uygulanır. Çipler (Okunmamış, Cevap bekleyen,
// Teklif / ilgi, Penceresi kapanmak üzere, RET verenler) birlikte kullanılabilir; telefonda yatay kayar.
// Listede çoklu seçim ve "Seçilenleri kapat"; yönetici sohbeti yalnızca Harita CRM'den silebilir (adı yazarak onay).
// Gönderimi geri al (kullanıcı tercihi): metin ve dosya GERI_AL_MS tarayıcıda bekler (lib/geri-al).
import { DonerGosterge } from "@/components/arayuz/doner-gosterge";
import { Dugme } from "@/components/arayuz/dugme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { bildir } from "@/components/bildirim";
import { Diyalog } from "@/components/arayuz/diyalog";
import { DurumRozeti } from "@/components/arayuz/rozet";
import { Simge } from "@/components/arayuz/simge";
import { apiIstek } from "@/lib/api-istemci";
import { useDisariTiklama } from "@/lib/disari-tiklama";
import { boyutYaz, tarihYaz } from "@/lib/bicim";
import {
  ACIKLAMA_AZAMI,
  GERI_AL_MS,
  gelenKutusuFiltresiCoz,
  gelenKutusuTercihi,
  MEDYA_TURLERI,
  MESAJ_TUR_ADLARI,
  mesajOzeti,
  NOT_AZAMI,
  pencereKalanMs,
  pencereKapanmakUzere,
  RET_UYARISI,
  sablonParcala,
  silmeOnayiDogruMu,
  SOHBET_CIP_ADLARI,
  SOHBET_CIPLERI,
  SOHBET_SILME_UYARISI,
  TESLIM_ADLARI,
  YANIT_AZAMI,
  type GelenKutusuFiltresi,
  type MedyaDto,
  type SohbetMesajiDto,
  type SohbetNotuDto,
  type SohbetCipi,
  type SohbetOzetiDto,
} from "@/lib/gelen-kutusu";
import { gecikmeliGonderici, type Bekleyen, type GecikmeliGonderici } from "@/lib/geri-al";
import { hazirCevapDoldur, yanitaEkle } from "@/lib/hazir-cevaplar";
import { GELEN_KUTUSU_TERCIH_ALANLARI, tarayiciDeposu, tercihAnahtari, tercihOku, tercihYaz } from "@/lib/liste-tercihi";
import { IYS_KAPALI_UYARISI } from "@/lib/mesajlasma";
import { degiskenAnahtari, sablonMetni } from "@/lib/whatsapp-api";
import type { Degisiklikler, GonderimSonucu, SohbetAyrintisi, SohbetListesi } from "@/server/servisler/gelen-kutusu";
import { EkDugmesi, ekGonder, EkSeridi, panoDosyalari, useEkler } from "./ekler";
import { HazirCevapSecici } from "./hazir-cevap-secici";
import { NumaraliMetin } from "./yonlendirme";

type Filtre = GelenKutusuFiltresi;

const sorgu = (f: Filtre, ek: Record<string, string> = {}) => {
  const p = new URLSearchParams();
  if (f.numara) p.set("numara", f.numara);
  if (f.durum) p.set("durum", f.durum);
  if (f.atanan) p.set("atanan", f.atanan);
  if (f.cipler.length) p.set("cip", f.cipler.join(","));
  if (f.q.trim()) p.set("q", f.q.trim());
  for (const [k, v] of Object.entries(ek)) p.set(k, v);
  return p.toString();
};

const yeniKimlik = () => crypto.randomUUID().replace(/-/g, "");

const saatYaz = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

/** Liste satırındaki kısa zaman: bugünse saat, değilse tarih. */
function kisaZaman(iso: string | null) {
  if (!iso) return "";
  const t = new Date(iso);
  const bugun = new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  return t.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) === bugun
    ? saatYaz(iso)
    : t.toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" });
}

/** 24 saat penceresinin kalanı ("5 sa", "2 sa 10 dk", "40 dk"); kapalıysa null. */
function pencereKalan(sonGelen: string | null, simdi: number): string | null {
  const kalan = pencereKalanMs(sonGelen, simdi);
  if (kalan === null) return null;
  const sa = Math.floor(kalan / 3_600_000);
  const dk = Math.max(1, Math.floor((kalan % 3_600_000) / 60_000));
  if (sa >= 3) return `${sa} sa`;
  return sa > 0 ? `${sa} sa ${dk} dk` : `${dk} dk`;
}

function mesajlariBirlestir(eski: SohbetMesajiDto[], yeni: SohbetMesajiDto[]) {
  const harita = new Map(eski.map((m) => [m.id, m]));
  for (const m of yeni) harita.set(m.id, m);
  return [...harita.values()].sort((a, b) => a.tarih.localeCompare(b.tarih));
}

export function GelenKutusu(props: {
  ilk: SohbetListesi;
  ilkSohbet: string | null;
  kullaniciId: string;
  tenantId: string;
  /** Adresten çözülen süzgeç (ilk liste bununla geldi). */
  ilkFiltre: Filtre;
  /** Adreste süzgeç parametresi vardı: kayıtlı tercih uygulanmaz. */
  adresteFiltre: boolean;
  /** Kullanıcı tercihi: gönderimi GERI_AL_MS beklet. */
  gonderimGeriAl: boolean;
  yonetici: boolean;
}) {
  const [filtre, setFiltre] = useState<Filtre>(props.ilkFiltre);
  const [liste, setListe] = useState(props.ilk);
  const [seciliId, setSeciliId] = useState<string | null>(props.ilkSohbet);
  const [ayrinti, setAyrinti] = useState<SohbetAyrintisi | null>(null);
  const [simdi, setSimdi] = useState(() => Date.now());
  const surum = useRef(props.ilk.surum);
  const filtreRef = useRef(filtre);
  const seciliRef = useRef(seciliId);
  useEffect(() => {
    filtreRef.current = filtre;
    seciliRef.current = seciliId;
  }, [filtre, seciliId]);

  const listeYukle = useCallback(async (f: Filtre) => {
    const y = await apiIstek<SohbetListesi>(`/api/sohbetler?${sorgu(f)}`);
    if (y.ok) {
      setListe(y.veri);
      surum.current = Math.max(surum.current, y.veri.surum);
    }
  }, []);

  const okundu = useCallback(async (id: string) => {
    await apiIstek(`/api/sohbetler/${id}/okundu`, { method: "POST" });
  }, []);

  /** Ayrıntıyı yükler (durum yalnızca yanıttan sonra değişir). */
  const ayrintiYukle = useCallback(
    async (id: string) => {
      const y = await apiIstek<SohbetAyrintisi>(`/api/sohbetler/${id}`);
      if (!y.ok) {
        bildir(y.hata, "hata");
        setSeciliId(null);
        setAyrinti(null);
        return;
      }
      setAyrinti(y.veri);
      if (y.veri.sohbet.okunmamis > 0) await okundu(id);
    },
    [okundu],
  );

  const sohbetAc = (id: string) => {
    setSeciliId(id);
    seciliRef.current = id;
    void ayrintiYukle(id);
  };

  // İlk açılış: ?sohbet=<id>
  useEffect(() => {
    const id = props.ilkSohbet;
    if (!id) return;
    let iptal = false;
    void apiIstek<SohbetAyrintisi>(`/api/sohbetler/${id}`).then((y) => {
      if (iptal || !y.ok) return;
      setAyrinti(y.veri);
      if (y.veri.sohbet.okunmamis > 0) void okundu(id);
    });
    return () => {
      iptal = true;
    };
  }, [props.ilkSohbet, okundu]);

  // Liste tercihi: ilk açılışta (adreste süzgeç yoksa) kayıtlı tercih uygulanır; sonra her değişiklik kaydedilir ve
  // adrese yazılır (?sohbet= gibi diğer parametreler korunur).
  const tercihHazir = useRef(false);
  const { tenantId, kullaniciId, adresteFiltre } = props;
  const numaraIdleri = props.ilk.numaralar.map((n) => n.id).join(",");
  const cipAnahtari = filtre.cipler.join(",");
  useEffect(() => {
    const depo = tarayiciDeposu();
    const anahtar = tercihAnahtari("gelen-kutusu", tenantId, kullaniciId);
    const f = { numara: filtre.numara, durum: filtre.durum, atanan: filtre.atanan, cipler: cipAnahtari ? (cipAnahtari.split(",") as SohbetCipi[]) : [], q: "" };
    if (!tercihHazir.current) {
      tercihHazir.current = true;
      const kayitli = adresteFiltre ? null : tercihOku(depo, anahtar, GELEN_KUTUSU_TERCIH_ALANLARI);
      if (kayitli) {
        const k = gelenKutusuFiltresiCoz((a) => kayitli[a], numaraIdleri ? numaraIdleri.split(",") : []);
        if (k.numara !== f.numara || k.durum !== f.durum || k.atanan !== f.atanan || k.cipler.join(",") !== cipAnahtari) {
          // Kayıtlı tercih bir kez, açılışta uygulanır; değişiklik bir sonraki çizimde kaydedilir.
          // eslint-disable-next-line react-hooks/set-state-in-effect -- tarayıcı depolaması yalnızca istemcide okunur
          setFiltre((x) => ({ ...k, q: x.q }));
          return;
        }
      }
    }
    const t = gelenKutusuTercihi(f);
    tercihYaz(depo, anahtar, t);
    const adres = new URL(window.location.href);
    for (const a of GELEN_KUTUSU_TERCIH_ALANLARI) adres.searchParams.delete(a);
    for (const [a, d] of Object.entries(t)) adres.searchParams.set(a, d);
    if (adres.href !== window.location.href) window.history.replaceState(null, "", adres);
  }, [filtre.numara, filtre.durum, filtre.atanan, cipAnahtari, tenantId, kullaniciId, adresteFiltre, numaraIdleri]);

  // Süzgeç değişince liste hemen yenilenir.
  const ilkRender = useRef(true);
  useEffect(() => {
    if (ilkRender.current) {
      ilkRender.current = false;
      return;
    }
    const z = setTimeout(() => void listeYukle(filtre), filtre.q ? 300 : 0);
    return () => clearTimeout(z);
  }, [filtre, listeYukle]);

  // Kısa yoklama.
  useEffect(() => {
    let iptal = false;
    let zamanlayici: ReturnType<typeof setTimeout>;
    const tur = async () => {
      const id = seciliRef.current;
      const ek: Record<string, string> = { sonra: String(surum.current) };
      if (id) ek.sohbet = id;
      try {
        const y = await apiIstek<Degisiklikler>(`/api/gelen-kutusu/degisiklikler?${sorgu(filtreRef.current, ek)}`);
        if (!iptal && y.ok && y.veri.degisti) {
          const d = y.veri;
          surum.current = d.surum;
          setListe(d.liste);
          if (d.sohbet && id && seciliRef.current === id) {
            const s = d.sohbet;
            setAyrinti((a) =>
              a && a.sohbet.id === id
                ? { ...a, sohbet: s.ayrinti ?? a.sohbet, mesajlar: mesajlariBirlestir(a.mesajlar, s.mesajlar), notlar: s.notlar }
                : a,
            );
            // Açık ve görünür sohbete yeni mesaj geldi: okundu say.
            if (s.ayrinti && s.ayrinti.okunmamis > 0 && document.visibilityState === "visible") void okundu(id);
          }
        } else if (!iptal && y.ok) {
          surum.current = Math.max(surum.current, y.veri.surum);
        }
      } finally {
        setSimdi(Date.now());
        if (!iptal) zamanlayici = setTimeout(tur, document.visibilityState === "visible" ? 3000 : 20_000);
      }
    };
    zamanlayici = setTimeout(tur, 3000);
    return () => {
      iptal = true;
      clearTimeout(zamanlayici);
    };
  }, [okundu]);

  const secili = ayrinti && ayrinti.sohbet.id === seciliId ? ayrinti : null;

  // Çoklu seçim ("Seç" → satırlar onay kutulu; "Seçilenleri kapat").
  const [secimModu, setSecimModu] = useState(false);
  const [secilenler, setSecilenler] = useState<string[]>([]);
  const [kapatiliyor, setKapatiliyor] = useState(false);
  const secimiBitir = () => {
    setSecimModu(false);
    setSecilenler([]);
  };
  const secilenleriKapat = async () => {
    if (!secilenler.length) return;
    setKapatiliyor(true);
    const y = await apiIstek<{ kapatilan: number }>("/api/sohbetler/kapat", { method: "POST", govde: { idler: secilenler } });
    setKapatiliyor(false);
    if (!y.ok) return bildir(y.hata, "hata");
    bildir(y.veri.kapatilan ? `${y.veri.kapatilan} sohbet kapatıldı.` : "Seçilenlerin hepsi zaten kapalıydı.");
    secimiBitir();
    void listeYukle(filtreRef.current);
    if (seciliRef.current && secilenler.includes(seciliRef.current)) void ayrintiYukle(seciliRef.current);
  };

  return (
    // Telefonda tek sütun minmax(0,1fr): sütun tanımı olmazsa "auto" sütun en uzun bölünmez metne (son mesajdaki uzun
    // bağlantı) göre genişler ve sayfa yatayda taşar.
    <div className="grid min-h-[70dvh] grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
      <section aria-label="Sohbetler" className={`${seciliId ? "hidden lg:flex" : "flex"} kart min-w-0 flex-col gap-3 !p-0`}>
        <ListeSuzgeci liste={liste} filtre={filtre} setFiltre={setFiltre} />
        <SecimCubugu
          secimModu={secimModu}
          secilen={secilenler.length}
          tumu={liste.sohbetler.filter((x) => x.durum === "acik").map((x) => x.id)}
          kapatiliyor={kapatiliyor}
          onBasla={() => setSecimModu(true)}
          onTumu={(idler) => setSecilenler(idler)}
          onKapat={() => void secilenleriKapat()}
          onVazgec={secimiBitir}
        />
        <SohbetListesiGorunumu
          liste={liste}
          seciliId={seciliId}
          simdi={simdi}
          onSec={sohbetAc}
          secim={secimModu ? { idler: secilenler, degistir: (id) => setSecilenler((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id])) } : null}
        />
      </section>

      <section aria-label="Sohbet" className={`${seciliId ? "flex" : "hidden lg:flex"} min-w-0 flex-col`}>
        {seciliId && secili ? (
          <SohbetEkrani
            key={secili.sohbet.id}
            a={secili}
            simdi={simdi}
            kullaniciId={props.kullaniciId}
            gonderimGeriAl={props.gonderimGeriAl}
            yonetici={props.yonetici}
            onGeri={() => {
              setSeciliId(null);
              setAyrinti(null);
            }}
            onSilindi={() => {
              setSeciliId(null);
              setAyrinti(null);
              void listeYukle(filtreRef.current);
            }}
            onDegisti={(a) => setAyrinti(a)}
            onSohbetAc={sohbetAc}
            onMesaj={(m) => setAyrinti((x) => (x && x.sohbet.id === secili.sohbet.id ? { ...x, mesajlar: mesajlariBirlestir(x.mesajlar, [m]) } : x))}
            onNotlar={(n) => setAyrinti((x) => (x ? { ...x, notlar: n } : x))}
          />
        ) : seciliId ? (
          <div className="kart" aria-busy="true">
            <DonerGosterge etiket="Yükleniyor…" />
          </div>
        ) : (
          <div className="kart flex flex-1 items-center justify-center text-sm text-soluk">Soldan bir sohbet seçin.</div>
        )}
      </section>
    </div>
  );
}

function ListeSuzgeci(props: { liste: SohbetListesi; filtre: Filtre; setFiltre: (f: Filtre) => void }) {
  const { filtre, setFiltre, liste } = props;
  const sekme = (id: string, ad: string, sayi: number | undefined) => (
    <button
      key={id || "tum"}
      type="button"
      aria-pressed={filtre.numara === id}
      onClick={() => setFiltre({ ...filtre, numara: id })}
      className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-ufak ${filtre.numara === id ? "bg-ana font-semibold text-white hover:bg-ana-uzerine active:bg-ana-koyu" : "bg-segment text-metin-ikincil hover:bg-uzerine-gelme active:bg-basili"}`}
    >
      {ad}
      {sayi ? <span className={`rounded-full px-1.5 text-xs font-semibold ${filtre.numara === id ? "bg-white/25" : "bg-ana text-white"}`}>{sayi}</span> : null}
    </button>
  );
  return (
    <div className="flex flex-col gap-3 border-b border-cizgi p-4">
      {liste.numaralar.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Numara">
          {sekme("", "Tümü", liste.okunmamis.toplam)}
          {liste.numaralar.map((n) => sekme(n.id, n.etiket, liste.okunmamis[n.id]))}
        </div>
      )}
      <div className="flex gap-2">
        <select
          aria-label="Durum"
          className="girdi !w-auto !py-1 sm:!min-h-9"
          value={filtre.durum}
          onChange={(e) => setFiltre({ ...filtre, durum: e.target.value as Filtre["durum"] })}
        >
          <option value="acik">Açık</option>
          <option value="kapali">Kapalı</option>
          <option value="">Tümü</option>
        </select>
        <select
          aria-label="Atama"
          className="girdi !w-auto !py-1 sm:!min-h-9"
          value={filtre.atanan}
          onChange={(e) => setFiltre({ ...filtre, atanan: e.target.value as Filtre["atanan"] })}
        >
          <option value="">Herkes</option>
          <option value="ben">Bana atanan</option>
          <option value="yok">Atanmamış</option>
        </select>
      </div>
      <input
        type="search"
        className="girdi sm:!min-h-9"
        placeholder="Ad ya da telefon ara"
        aria-label="Sohbet ara"
        value={filtre.q}
        maxLength={100}
        onChange={(e) => setFiltre({ ...filtre, q: e.target.value })}
      />
      {/* Çipler birlikte kullanılabilir (VE); sayı: süzgecin geri kalanıyla. Tek satır, yatay kayar (telefonda ve dar liste
          sütununda alt alta dizilip listeyi aşağı itmesin); kenarda yarım görünen çip kaydırılabileceğini gösterir. */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:thin]" role="group" aria-label="Hızlı süzgeçler">
        {SOHBET_CIPLERI.map((c) => {
          const acik = filtre.cipler.includes(c);
          const sayi = liste.cipSayilari?.[c] ?? 0;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={acik}
              onClick={() => setFiltre({ ...filtre, cipler: SOHBET_CIPLERI.filter((x) => (x === c ? !acik : filtre.cipler.includes(x))) })}
              className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-ufak whitespace-nowrap ${
                acik ? "border-ana bg-ana-acik font-semibold text-ana-koyu hover:bg-ana-acik active:bg-basili" : "border-kenar bg-white text-metin-ikincil hover:bg-uzerine-gelme active:bg-basili"
              }`}
            >
              {SOHBET_CIP_ADLARI[c]}
              <span className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${sayi ? (acik ? "bg-ana text-white" : "bg-segment text-metin") : "text-soluk"}`}>{sayi}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Liste üstünde çoklu seçim: "Seç" → "N seçili · Tümünü seç · Seçilenleri kapat · Vazgeç". */
function SecimCubugu(props: {
  secimModu: boolean;
  secilen: number;
  tumu: string[];
  kapatiliyor: boolean;
  onBasla: () => void;
  onTumu: (idler: string[]) => void;
  onKapat: () => void;
  onVazgec: () => void;
}) {
  if (!props.secimModu) {
    return (
      <div className="-mt-3 flex justify-end border-b border-cizgi px-4 py-1.5">
        <button type="button" className="dugme-metin text-ufak" onClick={props.onBasla}>
          Seç
        </button>
      </div>
    );
  }
  return (
    <div className="-mt-3 flex flex-wrap items-center gap-2 border-b border-cizgi bg-secili-satir px-4 py-2 text-ufak" role="toolbar" aria-label="Seçili sohbetler">
      <span className="font-semibold" aria-live="polite">
        {props.secilen} seçili
      </span>
      <button type="button" className="dugme-metin" onClick={() => props.onTumu(props.tumu)} disabled={!props.tumu.length}>
        Açıkların tümü
      </button>
      <span className="ml-auto flex gap-2">
        <button type="button" className="dugme-kucuk" onClick={props.onVazgec}>
          Vazgeç
        </button>
        <Dugme tur="ana" boyut="kucuk" yukleniyor={props.kapatiliyor} disabled={!props.secilen} onClick={props.onKapat}>
          Seçilenleri kapat
        </Dugme>
      </span>
    </div>
  );
}

type Secim = { idler: string[]; degistir: (id: string) => void } | null;

function SohbetListesiGorunumu(props: { liste: SohbetListesi; seciliId: string | null; simdi: number; onSec: (id: string) => void; secim: Secim }) {
  if (!props.liste.sohbetler.length) {
    return <p className="p-4 text-sm text-soluk">Bu süzgeçle sohbet yok. Müşteri WhatsApp numaranıza yazınca burada görünür.</p>;
  }
  const cokNumara = props.liste.numaralar.length > 1;
  return (
    <ul className="flex flex-col overflow-y-auto lg:max-h-[70dvh]">
      {props.liste.sohbetler.map((s) => (
        <SohbetSatiri
          key={s.id}
          s={s}
          secili={s.id === props.seciliId}
          simdi={props.simdi}
          cokNumara={cokNumara}
          onSec={props.onSec}
          isaretli={props.secim ? props.secim.idler.includes(s.id) : null}
          onIsaretle={props.secim?.degistir}
        />
      ))}
      {props.liste.toplam > props.liste.sohbetler.length && (
        <li className="p-3 text-center text-xs text-soluk">İlk {props.liste.sohbetler.length} sohbet gösteriliyor; aramayla daraltın.</li>
      )}
    </ul>
  );
}

function SohbetSatiri(props: {
  s: SohbetOzetiDto;
  secili: boolean;
  simdi: number;
  cokNumara: boolean;
  onSec: (id: string) => void;
  /** Seçim modunda işaretli mi (seçim modu değilse null). */
  isaretli: boolean | null;
  onIsaretle?: (id: string) => void;
}) {
  const { s } = props;
  const kalan = pencereKalan(s.sonGelenTarihi, props.simdi);
  // Penceresi kapanmak üzere (açık sohbet, < 3 saat): kalan süre uyarı rozetiyle.
  const kapaniyor = s.durum === "acik" && pencereKapanmakUzere(s.sonGelenTarihi, props.simdi);
  const secimde = props.isaretli !== null;
  return (
    <li>
      <button
        type="button"
        onClick={() => (secimde ? props.onIsaretle?.(s.id) : props.onSec(s.id))}
        aria-current={!secimde && props.secili ? "true" : undefined}
        aria-pressed={secimde ? Boolean(props.isaretli) : undefined}
        className={`flex w-full items-start gap-3 border-b border-cizgi px-4 py-3 text-left ${secimde ? (props.isaretli ? "satir-secili" : "satir") : props.secili ? "satir-secili" : "satir"}`}
      >
        {secimde && (
          // Görsel onay kutusu: dokunma hedefi satırın kendisi (düğme); ekran okuyucu aria-pressed'i okur.
          <input type="checkbox" tabIndex={-1} aria-hidden="true" readOnly checked={Boolean(props.isaretli)} className="pointer-events-none mt-0.5" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm ${s.okunmamis ? "font-semibold" : "font-semibold"}`}>{s.ad}</span>
          <span className="shrink-0 text-xs text-soluk">{kisaZaman(s.sonMesajTarihi)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-ufak ${s.okunmamis ? "text-metin" : "text-soluk"}`}>{s.sonMesaj ?? "—"}</span>
          {s.okunmamis > 0 && (
            <span className="shrink-0 rounded-full bg-ana px-1.5 text-xs font-semibold text-white" aria-label={`${s.okunmamis} okunmamış`}>
              {s.okunmamis}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-soluk">
          {props.cokNumara && <span className="rounded-md bg-segment px-1.5">{s.numara}</span>}
          {kapaniyor ? (
            <span className="rounded-full bg-uyari-acik px-2 font-semibold text-uyari" title="24 saatlik yanıt penceresi kapanmak üzere">
              ⏱ {kalan} kaldı
            </span>
          ) : kalan ? (
            <span title="24 saatlik yanıt penceresinin kalanı">⏱ {kalan}</span>
          ) : (
            <span>Pencere kapalı</span>
          )}
          {s.teklifIstegi && <span className="rounded-full bg-ana-acik px-2 font-semibold text-ana-koyu">{SOHBET_CIP_ADLARI.teklif}</span>}
          {s.ret && <span className="rounded-full bg-tehlike-acik px-2 font-semibold text-tehlike">RET</span>}
          {s.atananAd && <span>· {s.atananAd}</span>}
          {s.durum === "kapali" && <span>· Kapalı</span>}
        </span>
        </span>
      </button>
    </li>
  );
}

function SohbetEkrani(props: {
  a: SohbetAyrintisi;
  simdi: number;
  kullaniciId: string;
  gonderimGeriAl: boolean;
  yonetici: boolean;
  onGeri: () => void;
  onSilindi: () => void;
  onDegisti: (a: SohbetAyrintisi) => void;
  /** Başka sohbeti aç (Şablon gönder sonrası yeni kişinin sohbeti; yönlendiren sohbet bağlantısı). */
  onSohbetAc: (id: string) => void;
  onMesaj: (m: SohbetMesajiDto) => void;
  onNotlar: (n: SohbetNotuDto[]) => void;
}) {
  const { a } = props;
  const s = a.sohbet;
  const [eskiler, setEskiler] = useState<SohbetMesajiDto[]>([]);
  const [dahaEski, setDahaEski] = useState(a.dahaEski);
  const mesajlar = useMemo(() => mesajlariBirlestir(eskiler, a.mesajlar), [eskiler, a.mesajlar]);
  // Mesaj listesi kendi kabında kayar. Yeni mesaj gelince (ya da gönderilince) en alta inilir; görseller sonradan
  // yüklenip yüksekliği büyütünce kullanıcı alttaysa altta kalınır (önceden yalnızca bir kez scrollIntoView
  // yapılıyordu ve görsel yüklenince yeni ileti yarım kalıyordu). Yukarı kaydırıp eski mesaj okuyan kullanıcı bozulmaz.
  const liste = useRef<HTMLDivElement>(null);
  const altta = useRef(true);
  const altaIn = () => {
    const el = liste.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const sonId = mesajlar.at(-1)?.id;
  useEffect(() => {
    altta.current = true;
    altaIn();
  }, [sonId]);

  const guncelle = async (govde: { durum?: "acik" | "kapali"; atananKullanici?: string | null }) => {
    const y = await apiIstek<SohbetAyrintisi>(`/api/sohbetler/${s.id}`, { method: "PATCH", govde });
    if (y.ok) props.onDegisti(y.veri);
    else bildir(y.hata, "hata");
  };

  const eskileriYukle = async () => {
    const ilk = mesajlar[0];
    if (!ilk) return;
    const y = await apiIstek<{ mesajlar: SohbetMesajiDto[] }>(`/api/sohbetler/${s.id}?once=${encodeURIComponent(ilk.tarih)}`);
    if (!y.ok) return bildir(y.hata, "hata");
    setEskiler((e) => mesajlariBirlestir(e, y.veri.mesajlar));
    if (y.veri.mesajlar.length < 100) setDahaEski(false);
  };

  const pencereAcik = Boolean(s.pencereBitis && new Date(s.pencereBitis).getTime() > props.simdi);
  const [yanitlanan, setYanitlanan] = useState<SohbetMesajiDto | null>(null);
  const yanitlanabilir = pencereAcik && !s.numaraKilitli;
  const [silmeAcik, setSilmeAcik] = useState(false);

  const tekrarDene = async (m: SohbetMesajiDto) => {
    const y = await apiIstek<GonderimSonucu>(`/api/sohbetler/${s.id}/mesaj/${m.id}/tekrar`, { method: "POST" });
    if (!y.ok) return bildir(y.hata, "hata");
    props.onMesaj(y.veri.mesaj);
    if (y.veri.uyari) bildir(y.veri.uyari, "hata");
    else bildir("Gönderildi.");
  };

  return (
    <div className="grid min-h-[70dvh] grid-cols-[minmax(0,1fr)] content-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      {/* Geniş ekranda kart ekran yüksekliğiyle sınırlı: ek eklenince yazma alanı büyür, mesaj listesi küçülür; "Gönder"
          görünür alanın altına inmez. */}
      <div className="kart flex min-w-0 flex-col !p-0 lg:h-[calc(100dvh-9rem)] lg:min-h-[520px]">
        <header className="flex flex-wrap items-center gap-3 border-b border-cizgi px-4 py-3">
          <button type="button" className="dugme-kucuk lg:hidden" onClick={props.onGeri}>
            ← Sohbetler
          </button>
          <div className="flex min-w-0 flex-[1_1_14rem] flex-col">
            <Link href={`/kayitlar?grup=tum&secili=${s.leadId}`} className="truncate font-semibold text-ana-koyu hover:underline">
              {s.ad}
            </Link>
            <span className="text-xs text-soluk">
              {s.telefon ?? "Telefon yok"} · {s.numara}
            </span>
            {s.yonlendiren && (
              <span className="text-xs text-soluk">
                {s.yonlendiren.sohbetId ? (
                  <button type="button" className="underline hover:text-metin" onClick={() => props.onSohbetAc(s.yonlendiren!.sohbetId!)}>
                    {s.yonlendiren.metin}
                  </button>
                ) : (
                  s.yonlendiren.metin
                )}
              </span>
            )}
          </div>
          <DurumRozeti ton={s.izin === "ret" ? "tehlike" : s.izin === "var" ? "ana" : "notr"}>
            {s.izin === "ret" ? "RET verdi" : s.izin === "var" ? "WhatsApp izni var" : "WhatsApp izni yok"}
          </DurumRozeti>
          {s.reklamdan && <DurumRozeti ton="notr">Reklamdan yazdı</DurumRozeti>}
          <select
            aria-label="Atanan kişi"
            className="girdi !w-auto !py-1 sm:!min-h-9"
            value={s.atananKullanici ?? ""}
            onChange={(e) => void guncelle({ atananKullanici: e.target.value || null })}
          >
            <option value="">Atanmamış</option>
            {a.uyeler.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id === props.kullaniciId ? `${u.ad} (ben)` : u.ad}
              </option>
            ))}
          </select>
          <button type="button" className="dugme-kucuk" onClick={() => void guncelle({ durum: s.durum === "acik" ? "kapali" : "acik" })}>
            {s.durum === "acik" ? "Kapat" : "Yeniden aç"}
          </button>
          {props.yonetici && (
            <button type="button" className="dugme-tehlike dugme-kucuk" onClick={() => setSilmeAcik(true)}>
              Sil
            </button>
          )}
        </header>
        {props.yonetici && <SilmePenceresi acik={silmeAcik} sohbetId={s.id} ad={s.ad} onKapat={() => setSilmeAcik(false)} onSilindi={props.onSilindi} />}

        <div
          ref={liste}
          className="flex max-h-[60dvh] min-h-[min(320px,45dvh)] flex-1 flex-col gap-2 overflow-y-auto bg-zemin px-4 py-4 lg:max-h-none lg:min-h-[160px]"
          onScroll={(e) => {
            const el = e.currentTarget;
            altta.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          // Görsel / video sonradan yüklenince (load olayı kabarcıklanmaz: yakalama aşaması) alttaysa altta kal.
          onLoadCapture={() => {
            if (altta.current) altaIn();
          }}
        >
          {dahaEski && (
            <button type="button" className="dugme-kucuk self-center" onClick={() => void eskileriYukle()}>
              Daha eski mesajlar
            </button>
          )}
          {mesajlar.map((m) => (
            <Balon key={m.id} m={m} sohbetId={s.id} onSohbetAc={props.onSohbetAc} onYanitla={yanitlanabilir ? setYanitlanan : undefined} onTekrar={tekrarDene} />
          ))}
        </div>

        <YazmaAlani
          a={a}
          pencereAcik={pencereAcik}
          geriAlMs={props.gonderimGeriAl ? GERI_AL_MS : 0}
          onMesaj={props.onMesaj}
          yanitlanan={yanitlanan}
          onYanitla={setYanitlanan}
          onYanitIptal={() => setYanitlanan(null)}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-4 self-start">
        <PazarlamaIzni key={s.id} s={s} onSohbet={(sohbet) => props.onDegisti({ ...a, sohbet })} />
        <Notlar sohbetId={s.id} notlar={a.notlar} onNotlar={props.onNotlar} />
      </div>
    </div>
  );
}

/**
 * Sohbeti yalnızca Harita CRM'den kalıcı olarak silme (yalnızca yönetici): uyarı metni ve sohbetin adını yazarak onay.
 * Kayıt, izin / RET ve kampanya istatistikleri korunur; denetim kaydına yazılır (sunucu).
 */
function SilmePenceresi(props: { acik: boolean; sohbetId: string; ad: string; onKapat: () => void; onSilindi: () => void }) {
  const [onay, setOnay] = useState("");
  const [siliniyor, setSiliniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const dogru = silmeOnayiDogruMu(onay, props.ad);
  const kapat = () => {
    setOnay("");
    setHata(null);
    props.onKapat();
  };
  const sil = async () => {
    setSiliniyor(true);
    setHata(null);
    const y = await apiIstek<{ silindi: { mesaj: number; medya: number; not: number } }>(`/api/sohbetler/${props.sohbetId}`, {
      method: "DELETE",
      govde: { onay },
    });
    setSiliniyor(false);
    if (!y.ok) return setHata(y.hata);
    bildir(`Sohbet silindi (${y.veri.silindi.mesaj} mesaj, ${y.veri.silindi.medya} dosya, ${y.veri.silindi.not} not).`);
    kapat();
    props.onSilindi();
  };
  return (
    <Diyalog
      acik={props.acik}
      onKapat={kapat}
      baslik="Sohbeti sil"
      genislik="orta"
      eylemler={
        <>
          <button type="button" className="dugme" onClick={kapat}>
            Vazgeç
          </button>
          <Dugme tur="tehlike" yukleniyor={siliniyor} disabled={!dogru} onClick={() => void sil()}>
            Kalıcı olarak sil
          </Dugme>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="rounded-md bg-tehlike-acik px-3 py-2 font-medium text-tehlike">{SOHBET_SILME_UYARISI}</p>
        <p className="text-metin-ikincil">Mesajlar, dosyalar ve iç notlar silinir. Kişinin kaydı, izin / RET bilgisi ve kampanya istatistikleri korunur.</p>
        <label className="etiket">
          <span>
            Onaylamak için sohbetin adını yazın: <span className="font-semibold text-metin">{props.ad}</span>
          </span>
          <input className="girdi" value={onay} autoComplete="off" onChange={(e) => setOnay(e.target.value)} maxLength={300} />
        </label>
        {hata && (
          <p role="alert" className="text-tehlike">
            {hata}
          </p>
        )}
      </div>
    </Diyalog>
  );
}

/**
 * Kişi sohbette pazarlama iletisi istediyse temsilci tek tıkla kaydeder (kaynak "WhatsApp sohbeti", tarih ve temsilci
 * sunucuda yazılır). Bireysel kişide İYS beyanı ayrıca işaretlenmezse kampanya ve şablon yine gitmez.
 */
function PazarlamaIzni(props: { s: SohbetAyrintisi["sohbet"]; onSohbet: (s: SohbetAyrintisi["sohbet"]) => void }) {
  const { s } = props;
  const [iys, setIys] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);
  if (s.retVerdi) return null;
  // İYS kontrolü kapalıysa İYS beyanı aranmaz: eksik sayılmaz (uyarı gösterilir).
  const iysEksik = s.iysKontrolu && s.izin === "var" && s.bireysel && !s.iysBeyani;
  const iysUyarisi = !s.iysKontrolu && <p className="rounded-md bg-uyari-acik px-2 py-1 text-xs font-medium text-uyari">{IYS_KAPALI_UYARISI}</p>;
  if (s.izin === "var" && !iysEksik) {
    return (
      <aside className="kart flex flex-col gap-1 text-ufak" aria-label="Pazarlama izni">
        <h2 className="text-sm font-semibold">Pazarlama izni</h2>
        {iysUyarisi}
        <p>
          WhatsApp izni var{s.izinKaynagi ? ` (${s.izinKaynagi})` : ""}
          {s.bireysel ? (s.iysBeyani ? " · İYS beyanı var" : " · İYS beyanı yok") : ""}.
        </p>
      </aside>
    );
  }
  const kaydet = async () => {
    setBekliyor(true);
    const y = await apiIstek<{ sohbet: SohbetAyrintisi["sohbet"] }>(`/api/sohbetler/${s.id}/izin`, { method: "POST", govde: { iysBeyani: s.bireysel && iys } });
    setBekliyor(false);
    if (!y.ok) return bildir(y.hata, "hata");
    props.onSohbet(y.veri.sohbet);
    bildir(iysEksik ? "İYS beyanı kaydedildi." : "Pazarlama izni kaydedildi.");
  };
  return (
    <aside className="kart flex flex-col gap-2 text-ufak" aria-label="Pazarlama izni">
      <h2 className="text-sm font-semibold">Pazarlama izni</h2>
      {iysUyarisi}
      {iysEksik ? (
        <p className="text-uyari">
          WhatsApp izni var{s.izinKaynagi ? ` (${s.izinKaynagi})` : ""} ama İYS beyanı yok: bireysel kişiye kampanya ve şablon gitmez.
        </p>
      ) : (
        <p className="text-soluk">
          {s.reklamdan ? "Reklamdan yazdı; bu, pazarlama izni sayılmaz. " : ""}Kişi bu sohbette kampanya / duyuru almak istediğini yazdıysa
          kaydedin. Tarih ve adınız izin kaydına yazılır.
        </p>
      )}
      {s.bireysel && (
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={iys} onChange={(e) => setIys(e.target.checked)} />
          <span>İzin İYS&apos;ye kaydedildi{iysEksik || !s.iysKontrolu ? "" : " (işaretlenmezse bireysel kişiye kampanya ve şablon gitmez)"}</span>
        </label>
      )}
      <button type="button" className="dugme-kucuk self-start" disabled={bekliyor || (iysEksik && !iys)} onClick={() => void kaydet()}>
        {iysEksik ? "İYS beyanını kaydet" : "Pazarlama izni istedi"}
      </button>
    </aside>
  );
}

function kaynakEtiketi(m: SohbetMesajiDto) {
  if (m.yon === "gelen") return null;
  switch (m.kaynak) {
    case "temsilci":
      return m.gonderen ?? "Temsilci";
    case "kampanya":
      return "Kampanya";
    case "bot":
      return "Bot";
    case "telefon":
      return "Telefon";
    default:
      return null;
  }
}

function TeslimIsareti({ m }: { m: SohbetMesajiDto }) {
  const d = m.teslimDurumu;
  if (!d) return null;
  if (d === "failed")
    return (
      <span className="font-semibold text-tehlike" title={m.teslimHataKodu ? `Meta hata kodu ${m.teslimHataKodu}` : undefined}>
        {m.hataMetni ? "Gönderilemedi" : "İletilemedi"}
        {m.teslimHataKodu ? ` (${m.teslimHataKodu})` : ""}
      </span>
    );
  if (d === "belirsiz") return <span className="font-semibold text-uyari">{TESLIM_ADLARI.belirsiz}</span>;
  const isaret = d === "read" ? "✓✓" : d === "delivered" ? "✓✓" : "✓";
  return (
    <span className={d === "read" ? "text-okundu" : "text-soluk"} title={TESLIM_ADLARI[d] ?? d} aria-label={TESLIM_ADLARI[d] ?? d}>
      {isaret}
    </span>
  );
}

/**
 * Telefonda yazma alanına odaklanınca klavye açılır (görünür alan küçülür): formun alt kenarı (Gönder) görünür alanın
 * altında kalırsa sayfa o kadar kaydırılır. visualViewport klavyeyi hesaba katar (iOS düzen alanını küçültmez).
 */
function gonderGorunsun(form: HTMLFormElement | null) {
  if (!form || !window.matchMedia("(max-width: 640px)").matches) return;
  window.setTimeout(() => {
    const g = window.visualViewport;
    const alt = g ? g.offsetTop + g.height : window.innerHeight;
    const fark = form.getBoundingClientRect().bottom - alt + 8;
    if (fark > 0) window.scrollBy({ top: fark, behavior: "smooth" });
  }, 350);
}

/** Gelen fotoğraf (satır içi), ses ve video (oynatıcı) ve belge (indirme bağlantısı); indirilemediyse nedeni. */
function MedyaGosterimi({ medya, tur }: { medya: MedyaDto; tur: SohbetMesajiDto["tur"] }) {
  const adres = `/api/medya/${medya.id}`;
  const ad = MESAJ_TUR_ADLARI[tur];
  if (medya.durum !== "indirildi" || !medya.gorunum) {
    return (
      <div className="mb-1 rounded-md bg-segment px-2 py-1 text-xs text-metin-ikincil">
        [{ad}] {medya.neden ?? "görüntülenemiyor, telefondan bakın"}
      </div>
    );
  }
  if (medya.gorunum === "gorsel") {
    return (
      <a href={adres} target="_blank" rel="noopener" className="mb-1 block" title="Büyük boyutta aç">
        {/* eslint-disable-next-line @next/next/no-img-element -- oturumlu API'den gelen dosya; next/image optimizasyonu kullanılmaz */}
        <img src={adres} alt={ad} loading="lazy" className="max-h-72 max-w-full rounded-md" />
      </a>
    );
  }
  const indirme = (
    <a href={`${adres}?indir=1`} className="text-xs font-medium text-ana-koyu underline" download>
      {medya.gorunum === "ses" ? "Ses kaydını indir" : medya.gorunum === "video" ? "Videoyu indir" : (medya.dosyaAdi ?? "Belgeyi indir")}
      {/* Boyut bölünmez ("(193 B)" iki satıra ayrılmasın); uzun dosya adı kendi içinde kırılır. */}
      {medya.boyut !== null && <span className="whitespace-nowrap"> ({boyutYaz(medya.boyut)})</span>}
    </a>
  );
  if (medya.gorunum === "ses") {
    return (
      <div className="mb-1 flex flex-col gap-1">
        <audio controls preload="none" src={adres} className="w-64 max-w-full">
          {indirme}
        </audio>
        {indirme}
      </div>
    );
  }
  if (medya.gorunum === "video") {
    // 3GP'yi çoğu tarayıcı oynatamaz: indirme bağlantısı her zaman görünür.
    return (
      <div className="mb-1 flex flex-col gap-1">
        <video controls preload="metadata" playsInline src={adres} className="max-h-80 w-72 max-w-full rounded-md bg-black">
          {indirme}
        </video>
        {indirme}
      </div>
    );
  }
  return <div className="mb-1 rounded-md bg-segment px-2 py-1.5">{indirme}</div>;
}

/** Alıntı kutusu: yanıtlanan mesaj (tıklayınca ona kayar). */
function Alinti({ yanit, giden }: { yanit: NonNullable<SohbetMesajiDto["yanit"]>; giden: boolean }) {
  const kim = yanit.yon === "giden" ? "Siz" : yanit.yon === "gelen" ? "Müşteri" : null;
  const icerik = (
    <>
      {kim && <span className="block font-semibold text-ana-koyu">{kim}</span>}
      <span className="line-clamp-2 wrap-anywhere">{yanit.ozet}</span>
    </>
  );
  const sinif = `mb-1 block w-full rounded-md border-l-4 border-ana px-2 py-1 text-left text-xs text-metin-ikincil ${giden ? "bg-white/70" : "bg-zemin"}`;
  return yanit.id ? (
    <button
      type="button"
      className={sinif}
      onClick={() => document.getElementById(`mesaj-${yanit.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      title="Yanıtlanan mesaja git"
    >
      {icerik}
    </button>
  ) : (
    <div className={sinif}>{icerik}</div>
  );
}

/** Yanıtlanabilir: gelen mesaj ya da WhatsApp'a ulaşmış giden mesaj (wamid'i olan); tepki hariç. */
const yanitlanabilirMi = (m: SohbetMesajiDto) =>
  m.tur !== "reaction" && (m.yon === "gelen" || Boolean(m.teslimDurumu && !["failed", "belirsiz"].includes(m.teslimDurumu)));

/** WhatsApp biçimlendirmesi: *kalın*, _italik_, ~üstü çizili~, ```kod```. Metin React düğümü olarak (HTML değil). */
export function WhatsappMetni({ metin }: { metin: string }) {
  const parcalar = metin.split(/(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return (
    <>
      {parcalar.map((p, i) => {
        if (p.length > 6 && p.startsWith("```") && p.endsWith("```")) return <code key={i} className="font-mono text-ufak">{p.slice(3, -3)}</code>;
        if (p.length > 2 && /\S/.test(p.slice(1, -1))) {
          if (p.startsWith("*") && p.endsWith("*")) return <strong key={i}>{p.slice(1, -1)}</strong>;
          if (p.startsWith("_") && p.endsWith("_")) return <em key={i}>{p.slice(1, -1)}</em>;
          if (p.startsWith("~") && p.endsWith("~")) return <s key={i}>{p.slice(1, -1)}</s>;
        }
        return p;
      })}
    </>
  );
}

/**
 * Giden şablon iletisi (kampanya / şablon gönder): sohbet balonu gibi; başlık görseli küçük resim (yoksa yer tutucu),
 * biçimlendirilmiş gövde, gri alt bilgi ve butonlar ayrı satırlar. Metin lib/gelen-kutusu sablonParcala ile ayrılır.
 */
function SablonIletisi({ metin, gorsel }: { metin: string; gorsel: string | null }) {
  const p = sablonParcala(metin);
  return (
    <div className="flex flex-col gap-1.5">
      {p.baslikMedyasi === "Görsel" &&
        (gorsel ? (
          <a href={gorsel} target="_blank" rel="noopener" className="block" title="Büyük boyutta aç">
            {/* eslint-disable-next-line @next/next/no-img-element -- oturumlu API'den gelen dosya; next/image optimizasyonu kullanılmaz */}
            <img src={gorsel} alt="Kampanya görseli" loading="lazy" className="max-h-48 w-full max-w-72 rounded-md object-cover" />
          </a>
        ) : (
          <div className="rounded-md bg-segment px-2 py-3 text-center text-xs text-metin-ikincil">Görsel</div>
        ))}
      {p.baslikMedyasi && p.baslikMedyasi !== "Görsel" && (
        <div className="rounded-md bg-segment px-2 py-1 text-xs text-metin-ikincil">{p.baslikMedyasi}</div>
      )}
      {p.baslik && <p className="font-semibold wrap-anywhere">{p.baslik}</p>}
      {p.govde && (
        <p className="wrap-anywhere whitespace-pre-wrap">
          <WhatsappMetni metin={p.govde} />
        </p>
      )}
      {p.altbilgi && <p className="text-xs wrap-anywhere text-soluk">{p.altbilgi}</p>}
      {p.butonlar.length > 0 && (
        <ul aria-label="Şablon butonları" className="-mx-3 mt-1 border-t border-black/10">
          {p.butonlar.map((b, i) => (
            <li key={i} className="border-b border-black/10 px-3 py-1.5 text-center text-ufak font-medium text-ana-koyu last:border-b-0">
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Balon({
  m,
  sohbetId,
  onSohbetAc,
  onYanitla,
  onTekrar,
}: {
  m: SohbetMesajiDto;
  sohbetId: string;
  onSohbetAc: (id: string) => void;
  onYanitla?: (m: SohbetMesajiDto) => void;
  onTekrar: (m: SohbetMesajiDto) => Promise<void>;
}) {
  const giden = m.yon === "giden";
  const etiket = kaynakEtiketi(m);
  const medya = MEDYA_TURLERI.includes(m.tur);
  const [deneniyor, setDeneniyor] = useState(false);
  // Belgede Meta başlık yoksa dosya adını metin olarak verir: indirme bağlantısında zaten görünür.
  const metin = m.medya?.dosyaAdi && m.metin === m.medya.dosyaAdi ? null : m.metin;
  return (
    <div id={`mesaj-${m.id}`} className={`group flex items-center gap-1 ${giden ? "flex-row-reverse" : ""}`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${giden ? "bg-ana-acik" : "bg-white"}`}>
        {etiket && <div className="mb-0.5 text-xs font-semibold text-ana-koyu">{etiket}</div>}
        {m.yanit && <Alinti yanit={m.yanit} giden={giden} />}
        {m.medya ? (
          <MedyaGosterimi medya={m.medya} tur={m.tur} />
        ) : (
          medya && (
            <div className="mb-1 rounded-md bg-segment px-2 py-1 text-xs text-metin-ikincil">
              [{MESAJ_TUR_ADLARI[m.tur]}] görüntülenemiyor, telefondan bakın
            </div>
          )
        )}
        {m.icerikSilindi ? (
          <p className="text-soluk italic">İçerik saklama süresi doldu</p>
        ) : m.tur === "template" && metin ? (
          <SablonIletisi metin={metin} gorsel={m.sablonGorseli ?? null} />
        ) : metin ? (
          // Gelen mesajdaki Türkiye cep numaraları tıklanabilir (Kayıtlarda aç / Kişi olarak ekle / Şablon gönder / Kopyala).
          <p className="wrap-anywhere whitespace-pre-wrap">{giden ? metin : <NumaraliMetin metin={metin} sohbetId={sohbetId} onSohbetAc={onSohbetAc} />}</p>
        ) : !medya ? (
          <p className="text-soluk italic">[{MESAJ_TUR_ADLARI[m.tur]}]</p>
        ) : null}
        {giden && m.teslimDurumu === "failed" && m.hataMetni && (
          <p role="alert" className="mt-1 rounded-md bg-tehlike-acik px-2 py-1 text-xs text-tehlike">
            {m.hataMetni}
          </p>
        )}
        <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-soluk">
          {m.tekrarDenenebilir && (
            <Dugme
              tur="metin"
              className="mr-auto"
              yukleniyor={deneniyor}
              onClick={async () => {
                setDeneniyor(true);
                await onTekrar(m);
                setDeneniyor(false);
              }}
            >
              Tekrar dene
            </Dugme>
          )}
          <span title={tarihYaz(m.tarih)}>{saatYaz(m.tarih)}</span>
          {giden && <TeslimIsareti m={m} />}
        </div>
      </div>
      {onYanitla && yanitlanabilirMi(m) && (
        <button
          type="button"
          className="dugme-ikon !size-8 rounded-full focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Yanıtla"
          title="Yanıtla"
          onClick={() => onYanitla(m)}
        >
          <Simge ad="yanitla" boyut={16} />
        </button>
      )}
    </div>
  );
}

/** Bekletilen gönderim (Geri al): metin ya da ekler; açıklama / metin ve yanıtlanan mesaj geri alınınca yerine konur. */
type BekleyenGonderim = { tur: "metin" | "ek"; metin: string; yanitlanan: SohbetMesajiDto | null };

/** Bekleyen gönderimin çubuğu: geri sayım, "Şimdi gönder" ve "Geri al". */
function GeriAlCubugu(props: { bekleyen: Bekleyen<BekleyenGonderim>; onGeriAl: () => void; onHemen: () => void }) {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    const z = setInterval(() => setSimdi(Date.now()), 250);
    return () => clearInterval(z);
  }, []);
  const kalan = Math.max(0, Math.ceil((props.bekleyen.bitis - simdi) / 1000));
  const v = props.bekleyen.veri;
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-ana bg-ana-acik px-3 py-2 text-ufak">
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-ana-koyu">
          {v.tur === "ek" ? "Dosyalar" : "Mesaj"} {kalan} sn içinde gönderilecek
        </span>
        {v.metin && <span className="block truncate text-metin-ikincil">{v.metin}</span>}
      </span>
      <button type="button" className="dugme-metin" onClick={props.onHemen}>
        Şimdi gönder
      </button>
      <button type="button" className="dugme dugme-kucuk" onClick={props.onGeriAl}>
        Geri al
      </button>
    </div>
  );
}

function YazmaAlani(props: {
  a: SohbetAyrintisi;
  pencereAcik: boolean;
  /** Gönderimi geri al süresi (0: kapalı, hemen gönderilir). */
  geriAlMs: number;
  onMesaj: (m: SohbetMesajiDto) => void;
  yanitlanan: SohbetMesajiDto | null;
  onYanitla: (m: SohbetMesajiDto) => void;
  onYanitIptal: () => void;
}) {
  const s = props.a.sohbet;
  const [metin, setMetin] = useState("");
  const [kimlik, setKimlik] = useState(yeniKimlik);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [sablonAcik, setSablonAcik] = useState(false);
  const [hazirAcik, setHazirAcik] = useState(false);
  const hazirPanel = useRef<HTMLDivElement>(null);
  const hazirDugme = useRef<HTMLButtonElement>(null);
  const hazirKapat = () => {
    setHazirAcik(false);
    yanitRef.current?.focus();
  };
  // Hazır cevap seçici dışarı tıklayınca da kapanır (Esc arama kutusunda zaten kapatır; başka yerdeyken de kapatır).
  useDisariTiklama(hazirAcik, [hazirPanel, hazirDugme], (neden) => (neden === "esc" ? hazirKapat() : setHazirAcik(false)));
  const [surukleniyor, setSurukleniyor] = useState(false);
  const yanitRef = useRef<HTMLTextAreaElement>(null);
  const ek = useEkler((m) => bildir(m, "hata"));
  const ekVar = ek.ekler.length > 0;
  const reddedilenVar = ek.ekler.some((e) => e.onHata);

  // Yanıtla seçilince yazma alanına odaklan.
  useEffect(() => {
    if (props.yanitlanan) yanitRef.current?.focus();
  }, [props.yanitlanan]);

  /**
   * Ekleri sırayla gönderir (her biri ayrı mesaj). İlk gönderimde açıklama ve yanıtlanan mesaj ilk dosyaya sabitlenir;
   * bir dosya gönderilemezse durulur (sıra bozulmasın), o dosyada "Tekrar dene" görünür.
   */
  const ekleriGonder = async (bekletilen?: { aciklama: string; yanitlananId: string | null }) => {
    const bekleyen = ek.ref.current.filter((e) => !e.onHata && e.durum !== "yukleniyor");
    if (!bekleyen.length) return;
    const ilk = bekleyen[0];
    if (ilk.aciklama === undefined) {
      // Geri al süresi dolunca: açıklama ve yanıtlanan, bekletmeye alınırken kaydedilenlerdir (yazı alanı boşaltılmıştı).
      const aciklama = bekletilen ? bekletilen.aciklama : metin.trim();
      const yanitlananId = bekletilen ? bekletilen.yanitlananId : (props.yanitlanan?.id ?? null);
      ek.guncelle(ilk.kimlik, { aciklama, yanitlananId });
      ilk.aciklama = aciklama;
      ilk.yanitlananId = yanitlananId;
      if (!bekletilen) {
        setMetin("");
        props.onYanitIptal();
      }
    }
    setGonderiliyor(true);
    for (const e of bekleyen) {
      ek.guncelle(e.kimlik, { durum: "yukleniyor", ilerleme: 0, hata: null });
      const y = await ekGonder(s.id, e, (oran) => ek.guncelle(e.kimlik, { ilerleme: oran }));
      if (!y.ok) {
        ek.guncelle(e.kimlik, { durum: "hata", hata: y.hata });
        break;
      }
      props.onMesaj(y.veri.mesaj);
      ek.kaldir(e.kimlik);
      // Meta reddetti: mesaj sohbette "Gönderilemedi" ve "Tekrar dene" ile görünür; kalanlar sırayı korumak için bekler.
      if (y.veri.uyari) {
        bildir(y.veri.uyari, "hata");
        break;
      }
    }
    setGonderiliyor(false);
  };

  const tekrarDene = (kimlik: string) => {
    // Hata olan dosya sıranın başına geçmez: bekleyenlerle birlikte sırayla yeniden gönderilir.
    ek.guncelle(kimlik, { durum: "hazir", hata: null });
    void ekleriGonder();
  };

  // Hazır cevap yanıt kutusuna konur (gönderilmez); imleç sona gider.
  const hazirCevapSec = (secilen: string) => {
    // {gonderen_numara}: bu sohbetin gönderen (işletme) numarası (ör. wa.me bağlantısı).
    const yeni = yanitaEkle(metin, hazirCevapDoldur(secilen, s.gonderenNumara));
    setMetin(yeni);
    setHazirAcik(false);
    requestAnimationFrame(() => {
      const t = yanitRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(yeni.length, yeni.length);
    });
  };

  const gonder = async (govde: Record<string, unknown>) => {
    setGonderiliyor(true);
    const y = await apiIstek<GonderimSonucu>(`/api/sohbetler/${s.id}/mesaj`, { method: "POST", govde: { ...govde, istemciKimligi: kimlik } });
    setGonderiliyor(false);
    if (!y.ok) {
      bildir(y.hata, "hata");
      return false;
    }
    props.onMesaj(y.veri.mesaj);
    if (y.veri.uyari) bildir(y.veri.uyari, "hata");
    setKimlik(yeniKimlik());
    return true;
  };

  // --- Gönderimi geri al: bekleme yalnızca tarayıcıda (lib/geri-al). Sayfa kapanır ya da bağlantı koparsa gitmez;
  // uygulama içinde başka sohbete / sayfaya geçilince bekleyen hemen gönderilir (yazılan kaybolmasın).
  const [bekleyen, setBekleyen] = useState<Bekleyen<BekleyenGonderim> | null>(null);
  const bekleyeniGonder = useRef<(v: BekleyenGonderim) => void>(() => {});
  const gonderici = useRef<GecikmeliGonderici<BekleyenGonderim> | null>(null);
  const { geriAlMs } = props;
  useEffect(() => {
    const g = gecikmeliGonderici<BekleyenGonderim>({ sureMs: geriAlMs, gonder: (v) => bekleyeniGonder.current(v), degisti: setBekleyen });
    gonderici.current = g;
    // Sohbetten / sayfadan uygulama içinde çıkılınca bekleyen hemen gönderilir.
    return () => g.hemen();
  }, [geriAlMs]);
  const geriKoy = (v: BekleyenGonderim) => {
    setMetin((m) => (m.trim() ? `${v.metin}
${m}` : v.metin));
    if (v.yanitlanan) props.onYanitla(v.yanitlanan);
  };
  useEffect(() => {
    bekleyeniGonder.current = (v) => {
      if (!navigator.onLine) {
        geriKoy(v);
        bildir("Bağlantı yok: mesaj gönderilmedi, yazı alanına geri kondu.", "hata");
        return;
      }
      if (v.tur === "ek") return void ekleriGonder({ aciklama: v.metin, yanitlananId: v.yanitlanan?.id ?? null });
      void gonder({ tur: "metin", metin: v.metin, yanitlananId: v.yanitlanan?.id ?? null }).then((tamam) => {
        if (!tamam) geriKoy(v);
      });
    };
  });
  const geriAl = () => {
    const v = gonderici.current?.geriAl();
    if (!v) return;
    geriKoy(v);
    requestAnimationFrame(() => yanitRef.current?.focus());
  };
  /** Gönder: geri al açıksa bekletmeye alınır, yazı alanı ve yanıt kutusu boşalır. */
  const bekletVeyaGonder = (v: BekleyenGonderim) => {
    const g = gonderici.current;
    if (!g) return;
    setMetin("");
    props.onYanitIptal();
    g.baslat(v);
  };

  if (s.numaraKilitli) {
    return <p className="border-t border-cizgi bg-tehlike-acik px-4 py-3 text-sm text-tehlike">{s.numaraKilitli}</p>;
  }

  const retUyarisi = s.retVerdi && (
    <p role="alert" className="border-t border-tehlike-kenar bg-tehlike-acik px-4 py-2 text-sm font-semibold text-tehlike">
      {RET_UYARISI}
    </p>
  );

  if (!props.pencereAcik) {
    if (s.retVerdi) {
      return (
        <p className="border-t border-cizgi bg-tehlike-acik px-4 py-3 text-sm text-tehlike">
          RET verdi; yalnızca kendisi yazarsa 24 saat içinde yanıt verebilirsiniz.
        </p>
      );
    }
    if (s.izin !== "var") {
      return (
        <p className="border-t border-cizgi bg-uyari-acik px-4 py-3 text-sm text-uyari">
          24 saatlik pencere kapalı ve bu kişinin WhatsApp izni yok: şablon da gönderilemez. Kişi yeniden yazarsa 24 saat
          içinde yanıt verebilirsiniz; sohbette pazarlama iletisi istediyse yandaki &quot;Pazarlama izni istedi&quot; ile kaydedin.
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-2 border-t border-cizgi p-4">
        <p className="text-sm text-uyari">24 saatlik pencere kapalı; serbest metin gönderilemez. Onaylı bir şablon seçin.</p>
        <SablonSecici a={props.a} gonderiliyor={gonderiliyor} onGonder={(g) => gonder({ tur: "sablon", ...g })} />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {retUyarisi}
      <form
        className="flex flex-col gap-2 border-t border-cizgi p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (gonderiliyor) return;
          if (ekVar) {
            if (reddedilenVar) return bildir("Gönderilemeyen dosyaları kaldırın.", "hata");
            if (metin.trim().length > ACIKLAMA_AZAMI) return bildir(`Açıklama en fazla ${ACIKLAMA_AZAMI} karakter olabilir.`, "hata");
            if (props.geriAlMs > 0) return bekletVeyaGonder({ tur: "ek", metin: metin.trim(), yanitlanan: props.yanitlanan });
            return void ekleriGonder();
          }
          if (!metin.trim()) return;
          if (props.geriAlMs > 0) return bekletVeyaGonder({ tur: "metin", metin, yanitlanan: props.yanitlanan });
          if (await gonder({ tur: "metin", metin, yanitlananId: props.yanitlanan?.id ?? null })) {
            setMetin("");
            props.onYanitIptal();
          }
        }}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes("Files")) return;
          e.preventDefault();
          setSurukleniyor(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurukleniyor(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setSurukleniyor(false);
          ek.ekle([...e.dataTransfer.files]);
        }}
      >
        {bekleyen && <GeriAlCubugu bekleyen={bekleyen} onGeriAl={geriAl} onHemen={() => gonderici.current?.hemen()} />}
        {surukleniyor && (
          <p className="rounded-lg border-2 border-dashed border-ana bg-ana-acik px-3 py-4 text-center text-sm font-medium text-ana-koyu">
            Dosyaları buraya bırakın
          </p>
        )}
        {props.yanitlanan && (
          <div className="flex items-start gap-2 rounded-md border-l-4 border-ana bg-zemin px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-ana-koyu">Yanıtlanıyor: {props.yanitlanan.yon === "giden" ? "Siz" : "Müşteri"}</span>
              <p className="line-clamp-2 wrap-anywhere text-metin-ikincil">{mesajOzeti(props.yanitlanan)}</p>
            </div>
            <button type="button" className="dugme-ikon !size-7" aria-label="Yanıtı iptal et" onClick={props.onYanitIptal}>
              <Simge ad="kapat" boyut={14} />
            </button>
          </div>
        )}
        <EkSeridi ekler={ek.ekler} gonderiliyor={gonderiliyor} onKaldir={ek.kaldir} onTekrar={tekrarDene} />
        {hazirAcik && (
          <div ref={hazirPanel}>
            <HazirCevapSecici onSec={hazirCevapSec} onKapat={hazirKapat} />
          </div>
        )}
        <textarea
          ref={yanitRef}
          className="girdi min-h-20"
          aria-label={ekVar ? "Açıklama (ilk dosyaya eklenir)" : "Yanıtınız"}
          placeholder={ekVar ? `Açıklama (isteğe bağlı, en fazla ${ACIKLAMA_AZAMI} karakter; ilk dosyaya eklenir)` : "Yanıtınızı yazın"}
          value={metin}
          maxLength={ekVar ? ACIKLAMA_AZAMI : YANIT_AZAMI}
          onChange={(e) => setMetin(e.target.value)}
          onPaste={(e) => {
            const dosyalar = panoDosyalari(e.clipboardData);
            if (!dosyalar.length) return;
            e.preventDefault();
            ek.ekle(dosyalar);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          onFocus={(e) => gonderGorunsun(e.currentTarget.form)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-soluk">
            Pencere {s.pencereBitis ? `${tarihYaz(s.pencereBitis)} tarihine kadar açık` : "kapalı"}
            {/* Telefonda klavye açıkken Gönder yazma alanının hemen altında kalsın: masaüstü ipuçları gizli. */}
            <span className="max-sm:hidden"> · Enter gönderir, Shift+Enter satır · Dosyayı sürükleyip bırakabilir ya da yapıştırabilirsiniz</span>
          </span>
          <div className="flex flex-wrap gap-2">
            <EkDugmesi disabled={gonderiliyor} onDosyalar={ek.ekle} />
            <button ref={hazirDugme} type="button" className="dugme-kucuk" aria-expanded={hazirAcik} onClick={() => setHazirAcik((x) => !x)}>
              {hazirAcik ? "Hazır cevabı kapat" : "Hazır cevap"}
            </button>
            {s.izin === "var" && (
              <button type="button" className="dugme-kucuk" onClick={() => setSablonAcik((x) => !x)}>
                {sablonAcik ? "Şablonu kapat" : "Şablon gönder"}
              </button>
            )}
            <Dugme type="submit" tur="ana" yukleniyor={gonderiliyor} disabled={ekVar ? reddedilenVar : !metin.trim()}>
              {ekVar ? `Gönder (${ek.ekler.filter((e) => !e.onHata).length} dosya)` : "Gönder"}
            </Dugme>
          </div>
        </div>
      </form>
      {sablonAcik && s.izin === "var" && (
        <div className="border-t border-cizgi p-4">
          <SablonSecici a={props.a} gonderiliyor={gonderiliyor} onGonder={(g) => gonder({ tur: "sablon", ...g })} />
        </div>
      )}
    </div>
  );
}

function SablonSecici(props: { a: SohbetAyrintisi; gonderiliyor: boolean; onGonder: (g: { sablonId: string; degiskenler: Record<string, string> }) => Promise<boolean> }) {
  const [sablonId, setSablonId] = useState("");
  const [degerler, setDegerler] = useState<Record<string, string>>({});
  const sablon = props.a.sablonlar.find((x) => x.id === sablonId) ?? null;
  if (!props.a.sablonlar.length) {
    return <p className="text-sm text-soluk">Bu numaranın WhatsApp hesabında kullanılabilir şablon yok (Ayarlar → WhatsApp → Şablonları yenile).</p>;
  }
  const eksik = sablon ? sablon.degiskenler.some((d) => !degerler[degiskenAnahtari(d)]?.trim()) : true;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!sablon || eksik) return;
        if (await props.onGonder({ sablonId: sablon.id, degiskenler: degerler })) {
          setSablonId("");
          setDegerler({});
        }
      }}
    >
      <label className="etiket">
        Şablon
        <select className="girdi" value={sablonId} onChange={(e) => (setSablonId(e.target.value), setDegerler({}))}>
          <option value="">Seçin</option>
          {props.a.sablonlar.map((x) => (
            <option key={x.id} value={x.id}>
              {x.ad} ({x.dil}, {x.kategori})
            </option>
          ))}
        </select>
      </label>
      {sablon?.degiskenler.map((d) => {
        const k = degiskenAnahtari(d);
        return (
          <label key={k} className="etiket">
            {d.bilesen === "header" ? "Başlık" : "Gövde"} değişkeni {`{{${d.ad}}}`}
            <input className="girdi" maxLength={1000} value={degerler[k] ?? ""} onChange={(e) => setDegerler({ ...degerler, [k]: e.target.value })} />
          </label>
        );
      })}
      {sablon && (
        <div className="rounded-lg bg-zemin p-3 text-sm whitespace-pre-wrap" aria-label="Önizleme">
          {sablonMetni(sablon.bilesenler, degerler)}
        </div>
      )}
      <button type="submit" className="dugme-ana self-end" disabled={!sablon || eksik || props.gonderiliyor}>
        Şablonu gönder
      </button>
    </form>
  );
}

function Notlar(props: { sohbetId: string; notlar: SohbetNotuDto[]; onNotlar: (n: SohbetNotuDto[]) => void }) {
  const [metin, setMetin] = useState("");
  return (
    <aside className="kart flex flex-col gap-3" aria-label="İç notlar">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Simge ad="kilit" boyut={16} /> İç notlar
      </h2>
      <p className="text-xs text-soluk">Yalnızca ekibiniz görür; müşteriye gitmez.</p>
      {props.notlar.length ? (
        <ul className="flex flex-col gap-2">
          {props.notlar.map((n) => (
            <li key={n.id} className="rounded-lg bg-zemin p-2 text-ufak">
              <p className="wrap-anywhere whitespace-pre-wrap">{n.metin}</p>
              <p className="mt-1 text-xs text-soluk">
                {n.kullanici ?? "Silinmiş kullanıcı"} · {tarihYaz(n.tarih)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ufak text-soluk">Henüz not yok.</p>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!metin.trim()) return;
          const y = await apiIstek<{ notlar: SohbetNotuDto[] }>(`/api/sohbetler/${props.sohbetId}/notlar`, { method: "POST", govde: { metin } });
          if (!y.ok) return bildir(y.hata, "hata");
          props.onNotlar(y.veri.notlar);
          setMetin("");
        }}
      >
        <textarea className="girdi min-h-16" aria-label="Yeni not" maxLength={NOT_AZAMI} value={metin} onChange={(e) => setMetin(e.target.value)} />
        <button type="submit" className="dugme-kucuk self-end" disabled={!metin.trim()}>
          Not ekle
        </button>
      </form>
    </aside>
  );
}
