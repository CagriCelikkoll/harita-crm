"use client";
// WhatsApp günlük liste (yarı otomatik). Uygulama sırayı ve mesajı hazırlar; her sohbeti kullanıcı "WhatsApp'ta aç"
// bağlantısına tıklayarak kendisi açar ve gönderir, sonra sonucu bildirir. Otomatik sekme açma ya da gönderim yok.
// Bağlantı sunucu yönlendirmesidir (/api/whatsapp/ac/[id]): numara yalnızca orada çözülür; bu ekranı açmak ya da
// yenilemek Places çağrısı yapmaz. Numara ekranda yalnızca kayıtta ek_telefon varsa gösterilir.
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiIstek } from "@/lib/api-istemci";
import {
  ALICI_TURLERI,
  ALICI_TURU_ADLARI,
  HARIC_NEDEN_ADLARI,
  WHATSAPP_DURUM_ADLARI,
  type HaricNedeni,
} from "@/lib/mesajlasma";
import { KAYIT_DURUM_ADLARI, KAYIT_DURUMLARI } from "@/lib/sabitler";
import type { ListeDurumu } from "@/server/servisler/whatsapp";

type Hazirlik = { eklenen: number; haricler: Partial<Record<HaricNedeni, number>>; kapasite: number };

export function WhatsappListesi({ etiketler, donus }: { etiketler: string[]; donus: string | null }) {
  const [veri, setVeri] = useState<ListeDurumu | null>(null);
  const [hazirlik, setHazirlik] = useState<Hazirlik | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [acildi, setAcildi] = useState<string | null>(null); // bağlantısı açılmış öğe
  const [durum, setDurum] = useState("yeni");
  const [etiket, setEtiket] = useState("");
  const [aliciTuru, setAliciTuru] = useState("");

  // İlk yükleme ve sekmeye geri dönüş (WhatsApp sekmesinden): liste yenilenir. Places çağrısı yapmaz.
  useEffect(() => {
    let iptal = new AbortController();
    const yukle = () => {
      iptal.abort();
      iptal = new AbortController();
      apiIstek<ListeDurumu>("/api/whatsapp/liste", { sinyal: iptal.signal })
        .then((s) => (s.ok ? setVeri(s.veri) : setHata(s.hata)))
        .catch(() => {});
    };
    yukle();
    window.addEventListener("focus", yukle);
    return () => {
      window.removeEventListener("focus", yukle);
      iptal.abort();
    };
  }, []);

  async function istek(url: string, govde: unknown) {
    setMesgul(true);
    setHata(null);
    const s = await apiIstek<ListeDurumu & { hazirlik?: Hazirlik }>(url, { method: "POST", govde });
    setMesgul(false);
    if (!s.ok) {
      setHata(s.hata);
      return;
    }
    setVeri(s.veri);
    if (s.veri.hazirlik) setHazirlik(s.veri.hazirlik);
    setAcildi(null);
  }

  const siradaki = veri?.siradaki ?? null;
  const bekleyen = veri?.ogeler.filter((o) => o.durum === "bekliyor").length ?? 0;

  return (
    <section className="kart scroll-mt-4" id="whatsapp" aria-labelledby="wa-liste-baslik">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="wa-liste-baslik" className="font-semibold">
          WhatsApp günlük liste
        </h2>
        {veri && (
          <span className="text-sm tabular-nums">
            Bugün gönderilen {veri.gonderilen} / {veri.sinir} · sırada {bekleyen}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-soluk">
        Mesajları kendi WhatsApp&apos;ınızdan gönderirsiniz: &quot;WhatsApp&apos;ta aç&quot; sohbeti yeni sekmede açar, mesaj
        hazır gelir. Gönderip buraya dönün ve sonucu seçin. Ret, engel listesi ve izinsiz bireysel kayıtlar listeye
        alınmaz; cep numarası olmayanlar otomatik atlanır.
      </p>

      {donus && (
        <p role="alert" className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          {donus}
        </p>
      )}
      {veri && !veri.sablonVar && (
        <p role="alert" className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          Önce <Link href="/ayarlar" className="underline">Ayarlar</Link>&apos;da WhatsApp mesaj şablonunu tanımlayın.
        </p>
      )}

      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void istek("/api/whatsapp/liste", {
            filtre: { ...(durum ? { durum } : {}), ...(etiket ? { etiket } : {}), ...(aliciTuru ? { aliciTuru } : {}) },
          });
        }}
      >
        <label className="etiket">
          Durum
          <select value={durum} onChange={(e) => setDurum(e.target.value)} className="girdi">
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
          <select value={etiket} onChange={(e) => setEtiket(e.target.value)} className="girdi">
            <option value="">Tümü</option>
            {etiketler.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="etiket">
          Alıcı türü
          <select value={aliciTuru} onChange={(e) => setAliciTuru(e.target.value)} className="girdi">
            <option value="">Tümü</option>
            {ALICI_TURLERI.map((t) => (
              <option key={t} value={t}>
                {ALICI_TURU_ADLARI[t]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="dugme-ana" disabled={mesgul || !veri?.sablonVar || veri.kalan - bekleyen <= 0}>
          Bugünkü listeyi doldur
        </button>
      </form>
      {hazirlik && (
        <p role="status" className="mb-3 text-sm">
          {hazirlik.eklenen} kayıt sıraya eklendi
          {Object.entries(hazirlik.haricler).length > 0 &&
            ` · hariç: ${Object.entries(hazirlik.haricler)
              .map(([n, sayi]) => `${HARIC_NEDEN_ADLARI[n as HaricNedeni]} ${sayi}`)
              .join(", ")}`}
          {hazirlik.kapasite === 0 && " · bugünkü sınırınız sırada bekleyenlerle dolu"}
        </p>
      )}
      {hata && (
        <p role="alert" className="mb-3 text-sm text-tehlike">
          {hata}
        </p>
      )}

      {veri && veri.kalan <= 0 && (
        <p className="mb-3 rounded-md bg-zemin p-3 text-sm">Bugünkü sınırınıza ulaştınız. Liste yarın (İstanbul saatiyle) sıfırlanır.</p>
      )}

      {siradaki && (
        <div className="mb-4 rounded-lg border border-ana/30 bg-ana-acik/40 p-4" aria-live="polite">
          <p className="text-xs font-medium text-soluk">Sıradaki işletme</p>
          <p className="text-lg font-semibold">{siradaki.isletmeAdi ?? "İşletme adı girilmemiş"}</p>
          <p className="text-sm tabular-nums">
            {siradaki.telefon ?? (
              <span className="text-xs text-soluk">Numara kayıtta yok; &quot;WhatsApp&apos;ta aç&quot;ta Google&apos;dan alınır (4 birim, saklanmaz).</span>
            )}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-white p-2 text-sm">{siradaki.mesaj}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={siradaki.baglanti}
              target="_blank"
              rel="noopener noreferrer"
              className="dugme-ana"
              onClick={() => setAcildi(siradaki.ogeId)}
            >
              WhatsApp&apos;ta aç
            </a>
            <button
              type="button"
              className="dugme"
              disabled={mesgul || acildi !== siradaki.ogeId}
              title={acildi === siradaki.ogeId ? undefined : "Önce sohbeti açın"}
              onClick={() => void istek(`/api/whatsapp/liste/${siradaki.ogeId}`, { sonuc: "gonderdim" })}
            >
              Gönderdim
            </button>
            <button type="button" className="dugme" disabled={mesgul} onClick={() => void istek(`/api/whatsapp/liste/${siradaki.ogeId}`, { sonuc: "atla" })}>
              Atla
            </button>
            <button
              type="button"
              className="dugme-tehlike"
              disabled={mesgul}
              onClick={() => void istek(`/api/whatsapp/liste/${siradaki.ogeId}`, { sonuc: "ret" })}
            >
              Ret istedi
            </button>
            <Link href={`/kayitlar?secili=${siradaki.leadId}`} className="dugme">
              Kaydı aç
            </Link>
          </div>
        </div>
      )}
      {veri && veri.sablonVar && veri.kalan > 0 && !siradaki && bekleyen === 0 && (
        <p className="mb-3 text-sm text-soluk">Sırada kayıt yok. Bir alıcı grubu seçip listeyi doldurun.</p>
      )}

      {veri && veri.ogeler.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-soluk">Bugünkü liste ({veri.ogeler.length})</summary>
          <ol className="mt-2 flex flex-col gap-1">
            {veri.ogeler.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2 border-b border-kenar py-1 last:border-0">
                <Link href={`/kayitlar?secili=${o.leadId}`} className="text-ana underline">
                  {o.sira}. {o.isletmeAdi ?? "İşletme adı girilmemiş"}
                </Link>
                <span className="text-xs text-soluk">
                  {WHATSAPP_DURUM_ADLARI[o.durum]}
                  {o.neden && ` · ${HARIC_NEDEN_ADLARI[o.neden as HaricNedeni] ?? o.neden}`}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
