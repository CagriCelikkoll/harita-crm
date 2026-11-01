"use client";
// Bölge tara (docs/tasarim/Tarama.dc.html): solda form kartı (merkez, kategori çipleri, yarıçap, süre bilgisi,
// Taramayı başlat, tarama durumu), sağda geniş harita; altında son taramanın sonuçları (children, sunucudan) ve
// katlanır "Önceki taramalar" (Sonuçları gör, Haritada göster, Tekrar kullan).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SecimCipi } from "@/components/arayuz/sekmeler";
import { kullanimDegisti } from "@/components/kullanim-gostergesi";
import { Harita, haritaAnahtariVar, type Isaret } from "@/components/harita";
import { TaramaDurumuRozeti } from "@/components/tarama-durumu";
import { sayiYaz, tarihYaz } from "@/lib/bicim";
import { KATEGORILER, kategoriBul } from "@/lib/kategoriler";
import {
  KOTA_DOLDU_MESAJI,
  YARICAP_MAX_KM,
  YARICAP_MIN_KM,
  type MerkezKaynagi,
  type TaramaDurumu,
} from "@/lib/sabitler";
import type { KotaDurumu } from "@/server/repo/kullanim";

export type TaramaOzeti = {
  id: string;
  merkezKaynagi: MerkezKaynagi;
  // Merkez koordinatları 30 gün sonra silinir (null).
  merkezLat: number | null;
  merkezLng: number | null;
  adresMetni: string | null;
  yaricapM: number;
  kategori: string;
  durum: TaramaDurumu;
  bulunanSayisi: number;
  istekSayisi: number;
  kapsamTamam: boolean | null;
  hataMesaji: string | null;
  olusturmaTarihi: string;
  /** İncelenmemiş sonuç sayısı. */
  incelenmemis?: number;
};

const VARSAYILAN_MERKEZ = { lat: 40.9903, lng: 29.0292 }; // Kadıköy
const bitti = (d: TaramaDurumu) => d === "tamamlandi" || d === "hata";
/** Çip olarak gösterilen sık kategoriler; diğerleri "Diğer…" listesinde. */
const CIP_SAYISI = 5;

