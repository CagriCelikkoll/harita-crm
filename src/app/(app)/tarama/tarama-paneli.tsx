"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type TaramaOzeti = {
  id: string;
  merkezKaynagi: MerkezKaynagi;
  // 'adres' kaynaklı merkezler 30 gün sonra silinir (null).
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
  /** İncelenmemiş sonuç sayısı (Sonuçları incele). */
  incelenmemis?: number;
};

const VARSAYILAN_MERKEZ = { lat: 40.9903, lng: 29.0292 }; // Kadıköy
const bitti = (d: TaramaDurumu) => d === "tamamlandi" || d === "hata";

export function TaramaPaneli({
  gecmis,
  butce,
  mock,
  kota,
}: {
  gecmis: TaramaOzeti[];
  butce: number;
  mock: boolean;
  kota: KotaDurumu;
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
  const [adres, setAdres] = useState("");
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
    setAdresMesaji(
      `${veri.adres ? `Merkez: ${veri.adres}. ` : ""}Adresten bulunan konum Google içeriğidir; taramada 30 gün saklanır.`,
    );
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
    if (sonuc?.ok) {
      const t = (await sonuc.json()) as TaramaOzeti;
      setAktif(t);
      if (t.durum === "tamamlandi") await isaretleriGetir(t.id);
    } else {
      setHata("Tarama isteği tamamlanamadı. Geçmişten durumunu kontrol edin.");
    }
    kullanimDegisti();
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
  }

  function gecmistenGoster(t: TaramaOzeti) {
    setAktif(t);
    if (t.merkezLat !== null && t.merkezLng !== null) {
      setMerkezDurumu({ lat: t.merkezLat, lng: t.merkezLng });
      setYaricapKm(t.yaricapM / 1000);
    }
    void isaretleriGetir(t.id);
  }

  const calisiyor = aktif !== null && !bitti(aktif.durum);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[420px] lg:h-[520px]">
          <Harita
            merkez={merkez}
            yaricapM={yaricapKm * 1000}
            isaretler={isaretler}
            onMerkezSec={(m) => !calisiyor && merkezSec(m)}
            onIsaretSec={(id) => router.push(`/kayitlar?secili=${id}`)}
          />
        </div>

        <div className="flex flex-col gap-4">
          <section className="kart flex flex-col gap-3">
            <h2 className="font-semibold">Yeni tarama</h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void adresBul();
              }}
            >
              <label className="etiket flex-1">
                Adres
                <input value={adres} onChange={(e) => setAdres(e.target.value)} className="girdi" placeholder="ör. Bağdat Caddesi, Kadıköy" />
              </label>
              <button type="submit" className="dugme self-end" disabled={adres.trim().length < 2 || calisiyor}>
                Bul
              </button>
            </form>
            {adresMesaji && <p className="text-xs text-soluk">{adresMesaji}</p>}

            <div className="grid grid-cols-2 gap-2">
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
            <p className="text-xs text-soluk">
              Merkez kaynağı:{" "}
              <strong>{kaynak.tur === "adres" ? `adres araması (“${kaynak.adresMetni}”)` : "haritada / elle seçildi"}</strong>
            </p>

            <label className="etiket">
              Yarıçap: {yaricapKm} km
              <input
                type="range"
                min={YARICAP_MIN_KM}
                max={YARICAP_MAX_KM}
                step={0.5}
                value={yaricapKm}
                onChange={(e) => setYaricapKm(Number(e.target.value))}
                className="accent-ana"
              />
            </label>

            <label className="etiket">
              Kategori
              <select value={kategori} onChange={(e) => setKategori(e.target.value)} className="girdi">
                {KATEGORILER.map((k) => (
                  <option key={k.anahtar} value={k.anahtar}>
                    {k.etiket}
                  </option>
                ))}
              </select>
            </label>

            <p className="text-xs text-soluk">
              Tarama birkaç dakika sürebilir; bulunan işletmeler incelemeniz için listelenir. İşletme bilgileri
              saklanmaz; görüntülerken Google Haritalar&apos;dan anlık gösterilir.
              {mock && <strong className="mt-1 block text-amber-700">PLACES_MOCK açık: örnek veri kullanılıyor.</strong>}
            </p>

            {merkezSecimiBekleniyor && (
              <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
                Bu taramanın merkezi 30 gün kuralıyla silindi. Haritada yeni bir merkez seçin (veya enlem/boylam girin ya
                da adres arayın); yarıçap ve kategori forma alındı.
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
            <button type="button" className="dugme-ana" onClick={baslat} disabled={calisiyor || merkezSecimiBekleniyor || kota.doldu}>
              {calisiyor ? "Tarama sürüyor…" : "Taramayı başlat"}
            </button>
          </section>

          {aktif && (
            <section className="kart" aria-live="polite">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Tarama durumu</h2>
                <TaramaDurumuRozeti durum={aktif.durum} />
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-soluk">Places isteği</dt>
                <dd className="tabular-nums">
                  {aktif.istekSayisi} / {butce}
                </dd>
                <dt className="text-soluk">Bulunan işletme</dt>
                <dd className="tabular-nums">{sayiYaz(aktif.bulunanSayisi)}</dd>
              </dl>
              {calisiyor && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zemin">
                  <div className="h-1.5 bg-ana transition-all" style={{ width: `${Math.min(100, (aktif.istekSayisi / butce) * 100)}%` }} />
                </div>
              )}
              {aktif.durum === "tamamlandi" && aktif.kapsamTamam === false && (
                <p className="mt-2 text-xs text-amber-700">
                  {aktif.hataMesaji ??
                    "İstek sınırına ulaşıldı veya bazı küçük bölgelerde 60'tan fazla sonuç vardı; alanın tamamı taranmamış olabilir. Daha küçük bir yarıçapla tekrar deneyin."}
                </p>
              )}
              {aktif.durum === "hata" && <p className="mt-2 text-xs text-tehlike">{aktif.hataMesaji}</p>}
              {isaretBilgisi && <p className="mt-2 text-xs text-soluk">{isaretBilgisi}</p>}
              {aktif.durum === "tamamlandi" && (
                <div className="mt-3 flex flex-col gap-2">
                  {aktif.bulunanSayisi > 0 && (
                    <button type="button" className="dugme-ana w-full" onClick={() => router.push(`/tarama/inceleme?tarama=${aktif.id}`)}>
                      Sonuçları incele
                    </button>
                  )}
                  <button type="button" className="dugme w-full" onClick={() => router.push("/kayitlar")}>
                    Kayıtlara git
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <section className="kart">
        <h2 className="mb-3 font-semibold">Tarama geçmişi</h2>
        {gecmis.length === 0 ? (
          <p className="text-sm text-soluk">Henüz tarama yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-kenar text-xs text-soluk">
                <tr>
                  <th className="py-2 pr-3 font-medium">Tarih</th>
                  <th className="py-2 pr-3 font-medium">Kategori</th>
                  <th className="py-2 pr-3 font-medium">Merkez</th>
                  <th className="py-2 pr-3 font-medium">Yarıçap</th>
                  <th className="py-2 pr-3 font-medium">Durum</th>
                  <th className="py-2 pr-3 text-right font-medium">Bulunan</th>
                  <th className="py-2 pr-3 text-right font-medium">İstek</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-kenar">
                {gecmis.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{tarihYaz(t.olusturmaTarihi)}</td>
                    <td className="py-2 pr-3">{kategoriBul(t.kategori)?.etiket ?? t.kategori}</td>
                    <td className="max-w-48 py-2 pr-3 text-xs">
                      <span className="block truncate" title={t.adresMetni ?? ""}>
                        {t.merkezKaynagi === "adres" ? `Adres: ${t.adresMetni}` : "Haritadan"}
                      </span>
                      {t.merkezLat === null && <span className="text-soluk">konum silindi (30 gün)</span>}
                    </td>
                    <td className="py-2 pr-3">{t.yaricapM / 1000} km</td>
                    <td className="py-2 pr-3">
                      <TaramaDurumuRozeti durum={t.durum} />
                      {t.kapsamTamam === false && <span className="ml-1 text-xs text-amber-700">kısmi</span>}
                      {t.durum === "hata" && t.hataMesaji && (
                        <span className="mt-0.5 block text-xs text-tehlike">{t.hataMesaji}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{sayiYaz(t.bulunanSayisi)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{t.istekSayisi}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {(t.incelenmemis ?? 0) > 0 && (
                        <>
                          <Link className="dugme-ana" href={`/tarama/inceleme?tarama=${t.id}`}>
                            Sonuçları incele ({sayiYaz(t.incelenmemis ?? 0)})
                          </Link>{" "}
                        </>
                      )}
                      <button type="button" className="dugme" onClick={() => gecmistenGoster(t)} disabled={calisiyor}>
                        Haritada göster
                      </button>{" "}
                      <button type="button" className="dugme" onClick={() => tekrarKullan(t)} disabled={calisiyor}>
                        Tekrar kullan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
