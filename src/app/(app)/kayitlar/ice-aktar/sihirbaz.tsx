"use client";
// İçe aktarma sihirbazı: 1) dosya, 2) sütun eşleme ve seçenekler, 3) önizleme raporu, 4) onay ve sonuç.
// Doğrulama ve sayılar sunucudan gelir; beyan onayı ve ret onayı sunucuda da zorunludur. Alıcı türünün varsayılanı
// yoktur: sütun eşlenmemişse tüm dosya için seçilmeden önizlenemez.
import { DonerGosterge } from "@/components/arayuz/doner-gosterge";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiIstek } from "@/lib/api-istemci";
import {
  CAKISMA_POLITIKA_ADLARI,
  ICE_AKTARMA_ALAN_ADLARI,
  ICE_AKTARMA_ALANLARI,
  ICE_AKTARMA_AZAMI_MB,
  ICE_AKTARMA_AZAMI_SATIR,
  IZIN_BEYANI_METNI,
  type CakismaPolitikasi,
  type IceAktarmaBicimi,
  type IceAktarmaAlani,
  type SutunEslemi,
} from "@/lib/ice-aktarma";
import {
  ALICI_TURLERI,
  ALICI_TURU_ACIKLAMASI,
  ALICI_TURU_SECIM_ADLARI,
  RET_ONAY_METNI,
  WHATSAPP_IZIN_KAYNAK_ADLARI,
  WHATSAPP_IZIN_KAYNAKLARI,
  type AliciTuru,
  type WhatsappIzinKaynagi,
} from "@/lib/mesajlasma";
import type { IceAktarmaRaporu } from "@/server/servisler/ice-aktarma";

type Oturum = {
  id: string;
  dosyaAdi: string;
  bicim: IceAktarmaBicimi;
  googleBicimi: "yeni" | "eski" | null;
  basliklar: string[];
  ornek: string[][];
  dosyaSatiri: number;
  toplam: number;
  birlesen: number;
  googleEtiketleri: string[];
  onerilenEslem: SutunEslemi;
};
type Secenekler = {
  cakisma: CakismaPolitikasi;
  varsayilanAliciTuru: AliciTuru | null;
  varsayilanIzinKaynagi: WhatsappIzinKaynagi | null;
  iysBeyani: boolean;
  varsayilanIzin: "yok" | "var";
  /** Etiket → yeni ad; null: yok say. Yalnızca değiştirilenler gönderilir. */
  etiketEslemi: Record<string, string | null>;
};
type Sonuc = IceAktarmaRaporu & { eklenen: number; guncellenen: number };

const sayi = (n: number) => n.toLocaleString("tr");

