"use client";
// Kampanya detayı: ilerleme, nedenlere göre döküm, alıcı bazında durum. Kampanya sürerken 10 sn'de bir yenilenir.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { apiIstek } from "@/lib/api-istemci";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import {
  BEKLEME_NEDEN_ADLARI,
  HARIC_NEDEN_ADLARI,
  KAMPANYA_DURUM_ADLARI,
  KANAL_ADLARI,
  MESAJ_DURUM_ADLARI,
  MESAJ_DURUMLARI,
  type MesajDurumu,
} from "@/lib/mesajlasma";
import type { KampanyaDto, MesajDto } from "@/server/servisler/kampanya-dto";

type Veri = { kampanya: KampanyaDto; mesajlar: MesajDto[]; toplam: number; sayfa: number; sayfaSayisi: number };

const DIGER_NEDENLER: Record<string, string> = {
  belirsiz: "Sonuç belirsiz (gönderilmiş olabilir)",
  saglayici: "Sağlayıcı hatası",
  ayar_eksik: "Ticari ileti bilgileri eksik",
  hata: "Beklenmeyen hata",
  iptal: "Kampanya iptal edildi",
};
const nedenAdi = (n: string | null) =>
  n ? ((HARIC_NEDEN_ADLARI as Record<string, string>)[n] ?? BEKLEME_NEDEN_ADLARI[n] ?? DIGER_NEDENLER[n] ?? n) : "";

const ROZET: Record<MesajDurumu, string> = {
  kuyrukta: "bg-zemin text-soluk",
  gonderiliyor: "bg-blue-50 text-blue-800",
  gonderildi: "",
  basarisiz: "bg-red-50 text-tehlike",
  haric: "bg-amber-50 text-amber-800",
  iptal: "bg-zemin text-soluk",
};

