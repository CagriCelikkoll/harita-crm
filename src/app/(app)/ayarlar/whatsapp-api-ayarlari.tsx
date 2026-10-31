"use client";
// Ayarlar → WhatsApp Business (API). Yalnızca yönetici görür. Gizli bilgiler sunucudan hiç gelmez; yalnızca
// "tanımlı / tanımlı değil". Verify token yalnızca üretildiği yanıtta bir kez gösterilir.
import { useState } from "react";
import { SonucMesaji } from "@/components/bildirim";
import { apiIstek } from "@/lib/api-istemci";
import { tarihYaz } from "@/lib/bicim";
import { telefonBicimle } from "@/lib/adres-normal";
import { KALITE_ADLARI, limitKatmaniAdi, SABLON_KATEGORI_ADLARI, TEST_NUMARASI_AZAMI } from "@/lib/whatsapp-api";
import type { BaglantiDto, SablonDto } from "@/server/servisler/whatsapp-api";

type Mesaj = { tur: "hata" | "tamam"; metin: string } | null;

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
  return (
    <section className="kart space-y-4" id="whatsapp-api">
      <div>
        <h2 className="font-semibold">WhatsApp Business (API)</h2>
        <p className="mt-1 text-sm text-soluk">
          Onaylı şablonlarla toplu kampanya (Meta Cloud API). Meta mesaj ücretini doğrudan işletmenizin WhatsApp
          hesabından keser; Harita CRM fatura kesmez.
        </p>
      </div>

      {b.tanimli && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-soluk">Numara</dt>
          <dd>{n.gorunenNumara ? `${n.gorunenNumara} — ${n.dogrulanmisAd ?? ""}` : "Bağlantıyı test edin"}</dd>
          <dt className="text-soluk">Numara sahipliği</dt>
          <dd className={b.numaraDogrulandi ? "" : "text-tehlike"}>
            {b.numaraDogrulandi
              ? "Doğrulandı (numara bu WhatsApp Business hesabına ait)"
              : "Doğrulanmadı — bağlantı kullanılmıyor; \"Bağlantıyı test et\" ile yeniden doğrulayın"}
          </dd>
          <dt className="text-soluk">Kalite</dt>
          <dd className={n.kalite === "RED" ? "text-tehlike" : n.kalite === "YELLOW" ? "text-amber-700" : ""}>
            {n.kalite ? KALITE_ADLARI[n.kalite] : "—"}
          </dd>
          <dt className="text-soluk">Mesajlaşma limiti</dt>
          <dd>
            {n.limitKatmani ? limitKatmaniAdi(n.limitKatmani) : "—"}
            <span className="block text-xs text-soluk">
              Meta&apos;nın izin verdiği, 24 saat içinde mesaj başlatılabilecek farklı kişi sayısı; işletme portföyünüzdeki tüm
              numaralarca paylaşılır.
            </span>
          </dd>
          <dt className="text-soluk">Bu uygulamanın payı</dt>
          <dd>
            %{b.uygulamaPayi}
            {n.limit !== null && n.limitKatmani && ` (≈ ${Math.floor((n.limit * b.uygulamaPayi) / 100).toLocaleString("tr")} alıcı / 24 saat)`}
          </dd>
          {n.sonKontrol && (
            <>
              <dt className="text-soluk">Son kontrol</dt>
              <dd>{tarihYaz(n.sonKontrol)}</dd>
            </>
          )}
          {n.sonHata && (
            <>
              <dt className="text-soluk">Son hata</dt>
              <dd className="text-tehlike">{n.sonHata}</dd>
            </>
          )}
        </dl>
      )}

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const d = (a: string) => String(f.get(a) ?? "").trim();
          void calistir("/api/ayarlar/whatsapp-api", "PUT", {
            wabaId: d("wabaId"),
            phoneNumberId: d("phoneNumberId"),
            erisimAnahtari: d("erisimAnahtari") || null,
            appSecret: d("appSecret") || null,
          }, "Bağlantı kaydedildi.").then((v) => {
            // Gizli alanları formda tutma.
            if (v) for (const ad of ["erisimAnahtari", "appSecret"]) (form.elements.namedItem(ad) as HTMLInputElement).value = "";
          });
        }}
      >
        <label className="etiket">
          WhatsApp Business hesap kimliği (WABA ID)
          <input name="wabaId" required inputMode="numeric" defaultValue={b.wabaId ?? ""} className="girdi" />
          <span className="text-xs font-normal text-soluk">Meta&apos;daki WhatsApp işletme hesabınızın numarası (WhatsApp Manager → Hesap araçları).</span>
        </label>
        <label className="etiket">
          Telefon numarası kimliği (Phone Number ID)
          <input name="phoneNumberId" required inputMode="numeric" defaultValue={b.phoneNumberId ?? ""} className="girdi" />
          <span className="text-xs font-normal text-soluk">Mesajların gönderileceği numaranın Meta&apos;daki kimliği; telefon numarasının kendisi değildir.</span>
        </label>
        <label className="etiket">
          Kalıcı erişim anahtarı (system user token)
          <input
            name="erisimAnahtari"
            type="password"
            autoComplete="off"
            className="girdi"
            placeholder={b.erisimAnahtariTanimli ? "tanımlı — değiştirmek için girin" : "tanımlı değil"}
          />
          <span className="text-xs font-normal text-soluk">Uygulamanın sizin adınıza mesaj göndermesini sağlayan, süresi dolmayan anahtar. Şifreli saklanır, bir daha gösterilmez.</span>
        </label>
        <label className="etiket">
          App Secret
          <input
            name="appSecret"
            type="password"
            autoComplete="off"
            className="girdi"
            placeholder={b.appSecretTanimli ? "tanımlı — değiştirmek için girin" : "tanımlı değil"}
          />
          <span className="text-xs font-normal text-soluk">Meta&apos;dan gelen bildirimlerin gerçekten Meta&apos;dan geldiğini doğrulamak için kullanılır.</span>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" className="dugme-ana" disabled={mesgul}>
            Kaydet
          </button>
          {b.tanimli && (
            <>
              <button
                type="button"
                className="dugme"
                disabled={mesgul}
                onClick={() => calistir("/api/ayarlar/whatsapp-api/test", "POST", undefined, "Bağlantı çalışıyor.")}
              >
                Bağlantıyı test et
              </button>
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
            </>
          )}
        </div>
      </form>

      {verifyToken && (
        <div role="alert" className="rounded-md bg-amber-50 p-3 text-sm">
          <p className="font-medium">Doğrulama şifresi (verify token) — yalnızca şimdi gösteriliyor; kopyalayıp Meta uygulamanıza girin:</p>
          <p className="text-xs text-soluk">Meta, bildirim adresinizi ilk kez bağlarken bu şifreyi sorar; adresin size ait olduğunu böyle anlar.</p>
          <code className="mt-1 block break-all rounded bg-white p-2">{verifyToken}</code>
        </div>
      )}

      {b.tanimli && (
        <div className="space-y-2 border-t border-kenar pt-3 text-sm">
          <h3 className="font-medium">Webhook</h3>
          <p>
            Bildirim adresi (callback URL): <code className="break-all">{b.webhookAdresi}</code>
          </p>
          <p className="text-xs text-soluk">
            Webhook: Meta&apos;nın teslim, okundu ve ret bilgilerini bu adrese göndermesi. Doğrulanmadan test modu kapatılamaz.
          </p>
          <ul className="space-y-0.5">
            <li>{b.webhookDogrulandi ? "✓" : "✗"} Meta webhook doğrulaması (GET)</li>
            <li>
              {b.imzaliDurumAlindi ? "✓" : "✗"} Bu uygulamanın gönderdiği bir iletinin imzası doğrulanmış durum bildirimi
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="dugme"
              disabled={mesgul}
              onClick={() => calistir("/api/ayarlar/whatsapp-api/abonelik", "POST", undefined, "WABA webhook aboneliği etkin.")}
            >
              Webhook aboneliğini etkinleştir
            </button>
            <button
              type="button"
              className="dugme"
              disabled={mesgul}
              onClick={() => {
                if (confirm("Yeni verify token üretilecek; Meta'daki değeri de güncellemeniz gerekir. Test modu yeniden açılır.")) {
                  void calistir("/api/ayarlar/whatsapp-api/verify-token", "POST");
                }
              }}
            >
              Verify token yenile
            </button>
          </div>
        </div>
      )}

      {b.tanimli && (
        <div className="space-y-3 border-t border-kenar pt-3 text-sm">
          <h3 className="font-medium">Test modu ve sınır</h3>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={b.testModu}
              disabled={mesgul || (b.testModu && !b.testModuKapatilabilir)}
              onChange={(e) =>
                calistir("/api/ayarlar/whatsapp-api", "PATCH", { testModu: e.target.checked }, e.target.checked ? "Test modu açıldı." : "Test modu kapatıldı.")
              }
            />
            <span>
              Test modu: kampanyalar yalnızca aşağıdaki test numaralarına gider.
              {b.testModu && !b.testModuKapatilabilir && (
                <span className="block text-xs text-soluk">
                  Kapatmak için webhook doğrulanmış olmalı ve imzası doğrulanmış en az bir mesaj durumu bildirimi alınmış
                  olmalı.
                </span>
              )}
            </span>
          </label>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void calistir(
                "/api/ayarlar/whatsapp-api",
                "PATCH",
                {
                  testNumaralari: String(f.get("testNumaralari") ?? "").split(/[\n,;]/),
                  uygulamaPayi: Number(f.get("uygulamaPayi")),
                },
                "Kaydedildi.",
              );
            }}
          >
            <label className="etiket">
              Test numaraları (en fazla {TEST_NUMARASI_AZAMI}, satır başına bir)
              <textarea name="testNumaralari" rows={3} className="girdi" defaultValue={b.testNumaralari.map(telefonBicimle).join("\n")} />
            </label>
            <label className="etiket">
              Portföy limitinden bu uygulamanın payı (%)
              <input name="uygulamaPayi" type="number" min={1} max={100} defaultValue={b.uygulamaPayi} className="girdi" />
              <span className="text-xs font-normal text-soluk">
                Mesajlaşma limiti işletme portföyündeki tüm numara ve araçlarca paylaşılır.
              </span>
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="dugme" disabled={mesgul}>
                Kaydet
              </button>
            </div>
          </form>
        </div>
      )}

      {mesaj && <SonucMesaji key={mesaj.metin} tur={mesaj.tur} metin={mesaj.metin} />}

      {b.tanimli && (
        <div className="space-y-2 border-t border-kenar pt-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">
              Şablonlar{b.sablonSenkronTarihi && <span className="font-normal text-soluk"> — son senkron {tarihYaz(b.sablonSenkronTarihi)}</span>}
            </h3>
            <button
              type="button"
              className="dugme"
              disabled={mesgul}
              onClick={async () => {
                const v = await calistir<{ sablonlar: SablonDto[] }>("/api/whatsapp/sablonlar", "POST", undefined, "Şablonlar senkronize edildi.");
                if (v) {
                  setSablonlar(v.sablonlar);
                  const d = await apiIstek<{ baglanti: BaglantiDto }>("/api/ayarlar/whatsapp-api");
                  if (d.ok) setB(d.veri.baglanti);
                }
              }}
            >
              Meta&apos;dan senkronize et
            </button>
          </div>
          <p className="text-xs text-soluk">
            Şablonlar Meta WhatsApp Manager&apos;da oluşturulur ve onaylanır; burada yalnızca listelenir. Pazarlama
            şablonunda abonelikten çıkma hızlı yanıt butonu yoksa kampanyada kullanılamaz.
          </p>
          {sablonlar.length === 0 ? (
            <p className="text-soluk">Henüz şablon yok.</p>
          ) : (
            <ul className="divide-y divide-kenar">
              {sablonlar.map((s) => (
                <li key={s.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.ad}</span>
                    <span className="rozet">{s.dil}</span>
                    <span className="rozet">{SABLON_KATEGORI_ADLARI[s.kategori] ?? s.kategori}</span>
                    <span className="text-xs text-soluk">{s.durum}</span>
                    {s.degiskenler.length > 0 && (
                      <span className="text-xs text-soluk">
                        değişkenler: {s.degiskenler.map((d) => `{{${d.ad}}}`).join(", ")}
                      </span>
                    )}
                  </div>
                  {s.destekNedeni ? (
                    <p className="text-xs text-tehlike">Kampanyada kullanılamaz: {s.destekNedeni}</p>
                  ) : (
                    <p className="text-xs text-ana">Kampanyada kullanılabilir</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <details className="border-t border-kenar pt-3 text-sm">
        <summary className="cursor-pointer font-medium">Kurulum: system user ve kalıcı erişim anahtarı</summary>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-soluk">
          <li>developers.facebook.com&apos;da kendi Business Manager&apos;ınıza bağlı Business türünde bir uygulama açın, WhatsApp ürününü ekleyin. App Secret: Uygulama ayarları → Temel.</li>
          <li>Business Settings → Kullanıcılar → System users → Ekle (Employee rolü yeterli).</li>
          <li>&quot;Varlık ata&quot;: yalnızca ilgili WhatsApp hesabı (tam kontrol) ve bu uygulama.</li>
          <li>&quot;Token oluştur&quot;: uygulamayı seçin, süre &quot;Hiçbir zaman&quot;, izinler yalnızca whatsapp_business_messaging ve whatsapp_business_management.</li>
          <li>WABA ID ve Phone Number ID: WhatsApp Manager → Hesap araçları → Telefon numaraları (ya da uygulamadaki API kurulumu sayfası).</li>
          <li>Bu formu kaydedin; gösterilen verify token&apos;ı ve yukarıdaki callback URL&apos;yi uygulamanızın WhatsApp → Yapılandırma → Webhook alanına girin; messages, message_template_status_update, phone_number_quality_update, business_capability_update ve user_preferences alanlarına abone olun.</li>
          <li>&quot;Webhook aboneliğini etkinleştir&quot; ve &quot;Bağlantıyı test et&quot;; ardından test modunda kendi numaranıza bir kampanya gönderin.</li>
        </ol>
        <p className="mt-2 text-xs text-soluk">
          Numaranız başka bir sağlayıcı ya da araçta kullanılıyorsa bu bağlantı onu bozmaz; Harita CRM ek abone olur. İlk
          gerçek kampanyayı küçük ve izinli bir listeyle yapın.
        </p>
      </details>
    </section>
  );
}
