"use client";
// Kayıt detay paneli.
// - Açılınca İŞLETME BİLGİSİ için tek bir Place Details Enterprise çağrısı yapılır (?canli=oto); yalnızca Google
//   kayıtlarında (içe aktarılan / elle eklenen kişide sunucu Places'a gitmez). Kayıt "ilgilenmiyor" işaretliyse ya da
//   aylık kullanım %80'e ulaştıysa otomatik çağrı yapılmaz; "Google bilgilerini göster" düğmesi çıkar (?canli=1).
// - Sonuç yalnızca bellekte, en fazla 30 dakika tutulur (lib/google-onbellegi.ts): aynı kayıt yeniden açılınca
//   Places'a yeniden gidilmez; tarayıcı depolamasına yazılmaz.
// - İşlemlerden sonra yalnızca kullanıcı verisi ve olaylar yenilenir; Places'a yeniden gidilmez,
//   liste de yeniden çekilmez (maliyet).
import { useCallback, useEffect, useState } from "react";
import { bildir, SonucMesaji } from "@/components/bildirim";
import { DurumRozeti } from "@/components/arayuz/rozet";
import { SecimCipi, Sekmeler, sekmeId, sekmePaneliId } from "@/components/arayuz/sekmeler";
import { Simge } from "@/components/arayuz/simge";
import { GoogleAtfi } from "@/components/google-atfi";
import { RetDugmesi } from "@/components/ret-onayi";
import { kullanimDegisti } from "@/components/kullanim-gostergesi";
import { apiIstek } from "@/lib/api-istemci";
import { detayOnbellegi, listeOnbellegi } from "@/lib/google-onbellegi";
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
  AD_GIRME_IPUCU,
  GOOGLE_ADSIZ,
  ILETI_IZNI_ADLARI,
  KOTA_DOLDU_MESAJI,
  OTOMATIK_GOSTERIM_SINIRI_METNI,
  KAYIT_DURUM_ADLARI,
  KAYIT_DURUMLARI,
  KAYIT_KAYNAK_ADLARI,
  OLAY_TURU_ADLARI,
} from "@/lib/sabitler";
import type { CanliSonuc, ListeBilgisi } from "@/server/servisler/canli-bilgi";
import type { KayitDto, OlayDto, WhatsappKisiDto } from "@/server/servisler/kayit-dto";
import type { KayitWhatsapp } from "@/server/servisler/whatsapp";
import { IZIN_TONU } from "./kayit-tablosu";

type DetayVerisi = {
  kayit: KayitDto;
  whatsapp: WhatsappKisiDto;
  olaylar: OlayDto[];
  canli?: CanliSonuc;
  canliAtlandi?: "ilgilenmiyor" | "kota";
  engelli: boolean;
};
type Mesaj = { tur: "hata" | "tamam"; metin: string; alan: string } | null;
type PanelSekmesi = "genel" | "izin" | "gecmis";
const PANEL_SEKMELERI: { deger: PanelSekmesi; ad: string }[] = [
  { deger: "genel", ad: "Genel" },
  { deger: "izin", ad: "İletişim izni" },
  { deger: "gecmis", ad: "Geçmiş" },
];
const PANEL = "overflow-hidden rounded-kart border border-kenar bg-white max-xl:rounded-none max-xl:border-0 max-xl:min-h-full";

/** Başarılı detay sonucu bellek önbelleğine; ad, adres ve konum liste önbelleğine de (aynı kayıt listede yeniden istenmez). */
function onbellegeYaz(id: string, c: CanliSonuc) {
  if (c.durum !== "tamam") return;
  detayOnbellegi.koy(id, c);
  listeOnbellegi.koy(id, { ad: c.yer.ad, adres: c.yer.adres ?? null, konum: c.yer.konum ?? null });
}

