"use client";
// Gelen kutusu yazma alanının dosya ekleri: ataş menüsü (Fotoğraf/Video, Belge; çoklu seçim), sürükle-bırak ve panodan
// yapıştırma (ekran görüntüsü). Göndermeden önce önizleme şeridi (küçük resim / dosya adı + boyut, tek tek kaldırma).
// Tür ve boyut yüklemeden önce denetlenir (lib/gelen-kutusu gidenMedyaOnKontrol; sunucu içerikten ayrıca doğrular).
// Gönderim: her dosya ayrı mesaj, sırayla (/api/sohbetler/[id]/medya); yükleme ilerlemesi XHR ile; hata olan dosyada
// "Tekrar dene" (aynı istemci kimliğiyle: sunucu ikinci kez göndermez).
import { useEffect, useRef, useState } from "react";
import { Simge } from "@/components/arayuz/simge";
import { boyutYaz } from "@/lib/bicim";
import { useDisariTiklama } from "@/lib/disari-tiklama";
import {
  BELGE_ACCEPT,
  EK_AZAMI,
  GORSEL_VIDEO_ACCEPT,
  gidenMedyaOnKontrol,
  type GidenMedyaTuru,
} from "@/lib/gelen-kutusu";
import type { GonderimSonucu } from "@/server/servisler/gelen-kutusu";

export type Ek = {
  kimlik: string;
  istemciKimligi: string;
  dosya: File;
  tur: GidenMedyaTuru | null;
  onizleme: string | null;
  /** Yüklemeden önce reddedildi (tür / boyut): gönderilemez, yalnızca kaldırılır. */
  onHata: string | null;
  durum: "hazir" | "yukleniyor" | "hata";
  ilerleme: number;
  hata: string | null;
  /** Gönderim başlayınca sabitlenir: ilk dosyanın açıklaması ve yanıtlanan mesajı (yeniden denemede aynı kalır). */
  aciklama?: string;
  yanitlananId?: string | null;
};

const yeniKimlik = () => crypto.randomUUID().replace(/-/g, "");

export function ekOlustur(dosya: File): Ek {
  const k = gidenMedyaOnKontrol(dosya.name || "dosya", dosya.size);
  const tur = k.tamam ? k.tur : null;
  return {
    kimlik: yeniKimlik(),
    istemciKimligi: yeniKimlik(),
    dosya,
    tur,
    onizleme: tur === "image" || tur === "video" ? URL.createObjectURL(dosya) : null,
    onHata: k.tamam ? null : k.hata,
    durum: "hazir",
    ilerleme: 0,
    hata: null,
  };
}

const ISTANBUL_ZAMANI = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Yapıştırılan ekran görüntüsünün adı, yerel saatle (Europe/Istanbul): "ekran-goruntusu-2026-11-25-16-17-01.png". */
export const panoDosyaAdi = (zaman: Date) => `ekran-goruntusu-${ISTANBUL_ZAMANI.format(zaman).replace(/[ :]/g, "-")}.png`;

/** Panodan yapıştırılan ekran görüntüsünün adı çoğu tarayıcıda "image.png": zamanla (İstanbul saati) ayırt edilir. */
export function panoDosyalari(veri: DataTransfer | null, simdi = new Date()): File[] {
  if (!veri) return [];
  return [...veri.files].map((f) => (f.name && f.name !== "image.png" ? f : new File([f], panoDosyaAdi(simdi), { type: f.type })));
}

type Yanit = { ok: true; veri: GonderimSonucu } | { ok: false; hata: string };

/** Dosyayı ilerlemeyle gönderir (fetch yükleme ilerlemesi vermez). */
export function ekGonder(sohbetId: string, ek: Ek, ilerleme: (oran: number) => void): Promise<Yanit> {
  return new Promise((coz) => {
    const form = new FormData();
    form.set("dosya", ek.dosya, ek.dosya.name || "dosya");
    form.set("istemciKimligi", ek.istemciKimligi);
    if (ek.aciklama) form.set("aciklama", ek.aciklama);
    if (ek.yanitlananId) form.set("yanitlananId", ek.yanitlananId);
    const x = new XMLHttpRequest();
    x.open("POST", `/api/sohbetler/${sohbetId}/medya`);
    x.responseType = "json";
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) ilerleme(e.loaded / e.total);
    };
    x.onload = () => {
      const govde = x.response as (GonderimSonucu & { hata?: string }) | null;
      if (x.status >= 200 && x.status < 300 && govde?.mesaj) coz({ ok: true, veri: govde });
      else coz({ ok: false, hata: govde?.hata ?? (x.status === 413 ? "Dosya çok büyük." : `Gönderilemedi (HTTP ${x.status}).`) });
    };
    x.onerror = () => coz({ ok: false, hata: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin." });
    x.send(form);
  });
}

/** Ek listesi: ekleme (en fazla EK_AZAMI), kaldırma, güncelleme; önizleme adresleri bırakılır. */
export function useEkler(uyari: (metin: string) => void) {
  const [ekler, setEkler] = useState<Ek[]>([]);
  const ref = useRef(ekler);
  useEffect(() => {
    ref.current = ekler;
  }, [ekler]);
  useEffect(() => () => ref.current.forEach((e) => e.onizleme && URL.revokeObjectURL(e.onizleme)), []);

  const ekle = (dosyalar: File[]) => {
    if (!dosyalar.length) return;
    const yer = EK_AZAMI - ref.current.length;
    if (yer <= 0) return uyari(`En fazla ${EK_AZAMI} dosya eklenebilir.`);
    if (dosyalar.length > yer) uyari(`En fazla ${EK_AZAMI} dosya eklenebilir; ilk ${yer} dosya eklendi.`);
    setEkler((o) => [...o, ...dosyalar.slice(0, yer).map(ekOlustur)]);
  };
  const kaldir = (kimlik: string) =>
    setEkler((o) => {
      const e = o.find((x) => x.kimlik === kimlik);
      if (e?.onizleme) URL.revokeObjectURL(e.onizleme);
      return o.filter((x) => x.kimlik !== kimlik);
    });
  const guncelle = (kimlik: string, d: Partial<Ek>) => setEkler((o) => o.map((x) => (x.kimlik === kimlik ? { ...x, ...d } : x)));
  return { ekler, ref, ekle, kaldir, guncelle };
}

