"use client";
// Kampanya ayrıntısı: üstte durum kartı (rozetler, uyarılar, ilerleme, yan yana sayı kartları; WhatsApp'ta Meta teslim
// bildirimleri de aynı satırda kartlar: teslim, okundu, teslim edilemedi + hata kodları), altında sekmeler: Alıcılar
// (alıcı bazında durum, süzgeç, sayfalama), Mesaj (konu ve şablon), Geçmiş (zaman çizelgesi, nedenler). Kampanya sürerken 10 sn'de bir yenilenir. Alıcıların sayfası ve durum süzgeci adreste tutulur
// (?sayfa=&durum=; geri tuşu önceki sayfaya döner): değişince sunucu sayfası yeni ilk veriyi gönderir.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sayfalama } from "@/components/arayuz/sayfalama";
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
  TESLIM_SUZGEC_ADLARI,
  TESLIM_SUZGECLERI,
  teslimSuzgeciMi,
  type AliciSuzgeci,
  type MesajDurumu,
  type TeslimSuzgeci,
} from "@/lib/mesajlasma";
import { kisiTeslimDurumu, teslimKartlari } from "@/lib/kampanya-gorunumu";
import { GOOGLE_ADSIZ } from "@/lib/sabitler";
import type { KampanyaDto, MesajDto } from "@/server/servisler/kampanya-dto";

type Veri = {
  kampanya: KampanyaDto;
  mesajlar: MesajDto[];
  toplam: number;
  sayfa: number;
  sayfaSayisi: number;
  boyut: number;
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

export function KampanyaDetayi({
  ilk,
  durum: filtre,
  isci,
}: {
  ilk: Veri;
  /** Adresteki durum süzgeci: mesaj durumu ya da Meta teslim durumu ("" = tümü). */
  durum: AliciSuzgeci | "";
  isci: { sonNabiz: string | null; simdi: string; yonetici: boolean };
}) {
  const router = useRouter();
  const [veri, setVeri] = useState(ilk);
  // Adres (sayfa / süzgeç) değişince sunucudan gelen yeni ilk veri yerel kopyanın yerine geçer.
  const [gelen, setGelen] = useState(ilk);
  if (gelen !== ilk) {
    setGelen(ilk);
    setVeri(ilk);
  }
  const google = useGoogleBilgisi();
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [acik, setAcik] = useState<string | null>(null);
  const [sekme, setSekme] = useState<DetaySekmesi>("alicilar");
  const k = veri.kampanya;

  const yukle = useCallback(
    async (sayfa: number, durum: AliciSuzgeci | "") => {
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
    if (r.ok) await yukle(veri.sayfa, filtre);
    else setHata(r.hata);
  };

  return (
    <>
      <SayfaBasligi baslik={k.ad} aciklama={`${KANAL_ADLARI[k.kanal]} kampanyası${k.numara ? ` · Gönderen: ${k.numara}` : ""} · ${tarihYaz(k.olusturmaTarihi)}`}>
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
          <div role="group" aria-label="Gönderim sayıları" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(["kuyrukta", "gonderildi", "haric", "basarisiz"] as const).map((d) => (
              <IstatistikKutusu key={d} baslik={MESAJ_DURUM_ADLARI[d]} deger={sayiYaz(s[d])} />
            ))}
          </div>
          {(s.gonderiliyor > 0 || s.iptal > 0) && (
            <p className="-mt-2 text-[13px] text-soluk">
              {MESAJ_DURUM_ADLARI.gonderiliyor}: {sayiYaz(s.gonderiliyor)} · {MESAJ_DURUM_ADLARI.iptal}: {sayiYaz(s.iptal)}
            </p>
          )}
          {k.kanal === "whatsapp_api" && !k.sandbox && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Meta teslim bildirimleri</h3>
              <div role="group" aria-label="Meta teslim bildirimleri" className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
                {teslimKartlari(k.teslim).map((t) => (
                  <IstatistikKutusu key={t.durum} baslik={t.ad} deger={sayiYaz(t.n)}>
                    {t.kodlar.length > 0 && (
                      <ul aria-label="Hata kodları" className="mt-1 flex flex-col gap-0.5 text-xs text-tehlike">
                        {t.kodlar.map((x) => (
                          <li key={x.kod}>
                            {x.kod}
                            {x.aciklama ? ` (${x.aciklama})` : ""}: <span className="tabular-nums">{sayiYaz(x.n)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </IstatistikKutusu>
                ))}
              </div>
              <p className="text-xs text-soluk">
                Her iletinin Meta&apos;dan gelen son durumu sayılır (okunan ileti &quot;Teslim edildi&quot;de ayrıca sayılmaz).
                {k.ucretli.length > 0 && ` Meta'nın ücretlendirdiği: ${k.ucretli.map((u) => `${sayiYaz(u.n)} ${u.kategori ?? ""}`).join(", ")}.`}
              </p>
            </div>
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
                      const d = e.target.value as AliciSuzgeci | "";
                      router.push(`/kampanyalar/${k.id}${d ? `?durum=${d}` : ""}`, { scroll: false });
                    }}
                    className="girdi"
                  >
                    <option value="">Tüm durumlar</option>
                    <optgroup label="Gönderim durumu">
                      {MESAJ_DURUMLARI.map((d) => (
                        <option key={d} value={d}>
                          {MESAJ_DURUM_ADLARI[d]}
                        </option>
                      ))}
                    </optgroup>
                    {/* WhatsApp: mesajın Meta'dan gelen son durumu (adreste ?durum=okundu …). */}
                    {(k.kanal === "whatsapp_api" || teslimSuzgeciMi(filtre || undefined)) && (
                      <optgroup label="Meta teslim durumu">
                        {(Object.keys(TESLIM_SUZGECLERI) as TeslimSuzgeci[]).map((d) => (
                          <option key={d} value={d}>
                            {TESLIM_SUZGEC_ADLARI[d]}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
              </div>
              <div className="relative overflow-x-auto">
                {/* Sabit sütun genişlikleri: süzgeç ya da sayfa değişince sütunlar zıplamaz. */}
                <table className="w-full min-w-[560px] table-fixed text-sm break-words">
                  <colgroup>
                    <col className="w-[40%]" />
                    <col className="w-[28%]" />
                    <col />
                  </colgroup>
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
                          <KisiDurumu m={m} />
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
              <Sayfalama
                className="mt-3"
                sayfa={veri.sayfa}
                sayfaSayisi={veri.sayfaSayisi}
                toplam={veri.toplam}
                boyut={veri.boyut}
                taban={`/kampanyalar/${k.id}${filtre ? `?durum=${filtre}` : ""}`}
                kayitAdi="alıcı"
              />
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
            </div>
          )}
        </section>
      </div>
    </>
  );
}

const TESLIM_ROZETI: Record<"delivered" | "read" | "failed", RozetTonu> = { delivered: "ana", read: "mavi", failed: "tehlike" };

/** Alıcının durumu: Meta'dan teslim edildi / okundu / teslim edilemedi bildirimi geldiyse o, yoksa mesaj durumu. */
function KisiDurumu({ m }: { m: MesajDto }) {
  const t = kisiTeslimDurumu(m.teslimDurumu, m.teslimHataKodu);
  if (!t) return <DurumRozeti ton={ROZET[m.durum]}>{MESAJ_DURUM_ADLARI[m.durum]}</DurumRozeti>;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <DurumRozeti ton={TESLIM_ROZETI[t.durum]}>{t.ad}</DurumRozeti>
      {t.kod && <span className="text-xs text-tehlike">{t.kod}</span>}
    </span>
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