export function DetayPaneli(props: {
  id: string;
  kullaniciId: string;
  /** Listede gösterilen Google bilgisi (ad, adres); ayrıntı Google'dan alınamadığında başlıkta kullanılır. */
  googleBilgisi?: ListeBilgisi;
  onKapat: () => void;
  /** Liste satırını sayfa yenilemeden günceller (izin rozeti, engelli işareti, son işlem tarihi). */
  onKayitDegisti: (k: KayitDto, ek: { whatsappIzni: WhatsappKisiDto["izin"]; engelli: boolean }) => void;
  onSilindi: (id: string) => void;
}) {
  const { id, onKayitDegisti } = props;
  const [veri, setVeri] = useState<Omit<DetayVerisi, "canli" | "canliAtlandi"> | null>(null);
  const [canli, setCanli] = useState<CanliSonuc | null>(null);
  const [canliAtlandi, setCanliAtlandi] = useState<DetayVerisi["canliAtlandi"]>(undefined);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [bulunamadi, setBulunamadi] = useState(false);
  const [mesaj, setMesaj] = useState<Mesaj>(null);
  const [mesgul, setMesgul] = useState(false);
  const [sekme, setSekme] = useState<PanelSekmesi>("genel");

  // Açılış: kullanıcı verisi + (bellekte yoksa) canlı Places detayı (tek Enterprise çağrısı, istisnalar sunucuda).
  // Panel üst bileşende key={id} ile oluşturulur; kayıt değişince durum zaten sıfırdan başlar.
  useEffect(() => {
    const iptal = new AbortController();
    const onceki = detayOnbellegi.al(id);
    apiIstek<DetayVerisi>(onceki ? `/api/kayitlar/${id}` : `/api/kayitlar/${id}?canli=oto`, { sinyal: iptal.signal })
      .then((s) => {
        if (!s.ok) {
          setBulunamadi(s.durum === 404);
          setMesaj({ tur: "hata", metin: s.hata, alan: "genel" });
          return;
        }
        setVeri({ kayit: s.veri.kayit, whatsapp: s.veri.whatsapp, olaylar: s.veri.olaylar, engelli: s.veri.engelli });
        const c = onceki ?? s.veri.canli ?? null;
        setCanli(c);
        setCanliAtlandi(c ? undefined : s.veri.canliAtlandi);
        if (s.veri.canli) {
          onbellegeYaz(id, s.veri.canli);
          kullanimDegisti();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!iptal.signal.aborted) setYukleniyor(false);
      });
    return () => iptal.abort();
  }, [id]);

  /** Kullanıcı istedi: koşulsuz canlı detay (Place Details Enterprise). */
  async function googleBilgisiGetir() {
    setMesgul(true);
    const s = await apiIstek<DetayVerisi>(`/api/kayitlar/${id}?canli=1`);
    setMesgul(false);
    if (!s.ok) return setMesaj({ tur: "hata", metin: s.hata, alan: "genel" });
    setCanli(s.veri.canli ?? null);
    setCanliAtlandi(undefined);
    if (s.veri.canli) onbellegeYaz(id, s.veri.canli);
    kullanimDegisti();
  }

  /** İşlem sonrası: Places'a gitmeden kullanıcı verisini ve olayları yenile. */
  const yenile = useCallback(async () => {
    const s = await apiIstek<DetayVerisi>(`/api/kayitlar/${id}`);
    if (s.ok) {
      setVeri({ kayit: s.veri.kayit, whatsapp: s.veri.whatsapp, olaylar: s.veri.olaylar, engelli: s.veri.engelli });
      onKayitDegisti(s.veri.kayit, { whatsappIzni: s.veri.whatsapp.izin, engelli: s.veri.engelli });
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

  const olayEkle = async (govde: { tur: "not" | "arama" | "eposta"; aciklama?: string }, alan: string, tamamMetni?: string) =>
    islem(
      alan,
      async () => {
        const s = await apiIstek(`/api/kayitlar/${id}/olaylar`, { method: "POST", govde });
        return s.ok ? { ok: true } : { ok: false, hata: s.hata };
      },
      tamamMetni,
    );

  if (yukleniyor) {
    return (
      <aside className={`${PANEL} p-6 text-sm text-soluk`} aria-busy="true" aria-label="Kayıt ayrıntıları">
        Yükleniyor…
      </aside>
    );
  }
  if (bulunamadi || !veri) {
    return (
      <aside className={`${PANEL} flex items-start justify-between gap-3 p-6 text-sm`} aria-label="Kayıt ayrıntıları">
        <p className="text-tehlike">{bulunamadi ? "Kayıt bulunamadı." : (mesaj?.metin ?? "Kayıt yüklenemedi.")}</p>
        <button type="button" className="dugme" onClick={props.onKapat}>
          Kapat
        </button>
      </aside>
    );
  }

  const { kayit, olaylar } = veri;
  // Ret: izin kaynağı yerine "Ret · <tarih> · <nasıl>" (en son ret olayı; olaylar yeniden eskiye).
  const retOlayi = kayit.iletiIzni === "ret" ? (olaylar.find((o) => o.tur === "ret") ?? null) : null;
  const retMetni = retOlayi
    ? ["Ret", tarihYaz(retOlayi.tarih), retOlayi.aciklama, retOlayi.kullaniciAdi].filter(Boolean).join(" · ")
    : "Ret";
  const google = kayit.placeId !== null;
  const yer = canli?.durum === "tamam" ? canli.yer : null;
  const telefon = yer?.telefonUluslararasi ?? yer?.telefon ?? kayit.ekTelefon;
  const surum = `${kayit.id}-${kayit.guncellemeTarihi}`; // formlar kayıt değişince yeniden oluşsun
  const listeGoogle = props.googleBilgisi && !("hata" in props.googleBilgisi) ? props.googleBilgisi : null;
  const baslik = google
    ? (kayit.isletmeAdi ?? yer?.ad ?? listeGoogle?.ad ?? GOOGLE_ADSIZ)
    : (kayit.isletmeAdi ?? kayit.yetkiliAdi ?? "(adsız kişi)");
  const altBaslik = google ? (yer?.adres ?? listeGoogle?.adres ?? "Google Haritalar kaydı") : KAYIT_KAYNAK_ADLARI[kayit.kaynak];

  return (
    <aside className={`${PANEL} flex flex-col xl:sticky xl:top-5`} aria-label="Kayıt ayrıntıları" id="kayit-detayi">
      <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className={`text-xl font-bold ${kayit.isletmeAdi || !google ? "" : "text-metin-ikincil"}`}>{baslik}</h2>
          <span className="text-[13px] text-soluk">{altBaslik}</span>
          {veri.engelli && kayit.iletiIzni !== "ret" && (
            <p className="mt-1 text-[13px] text-tehlike">
              <DurumRozeti ton="tehlike">Engelli</DurumRozeti> Bu kişinin adreslerinden biri engel listesinde (daha önce
              ret verilmiş); hiçbir kanaldan ileti gönderilmez.
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Ayrıntıları kapat"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-kenar bg-white hover:bg-zemin"
          onClick={props.onKapat}
        >
          <Simge ad="kapat" boyut={16} />
        </button>
      </div>

      {/* Hızlı eylemler: Ara (numara kayıttan ya da Google'dan), E-posta (kayıtta adres varsa), WhatsApp. */}
      <div className="flex flex-col gap-2 px-6 pb-5">
        <div className="grid grid-cols-2 gap-2">
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
          <button
            type="button"
            className="dugme"
            disabled={!kayit.eposta || mesgul}
            title={kayit.eposta ? undefined : "E-posta adresi yok; Genel sekmesinden ekleyebilirsiniz"}
            onClick={async () => {
              if (kayit.eposta && (await olayEkle({ tur: "eposta" }, "iletisim"))) window.location.href = `mailto:${kayit.eposta}`;
            }}
          >
            E-posta
          </button>
        </div>
        <WhatsappButonu key={`wa-${kayit.iletiIzni}-${kayit.aliciTuru}-${kayit.ekTelefon ?? ""}`} id={kayit.id} onGonderildi={yenile} />
        <MesajGoster mesaj={mesaj} alan="iletisim" />
      </div>

      <div className="px-6">
        <Sekmeler etiket="Kayıt ayrıntıları" onEk={`kayit-${kayit.id}`} sekmeler={PANEL_SEKMELERI} secili={sekme} onSec={setSekme} />
      </div>

      {sekme === "genel" && (
        <div
          role="tabpanel"
          id={sekmePaneliId(`kayit-${kayit.id}`, "genel")}
          aria-labelledby={sekmeId(`kayit-${kayit.id}`, "genel")}
          className="flex flex-col gap-5 px-6 pt-5 pb-6"
        >
          <div className="flex flex-col gap-2" role="group" aria-labelledby={`durum-${kayit.id}`}>
            <span id={`durum-${kayit.id}`} className="font-semibold">
              Durum
            </span>
            <div className="flex flex-wrap gap-1.5">
              {KAYIT_DURUMLARI.map((d) => (
                <SecimCipi
                  key={d}
                  secili={kayit.durum === d}
                  disabled={mesgul}
                  onClick={() => {
                    if (d !== kayit.durum) void guncelle("durum", { durum: d }, "Durum güncellendi.");
                  }}
                >
                  {KAYIT_DURUM_ADLARI[d]}
                </SecimCipi>
              ))}
            </div>
            <MesajGoster mesaj={mesaj} alan="durum" />
          </div>

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
              {/* Places içeriği bu alana aktarılmaz: alan kullanıcının yazdığıyla gelir, ipucu yalnızca genel bir cümle. */}
              <input
                name="isletmeAdi"
                defaultValue={kayit.isletmeAdi ?? ""}
                maxLength={160}
                className="girdi"
                placeholder={AD_GIRME_IPUCU}
                autoComplete="off"
              />
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
            <MesajGoster mesaj={mesaj} alan="bilgi" />
            <button type="submit" className="dugme-ana self-start" disabled={mesgul}>
              Kaydet
            </button>
          </form>

          {kayit.notlar && (
            <KayitNotu
              key={`kayit-notu-${surum}`}
              notlar={kayit.notlar}
              mesgul={mesgul}
              onKaydet={(notlar) => guncelle("kayitNotu", { notlar }, "Kayıt notu kaydedildi.")}
            />
          )}
          <MesajGoster mesaj={mesaj} alan="kayitNotu" />

          <div className="flex flex-col gap-2.5 rounded-[10px] bg-ic-kutu p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">İletişim bilgileri</span>
              {google && <span className="text-xs text-soluk">Google Haritalar</span>}
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
            ) : canliAtlandi && !canli ? (
              <div className="flex flex-col items-start gap-2 rounded-md bg-zemin p-3 text-sm">
                <p>
                  {canliAtlandi === "ilgilenmiyor"
                    ? "Bu kayıt ilgilenilmiyor olarak işaretli; Google bilgileri kendiliğinden çekilmedi."
                    : OTOMATIK_GOSTERIM_SINIRI_METNI}
                </p>
                <button type="button" className="dugme" disabled={mesgul} onClick={() => void googleBilgisiGetir()}>
                  Google bilgilerini göster
                </button>
              </div>
            ) : (
              <p role="alert" className="text-sm text-tehlike">
                {canli?.durum === "kota"
                  ? `${KOTA_DOLDU_MESAJI} İşletme bilgileri (ad, adres, telefon) gösterilemiyor; aşağıdaki kendi verileriniz ve işlemler kullanılabilir.`
                  : canli?.durum === "bulunamadi"
                    ? "Bu işletme Google'da artık bulunmuyor."
                    : `İşletme bilgisi alınamadı${canli?.durum === "hata" ? `: ${canli.mesaj}` : "."}`}
              </p>
            )}
            {yer?.googleMapsUri && (
              <a href={yer.googleMapsUri} target="_blank" rel="noopener noreferrer" className="text-[13px] text-ana underline">
                Google Haritalar&apos;da aç
              </a>
            )}
            {google && <GoogleAtfi />}
          </div>

          <div className="border-t border-cizgi pt-4">
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
          </div>
        </div>
      )}

      {sekme === "izin" && (
        <div
          role="tabpanel"
          id={sekmePaneliId(`kayit-${kayit.id}`, "izin")}
          aria-labelledby={sekmeId(`kayit-${kayit.id}`, "izin")}
          className="flex flex-col gap-4 px-6 pt-2 pb-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cizgi py-4">
            <div>
              <p className="font-semibold">E-posta ve SMS</p>
              <p className="text-[13px] text-soluk">Alıcı türü: {ALICI_TURU_ADLARI[kayit.aliciTuru]}</p>
            </div>
            <DurumRozeti ton={IZIN_TONU[kayit.iletiIzni]}>
              {kayit.iletiIzni === "ret" ? retMetni : ILETI_IZNI_ADLARI[kayit.iletiIzni]}
            </DurumRozeti>
          </div>
          <div className="flex flex-wrap gap-2">
          {kayit.iletiIzni === "bekliyor" && (
            <button type="button" className="dugme" disabled={mesgul} onClick={() => void guncelle("izin", { iletiIzni: "onayli" }, "İzin kaydedildi.")}>
              İzin alındı
            </button>
          )}
          {kayit.iletiIzni !== "ret" && (
            <RetDugmesi
              ad={baslik}
              etiket="İleti reddi işaretle"
              disabled={mesgul}
              onOnay={() => void guncelle("izin", { iletiIzni: "ret", retOnayi: true }, "İleti reddi kaydedildi.")}
            />
          )}
          </div>
          <MesajGoster mesaj={mesaj} alan="izin" />
          <WhatsappIzinBolumu
            key={`wa-izin-${surum}-${veri.whatsapp.izin}`}
            id={kayit.id}
            ad={baslik}
            retMetni={retMetni}
            whatsapp={veri.whatsapp}
            bireysel={kayit.aliciTuru === "bireysel"}
            onDegisti={yenile}
          />
        </div>
      )}

      {sekme === "gecmis" && (
        <div
          role="tabpanel"
          id={sekmePaneliId(`kayit-${kayit.id}`, "gecmis")}
          aria-labelledby={sekmeId(`kayit-${kayit.id}`, "gecmis")}
          className="flex flex-col gap-3 px-6 pt-5 pb-6"
        >
          <form
            key={`not-${olaylar.length}`}
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const aciklama = String(new FormData(e.currentTarget).get("metin") ?? "").trim();
              if (aciklama) void olayEkle({ tur: "not", aciklama }, "not", "Not eklendi.");
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
                  {/* Eski kayıtlarda bilgi değişiklikleri "not" türüyle (sistem) yazılmıştı. */}
                  {tarihYaz(o.tarih)} · {OLAY_TURU_ADLARI[o.tur === "not" && o.sistem ? "bilgi" : o.tur]}
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
        </div>
      )}
    </aside>
  );
}

/** Kişi eklerken ya da içe aktarırken girilen tek, kalıcı not (leads.notlar). Tarihli notlar "Not ekle" ile eklenir. */
function KayitNotu(props: { notlar: string; mesgul: boolean; onKaydet: (notlar: string) => Promise<boolean> }) {
  const [duzenle, setDuzenle] = useState(false);
  return (
    <div className="mb-3 rounded-md bg-zemin p-3 text-sm">
      <p className="mb-1 text-xs text-soluk">Kayıt notu (kişi eklenirken ya da içe aktarılırken girilen)</p>
      {duzenle ? (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            const metin = String(new FormData(e.currentTarget).get("notlar") ?? "");
            if (await props.onKaydet(metin)) setDuzenle(false);
          }}
        >
          <label className="sr-only" htmlFor="kayit-notu">
            Kayıt notunu düzenle
          </label>
          <textarea id="kayit-notu" name="notlar" defaultValue={props.notlar} rows={3} maxLength={5000} className="girdi" />
          <div className="flex gap-2">
            <button type="submit" className="dugme-ana" disabled={props.mesgul}>
              Kaydet
            </button>
            <button type="button" className="dugme" onClick={() => setDuzenle(false)}>
              Vazgeç
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="whitespace-pre-wrap">{props.notlar}</p>
          <button type="button" className="mt-1 text-xs text-ana underline" onClick={() => setDuzenle(true)}>
            Düzenle
          </button>
        </>
      )}
    </div>
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
  // Görünür alana kaydırılır; başarılıysa sağ üstte bildirim olarak da gösterilir.
  return <SonucMesaji key={mesaj.metin} tur={mesaj.tur} metin={mesaj.metin} />;
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
        <p className="text-xs text-soluk">Numara kayıtta yok; açarken Google&apos;dan alınır, saklanmaz.</p>
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
  /** Ret verilmişse "Ret · <tarih> · <nasıl>". */
  retMetni: string;
  whatsapp: WhatsappKisiDto;
  bireysel: boolean;
  onDegisti: () => Promise<void>;
}) {
  const w = props.whatsapp;
  const [duzenle, setDuzenle] = useState(false);
  const [izin, setIzin] = useState<"var" | "yok">(w.izin === "var" ? "var" : "yok");
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  async function kaydet(govde: { izin: string } & Record<string, unknown>) {
    setHata(null);
    setMesgul(true);
    const s = await apiIstek(`/api/kayitlar/${props.id}/whatsapp-izni`, { method: "PUT", govde });
    setMesgul(false);
    if (!s.ok) return setHata(s.hata);
    bildir(govde.izin === "ret" ? "İleti reddi kaydedildi." : "WhatsApp izni kaydedildi.");
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
          {w.izin === "ret" ? props.retMetni : WHATSAPP_IZNI_ADLARI[w.izin]}
        </span>
        {/* Ret verilmişse eski izin kaynağı gösterilmez. */}
        {w.izin !== "ret" && w.izinKaynagi && ` · ${WHATSAPP_IZIN_KAYNAK_ADLARI[w.izinKaynagi]}`}
        {w.izin !== "ret" && w.izinTarihi && ` · ${tarihYaz(w.izinTarihi)}`}
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
