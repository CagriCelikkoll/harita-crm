import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoogleAtfi } from "@/components/google-atfi";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayiYaz } from "@/lib/bicim";
import {
  ILETI_IZINLERI,
  ILETI_IZNI_ADLARI,
  KAYIT_DURUM_ADLARI,
  KAYIT_DURUMLARI,
  type IletiIzni,
  type KayitDurumu,
} from "@/lib/sabitler";
import { sayfaBaglami } from "@/server/oturum";
import { etiketleriListele, kayitGetir, kayitlariListele, type KayitFiltresi } from "@/server/repo/kayitlar";
import { canliBilgiGetir } from "@/server/servisler/canli-bilgi";
import { KayitDetayi } from "./kayit-detayi";
import { KayitTablosu, type TabloSatiri } from "./kayit-tablosu";

export const metadata: Metadata = { title: "Kayıtlar" };

const tek = (d: string | string[] | undefined) => (Array.isArray(d) ? d[0] : d);

export default async function KayitlarSayfasi({ searchParams }: PageProps<"/kayitlar">) {
  const { ctx } = await sayfaBaglami();
  const p = await searchParams;
  const filtre: KayitFiltresi = {
    sayfa: Number(tek(p.sayfa)) || 1,
    durum: KAYIT_DURUMLARI.find((d) => d === tek(p.durum)) as KayitDurumu | undefined,
    iletiIzni: ILETI_IZINLERI.find((d) => d === tek(p.izin)) as IletiIzni | undefined,
    etiket: tek(p.etiket) || undefined,
    arama: tek(p.q) || undefined,
  };
  const seciliId = tek(p.secili);

  const liste = kayitlariListele(ctx, filtre);
  const seciliKayit = seciliId ? kayitGetir(ctx, seciliId) : null;
  if (seciliId && !seciliKayit) notFound(); // başka kiracının veya silinmiş kayıt → 404

  // Görünen sayfadaki kayıtlar için Places bilgisi canlı çekilir; yalnızca bu isteğin belleğinde yaşar.
  const canli = await canliBilgiGetir(ctx, liste.kayitlar.map((k) => k.placeId), "liste");
  const satirlar: TabloSatiri[] = liste.kayitlar.map((k) => {
    const c = canli.get(k.placeId);
    return {
      id: k.id,
      durum: k.durum,
      iletiIzni: k.iletiIzni,
      etiketler: k.etiketler,
      yetkiliAdi: k.yetkiliAdi,
      guncellemeTarihi: k.guncellemeTarihi.toISOString(),
      canli:
        c?.durum === "tamam"
          ? { ad: c.yer.ad, adres: c.yer.adres ?? null, telefon: c.yer.telefon ?? null }
          : { hata: c?.durum === "bulunamadi" ? "Google'da artık bulunmuyor" : "Bilgi alınamadı" },
    };
  });

  const etiketler = etiketleriListele(ctx);
  const sorgu = new URLSearchParams();
  for (const [k, v] of Object.entries({ durum: filtre.durum, izin: filtre.iletiIzni, etiket: filtre.etiket, q: filtre.arama })) {
    if (v) sorgu.set(k, v);
  }
  const sayfaBaglantisi = (sayfa: number) => {
    const s = new URLSearchParams(sorgu);
    if (sayfa > 1) s.set("sayfa", String(sayfa));
    return `/kayitlar${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <SayfaBasligi baslik="Kayıtlar" aciklama={`${sayiYaz(liste.toplam)} kayıt`}>
        <a href={`/api/kayitlar/disa-aktar${sorgu.size ? `?${sorgu}` : ""}`} className="dugme">
          CSV dışa aktar
        </a>
      </SayfaBasligi>

      <form key={sorgu.toString()} method="get" className="kart mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <label className="etiket">
          Ara
          <input name="q" defaultValue={filtre.arama} className="girdi" placeholder="yetkili, e-posta, ek telefon, not, etiket" />
        </label>
        <label className="etiket">
          Durum
          <select name="durum" defaultValue={filtre.durum ?? ""} className="girdi">
            <option value="">Tümü</option>
            {KAYIT_DURUMLARI.map((d) => (
              <option key={d} value={d}>
                {KAYIT_DURUM_ADLARI[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="etiket">
          İleti izni
          <select name="izin" defaultValue={filtre.iletiIzni ?? ""} className="girdi">
            <option value="">Tümü</option>
            {ILETI_IZINLERI.map((d) => (
              <option key={d} value={d}>
                {ILETI_IZNI_ADLARI[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="etiket">
          Etiket
          <select name="etiket" defaultValue={filtre.etiket ?? ""} className="girdi">
            <option value="">Tümü</option>
            {etiketler.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="dugme-ana">
            Filtrele
          </button>
          {sorgu.size > 0 && (
            <Link href="/kayitlar" className="dugme">
              Temizle
            </Link>
          )}
        </div>
        <p className="text-xs text-soluk sm:col-span-2 lg:col-span-5">
          İşletme adı, adresi ve ilçesi Google kuralları gereği saklanmadığı için bu alanlarda veritabanı araması
          yapılamaz. &quot;Ara&quot; yalnızca sizin girdiğiniz alanlarda çalışır; işletme adına göre süzme yalnızca görünen
          sayfadaki 20 kayıtta yapılabilir (tablonun üstündeki kutu).
        </p>
      </form>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="kart min-w-0">
          <KayitTablosu satirlar={satirlar} seciliId={seciliId ?? null} sorgu={sorgu.toString()} sayfa={liste.sayfa} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <GoogleAtfi />
            {liste.sayfaSayisi > 1 && (
              <nav aria-label="Sayfalar" className="flex items-center gap-2 text-sm">
                {liste.sayfa > 1 && (
                  <Link className="dugme" href={sayfaBaglantisi(liste.sayfa - 1)}>
                    Önceki
                  </Link>
                )}
                <span className="text-soluk">
                  Sayfa {liste.sayfa} / {liste.sayfaSayisi}
                </span>
                {liste.sayfa < liste.sayfaSayisi && (
                  <Link className="dugme" href={sayfaBaglantisi(liste.sayfa + 1)}>
                    Sonraki
                  </Link>
                )}
              </nav>
            )}
          </div>
        </section>

        {seciliKayit ? (
          <KayitDetayi ctx={ctx} kayit={seciliKayit} kapatBaglantisi={sayfaBaglantisi(liste.sayfa)} />
        ) : (
          <aside className="kart hidden text-sm text-soluk xl:block">Ayrıntıları görmek için listeden bir kayıt seçin.</aside>
        )}
      </div>
    </>
  );
}