export function KampanyaDetayi({ ilk }: { ilk: Veri }) {
  const [veri, setVeri] = useState(ilk);
  const [filtre, setFiltre] = useState<MesajDurumu | "">("");
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [acik, setAcik] = useState<string | null>(null);
  const k = veri.kampanya;

  const yukle = useCallback(
    async (sayfa: number, durum: MesajDurumu | "") => {
      const q = new URLSearchParams({ sayfa: String(sayfa), ...(durum ? { durum } : {}) });
      const s = await apiIstek<Veri>(`/api/kampanyalar/${k.id}?${q}`);
      if (s.ok) setVeri(s.veri);
      else setHata(s.hata);
    },
    [k.id],
  );

  const suruyor = k.durum === "calisiyor" || k.durum === "zamanlandi";
  useEffect(() => {
    if (!suruyor) return;
    const z = setInterval(() => void yukle(veri.sayfa, filtre), 10_000);
    return () => clearInterval(z);
  }, [suruyor, yukle, veri.sayfa, filtre]);

  const s = k.sayilar;
  const hedef = s.kuyrukta + s.gonderiliyor + s.gonderildi + s.basarisiz;
  const bitti = s.gonderildi + s.basarisiz;
  const yuzde = hedef ? Math.round((bitti / hedef) * 100) : 100;

  return (
    <>
      <SayfaBasligi baslik={k.ad} aciklama={`${KANAL_ADLARI[k.kanal]} kampanyası · ${tarihYaz(k.olusturmaTarihi)}`}>
        <Link href="/iletisim" className="dugme">
          Kampanyalara dön
        </Link>
      </SayfaBasligi>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="kart flex flex-col gap-3 self-start" aria-label="İlerleme">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rozet">{KAMPANYA_DURUM_ADLARI[k.durum]}</span>
            {k.sandbox && <span className="rozet bg-amber-100 text-amber-800">Sandbox: gerçek gönderim yok</span>}
          </div>
          {k.durum === "zamanlandi" && k.planlananTarih && (
            <p className="text-sm">Planlanan başlangıç: {tarihYaz(k.planlananTarih)}</p>
          )}
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>İlerleme</span>
              <span className="tabular-nums">
                {sayiYaz(bitti)} / {sayiYaz(hedef)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-zemin" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={yuzde}>
              <div className="h-2.5 rounded-full bg-ana" style={{ width: `${yuzde}%` }} />
            </div>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
            {MESAJ_DURUMLARI.map((d) => (
              <div key={d} className="contents">
                <dt className="text-soluk">{MESAJ_DURUM_ADLARI[d]}</dt>
                <dd className="text-right tabular-nums">{sayiYaz(s[d])}</dd>
              </div>
            ))}
          </dl>
          {k.nedenler.some((n) => n.neden) && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Nedenler</h3>
              <ul className="text-sm">
                {k.nedenler
                  .filter((n) => n.neden)
                  .map((n) => (
                    <li key={`${n.durum}-${n.neden}`} className="flex justify-between gap-3 border-b border-kenar py-1 last:border-0">
                      <span>
                        {nedenAdi(n.neden)} <span className="text-xs text-soluk">({MESAJ_DURUM_ADLARI[n.durum]})</span>
                      </span>
                      <span className="tabular-nums">{sayiYaz(n.n)}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-soluk">Mesaj şablonu</summary>
            {k.konu && <p className="mt-2 font-medium">Konu: {k.konu}</p>}
            <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-zemin p-2">{k.sablon}</p>
          </details>
          {suruyor && (
            <button
              type="button"
              className="dugme-tehlike self-start"
              disabled={mesgul}
              onClick={async () => {
                if (!confirm("Kampanya iptal edilsin mi? Gönderilmemiş mesajlar gönderilmeyecek.")) return;
                setMesgul(true);
                const r = await apiIstek(`/api/kampanyalar/${k.id}?islem=iptal`, { method: "POST" });
                setMesgul(false);
                if (r.ok) await yukle(1, filtre);
                else setHata(r.hata);
              }}
            >
              Kampanyayı iptal et
            </button>
          )}
          {hata && (
            <p role="alert" className="text-sm text-tehlike">
              {hata}
            </p>
          )}
        </section>

        <section className="kart min-w-0" aria-label="Alıcılar">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-semibold">Alıcılar</h2>
            <label className="etiket">
              <span className="sr-only">Duruma göre süz</span>
              <select
                value={filtre}
                onChange={(e) => {
                  const d = e.target.value as MesajDurumu | "";
                  setFiltre(d);
                  void yukle(1, d);
                }}
                className="girdi"
              >
                <option value="">Tüm durumlar</option>
                {MESAJ_DURUMLARI.map((d) => (
                  <option key={d} value={d}>
                    {MESAJ_DURUM_ADLARI[d]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-soluk">
                <tr className="border-b border-kenar">
                  <th className="py-2 pr-3 text-left font-medium">Kayıt</th>
                  <th className="py-2 pr-3 text-left font-medium">Durum</th>
                  <th className="py-2 text-left font-medium">Ayrıntı</th>
                </tr>
              </thead>
              <tbody>
                {veri.mesajlar.map((m) => (
                  <tr key={m.id} className="border-b border-kenar align-top last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/kayitlar?secili=${m.leadId}`} className="text-ana underline">
                        {m.isletmeAdi || "İşletme adı girilmemiş"}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rozet ${ROZET[m.durum]}`}>{MESAJ_DURUM_ADLARI[m.durum]}</span>
                    </td>
                    <td className="py-2 text-xs text-soluk">
                      {m.gonderimTarihi && <span className="block">{tarihYaz(m.gonderimTarihi)}</span>}
                      {m.neden && <span className="block">{nedenAdi(m.neden)}</span>}
                      {m.hata && <span className="block text-tehlike">{m.hata}</span>}
                      {m.durum === "kuyrukta" && m.sonrakiDeneme && <span className="block">Sonraki deneme: {tarihYaz(m.sonrakiDeneme)}</span>}
                      {m.sandboxIcerik && (
                        <button type="button" className="text-ana underline" onClick={() => setAcik(acik === m.id ? null : m.id)}>
                          {acik === m.id ? "Mesajı gizle" : "Kaydedilen mesajı göster"}
                        </button>
                      )}
                      {acik === m.id && m.sandboxIcerik && (
                        <pre className="mt-1 max-w-prose whitespace-pre-wrap break-words rounded-md bg-zemin p-2 font-sans text-metin">
                          {m.sandboxIcerik}
                        </pre>
                      )}
                    </td>
                  </tr>
                ))}
                {veri.mesajlar.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-soluk">
                      Bu durumda alıcı yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {veri.sayfaSayisi > 1 && (
            <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Sayfalar">
              <button type="button" className="dugme" disabled={veri.sayfa <= 1} onClick={() => void yukle(veri.sayfa - 1, filtre)}>
                Önceki
              </button>
              <span className="tabular-nums">
                {veri.sayfa} / {veri.sayfaSayisi}
              </span>
              <button type="button" className="dugme" disabled={veri.sayfa >= veri.sayfaSayisi} onClick={() => void yukle(veri.sayfa + 1, filtre)}>
                Sonraki
              </button>
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
