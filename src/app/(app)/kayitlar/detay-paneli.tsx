"use client";
// Kayıt detay paneli.
// - Açılınca İŞLETME BİLGİSİ için tek bir Place Details Enterprise çağrısı yapılır (?canli=1); yalnızca Google
//   kayıtlarında (içe aktarılan / elle eklenen kişide sunucu Places'a gitmez).
// - İşlemlerden sonra yalnızca kullanıcı verisi ve olaylar yenilenir; Places'a yeniden gidilmez,
//   liste de yeniden çekilmez (maliyet).
import { useCallback, useEffect, useState } from "react";
import { GoogleAtfi } from "@/components/google-atfi";
import { RetDugmesi } from "@/components/ret-onayi";
import { apiIstek } from "@/lib/api-istemci";
import { tarihYaz } from "@/lib/bicim";
import {
  ALICI_TURLERI,
  ALICI_TURU_ADLARI,
  WHATSAPP_IZIN_KAYNAK_ADLARI,
  WHATSAPP_IZIN_KAYNAKLARI,
  WHATSAPP_IZNI_ADLARI,
  type AliciTuru,
} from "@/lib/mesajlasma";
import {
  ILETI_IZNI_ADLARI,
  KOTA_DOLDU_MESAJI,
  KAYIT_DURUM_ADLARI,
  KAYIT_DURUMLARI,
  KAYIT_KAYNAK_ADLARI,
  OLAY_TURU_ADLARI,
  type KayitDurumu,
} from "@/lib/sabitler";
import type { CanliSonuc } from "@/server/servisler/canli-bilgi";
import type { KayitDto, OlayDto, WhatsappKisiDto } from "@/server/servisler/kayit-dto";
import type { KayitWhatsapp } from "@/server/servisler/whatsapp";

type DetayVerisi = { kayit: KayitDto; whatsapp: WhatsappKisiDto; olaylar: OlayDto[]; canli?: CanliSonuc };
type Mesaj = { tur: "hata" | "tamam"; metin: string; alan: string } | null;

