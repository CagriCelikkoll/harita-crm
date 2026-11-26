"use client";
// Yeni kampanya sihirbazı (yeni düzen): 1 Kanal · 2 Alıcılar · 3 Mesaj · 4 Gönder.
// - Adım adreste (?adim=) tutulur; tarayıcının geri düğmesi önceki adıma döner. Taslak bu bileşende kalır; sayfa
//   yenilenirse ilk eksik adıma dönülür (ileri atlanamaz: lib/kampanya-sihirbazi.ts).
// - Düzen: geniş ekranda (≥1024 px) solda adım içeriği, sağda yapışkan mesaj önizlemesi (Alıcılar, Mesaj ve Gönder
//   adımlarında); dar ekranda önizleme adım içeriğinin altında, "Önizlemeyi göster / gizle" ile açılır. Geri / İleri /
//   Gönder düğmeleri sayfanın altındaki yapışkan çubukta.
// - Alıcılar adımında seçime göre canlı sayı rozeti (özet uç noktası, gecikmeli; geçici metinle, alıcı kuralları metne
//   bağlı değildir). WhatsApp'ta gönderilecek sayı şablona bağlı olduğundan rozet filtreye uyan kayıt sayısını gösterir;
//   kesin sayı son adımda hesaplanır.
// - Son adımın gövdesi bugünkü oluşturma API'siyle aynıdır; alıcı kuralları ve doğrulama sunucuda uygulanır.
// - WhatsApp (API): onaylı şablon + değişken eşleme; özet test modunu, Meta limitinin payını ve tahmini Meta ücretini
//   (yalnızca yönetici) gösterir.
import { DonerGosterge } from "@/components/arayuz/doner-gosterge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DurumRozeti } from "@/components/arayuz/rozet";
import { SecimCipi } from "@/components/arayuz/sekmeler";
import { Simge } from "@/components/arayuz/simge";
import { apiIstek } from "@/lib/api-istemci";
import { sayiYaz } from "@/lib/bicim";
import { haricSatirlari, metaPayiKalani } from "@/lib/kampanya-gorunumu";
import { adimCoz, adimEngeli, KAMPANYA_ADIMLARI, type AdimNo, type SihirbazTaslagi } from "@/lib/kampanya-sihirbazi";
import { ALICI_TURLERI, ALICI_TURU_ADLARI, IYS_KAPALI_UYARISI, KANAL_ADLARI, type HaricNedeni, type KuyrukKanali } from "@/lib/mesajlasma";
import {
  DEGISKEN_KAYNAK_ADLARI,
  DEGISKEN_KAYNAKLARI,
  degiskenAnahtari,
  GORSEL_BASLIK,
  KAMPANYA_GORSEL_AZAMI_BAYT,
  KALITE_ADLARI,
  SABLON_KATEGORI_ADLARI,
  type DegiskenEslemi,
  type DegiskenKaynagi,
} from "@/lib/whatsapp-api";
import { KAYIT_DURUM_ADLARI, KAYIT_DURUMLARI } from "@/lib/sabitler";
import { sablonDoldur } from "@/lib/sablon";
import { smsUzunlugu, type SmsKodlama } from "@/lib/sms-uzunluk";
import type { MesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import type { KampanyaOzeti } from "@/server/servisler/kampanya";
import type { KampanyaGorselDto } from "@/server/servisler/kampanya-gorseli";
import type { NumaraOzeti, SablonDto } from "@/server/servisler/whatsapp-api";
import { MetinOnizlemesi, SablonAyrintilari, WhatsappOnizlemesi } from "./mesaj-onizlemesi";

const ORNEK_SABLON = "Merhaba {isletme},\n\n";

const KANAL_ACIKLAMASI: Record<KuyrukKanali, string> = {
  eposta: "Kendi alan adınızdaki e-posta hesabından.",
  sms: "Netgsm hesabınız ve onaylı SMS başlığınızla.",
  whatsapp_api: "Meta'da onaylı şablonla (WhatsApp Business).",
};
const KANAL_AYARI: Record<KuyrukKanali, string> = { eposta: "/ayarlar/eposta", sms: "/ayarlar/sms", whatsapp_api: "/ayarlar/whatsapp" };

/** Alıcılar adımındaki canlı sayım; `anahtar` hangi kanal + filtre için hesaplandığını söyler (eskiyse "hesaplanıyor"). */
type AliciOzeti = { anahtar: string; gonderilecek: number; toplamAday: number; haricler: Record<HaricNedeni, number> };

export function KampanyaSihirbazi(props: {
  /** Adresteki ?adim= ve ?kanal= (ör. Ayarlar > WhatsApp "Test kampanyası oluştur"). */
  adim: string | null;
  ilkKanal: KuyrukKanali | null;
  etiketler: string[];
  saglayicilar: MesajlasmaAyarlariDto["saglayicilar"];
  eksikAyarlar: string[];
  /** Her SMS'e eklenen gönderen + ret yolu (sunucuda hesaplanır). */
  smsAltbilgisi: string;
  /**
   * WhatsApp (API): yalnızca yönetici başlatır. Gönderen numaralar ve her numaranın (WABA'sının) kullanılabilir
   * (onaylı, destekli) şablonları.
   */
  whatsapp: { yonetici: boolean; ilkNumara?: string | null; numaralar: (NumaraOzeti & { sablonlar: SablonDto[] })[] };
}) {
  const router = useRouter();
  const [kanal, setKanal] = useState<KuyrukKanali | null>(props.ilkKanal);
  // ?numara= (Ayarlar > WhatsApp "Test kampanyası oluştur") ya da tek numara varsa kendiliğinden seçilir (yine de görünür).
  const [baglantiId, setBaglantiId] = useState(
    props.whatsapp.numaralar.find((n) => n.id === props.whatsapp.ilkNumara)?.id ??
      (props.whatsapp.numaralar.length === 1 ? props.whatsapp.numaralar[0].id : ""),
  );
  const [sablonId, setSablonId] = useState("");
  const [eslem, setEslem] = useState<DegiskenEslemi>({});
  // Görselli şablon: yüklenen kampanya görseli (sunucuda doğrulanmış; önizleme adresiyle).
  const [gorsel, setGorsel] = useState<KampanyaGorselDto | null>(null);
  const [ad, setAd] = useState("");
  const [konu, setKonu] = useState("");
  const [sablon, setSablon] = useState(ORNEK_SABLON);
  const [bosHitap, setBosHitap] = useState("");
  const [durum, setDurum] = useState("");
  const [etiket, setEtiket] = useState("");
  const [aliciTuru, setAliciTuru] = useState("");
  const [testModu, setTestModu] = useState(false);
  const [zamanla, setZamanla] = useState(false);
  const [tarih, setTarih] = useState("");
  const [aliciOzeti, setAliciOzeti] = useState<AliciOzeti | null>(null);
  const [sayimHatasi, setSayimHatasi] = useState<string | null>(null);
  const [ozet, setOzet] = useState<KampanyaOzeti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  // Dar ekranda önizleme kapalı başlar; geniş ekranda her zaman görünür (CSS).
  const [onizlemeAcik, setOnizlemeAcik] = useState(false);

  const wa = kanal === "whatsapp_api";
  const saglayiciTanimli = (k: KuyrukKanali) =>
    k === "whatsapp_api" ? props.whatsapp.numaralar.some((n) => n.numaraDogrulandi) : props.saglayicilar[k].tanimli;
  const secilenNumara = props.whatsapp.numaralar.find((n) => n.id === baglantiId) ?? null;
  // Yalnızca seçilen gönderen numaranın WABA'sının şablonları (sunucu ayrıca denetler).
  const numaraSablonlari = (secilenNumara?.sablonlar ?? []).filter((x) => x.wabaId === secilenNumara?.wabaId);
  const degisti = <T,>(ayarla: (v: T) => void) => (v: T) => {
    ayarla(v);
    setOzet(null); // taslak değişince özet geçersiz
  };
  const filtre = {
    ...(durum ? { durum } : {}),
    ...(etiket ? { etiket } : {}),
    ...(aliciTuru ? { aliciTuru } : {}),
  };

  const secilenSablon = numaraSablonlari.find((x) => x.id === sablonId) ?? null;
  const gorselGerekli = secilenSablon?.baslikBicimi === GORSEL_BASLIK;
  const taslak: SihirbazTaslagi = {
    gorselGerekli,
    gorselId: gorsel?.id ?? null,
    kanal,
    baglantiId,
    ad,
    konu,
    sablon,
    sablonId,
    sabitDegerler: (secilenSablon?.degiskenler ?? [])
      .map((dg) => eslem[degiskenAnahtari(dg)])
      .filter((a) => a?.kaynak === "sabit")
      .map((a) => a?.deger ?? ""),
    aliciSayisi: wa ? null : (aliciOzeti?.gonderilecek ?? null),
    ozetVar: ozet !== null,
  };
  const adim = adimCoz(props.adim, taslak);
  const engel = adim < 4 ? adimEngeli(adim, taslak) : null;
  const git = (n: AdimNo) => {
    setHata(null);
    router.push(`/kampanyalar/yeni?adim=${n}`, { scroll: false });
  };

  const girdi = () => ({
    kanal,
    ad,
    konu: kanal === "eposta" ? konu : undefined,
    sablon: wa ? undefined : sablon,
    bosIsimHitabi: !wa && bosHitap ? bosHitap : undefined,
    ...(wa ? { baglantiId, sablonId, degiskenEslem: eslem, ...(gorselGerekli && gorsel ? { gorselId: gorsel.id } : {}) } : {}),
    filtre,
    testModu,
    planlananTarih: zamanla && tarih ? new Date(tarih).toISOString() : null,
  });

  // Alıcılar adımı: canlı sayı (geçici ad, konu ve metinle; alıcı kuralları metne bağlı değil). Seçim her değişince
  // 300 ms beklenir, önceki istek iptal edilir. WhatsApp'ın kuralları şablona bağlı olduğundan orada yalnızca filtreye
  // uyan kayıt sayısı (toplamAday; kanaldan bağımsız) kullanılır.
  const sayimAnahtari = JSON.stringify({ kanal, filtre });
  useEffect(() => {
    if (!kanal) return;
    const { filtre: f } = JSON.parse(sayimAnahtari) as { filtre: Record<string, string> };
    const sayimKanali = kanal === "whatsapp_api" ? "eposta" : kanal;
    const iptal = new AbortController();
    const zamanlayici = setTimeout(async () => {
      const s = await apiIstek<{ ozet: KampanyaOzeti }>("/api/kampanyalar/ozet", {
        method: "POST",
        sinyal: iptal.signal,
        govde: { kanal: sayimKanali, ad: "Taslak", konu: "Taslak", sablon: "{isletme}", filtre: f, testModu: true },
      }).catch(() => null); // seçim değişti, istek iptal edildi
      if (!s || iptal.signal.aborted) return;
      if (s.ok) {
        setSayimHatasi(null);
        setAliciOzeti({ anahtar: sayimAnahtari, gonderilecek: s.veri.ozet.gonderilecek, toplamAday: s.veri.ozet.toplamAday, haricler: s.veri.ozet.haricler });
      } else setSayimHatasi(s.hata);
    }, 300);
    return () => {
      clearTimeout(zamanlayici);
      iptal.abort();
    };
  }, [kanal, sayimAnahtari]);

  async function ozetAl(degisiklik: { testModu?: boolean } = {}) {
    setMesgul(true);
    setHata(null);
    const s = await apiIstek<{ ozet: KampanyaOzeti }>("/api/kampanyalar/ozet", { method: "POST", govde: { ...girdi(), ...degisiklik } });
    setMesgul(false);
    if (s.ok) setOzet(s.veri.ozet);
    else setHata(s.hata);
    return s.ok;
  }

  async function baslat() {
    setMesgul(true);
    setHata(null);
    const s = await apiIstek<{ id: string }>("/api/kampanyalar", { method: "POST", govde: girdi() });
    if (s.ok) {
      router.push(`/kampanyalar/${s.veri.id}`);
      router.refresh();
    } else {
      setMesgul(false);
      setHata(s.hata);
    }
  }

  const ornekAdli = sablonDoldur(sablon, "Örnek İşletme", bosHitap);
  const ornekAdsiz = sablonDoldur(sablon, null, bosHitap);
  const gercekGonderim = ozet && !ozet.sandbox;
  const kanallar: KuyrukKanali[] = props.whatsapp.yonetici ? ["eposta", "sms", "whatsapp_api"] : ["eposta", "sms"];
  const onizlemeVar = adim >= 2 && kanal !== null;
  const baslatilamaz =
    !ozet ||
    mesgul ||
    ozet.gonderilecek === 0 ||
    (zamanla && !tarih) ||
    Boolean(gercekGonderim && ozet.eksikAyarlar.length) ||
    Boolean(gercekGonderim && ozet.whatsapp && (!ozet.whatsapp.baglantiVar || ozet.whatsapp.kalite === "RED" || ozet.whatsapp.hesapKilidi));

  return (
    <div className="flex max-w-[1240px] flex-col gap-4">
      {/* Tek satır (kırılmaz): dar ekranda yalnızca numaralar ve etkin adımın adı; diğer adların adı ekran okuyucuya
          kalır. Bağlantı çizgisi satır başında boşta kalmaz. */}
      <ol className="flex min-w-0 flex-nowrap items-center gap-x-1.5 text-sm" aria-label="Adımlar">
        {KAMPANYA_ADIMLARI.map((a, i) => {
          const durumu = a.no < adim ? "tamam" : a.no === adim ? "etkin" : "bekliyor";
          return (
            <li key={a.no} className="relative flex shrink-0 items-center gap-1.5" aria-current={durumu === "etkin" ? "step" : undefined}>
              {i > 0 && <span aria-hidden="true" className="h-px w-3 bg-kenar-alan sm:w-5" />}
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                  durumu === "tamam" ? "bg-ana text-white" : durumu === "etkin" ? "border-2 border-ana text-ana" : "border-2 border-kenar-alan text-soluk"
                }`}
              >
                {durumu === "tamam" ? <Simge ad="tik" boyut={14} kalinlik={3} /> : a.no}
              </span>
              <span
                className={`whitespace-nowrap ${durumu === "bekliyor" ? "text-soluk" : "font-semibold"} ${durumu === "etkin" ? "" : "max-sm:sr-only"}`}
              >
                {a.ad}
              </span>
            </li>
          );
        })}
      </ol>

      <div className={onizlemeVar ? "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6" : "flex flex-col gap-4"}>
        <section className="kart-cerceve min-w-0" aria-labelledby="adim-baslik">
          <div className="flex flex-col gap-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="adim-baslik" className="text-xl font-semibold">
                {adim === 1 ? "Hangi kanaldan göndereceksiniz?" : adim === 2 ? "Kimlere gidecek?" : adim === 3 ? "Mesaj" : "Gözden geçir ve gönder"}
              </h2>
              {adim === 2 && kanal && (
                <AliciRozeti wa={wa} ozet={aliciOzeti?.anahtar === sayimAnahtari ? aliciOzeti : null} hata={sayimHatasi} />
              )}
            </div>

            {adim === 1 && (
              <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Kanal">
                {kanallar.map((k) => {
                  const secili = kanal === k;
                  const bagli = saglayiciTanimli(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={secili}
                      onClick={() => {
                        degisti(setKanal)(k);
                        setAliciOzeti(null);
                      }}
                      className={`flex flex-col items-start gap-2 rounded-kart border p-5 text-left ${
                        secili ? "border-2 border-ana bg-ana-acik/40" : "border-kenar hover:bg-uzerine-gelme active:bg-basili"
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="text-base font-semibold">{KANAL_ADLARI[k]}</span>
                        <DurumRozeti ton={bagli ? "ana" : "notr"}>{bagli ? "Bağlı" : "Bağlı değil"}</DurumRozeti>
                      </span>
                      <span className="text-ufak text-soluk">{KANAL_ACIKLAMASI[k]}</span>
                      {!bagli && <span className="text-ufak text-uyari">Bağlanana kadar test modunda gönderilir (gerçek gönderim yapılmaz).</span>}
                    </button>
                  );
                })}
                {wa && props.whatsapp.numaralar.length > 0 && (
                  <div className="flex flex-col gap-2 sm:col-span-3" role="radiogroup" aria-label="Gönderen numara">
                    <span className="text-sm font-semibold">Gönderen numara</span>
                    <div className="flex flex-wrap gap-2">
                      {props.whatsapp.numaralar.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          role="radio"
                          aria-checked={baglantiId === n.id}
                          onClick={() => {
                            setOzet(null);
                            setBaglantiId(n.id);
                            // Şablonlar numaranın WhatsApp hesabına bağlı: numara değişince seçim sıfırlanır.
                            setSablonId("");
                            setEslem({});
                          }}
                          className={`flex flex-col items-start gap-1 rounded-kart border px-4 py-3 text-left ${
                            baglantiId === n.id ? "border-2 border-ana bg-ana-acik/40" : "border-kenar hover:bg-uzerine-gelme active:bg-basili"
                          }`}
                        >
                          <span className="font-semibold">{n.etiket}</span>
                          <span className="flex flex-wrap gap-1.5">
                            {!n.numaraDogrulandi && <DurumRozeti ton="tehlike">Doğrulanmadı</DurumRozeti>}
                            {n.testModu && <DurumRozeti ton="uyari">Test modu</DurumRozeti>}
                            {n.hesapKilidi && <DurumRozeti ton="tehlike">Hesap kilitli</DurumRozeti>}
                            {n.kalite === "RED" && <DurumRozeti ton="tehlike">Kalite düşük</DurumRozeti>}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {kanal && !saglayiciTanimli(kanal) && (
                  <p className="text-ufak text-soluk sm:col-span-3">
                    <Link href={KANAL_AYARI[kanal]} className="text-ana underline">
                      {KANAL_ADLARI[kanal]} bağlantısını Ayarlar&apos;da kurun
                    </Link>
                    .
                  </p>
                )}
              </div>
            )}

            {adim === 2 && (
              <div className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
                  <label className="etiket">
                    Kampanya adı
                    <input value={ad} onChange={(e) => degisti(setAd)(e.target.value)} required maxLength={120} className="girdi" />
                  </label>
                  <label className="etiket">
                    Etiket
                    <select value={etiket} onChange={(e) => degisti(setEtiket)(e.target.value)} className="girdi">
                      <option value="">Tümü</option>
                      {props.etiketler.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <SecimGrubu id="sihirbaz-durum" baslik="Durum">
                    {(["", ...KAYIT_DURUMLARI] as const).map((d) => (
                      <SecimCipi key={d || "tumu"} secili={durum === d} onClick={() => degisti(setDurum)(d)}>
                        {d ? KAYIT_DURUM_ADLARI[d] : "Tümü"}
                      </SecimCipi>
                    ))}
                  </SecimGrubu>
                  <SecimGrubu id="sihirbaz-alici-turu" baslik="Alıcı türü">
                    {(["", ...ALICI_TURLERI] as const).map((t) => (
                      <SecimCipi key={t || "tumu"} secili={aliciTuru === t} onClick={() => degisti(setAliciTuru)(t)}>
                        {t ? ALICI_TURU_ADLARI[t] : "Tümü"}
                      </SecimCipi>
                    ))}
                  </SecimGrubu>
                </div>
                {!wa && kanal && aliciOzeti?.anahtar === sayimAnahtari && (
                  <HaricListesi satirlar={haricSatirlari(kanal, aliciOzeti.haricler).sifirdanBuyuk} />
                )}
                {wa && (
                  <p className="text-ufak text-soluk">
                    WhatsApp&apos;ta gönderilecek kişi sayısı şablonun değişkenlerine ve WhatsApp izinlerine de bağlıdır; son adımda kesinleşir.
                  </p>
                )}
              </div>
            )}

            {adim === 3 && (
              <>
                {wa && (
                  <WhatsappSablonSecimi
                    numara={secilenNumara?.etiket ?? ""}
                    sablonlar={numaraSablonlari}
                    sablonId={sablonId}
                    eslem={eslem}
                    onSablon={(id) => {
                      setOzet(null);
                      setSablonId(id);
                      // Varsayılan: her değişken kaydın işletme adıyla dolar.
                      const yeni = numaraSablonlari.find((x) => x.id === id);
                      setEslem(Object.fromEntries((yeni?.degiskenler ?? []).map((dg) => [degiskenAnahtari(dg), { kaynak: "isletme_adi" as const }])));
                    }}
                    onEslem={(e) => {
                      setOzet(null);
                      setEslem(e);
                    }}
                    gorsel={gorsel}
                    onGorsel={(g) => {
                      setOzet(null);
                      setGorsel(g);
                    }}
                  />
                )}
                {!wa && kanal === "eposta" && (
                  <label className="etiket">
                    Konu
                    <input value={konu} onChange={(e) => degisti(setKonu)(e.target.value)} required maxLength={200} className="girdi" />
                  </label>
                )}
                {!wa && (
                  <>
                    <label className="etiket">
                      Mesaj
                      <textarea value={sablon} onChange={(e) => degisti(setSablon)(e.target.value)} required rows={7} maxLength={5000} className="girdi font-normal" />
                      <span className="text-xs font-normal text-soluk">
                        {"{isletme}"} kaydın &quot;İşletme adı (sizin kaydınız)&quot; alanıyla doldurulur. Google&apos;dan gelen ad mesaja
                        eklenmez.{" "}
                        {kanal === "eposta"
                          ? "Gönderen bilgileri ve abonelikten çıkma bağlantısı otomatik eklenir."
                          : "Gönderen unvanı ve ret yolu (RET yazıp …) otomatik eklenir."}
                      </span>
                    </label>
                    {kanal === "sms" && <SmsSayaci metin={`${ornekAdli}\n${props.smsAltbilgisi}`} altbilgi={props.smsAltbilgisi} />}
                    <label className="etiket">
                      İşletme adı girilmemişse hitap <span className="text-xs font-normal text-soluk">(isteğe bağlı)</span>
                      <input
                        value={bosHitap}
                        onChange={(e) => degisti(setBosHitap)(e.target.value)}
                        maxLength={80}
                        className="girdi"
                        placeholder='Boş bırakılırsa {isletme} kaldırılır: "Merhaba {isletme}," → "Merhaba,"'
                      />
                    </label>
                  </>
                )}
              </>
            )}

            {adim === 4 && ozet && kanal && (
              <GonderAdimi
                ozet={ozet}
                kanal={kanal}
                bosHitap={bosHitap}
                testModuSecilebilir={wa || saglayiciTanimli(kanal)}
                testModu={testModu}
                onTestModu={(v) => {
                  setTestModu(v);
                  void ozetAl({ testModu: v });
                }}
                zamanla={zamanla}
                onZamanla={setZamanla}
                tarih={tarih}
                onTarih={setTarih}
                disabled={mesgul}
              />
            )}
          </div>
        </section>

        {onizlemeVar && (
          <aside aria-label="Mesaj önizlemesi" className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4">
            <button
              type="button"
              className="dugme lg:hidden"
              aria-expanded={onizlemeAcik}
              aria-controls="sihirbaz-onizleme"
              onClick={() => setOnizlemeAcik((a) => !a)}
            >
              {onizlemeAcik ? "Önizlemeyi gizle" : "Önizlemeyi göster"}
            </button>
            <div id="sihirbaz-onizleme" className={`${onizlemeAcik ? "flex" : "hidden"} flex-col gap-3 lg:flex`}>
              {wa ? (
                <>
                  <WhatsappOnizlemesi
                    numara={secilenNumara?.etiket ?? ""}
                    sablon={secilenSablon}
                    eslem={eslem}
                    gorselAdresi={gorselGerekli ? (gorsel?.adres ?? null) : null}
                  />
                  {secilenSablon && <SablonAyrintilari sablon={secilenSablon} eslem={eslem} />}
                </>
              ) : (
                kanal && (
                  <MetinOnizlemesi
                    kanal={kanal as Exclude<KuyrukKanali, "whatsapp_api">}
                    konu={konu}
                    baslik={adim === 4 && ozet?.onizleme ? "İlk alıcı için mesaj" : "Önizleme: işletme adı girilmiş (örnek)"}
                    adli={adim === 4 && ozet?.onizleme ? ozet.onizleme : ornekAdli}
                    adsiz={adim === 4 && ozet?.onizleme ? null : ornekAdsiz}
                  />
                )
              )}
            </div>
          </aside>
        )}
      </div>

      <div
        role="region"
        aria-label="Sihirbaz düğmeleri"
        className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-t-kart border border-kenar bg-white/95 px-5 py-3 backdrop-blur"
      >
        {adim > 1 ? (
          <button type="button" className="dugme" disabled={mesgul} onClick={() => git((adim - 1) as AdimNo)}>
            Geri
          </button>
        ) : (
          <Link href="/kampanyalar" className="dugme">
            Vazgeç
          </Link>
        )}
        <div className="min-w-0 flex-1 text-ufak max-sm:order-first max-sm:basis-full">
          {hata ? (
            <p role="alert" className="text-tehlike">
              {hata}
            </p>
          ) : (
            engel && adim > 1 && <p className="text-soluk">{engel}</p>
          )}
        </div>
        {adim < 3 && (
          <button type="button" className="dugme-ana" disabled={Boolean(engel) || mesgul} onClick={() => git((adim + 1) as AdimNo)}>
            İleri
          </button>
        )}
        {adim === 3 && (
          <button
            type="button"
            className="dugme-ana"
            disabled={Boolean(engel) || mesgul}
            onClick={async () => {
              if (await ozetAl()) git(4);
            }}
          >
            Gönderim özetini göster
          </button>
        )}
        {adim === 4 && ozet && (
          <button type="button" className="dugme-ana" disabled={baslatilamaz} onClick={() => void baslat()}>
            {zamanla ? "Kampanyayı zamanla" : "Kampanyayı başlat"}
          </button>
        )}
      </div>
    </div>
  );
}

function SecimGrubu(props: { id: string; baslik: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={props.id}>
      <span id={props.id} className="text-sm font-semibold">
        {props.baslik}
      </span>
      <div className="flex flex-wrap gap-2">{props.children}</div>
    </div>
  );
}

/** Alıcılar adımının sayı rozeti: e-posta / SMS'te gönderilecek kişi, WhatsApp'ta filtreye uyan kayıt. */
function AliciRozeti(props: { wa: boolean; ozet: AliciOzeti | null; hata: string | null }) {
  const { ozet } = props;
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 rounded-full bg-ana-acik px-3 py-1 text-ufak font-semibold text-ana-koyu tabular-nums">
      {props.hata && !ozet ? (
        <span className="font-normal text-tehlike">{props.hata}</span>
      ) : !ozet ? (
        <span className="inline-flex items-center gap-1.5 font-normal">
          <DonerGosterge boyut={14} />
          Hesaplanıyor…
        </span>
      ) : props.wa ? (
        <>≈ {sayiYaz(ozet.toplamAday)} kayıt filtreye uyuyor</>
      ) : (
        <>
          ≈ {sayiYaz(ozet.gonderilecek)} kişiye gidecek
          <span className="font-normal text-soluk">· {sayiYaz(ozet.toplamAday - ozet.gonderilecek)} hariç</span>
        </>
      )}
    </span>
  );
}

function HaricListesi({ satirlar }: { satirlar: { neden: HaricNedeni; ad: string; n: number }[] }) {
  if (satirlar.length === 0) return <p className="text-ufak text-soluk">Hariç tutulan kayıt yok.</p>;
  return (
    <ul aria-label="Hariç tutma nedenleri" className="flex flex-wrap gap-1.5 text-ufak">
      {satirlar.map((s) => (
        <li key={s.neden} className="rounded-full bg-ic-kutu px-2.5 py-0.5">
          {s.ad}: <strong className="tabular-nums">{sayiYaz(s.n)}</strong>
        </li>
      ))}
    </ul>
  );
}

/** Gönder adımının büyük sayı kartı. */
function SayiKarti(props: { baslik: string; deger: string; children?: ReactNode; ton?: "ana" }) {
  return (
    <div className={`flex min-w-0 flex-col rounded-xl px-4 py-3 ${props.ton === "ana" ? "bg-ana-acik" : "bg-ic-kutu"}`}>
      <dt className="text-ufak text-soluk">{props.baslik}</dt>
      <dd className="text-baslik font-semibold tabular-nums">{props.deger}</dd>
      {props.children && <dd className="mt-0.5 text-xs text-soluk">{props.children}</dd>}
    </div>
  );
}

function GonderAdimi(props: {
  ozet: KampanyaOzeti;
  kanal: KuyrukKanali;
  bosHitap: string;
  testModuSecilebilir: boolean;
  testModu: boolean;
  onTestModu: (v: boolean) => void;
  zamanla: boolean;
  onZamanla: (v: boolean) => void;
  tarih: string;
  onTarih: (v: string) => void;
  disabled: boolean;
}) {
  const { ozet } = props;
  const w = ozet.whatsapp;
  const haric = ozet.toplamAday - ozet.gonderilecek;
  const nedenler = haricSatirlari(ozet.kanal, ozet.haricler);
  const metaKalan = w && !ozet.sandbox ? metaPayiKalani(w.limitPayi, w.son24Saat) : null;
  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <dl aria-label="Gönderim sayıları" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SayiKarti baslik="Gönderilecek" deger={sayiYaz(ozet.gonderilecek)} ton="ana">
          alıcı
        </SayiKarti>
        <SayiKarti baslik="Hariç" deger={sayiYaz(haric)}>
          {sayiYaz(ozet.toplamAday)} kayıttan
        </SayiKarti>
        <SayiKarti baslik="Bugün kalan pay" deger={sayiYaz(ozet.bugunKalan)}>
          Günlük sınır {sayiYaz(ozet.gunlukSinir)}
          {ozet.sonrakiGunlereKalacak > 0 && ` · ${sayiYaz(ozet.sonrakiGunlereKalacak)} alıcı sonraki günlere kalır`}
          {metaKalan !== null && w && ` · Meta payı ${sayiYaz(metaKalan)} / ${sayiYaz(w.limitPayi ?? 0)} (24 saat)`}
        </SayiKarti>
        {w && (
          <SayiKarti baslik="Tahmini ücret" deger={w.tahminiUcretUsd !== null ? `$${w.tahminiUcretUsd.toFixed(2)}` : "—"}>
            {w.tahminiUcretUsd !== null ? `${sayiYaz(ozet.gonderilecek)} × $${w.birimFiyatUsd?.toFixed(4)}` : "Fiyat bilinmiyor"}
          </SayiKarti>
        )}
      </dl>
      {w && w.tahminiUcretUsd !== null && (
        <p className="-mt-2 text-xs text-soluk">
          Meta ücreti: Türkiye, {w.fiyatTarihi} fiyatı{w.fiyatDogrulandi ? "" : " (Meta'nın kartından doğrulanmadı)"}. Yalnızca teslim edilen ileti
          ücretlenir; Meta ücreti doğrudan WhatsApp hesabınızdan keser, Harita CRM fatura kesmez.
        </p>
      )}

      <dl aria-label="Gönderim bilgileri" className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-xl border border-kenar px-4 py-2.5 text-ufak">
        <BilgiOgesi ad="Kanal">{KANAL_ADLARI[ozet.kanal]}</BilgiOgesi>
        {w && (
          <>
            <BilgiOgesi ad="Gönderen">{w.numara.etiket}</BilgiOgesi>
            <BilgiOgesi ad="Şablon">
              {w.sablonAdi} ({w.dil}, {SABLON_KATEGORI_ADLARI[w.kategori] ?? w.kategori})
            </BilgiOgesi>
            {!ozet.sandbox && w.kalite && (
              <BilgiOgesi ad="Numara kalitesi">
                <span className={w.kalite === "RED" ? "text-tehlike" : ""}>{KALITE_ADLARI[w.kalite]}</span>
              </BilgiOgesi>
            )}
          </>
        )}
        <BilgiOgesi ad="İYS">
          {ozet.iysKontrolu ? (
            "Kontrol açık"
          ) : (
            <span role="note" className="rounded-md bg-uyari-acik px-1.5 font-medium text-uyari">
              {IYS_KAPALI_UYARISI}
            </span>
          )}
        </BilgiOgesi>
      </dl>

      {w && !ozet.sandbox && !w.baglantiVar && (
        <p role="alert" className="text-sm text-tehlike">
          Bu numaranın sahipliği doğrulanmadı; Ayarlar → WhatsApp → Bağlantıyı test et.
        </p>
      )}
      {w && !ozet.sandbox && w.testModu && (
        <p className="rounded-md bg-uyari-acik p-2 text-sm text-uyari">
          Bu numaranın test modu açık: kampanya yalnızca bu numaranın Ayarlar&apos;daki test numaralarına gider; diğer alıcılar &quot;test modu&quot;
          nedeniyle hariç tutuldu. Bu kampanyada gönderen bilgileri ve İYS numarası aranmaz.
        </p>
      )}
      {w && !ozet.sandbox && w.hesapKilidi && (
        <p role="alert" className="text-sm text-tehlike">
          {w.hesapKilidi} Kilit kalkana kadar kampanya başlatılamaz.
        </p>
      )}
      {w && !ozet.sandbox && w.kalite === "RED" && (
        <p role="alert" className="text-sm text-tehlike">
          Numara kalitesi düşük; kalite düzelene kadar kampanya başlatılamaz.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Hariç tutma nedenleri</p>
        <HaricListesi satirlar={nedenler.sifirdanBuyuk} />
        <details className="text-sm">
          <summary className="cursor-pointer text-ufak text-ana">Tüm nedenleri göster</summary>
          <table className="mt-1 w-full">
            <caption className="sr-only">
              Hariç tutulanlar ({sayiYaz(haric)} / {sayiYaz(ozet.toplamAday)} kayıt)
            </caption>
            <tbody>
              {nedenler.tumu.map((s) => (
                <tr key={s.neden} className="border-b border-cizgi last:border-0">
                  <td className="py-1.5">{s.ad}</td>
                  <td className="py-1.5 text-right tabular-nums">{sayiYaz(s.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      {ozet.kanal === "sms" && (
        <div className="rounded-xl border border-kenar p-4 text-sm">
          <p>
            Telefonu kayıtta olmayan, gönderim anında Google&apos;dan alınacak:{" "}
            <strong className="tabular-nums">{sayiYaz(ozet.placesTelefonGerekli)}</strong> kayıt
          </p>
          <p className="text-xs text-soluk">
            {ozet.placesTelefonGerekli > 0 && `Bu ayki kullanımınıza yaklaşık %${ozet.tahminiKullanimYuzdesi} eklenir. `}Numara saklanmaz; cep
            telefonu değilse o kayıt gönderim anında atlanır.
            {ozet.kotaYetmez && " Bu ayki kullanımınız yetmezse kalan mesajlar ay başını bekler."}
          </p>
          {ozet.smsParca !== null && <p className="mt-1 text-xs text-soluk">İlk alıcının mesajı (altbilgi dahil): {ozet.smsParca} SMS</p>}
        </div>
      )}
      {ozet.isletmeAdiEksik > 0 && !w && (
        <p className="text-sm">
          Kendi kaydınızda işletme adı yok: <strong className="tabular-nums">{sayiYaz(ozet.isletmeAdiEksik)}</strong> kayıt{" "}
          <span className="text-soluk">
            (Google&apos;dan gelen ad mesajlara yazılmaz;{" "}
            {props.bosHitap ? `{isletme} yerine "${props.bosHitap}" hitabı kullanılacak` : "{isletme} kaldırılacak"}).
          </span>{" "}
          <Link href="/kayitlar?grup=tum&ad=bos" className="text-ana underline">
            Adı boş olan Google kayıtlarını aç
          </Link>
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-cizgi pt-4 text-sm">
        {props.testModuSecilebilir ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-ana" checked={props.testModu} disabled={props.disabled} onChange={(e) => props.onTestModu(e.target.checked)} />
            {props.kanal === "whatsapp_api"
              ? "Test: Meta'ya gönderme, yalnızca şablon metnini kaydet"
              : "Test modu: gerçek gönderim yapma, yalnızca kaydet"}
          </label>
        ) : (
          <p className="text-xs text-soluk">
            {KANAL_ADLARI[props.kanal]} bağlı değil: kampanya test modunda çalışır (gerçek gönderim yapılmaz, mesajlar kaydedilir).
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-ana" checked={props.zamanla} onChange={(e) => props.onZamanla(e.target.checked)} />
            İleri bir tarihe zamanla
          </label>
          {props.zamanla && (
            <input
              type="datetime-local"
              value={props.tarih}
              onChange={(e) => props.onTarih(e.target.value)}
              required
              className="girdi max-w-xs"
              aria-label="Planlanan gönderim zamanı"
            />
          )}
        </div>
      </div>

      {ozet.sandbox ? (
        <p className="rounded-lg bg-uyari-acik p-3 text-sm text-uyari">
          Test modu: gerçek gönderim yapılmayacak; mesajlar kampanya ayrıntısında görüntülenebilir.
        </p>
      ) : ozet.eksikAyarlar.length ? (
        <p role="alert" className="rounded-lg bg-tehlike-acik p-3 text-sm text-tehlike">
          Gerçek gönderim için{" "}
          <Link href="/ayarlar/gonderen" className="underline">
            Ayarlar → Gönderen bilgileri
          </Link>{" "}
          bölümünü tamamlayın: {ozet.eksikAyarlar.join(", ")}.
        </p>
      ) : (
        <p className="text-sm text-soluk">
          {w
            ? "Gerçek gönderim: WhatsApp Business Platform (Cloud API) üzerinden onaylı şablonla."
            : "Gerçek gönderim: çalışma alanınızın sağlayıcısı üzerinden gönderilecek."}
        </p>
      )}
    </div>
  );
}

function BilgiOgesi(props: { ad: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="text-soluk">{props.ad}:</dt>
      <dd className="min-w-0 font-medium break-words">{props.children}</dd>
    </div>
  );
}

const KODLAMA_ADI: Record<SmsKodlama, string> = {
  gsm7: "standart",
  "gsm7-turkce": "Türkçe karakterli (ç ğ ı İ ş 2 karakter sayılır)",
  ucs2: "Unicode (emoji vb.; parça başına 70/67 karakter)",
};

function SmsSayaci({ metin, altbilgi }: { metin: string; altbilgi: string }) {
  const u = smsUzunlugu(metin);
  return (
    <div className="rounded-md bg-zemin p-2 text-xs" aria-live="polite">
      <p>
        <strong className="tabular-nums">{u.karakter}</strong> karakter ·{" "}
        <strong className={`tabular-nums ${u.parca > 1 ? "text-uyari" : ""}`}>{u.parca} SMS</strong> · kodlama:{" "}
        {KODLAMA_ADI[u.kodlama]} · bu parçada kalan {u.kalan}
      </p>
      <p className="mt-0.5 text-soluk">
        Altbilgi dahil ({altbilgi.length} karakter), işletme adı &quot;Örnek İşletme&quot; varsayılarak. Tahminidir;
        faturalamada sağlayıcının hesabı esastır.
      </p>
    </div>
  );
}

/** Mesaj adımının şablon seçimi (gelen kutusundaki tek kişilik Şablon gönder penceresi de kullanır). */
export function WhatsappSablonSecimi(props: {
  /** Gönderen numaranın etiketi (şablonlar onun WhatsApp hesabından). */
  numara: string;
  sablonlar: SablonDto[];
  sablonId: string;
  eslem: DegiskenEslemi;
  onSablon: (id: string) => void;
  onEslem: (e: DegiskenEslemi) => void;
  gorsel: KampanyaGorselDto | null;
  onGorsel: (g: KampanyaGorselDto | null) => void;
}) {
  const sablon = props.sablonlar.find((x) => x.id === props.sablonId) ?? null;
  const gorselli = sablon?.baslikBicimi === GORSEL_BASLIK;
  const ayar = (anahtar: string, degisiklik: Partial<DegiskenEslemi[string]>) =>
    props.onEslem({
      ...props.eslem,
      [anahtar]: { ...(props.eslem[anahtar] ?? { kaynak: "isletme_adi" }), ...degisiklik },
    });
  return (
    // min-w-0: <fieldset> varsayılanı min-inline-size: min-content; uzun şablon adı seçeneği onu (ve sayfayı) taşırıyordu.
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-2 text-sm font-medium text-soluk">WhatsApp şablonu · {props.numara}</legend>
      {props.sablonlar.length === 0 ? (
        <p className="text-sm text-soluk">
          Bu numaranın WhatsApp hesabında kullanılabilir onaylı şablon yok. Şablonlar Meta WhatsApp Manager&apos;da
          oluşturulur; Ayarlar → WhatsApp bölümünde bu numaranın şablonlarını Meta&apos;dan yenileyin.
        </p>
      ) : (
        <div className={gorselli ? "grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]" : "grid gap-3"}>
          <label className="etiket">
            Şablon
            <select value={props.sablonId} onChange={(e) => props.onSablon(e.target.value)} required className="girdi">
              <option value="">Seçin</option>
              {props.sablonlar.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.ad} ({x.dil}, {SABLON_KATEGORI_ADLARI[x.kategori] ?? x.kategori}
                  {x.baslikBicimi === GORSEL_BASLIK ? ", görselli" : ""})
                </option>
              ))}
            </select>
          </label>
          {gorselli && <GorselYukleme gorsel={props.gorsel} onGorsel={props.onGorsel} />}
        </div>
      )}
      {sablon?.degiskenler.map((dg) => {
        const anahtar = degiskenAnahtari(dg);
        const a = props.eslem[anahtar] ?? { kaynak: "isletme_adi" as DegiskenKaynagi };
        return (
          // items-start + tek satırlık etiketler: seçim ve metin kutusu aynı hizada (açıklama kutunun altında).
          <div key={anahtar} className="grid items-start gap-2 sm:grid-cols-3">
            <label className="etiket">
              {dg.bilesen === "header" ? "Başlık" : "Gövde"} {"{{"}
              {dg.ad}
              {"}}"}
              <select
                value={a.kaynak}
                onChange={(e) => ayar(anahtar, { kaynak: e.target.value as DegiskenKaynagi })}
                className="girdi"
              >
                {DEGISKEN_KAYNAKLARI.map((k) => (
                  <option key={k} value={k}>
                    {DEGISKEN_KAYNAK_ADLARI[k]}
                  </option>
                ))}
              </select>
            </label>
            {a.kaynak === "sabit" ? (
              <label className="etiket sm:col-span-2">
                Metin
                <input
                  value={a.deger ?? ""}
                  onChange={(e) => ayar(anahtar, { deger: e.target.value })}
                  maxLength={500}
                  required
                  className="girdi"
                />
              </label>
            ) : (
              <label className="etiket sm:col-span-2">
                Kayıtta boşsa
                <input
                  value={a.yedek ?? ""}
                  onChange={(e) => ayar(anahtar, { yedek: e.target.value })}
                  maxLength={500}
                  className="girdi"
                  placeholder="ör. Değerli müşterimiz"
                />
                <span className="text-xs font-normal text-soluk">Boş bırakılırsa bu bilgisi boş olan alıcı hariç tutulur.</span>
              </label>
            )}
          </div>
        );
      })}
      {sablon && (
        <p className="text-xs text-soluk">
          Metin Meta&apos;da onaylı şablondan gelir (önizleme ve &quot;Şablon ayrıntıları&quot;); burada yalnızca değişkenlerin
          değerleri seçilir. Değerler satır sonu ve art arda boşluk içermeyecek şekilde tek satıra indirgenir.
        </p>
      )}
    </fieldset>
  );
}

/**
 * Görselli şablonun başlık görseli: seçilen dosya sunucuya yüklenir (tür imzadan doğrulanır, sha256 alınır); boyut
 * burada da önceden denetlenir. Meta'ya yükleme kampanya başlarken işçide, bir kez yapılır.
 */
export function GorselYukleme(props: { gorsel: KampanyaGorselDto | null; onGorsel: (g: KampanyaGorselDto | null) => void }) {
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  async function sec(dosya: File | undefined) {
    setHata(null);
    if (!dosya) return;
    if (dosya.size > KAMPANYA_GORSEL_AZAMI_BAYT) {
      setHata("Görsel en fazla 5 MB olabilir.");
      return;
    }
    setYukleniyor(true);
    const form = new FormData();
    form.set("dosya", dosya);
    try {
      const yanit = await fetch("/api/kampanyalar/gorsel", { method: "POST", body: form, cache: "no-store" });
      const veri = (await yanit.json().catch(() => ({}))) as { gorsel?: KampanyaGorselDto; hata?: string };
      if (!yanit.ok || !veri.gorsel) setHata(veri.hata ?? "Görsel yüklenemedi.");
      else props.onGorsel(veri.gorsel);
    } catch {
      setHata("Sunucuya ulaşılamadı.");
    } finally {
      setYukleniyor(false);
    }
  }
  // Tarayıcının dosya girişi gizlidir: yüklemeden sonra değeri sıfırlandığından (aynı dosya yeniden seçilebilsin)
  // görsel yüklüyken "Dosya seçilmedi" yazıyordu. Seçili görsel adı ve boyutuyla ayrı gösterilir.
  return (
    <div className="flex min-w-0 flex-col gap-1.5" role="group" aria-labelledby="gorsel-baslik">
      <span id="gorsel-baslik" className="text-sm font-semibold">
        Başlık görseli (zorunlu)
      </span>
      <div className="flex min-w-0 items-center gap-3">
        {props.gorsel ? (
          // eslint-disable-next-line @next/next/no-img-element -- oturumlu API'den gelen dosya; next/image optimizasyonu kullanılmaz
          <img src={props.gorsel.adres} alt="Kampanya görseli" className="size-14 shrink-0 rounded-md border border-kenar object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-md border border-dashed border-kenar-alan text-xs text-soluk">
            Görsel
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {props.gorsel ? (
            <p className="flex min-w-0 items-baseline gap-1 text-ufak" aria-live="polite">
              <span className="min-w-0 truncate font-medium" title={props.gorsel.dosyaAdi}>
                {props.gorsel.dosyaAdi}
              </span>
              <span className="shrink-0 text-soluk">· {sayiYaz(Math.ceil(props.gorsel.boyut / 1024))} KB</span>
            </p>
          ) : (
            <p className="text-ufak text-soluk">{yukleniyor ? <DonerGosterge boyut={14} etiket="Yükleniyor…" /> : "Henüz görsel yüklenmedi."}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {/* relative: sr-only giriş kabın dışına taşmasın. */}
            <label className={`dugme dugme-kucuk relative cursor-pointer focus-within:ring-2 focus-within:ring-ana ${yukleniyor ? "pointer-events-none opacity-50" : ""}`}>
              {props.gorsel ? "Görseli değiştir" : "Görsel seç"}
              <input
                type="file"
                accept="image/jpeg,image/png"
                disabled={yukleniyor}
                onChange={(e) => {
                  void sec(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="sr-only"
              />
            </label>
            {props.gorsel && (
              <button type="button" className="dugme-metin text-ufak !text-tehlike" onClick={() => props.onGorsel(null)}>
                Kaldır
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-soluk">
        JPEG ya da PNG, en fazla 5 MB. Aynı görsel bütün alıcılara gider; Meta&apos;ya kampanya başlarken bir kez yüklenir.
      </p>
      {hata && (
        <p role="alert" className="text-sm text-tehlike">
          {hata}
        </p>
      )}
    </div>
  );
}
