"use client";
// Ayarlar → WhatsApp (Meta Business). Yalnızca yönetici görür. Gizli bilgiler sunucudan hiç gelmez; yalnızca
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
  SABLON_KATEGORI_ADLARI,
  TEST_NUMARASI_AZAMI,
  type Kalite,
} from "@/lib/whatsapp-api";
import type { BaglantiDto, SablonDto } from "@/server/servisler/whatsapp-api";
import { KopyalaDugmesi } from "./formlar";

type Mesaj = { tur: "hata" | "tamam"; metin: string } | null;

const KALITE_TONU: Record<Kalite, RozetTonu> = { GREEN: "ana", YELLOW: "uyari", RED: "tehlike", NA: "notr" };

export function WhatsappApiAyarlari(props: { ilk: BaglantiDto; ilkSablonlar: SablonDto[] }) {
  const [b, setB] = useState(props.ilk);
  const [sablonlar, setSablonlar] = useState(props.ilkSablonlar);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
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
    const v = s.veri as { baglanti?: BaglantiDto; verifyToken?: string | null };
    if (v.baglanti) setB(v.baglanti);
    if (v.verifyToken) setVerifyToken(v.verifyToken);
    if (tamamMetni) setMesaj({ tur: "tamam", metin: tamamMetni });
    return s.veri;
  }

  const n = b.numara;
  const [adim1, adim2, adim3, adim4] = kurulumAdimlari(b);
  const testModuKapat = () => {
    if (confirm("Test modu kapatılınca kampanyalar gerçek alıcılara gider. Devam edilsin mi?")) {
      void calistir("/api/ayarlar/whatsapp-api", "PATCH", { testModu: false }, "Test modu kapatıldı.");
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
              ? "WhatsApp hesabı bağlı değil"
              : n.gorunenNumara
                ? `${n.dogrulanmisAd ?? "WhatsApp numarası"} · ${n.gorunenNumara}`
                : "Numara bilgisi için bağlantıyı test edin"}
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
              {n.kalite && <DurumRozeti ton={KALITE_TONU[n.kalite]}>Kalite: {KALITE_ADLARI[n.kalite]}</DurumRozeti>}
              {n.limitKatmani && (
                <DurumRozeti ton="notr" title="24 saat içinde mesaj başlatılabilecek farklı kişi sayısı; işletme portföyünüzdeki tüm numaralarca paylaşılır.">
                  Meta sınırı: {limitKatmaniAdi(n.limitKatmani).toLocaleLowerCase("tr")}
                </DurumRozeti>
              )}
              <DurumRozeti ton={b.testModu ? "uyari" : "ana"}>{b.testModu ? "Test modu açık" : "Test modu kapalı"}</DurumRozeti>
            </div>
          ) : (
            <p className="text-soluk">Hesap bilgilerinizi aşağıdaki &quot;Teknik ayrıntılar&quot; bölümünden girin.</p>
          )}
          {(n.sonKontrol || n.sonHata) && (
            <p className="text-[13px] text-soluk">
              {n.sonKontrol && `Son kontrol: ${tarihYaz(n.sonKontrol)}`}
              {n.sonHata && <span className="block text-tehlike">Son hata: {n.sonHata}</span>}
            </p>
          )}
        </div>
        {b.tanimli && (
          <button type="button" className="dugme" disabled={mesgul} onClick={() => calistir("/api/ayarlar/whatsapp-api/test", "POST", undefined, "Bağlantı çalışıyor.")}>
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
                    : "Bildirim adresini ve doğrulama anahtarını Meta uygulamanızın Webhook ayarına girin; Meta adresi doğrulayınca bu adım tamamlanır.",
                eylem:
                  adim2 === "etkin" ? (
                    <button type="button" className="dugme dugme-kucuk" disabled={mesgul} onClick={() => calistir("/api/ayarlar/whatsapp-api/abonelik", "POST", undefined, "Bildirim aboneliği etkin.")}>
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
                    <Link href="/iletisim" className="dugme-ana dugme-kucuk">
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
                      ? "Kapatınca kampanyalar test numaraları dışındaki alıcılara da gider."
                      : "2. ve 3. adım tamamlanınca açılır.",
                eylem:
                  adim4 === "etkin" ? (
                    <button type="button" className="dugme-tehlike dugme-kucuk" disabled={mesgul} onClick={testModuKapat}>
                      Test modunu kapat
                    </button>
                  ) : adim4 === "tamam" ? (
                    <button
                      type="button"
                      className="dugme dugme-kucuk"
                      disabled={mesgul}
                      onClick={() => calistir("/api/ayarlar/whatsapp-api", "PATCH", { testModu: true }, "Test modu açıldı.")}
                    >
                      Test modunu yeniden aç
                    </button>
                  ) : undefined,
              },
            ]}
          />
        </div>
      </Kart>

      {b.tanimli && <PayVeTestNumaralari b={b} mesgul={mesgul} kaydet={(govde) => calistir("/api/ayarlar/whatsapp-api", "PATCH", govde, "Kaydedildi.")} />}

      {b.tanimli && (
        <Kart>
          <KartBaslik
            baslik="Mesaj şablonları"
            aciklama={`Meta'da onaylanan şablonlar; yenileri Meta WhatsApp Manager'da eklenir.${b.sablonSenkronTarihi ? ` Son yenileme: ${tarihYaz(b.sablonSenkronTarihi)}.` : ""}`}
          >
            <button
              type="button"
              className="dugme dugme-kucuk"
              disabled={mesgul}
              onClick={async () => {
                const v = await calistir<{ sablonlar: SablonDto[] }>("/api/whatsapp/sablonlar", "POST", undefined, "Şablonlar yenilendi.");
                if (v) {
                  setSablonlar(v.sablonlar);
                  const d = await apiIstek<{ baglanti: BaglantiDto }>("/api/ayarlar/whatsapp-api");
                  if (d.ok) setB(d.veri.baglanti);
                }
              }}
            >
              Meta&apos;dan yenile
            </button>
          </KartBaslik>
          {sablonlar.length === 0 ? (
            <p className="border-t border-cizgi px-7 py-4 text-soluk">Henüz şablon yok.</p>
          ) : (
            <ul>
              {sablonlar.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-4 border-t border-cizgi px-7 py-4">
                  <div className="min-w-0 flex-[1_1_200px]">
                    <p className="font-semibold">{s.ad}</p>
                    <p className="text-[13px] text-soluk">
                      {SABLON_KATEGORI_ADLARI[s.kategori] ?? s.kategori} · {s.dil} ·{" "}
                      {s.destekNedeni ?? (s.degiskenler.length ? `${s.degiskenler.length} değişken` : "değişken yok")}
                    </p>
                  </div>
                  {s.destekNedeni ? <DurumRozeti ton="uyari">Kullanılamaz</DurumRozeti> : <DurumRozeti>Kullanılabilir</DurumRozeti>}
                </li>
              ))}
            </ul>
          )}
        </Kart>
      )}

      <Katlanir baslik="Teknik ayrıntıları" ozet="Hesap kimlikleri, erişim anahtarı, bildirim adresi" acik={!b.tanimli}>
        <TeknikAyrintilar b={b} mesgul={mesgul} calistir={calistir} />
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

