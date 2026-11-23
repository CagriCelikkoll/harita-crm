"use client";
// Ayarlar → WhatsApp (Meta Business): TEK numaranın kurulumu (numara listesi: whatsapp-numaralari.tsx). Yalnızca yönetici görür. Gizli bilgiler sunucudan hiç gelmez; yalnızca
// "tanımlı / tanımlı değil". Doğrulama anahtarı (verify token) yalnızca üretildiği yanıtta bir kez gösterilir.
// Düzen: durum kartı, 4 kurulum adımı (test modu kilidinin durumu buradan görünür), uygulama payı ve test
// numaraları, şablonlar, katlanır "Teknik ayrıntılar" (kimlikler, anahtarlar, bildirim adresi).
import { useState } from "react";
import Link from "next/link";
import { AdimListesi } from "@/components/arayuz/adim-listesi";
import { AyarSatiri, Kart, KartBaslik, KaydetCubugu } from "@/components/arayuz/kart";
import { BilgiNotu, Katlanir } from "@/components/arayuz/not";
import { DurumRozeti, type RozetTonu } from "@/components/arayuz/rozet";
import { Simge } from "@/components/arayuz/simge";
import { SonucMesaji } from "@/components/bildirim";
import { apiIstek } from "@/lib/api-istemci";
import { tarihYaz } from "@/lib/bicim";
import { telefonBicimle } from "@/lib/adres-normal";
import {
  KALITE_ADLARI,
  kurulumAdimlari,
  limitKatmaniAdi,
  medyaBaslikRozeti,
  metaDurumuRozeti,
  SABLON_KATEGORI_ADLARI,
  TEST_NUMARASI_AZAMI,
  type Kalite,
} from "@/lib/whatsapp-api";
import type { BaglantiDto } from "@/lib/whatsapp-baglanti";
import type { SablonDto } from "@/server/servisler/whatsapp-api";
import { KopyalaDugmesi } from "./formlar";

type Mesaj = { tur: "hata" | "tamam"; metin: string } | null;

const KALITE_TONU: Record<Kalite, RozetTonu> = { GREEN: "ana", YELLOW: "uyari", RED: "tehlike", NA: "notr" };

type Calistir = (
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  govde?: unknown,
  tamamMetni?: string,
) => Promise<unknown>;

