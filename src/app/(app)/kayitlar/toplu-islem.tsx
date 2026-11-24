"use client";
// Kayıtlar listesinde toplu işlem çubuğu (yalnızca yönetici görür; sunucu da 403 verir): seçili kayıt sayısı,
// "filtreye uyan tümünü seç", işlem (etiket ekle / kaldır, alıcı türü) ve onay penceresi. Sonuç özeti (kaç kayıt
// değişti, kaçı neden atlandı) üst bileşende gösterilir. Pencere document.body'ye taşınır (ret-onayi.tsx ile aynı).
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { apiIstek } from "@/lib/api-istemci";
import { sayiYaz } from "@/lib/bicim";
import { ALICI_TURLERI, ALICI_TURU_ADLARI, type AliciTuru } from "@/lib/mesajlasma";
import { TOPLU_ATLAMA_NEDENLERI, type TopluAtlamaNedeni } from "@/lib/sabitler";
import type { TopluSonuc } from "@/server/repo/kayitlar";

export type TopluSecimGovdesi = { tur: "idler"; idler: string[] } | { tur: "filtre"; sorgu: string; beklenenToplam: number };

type IslemTuru = "etiket_ekle" | "etiket_kaldir" | "alici_turu";
const ISLEM_ADLARI: Record<IslemTuru, string> = {
  etiket_ekle: "Etiket ekle",
  etiket_kaldir: "Etiket kaldır",
  alici_turu: "Alıcı türünü değiştir",
};

const ATLAMA_ADLARI: Record<TopluAtlamaNedeni, string> = {
  ayni: "zaten aynıydı",
  ret: "RET vermiş",
  engelli: "engel listesinde",
  meta_reklam: "Meta reklamından gelen bireysel kişi (tek tek, açıklamayla değiştirilir)",
  etiket_siniri: "etiket sınırı (20) dolu",
};

/** "12 kayıt değişti. 3 kayıt atlandı: 2 RET vermiş, 1 engel listesinde." */
export function topluOzetMetni(s: TopluSonuc): string {
  const nedenler = TOPLU_ATLAMA_NEDENLERI.filter((n) => s.atlanan[n] > 0);
  const atlanan = nedenler.reduce((t, n) => t + s.atlanan[n], 0) + s.bulunamayan;
  const parcalar = [
    ...nedenler.map((n) => `${sayiYaz(s.atlanan[n])} ${ATLAMA_ADLARI[n]}`),
    ...(s.bulunamayan ? [`${sayiYaz(s.bulunamayan)} bulunamadı (silinmiş)`] : []),
  ];
  return `${sayiYaz(s.degisen)} kayıt değişti.${atlanan ? ` ${sayiYaz(atlanan)} kayıt atlandı: ${parcalar.join(", ")}.` : ""}`;
}

const bosAbone = () => () => {};

