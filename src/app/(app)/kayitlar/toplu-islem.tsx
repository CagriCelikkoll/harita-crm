"use client";
// Kayıtlar listesinde toplu işlem çubuğu (yalnızca yönetici görür; sunucu da 403 verir): seçili kayıt sayısı,
// "filtreye uyan tümünü seç", işlem (etiket ekle / kaldır, alıcı türü, WhatsApp iznini kaydet) ve onay penceresi.
// WhatsApp izninde pencerede izin kaynağı ("Diğer" ise açıklama) ve beyan onay kutusu zorunludur. En fazla
// TOPLU_ISLEM_AZAMI kayıt: fazlası seçiliyse uyarı gösterilir, işlem başlatılamaz (sunucu da 400 verir). Sonuç özeti
// (kaç kayıt değişti, kaçı neden atlandı) üst bileşende gösterilir. Pencere document.body'ye taşınır (ret-onayi.tsx).
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { apiIstek } from "@/lib/api-istemci";
import { pencereDisinaTiklaninca } from "@/lib/disari-tiklama";
import { sayiYaz } from "@/lib/bicim";
import {
  ALICI_TURLERI,
  ALICI_TURU_ADLARI,
  TOPLU_IZIN_KAYNAKLARI,
  WHATSAPP_IZIN_KAYNAK_ADLARI,
  WHATSAPP_TOPLU_IZIN_BEYANI,
  type AliciTuru,
} from "@/lib/mesajlasma";
import { TOPLU_ATLAMA_NEDENLERI, TOPLU_ISLEM_AZAMI, TOPLU_ISLEM_SINIRI_METNI, type TopluAtlamaNedeni } from "@/lib/sabitler";
import type { TopluSonuc } from "@/server/repo/kayitlar";

export type TopluSecimGovdesi = { tur: "idler"; idler: string[] } | { tur: "filtre"; sorgu: string; beklenenToplam: number };

type IslemTuru = "etiket_ekle" | "etiket_kaldir" | "alici_turu" | "whatsapp_izni";
const ISLEM_ADLARI: Record<IslemTuru, string> = {
  etiket_ekle: "Etiket ekle",
  etiket_kaldir: "Etiket kaldır",
  alici_turu: "Alıcı türünü değiştir",
  whatsapp_izni: "WhatsApp iznini kaydet",
};
type IzinKaynagi = (typeof TOPLU_IZIN_KAYNAKLARI)[number];