export function IceAktarmaSihirbazi() {
  const [oturum, setOturum] = useState<Oturum | null>(null);
  const [eslem, setEslem] = useState<SutunEslemi>({});
  const [secenekler, setSecenekler] = useState<Secenekler>({
    cakisma: "atla",
    varsayilanAliciTuru: null,
    varsayilanIzinKaynagi: null,
    iysBeyani: false,
    varsayilanIzin: "yok",
    etiketEslemi: {},
  });
  const [rapor, setRapor] = useState<IceAktarmaRaporu | null>(null);
  const [beyan, setBeyan] = useState(false);
  const [retOnayi, setRetOnayi] = useState(false);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  // Önizleme sayfanın altında açılır: sonuç görünür alana kaydırılır.
  const onizlemeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (rapor) onizlemeRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [rapor]);

  async function dosyaYukle(dosya: File) {
    setHata(null);
    setMesgul(true);
    try {
      const form = new FormData();
      form.set("dosya", dosya);
      const yanit = await fetch("/api/ice-aktarma", { method: "POST", body: form, cache: "no-store" });
      const veri = await yanit.json().catch(() => ({}));
      if (!yanit.ok) return setHata((veri as { hata?: string }).hata ?? "Dosya yüklenemedi.");
      const o = veri as Oturum;
      setOturum(o);
      setEslem(o.onerilenEslem);
      setRapor(null);
    } catch {
      setHata("Sunucuya ulaşılamadı.");
    } finally {
      setMesgul(false);
    }
  }

  function sutunSec(alan: IceAktarmaAlani, deger: string) {
    setRapor(null);
    setEslem((e) => {
      const yeni: SutunEslemi = { ...e };
      // Aynı sütun başka alana eşliyse oradan kaldır.
      for (const a of ICE_AKTARMA_ALANLARI) if (deger !== "" && yeni[a] === Number(deger)) delete yeni[a];
      if (deger === "") delete yeni[alan];
      else yeni[alan] = Number(deger);
      return yeni;
    });
  }

  function secenek<K extends keyof Secenekler>(k: K, v: Secenekler[K]) {
    setRapor(null);
    setSecenekler((s) => ({ ...s, [k]: v }));
  }

  async function onizle() {
    if (!oturum) return;
    setHata(null);
    setMesgul(true);
    const s = await apiIstek<{ rapor: IceAktarmaRaporu }>(`/api/ice-aktarma/${oturum.id}/onizleme`, {
      method: "POST",
      govde: { eslem, secenekler },
    });
    setMesgul(false);
    if (!s.ok) return setHata(s.hata);
    setRapor(s.veri.rapor);
    setBeyan(false);
    setRetOnayi(false);
  }

  async function sorunlariIndir() {
    if (!oturum) return;
    const yanit = await fetch(`/api/ice-aktarma/${oturum.id}/sorunlar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eslem, secenekler }),
    });
    if (!yanit.ok) return setHata("Sorunlu satırlar indirilemedi.");
    const url = URL.createObjectURL(await yanit.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "sorunlu-satirlar.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function tamamla() {
    if (!oturum || !rapor) return;
    setHata(null);
    setMesgul(true);
    const s = await apiIstek<{ sonuc: Sonuc }>(`/api/ice-aktarma/${oturum.id}/tamamla`, {
      method: "POST",
      govde: { eslem, secenekler, beyanOnayi: beyan, retOnayi },
    });
    setMesgul(false);
    if (!s.ok) return setHata(s.hata);
    setSonuc(s.veri.sonuc);
  }

  async function iptal() {
    if (oturum) await apiIstek(`/api/ice-aktarma/${oturum.id}`, { method: "DELETE" });
    setOturum(null);
    setRapor(null);
    setEslem({});
  }

  if (sonuc) {
    return (
      <section className="kart max-w-2xl space-y-2">
        <h2 className="font-semibold">İçe aktarma tamamlandı</h2>
        <ul className="list-inside list-disc text-sm">
          <li>Eklenen yeni kişi: {sayi(sonuc.eklenen)}</li>
          <li>Boş alanları doldurulan mevcut kayıt: {sayi(sonuc.guncellenen)}</li>
          <li>Mevcut kayıtla çakışan: {sayi(sonuc.cakisan)}</li>
          <li>Hatalı (alınmadı): {sayi(sonuc.hatali)}</li>
          <li>Engel listesinde (eklendi ama ileti gönderilmez): {sayi(sonuc.engelli)}</li>
          {sonuc.uyari > 0 && <li>Eklendi ama WhatsApp izni yazılmadı (engel listesi / İYS beyanı): {sayi(sonuc.uyari)}</li>}
          {sonuc.bicim === "google" && sonuc.birlesen > 0 && <li>Dosyada aynı telefonla birleşen satır: {sayi(sonuc.birlesen)}</li>}
          {sonuc.retli > 0 && <li>Ret işaretli (ret akışından geçti): {sayi(sonuc.retli)}</li>}
        </ul>
        <div className="flex gap-2 pt-2">
          <Link href="/kayitlar?grup=tum&kaynak=ice_aktarma" className="dugme-ana">
            İçe aktarılan kayıtlar
          </Link>
          <button type="button" className="dugme" onClick={() => location.reload()}>
            Yeni dosya
          </button>
        </div>
      </section>
    );
  }

  if (!oturum) {
    return (
      <section className="kart max-w-2xl space-y-3">
        <h2 className="font-semibold">1. Dosya seçin</h2>
        <p className="text-sm text-soluk">
          İlk satır başlık olmalı. Telefon ya da e-posta sütunu zorunlu. WhatsApp izni sütunu (var / yok / ret) eşlenmezse
          izni tüm dosya için seçersiniz (varsayılan &quot;izin yok&quot;). En fazla {sayi(ICE_AKTARMA_AZAMI_SATIR)} satır,{" "}
          {ICE_AKTARMA_AZAMI_MB} MB.
        </p>
        <p className="text-sm text-soluk">
          <strong className="font-medium">Google Kişiler:</strong> contacts.google.com → Dışa aktar → &quot;Google
          CSV&quot; ile aldığınız dosyayı doğrudan yükleyin; biçim tanınır, sütunlar kendiliğinden eşlenir, aynı telefonlu kişiler
          birleşir.
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={mesgul}
          onChange={(e) => e.target.files?.[0] && dosyaYukle(e.target.files[0])}
          className="block text-sm"
        />
        {mesgul && <DonerGosterge etiket="Dosya okunuyor…" />}
        {hata && (
          <p role="alert" className="text-sm text-tehlike">
            {hata}
          </p>
        )}
      </section>
    );
  }

  const izinEslendi = eslem.whatsappIzni !== undefined;
  const turEslendi = eslem.aliciTuru !== undefined;
  const turEksik = !turEslendi && !secenekler.varsayilanAliciTuru;
  // İzin bilgisi dosyadan (sütun) ya da toplu seçimle gelebilir: kaynak ve İYS beyanı o zaman sorulur.
  const izinOlabilir = izinEslendi || secenekler.varsayilanIzin === "var";
  const kaynakEksik = !izinEslendi && secenekler.varsayilanIzin === "var" && eslem.izinKaynagi === undefined && !secenekler.varsayilanIzinKaynagi;
  const google = oturum.bicim === "google";
  return (
    <div className="space-y-4">
      <section className="kart space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            2. Sütunları eşleyin — {oturum.dosyaAdi} ({sayi(oturum.toplam)} {google ? "kişi" : "satır"})
          </h2>
          <button type="button" className="dugme" onClick={iptal}>
            Vazgeç
          </button>
        </div>
        {google && (
          <p className="rounded-md bg-ana-acik p-3 text-sm">
            Google Kişiler dosyası tanındı ({oturum.googleBicimi === "eski" ? "eski biçim" : "yeni biçim"}). Sütunlar
            kendiliğinden eşlendi: şirket adı yoksa ad soyad işletme adı olur; cep numarası (Mobile etiketli öncelikli) telefon
            olur, diğer numaralar nota yazılır; &quot;* myContacts&quot; gibi sistem grupları atılır.{" "}
            {oturum.birlesen > 0
              ? `${sayi(oturum.dosyaSatiri)} satırdan ${sayi(oturum.birlesen)} satır aynı telefonla birleşti: ${sayi(oturum.toplam)} kişi.`
              : `${sayi(oturum.dosyaSatiri)} satır, birleşen yok.`}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ICE_AKTARMA_ALANLARI.map((alan) => (
            <label key={alan} className="etiket">
              {ICE_AKTARMA_ALAN_ADLARI[alan]}
              <select className="girdi" value={eslem[alan] ?? ""} onChange={(e) => sutunSec(alan, e.target.value)}>
                <option value="">— eşleme yok —</option>
                {oturum.basliklar.map((b, i) => (
                  <option key={i} value={i}>
                    {b || `Sütun ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="grid gap-3 border-t border-kenar pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="etiket">
            {turEslendi ? "Alıcı türü hücresi boşsa" : "Alıcı türü (dosyada sütun yok; tüm kişiler için)"}
            <select
              className="girdi"
              required={!turEslendi}
              aria-invalid={turEksik}
              value={secenekler.varsayilanAliciTuru ?? ""}
              onChange={(e) => secenek("varsayilanAliciTuru", (e.target.value || null) as AliciTuru | null)}
            >
              <option value="" disabled={!turEslendi}>
                {turEslendi ? "— boş hücre hatalı sayılır —" : "Seçin"}
              </option>
              {ALICI_TURLERI.map((t) => (
                <option key={t} value={t}>
                  {ALICI_TURU_SECIM_ADLARI[t]}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-soluk">{ALICI_TURU_ACIKLAMASI}</span>
          </label>
          <label className="etiket">
            Telefonu mevcut bir kayıtla aynıysa
            <select
              className="girdi"
              value={secenekler.cakisma}
              onChange={(e) => secenek("cakisma", e.target.value as CakismaPolitikasi)}
            >
              {(Object.keys(CAKISMA_POLITIKA_ADLARI) as CakismaPolitikasi[]).map((p) => (
                <option key={p} value={p}>
                  {CAKISMA_POLITIKA_ADLARI[p]}
                </option>
              ))}
            </select>
          </label>
          {!izinEslendi && (
            <label className="etiket">
              WhatsApp izni (dosyada sütun yok; tüm kişiler için)
              <select
                className="girdi"
                value={secenekler.varsayilanIzin}
                onChange={(e) => secenek("varsayilanIzin", e.target.value as "yok" | "var")}
              >
                <option value="yok">İzin yok</option>
                <option value="var">İzin var (hepsinden onay alındı)</option>
              </select>
            </label>
          )}
          {izinOlabilir && (
            <label className="etiket">
              {izinEslendi ? "İzin kaynağı sütunu boşsa" : "İzin kaynağı"}
              <select
                className="girdi"
                aria-invalid={kaynakEksik}
                value={secenekler.varsayilanIzinKaynagi ?? ""}
                onChange={(e) => secenek("varsayilanIzinKaynagi", (e.target.value || null) as WhatsappIzinKaynagi | null)}
              >
                <option value="">{izinEslendi ? "— yok (satır hatalı sayılır) —" : "Seçin"}</option>
                {WHATSAPP_IZIN_KAYNAKLARI.filter((k) => k !== "diger").map((k) => (
                  <option key={k} value={k}>
                    {WHATSAPP_IZIN_KAYNAK_ADLARI[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {izinOlabilir && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={secenekler.iysBeyani}
              onChange={(e) => secenek("iysBeyani", e.target.checked)}
            />
            {google
              ? "Bireysel kişilerin WhatsApp izinleri İYS'ye kaydedilmiştir. (İşaretlenmezse bireysel kişiler izinsiz eklenir; satırlar raporda \"İYS beyanı gerekli\" olarak görünür.)"
              : "Bireysel kişilerin WhatsApp izinleri İYS'ye kaydedilmiştir. (İşaretlenmezse bireysel kişilere WhatsApp kampanyası gönderilmez.)"}
          </label>
        )}
        <p className="text-xs text-soluk">
          Ret işaretli mevcut kayıtların izni hiçbir koşulda değiştirilmez; engel listesindeki numaralara izin yazılmaz.
        </p>

        {oturum.googleEtiketleri.length > 0 && (
          <details className="rounded-md border border-kenar p-3 text-sm" open={oturum.googleEtiketleri.length <= 12}>
            <summary className="cursor-pointer font-medium">Etiketler ({sayi(oturum.googleEtiketleri.length)}): yeniden adlandırın ya da yok sayın</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {oturum.googleEtiketleri.map((e) => {
                const eslenen = secenekler.etiketEslemi[e];
                const yokSay = eslenen === null;
                return (
                  <div key={e} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-28 truncate" title={e}>
                      {e}
                    </span>
                    <span aria-hidden>→</span>
                    <input
                      className="girdi !min-h-8 !w-40 !py-1"
                      aria-label={`${e} etiketinin yeni adı`}
                      maxLength={40}
                      disabled={yokSay}
                      placeholder={e}
                      value={yokSay ? "" : (eslenen ?? "")}
                      onChange={(ev) => {
                        const yeni = { ...secenekler.etiketEslemi };
                        if (ev.target.value.trim()) yeni[e] = ev.target.value;
                        else delete yeni[e];
                        secenek("etiketEslemi", yeni);
                      }}
                    />
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={yokSay}
                        onChange={(ev) => {
                          const yeni = { ...secenekler.etiketEslemi };
                          if (ev.target.checked) yeni[e] = null;
                          else delete yeni[e];
                          secenek("etiketEslemi", yeni);
                        }}
                      />
                      yok say
                    </label>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {google && <p className="text-xs text-soluk">Dönüşmüş hal (ilk {sayi(oturum.ornek.length)} kişi):</p>}
        <div className={`overflow-x-auto ${google ? "max-h-80 overflow-y-auto" : ""}`}>
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-soluk">
                {oturum.basliklar.map((b, i) => (
                  <th key={i} className="px-2 py-1 font-medium">
                    {b || `Sütun ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {oturum.ornek.slice(0, google ? 50 : 5).map((s, i) => (
                <tr key={i} className="border-t border-kenar">
                  {s.map((h, j) => (
                    <td key={j} className="max-w-48 truncate px-2 py-1" title={h}>
                      {h}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {turEksik && (
          <p className="text-sm text-tehlike">
            Dosyada alıcı türü sütunu yok: önizlemeden önce tüm kişiler için alıcı türünü seçin.
          </p>
        )}
        {kaynakEksik && <p className="text-sm text-tehlike">Tüm kişilere WhatsApp izni verilecekse izin kaynağını seçin.</p>}
        <button type="button" className="dugme-ana" disabled={mesgul || turEksik || kaynakEksik} onClick={onizle}>
          3. Önizle
        </button>
      </section>

      {hata && (
        <p role="alert" className="rounded-md bg-tehlike-acik p-3 text-sm text-tehlike">
          {hata}
        </p>
      )}

      {rapor && (
        <section ref={onizlemeRef} className="kart scroll-mt-4 space-y-3">
          <h2 className="font-semibold">Önizleme (henüz hiçbir şey kaydedilmedi)</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <dt className="text-soluk">Toplam satır</dt>
            <dd>{sayi(rapor.toplam)}</dd>
            <dt className="text-soluk">Yeni eklenecek</dt>
            <dd>{sayi(rapor.yeni)}</dd>
            <dt className="text-soluk">Mevcut kayıtla çakışan</dt>
            <dd>{sayi(rapor.cakisan)}</dd>
            <dt className="text-soluk">Hatalı (alınmayacak)</dt>
            <dd className={rapor.hatali ? "text-tehlike" : ""}>{sayi(rapor.hatali)}</dd>
            <dt className="text-soluk">Engel listesinde</dt>
            <dd>{sayi(rapor.engelli)}</dd>
            <dt className="text-soluk">WhatsApp izni var</dt>
            <dd>{sayi(rapor.izinli)}</dd>
            <dt className="text-soluk">Ret işaretli</dt>
            <dd>{sayi(rapor.retli)}</dd>
            {rapor.bicim === "google" && (
              <>
                <dt className="text-soluk">Dosyada birleşen satır</dt>
                <dd>{sayi(rapor.birlesen)}</dd>
              </>
            )}
            <dt className="text-soluk">Eklenecek ama izni yazılmayacak</dt>
            <dd className={rapor.uyari ? "text-uyari" : ""}>{sayi(rapor.uyari)}</dd>
          </dl>
          {rapor.uyarilar.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">İzni yazılmayacak satırlar ({sayi(rapor.uyari)})</summary>
              <ul className="mt-2 max-h-60 overflow-y-auto text-xs">
                {rapor.uyarilar.map((s) => (
                  <li key={s.satir}>
                    Satır {s.satir}: {s.neden}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {(rapor.sorunlar.length > 0 || rapor.uyarilar.length > 0) && (
            <details className="text-sm">
              <summary className="cursor-pointer">
                Sorunlu satırlar ({sayi(rapor.hatali)}){rapor.bicim === "google" ? " — satır numarası dönüşmüş listeye göredir; CSV'de \"Dosya satırı\" sütunu özgün satırı gösterir" : ""}
              </summary>
              <ul className="mt-2 max-h-60 overflow-y-auto text-xs">
                {rapor.sorunlar.map((s) => (
                  <li key={s.satir}>
                    Satır {s.satir}: {s.neden}
                  </li>
                ))}
              </ul>
              <button type="button" className="dugme mt-2" onClick={sorunlariIndir}>
                Sorunlu satırları CSV indir
              </button>
            </details>
          )}

          {rapor.beyanGerekli && (
            <label className="flex items-start gap-2 rounded-md bg-uyari-acik p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={beyan} onChange={(e) => setBeyan(e.target.checked)} />
              <span>{IZIN_BEYANI_METNI}</span>
            </label>
          )}
          {rapor.retli > 0 && (
            <label className="flex items-start gap-2 rounded-md bg-tehlike-acik p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={retOnayi} onChange={(e) => setRetOnayi(e.target.checked)} />
              <span>
                Dosyada ret işaretli {sayi(rapor.retli)} kişi var. {RET_ONAY_METNI}
              </span>
            </label>
          )}
          <button
            type="button"
            className="dugme-ana"
            disabled={mesgul || (rapor.beyanGerekli && !beyan) || (rapor.retli > 0 && !retOnayi) || rapor.yeni + rapor.cakisan === 0}
            onClick={tamamla}
          >
            4. İçe aktar
          </button>
        </section>
      )}
    </div>
  );
}