export function TopluIslemCubugu(props: {
  /** Seçili kayıt sayısı ("filtreye uyan tümü" seçiliyse filtrenin toplamı). */
  sayi: number;
  tumFiltre: boolean;
  /** "Filtreye uyan tümünü seç" önerilsin mi (filtrede seçilenden fazla kayıt var). */
  tumunuOner: boolean;
  toplam: number;
  etiketler: string[];
  secim: TopluSecimGovdesi;
  onTumFiltreSec: () => void;
  onTemizle: () => void;
  onTamam: (sonuc: TopluSonuc) => void;
  /** 409: filtreye uyan sayı değişti; liste yenilenir. */
  onSayiDegisti: () => void;
}) {
  const [tur, setTur] = useState<IslemTuru>("etiket_ekle");
  const [etiket, setEtiket] = useState("");
  const [aliciTuru, setAliciTuru] = useState<AliciTuru | "">("");
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const pencere = useRef<HTMLDialogElement>(null);
  const baslikId = useId();
  const listeId = useId();
  const tarayicida = useSyncExternalStore(bosAbone, () => true, () => false);

  // Sunucu ve tek kayıt düzenlemesiyle aynı biçim (trim + küçük harf).
  const temizEtiket = etiket.trim().toLowerCase();
  const hazir = tur === "alici_turu" ? aliciTuru !== "" : temizEtiket.length > 0 && temizEtiket.length <= 40;
  const n = sayiYaz(props.sayi);
  const onayMetni =
    tur === "etiket_ekle"
      ? `${n} kayda "${temizEtiket}" etiketi eklenecek.`
      : tur === "etiket_kaldir"
        ? `${n} kayıttan "${temizEtiket}" etiketi kaldırılacak.`
        : `${n} kaydın alıcı türü "${aliciTuru ? ALICI_TURU_ADLARI[aliciTuru] : ""}" olarak değiştirilecek.`;

  async function uygula() {
    pencere.current?.close();
    setGonderiliyor(true);
    setHata(null);
    const islem = tur === "alici_turu" ? { tur, aliciTuru } : { tur, etiket: temizEtiket };
    const y = await apiIstek<{ sonuc: TopluSonuc }>("/api/kayitlar/toplu", { method: "POST", govde: { secim: props.secim, islem } });
    setGonderiliyor(false);
    if (y.ok) {
      setEtiket("");
      props.onTamam(y.veri.sonuc);
      return;
    }
    setHata(y.hata);
    if (y.durum === 409) props.onSayiDegisti();
  }

  return (
    <div role="region" aria-label="Toplu işlem" className="flex flex-col gap-2 border-b border-cizgi bg-[#f1f7f5] px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="font-semibold" aria-live="polite">
          {props.tumFiltre ? `Filtreye uyan tüm kayıtlar seçili (${n} kayıt)` : `${n} kayıt seçili`}
        </span>
        {props.tumunuOner && (
          <button type="button" className="font-medium text-ana underline-offset-2 hover:underline" onClick={props.onTumFiltreSec}>
            Filtreye uyan tümünü seç ({sayiYaz(props.toplam)} kayıt)
          </button>
        )}
        <button type="button" className="text-soluk underline-offset-2 hover:underline" onClick={props.onTemizle}>
          Seçimi kaldır
        </button>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (hazir && !gonderiliyor) pencere.current?.showModal();
        }}
      >
        <label className="etiket">
          İşlem
          <select className="girdi" value={tur} onChange={(e) => setTur(e.target.value as IslemTuru)}>
            {(Object.keys(ISLEM_ADLARI) as IslemTuru[]).map((t) => (
              <option key={t} value={t}>
                {ISLEM_ADLARI[t]}
              </option>
            ))}
          </select>
        </label>
        {tur === "alici_turu" ? (
          <label className="etiket">
            Yeni alıcı türü
            <select className="girdi" value={aliciTuru} onChange={(e) => setAliciTuru(e.target.value as AliciTuru | "")}>
              <option value="">Seçin</option>
              {ALICI_TURLERI.map((a) => (
                <option key={a} value={a}>
                  {ALICI_TURU_ADLARI[a]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="etiket">
            Etiket
            <input className="girdi" list={listeId} value={etiket} maxLength={40} onChange={(e) => setEtiket(e.target.value)} />
            <datalist id={listeId}>
              {props.etiketler.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </label>
        )}
        <button type="submit" className="dugme-ana" disabled={!hazir || gonderiliyor}>
          {gonderiliyor ? "Uygulanıyor…" : "Uygula"}
        </button>
      </form>
      {tur === "alici_turu" && (
        <p className="text-xs text-soluk">RET vermiş ve engel listesindeki kayıtlar atlanır. WhatsApp izni ve ret bilgileri değişmez.</p>
      )}
      {hata && (
        <p role="alert" className="text-sm text-tehlike">
          {hata}
        </p>
      )}
      {tarayicida &&
        createPortal(
          <dialog
            ref={pencere}
            aria-labelledby={baslikId}
            className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-kenar bg-white p-5 text-sm shadow-lg backdrop:bg-black/40"
          >
            <div className="flex flex-col gap-3">
              <h2 id={baslikId} className="text-base font-semibold">
                Toplu işlem: {ISLEM_ADLARI[tur]}
              </h2>
              <p>{onayMetni}</p>
              {tur === "alici_turu" && <p className="text-soluk">RET vermiş ve engel listesindeki kayıtlara dokunulmaz.</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="dugme" autoFocus onClick={() => pencere.current?.close()}>
                  Vazgeç
                </button>
                <button type="button" className="dugme-ana" onClick={uygula}>
                  Onayla
                </button>
              </div>
            </div>
          </dialog>,
          document.body,
        )}
    </div>
  );
}
