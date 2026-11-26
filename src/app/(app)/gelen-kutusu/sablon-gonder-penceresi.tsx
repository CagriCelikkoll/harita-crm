"use client";
// Gelen kutusu "Şablon gönder" penceresi (yonlendirme.tsx menüsünden, yalnızca açılınca yüklenir: next/dynamic). Tek
// alıcılı kampanya oluşturur (servisler/yonlendirme.ts): numara (düzenlenebilir, normalize gösterilir), ad, alıcı türü,
// gönderen numara, şablon + görsel (kampanya sihirbazının Mesaj adımındaki bileşenler), zorunlu izin seçimi ve önizleme.
// Her değişiklikte sunucu ön kontrolü (gönderimle aynı kurallar, hiçbir şey yazmaz) çalışır; engel varsa nedeni
// gösterilir ve "Gönder" kapalı kalır. Numara gövdede gider (adreste görünmez).
import { useEffect, useState } from "react";
import { bildir } from "@/components/bildirim";
import { Diyalog } from "@/components/arayuz/diyalog";
import { DonerGosterge } from "@/components/arayuz/doner-gosterge";
import { Dugme } from "@/components/arayuz/dugme";
import { cepMi, telefonBicimle, telefonNormallestir } from "@/lib/adres-normal";
import { apiIstek } from "@/lib/api-istemci";
import {
  ALICI_TURLERI,
  ALICI_TURU_ADLARI,
  WHATSAPP_IZIN_KAYNAK_ADLARI,
  YONLENDIRME_IZIN_KAYNAKLARI,
  yonlendirmeIzniSecilebilir,
  type AliciTuru,
  type YonlendirmeIzinKaynagi,
} from "@/lib/mesajlasma";
import { yerelTelefon } from "@/lib/telefon-algilama";
import { degiskenAnahtari, GORSEL_BASLIK, type DegiskenEslemi } from "@/lib/whatsapp-api";
import type { KampanyaGorselDto } from "@/server/servisler/kampanya-gorseli";
import type { YonlendirmeBilgisi, YonlendirmeOzeti, YonlendirmeSonucu } from "@/server/servisler/yonlendirme";
import { WhatsappSablonSecimi } from "../kampanyalar/yeni/kampanya-sihirbazi";
import { WhatsappOnizlemesi } from "../kampanyalar/yeni/mesaj-onizlemesi";

