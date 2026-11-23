"use client";
// Yeni kampanya sihirbazı (yeni düzen): 1 Kanal · 2 Alıcılar · 3 Mesaj · 4 Gönder.
// - Adım adreste (?adim=) tutulur; tarayıcının geri düğmesi önceki adıma döner. Taslak bu bileşende kalır; sayfa
//   yenilenirse ilk eksik adıma dönülür (ileri atlanamaz: lib/kampanya-sihirbazi.ts).
// - Alıcılar adımında e-posta / SMS için canlı alıcı sayısı ve hariç nedenleri (özet uç noktası, geçici metinle; alıcı
//   kuralları metne bağlı değildir). WhatsApp'ta sayı şablona bağlı olduğundan son adımda hesaplanır.
// - Son adımın gövdesi bugünkü oluşturma API'siyle aynıdır; alıcı kuralları ve doğrulama sunucuda uygulanır.
// - WhatsApp (API): onaylı şablon + değişken eşleme; özet şablonun ilk üç alıcı için metnini, test modunu, Meta
//   limitinin payını ve tahmini Meta ücretini (yalnızca yönetici) gösterir.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DurumRozeti } from "@/components/arayuz/rozet";
import { SecimCipi } from "@/components/arayuz/sekmeler";
import { Simge } from "@/components/arayuz/simge";
import { apiIstek } from "@/lib/api-istemci";
import { sayiYaz } from "@/lib/bicim";
import { adimCoz, adimEngeli, KAMPANYA_ADIMLARI, type AdimNo, type SihirbazTaslagi } from "@/lib/kampanya-sihirbazi";
import {
  ALICI_TURLERI,
  ALICI_TURU_ADLARI,
  HARIC_NEDEN_ADLARI,
  HARIC_NEDENLERI,
  IYS_KAPALI_UYARISI,
  KANAL_ADLARI,
  type HaricNedeni,
  type KuyrukKanali,
} from "@/lib/mesajlasma";
import {
  DEGISKEN_KAYNAK_ADLARI,
  DEGISKEN_KAYNAKLARI,
  degiskenAnahtari,
  GORSEL_BASLIK,
  KAMPANYA_GORSEL_AZAMI_BAYT,
  KALITE_ADLARI,
  SABLON_KATEGORI_ADLARI,
  sablonParcalari,
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

/** Yalnızca WhatsApp kanalında anlamlı olan hariç tutma nedenleri. */
const WHATSAPP_NEDENLERI = new Set(["whatsapp_izni_yok", "iys_beyani_yok", "whatsapp_yok", "test_modu", "degisken_bos"]);
const kanalNedeni = (kanal: KuyrukKanali, n: HaricNedeni) =>
  (kanal !== "eposta" || n !== "cep_degil") && (kanal === "whatsapp_api" ? n !== "bireysel_izinsiz" : !WHATSAPP_NEDENLERI.has(n));

const ORNEK_SABLON = "Merhaba {isletme},\n\n";

const KANAL_ACIKLAMASI: Record<KuyrukKanali, string> = {
  eposta: "Kendi alan adınızdaki e-posta hesabından.",
  sms: "Netgsm hesabınız ve onaylı SMS başlığınızla.",
  whatsapp_api: "Meta'da onaylı şablonla (WhatsApp Business).",
};
const KANAL_AYARI: Record<KuyrukKanali, string> = { eposta: "/ayarlar/eposta", sms: "/ayarlar/sms", whatsapp_api: "/ayarlar/whatsapp" };

type AliciOzeti = { gonderilecek: number; toplamAday: number; haricler: Record<HaricNedeni, number> };

export function KampanyaSihirbazi(props: {
  /** Adresteki ?adim= ve ?kanal= (ör. Ayarlar > WhatsApp "Test kampanyası oluştur"). */
  adim: string | null;
  ilkKanal: KuyrukKanali | null;
  etiketler: string[];
  saglayicilar: MesajlasmaAyarlariDto["saglayicilar"];
  eksikAyarlar: string[];
  /** Her SMS'e eklenen gönderen + ret yolu (sunucuda hesaplanır). */
  smsAltbilgisi: string;
  /** Çalışma alanının İYS kontrolü; kapalıysa sihirbazın üstünde ve özette uyarı gösterilir. */
  iysKontrolu: boolean;
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
  const [ozet, setOzet] = useState<KampanyaOzeti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

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

  // Alıcılar adımı: e-posta / SMS için canlı sayı (geçici ad, konu ve metinle; alıcı kuralları metne bağlı değil).
  const sayimAnahtari = JSON.stringify({ kanal, filtre });
  useEffect(() => {
    if (!kanal || kanal === "whatsapp_api") return;
    const iptal = new AbortController();
    const zamanlayici = setTimeout(async () => {
      const s = await apiIstek<{ ozet: KampanyaOzeti }>("/api/kampanyalar/ozet", {
        method: "POST",
        sinyal: iptal.signal,
        govde: { kanal, ad: "Taslak", konu: "Taslak", sablon: "{isletme}", filtre: JSON.parse(sayimAnahtari).filtre, testModu: true },
      });
      if (s.ok) setAliciOzeti({ gonderilecek: s.veri.ozet.gonderilecek, toplamAday: s.veri.ozet.toplamAday, haricler: s.veri.ozet.haricler });
    }, 250);
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

  return (
    <div className="flex max-w-[920px] flex-col gap-6">
      {!props.iysKontrolu && <IysKapaliUyarisi />}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Adımlar">
        {KAMPANYA_ADIMLARI.map((a, i) => {
          const durumu = a.no < adim ? "tamam" : a.no === adim ? "etkin" : "bekliyor";
          return (
            <li key={a.no} className="flex items-center gap-2" aria-current={durumu === "etkin" ? "step" : undefined}>
              {i > 0 && <span aria-hidden="true" className="h-px w-6 bg-kenar-alan" />}
              <span
                className={`flex size-7 items-center justify-center rounded-full text-[13px] font-bold ${
                  durumu === "tamam" ? "bg-ana text-white" : durumu === "etkin" ? "border-2 border-ana text-ana" : "border-2 border-kenar-alan text-soluk"
                }`}
              >
                {durumu === "tamam" ? <Simge ad="tik" boyut={14} kalinlik={3} /> : a.no}
              </span>
              <span className={durumu === "bekliyor" ? "text-soluk" : "font-semibold"}>{a.ad}</span>
            </li>
          );
        })}
      </ol>

      <section className="overflow-hidden rounded-kart border border-kenar bg-white" aria-labelledby="adim-baslik">
        <div className="flex flex-col gap-5 p-7">
          <h2 id="adim-baslik" className="text-xl font-bold">
            {adim === 1 ? "Hangi kanaldan göndereceksiniz?" : adim === 2 ? "Kimlere gidecek?" : adim === 3 ? "Mesaj" : "Gözden geçir ve gönder"}
          </h2>

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
                      secili ? "border-2 border-ana bg-ana-acik/40" : "border-kenar hover:bg-kart-alt"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-base font-bold">{KANAL_ADLARI[k]}</span>
                      <DurumRozeti ton={bagli ? "ana" : "notr"}>{bagli ? "Bağlı" : "Bağlı değil"}</DurumRozeti>
                    </span>
                    <span className="text-[13px] text-soluk">{KANAL_ACIKLAMASI[k]}</span>
                    {!bagli && <span className="text-[13px] text-uyari">Bağlanana kadar test modunda gönderilir (gerçek gönderim yapılmaz).</span>}
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
                          baglantiId === n.id ? "border-2 border-ana bg-ana-acik/40" : "border-kenar hover:bg-kart-alt"
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
                <p className="text-[13px] text-soluk sm:col-span-3">
                  <Link href={KANAL_AYARI[kanal]} className="text-ana underline">
                    {KANAL_ADLARI[kanal]} bağlantısını Ayarlar&apos;da kurun
                  </Link>
                  .
                </p>
              )}
            </div>
          )}

          {adim === 2 && (
            <>
              <label className="etiket">
                Kampanya adı
                <input value={ad} onChange={(e) => degisti(setAd)(e.target.value)} required maxLength={120} className="girdi" />
              </label>
              <div className="flex flex-col gap-2" role="group" aria-labelledby="sihirbaz-durum">
                <span id="sihirbaz-durum" className="text-sm font-semibold">
                  Durum
                </span>
                <div className="flex flex-wrap gap-2">
                  {(["", ...KAYIT_DURUMLARI] as const).map((d) => (
                    <SecimCipi key={d || "tumu"} secili={durum === d} onClick={() => degisti(setDurum)(d)}>
                      {d ? KAYIT_DURUM_ADLARI[d] : "Tümü"}
                    </SecimCipi>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2" role="group" aria-labelledby="sihirbaz-alici-turu">
                <span id="sihirbaz-alici-turu" className="text-sm font-semibold">
                  Alıcı türü
                </span>
                <div className="flex flex-wrap gap-2">
                  {(["", ...ALICI_TURLERI] as const).map((t) => (
                    <SecimCipi key={t || "tumu"} secili={aliciTuru === t} onClick={() => degisti(setAliciTuru)(t)}>
                      {t ? ALICI_TURU_ADLARI[t] : "Tümü"}
                    </SecimCipi>
                  ))}
                </div>
              </div>
              <label className="etiket max-w-xs">
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
              <div className="rounded-[10px] bg-ic-kutu p-4" aria-live="polite">
                {wa ? (
                  <p className="text-[13px] text-soluk">
                    WhatsApp&apos;ta gönderilecek kişi sayısı şablonun değişkenlerine de bağlıdır; son adımda hesaplanır.
                  </p>
                ) : aliciOzeti ? (
                  <>
                    <p className="text-lg font-bold tabular-nums">
                      {sayiYaz(aliciOzeti.gonderilecek)} kişiye gidecek
                      <span className="ml-2 text-sm font-normal text-soluk">
                        · {sayiYaz(aliciOzeti.toplamAday - aliciOzeti.gonderilecek)} hariç
                      </span>
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-soluk">
                      {HARIC_NEDENLERI.filter((n) => kanal && kanalNedeni(kanal, n) && aliciOzeti.haricler[n] > 0).map((n) => (
                        <li key={n}>
                          {HARIC_NEDEN_ADLARI[n]}: {sayiYaz(aliciOzeti.haricler[n])}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-[13px] text-soluk">Alıcılar hesaplanıyor…</p>
                )}
              </div>
            </>
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
                  <div className="grid gap-3 rounded-[10px] bg-ic-kutu p-4 text-sm sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold text-soluk">Önizleme: işletme adı girilmiş</p>
                      <p className="whitespace-pre-wrap break-words">{ornekAdli || "—"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold text-soluk">Önizleme: işletme adı girilmemiş</p>
                      <p className="whitespace-pre-wrap break-words">{ornekAdsiz || "—"}</p>
                    </div>
                  </div>
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

          {hata && (
            <p role="alert" className="text-sm text-tehlike">
              {hata}
            </p>
          )}
          {engel && adim > 1 && <p className="text-[13px] text-soluk">{engel}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cizgi bg-kart-alt px-7 py-4">
          {adim > 1 ? (
            <button type="button" className="dugme" disabled={mesgul} onClick={() => git((adim - 1) as AdimNo)}>
              Geri
            </button>
          ) : (
            <Link href="/kampanyalar" className="dugme">
              Vazgeç
            </Link>
          )}
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
            <button
              type="button"
              className="dugme-ana"
              disabled={
                mesgul ||
                ozet.gonderilecek === 0 ||
                (zamanla && !tarih) ||
                Boolean(gercekGonderim && ozet.eksikAyarlar.length) ||
                Boolean(gercekGonderim && ozet.whatsapp && (!ozet.whatsapp.baglantiVar || ozet.whatsapp.kalite === "RED" || ozet.whatsapp.hesapKilidi))
              }
              onClick={() => void baslat()}
            >
              {zamanla ? "Kampanyayı zamanla" : "Kampanyayı başlat"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/** İYS kontrolü kapalı: küçük uyarı (oluşturma ve özet ekranı). */
function IysKapaliUyarisi() {
  return (
    <p role="note" className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
      {IYS_KAPALI_UYARISI}
    </p>
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
  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      {!ozet.iysKontrolu && <IysKapaliUyarisi />}
      <p className="text-2xl font-bold tabular-nums">
        {sayiYaz(ozet.gonderilecek)} <span className="text-sm font-normal text-soluk">alıcıya gönderilecek</span>
      </p>
      <table className="w-full text-sm">
        <caption className="mb-1 text-left text-xs font-semibold text-soluk">
          Hariç tutulanlar ({sayiYaz(ozet.toplamAday - ozet.gonderilecek)} / {sayiYaz(ozet.toplamAday)} kayıt)
        </caption>
        <tbody>
          {HARIC_NEDENLERI.filter((n) => kanalNedeni(ozet.kanal, n)).map((n) => (
            <tr key={n} className="border-b border-cizgi last:border-0">
              <td className="py-1.5">{HARIC_NEDEN_ADLARI[n]}</td>
              <td className="py-1.5 text-right tabular-nums">{sayiYaz(ozet.haricler[n])}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1.5">
              Günlük sınır nedeniyle sonraki günlere kalacak
              <span className="block text-xs text-soluk">
                Sınır {sayiYaz(ozet.gunlukSinir)}/gün, başlangıç günü için kalan {sayiYaz(ozet.bugunKalan)}
              </span>
            </td>
            <td className="py-1.5 text-right tabular-nums">{sayiYaz(ozet.sonrakiGunlereKalacak)}</td>
          </tr>
        </tbody>
      </table>
      {ozet.kanal === "sms" && (
        <div className="rounded-[10px] border border-kenar p-4 text-sm">
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
      {ozet.whatsapp && <WhatsappOzetKutusu ozet={ozet} />}
      {ozet.isletmeAdiEksik > 0 && !ozet.whatsapp && (
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
      {ozet.onizleme && !ozet.whatsapp && (
        <div className="rounded-[10px] bg-ic-kutu p-4 text-sm">
          <p className="mb-1 text-xs font-semibold text-soluk">İlk alıcı için mesaj</p>
          <p className="whitespace-pre-wrap break-words">{ozet.onizleme}</p>
        </div>
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
          {ozet.whatsapp
            ? "Gerçek gönderim: WhatsApp Business Platform (Cloud API) üzerinden onaylı şablonla."
            : "Gerçek gönderim: çalışma alanınızın sağlayıcısı üzerinden gönderilecek."}
        </p>
      )}
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
        <strong className={`tabular-nums ${u.parca > 1 ? "text-amber-700" : ""}`}>{u.parca} SMS</strong> · kodlama:{" "}
        {KODLAMA_ADI[u.kodlama]} · bu parçada kalan {u.kalan}
      </p>
      <p className="mt-0.5 text-soluk">
        Altbilgi dahil ({altbilgi.length} karakter), işletme adı &quot;Örnek İşletme&quot; varsayılarak. Tahminidir;
        faturalamada sağlayıcının hesabı esastır.
      </p>
    </div>
  );
}

function WhatsappSablonSecimi(props: {
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
    <fieldset className="flex flex-col gap-3 rounded-md border border-kenar p-3">
      <legend className="px-1 text-sm font-medium">WhatsApp şablonu · {props.numara}</legend>
      {props.sablonlar.length === 0 ? (
        <p className="text-sm text-soluk">
          Bu numaranın WhatsApp hesabında kullanılabilir onaylı şablon yok. Şablonlar Meta WhatsApp Manager&apos;da
          oluşturulur; Ayarlar → WhatsApp bölümünde bu numaranın şablonlarını Meta&apos;dan yenileyin.
        </p>
      ) : (
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
      )}
      {gorselli && <GorselYukleme gorsel={props.gorsel} onGorsel={props.onGorsel} />}
      {sablon && <SablonMetni bilesenler={sablon.bilesenler} eslem={props.eslem} gorselAdresi={gorselli ? (props.gorsel?.adres ?? null) : null} />}
      {sablon?.degiskenler.map((dg) => {
        const anahtar = degiskenAnahtari(dg);
        const a = props.eslem[anahtar] ?? { kaynak: "isletme_adi" as DegiskenKaynagi };
        return (
          <div key={anahtar} className="grid gap-2 sm:grid-cols-3">
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
                Kayıtta boşsa <span className="text-xs font-normal text-soluk">(boş bırakılırsa alıcı hariç tutulur)</span>
                <input
                  value={a.yedek ?? ""}
                  onChange={(e) => ayar(anahtar, { yedek: e.target.value })}
                  maxLength={500}
                  className="girdi"
                />
              </label>
            )}
          </div>
        );
      })}
      {sablon && (
        <p className="text-xs text-soluk">
          Metin Meta&apos;da onaylı şablondan gelir; burada yalnızca değişkenlerin değerleri seçilir. Değerler satır sonu ve
          art arda boşluk içermeyecek şekilde tek satıra indirgenir.
        </p>
      )}
    </fieldset>
  );
}

/**
 * Görselli şablonun başlık görseli: seçilen dosya sunucuya yüklenir (tür imzadan doğrulanır, sha256 alınır); boyut
 * burada da önceden denetlenir. Meta'ya yükleme kampanya başlarken işçide, bir kez yapılır.
 */
function GorselYukleme(props: { gorsel: KampanyaGorselDto | null; onGorsel: (g: KampanyaGorselDto | null) => void }) {
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
  return (
    <div className="flex flex-col gap-2 rounded-md border border-kenar p-3">
      <label className="etiket">
        Başlık görseli (zorunlu)
        <input
          type="file"
          accept="image/jpeg,image/png"
          disabled={yukleniyor}
          onChange={(e) => {
            void sec(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="girdi"
        />
      </label>
      <p className="text-xs text-soluk">
        Bu şablonun başlığında tek görsel var. Yalnızca JPEG ya da PNG, en fazla 5 MB. Aynı görsel bütün alıcılara gider;
        Meta&apos;ya kampanya başlarken bir kez yüklenir.
      </p>
      {yukleniyor && <p className="text-sm text-soluk">Yükleniyor…</p>}
      {hata && (
        <p role="alert" className="text-sm text-tehlike">
          {hata}
        </p>
      )}
      {props.gorsel && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- oturumlu API'den gelen dosya; next/image optimizasyonu kullanılmaz */}
          <img src={props.gorsel.adres} alt="Kampanya görseli" className="h-20 w-20 rounded-md object-cover" />
          <span>
            {props.gorsel.dosyaAdi} · {sayiYaz(Math.ceil(props.gorsel.boyut / 1024))} KB
          </span>
          <button type="button" className="text-tehlike underline" onClick={() => props.onGorsel(null)}>
            Kaldır
          </button>
        </div>
      )}
    </div>
  );
}

const BOLUM_ADLARI = { gorsel: "Görsel", baslik: "Başlık", govde: "Gövde", altbilgi: "Altbilgi", butonlar: "Butonlar" } as const;
/** Önizlemede değişken yerine konan örnek değer (kaynak kayıtsa örnek; sabitse girilen metin). */
const ornekDeger = (a: DegiskenEslemi[string] | undefined) =>
  a?.kaynak === "sabit" ? a.deger || "…" : a?.kaynak === "yetkili_adi" ? "Örnek Yetkili" : "Örnek İşletme";

/** Şablonun tam metni: değişkenler vurgulu ({{1}} …); altında örnek değerlerle önizleme (yerleri görünür). */
function SablonMetni(props: { bilesenler: SablonDto["bilesenler"]; eslem: DegiskenEslemi; gorselAdresi?: string | null }) {
  const bolumler = sablonParcalari(props.bilesenler);
  const yaz = (onizleme: boolean) =>
    bolumler.map((b, i) =>
      onizleme && b.tur === "gorsel" ? (
        props.gorselAdresi ? (
          // eslint-disable-next-line @next/next/no-img-element -- oturumlu API'den gelen dosya; next/image optimizasyonu kullanılmaz
          <img key={i} src={props.gorselAdresi} alt="Kampanya görseli" className="max-h-48 w-full rounded-md object-cover" />
        ) : (
          <p key={i} className="rounded-md bg-zemin p-3 text-center text-xs text-soluk">
            Görsel yüklenince burada görünür
          </p>
        )
      ) : (
      <p key={i} className={b.tur === "baslik" ? "font-semibold" : b.tur === "altbilgi" ? "text-xs text-soluk" : ""}>
        {!onizleme && <span className="mr-1 text-xs text-soluk">{BOLUM_ADLARI[b.tur]}:</span>}
        {b.parcalar.map((x, j) =>
          "metin" in x ? (
            <span key={j} className="whitespace-pre-wrap">
              {x.metin}
            </span>
          ) : (
            <mark key={j} className="rounded bg-amber-100 px-1 text-amber-900" title={DEGISKEN_KAYNAK_ADLARI[props.eslem[degiskenAnahtari(x.degisken)]?.kaynak ?? "isletme_adi"]}>
              {onizleme ? ornekDeger(props.eslem[degiskenAnahtari(x.degisken)]) : `{{${x.degisken.ad}}}`}
            </mark>
          ),
        )}
      </p>
      ),
    );
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="flex flex-col gap-1 rounded-md bg-zemin p-2 text-sm">
        <p className="text-xs font-medium text-soluk">Şablonun tam metni (Meta&apos;da onaylı; değiştirilemez)</p>
        {yaz(false)}
      </div>
      <div className="flex flex-col gap-1 rounded-md border border-kenar p-2 text-sm">
        <p className="text-xs font-medium text-soluk">Önizleme (değişkenlerin yeri işaretli, örnek değerlerle)</p>
        {yaz(true)}
      </div>
    </div>
  );
}

function WhatsappOzetKutusu({ ozet }: { ozet: KampanyaOzeti }) {
  const w = ozet.whatsapp!;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-kenar p-3 text-sm">
      <p>
        Gönderen: <strong>{w.numara.etiket}</strong>
      </p>
      <p>
        Şablon: <strong>{w.sablonAdi}</strong> ({w.dil}, {SABLON_KATEGORI_ADLARI[w.kategori] ?? w.kategori})
      </p>
      {!ozet.sandbox && !w.baglantiVar && (
        <p role="alert" className="text-tehlike">
          Bu numaranın sahipliği doğrulanmadı; Ayarlar → WhatsApp → Bağlantıyı test et.
        </p>
      )}
      {!ozet.sandbox && w.testModu && (
        <p className="rounded-md bg-amber-50 p-2 text-amber-800">
          Bu numaranın test modu açık: kampanya yalnızca bu numaranın Ayarlar&apos;daki test numaralarına gider; diğer alıcılar &quot;test modu&quot;
          nedeniyle hariç tutuldu. Bu kampanyada gönderen bilgileri ve İYS numarası aranmaz.
        </p>
      )}
      {!ozet.sandbox && w.hesapKilidi && (
        <p role="alert" className="text-tehlike">
          {w.hesapKilidi} Kilit kalkana kadar kampanya başlatılamaz.
        </p>
      )}
      {!ozet.sandbox && w.kalite && (
        <p className={w.kalite === "RED" ? "text-tehlike" : ""}>
          Numara kalitesi: {KALITE_ADLARI[w.kalite]}
          {w.kalite === "RED" && " — kalite düzelene kadar kampanya başlatılamaz."}
        </p>
      )}
      {!ozet.sandbox && w.limitPayi !== null && (
        <p className="text-soluk">
          Meta mesajlaşma limitinin bu uygulamaya ayrılan payı: {sayiYaz(w.limitPayi)} ileti / 24 saat (son 24 saatte{" "}
          {sayiYaz(w.son24Saat)}). Pay dolunca kalan alıcılar ertesi güne kalır.
        </p>
      )}
      {w.tahminiUcretUsd !== null && (
        <p>
          Tahmini Meta ücreti: <strong>${w.tahminiUcretUsd.toFixed(2)}</strong>{" "}
          <span className="text-xs text-soluk">
            ({sayiYaz(ozet.gonderilecek)} × ${w.birimFiyatUsd?.toFixed(4)}, Türkiye, {w.fiyatTarihi} fiyatı
            {w.fiyatDogrulandi ? "" : "; fiyat Meta'nın kartından doğrulanmadı"}). Yalnızca teslim edilen ileti ücretlenir;
            Meta ücreti doğrudan WhatsApp hesabınızdan keser, Harita CRM fatura kesmez.
          </span>
        </p>
      )}
      {w.gorsel && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-soluk">Başlık görseli (bütün alıcılara aynı)</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- oturumlu API'den gelen dosya; next/image optimizasyonu kullanılmaz */}
          <img src={w.gorsel.adres} alt="Kampanya görseli" className="max-h-56 max-w-xs rounded-md object-cover" />
        </div>
      )}
      {w.onizlemeler.map((m, i) => (
        <div key={i} className="rounded-md bg-zemin p-3">
          <p className="mb-1 text-xs font-medium text-soluk">{i + 1}. alıcı için mesaj</p>
          <p className="whitespace-pre-wrap break-words">{m}</p>
        </div>
      ))}
    </div>
  );
}
