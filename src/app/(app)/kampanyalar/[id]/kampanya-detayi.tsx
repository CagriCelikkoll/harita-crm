"use client";
// Kampanya ayrıntısı: üstte durum kartı (rozetler, uyarılar, ilerleme, sayılar), altında sekmeler: Alıcılar (alıcı
// bazında durum, süzgeç, sayfalama), Mesaj (konu ve şablon), Geçmiş (zaman çizelgesi, nedenler, Meta teslim
// bildirimleri). Kampanya sürerken 10 sn'de bir yenilenir.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IlerlemeCubugu, IstatistikKutusu } from "@/components/arayuz/gosterge";
import { DurumRozeti, type RozetTonu } from "@/components/arayuz/rozet";
import { Sekmeler, sekmeId, sekmePaneliId } from "@/components/arayuz/sekmeler";
import { GoogleBilgisiHucresi, useGoogleBilgisi } from "@/components/google-bilgisi";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { apiIstek } from "@/lib/api-istemci";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import {
  BEKLEME_NEDEN_ADLARI,
  DURAKLATMA_NEDEN_ADLARI,
  HARIC_NEDEN_ADLARI,
  KAMPANYA_DURUM_ADLARI,
  isciDurumu,
  KANAL_ADLARI,
  MESAJ_DURUM_ADLARI,
  MESAJ_DURUMLARI,
  type MesajDurumu,
} from "@/lib/mesajlasma";
import { GOOGLE_ADSIZ } from "@/lib/sabitler";
import type { KampanyaDto, MesajDto } from "@/server/servisler/kampanya-dto";

type Veri = {
  kampanya: KampanyaDto;
  mesajlar: MesajDto[];
  toplam: number;
  sayfa: number;
  sayfaSayisi: number;
  isciSonNabiz?: string | null;
  simdi?: string;
};

const DIGER_NEDENLER: Record<string, string> = {
  belirsiz: "Sonuç belirsiz (gönderilmiş olabilir)",
  saglayici: "Sağlayıcı hatası",
  ayar_eksik: "Ticari ileti bilgileri eksik",
  hata: "Beklenmeyen hata",
  iptal: "Kampanya iptal edildi",
  meta_teslim_etmedi: "Meta teslim etmedi (alıcı başına pazarlama sınırı; 24 saat sonra tekrar denenebilir)",
};
/** Meta teslim bildirimi (webhook statuses). */
const TESLIM_ADLARI: Record<string, string> = {
  sent: "Meta'ya iletildi",
  delivered: "Teslim edildi",
  read: "Okundu",
  failed: "Teslim edilemedi",
};
const nedenAdi = (n: string | null): string =>
  !n
    ? ""
    : n.startsWith("duraklatildi:")
      ? `Kampanya duraklatıldı (${DURAKLATMA_NEDEN_ADLARI[n.slice(13)] ?? n.slice(13)})`
      : ((HARIC_NEDEN_ADLARI as Record<string, string>)[n] ?? BEKLEME_NEDEN_ADLARI[n] ?? DIGER_NEDENLER[n] ?? n);

const ROZET: Record<MesajDurumu, RozetTonu> = {
  kuyrukta: "notr",
  gonderiliyor: "mavi",
  gonderildi: "ana",
  basarisiz: "tehlike",
  haric: "uyari",
  iptal: "notr",
};

type DetaySekmesi = "alicilar" | "mesaj" | "gecmis";
const DETAY_SEKMELERI: { deger: DetaySekmesi; ad: string }[] = [
  { deger: "alicilar", ad: "Alıcılar" },
  { deger: "mesaj", ad: "Mesaj" },
  { deger: "gecmis", ad: "Geçmiş" },
];