/** Ataş düğmesi: Fotoğraf/Video (telefonda kamera / galeri) ve Belge; çoklu seçim. Dışarı tıklayınca / Esc ile kapanır. */
export function EkDugmesi(props: { disabled?: boolean; onDosyalar: (d: File[]) => void }) {
  const [acik, setAcik] = useState(false);
  const gorsel = useRef<HTMLInputElement>(null);
  const belge = useRef<HTMLInputElement>(null);
  const kok = useRef<HTMLDivElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  useDisariTiklama(acik, [kok], (neden) => {
    setAcik(false);
    if (neden === "esc") dugme.current?.focus();
  });
  const sec = (e: React.ChangeEvent<HTMLInputElement>) => {
    props.onDosyalar([...(e.target.files ?? [])]);
    e.target.value = "";
    setAcik(false);
  };
  return (
    <div ref={kok} className="relative">
      <button
        ref={dugme}
        type="button"
        className="dugme-kucuk"
        aria-haspopup="menu"
        aria-expanded={acik}
        disabled={props.disabled}
        onClick={() => setAcik((x) => !x)}
        title="Dosya ekle"
      >
        <Simge ad="atac" boyut={16} />
        <span className="sr-only sm:not-sr-only">Dosya ekle</span>
      </button>
      {acik && (
        <div role="menu" className="absolute bottom-full left-0 z-20 mb-1 flex min-w-44 flex-col rounded-lg border border-kenar bg-white p-1 text-sm shadow-yukselti">
          <button type="button" role="menuitem" className="rounded-md px-3 py-2 text-left hover:bg-uzerine-gelme active:bg-basili" onClick={() => gorsel.current?.click()}>
            Fotoğraf / Video
          </button>
          <button type="button" role="menuitem" className="rounded-md px-3 py-2 text-left hover:bg-uzerine-gelme active:bg-basili" onClick={() => belge.current?.click()}>
            Belge
          </button>
        </div>
      )}
      <input ref={gorsel} type="file" multiple accept={GORSEL_VIDEO_ACCEPT} className="hidden" onChange={sec} aria-label="Fotoğraf ya da video seç" />
      <input ref={belge} type="file" multiple accept={BELGE_ACCEPT} className="hidden" onChange={sec} aria-label="Belge seç" />
    </div>
  );
}

/** Önizleme şeridi: küçük resim ya da dosya adı + boyut, ilerleme, hata ve "Tekrar dene". */
export function EkSeridi(props: { ekler: Ek[]; gonderiliyor: boolean; onKaldir: (kimlik: string) => void; onTekrar: (kimlik: string) => void }) {
  if (!props.ekler.length) return null;
  return (
    <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Eklenen dosyalar">
      {props.ekler.map((e) => (
        <li
          key={e.kimlik}
          className={`relative flex w-36 shrink-0 flex-col gap-1 rounded-lg border p-1.5 text-xs ${e.onHata || e.durum === "hata" ? "border-tehlike-kenar bg-tehlike-acik" : "border-kenar bg-white"}`}
        >
          {e.tur === "image" && e.onizleme ? (
            // eslint-disable-next-line @next/next/no-img-element -- yerel önizleme (blob: adresi)
            <img src={e.onizleme} alt="" className="h-20 w-full rounded-md object-cover" />
          ) : e.tur === "video" && e.onizleme ? (
            <video src={e.onizleme} muted preload="metadata" className="h-20 w-full rounded-md bg-black object-cover" />
          ) : (
            <div className="flex h-20 items-center justify-center rounded-md bg-zemin px-1 text-center font-semibold text-metin-ikincil uppercase">
              {(e.dosya.name.split(".").pop() ?? "dosya").slice(0, 5)}
            </div>
          )}
          <span className="truncate font-medium" title={e.dosya.name}>
            {e.dosya.name || "dosya"}
          </span>
          <span className="text-soluk">{boyutYaz(e.dosya.size)}</span>
          {e.durum === "yukleniyor" && (
            <span className="h-1.5 overflow-hidden rounded-md bg-segment" role="progressbar" aria-valuenow={Math.round(e.ilerleme * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Yükleniyor">
              <span className="block h-full bg-ana transition-[width]" style={{ width: `${Math.round(e.ilerleme * 100)}%` }} />
            </span>
          )}
          {(e.onHata ?? e.hata) && (
            <span role="alert" className="text-tehlike">
              {e.onHata ?? e.hata}
            </span>
          )}
          {e.durum === "hata" && !e.onHata && (
            <button type="button" className="dugme-metin self-start" disabled={props.gonderiliyor} onClick={() => props.onTekrar(e.kimlik)}>
              Tekrar dene
            </button>
          )}
          {e.durum !== "yukleniyor" && (
            <button
              type="button"
              className="dugme-ikon absolute top-1 right-1 !size-7 rounded-full bg-white/90 ring-1 ring-kenar"
              aria-label={`Kaldır: ${e.dosya.name}`}
              onClick={() => props.onKaldir(e.kimlik)}
            >
              <Simge ad="kapat" boyut={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
