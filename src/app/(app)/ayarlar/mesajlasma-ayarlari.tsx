"use client";
// Ayarlar → mesajlaşma: ticari ileti bilgileri, gönderim saatleri ve sınırlar, e-posta (SMTP) sağlayıcısı.
// Sağlayıcı kimlik bilgileri sunucudan hiçbir zaman geri gelmez: yalnızca "tanımlı / tanımlı değil".
import { useState } from "react";
import { apiIstek } from "@/lib/api-istemci";
import { tarihYaz } from "@/lib/bicim";
import { dakikadanSaate, SMTP_IZINLI_PORTLAR, TEST_GONDERIM_SAATLIK_SINIR, ZORUNLU_ONAY_METNI } from "@/lib/mesajlasma";
import type { MesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";

type Mesaj = { tur: "hata" | "tamam"; metin: string; alan: string } | null;

function MesajGoster({ mesaj, alan }: { mesaj: Mesaj; alan: string }) {
  if (!mesaj || mesaj.alan !== alan) return null;
  return (
    <p role={mesaj.tur === "hata" ? "alert" : "status"} className={`text-sm ${mesaj.tur === "hata" ? "text-tehlike" : "text-ana"}`}>
      {mesaj.metin}
    </p>
  );
}

const saattenDakikaya = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export function MesajlasmaAyarlari(props: { ilk: MesajlasmaAyarlariDto; yonetici: boolean; slug: string }) {
  const [a, setA] = useState(props.ilk);
  const [mesaj, setMesaj] = useState<Mesaj>(null);
  const [mesgul, setMesgul] = useState(false);
  const surum = JSON.stringify(a); // kayıttan sonra formlar güncel değerlerle yeniden oluşsun

  async function gonder(alan: string, url: string, method: "PUT" | "DELETE" | "POST", govde?: unknown, tamam?: string) {
    setMesgul(true);
    setMesaj(null);
    const s = await apiIstek<{ ayarlar?: MesajlasmaAyarlariDto; mesaj?: string }>(url, { method, govde });
    setMesgul(false);
    if (!s.ok) {
      setMesaj({ tur: "hata", metin: s.hata, alan });
      return false;
    }
    if (s.veri.ayarlar) setA(s.veri.ayarlar);
    setMesaj({ tur: "tamam", metin: s.veri.mesaj ?? tamam ?? "Kaydedildi.", alan });
    return true;
  }

  const smtp = a.saglayicilar.eposta;

  return (
    <>
      <section className="kart" aria-labelledby="ticari-ileti-baslik">
        <h2 id="ticari-ileti-baslik" className="mb-1 font-semibold">
          Ticari ileti
        </h2>
        <p className="mb-3 text-xs text-soluk">
          Gönderen her zaman çalışma alanınızdır. Bu bilgiler her e-postanın altına eklenir. Bilgiler ve onay
          tamamlanmadan yalnızca test (sandbox) kampanyası başlatılabilir.
        </p>
        <form
          key={`ticari-${surum}`}
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void gonder("ticari", "/api/ayarlar/ileti", "PUT", {
              gonderenUnvani: String(f.get("gonderenUnvani") ?? ""),
              iletisimBilgisi: String(f.get("iletisimBilgisi") ?? ""),
              iysNo: String(f.get("iysNo") ?? ""),
              sorumlulukOnayi: f.get("sorumlulukOnayi") === "on",
            });
          }}
        >
          <fieldset disabled={!props.yonetici || mesgul} className="flex flex-col gap-2.5">
            <label className="etiket">
              Gönderen unvanı
              <input name="gonderenUnvani" defaultValue={a.gonderenUnvani ?? ""} maxLength={160} className="girdi" placeholder="Ör. Ege Emlak Danışmanlık Ltd. Şti." />
            </label>
            <label className="etiket">
              İletişim bilgisi
              <input name="iletisimBilgisi" defaultValue={a.iletisimBilgisi ?? ""} maxLength={300} className="girdi" placeholder="Adres, telefon veya web sitesi" />
            </label>
            <label className="etiket">
              İYS kayıt numarası
              <input name="iysNo" defaultValue={a.iysNo ?? ""} maxLength={40} className="girdi" />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="sorumlulukOnayi" defaultChecked={a.sorumlulukOnayi} className="mt-1" />
              <span>{ZORUNLU_ONAY_METNI}</span>
            </label>
            {a.sorumlulukOnayTarihi && <p className="text-xs text-soluk">Onay tarihi: {tarihYaz(a.sorumlulukOnayTarihi)}</p>}
          </fieldset>
          {a.eksikAyarlar.length > 0 && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              Gerçek gönderim için eksik: {a.eksikAyarlar.join(", ")}.
            </p>
          )}
          <MesajGoster mesaj={mesaj} alan="ticari" />
          {props.yonetici ? (
            <button type="submit" className="dugme-ana self-start" disabled={mesgul}>
              Kaydet
            </button>
          ) : (
            <p className="text-xs text-soluk">Bu ayarları yalnızca yöneticiler değiştirebilir.</p>
          )}
        </form>
      </section>

      <section className="kart" aria-labelledby="gonderim-baslik">
        <h2 id="gonderim-baslik" className="mb-1 font-semibold">
          Gönderim saatleri ve sınırlar
        </h2>
        <p className="mb-3 text-xs text-soluk">
          Kampanya mesajları yalnızca bu saatler arasında (İstanbul saati) gönderilir; dışında kalanlar bir sonraki
          güne bekler.
        </p>
        <form
          key={`saat-${surum}`}
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void gonder("saat", "/api/ayarlar/ileti", "PUT", {
              gonderimBaslangicDk: saattenDakikaya(String(f.get("baslangic"))),
              gonderimBitisDk: saattenDakikaya(String(f.get("bitis"))),
            });
          }}
        >
          <fieldset disabled={!props.yonetici || mesgul} className="grid grid-cols-2 gap-2.5">
            <label className="etiket">
              Başlangıç
              <input type="time" name="baslangic" required defaultValue={dakikadanSaate(a.gonderimBaslangicDk)} className="girdi" />
            </label>
            <label className="etiket">
              Bitiş
              <input type="time" name="bitis" required defaultValue={dakikadanSaate(a.gonderimBitisDk)} className="girdi" />
            </label>
          </fieldset>
          <MesajGoster mesaj={mesaj} alan="saat" />
          {props.yonetici && (
            <button type="submit" className="dugme-ana self-start" disabled={mesgul}>
              Kaydet
            </button>
          )}
        </form>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-kenar pt-3 text-sm">
          <dt className="text-soluk">Günlük e-posta sınırı</dt>
          <dd className="tabular-nums">{a.gunlukSinirlar.eposta}</dd>
          <dt className="text-soluk">Günlük SMS sınırı</dt>
          <dd className="tabular-nums">{a.gunlukSinirlar.sms}</dd>
        </dl>
        <p className="mt-2 text-xs text-soluk">
          Sınıra takılan mesajlar ertesi güne kalır. Sınırı sunucu yöneticisi değiştirir:{" "}
          <code className="rounded bg-zemin px-1">npm run sinir -- {props.slug} eposta &lt;sayı&gt;</code>
        </p>
      </section>

      <section className="kart lg:col-span-2" aria-labelledby="smtp-baslik">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 id="smtp-baslik" className="font-semibold">
            E-posta gönderimi (SMTP)
          </h2>
          <span className={`rozet ${smtp.tanimli ? "" : "bg-zemin text-soluk"}`}>
            {smtp.tanimli ? "Tanımlı" : "Tanımlı değil — e-posta kampanyaları sandbox modunda"}
          </span>
        </div>
        <p className="mb-3 text-xs text-soluk">
          E-postalar kendi SMTP sunucunuz üzerinden, kendi gönderen adresinizden gider. Şifre şifrelenerek saklanır ve
          bir daha gösterilmez; değiştirmek için bilgileri yeniden girin. Yalnızca 25, 465, 587 ve 2525 portlarına ve
          herkese açık adreslere bağlanılır.
          {smtp.guncellemeTarihi && ` Son güncelleme: ${tarihYaz(smtp.guncellemeTarihi)}.`}
        </p>
        {props.yonetici ? (
          <form
            key={`smtp-${surum}`}
            className="flex flex-col gap-2.5"
            autoComplete="off"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              const tamam = await gonder(
                "smtp",
                "/api/ayarlar/saglayicilar/eposta",
                "PUT",
                {
                  sunucu: String(f.get("sunucu") ?? ""),
                  port: Number(f.get("port")),
                  kullanici: String(f.get("kullanici") ?? ""),
                  sifre: String(f.get("sifre") ?? ""),
                  gonderen: String(f.get("gonderen") ?? ""),
                },
                "SMTP bilgileri kaydedildi.",
              );
              if (tamam) form.reset();
            }}
          >
            <fieldset disabled={mesgul} className="grid gap-2.5 sm:grid-cols-[2fr_1fr]">
              <label className="etiket">
                SMTP sunucusu
                <input name="sunucu" required maxLength={253} className="girdi" placeholder="smtp.alanadiniz.com" />
              </label>
              <label className="etiket">
                Port
                <select name="port" defaultValue="587" className="girdi">
                  {SMTP_IZINLI_PORTLAR.map((p) => (
                    <option key={p} value={p}>
                      {p}
                      {p === 465 ? " (SSL)" : p === 587 ? " (STARTTLS)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="etiket">
                Kullanıcı adı
                <input name="kullanici" required maxLength={200} className="girdi" autoComplete="off" />
              </label>
              <label className="etiket">
                Şifre
                <input name="sifre" type="password" required maxLength={500} className="girdi" autoComplete="new-password" />
              </label>
              <label className="etiket sm:col-span-2">
                Gönderen adresi
                <input name="gonderen" type="email" required maxLength={200} className="girdi" placeholder="bilgi@alanadiniz.com" />
              </label>
            </fieldset>
            <MesajGoster mesaj={mesaj} alan="smtp" />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="dugme-ana" disabled={mesgul}>
                {smtp.tanimli ? "Bilgileri değiştir" : "Kaydet"}
              </button>
              {smtp.tanimli && (
                <>
                  <button
                    type="button"
                    className="dugme"
                    disabled={mesgul}
                    onClick={() => void gonder("smtp", "/api/ayarlar/saglayicilar/eposta/test", "POST")}
                  >
                    Test e-postası gönder
                  </button>
                  <button
                    type="button"
                    className="dugme-tehlike"
                    disabled={mesgul}
                    onClick={() => void gonder("smtp", "/api/ayarlar/saglayicilar/eposta", "DELETE", undefined, "SMTP bilgileri kaldırıldı.")}
                  >
                    Kaldır
                  </button>
                </>
              )}
            </div>
            {smtp.tanimli && (
              <p className="text-xs text-soluk">
                Test e-postası yalnızca kayıtlı gönderen adresinize gider (saatte en fazla {TEST_GONDERIM_SAATLIK_SINIR}).
              </p>
            )}
          </form>
        ) : (
          <p className="text-xs text-soluk">Sağlayıcı bilgilerini yalnızca yöneticiler değiştirebilir.</p>
        )}
      </section>
    </>
  );
}