export function TaramaPaneli({
  gecmis,
  butce,
  mock,
  kota,
  children,
}: {
  gecmis: TaramaOzeti[];
  butce: number;
  mock: boolean;
  kota: KotaDurumu;
  /** Seçili taramanın sonuçları (sunucuda hazırlanır). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const son = gecmis[0];
  const sonMerkez = son && son.merkezLat !== null && son.merkezLng !== null ? { lat: son.merkezLat, lng: son.merkezLng } : null;
  const [merkez, setMerkezDurumu] = useState(sonMerkez ?? VARSAYILAN_MERKEZ);
  // Merkezin kaynağı: haritaya tıklama / elle giriş = 'harita' (kullanıcı verisi), adres araması = 'adres'
  // (Google içeriği; taramada 30 gün sonra koordinatlar silinir).
  const [kaynak, setKaynak] = useState<{ tur: MerkezKaynagi; adresMetni: string | null }>(
    sonMerkez && son ? { tur: son.merkezKaynagi, adresMetni: son.adresMetni } : { tur: "harita", adresMetni: null },
  );
  const [yaricapKm, setYaricapKm] = useState(son ? son.yaricapM / 1000 : 3);
  const [kategori, setKategori] = useState(son?.kategori ?? KATEGORILER[0].anahtar);
  const [adres, setAdres] = useState(son?.merkezKaynagi === "adres" ? (son.adresMetni ?? "") : "");
  const [adresMesaji, setAdresMesaji] = useState<string | null>(null);

  // "Tekrar kullan": haritadan seçilmiş merkezi 30 gün kuralıyla silinmiş taramada yeni nokta beklenir.
  const [merkezSecimiBekleniyor, setMerkezSecimiBekleniyor] = useState(false);

  /** Kullanıcının haritada veya elle seçtiği merkez. */
  function merkezSec(m: { lat: number; lng: number }) {
    setMerkezDurumu(m);
    setKaynak({ tur: "harita", adresMetni: null });
    setMerkezSecimiBekleniyor(false);
  }
  const [aktif, setAktif] = useState<TaramaOzeti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [isaretler, setIsaretler] = useState<Isaret[]>([]);
  const [isaretBilgisi, setIsaretBilgisi] = useState<string | null>(null);
  const yoklama = useRef<ReturnType<typeof setInterval> | null>(null);

  const isaretleriGetir = useCallback(async (taramaId: string) => {
    const yanit = await fetch(`/api/taramalar/${taramaId}/isaretler`, { cache: "no-store" });
    if (!yanit.ok) return;
    const veri = (await yanit.json()) as { toplam: number; isaretler: Isaret[] };
    setIsaretler(veri.isaretler);
    // Harita yoksa (tarayıcı anahtarı tanımlı değil) işaret sayısından söz edilmez.
    setIsaretBilgisi(
      veri.toplam && haritaAnahtariVar
        ? `${sayiYaz(veri.toplam)} kaydın ${sayiYaz(veri.isaretler.length)} tanesi haritada (yalnızca konumu son 30 günde alınanlar).`
        : null,
    );
  }, []);

  useEffect(() => () => {
    if (yoklama.current) clearInterval(yoklama.current);
  }, []);

  async function adresBul(metin = adres) {
    setAdresMesaji(null);
    const yanit = await fetch("/api/adres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metin }),
    });
    const veri = await yanit.json();
    kullanimDegisti();
    if (!yanit.ok) {
      setAdresMesaji(veri.hata ?? "Adres bulunamadı.");
      return;
    }
    setMerkezDurumu({ lat: veri.lat, lng: veri.lng });
    setKaynak({ tur: "adres", adresMetni: metin.trim() });
    setMerkezSecimiBekleniyor(false);
    setAdresMesaji(`${veri.adres ? `Merkez: ${veri.adres}. ` : ""}Adresten bulunan konum Google içeriğidir; taramada 30 gün saklanır.`);
  }

  async function baslat() {
    setHata(null);
    setIsaretler([]);
    setIsaretBilgisi(null);
    const yanit = await fetch("/api/taramalar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merkezLat: merkez.lat,
        merkezLng: merkez.lng,
        yaricapKm,
        kategori,
        merkezKaynagi: kaynak.tur,
        adresMetni: kaynak.adresMetni ?? undefined,
      }),
    });
    const tarama = await yanit.json();
    if (!yanit.ok) {
      setHata(tarama.hata ?? "Tarama oluşturulamadı.");
      return;
    }
    setAktif({ ...tarama, olusturmaTarihi: tarama.olusturmaTarihi });

    // Çalıştırma isteği tarama bitene kadar sürer; bu sırada durum yoklanır.
    const calistir = fetch(`/api/taramalar/${tarama.id}/calistir`, { method: "POST" });
    yoklama.current = setInterval(async () => {
      const d = await fetch(`/api/taramalar/${tarama.id}`, { cache: "no-store" });
      if (d.ok) setAktif(await d.json());
    }, 1000);
    const sonuc = await calistir.catch(() => null);
    if (yoklama.current) clearInterval(yoklama.current);
    kullanimDegisti();
    if (sonuc?.ok) {
      const t = (await sonuc.json()) as TaramaOzeti;
      setAktif(t);
      if (t.durum === "tamamlandi") await isaretleriGetir(t.id);
      // Sonuçlar aşağıda bu taramanınkiler olarak gösterilir.
      router.push(`/tarama?tarama=${t.id}`, { scroll: false });
    } else {
      setHata("Tarama isteği tamamlanamadı. Önceki taramalardan durumunu kontrol edin.");
    }
    router.refresh();
  }

  /**
   * Geçmişteki taramanın ayarlarını forma alır. Merkez koordinatları 30 gün kuralıyla silindiyse:
   * adres metni varsa adres yeniden aranır, yoksa (haritadan seçilmiş) haritada yeni nokta seçilmesi istenir.
   */
  function tekrarKullan(t: TaramaOzeti) {
    setYaricapKm(t.yaricapM / 1000);
    setKategori(t.kategori);
    setHata(null);
    setMerkezSecimiBekleniyor(false);
    if (t.merkezLat !== null && t.merkezLng !== null) {
      setMerkezDurumu({ lat: t.merkezLat, lng: t.merkezLng });
      setKaynak({ tur: t.merkezKaynagi, adresMetni: t.adresMetni });
      if (t.adresMetni) setAdres(t.adresMetni);
      setAdresMesaji("Ayarlar forma alındı; taramayı başlatabilirsiniz.");
    } else if (t.adresMetni) {
      setAdres(t.adresMetni);
      void adresBul(t.adresMetni); // koordinatlar silinmiş: adresi yeniden ara
    } else {
      // Haritadan seçilmiş merkez 30 gün sonra silinmiş: kullanıcı yeni bir nokta seçmeli.
      setMerkezSecimiBekleniyor(true);
      setAdresMesaji(null);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function gecmistenGoster(t: TaramaOzeti) {
    setAktif(t);
    if (t.merkezLat !== null && t.merkezLng !== null) {
      setMerkezDurumu({ lat: t.merkezLat, lng: t.merkezLng });
      setYaricapKm(t.yaricapM / 1000);
    }
    void isaretleriGetir(t.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const calisiyor = aktif !== null && !bitti(aktif.durum);
  const cipler = KATEGORILER.slice(0, CIP_SAYISI);
  const digerSecili = !cipler.some((k) => k.anahtar === kategori);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-stretch gap-6">
        <section
          aria-label="Yeni tarama"
          className="flex min-w-0 flex-[1_1_320px] flex-col gap-6 rounded-kart border border-kenar bg-white p-7 sm:max-w-[400px]"
        >
          <div className="flex flex-col gap-2">
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void adresBul();
              }}
            >
              <label htmlFor="tarama-merkez" className="font-semibold">
                Merkez
              </label>
              <div className="flex gap-2">
                <input
                  id="tarama-merkez"
                  value={adres}
                  onChange={(e) => setAdres(e.target.value)}
                  className="girdi min-w-0"
                  placeholder="ör. Bağdat Caddesi, Kadıköy"
                />
                <button type="submit" className="dugme shrink-0" disabled={adres.trim().length < 2 || calisiyor}>
                  Bul
                </button>
              </div>
            </form>
            <p className="text-[13px] text-soluk">
              {kaynak.tur === "adres" && kaynak.adresMetni ? `Adres araması: ${kaynak.adresMetni}. ` : ""}Ya da haritada bir noktaya
              tıklayın.
            </p>
            {adresMesaji && <p className="text-[13px] text-soluk">{adresMesaji}</p>}
            <details className="text-sm">
              <summary className="cursor-pointer text-[13px] text-ana">Koordinatla gir</summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="etiket">
                  Enlem
                  <input
                    type="number"
                    step="0.000001"
                    value={merkez.lat}
                    onChange={(e) => merkezSec({ ...merkez, lat: Number(e.target.value) })}
                    className="girdi"
                  />
                </label>
                <label className="etiket">
                  Boylam
                  <input
                    type="number"
                    step="0.000001"
                    value={merkez.lng}
                    onChange={(e) => merkezSec({ ...merkez, lng: Number(e.target.value) })}
                    className="girdi"
                  />
                </label>
              </div>
            </details>
          </div>

          <div className="flex flex-col gap-2.5" role="group" aria-labelledby="tarama-kategori">
            <span id="tarama-kategori" className="font-semibold">
              Ne arıyorsunuz?
            </span>
            <div className="flex flex-wrap gap-2">
              {cipler.map((k) => (
                <SecimCipi key={k.anahtar} secili={kategori === k.anahtar} onClick={() => setKategori(k.anahtar)} disabled={calisiyor}>
                  {k.etiket}
                </SecimCipi>
              ))}
            </div>
            <label className="flex flex-col gap-1.5 text-[13px] text-soluk">
              Diğer…
              <select
                value={digerSecili ? kategori : ""}
                onChange={(e) => e.target.value && setKategori(e.target.value)}
                className={`girdi ${digerSecili ? "border-ana" : ""}`}
                disabled={calisiyor}
              >
                <option value="">Başka bir kategori seçin</option>
                {KATEGORILER.slice(CIP_SAYISI).map((k) => (
                  <option key={k.anahtar} value={k.anahtar}>
                    {k.etiket}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-2.5">
            <span className="flex justify-between font-semibold">
              Yarıçap <span className="text-ana">{yaricapKm} km</span>
            </span>
            <input
              type="range"
              min={YARICAP_MIN_KM}
              max={YARICAP_MAX_KM}
              step={0.5}
              value={yaricapKm}
              onChange={(e) => setYaricapKm(Number(e.target.value))}
              className="h-7 w-full accent-ana"
            />
          </label>

          <p className="rounded-[10px] bg-ic-kutu px-4 py-3.5 text-[13px] text-metin-ikincil">
            Tarama birkaç dakika sürebilir; bulunan işletmeler aşağıda incelemeniz için listelenir. İşletme bilgileri
            saklanmaz; Google Haritalar&apos;dan anlık gösterilir.
            {mock && <strong className="mt-1 block text-uyari">Örnek veri kullanılıyor (PLACES_MOCK).</strong>}
          </p>

          {merkezSecimiBekleniyor && (
            <p role="alert" className="rounded-lg bg-uyari-acik p-3 text-sm text-uyari">
              Bu taramanın merkezi 30 gün kuralıyla silindi. Haritada yeni bir merkez seçin (ya da adres arayın veya
              koordinat girin); yarıçap ve kategori forma alındı.
            </p>
          )}
          {kota.doldu && (
            <p role="alert" className="text-sm text-tehlike">
              {KOTA_DOLDU_MESAJI} Yeni tarama ay sonuna kadar yapılamaz.
            </p>
          )}
          {hata && (
            <p role="alert" className="text-sm text-tehlike">
              {hata}
            </p>
          )}

          {aktif && (
            <div className="flex flex-col gap-2 text-sm" aria-live="polite">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Tarama durumu</span>
                <TaramaDurumuRozeti durum={aktif.durum} />
              </div>
              <p className="text-soluk">{sayiYaz(aktif.bulunanSayisi)} işletme bulundu</p>
              {calisiyor && (
                <div className="h-1.5 overflow-hidden rounded-full bg-zemin">
                  <div className="h-1.5 bg-ana transition-all" style={{ width: `${Math.min(100, (aktif.istekSayisi / butce) * 100)}%` }} />
                </div>
              )}
              {aktif.durum === "tamamlandi" && aktif.kapsamTamam === false && (
                <p className="text-[13px] text-uyari">
                  {aktif.hataMesaji ??
                    "Alanın tamamı taranmamış olabilir (bazı küçük bölgelerde çok fazla sonuç vardı). Daha küçük bir yarıçapla tekrar deneyin."}
                </p>
              )}
              {aktif.durum === "hata" && <p className="text-[13px] text-tehlike">{aktif.hataMesaji}</p>}
              {isaretBilgisi && <p className="text-[13px] text-soluk">{isaretBilgisi}</p>}
            </div>
          )}

          <button
            type="button"
            className="dugme-ana mt-auto min-h-12 w-full rounded-[10px] text-[15px]"
            onClick={baslat}
            disabled={calisiyor || merkezSecimiBekleniyor || kota.doldu}
          >
            {calisiyor ? "Tarama sürüyor…" : "Taramayı başlat"}
          </button>
        </section>

        <section aria-label="Harita" className="relative min-h-[440px] min-w-0 flex-[999_1_460px] overflow-hidden rounded-kart">
          <div className="absolute inset-0 [&>div]:rounded-kart">
            <Harita
              merkez={merkez}
              yaricapM={yaricapKm * 1000}
              isaretler={isaretler}
              onMerkezSec={(m) => !calisiyor && merkezSec(m)}
              onIsaretSec={(id) => router.push(`/kayitlar?grup=tum&secili=${id}`)}
            />
          </div>
        </section>
      </div>

      {children}

      <details className="group overflow-hidden rounded-kart border border-kenar bg-white">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-7 [&::-webkit-details-marker]:hidden">
          <span className="font-semibold">Önceki taramalar</span>
          <span className="text-[13px] text-soluk">{sayiYaz(gecmis.length)} tarama</span>
        </summary>
        {gecmis.length === 0 ? (
          <p className="border-t border-cizgi px-7 py-4 text-sm text-soluk">Henüz tarama yok.</p>
        ) : (
          <ul>
            {gecmis.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-cizgi px-7 py-4 text-sm">
                <div className="min-w-0 flex-[1_1_260px]">
                  <p className="font-semibold">
                    {kategoriBul(t.kategori)?.etiket ?? t.kategori} · {t.yaricapM / 1000} km
                  </p>
                  <p className="text-[13px] text-soluk">
                    {tarihYaz(t.olusturmaTarihi)} · {t.merkezKaynagi === "adres" ? t.adresMetni : "Haritadan seçilen nokta"}
                    {t.merkezLat === null && " · konum silindi (30 gün)"}
                  </p>
                  {t.durum === "hata" && t.hataMesaji && <p className="text-[13px] text-tehlike">{t.hataMesaji}</p>}
                </div>
                <span className="flex items-center gap-2">
                  <TaramaDurumuRozeti durum={t.durum} />
                  {t.kapsamTamam === false && <span className="text-[13px] text-uyari">kısmi</span>}
                </span>
                <span className="text-[13px] text-soluk tabular-nums">
                  {sayiYaz(t.bulunanSayisi)} bulundu
                  {(t.incelenmemis ?? 0) > 0 && ` · ${sayiYaz(t.incelenmemis ?? 0)} incelenmedi`}
                </span>
                <span className="flex flex-wrap gap-2">
                  {t.bulunanSayisi > 0 && (
                    <Link className="dugme dugme-kucuk" href={`/tarama?tarama=${t.id}`} scroll={false}>
                      Sonuçları gör
                    </Link>
                  )}
                  <button type="button" className="dugme dugme-kucuk" onClick={() => gecmistenGoster(t)} disabled={calisiyor}>
                    Haritada göster
                  </button>
                  <button type="button" className="dugme dugme-kucuk" onClick={() => tekrarKullan(t)} disabled={calisiyor}>
                    Tekrar kullan
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