function TeknikAyrintilar(props: {
  b: BaglantiDto;
  mesgul: boolean;
  calistir: (url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", govde?: unknown, tamamMetni?: string) => Promise<unknown>;
}) {
  const { b, mesgul, calistir } = props;
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
          void calistir(
            "/api/ayarlar/whatsapp-api",
            "PUT",
            { wabaId: d("wabaId"), phoneNumberId: d("phoneNumberId"), erisimAnahtari: d("erisimAnahtari") || null, appSecret: d("appSecret") || null },
            "Bağlantı kaydedildi.",
          ).then((v) => {
            // Gizli alanları formda tutma.
            if (v) for (const ad of ["erisimAnahtari", "appSecret"]) (form.elements.namedItem(ad) as HTMLInputElement).value = "";
          });
        }}
      >
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
                if (confirm("WhatsApp Business bağlantısı ve kayıtlı gizli bilgiler silinecek.")) {
                  void calistir("/api/ayarlar/whatsapp-api", "DELETE", undefined, "Bağlantı kaldırıldı.");
                }
              }}
            >
              Bağlantıyı kaldır
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
                    void calistir("/api/ayarlar/whatsapp-api/verify-token", "POST");
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
                onClick={() => calistir("/api/ayarlar/whatsapp-api/abonelik", "POST", undefined, "Bildirim aboneliği etkin.")}
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
          <li>developers.facebook.com&apos;da kendi Business Manager&apos;ınıza bağlı Business türünde bir uygulama açın, WhatsApp ürününü ekleyin. App Secret: Uygulama ayarları → Temel.</li>
          <li>Business Settings → Kullanıcılar → System users → Ekle (Employee rolü yeterli).</li>
          <li>&quot;Varlık ata&quot;: yalnızca ilgili WhatsApp hesabı (tam kontrol) ve bu uygulama.</li>
          <li>&quot;Token oluştur&quot;: uygulamayı seçin, süre &quot;Hiçbir zaman&quot;, izinler yalnızca whatsapp_business_messaging ve whatsapp_business_management.</li>
          <li>WABA ID ve Phone Number ID: WhatsApp Manager → Hesap araçları → Telefon numaraları (ya da uygulamadaki API kurulumu sayfası).</li>
          <li>Bu formu kaydedin; gösterilen doğrulama anahtarını ve bildirim adresini uygulamanızın WhatsApp → Yapılandırma → Webhook alanına girin; messages, message_template_status_update, phone_number_quality_update, business_capability_update ve user_preferences alanlarına abone olun.</li>
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
