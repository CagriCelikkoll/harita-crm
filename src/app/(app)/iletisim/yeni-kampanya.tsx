"use client";
// Yeni kampanya: kanal, alıcı grubu, {isletme} yer tutuculu şablon ve canlı önizleme → özet → başlat / zamanla.
// Alıcı kuralları sunucuda uygulanır; özet ekranı hariç tutulanları nedenleriyle gösterir.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiIstek } from "@/lib/api-istemci";
import { sayiYaz } from "@/lib/bicim";
import {
  ALICI_TURLERI,
  ALICI_TURU_ADLARI,
  HARIC_NEDEN_ADLARI,
  HARIC_NEDENLERI,
  KANAL_ADLARI,
  type Kanal,
} from "@/lib/mesajlasma";
import { KAYIT_DURUM_ADLARI, KAYIT_DURUMLARI } from "@/lib/sabitler";
import { sablonDoldur } from "@/lib/sablon";
import type { MesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";
import type { KampanyaOzeti } from "@/server/servisler/kampanya";

const ORNEK_SABLON = "Merhaba {isletme},\n\n";

export function YeniKampanya(props: {
  etiketler: string[];
  saglayicilar: MesajlasmaAyarlariDto["saglayicilar"];
  eksikAyarlar: string[];
}) {
  const router = useRouter();
  const [kanal, setKanal] = useState<Kanal>("eposta");
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
  const [ozet, setOzet] = useState<KampanyaOzeti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const saglayiciTanimli = props.saglayicilar[kanal].tanimli;
  const degisti = <T,>(ayarla: (v: T) => void) => (v: T) => {
    ayarla(v);
    setOzet(null); // taslak değişince özet geçersiz
  };

  const girdi = () => ({
    kanal,
    ad,
    konu: kanal === "eposta" ? konu : undefined,
    sablon,
    bosIsimHitabi: bosHitap || undefined,
    filtre: {
      ...(durum ? { durum } : {}),
      ...(etiket ? { etiket } : {}),
      ...(aliciTuru ? { aliciTuru } : {}),
    },
    testModu,
    planlananTarih: zamanla && tarih ? new Date(tarih).toISOString() : null,
  });

  async function ozetAl() {
    setMesgul(true);
    setHata(null);
    const s = await apiIstek<{ ozet: KampanyaOzeti }>("/api/kampanyalar/ozet", { method: "POST", govde: girdi() });
    setMesgul(false);
    if (s.ok) setOzet(s.veri.ozet);
    else setHata(s.hata);
  }

  async function baslat() {
    setMesgul(true);
    setHata(null);
    const s = await apiIstek<{ id: string }>("/api/kampanyalar", { method: "POST", govde: girdi() });
    if (s.ok) {
      router.push(`/iletisim/kampanya/${s.veri.id}`);
      router.refresh();
    } else {
      setMesgul(false);
      setHata(s.hata);
    }
  }

  const ornekAdli = sablonDoldur(sablon, "Örnek İşletme", bosHitap);
  const ornekAdsiz = sablonDoldur(sablon, null, bosHitap);
  const gercekGonderim = ozet && !ozet.sandbox;

  return (
    <section className="kart self-start" aria-labelledby="yeni-kampanya-baslik">
      <h2 id="yeni-kampanya-baslik" className="mb-3 font-semibold">
        Yeni kampanya
      </h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ozetAl();
        }}
      >
        <fieldset disabled={mesgul} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="etiket">
              Kanal
              <select value={kanal} onChange={(e) => degisti(setKanal)(e.target.value as Kanal)} className="girdi">
                <option value="eposta">{KANAL_ADLARI.eposta}</option>
                <option value="sms" disabled>
                  {KANAL_ADLARI.sms} (yakında)
                </option>
              </select>
            </label>
            <label className="etiket">
              Kampanya adı
              <input value={ad} onChange={(e) => degisti(setAd)(e.target.value)} required maxLength={120} className="girdi" />
            </label>
          </div>

          <fieldset className="rounded-md border border-kenar p-3">
            <legend className="px-1 text-sm font-medium">Alıcı grubu</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="etiket">
                Durum
                <select value={durum} onChange={(e) => degisti(setDurum)(e.target.value)} className="girdi">
                  <option value="">Tümü</option>
                  {KAYIT_DURUMLARI.map((d) => (
                    <option key={d} value={d}>
                      {KAYIT_DURUM_ADLARI[d]}
                    </option>
                  ))}
                </select>
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
              <label className="etiket">
                Alıcı türü
                <select value={aliciTuru} onChange={(e) => degisti(setAliciTuru)(e.target.value)} className="girdi">
                  <option value="">Tümü</option>
                  {ALICI_TURLERI.map((t) => (
                    <option key={t} value={t}>
                      {ALICI_TURU_ADLARI[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          {kanal === "eposta" && (
            <label className="etiket">
              Konu
              <input value={konu} onChange={(e) => degisti(setKonu)(e.target.value)} required maxLength={200} className="girdi" />
            </label>
          )}
          <label className="etiket">
            Mesaj
            <textarea
              value={sablon}
              onChange={(e) => degisti(setSablon)(e.target.value)}
              required
              rows={7}
              maxLength={5000}
              className="girdi font-normal"
            />
            <span className="text-xs font-normal text-soluk">
              {"{isletme}"} kaydın &quot;İşletme adı (sizin kaydınız)&quot; alanıyla doldurulur. Google&apos;dan gelen
              ad mesaja eklenmez. Gönderen bilgileri ve abonelikten çıkma bağlantısı otomatik eklenir.
            </span>
          </label>
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

          <div className="grid gap-2 rounded-md bg-zemin p-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-soluk">Önizleme: işletme adı girilmiş</p>
              <p className="whitespace-pre-wrap break-words">{ornekAdli || "—"}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-soluk">Önizleme: işletme adı girilmemiş</p>
              <p className="whitespace-pre-wrap break-words">{ornekAdsiz || "—"}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            {saglayiciTanimli ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={testModu} onChange={(e) => degisti(setTestModu)(e.target.checked)} />
                Test modu (sandbox): gerçek gönderim yapma, yalnızca kaydet
              </label>
            ) : (
              <p className="text-xs text-soluk">
                {KANAL_ADLARI[kanal]} sağlayıcısı tanımlı değil: kampanya sandbox modunda çalışır (gerçek gönderim
                yapılmaz, mesajlar kaydedilir). Ayarlar&apos;dan sağlayıcı ekleyebilirsiniz.
              </p>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={zamanla} onChange={(e) => degisti(setZamanla)(e.target.checked)} />
              İleri bir tarihe zamanla
            </label>
            {zamanla && (
              <input
                type="datetime-local"
                value={tarih}
                onChange={(e) => degisti(setTarih)(e.target.value)}
                required
                className="girdi max-w-xs"
                aria-label="Planlanan gönderim zamanı"
              />
            )}
          </div>
        </fieldset>

        {hata && (
          <p role="alert" className="text-sm text-tehlike">
            {hata}
          </p>
        )}
        {!ozet && (
          <button type="submit" className="dugme-ana self-start" disabled={mesgul}>
            Gönderim özetini göster
          </button>
        )}
      </form>

      {ozet && (
        <div className="mt-4 flex flex-col gap-3 border-t border-kenar pt-4" aria-live="polite">
          <h3 className="font-semibold">Gönderim özeti</h3>
          <p className="text-2xl font-semibold tabular-nums">
            {sayiYaz(ozet.gonderilecek)} <span className="text-sm font-normal text-soluk">alıcıya gönderilecek</span>
          </p>
          <table className="w-full text-sm">
            <caption className="mb-1 text-left text-xs font-medium text-soluk">
              Hariç tutulanlar ({sayiYaz(ozet.toplamAday - ozet.gonderilecek)} / {sayiYaz(ozet.toplamAday)} kayıt)
            </caption>
            <tbody>
              {HARIC_NEDENLERI.filter((n) => ozet.kanal !== "eposta" || n !== "cep_degil").map((n) => (
                <tr key={n} className="border-b border-kenar last:border-0">
                  <td className="py-1">{HARIC_NEDEN_ADLARI[n]}</td>
                  <td className="py-1 text-right tabular-nums">{sayiYaz(ozet.haricler[n])}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1">
                  Günlük sınır nedeniyle sonraki günlere kalacak
                  <span className="block text-xs text-soluk">
                    Sınır {sayiYaz(ozet.gunlukSinir)}/gün, başlangıç günü için kalan {sayiYaz(ozet.bugunKalan)}
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums">{sayiYaz(ozet.sonrakiGunlereKalacak)}</td>
              </tr>
            </tbody>
          </table>
          {ozet.isletmeAdiEksik > 0 && (
            <p className="text-sm">
              İşletme adı girilmemiş: <strong className="tabular-nums">{sayiYaz(ozet.isletmeAdiEksik)}</strong> kayıt{" "}
              <span className="text-soluk">({bosHitap ? `"${bosHitap}" hitabı kullanılacak` : "{isletme} kaldırılacak"})</span>
            </p>
          )}
          {ozet.onizleme && (
            <div className="rounded-md bg-zemin p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-soluk">İlk alıcı için mesaj</p>
              <p className="whitespace-pre-wrap break-words">{ozet.onizleme}</p>
            </div>
          )}
          {ozet.sandbox ? (
            <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
              Sandbox: gerçek gönderim yapılmayacak; mesajlar kampanya detayında görüntülenebilir.
            </p>
          ) : ozet.eksikAyarlar.length ? (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-tehlike">
              Gerçek gönderim için Ayarlar → Ticari ileti bölümünü tamamlayın: {ozet.eksikAyarlar.join(", ")}.
            </p>
          ) : (
            <p className="text-sm text-soluk">Gerçek gönderim: çalışma alanınızın sağlayıcısı üzerinden gönderilecek.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="dugme-ana"
              disabled={mesgul || ozet.gonderilecek === 0 || Boolean(gercekGonderim && ozet.eksikAyarlar.length)}
              onClick={() => void baslat()}
            >
              {zamanla ? "Kampanyayı zamanla" : "Kampanyayı başlat"}
            </button>
            <button type="button" className="dugme" disabled={mesgul} onClick={() => setOzet(null)}>
              Düzenle
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