export function KampanyaDetayi({ ilk, isci }: { ilk: Veri; isci: { sonNabiz: string | null; simdi: string; yonetici: boolean } }) {
  const [veri, setVeri] = useState(ilk);
  const google = useGoogleBilgisi();
  const [filtre, setFiltre] = useState<MesajDurumu | "">("");
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [acik, setAcik] = useState<string | null>(null);
  const [sekme, setSekme] = useState<DetaySekmesi>("alicilar");
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
  const iptalEdilebilir = suruyor || k.durum === "duraklatildi";
  useEffect(() => {
    if (!suruyor) return;
    const z = setInterval(() => void yukle(veri.sayfa, filtre), 10_000);
    return () => clearInterval(z);
  }, [suruyor, yukle, veri.sayfa, filtre]);

  const s = k.sayilar;
  const hedef = s.kuyrukta + s.gonderiliyor + s.gonderildi + s.basarisiz;
  const bitti = s.gonderildi + s.basarisiz;
  const yuzde = hedef ? Math.round((bitti / hedef) * 100) : 100;

  const islem = async (yol: string, onay?: string) => {
    if (onay && !confirm(onay)) return;
    setMesgul(true);
    setHata(null);
    const r = await apiIstek(`/api/kampanyalar/${k.id}?islem=${yol}`, { method: "POST" });
    setMesgul(false);
    if (r.ok) await yukle(1, filtre);
    else setHata(r.hata);
  };

  return (
    <>
      <SayfaBasligi baslik={k.ad} aciklama={`${KANAL_ADLARI[k.kanal]} kampanyası · ${tarihYaz(k.olusturmaTarihi)}`}>
        <Link href="/kampanyalar" className="dugme">
          Kampanyalara dön
        </Link>
        {iptalEdilebilir && (
          <button
            type="button"
            className="dugme-tehlike"
            disabled={mesgul}
            onClick={() => void islem("iptal", "Kampanya iptal edilsin mi? Gönderilmemiş mesajlar gönderilmeyecek.")}
          >
            Kampanyayı iptal et
          </button>
        )}
      </SayfaBasligi>

      <div className="flex max-w-[1100px] flex-col gap-6">
        <section aria-label="Durum" className="flex flex-col gap-5 rounded-kart border border-kenar bg-white p-7">
          <div className="flex flex-wrap items-center gap-2">
            <DurumRozeti ton={k.durum === "tamamlandi" ? "ana" : k.durum === "duraklatildi" ? "uyari" : k.durum === "calisiyor" ? "mavi" : "notr"}>
              {KAMPANYA_DURUM_ADLARI[k.durum]}
            </DurumRozeti>
            {k.sandbox && <DurumRozeti ton="uyari">Test modu: gerçek gönderim yok</DurumRozeti>}
            {k.durum === "zamanlandi" && k.planlananTarih && (
              <span className="text-[13px] text-soluk">Planlanan başlangıç: {tarihYaz(k.planlananTarih)}</span>
            )}
          </div>
          {k.durum === "duraklatildi" && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-tehlike-acik p-4 text-sm text-tehlike">
              <p>{DURAKLATMA_NEDEN_ADLARI[k.duraklatmaNedeni ?? ""] ?? "Kampanya sistem tarafından duraklatıldı."}</p>
              <button type="button" className="dugme dugme-kucuk" disabled={mesgul} onClick={() => void islem("devam")}>
                Devam ettir (yönetici)
              </button>
            </div>
          )}
          {(k.durum === "calisiyor" || k.durum === "zamanlandi") && s.kuyrukta > 0 && (
            <IsciDurumu
              sonNabiz={veri.isciSonNabiz !== undefined ? veri.isciSonNabiz : isci.sonNabiz}
              simdi={veri.simdi ?? isci.simdi}
              yonetici={isci.yonetici}
            />
          )}
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-semibold">İlerleme</span>
              <span className="tabular-nums">
                {sayiYaz(bitti)} / {sayiYaz(hedef)}
              </span>
            </div>
            <IlerlemeCubugu yuzde={yuzde} etiket="Kampanya ilerlemesi" kalin />
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
            {(["kuyrukta", "gonderildi", "haric", "basarisiz"] as const).map((d) => (
              <IstatistikKutusu key={d} baslik={MESAJ_DURUM_ADLARI[d]} deger={sayiYaz(s[d])} />
            ))}
          </div>
          {(s.gonderiliyor > 0 || s.iptal > 0) && (
            <p className="text-[13px] text-soluk">
              {MESAJ_DURUM_ADLARI.gonderiliyor}: {sayiYaz(s.gonderiliyor)} · {MESAJ_DURUM_ADLARI.iptal}: {sayiYaz(s.iptal)}
            </p>
          )}
          {hata && (
            <p role="alert" className="text-sm text-tehlike">
              {hata}
            </p>
          )}
        </section>

        <section className="overflow-hidden rounded-kart border border-kenar bg-white" aria-label="Kampanya ayrıntıları">
          <div className="px-7 pt-2">
            <Sekmeler etiket="Kampanya ayrıntıları" onEk={`kampanya-${k.id}`} sekmeler={DETAY_SEKMELERI} secili={sekme} onSec={setSekme} />
          </div>

          {sekme === "alicilar" && (
            <div role="tabpanel" id={sekmePaneliId(`kampanya-${k.id}`, "alicilar")} aria-labelledby={sekmeId(`kampanya-${k.id}`, "alicilar")} className="p-7">
              <div className="mb-3 flex justify-end">
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
                  <thead className="text-[13px] text-soluk">
                    <tr className="border-b border-cizgi">
                      <th className="py-2.5 pr-3 text-left font-semibold">Kayıt</th>
                      <th className="py-2.5 pr-3 text-left font-semibold">Durum</th>
                      <th className="py-2.5 text-left font-semibold">Ayrıntı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {veri.mesajlar.map((m) => (
                      <tr key={m.id} className="border-b border-cizgi align-top last:border-0">
                        <td className="py-2.5 pr-3">
                          <Link
                            href={`/kayitlar?grup=tum&secili=${m.leadId}`}
                            className={m.isletmeAdi || m.kaynak !== "google" ? "text-ana underline" : "text-soluk italic underline"}
                          >
                            {m.isletmeAdi || (m.kaynak === "google" ? GOOGLE_ADSIZ : (m.yetkiliAdi ?? "(adsız kişi)"))}
                          </Link>
                          {/* Google adı yalnızca istenince ve yalnızca bellekte; mesaja yazılmaz. */}
                          {!m.isletmeAdi && m.kaynak === "google" && (
                            <span className="block">
                              <GoogleBilgisiHucresi
                                id={m.leadId}
                                alan="ad"
                                bilgi={google.bilgi.get(m.leadId)}
                                yukleniyor={google.yukleniyor.has(m.leadId)}
                                onGoster={google.goster}
                              />
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <DurumRozeti ton={ROZET[m.durum]}>{MESAJ_DURUM_ADLARI[m.durum]}</DurumRozeti>
                        </td>
                        <td className="py-2.5 text-xs text-soluk">
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
                            <pre className="mt-1 max-w-prose whitespace-pre-wrap break-words rounded-lg bg-ic-kutu p-2 font-sans text-metin">
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
                  <button type="button" className="dugme dugme-kucuk" disabled={veri.sayfa <= 1} onClick={() => void yukle(veri.sayfa - 1, filtre)}>
                    Önceki
                  </button>
                  <span className="tabular-nums">
                    {veri.sayfa} / {veri.sayfaSayisi}
                  </span>
                  <button
                    type="button"
                    className="dugme dugme-kucuk"
                    disabled={veri.sayfa >= veri.sayfaSayisi}
                    onClick={() => void yukle(veri.sayfa + 1, filtre)}
                  >
                    Sonraki
                  </button>
                </nav>
              )}
            </div>
          )}

          {sekme === "mesaj" && (
            <div role="tabpanel" id={sekmePaneliId(`kampanya-${k.id}`, "mesaj")} aria-labelledby={sekmeId(`kampanya-${k.id}`, "mesaj")} className="flex flex-col gap-3 p-7 text-sm">
              {k.konu && (
                <p>
                  <span className="text-soluk">Konu:</span> <span className="font-semibold">{k.konu}</span>
                </p>
              )}
              <p className="text-[13px] text-soluk">
                {k.kanal === "whatsapp_api" ? "Meta'da onaylı şablon" : "Mesaj şablonu ({isletme} kaydın kendi işletme adıyla dolar)"}
              </p>
              <p className="whitespace-pre-wrap break-words rounded-[10px] bg-ic-kutu p-4">{k.sablon}</p>
            </div>
          )}

          {sekme === "gecmis" && (
            <div role="tabpanel" id={sekmePaneliId(`kampanya-${k.id}`, "gecmis")} aria-labelledby={sekmeId(`kampanya-${k.id}`, "gecmis")} className="flex flex-col gap-5 p-7 text-sm">
              <ol className="flex flex-col gap-3">
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-ana" />
                  <div>
                    <p>Oluşturuldu</p>
                    <p className="text-[13px] text-soluk">{tarihYaz(k.olusturmaTarihi)}</p>
                  </div>
                </li>
                {k.planlananTarih && (
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-pasif" />
                    <div>
                      <p>Planlanan başlangıç</p>
                      <p className="text-[13px] text-soluk">{tarihYaz(k.planlananTarih)}</p>
                    </div>
                  </li>
                )}
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-pasif" />
                  <div>
                    <p>Şu anki durum: {KAMPANYA_DURUM_ADLARI[k.durum]}</p>
                    {k.durum === "duraklatildi" && (
                      <p className="text-[13px] text-soluk">{DURAKLATMA_NEDEN_ADLARI[k.duraklatmaNedeni ?? ""] ?? "Sistem tarafından duraklatıldı."}</p>
                    )}
                  </div>
                </li>
              </ol>
              {k.nedenler.some((n) => n.neden) && (
                <div>
                  <h3 className="mb-1 font-semibold">Nedenler</h3>
                  <ul>
                    {k.nedenler
                      .filter((n) => n.neden)
                      .map((n) => (
                        <li key={`${n.durum}-${n.neden}`} className="flex justify-between gap-3 border-b border-cizgi py-1.5 last:border-0">
                          <span>
                            {nedenAdi(n.neden)} <span className="text-xs text-soluk">({MESAJ_DURUM_ADLARI[n.durum]})</span>
                          </span>
                          <span className="tabular-nums">{sayiYaz(n.n)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              {k.kanal === "whatsapp_api" && k.teslim.length > 0 && (
                <div>
                  <h3 className="mb-1 font-semibold">Meta teslim bildirimleri</h3>
                  <ul>
                    {k.teslim.map((t) => (
                      <li key={`${t.durum}-${t.kod}`} className="flex justify-between gap-3 border-b border-cizgi py-1.5 last:border-0">
                        <span>
                          {TESLIM_ADLARI[t.durum ?? ""] ?? t.durum}
                          {t.kod !== null && <span className="text-xs text-soluk"> (hata {t.kod})</span>}
                        </span>
                        <span className="tabular-nums">{sayiYaz(t.n)}</span>
                      </li>
                    ))}
                  </ul>
                  {k.ucretli.length > 0 && (
                    <p className="mt-1 text-xs text-soluk">
                      Meta&apos;nın ücretlendirdiği: {k.ucretli.map((u) => `${sayiYaz(u.n)} ${u.kategori ?? ""}`).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** Gönderim servisinin (işçi) son çalışması; 5 dakikadan uzun süredir çalışmıyorsa yöneticiye uyarı. */
function IsciDurumu(props: { sonNabiz: string | null; simdi: string; yonetici: boolean }) {
  const d = isciDurumu(props.sonNabiz ? new Date(props.sonNabiz) : null, new Date(props.simdi));
  return (
    <div className={`rounded-[10px] p-4 text-sm ${d.uyari && props.yonetici ? "bg-tehlike-acik text-tehlike" : "bg-ic-kutu"}`} role={d.uyari ? "alert" : "status"}>
      <p>{d.metin}</p>
      {d.uyari &&
        (props.yonetici ? (
          <p className="mt-1">{d.yoneticiUyarisi}</p>
        ) : (
          <p className="mt-1 text-soluk">Mesajlar gönderim servisi çalıştığında gönderilir.</p>
        ))}
    </div>
  );
}
