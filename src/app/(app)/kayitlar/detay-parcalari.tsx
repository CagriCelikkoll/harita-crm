"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  epostaKaydet,
  iletisimKaydet,
  kaydiSil,
  kayitBilgileriniKaydet,
  notDuzenle,
  notEkle,
  notSil,
  type FormDurumu,
} from "./eylemler";

function Durum({ durum }: { durum: FormDurumu }) {
  if (durum.hata) return <p role="alert" className="text-sm text-tehlike">{durum.hata}</p>;
  if (durum.tamam) return <p role="status" className="text-sm text-ana">{durum.tamam}</p>;
  return null;
}

/** "Ara" ve "E-posta": önce etkinlik kaydı, sonra tel:/mailto: bağlantısı. E-posta yoksa giriş alanı. */
export function IletisimDugmeleri({ id, telefon, eposta }: { id: string; telefon?: string | null; eposta: string | null }) {
  const [bekliyor, gecis] = useTransition();
  const [epostaAlani, setEpostaAlani] = useState(false);

  const ac = (tur: "arama" | "eposta", hedef: string) =>
    gecis(async () => {
      await iletisimKaydet(id, tur);
      window.location.href = hedef;
    });

  return (
    <>
      <button
        type="button"
        className="dugme-ana"
        disabled={!telefon || bekliyor}
        title={telefon ? undefined : "Telefon bilgisi yok"}
        onClick={() => telefon && ac("arama", `tel:${telefon.replace(/[^\d+]/g, "")}`)}
      >
        Ara
      </button>
      {eposta ? (
        <button type="button" className="dugme" disabled={bekliyor} onClick={() => ac("eposta", `mailto:${eposta}`)}>
          E-posta
        </button>
      ) : (
        <button type="button" className="dugme" onClick={() => setEpostaAlani((a) => !a)} aria-expanded={epostaAlani}>
          E-posta ekle
        </button>
      )}
      {!eposta && epostaAlani && <EpostaFormu id={id} />}
    </>
  );
}

function EpostaFormu({ id }: { id: string }) {
  const [durum, eylem, bekliyor] = useActionState(epostaKaydet, {});
  return (
    <form action={eylem} className="flex w-full flex-col gap-1.5">
      <input type="hidden" name="id" value={id} />
      <label className="etiket">
        E-posta adresi <span className="text-xs font-normal text-soluk">(Google Places e-posta vermez; elle girin)</span>
        <span className="flex gap-2">
          <input name="eposta" type="email" required maxLength={200} className="girdi" autoComplete="off" />
          <button type="submit" className="dugme-ana" disabled={bekliyor}>
            Kaydet
          </button>
        </span>
      </label>
      <Durum durum={durum} />
    </form>
  );
}

type Bilgiler = {
  id: string;
  yetkiliAdi: string | null;
  eposta: string | null;
  ekTelefon: string | null;
  notlar: string | null;
  etiketler: string[];
};

export function BilgiFormu({ kayit }: { kayit: Bilgiler }) {
  const [durum, eylem, bekliyor] = useActionState(kayitBilgileriniKaydet, {});
  return (
    <form action={eylem} className="flex flex-col gap-2.5" key={kayit.id}>
      <input type="hidden" name="id" value={kayit.id} />
      <label className="etiket">
        Yetkili adı
        <input name="yetkiliAdi" defaultValue={kayit.yetkiliAdi ?? ""} maxLength={120} className="girdi" />
      </label>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="etiket">
          E-posta
          <input name="eposta" type="email" defaultValue={kayit.eposta ?? ""} maxLength={200} className="girdi" />
        </label>
        <label className="etiket">
          Ek telefon
          <input name="ekTelefon" type="tel" defaultValue={kayit.ekTelefon ?? ""} maxLength={40} className="girdi" />
        </label>
      </div>
      <label className="etiket">
        Etiketler <span className="text-xs font-normal text-soluk">(virgülle ayırın)</span>
        <input name="etiketler" defaultValue={kayit.etiketler.join(", ")} maxLength={500} className="girdi" />
      </label>
      <label className="etiket">
        Notlar
        <textarea name="notlar" defaultValue={kayit.notlar ?? ""} rows={3} maxLength={5000} className="girdi" />
      </label>
      <Durum durum={durum} />
      <button type="submit" className="dugme-ana self-start" disabled={bekliyor}>
        Kaydet
      </button>
    </form>
  );
}

export function NotFormu({ id }: { id: string }) {
  const [durum, eylem, bekliyor] = useActionState(notEkle, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (durum.tamam) form.current?.reset();
  }, [durum]);
  return (
    <form ref={form} action={eylem} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="etiket">
        Not ekle
        <textarea name="metin" rows={2} maxLength={2000} required className="girdi" placeholder="Görüşme özeti, hatırlatma…" />
      </label>
      <Durum durum={durum} />
      <button type="submit" className="dugme self-start" disabled={bekliyor}>
        Notu ekle
      </button>
    </form>
  );
}

export function NotSatiri({ olayId, metin }: { olayId: string; metin: string }) {
  const [duzenle, setDuzenle] = useState(false);
  const [durum, eylem, bekliyor] = useActionState(async (o: FormDurumu, f: FormData) => {
    const s = await notDuzenle(o, f);
    if (s.tamam) setDuzenle(false);
    return s;
  }, {});

  if (!duzenle) {
    return (
      <div className="group">
        <p className="whitespace-pre-wrap">{metin}</p>
        <div className="mt-1 flex gap-3 text-xs">
          <button type="button" className="text-ana underline" onClick={() => setDuzenle(true)}>
            Düzenle
          </button>
          <form action={notSil} onSubmit={(e) => !confirm("Not silinsin mi?") && e.preventDefault()}>
            <input type="hidden" name="olayId" value={olayId} />
            <button type="submit" className="text-tehlike underline">
              Sil
            </button>
          </form>
        </div>
      </div>
    );
  }
  return (
    <form action={eylem} className="flex flex-col gap-1.5">
      <input type="hidden" name="olayId" value={olayId} />
      <label className="sr-only" htmlFor={`not-${olayId}`}>
        Notu düzenle
      </label>
      <textarea id={`not-${olayId}`} name="metin" defaultValue={metin} rows={2} maxLength={2000} className="girdi" />
      <Durum durum={durum} />
      <div className="flex gap-2">
        <button type="submit" className="dugme-ana" disabled={bekliyor}>
          Kaydet
        </button>
        <button type="button" className="dugme" onClick={() => setDuzenle(false)}>
          Vazgeç
        </button>
      </div>
    </form>
  );
}

export function KayitSilDugmesi({ id }: { id: string }) {
  return (
    <form
      action={kaydiSil}
      onSubmit={(e) => {
        if (!confirm("Bu kayıt ve tüm etkinlik geçmişi kalıcı olarak silinsin mi?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="dugme-tehlike">
        Kaydı sil
      </button>
    </form>
  );
}