export function WhatsappApiAyarlari(props: {
  /** id null: kaydedilmemiş yeni numara formu. */
  ilk: BaglantiDto;
  ilkSablonlar: SablonDto[];
  /** Yeni eklenen numaranın tek seferlik doğrulama anahtarı (sekme değişince kaybolmasın diye üstten gelir). */
  ilkVerifyToken: string | null;
  /** Numara listesi değişti (ekleme, silme, ad, kilidin aynı WABA'dan kalkması); gecilecek: seçilecek numara. */
  onListe: (liste: BaglantiDto[], gecilecek?: string | null, verifyToken?: string | null) => void;
  /** Bu karttaki bağlantı sunucudan güncel haliyle döndü (son yenileme, test sonucu…). */
  onBaglanti?: (b: BaglantiDto) => void;
  /** Bu numaranın WABA'sının şablonları yenilendi (aynı WABA'daki numaralar ortak kullanır). */
  onSablonlar: (wabaId: string, sablonlar: SablonDto[]) => void;
}) {
  const [b, setB] = useState(props.ilk);
  const [sablonlar, setSablonlar] = useState(props.ilkSablonlar);
  const [verifyToken, setVerifyToken] = useState<string | null>(props.ilkVerifyToken);
  const temel = b.id ? `/api/ayarlar/whatsapp-api/${b.id}` : null;
  const [mesaj, setMesaj] = useState<Mesaj>(null);
  const [mesgul, setMesgul] = useState(false);

  async function calistir<T extends object = object>(
    url: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    govde?: unknown,
    tamamMetni?: string,
  ) {
    setMesgul(true);
    setMesaj(null);
    const s = await apiIstek<T>(url, { method, govde });
    setMesgul(false);
    if (!s.ok) {
      setMesaj({ tur: "hata", metin: s.hata });
      return null;
    }
    const v = s.veri as { baglanti?: BaglantiDto; baglantilar?: BaglantiDto[]; verifyToken?: string | null };
    if (v.baglanti) {
      setB(v.baglanti);
      if (v.baglanti.id) props.onBaglanti?.(v.baglanti);
    }
    if (v.verifyToken) setVerifyToken(v.verifyToken);
    if (v.baglantilar) props.onListe(v.baglantilar, v.baglanti?.id ?? null, v.verifyToken ?? null);
    if (tamamMetni) setMesaj({ tur: "tamam", metin: tamamMetni });
    return s.veri;
  }

  const n = b.numara;
  // Kart yalnızca bu numaranın WABA'sının şablonlarını gösterir.
  const wabaSablonlari = sablonlar.filter((s) => s.wabaId === b.wabaId);
  const meta = metaDurumuRozeti(n.metaDurumu);
  const [adim1, adim2, adim3, adim4] = kurulumAdimlari(b);
  const testModuKapat = () => {
    if (confirm("Test modu kapatılınca kampanyalar gerçek alıcılara gider. Devam edilsin mi?")) {
      void calistir(temel!, "PATCH", { testModu: false }, "Test modu kapatıldı.");
    }
  };

  return (
    <>
      {/* Durum kartı */}
      <Kart className="flex flex-wrap items-center gap-5 px-7 py-6">
        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-kart bg-ana-acik text-ana">
          <Simge ad="whatsapp" boyut={26} />
        </span>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
          <p className="text-base font-bold">
            {!b.tanimli
              ? "Yeni WhatsApp numarası"
              : n.gorunenNumara
                ? `${b.ad} · ${n.dogrulanmisAd ?? "WhatsApp numarası"} · ${n.gorunenNumara}`
                : `${b.ad} · numara bilgisi için bağlantıyı test edin`}
          </p>
          {b.tanimli ? (
            <div className="flex flex-wrap gap-2">
              {b.numaraDogrulandi ? (
                <DurumRozeti ton="ana" title="Numara bu WhatsApp Business hesabına ait">
                  Bağlı
                </DurumRozeti>
              ) : (
                <DurumRozeti ton="tehlike">Numara doğrulanmadı</DurumRozeti>
              )}
              {meta && (
                <DurumRozeti ton={meta.ton} title="Numaranın Meta'daki durumu (son bağlantı testi). Mesaj göndermek için Bağlı olmalı.">
                  {meta.etiket}
                </DurumRozeti>
              )}
              {n.kalite && <DurumRozeti ton={KALITE_TONU[n.kalite]}>Kalite: {KALITE_ADLARI[n.kalite]}</DurumRozeti>}
              {n.limitKatmani && (
                <DurumRozeti ton="notr" title="24 saat içinde mesaj başlatılabilecek farklı kişi sayısı; işletme portföyünüzdeki tüm numaralarca paylaşılır.">
                  Meta sınırı: {limitKatmaniAdi(n.limitKatmani).toLocaleLowerCase("tr")}
                </DurumRozeti>
              )}
              <DurumRozeti ton={b.testModu ? "uyari" : "ana"}>{b.testModu ? "Test modu açık" : "Test modu kapalı"}</DurumRozeti>
              {b.hesapKilidi && <DurumRozeti ton="tehlike">Meta hesabı kilitli</DurumRozeti>}
            </div>
          ) : (
            <p className="text-soluk">Numaraya bir ad verin ve hesap bilgilerini aşağıdaki &quot;Teknik ayrıntılar&quot; bölümünden girin.</p>
          )}
          {b.hesapKilidi && (
            <BilgiNotu ton="tehlike" uyariRolu className="mt-1">
              <p className="font-semibold">{b.hesapKilidi.mesaj}</p>
              <p>
                {tarihYaz(b.hesapKilidi.tarih)} tarihinde Meta {b.hesapKilidi.kod} hatası geldi; bu numaranın ve aynı WhatsApp
                hesabındaki numaraların kampanyaları duraklatıldı, kuyruktaki mesajlar bekletiliyor. Kilit kalkınca &quot;Bağlantıyı test et&quot;e basın; test
                başarılı olursa duraklatılan kampanyaları kampanya ayrıntısından devam ettirebilirsiniz.
              </p>
            </BilgiNotu>
          )}
          {(n.sonKontrol || n.sonHata) && (
            <p className="text-[13px] text-soluk">
              {n.sonKontrol && `Son kontrol: ${tarihYaz(n.sonKontrol)}`}
              {n.sonHata && <span className="block text-tehlike">Son hata: {n.sonHata}</span>}
            </p>
          )}
        </div>
        {b.tanimli && (
          <button type="button" className="dugme" disabled={mesgul} onClick={async () => {
              const v = await calistir(
                `${temel}/test`,
                "POST",
                undefined,
                b.hesapKilidi
                  ? "Bağlantı çalışıyor; Meta hesap kilidi kalktı. Duraklatılan kampanyaları kampanya ayrıntısından devam ettirin."
                  : "Bağlantı çalışıyor.",
              );
              // Başarısız test de Meta durumunu ve son hatayı kaydeder: hata mesajı kalır, kart güncellenir.
              if (!v) {
                const s = await apiIstek<{ baglantilar: BaglantiDto[] }>("/api/ayarlar/whatsapp-api");
                const guncel = s.ok ? s.veri.baglantilar.find((x) => x.id === b.id) : undefined;
                if (guncel) setB(guncel);
              }
            }}>
            Bağlantıyı test et
          </button>
        )}
      </Kart>

      {mesaj && <SonucMesaji key={mesaj.metin} tur={mesaj.tur} metin={mesaj.metin} />}
      {verifyToken && (
        <BilgiNotu ton="uyari" uyariRolu>
          <p className="font-semibold">Doğrulama anahtarı (verify token) yalnızca şimdi gösteriliyor</p>
          <p>Meta, bildirim adresinizi bağlarken bu anahtarı sorar; kopyalayıp Meta uygulamanızın Webhook ayarına girin.</p>
          <code className="mt-2 block rounded-lg bg-white p-2 font-mono break-all text-metin">{verifyToken}</code>
        </BilgiNotu>
      )}

      {/* Kurulum adımları */}
      <Kart>
        <KartBaslik baslik="Kurulum adımları" aciklama="Gerçek müşterilere göndermeden önce bu dört adımı tamamlayın." />
        <div className="px-7 pb-5">
          <AdimListesi
            adimlar={[
              {
                baslik: "Meta Business hesabını bağlayın",
                durum: adim1,
                aciklama:
                  adim1 === "tamam"
                    ? "Tamamlandı · numara bu WhatsApp Business hesabına ait"
                    : b.tanimli
                      ? "Numara doğrulanmadı; bilgileri kontrol edip bağlantıyı test edin."
                      : "Hesap kimliklerini ve erişim anahtarını Teknik ayrıntılar bölümüne girin.",
              },
              {
                baslik: "Bildirim adresini doğrulayın",
                durum: adim2,
                aciklama:
                  adim2 === "tamam"
                    ? "Tamamlandı · teslim ve ret bildirimleri alınabiliyor"
                    : "Bildirim adresini ve doğrulama anahtarını Meta uygulamanızın Webhook ayarına girin; Meta adresi doğrulayınca bu adım tamamlanır. Bu numara başka bir numarayla aynı Meta uygulamasındaysa (tek bildirim adresi), bu numaradan gelen ilk imzalı teslim bildirimiyle de tamamlanır.",
                eylem:
                  adim2 === "etkin" ? (
                    <button type="button" className="dugme dugme-kucuk" disabled={mesgul} onClick={() => calistir(`${temel}/abonelik`, "POST", undefined, "Bildirim aboneliği etkin.")}>
                      Bildirim aboneliğini etkinleştir
                    </button>
                  ) : undefined,
              },
              {
                baslik: "Test numaranıza bir kampanya gönderin",
                durum: adim3,
                aciklama:
                  adim3 === "tamam"
                    ? "Tamamlandı · Meta'dan imzalı bir teslim bildirimi alındı"
                    : "Mesaj telefonunuza ulaştığında ve Meta teslim bildirimini gönderdiğinde bu adım kendiliğinden tamamlanır.",
                eylem:
                  adim3 === "etkin" ? (
                    <Link href={`/kampanyalar/yeni?kanal=whatsapp_api&numara=${b.id}`} className="dugme-ana dugme-kucuk">
                      Test kampanyası oluştur
                    </Link>
                  ) : undefined,
              },
              {
                baslik: "Test modunu kapatın",
                durum: adim4,
                aciklama:
                  adim4 === "tamam"
                    ? "Test modu kapalı · kampanyalar gerçek alıcılara gider"
                    : adim4 === "etkin"
                      ? b.gonderenEksikleri.length ? (
                        <>
                          Önce{" "}
                          <Link href="/ayarlar/gonderen" className="text-ana underline">
                            Gönderen bilgileri
                          </Link>
                          &apos;ni tamamlayın: {b.gonderenEksikleri.join(", ")}. Test modu kapalıyken her kampanya bunları ister.
                        </>
                      ) : (
                        "Kapatınca kampanyalar test numaraları dışındaki alıcılara da gider."
                      )
                      : "2. ve 3. adım tamamlanınca açılır.",
                eylem:
                  adim4 === "etkin" ? (
                    <button
                      type="button"
                      className="dugme-tehlike dugme-kucuk"
                      disabled={mesgul || !b.testModuKapatilabilir}
                      onClick={testModuKapat}
                    >
                      Test modunu kapat
                    </button>
                  ) : adim4 === "tamam" ? (
                    <button
                      type="button"
                      className="dugme dugme-kucuk"
                      disabled={mesgul}
                      onClick={() => calistir(temel!, "PATCH", { testModu: true }, "Test modu açıldı.")}
                    >
                      Test modunu yeniden aç
                    </button>
                  ) : undefined,
              },
            ]}
          />
        </div>
      </Kart>

      {b.tanimli && <PayVeTestNumaralari b={b} mesgul={mesgul} kaydet={(govde) => calistir(temel!, "PATCH", govde, "Kaydedildi.")} />}

      {b.tanimli && (
        <Kart>
          <KartBaslik
            baslik="Mesaj şablonları"
            aciklama={`Bu numaranın WhatsApp hesabında (WABA) Meta'nın onayladığı şablonlar; aynı hesaptaki numaralar ortak kullanır. Yenileri Meta WhatsApp Manager'da eklenir.${b.sablonSenkronTarihi ? ` Son yenileme: ${tarihYaz(b.sablonSenkronTarihi)}.` : ""}`}
          >
            <button
              type="button"
              className="dugme dugme-kucuk"
              disabled={mesgul}
              onClick={async () => {
                const v = await calistir<{ sablonlar: SablonDto[]; baglanti: BaglantiDto }>(
                  `/api/whatsapp/sablonlar?baglanti=${encodeURIComponent(b.id!)}`,
                  "POST",
                );
                if (v) {
                  const waba = v.baglanti.wabaId ?? b.wabaId ?? "";
                  const liste = v.sablonlar.filter((s) => s.wabaId === waba);
                  setSablonlar(liste);
                  props.onSablonlar(waba, v.sablonlar);
                  // Hangi numaranın ve WABA'nın yenilendiği açıkça yazılır (yanlış sekmede basılırsa hemen görünür).
                  setMesaj({ tur: "tamam", metin: `Şablonlar yenilendi: ${v.baglanti.etiket} (WABA ${waba}), ${liste.length} şablon.` });
                }
              }}
            >
              Meta&apos;dan yenile
            </button>
          </KartBaslik>
          {wabaSablonlari.length === 0 ? (
            <p className="border-t border-cizgi px-7 py-4 text-soluk">Henüz şablon yok.</p>
          ) : (
            <ul>
              {wabaSablonlari.map((s) => {
                const medya = medyaBaslikRozeti(s.baslikBicimi);
                return (
                <li key={s.id} className="flex flex-wrap items-center gap-4 border-t border-cizgi px-7 py-4">
                  <div className="min-w-0 flex-[1_1_200px]">
                    <p className="font-semibold">{s.ad}</p>
                    <p className="text-[13px] text-soluk">
                      {SABLON_KATEGORI_ADLARI[s.kategori] ?? s.kategori} · {s.dil} ·{" "}
                      {s.destekNedeni ?? (s.degiskenler.length ? `${s.degiskenler.length} değişken` : "değişken yok")}
                    </p>
                  </div>
                  {medya && (
                    <DurumRozeti
                      ton={medya.ton}
                      title={
                        medya.etiket === "Görselli"
                          ? "Başlıkta tek görsel var: kampanyada JPEG ya da PNG görsel yüklenir."
                          : `Başlık biçimi ${s.baslikBicimi}: yalnızca görselli (IMAGE) başlık desteklenir; kampanyada seçilemez.`
                      }
                    >
                      {medya.etiket}
                    </DurumRozeti>
                  )}
                  {medya?.etiket === "Desteklenmiyor" ? null : s.destekNedeni ? (
                    <DurumRozeti ton="uyari">Kullanılamaz</DurumRozeti>
                  ) : (
                    <DurumRozeti>Kullanılabilir</DurumRozeti>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </Kart>
      )}

      <Katlanir baslik="Teknik ayrıntıları" ozet="Hesap kimlikleri, erişim anahtarı, bildirim adresi" acik={!b.tanimli}>
        <TeknikAyrintilar b={b} temel={temel} mesgul={mesgul} calistir={calistir} />
      </Katlanir>
    </>
  );
}

function PayVeTestNumaralari(props: { b: BaglantiDto; mesgul: boolean; kaydet: (govde: { testNumaralari: string[]; uygulamaPayi: number }) => void }) {
  const { b } = props;
  const [pay, setPay] = useState(b.uygulamaPayi || 10);
  const [numaralar, setNumaralar] = useState(b.testNumaralari.map(telefonBicimle));
  const [yeni, setYeni] = useState("");
  const limit = b.numara.limit;
  const ekle = () => {
    const t = yeni.trim();
    if (!t || numaralar.length >= TEST_NUMARASI_AZAMI || numaralar.includes(t)) return;
    setNumaralar([...numaralar, t]);
    setYeni("");
  };
  return (
    <Kart>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          props.kaydet({ testNumaralari: numaralar, uygulamaPayi: pay });
        }}
      >
        <fieldset disabled={props.mesgul}>
          <AyarSatiri baslik="Bu uygulamanın payı" aciklama="Meta'nın günlük sınırı hesabınızdaki tüm araçlarla paylaşılır." alanId="wa-pay">
            <div className="flex flex-col gap-2.5">
              <input id="wa-pay" type="range" min={1} max={100} value={pay} onChange={(e) => setPay(Number(e.target.value))} className="h-7 w-full accent-ana" />
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">%{pay}</span>
                {limit !== null && <span className="text-soluk">Günde en fazla {Math.floor((limit * pay) / 100).toLocaleString("tr")} kişi</span>}
              </div>
            </div>
          </AyarSatiri>
          <AyarSatiri baslik="Test numaraları" aciklama={`Test modunda mesajlar yalnızca bu numaralara gider. En fazla ${TEST_NUMARASI_AZAMI}.`}>
            <ul className="flex flex-wrap items-center gap-2" aria-label="Test numaraları">
              {numaralar.map((t) => (
                <li key={t} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f2f4f1] pr-1.5 pl-3 font-mono text-[13px]">
                  {t}
                  <button
                    type="button"
                    aria-label={`${t} numarasını kaldır`}
                    className="flex size-7 items-center justify-center rounded-full text-soluk hover:bg-white"
                    onClick={() => setNumaralar(numaralar.filter((x) => x !== t))}
                  >
                    <Simge ad="kapat" boyut={12} kalinlik={2.5} />
                  </button>
                </li>
              ))}
            </ul>
            {numaralar.length < TEST_NUMARASI_AZAMI && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={yeni}
                  onChange={(e) => setYeni(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      ekle();
                    }
                  }}
                  inputMode="tel"
                  aria-label="Eklenecek test numarası"
                  placeholder="+90 5XX XXX XX XX"
                  className="girdi max-w-60 font-mono"
                />
                <button type="button" className="dugme" onClick={ekle} disabled={!yeni.trim()}>
                  + Numara ekle
                </button>
              </div>
            )}
          </AyarSatiri>
        </fieldset>
        <KaydetCubugu>
          <button type="submit" className="dugme-ana" disabled={props.mesgul}>
            Kaydet
          </button>
        </KaydetCubugu>
      </form>
    </Kart>
  );
}

function TeknikAyrintilar(props: { b: BaglantiDto; temel: string | null; mesgul: boolean; calistir: Calistir }) {
  const { b, temel, mesgul, calistir } = props;
  const etiket = "flex min-w-0 flex-col gap-1.5 text-sm font-semibold";
  const aciklama = "text-[13px] font-normal text-soluk";
  return (
    <div className="flex flex-col gap-5 pt-4">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const d = (a: string) => String(f.get(a) ?? "").trim();
          const kimlikler = { wabaId: d("wabaId"), phoneNumberId: d("phoneNumberId"), erisimAnahtari: d("erisimAnahtari") || null, appSecret: d("appSecret") || null };
          const ad = d("ad");
          // Yeni numara: tek istekle eklenir. Mevcut numara: kimlikler, sonra (değiştiyse) ad.
          const kaydet = temel
            ? calistir(temel, "PUT", kimlikler, "Bağlantı kaydedildi.").then((v) =>
                v && ad !== b.ad ? calistir(temel, "PATCH", { ad }, "Bağlantı kaydedildi.") : v,
              )
            : calistir("/api/ayarlar/whatsapp-api", "POST", { ad, ...kimlikler }, "Numara eklendi.");
          void kaydet.then((v) => {
            // Gizli alanları formda tutma.
            if (v) for (const a of ["erisimAnahtari", "appSecret"]) {
              const alan = form.elements.namedItem(a) as HTMLInputElement | null;
              if (alan) alan.value = "";
            }
          });
        }}
      >
        <label className={`${etiket} sm:col-span-2`}>
          Numaranın adı
          <input name="ad" required maxLength={40} defaultValue={b.ad} placeholder="Ör. Merkez" className="girdi max-w-sm" />
          <span className={aciklama}>Kampanyalarda ve listelerde bu adla görünür (ör. Merkez, Şube 2).</span>
        </label>
        <label className={etiket}>
          WhatsApp hesap kimliği (WABA ID)
          <input name="wabaId" required inputMode="numeric" defaultValue={b.wabaId ?? ""} className="girdi font-mono" />
          <span className={aciklama}>Meta&apos;daki WhatsApp işletme hesabınızın numarası (WhatsApp Manager → Hesap araçları).</span>
        </label>
        <label className={etiket}>
          Telefon numarası kimliği (Phone Number ID)
          <input name="phoneNumberId" required inputMode="numeric" defaultValue={b.phoneNumberId ?? ""} className="girdi font-mono" />
          <span className={aciklama}>Mesajların gönderileceği numaranın Meta&apos;daki kimliği; telefon numarasının kendisi değildir.</span>
        </label>
        <label className={etiket}>
          Erişim anahtarı (system user token)
          <input name="erisimAnahtari" type="password" autoComplete="off" className="girdi" placeholder={b.erisimAnahtariTanimli ? "Tanımlı · değiştirmek için girin" : "Tanımlı değil"} />
          <span className={aciklama}>Uygulamanın sizin adınıza mesaj göndermesini sağlayan, süresi dolmayan anahtar. Şifreli saklanır, bir daha gösterilmez.</span>
        </label>
        <label className={etiket}>
          Uygulama gizli anahtarı (App Secret)
          <input name="appSecret" type="password" autoComplete="off" className="girdi" placeholder={b.appSecretTanimli ? "Tanımlı · değiştirmek için girin" : "Tanımlı değil"} />
          <span className={aciklama}>Meta&apos;dan gelen bildirimlerin gerçekten Meta&apos;dan geldiğini doğrulamak için kullanılır.</span>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" className="dugme-ana" disabled={mesgul}>
            Kaydet
          </button>
          {b.tanimli && (
            <button
              type="button"
              className="dugme-tehlike"
              disabled={mesgul}
              onClick={() => {
                const ortak = b.ortakUygulamaNumaralari;
                const ortakUyari = ortak.length
                  ? `\n\nÖNEMLİ: Bu numara aynı Meta uygulamasını (App Secret) şu numaralarla paylaşıyor: ${ortak.map((o) => o.ad).join(", ")}. ` +
                    `Meta'da uygulama başına tek Callback URL vardır. Meta'daki Callback URL bu numaranın adresiyse, silmeden önce ` +
                    `Meta'daki Callback URL'yi önce diğer numaranın adresine çevirin:\n${ortak[0].webhookAdresi}\n` +
                    `ve o numaranın doğrulama anahtarını girin (elinizde yoksa o numarada "Yenile"). Aksi halde diğer numaraların ` +
                    `mesaj ve teslim bildirimleri kesilir.`
                  : "";
                if (confirm(`${b.etiket} numarasının bağlantısı ve kayıtlı gizli bilgileri silinecek. Bu numaradan gönderen çalışan kampanyalar duraklatılır.${ortakUyari}`)) {
                  void calistir(temel!, "DELETE", undefined, "Numara kaldırıldı.");
                }
              }}
            >
              Numarayı kaldır
            </button>
          )}
        </div>
      </form>

      {b.tanimli && (
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <div className="border-b border-cizgi py-3.5 sm:col-span-2">
            <dt className="text-[13px] text-soluk">Bildirim adresi (webhook)</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] break-all">{b.webhookAdresi}</span>
              {b.webhookAdresi && <KopyalaDugmesi metin={b.webhookAdresi} />}
            </dd>
            <dd className="mt-1 text-[13px] text-soluk">
              Meta teslim, okundu ve ret bilgilerini bu adrese gönderir. Doğrulanmadan test modu kapatılamaz.
            </dd>
          </div>
          <div className="border-b border-cizgi py-3.5">
            <dt className="text-[13px] text-soluk">Doğrulama anahtarı (verify token)</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              {b.verifyTokenTanimli ? "Bir kez gösterildi" : "Tanımlı değil"} ·
              <button
                type="button"
                className="text-ana underline"
                disabled={mesgul}
                onClick={() => {
                  if (confirm("Yeni doğrulama anahtarı üretilecek; Meta'daki değeri de güncellemeniz gerekir. Test modu yeniden açılır.")) {
                    void calistir(`${temel}/verify-token`, "POST");
                  }
                }}
              >
                Yenile
              </button>
            </dd>
          </div>
          <div className="border-b border-cizgi py-3.5">
            <dt className="text-[13px] text-soluk">Bildirim aboneliği</dt>
            <dd className="mt-1">
              <button
                type="button"
                className="text-ana underline"
                disabled={mesgul}
                onClick={() => calistir(`${temel}/abonelik`, "POST", undefined, "Bildirim aboneliği etkin.")}
              >
                Aboneliği etkinleştir
              </button>
            </dd>
          </div>
        </dl>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Kurulum rehberi: system user ve kalıcı erişim anahtarı</summary>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-soluk">
          <li>developers.facebook.com → Create App → &quot;Connect with customers through WhatsApp&quot; kullanım durumu, kendi işletme portföyünüz (eski arayüzde: Business türü uygulama + WhatsApp ürünü). App Secret: Uygulama ayarları → Temel.</li>
          <li>Business Settings → Kullanıcılar → System users → Ekle (Employee rolü yeterli).</li>
          <li>&quot;Varlık ata&quot;: yalnızca ilgili WhatsApp hesabı (tam kontrol) ve bu uygulama.</li>
          <li>&quot;Token oluştur&quot;: uygulamayı seçin, süre &quot;Hiçbir zaman&quot;, izinler yalnızca whatsapp_business_messaging ve whatsapp_business_management.</li>
          <li>Yeni numara: WhatsApp Manager → Hesap araçları → Telefon numaraları → Numara ekle; SMS ya da sesli aramayla gelen kodla numarayı doğrulayın, sonra numarayı Cloud API&apos;ye kaydedin (register + 6 haneli PIN: POST /{"{phone-number-id}"}/register, messaging_product &quot;whatsapp&quot; ve pin). Numaranın durumu &quot;Bağlı&quot; (CONNECTED) olmadan mesaj gönderilemez; &quot;Bağlantıyı test et&quot; bu durumu denetler. PIN&apos;i güvenli bir yerde saklayın: iki adımlı doğrulama PIN&apos;idir.</li>
          <li>WABA ID ve Phone Number ID: WhatsApp Manager → Hesap araçları → Telefon numaraları (ya da uygulamadaki API kurulumu sayfası).</li>
          <li>Bu formu kaydedin; gösterilen doğrulama anahtarını ve bildirim adresini uygulamanızın Use cases → Customize → Configuration (eski arayüzde WhatsApp → Configuration) bölümündeki Webhook alanına girin; messages, message_template_status_update, phone_number_quality_update, business_capability_update ve user_preferences alanlarına abone olun.</li>
          <li>&quot;Aboneliği etkinleştir&quot; ve &quot;Bağlantıyı test et&quot;; ardından test modunda kendi numaranıza bir kampanya gönderin.</li>
        </ol>
        <p className="mt-2 text-[13px] text-soluk">
          Numaranız başka bir sağlayıcı ya da araçta kullanılıyorsa bu bağlantı onu bozmaz; Harita CRM ek abone olur. İlk
          gerçek kampanyayı küçük ve izinli bir listeyle yapın.
        </p>
      </details>
    </div>
  );
}