export function DetayPaneli(props: {
  id: string;
  kullaniciId: string;
  onKapat: () => void;
  onKayitDegisti: (k: KayitDto) => void;
  onSilindi: (id: string) => void;
}) {
  const { id, onKayitDegisti } = props;
  const [veri, setVeri] = useState<Omit<DetayVerisi, "canli"> | null>(null);
  const [canli, setCanli] = useState<CanliSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [bulunamadi, setBulunamadi] = useState(false);
  const [mesaj, setMesaj] = useState<Mesaj>(null);
  const [mesgul, setMesgul] = useState(false);

  // Açılış: kullanıcı verisi + canlı Places detayı (tek Enterprise çağrısı).
  // Panel üst bileşende key={id} ile oluşturulur; kayıt değişince durum zaten sıfırdan başlar.
  useEffect(() => {
    const iptal = new AbortController();
    apiIstek<DetayVerisi>(`/api/kayitlar/${id}?canli=1`, { sinyal: iptal.signal })
      .then((s) => {
        if (!s.ok) {
          setBulunamadi(s.durum === 404);
          setMesaj({ tur: "hata", metin: s.hata, alan: "genel" });
          return;
        }
        setVeri({ kayit: s.veri.kayit, whatsapp: s.veri.whatsapp, olaylar: s.veri.olaylar });
        setCanli(s.veri.canli ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!iptal.signal.aborted) setYukleniyor(false);
      });
    return () => iptal.abort();
  }, [id]);

  /** İşlem sonrası: Places'a gitmeden kullanıcı verisini ve olayları yenile. */
  const yenile = useCallback(async () => {
    const s = await apiIstek<DetayVerisi>(`/api/kayitlar/${id}`);
    if (s.ok) {
      setVeri({ kayit: s.veri.kayit, whatsapp: s.veri.whatsapp, olaylar: s.veri.olaylar });
      onKayitDegisti(s.veri.kayit);
    } else if (s.durum === 404) {
      setBulunamadi(true);
    }
  }, [id, onKayitDegisti]);

  async function islem(alan: string, istek: () => Promise<{ ok: boolean; hata?: string }>, tamamMetni?: string) {
    setMesgul(true);
    setMesaj(null);
    const s = await istek();
    setMesgul(false);
    if (!s.ok) {
      setMesaj({ tur: "hata", metin: s.hata ?? "İşlem başarısız.", alan });
      return false;
    }
    await yenile();
    if (tamamMetni) setMesaj({ tur: "tamam", metin: tamamMetni, alan });
    return true;
  }

  const guncelle = (
    alan: string,
    degisiklik: Partial<KayitDto> & { aliciTuruAciklamasi?: string; retOnayi?: true },
    tamamMetni?: string,
  ) =>
    islem(
      alan,
      async () => {
        const s = await apiIstek(`/api/kayitlar/${id}`, { method: "PATCH", govde: degisiklik });
        return s.ok ? { ok: true } : { ok: false, hata: s.hata };
      },
      tamamMetni,
    );

  const olayEkle = async (govde: { tur: "not" | "arama" | "eposta"; aciklama?: string }, alan: string) =>
    islem(alan, async () => {
      const s = await apiIstek(`/api/kayitlar/${id}/olaylar`, { method: "POST", govde });
      return s.ok ? { ok: true } : { ok: false, hata: s.hata };
    });

  if (yukleniyor) {
    return (
      <aside className="kart text-sm text-soluk" aria-busy="true" aria-label="Kayıt detayı">
        Yükleniyor…
      </aside>
    );
  }
  if (bulunamadi || !veri) {
    return (
      <aside className="kart flex items-start justify-between gap-3 text-sm" aria-label="Kayıt detayı">
        <p className="text-tehlike">{bulunamadi ? "Kayıt bulunamadı." : (mesaj?.metin ?? "Kayıt yüklenemedi.")}</p>
        <button type="button" className="dugme" onClick={props.onKapat}>
          Kapat
        </button>
      </aside>
    );
  }

  const { kayit, olaylar } = veri;
  const google = kayit.placeId !== null;
  const yer = canli?.durum === "tamam" ? canli.yer : null;
  const telefon = yer?.telefonUluslararasi ?? yer?.telefon ?? kayit.ekTelefon;
  const surum = `${kayit.id}-${kayit.guncellemeTarihi}`; // formlar kayıt değişince yeniden oluşsun
  const baslik = google
    ? (yer?.ad ?? kayit.isletmeAdi ?? "İşletme bilgisi alınamadı")
    : (kayit.isletmeAdi ?? kayit.yetkiliAdi ?? "(adsız kişi)");

  return (
    <aside className="kart flex flex-col gap-4 xl:sticky xl:top-5" aria-label="Kayıt detayı" id="kayit-detayi">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{baslik}</h2>
          {!google && <span className="rozet">{KAYIT_KAYNAK_ADLARI[kayit.kaynak]}</span>}
          {yer?.adres && <p className="text-sm text-soluk">{yer.adres}</p>}
        </div>
        <button type="button" className="dugme shrink-0" onClick={props.onKapat}>
          Kapat
        </button>
      </div>

      {!google ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-soluk">Telefon</dt>
          <dd>{kayit.ekTelefon ?? "—"}</dd>
          {veri.whatsapp.kullaniciAdi && (
            <>
              <dt className="text-soluk">WhatsApp</dt>
              <dd>@{veri.whatsapp.kullaniciAdi}</dd>
            </>
          )}
          {veri.whatsapp.reklamBasligi && (
            <>
              <dt className="text-soluk">Reklam</dt>
              <dd>{veri.whatsapp.reklamBasligi}</dd>
            </>
          )}
        </dl>
      ) : yer ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-soluk">Telefon</dt>
          <dd>{yer.telefon ?? "—"}</dd>
          <dt className="text-soluk">Web sitesi</dt>
          <dd className="truncate">
            {yer.webSitesi ? (
              <a href={yer.webSitesi} target="_blank" rel="noopener noreferrer" className="text-ana underline">
                {yer.webSitesi.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              "—"
            )}
          </dd>
          {yer.puan !== undefined && (
            <>
              <dt className="text-soluk">Puan</dt>
              <dd>
                {yer.puan} ({yer.puanSayisi ?? 0} değerlendirme)
              </dd>
            </>
          )}
          {yer.isletmeDurumu && yer.isletmeDurumu !== "OPERATIONAL" && (
            <>
              <dt className="text-soluk">Durum</dt>
              <dd className="text-tehlike">
                {yer.isletmeDurumu === "CLOSED_PERMANENTLY" ? "Kalıcı olarak kapalı" : "Geçici olarak kapalı"}
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p role="alert" className="text-sm text-tehlike">
          {canli?.durum === "kota"
            ? `${KOTA_DOLDU_MESAJI} İşletme bilgileri (ad, adres, telefon) gösterilemiyor; aşağıdaki kendi verileriniz ve işlemler kullanılabilir.`
            : canli?.durum === "bulunamadi"
              ? "Bu işletme Google'da artık bulunmuyor."
              : `İşletme bilgisi alınamadı${canli?.durum === "hata" ? `: ${canli.mesaj}` : "."}`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {yer?.googleMapsUri && (
          <a href={yer.googleMapsUri} target="_blank" rel="noopener noreferrer" className="dugme">
            Google Haritalar&apos;da aç
          </a>
        )}
        <button
          type="button"
          className="dugme-ana"
          disabled={!telefon || mesgul}
          title={telefon ? undefined : "Telefon bilgisi yok"}
          onClick={async () => {
            if (!telefon) return;
            if (await olayEkle({ tur: "arama" }, "iletisim")) window.location.href = `tel:${telefon.replace(/[^\d+]/g, "")}`;
          }}
        >
          Ara
        </button>
        {kayit.eposta && (
          <button
            type="button"
            className="dugme"
            disabled={mesgul}
            onClick={async () => {
              if (await olayEkle({ tur: "eposta" }, "iletisim")) window.location.href = `mailto:${kayit.eposta}`;
            }}
          >
            E-posta
          </button>
        )}
      </div>
      {!kayit.eposta && (
        <form
          key={`eposta-${surum}`}
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const eposta = String(new FormData(e.currentTarget).get("eposta") ?? "").trim();
            void guncelle("eposta", { eposta }, "E-posta kaydedildi.");
          }}
        >
          <label className="etiket">
            E-posta adresi <span className="text-xs font-normal text-soluk">(Google Places e-posta vermez; elle girin)</span>
            <span className="flex gap-2">
              <input name="eposta" type="email" required maxLength={200} className="girdi" autoComplete="off" />
              <button type="submit" className="dugme-ana" disabled={mesgul}>
                Kaydet
              </button>
            </span>
          </label>
          <MesajGoster mesaj={mesaj} alan="eposta" />
        </form>
      )}
      <WhatsappButonu key={`wa-${kayit.iletiIzni}-${kayit.aliciTuru}-${kayit.ekTelefon ?? ""}`} id={kayit.id} onGonderildi={yenile} />
      <MesajGoster mesaj={mesaj} alan="iletisim" />
      {google && <GoogleAtfi />}
      <WhatsappIzinBolumu
        key={`wa-izin-${surum}-${veri.whatsapp.izin}`}
        id={kayit.id}
        ad={baslik}
        whatsapp={veri.whatsapp}
        bireysel={kayit.aliciTuru === "bireysel"}
        onDegisti={yenile}
      />

      <section className="flex flex-col gap-2 border-t border-kenar pt-4">
        <form
          key={`durum-${surum}`}
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const durum = new FormData(e.currentTarget).get("durum") as KayitDurumu;
            if (durum !== kayit.durum) void guncelle("durum", { durum });
          }}
        >
          <label className="etiket flex-1">
            Durum
            <select name="durum" defaultValue={kayit.durum} className="girdi">
              {KAYIT_DURUMLARI.map((d) => (
                <option key={d} value={d}>
                  {KAYIT_DURUM_ADLARI[d]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="dugme-ana" disabled={mesgul}>
            Değiştir
          </button>
        </form>
        <MesajGoster mesaj={mesaj} alan="durum" />

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            İleti izni:{" "}
            <strong className={kayit.iletiIzni === "ret" ? "text-tehlike" : ""}>{ILETI_IZNI_ADLARI[kayit.iletiIzni]}</strong>
          </span>
          {kayit.iletiIzni !== "ret" && (
            <RetDugmesi
              ad={baslik}
              etiket="İleti reddi işaretle"
              disabled={mesgul}
              onOnay={() => void guncelle("izin", { iletiIzni: "ret", retOnayi: true })}
            />
          )}
          {kayit.iletiIzni === "bekliyor" && (
            <button type="button" className="dugme" disabled={mesgul} onClick={() => void guncelle("izin", { iletiIzni: "onayli" })}>
              İzin alındı
            </button>
          )}
        </div>
        <MesajGoster mesaj={mesaj} alan="izin" />
      </section>

      <section className="border-t border-kenar pt-4">
        <h3 className="mb-2 font-semibold">Bilgiler ve notlar</h3>
        <form
          key={`bilgi-${surum}`}
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const al = (ad: string) => String(f.get(ad) ?? "");
            void guncelle(
              "bilgi",
              {
                isletmeAdi: al("isletmeAdi"),
                aliciTuru: al("aliciTuru") as AliciTuru,
                ...(f.has("aliciTuruAciklamasi") ? { aliciTuruAciklamasi: al("aliciTuruAciklamasi") } : {}),
                yetkiliAdi: al("yetkiliAdi"),
                eposta: al("eposta"),
                ekTelefon: al("ekTelefon"),
                notlar: al("notlar"),
                etiketler: al("etiketler")
                  .split(",")
                  .map((s) => s.trim().toLocaleLowerCase("tr"))
                  .filter(Boolean),
              },
              "Kaydedildi.",
            );
          }}
        >
          <label className="etiket">
            İşletme adı (sizin kaydınız)
            <input name="isletmeAdi" defaultValue={kayit.isletmeAdi ?? ""} maxLength={160} className="girdi" />
            <span className="text-xs font-normal text-soluk">
              Kampanya mesajlarındaki {"{isletme}"} yalnızca bu alandan dolar; Google&apos;dan gelen ad mesajlara
              eklenmez.
            </span>
          </label>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="etiket">
              Yetkili adı
              <input name="yetkiliAdi" defaultValue={kayit.yetkiliAdi ?? ""} maxLength={120} className="girdi" />
            </label>
            <label className="etiket">
              Alıcı türü
              <select name="aliciTuru" defaultValue={kayit.aliciTuru} className="girdi">
                {ALICI_TURLERI.map((t) => (
                  <option key={t} value={t}>
                    {ALICI_TURU_ADLARI[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {kayit.aliciTuru === "bireysel" && kayit.kaynak === "meta_reklam" && (
            <label className="etiket">
              Alıcı türü değişikliğinin açıklaması
              <input name="aliciTuruAciklamasi" maxLength={500} className="girdi" />
              <span className="text-xs font-normal text-soluk">
                Reklamdan gelen kişiyi tacir/esnaf yapmak İYS beyanı kuralını kaldırır: yalnızca yönetici, açıklamayla
                yapabilir.
              </span>
            </label>
          )}
          {kayit.aliciTuru === "bireysel" && kayit.iletiIzni !== "onayli" && (
            <p className="text-xs text-soluk">Bireysel kayıtlara yalnızca ileti izni &quot;Onaylı&quot; ise gönderim yapılır.</p>
          )}
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
          <MesajGoster mesaj={mesaj} alan="bilgi" />
          <button type="submit" className="dugme-ana self-start" disabled={mesgul}>
            Kaydet
          </button>
        </form>
      </section>

      <section className="border-t border-kenar pt-4">
        <h3 className="mb-2 font-semibold">Etkinlikler</h3>
        <form
          key={`not-${olaylar.length}`}
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const aciklama = String(new FormData(e.currentTarget).get("metin") ?? "").trim();
            if (aciklama) void olayEkle({ tur: "not", aciklama }, "not");
          }}
        >
          <label className="etiket">
            Not ekle
            <textarea name="metin" rows={2} maxLength={2000} required className="girdi" placeholder="Görüşme özeti, hatırlatma…" />
          </label>
          <MesajGoster mesaj={mesaj} alan="not" />
          <button type="submit" className="dugme self-start" disabled={mesgul}>
            Notu ekle
          </button>
        </form>
        <ol className="mt-3 flex flex-col gap-2">
          {olaylar.map((o) => (
            <li key={o.id} className="border-l-2 border-ana/40 pl-3 text-sm">
              <p className="text-xs text-soluk">
                {tarihYaz(o.tarih)} · {OLAY_TURU_ADLARI[o.tur]}
                {o.kullaniciAdi && ` · ${o.kullaniciAdi}`}
              </p>
              {o.tur === "not" && !o.sistem && o.kullaniciId === props.kullaniciId && o.aciklama ? (
                <NotSatiri
                  olay={o}
                  mesgul={mesgul}
                  onDuzenle={(aciklama) =>
                    islem("olay", async () => {
                      const s = await apiIstek(`/api/olaylar/${o.id}`, { method: "PATCH", govde: { aciklama } });
                      return s.ok ? { ok: true } : { ok: false, hata: s.hata };
                    })
                  }
                  onSil={() =>
                    islem("olay", async () => {
                      const s = await apiIstek(`/api/olaylar/${o.id}`, { method: "DELETE" });
                      return s.ok ? { ok: true } : { ok: false, hata: s.hata };
                    })
                  }
                />
              ) : (
                o.aciklama && <p className="whitespace-pre-wrap">{o.aciklama}</p>
              )}
            </li>
          ))}
        </ol>
        <MesajGoster mesaj={mesaj} alan="olay" />
      </section>

      <section className="border-t border-kenar pt-4">
        <button
          type="button"
          className="dugme-tehlike"
          disabled={mesgul}
          onClick={async () => {
            if (!confirm("Bu kayıt ve tüm etkinlik geçmişi kalıcı olarak silinsin mi?")) return;
            setMesgul(true);
            const s = await apiIstek(`/api/kayitlar/${id}`, { method: "DELETE" });
            setMesgul(false);
            if (s.ok || s.durum === 404) props.onSilindi(id);
            else setMesaj({ tur: "hata", metin: s.hata, alan: "sil" });
          }}
        >
          Kaydı sil
        </button>
        <MesajGoster mesaj={mesaj} alan="sil" />
      </section>
    </aside>
  );
}

function NotSatiri(props: {
  olay: OlayDto;
  mesgul: boolean;
  onDuzenle: (aciklama: string) => Promise<boolean>;
  onSil: () => Promise<boolean>;
}) {
  const [duzenle, setDuzenle] = useState(false);
  if (!duzenle) {
    return (
      <div>
        <p className="whitespace-pre-wrap">{props.olay.aciklama}</p>
        <div className="mt-1 flex gap-3 text-xs">
          <button type="button" className="text-ana underline" onClick={() => setDuzenle(true)}>
            Düzenle
          </button>
          <button
            type="button"
            className="text-tehlike underline"
            disabled={props.mesgul}
            onClick={() => confirm("Not silinsin mi?") && void props.onSil()}
          >
            Sil
          </button>
        </div>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const metin = String(new FormData(e.currentTarget).get("metin") ?? "").trim();
        if (metin && (await props.onDuzenle(metin))) setDuzenle(false);
      }}
    >
      <label className="sr-only" htmlFor={`not-${props.olay.id}`}>
        Notu düzenle
      </label>
      <textarea id={`not-${props.olay.id}`} name="metin" defaultValue={props.olay.aciklama ?? ""} rows={2} maxLength={2000} className="girdi" />
      <div className="flex gap-2">
        <button type="submit" className="dugme-ana" disabled={props.mesgul}>
          Kaydet
        </button>
        <button type="button" className="dugme" onClick={() => setDuzenle(false)}>
          Vazgeç
        </button>
      </div>
    </form>
  );
}

function MesajGoster({ mesaj, alan }: { mesaj: Mesaj; alan: string }) {
  if (!mesaj || mesaj.alan !== alan) return null;
  return (
    <p role={mesaj.tur === "hata" ? "alert" : "status"} className={`text-sm ${mesaj.tur === "hata" ? "text-tehlike" : "text-ana"}`}>
      {mesaj.metin}
    </p>
  );
}

/**
 * Tek kayıt için WhatsApp: "WhatsApp'ta aç" sunucu yönlendirmesidir (/api/whatsapp/ac-kayit/[id]); numara yalnızca
 * orada çözülür (ek_telefon ya da Places, saklanmaz). Ret / engel / izinsiz bireysel / günlük sınır / şablon yoksa
 * pasif. "Gönderdim" kullanıcının günlük WhatsApp sayacına işlenir.
 */
function WhatsappButonu({ id, onGonderildi }: { id: string; onGonderildi: () => Promise<void> }) {
  const [durum, setDurum] = useState<KayitWhatsapp | null>(null);
  const [acildi, setAcildi] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const [mesaj, setMesaj] = useState<{ tur: "hata" | "tamam"; metin: string } | null>(null);

  useEffect(() => {
    const iptal = new AbortController();
    apiIstek<KayitWhatsapp>(`/api/kayitlar/${id}/whatsapp`, { sinyal: iptal.signal })
      .then((s) => s.ok && setDurum(s.veri))
      .catch(() => {});
    return () => iptal.abort();
  }, [id]);

  if (!durum) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {durum.durum === "hazir" && durum.baglanti ? (
          <a href={durum.baglanti} target="_blank" rel="noopener noreferrer" className="dugme" onClick={() => setAcildi(true)}>
            WhatsApp&apos;ta aç
          </a>
        ) : (
          <button type="button" className="dugme" disabled title={durum.mesaj ?? undefined}>
            WhatsApp&apos;ta aç
          </button>
        )}
        {durum.durum === "hazir" && (
          <button
            type="button"
            className="dugme"
            disabled={!acildi || mesgul}
            title={acildi ? undefined : "Önce sohbeti açın"}
            onClick={async () => {
              setMesgul(true);
              const s = await apiIstek<KayitWhatsapp>(`/api/kayitlar/${id}/whatsapp`, { method: "POST" });
              setMesgul(false);
              if (!s.ok) {
                setMesaj({ tur: "hata", metin: s.hata });
                return;
              }
              setDurum(s.veri);
              setAcildi(false);
              setMesaj({ tur: "tamam", metin: "WhatsApp gönderimi kaydedildi." });
              await onGonderildi();
            }}
          >
            Gönderdim
          </button>
        )}
        <span className="text-xs text-soluk tabular-nums">Bugün kalan: {durum.kalan}</span>
      </div>
      {durum.durum !== "hazir" && durum.mesaj && <p className="text-xs text-soluk">WhatsApp: {durum.mesaj}</p>}
      {durum.durum === "hazir" && !durum.telefon && (
        <p className="text-xs text-soluk">Numara kayıtta yok; açarken Google&apos;dan alınır (4 birim, saklanmaz).</p>
      )}
      {mesaj && (
        <p role={mesaj.tur === "hata" ? "alert" : "status"} className={`text-sm ${mesaj.tur === "hata" ? "text-tehlike" : "text-ana"}`}>
          {mesaj.metin}
        </p>
      )}
    </div>
  );
}

/** WhatsApp (Cloud API) izni ve kanıtı. 'ret' geri alınamaz. */
function WhatsappIzinBolumu(props: {
  id: string;
  /** Ret onay penceresinde gösterilen kayıt adı. */
  ad: string;
  whatsapp: WhatsappKisiDto;
  bireysel: boolean;
  onDegisti: () => Promise<void>;
}) {
  const w = props.whatsapp;
  const [duzenle, setDuzenle] = useState(false);
  const [izin, setIzin] = useState<"var" | "yok">(w.izin === "var" ? "var" : "yok");
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  async function kaydet(govde: object) {
    setHata(null);
    setMesgul(true);
    const s = await apiIstek(`/api/kayitlar/${props.id}/whatsapp-izni`, { method: "PUT", govde });
    setMesgul(false);
    if (!s.ok) return setHata(s.hata);
    setDuzenle(false);
    await props.onDegisti();
  }

  return (
    <section className="flex flex-col gap-2 border-t border-kenar pt-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">WhatsApp izni (kampanyalar)</h3>
        {w.izin !== "ret" && !duzenle && (
          <button type="button" className="dugme" onClick={() => setDuzenle(true)}>
            Düzenle
          </button>
        )}
      </div>
      <p>
        <span className={w.izin === "var" ? "text-ana" : w.izin === "ret" ? "text-tehlike" : "text-soluk"}>
          {WHATSAPP_IZNI_ADLARI[w.izin]}
        </span>
        {w.izinKaynagi && ` · ${WHATSAPP_IZIN_KAYNAK_ADLARI[w.izinKaynagi]}`}
        {w.izinTarihi && ` · ${tarihYaz(w.izinTarihi)}`}
        {w.izin === "var" && props.bireysel && (w.iysBeyani ? " · İYS beyanı var" : " · İYS beyanı yok (kampanyaya girmez)")}
      </p>
      {w.izinNotu && <p className="text-soluk">{w.izinNotu}</p>}
      {w.whatsappYokTarihi && <p className="text-tehlike">Meta bu numarada WhatsApp olmadığını bildirdi.</p>}
      {w.izin === "ret" && <p className="text-xs text-soluk">Ret verilmiş bir kişinin izni değiştirilemez.</p>}

      {duzenle && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const d = (a: string) => String(f.get(a) ?? "");
            void kaydet(
              izin === "var"
                ? { izin, kaynak: d("kaynak"), tarih: d("tarih") || null, not: d("not") || null, iysBeyani: f.get("iys") === "on" }
                : { izin, not: d("not") || null },
            );
          }}
        >
          <label className="etiket">
            İzin
            <select className="girdi" value={izin} onChange={(e) => setIzin(e.target.value as "var" | "yok")}>
              <option value="var">İzin var</option>
              <option value="yok">İzin yok</option>
            </select>
          </label>
          {izin === "var" && (
            <>
              <label className="etiket">
                İzin kaynağı
                <select name="kaynak" required className="girdi" defaultValue={w.izinKaynagi ?? ""}>
                  <option value="" disabled>
                    Seçin
                  </option>
                  {WHATSAPP_IZIN_KAYNAKLARI.map((k) => (
                    <option key={k} value={k}>
                      {WHATSAPP_IZIN_KAYNAK_ADLARI[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="etiket">
                İzin tarihi
                <input name="tarih" type="date" className="girdi" defaultValue={w.izinTarihi?.slice(0, 10) ?? ""} />
              </label>
              {props.bireysel && (
                <label className="flex items-start gap-2">
                  <input name="iys" type="checkbox" className="mt-1" defaultChecked={w.iysBeyani} />
                  Bu izin İYS&apos;ye kaydedildi.
                </label>
              )}
            </>
          )}
          <label className="etiket">
            Kanıt notu (isteğe bağlı)
            <input name="not" maxLength={1000} className="girdi" defaultValue={w.izinNotu ?? ""} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="dugme-ana" disabled={mesgul}>
              Kaydet
            </button>
            <button type="button" className="dugme" onClick={() => setDuzenle(false)}>
              Vazgeç
            </button>
            <RetDugmesi ad={props.ad} etiket="Ret istedi" disabled={mesgul} onOnay={() => void kaydet({ izin: "ret", retOnayi: true })} />
          </div>
        </form>
      )}
      {hata && (
        <p role="alert" className="text-tehlike">
          {hata}
        </p>
      )}
    </section>
  );
}