export function SablonGonderPenceresi(props: {
  bilgi: YonlendirmeBilgisi;
  sohbetId: string;
  onKapat: () => void;
  onGonderildi: (s: YonlendirmeSonucu) => void;
}) {
  const [telefon, setTelefon] = useState(props.bilgi.yerel);
  const [bilgi, setBilgi] = useState(props.bilgi);
  const [ad, setAd] = useState("");
  const [aliciTuru, setAliciTuru] = useState<AliciTuru | "">("");
  const numaralar = props.bilgi.numaralar;
  const [baglantiId, setBaglantiId] = useState(
    numaralar.find((n) => n.id === props.bilgi.varsayilanNumara && n.numaraDogrulandi)?.id ?? numaralar.find((n) => n.numaraDogrulandi)?.id ?? "",
  );
  const [sablonId, setSablonId] = useState("");
  const [eslem, setEslem] = useState<DegiskenEslemi>({});
  const [gorsel, setGorsel] = useState<KampanyaGorselDto | null>(null);
  const [izin, setIzin] = useState<YonlendirmeIzinKaynagi | "">("");
  const [iysBeyani, setIysBeyani] = useState(false);
  const [ozet, setOzet] = useState<{ anahtar: string; ozet: YonlendirmeOzeti | null; hata: string | null } | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [gonderHatasi, setGonderHatasi] = useState<string | null>(null);

  const normal = telefonNormallestir(telefon);
  const gecerli = cepMi(normal);
  // Numara düzenlenince kayıt yeniden aranır (kayıtlıysa alıcı türü kayıttan gelir).
  useEffect(() => {
    if (!gecerli || normal === bilgi.telefon) return;
    let iptal = false;
    const z = setTimeout(async () => {
      const y = await apiIstek<YonlendirmeBilgisi>("/api/yonlendirme/bilgi", { method: "POST", govde: { sohbetId: props.sohbetId, telefon: normal } });
      if (!iptal && y.ok) setBilgi(y.veri);
    }, 300);
    return () => {
      iptal = true;
      clearTimeout(z);
    };
  }, [gecerli, normal, bilgi.telefon, props.sohbetId]);

  const kayit = gecerli && bilgi.telefon === normal ? bilgi.kayit : null;
  const etkinTur: AliciTuru | "" = kayit?.aliciTuru ?? aliciTuru;
  const izinGecerli = izin !== "" && etkinTur !== "" && yonlendirmeIzniSecilebilir(izin, etkinTur);
  const numara = numaralar.find((n) => n.id === baglantiId) ?? null;
  const sablon = numara?.sablonlar.find((s) => s.id === sablonId) ?? null;
  const gorselGerekli = sablon?.baslikBicimi === GORSEL_BASLIK;
  const sabitBos = Boolean(
    sablon?.degiskenler.some((dg) => {
      const a = eslem[degiskenAnahtari(dg)];
      return a?.kaynak === "sabit" && !a.deger?.trim();
    }),
  );
  const eksik = !gecerli
    ? "Türkiye cep telefonu numarası girin (ör. 0532 123 45 67)."
    : !etkinTur
      ? "Alıcı türünü seçin."
      : !baglantiId
        ? "Gönderen WhatsApp numarasını seçin."
        : !sablon
          ? "WhatsApp şablonu seçin."
          : gorselGerekli && !gorsel
            ? "Bu şablon görselli: JPEG ya da PNG bir görsel yükleyin."
            : sabitBos
              ? "Sabit metinli değişkenlerin metnini girin."
              : !izinGecerli
                ? "İzin kaynağını seçin."
                : null;

  const girdi = {
    sohbetId: props.sohbetId,
    telefon: normal ?? telefon,
    ad: ad.trim() || null,
    aliciTuru: etkinTur || undefined,
    izinKaynagi: izin || undefined,
    iysBeyani: etkinTur === "bireysel" && iysBeyani,
    baglantiId,
    sablonId,
    gorselId: gorselGerekli ? gorsel?.id : undefined,
    degiskenEslem: eslem,
  };
  const anahtar = JSON.stringify(girdi);
  // Ön kontrol: alanlar tamamken sunucuda (gönderimle aynı kurallar; hiçbir şey yazmaz). Eski yanıt yeni girdiye yazılmaz.
  useEffect(() => {
    if (eksik) return;
    let iptal = false;
    const z = setTimeout(async () => {
      const y = await apiIstek<{ ozet: YonlendirmeOzeti }>("/api/yonlendirme/ozet", { method: "POST", govde: JSON.parse(anahtar) });
      if (iptal) return;
      setOzet({ anahtar, ozet: y.ok ? y.veri.ozet : null, hata: y.ok ? null : y.hata });
    }, 350);
    return () => {
      iptal = true;
      clearTimeout(z);
    };
  }, [anahtar, eksik]);
  const guncelOzet = !eksik && ozet?.anahtar === anahtar ? ozet : null;
  const engel = guncelOzet ? (guncelOzet.hata ?? guncelOzet.ozet?.engel ?? null) : null;
  const gonderilebilir = Boolean(guncelOzet?.ozet && !engel);

  const gonder = async () => {
    setGonderHatasi(null);
    setGonderiliyor(true);
    const y = await apiIstek<YonlendirmeSonucu>("/api/yonlendirme", { method: "POST", govde: girdi });
    setGonderiliyor(false);
    if (!y.ok) return setGonderHatasi(y.hata);
    bildir(`Şablon gönderime alındı: ${yerelTelefon(normal!)}.`);
    props.onGonderildi(y.veri);
  };

  return (
    <Diyalog
      acik
      genislik="genis"
      onKapat={props.onKapat}
      baslik="Şablon gönder"
      eylemler={
        <>
          <Dugme onClick={props.onKapat} disabled={gonderiliyor}>
            Vazgeç
          </Dugme>
          <Dugme tur="ana" yukleniyor={gonderiliyor} disabled={!gonderilebilir} onClick={() => void gonder()}>
            Gönder
          </Dugme>
        </>
      }
    >
      <p className="text-ufak text-soluk">
        Tek alıcılı kampanya olarak kaydedilir (Kampanyalar → &quot;Tekil&quot;); teslim durumu ve Meta ücreti orada izlenir. RET, engel
        listesi, WhatsApp izni, test modu, günlük sınır ve Meta payı kuralları toplu kampanyadaki gibi uygulanır.
      </p>
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="etiket">
              Numara
              <input value={telefon} onChange={(e) => setTelefon(e.target.value)} inputMode="tel" maxLength={40} className="girdi" aria-describedby="yon-numara-not" />
              <span id="yon-numara-not" className={`text-xs font-normal ${gecerli ? "text-soluk" : "text-tehlike"}`}>
                {gecerli ? `Gönderilecek: ${telefonBicimle(normal!)}` : "Türkiye cep telefonu numarası değil."}
              </span>
            </label>
            <label className="etiket">
              {/* Tek satır: etiket sütun düzeninde; açıklama ayrı satıra düşüp kutuyu Numara'nın altına itmesin. */}
              <span>
                Ad <span className="text-xs font-normal text-soluk">(isteğe bağlı)</span>
              </span>
              <input value={kayit ? kayit.ad : ad} onChange={(e) => setAd(e.target.value)} disabled={Boolean(kayit)} maxLength={120} className="girdi" />
              <span className="text-xs font-normal text-soluk">{kayit ? "Kayıtlı kişi: ad kayıttan." : "Kayıt yoksa bu adla açılır."}</span>
            </label>
          </div>

          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium text-soluk">Alıcı türü</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {ALICI_TURLERI.map((t) => (
                <label key={t} className="inline-flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
                  <input
                    type="radio"
                    name="yon-alici-turu"
                    value={t}
                    checked={etkinTur === t}
                    disabled={Boolean(kayit)}
                    onChange={() => setAliciTuru(t)}
                  />
                  {ALICI_TURU_ADLARI[t]}
                </label>
              ))}
            </div>
            {kayit && <span className="text-xs text-soluk">Numara kayıtlı ({kayit.ad}); alıcı türü kayıttan gelir.</span>}
          </fieldset>

          <label className="etiket">
            Gönderen numara
            <select value={baglantiId} onChange={(e) => { setBaglantiId(e.target.value); setSablonId(""); setEslem({}); setGorsel(null); }} className="girdi">
              <option value="">Seçin</option>
              {numaralar.map((n) => (
                <option key={n.id} value={n.id} disabled={!n.numaraDogrulandi}>
                  {n.etiket}
                  {n.testModu ? " (test modu)" : ""}
                  {!n.numaraDogrulandi ? " — doğrulanmadı" : ""}
                </option>
              ))}
            </select>
          </label>

          {numara && (
            <WhatsappSablonSecimi
              numara={numara.etiket}
              sablonlar={numara.sablonlar}
              sablonId={sablonId}
              eslem={eslem}
              onSablon={(id) => {
                setSablonId(id);
                setEslem({});
                setGorsel(null);
              }}
              onEslem={setEslem}
              gorsel={gorsel}
              onGorsel={setGorsel}
            />
          )}

          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium text-soluk">İzin (zorunlu)</legend>
            {YONLENDIRME_IZIN_KAYNAKLARI.map((k) => {
              const secilebilir = etkinTur !== "" && yonlendirmeIzniSecilebilir(k, etkinTur);
              return (
                <label key={k} className={`inline-flex min-h-11 items-start gap-2 text-sm sm:min-h-0 ${secilebilir ? "" : "text-soluk"}`}>
                  <input
                    type="radio"
                    name="yon-izin"
                    value={k}
                    className="mt-1"
                    checked={izin === k && secilebilir}
                    disabled={!secilebilir}
                    onChange={() => setIzin(k)}
                  />
                  <span>
                    {WHATSAPP_IZIN_KAYNAK_ADLARI[k]}
                    {k === "musteri_yonlendirdi" && etkinTur === "bireysel" && (
                      <span className="block text-xs">Bireysel kişide seçilemez: kişinin kendi izni gerekir.</span>
                    )}
                  </span>
                </label>
              );
            })}
            {etkinTur === "bireysel" && (
              <label className="inline-flex min-h-11 items-start gap-2 text-sm sm:min-h-0">
                <input type="checkbox" className="mt-1" checked={iysBeyani} onChange={(e) => setIysBeyani(e.target.checked)} />
                <span>
                  Bu izin İYS&apos;ye kaydedildi
                  <span className="block text-xs text-soluk">İYS kontrolü açıkken bireysel kişiye beyan olmadan şablon gitmez.</span>
                </span>
              </label>
            )}
            <span className="text-xs text-soluk">Seçilen kaynak, tarih ve işlemi yapan kullanıcı kişinin kaydına yazılır.</span>
          </fieldset>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <WhatsappOnizlemesi numara={numara?.etiket ?? ""} sablon={sablon} eslem={eslem} gorselAdresi={gorselGerekli ? (gorsel?.adres ?? null) : null} />
          <div aria-live="polite" className="flex flex-col gap-2 text-ufak">
            {eksik ? (
              <p className="text-soluk">{eksik}</p>
            ) : !guncelOzet ? (
              <DonerGosterge boyut={14} etiket="Kurallar kontrol ediliyor…" />
            ) : engel ? (
              <p role="alert" className="rounded-md bg-tehlike-acik px-3 py-2 text-tehlike">
                {engel}
              </p>
            ) : (
              guncelOzet.ozet && (
                <>
                  <p className="rounded-md bg-ana-acik px-3 py-2 text-ana-koyu">
                    Gönderilebilir{guncelOzet.ozet.yeniKayit ? "; numara için yeni kayıt açılacak (kaynak: Yönlendirme)" : ""}.
                  </p>
                  {guncelOzet.ozet.onizleme && (
                    <div>
                      <p className="mb-1 font-semibold">Gidecek metin</p>
                      <p className="rounded-md border border-kenar bg-white px-3 py-2 break-words whitespace-pre-wrap">{guncelOzet.ozet.onizleme}</p>
                    </div>
                  )}
                  {guncelOzet.ozet.tahminiUcretUsd !== null && (
                    <p className="text-soluk">
                      Tahmini Meta ücreti: {guncelOzet.ozet.tahminiUcretUsd.toLocaleString("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 4 })}
                      {guncelOzet.ozet.fiyatTarihi ? ` (fiyat: ${guncelOzet.ozet.fiyatTarihi})` : ""}
                    </p>
                  )}
                  {guncelOzet.ozet.testModu && <p className="text-soluk">Numara test modunda: yalnızca test numaralarına gider.</p>}
                </>
              )
            )}
            {gonderHatasi && (
              <p role="alert" className="rounded-md bg-tehlike-acik px-3 py-2 text-tehlike">
                {gonderHatasi}
              </p>
            )}
          </div>
        </div>
      </div>
    </Diyalog>
  );
}