const ATLAMA_ADLARI: Record<TopluAtlamaNedeni, string> = {
  ayni: "zaten aynıydı",
  ret: "RET vermiş",
  engelli: "engel listesinde",
  whatsapp_yok: "numarada WhatsApp yok (Meta bildirdi)",
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

/** Önizlemede "aynı" nedeninin işleme göre adı. */
const AYNI_ADLARI: Record<IslemTuru, string> = {
  etiket_ekle: "etiket zaten var",
  etiket_kaldir: "etiketi yok",
  alici_turu: "zaten bu türde",
  whatsapp_izni: "zaten izinli",
};
const DEGISIM_ADLARI: Record<IslemTuru, (n: string) => string> = {
  etiket_ekle: (n) => `${n} kayda eklenecek`,
  etiket_kaldir: (n) => `${n} kayıttan kaldırılacak`,
  alici_turu: (n) => `${n} kaydın türü değişecek`,
  whatsapp_izni: (n) => `${n} kayda kaydedilecek`,
};

/**
 * Onay penceresinin ön sayımı (sunucuda aynı kurallarla, hiçbir şey yazılmadan):
 * "4 seçili · 3 kayda kaydedilecek, 1 atlanacak: zaten izinli". Birden çok neden varsa sayılarıyla.
 */
export function onizlemeMetni(tur: IslemTuru, secili: number, s: TopluSonuc): string {
  const nedenler = TOPLU_ATLAMA_NEDENLERI.filter((n) => s.atlanan[n] > 0);
  const atlanan = nedenler.reduce((t, n) => t + s.atlanan[n], 0) + s.bulunamayan;
  const ad = (n: TopluAtlamaNedeni) => (n === "ayni" ? AYNI_ADLARI[tur] : ATLAMA_ADLARI[n]);
  const parcalar = [...nedenler.map((n) => ({ ad: ad(n), n: s.atlanan[n] })), ...(s.bulunamayan ? [{ ad: "bulunamadı (silinmiş)", n: s.bulunamayan }] : [])];
  const nedenMetni = parcalar.length === 1 ? parcalar[0].ad : parcalar.map((p) => `${sayiYaz(p.n)} ${p.ad}`).join(", ");
  return `${sayiYaz(secili)} seçili · ${DEGISIM_ADLARI[tur](sayiYaz(s.degisen))}${atlanan ? `, ${sayiYaz(atlanan)} atlanacak: ${nedenMetni}` : ""}.`;
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
  const [izinKaynagi, setIzinKaynagi] = useState<IzinKaynagi | "">("");
  const [izinAciklamasi, setIzinAciklamasi] = useState("");
  const [beyan, setBeyan] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  // Onay penceresinin ön sayımı (null: istenmedi / alınamadı → yalnızca seçili sayı gösterilir).
  const [onizleme, setOnizleme] = useState<{ durum: "yukleniyor" } | { durum: "tamam"; sonuc: TopluSonuc } | null>(null);
  const pencere = useRef<HTMLDialogElement>(null);
  const baslikId = useId();
  const listeId = useId();
  const tarayicida = useSyncExternalStore(bosAbone, () => true, () => false);

  // Sunucu ve tek kayıt düzenlemesiyle aynı biçim (trim + küçük harf).
  const temizEtiket = etiket.trim().toLowerCase();
  const sinirAsildi = props.sayi > TOPLU_ISLEM_AZAMI;
  const hazir =
    !sinirAsildi &&
    (tur === "whatsapp_izni" ? true : tur === "alici_turu" ? aliciTuru !== "" : temizEtiket.length > 0 && temizEtiket.length <= 40);
  // WhatsApp izni: kaynak, "Diğer" ise açıklama ve beyan onay penceresinde zorunlu.
  const izinHazir = izinKaynagi !== "" && (izinKaynagi !== "diger" || izinAciklamasi.trim().length > 0) && beyan;
  const degisecekYok = onizleme?.durum === "tamam" && onizleme.sonuc.degisen === 0;
  const onaylanabilir = (tur !== "whatsapp_izni" || izinHazir) && !degisecekYok;
  const n = sayiYaz(props.sayi);
  const islemGovdesi = () =>
    tur === "whatsapp_izni"
      ? { tur, kaynak: izinKaynagi, aciklama: izinAciklamasi.trim() || null, beyan }
      : tur === "alici_turu"
        ? { tur, aliciTuru }
        : { tur, etiket: temizEtiket };

  /** Pencere açılınca: kaç kaydın değişeceği / atlanacağı (sunucuda, yazmadan). */
  async function onizlemeAl() {
    setOnizleme({ durum: "yukleniyor" });
    const islem = tur === "whatsapp_izni" ? { tur } : islemGovdesi();
    const y = await apiIstek<{ sonuc: TopluSonuc }>("/api/kayitlar/toplu", { method: "POST", govde: { onizleme: true, secim: props.secim, islem } });
    if (y.ok) return setOnizleme({ durum: "tamam", sonuc: y.veri.sonuc });
    setOnizleme(null);
    if (y.durum === 409) {
      pencere.current?.close();
      setHata(y.hata);
      props.onSayiDegisti();
    }
  }
  // Ne yapılacağı; kaç kaydın değişeceği / atlanacağı altındaki önizlemede (sunucunun ön sayımı).
  const onayMetni =
    tur === "etiket_ekle"
      ? `"${temizEtiket}" etiketi eklenecek.`
      : tur === "etiket_kaldir"
        ? `"${temizEtiket}" etiketi kaldırılacak.`
        : tur === "whatsapp_izni"
          ? "WhatsApp izni kaydedilecek."
          : `Alıcı türü "${aliciTuru ? ALICI_TURU_ADLARI[aliciTuru] : ""}" olarak değiştirilecek.`;

  async function uygula() {
    if (!onaylanabilir) return;
    pencere.current?.close();
    setGonderiliyor(true);
    setHata(null);
    const y = await apiIstek<{ sonuc: TopluSonuc }>("/api/kayitlar/toplu", { method: "POST", govde: { secim: props.secim, islem: islemGovdesi() } });
    setGonderiliyor(false);
    if (y.ok) {
      setEtiket("");
      setIzinAciklamasi("");
      setBeyan(false);
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
          if (!hazir || gonderiliyor) return;
          setBeyan(false); // beyan her işlemde yeniden onaylanır
          pencere.current?.showModal();
          void onizlemeAl();
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
        {tur === "whatsapp_izni" ? null : tur === "alici_turu" ? (
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
      {tur === "whatsapp_izni" && (
        <p className="text-xs text-soluk">
          RET vermiş, engel listesinde, ileti reddi olan ve numarasında WhatsApp olmadığı bildirilen kayıtlar atlanır; izni zaten
          kayıtlı olanlara dokunulmaz. İYS beyanı değişmez. Kaynak ve beyan onay penceresinde istenir.
        </p>
      )}
      {sinirAsildi && (
        <p role="alert" className="text-sm text-uyari">
          {sayiYaz(props.sayi)} kayıt seçili. {TOPLU_ISLEM_SINIRI_METNI}
        </p>
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
            onClick={pencereDisinaTiklaninca}
            aria-labelledby={baslikId}
            className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-kenar bg-white p-5 text-sm shadow-lg backdrop:bg-black/40"
          >
            <div className="flex flex-col gap-3">
              <h2 id={baslikId} className="text-base font-semibold">
                Toplu işlem: {ISLEM_ADLARI[tur]}
              </h2>
              <p>{onayMetni}</p>
              <p role="status" aria-live="polite" className="rounded-md bg-ic-kutu px-3 py-2 font-medium">
                {onizleme?.durum === "tamam"
                  ? onizlemeMetni(tur, props.sayi, onizleme.sonuc)
                  : onizleme?.durum === "yukleniyor"
                    ? "Etkilenecek kayıtlar sayılıyor…"
                    : `${n} seçili.`}
              </p>
              {degisecekYok && <p className="text-uyari">Seçili kayıtlarda değişecek bir şey yok.</p>}
              {tur === "alici_turu" && <p className="text-soluk">RET vermiş ve engel listesindeki kayıtlara dokunulmaz.</p>}
              {tur === "whatsapp_izni" && (
                <>
                  <label className="etiket">
                    İzin kaynağı
                    <select
                      className="girdi"
                      required
                      value={izinKaynagi}
                      onChange={(e) => setIzinKaynagi(e.target.value as IzinKaynagi | "")}
                    >
                      <option value="">Seçin</option>
                      {TOPLU_IZIN_KAYNAKLARI.map((k) => (
                        <option key={k} value={k}>
                          {WHATSAPP_IZIN_KAYNAK_ADLARI[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {izinKaynagi === "diger" && (
                    <label className="etiket">
                      Açıklama (zorunlu)
                      <textarea
                        className="girdi"
                        rows={2}
                        maxLength={500}
                        required
                        value={izinAciklamasi}
                        onChange={(e) => setIzinAciklamasi(e.target.value)}
                      />
                    </label>
                  )}
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-0.5 size-4 accent-ana" checked={beyan} onChange={(e) => setBeyan(e.target.checked)} />
                    <span>{WHATSAPP_TOPLU_IZIN_BEYANI}</span>
                  </label>
                  <p className="text-soluk">
                    Her kayda izin tarihi (şimdi), kaynak ve işlemi yapan kullanıcı yazılır; RET vermiş ve engel listesindeki kayıtlar
                    atlanır.
                  </p>
                </>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="dugme" autoFocus onClick={() => pencere.current?.close()}>
                  Vazgeç
                </button>
                <button type="button" className="dugme-ana" disabled={!onaylanabilir} onClick={uygula}>
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
