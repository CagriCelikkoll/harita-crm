import type { Metadata } from "next";
import { whatsappDonusMetni } from "@/lib/mesajlasma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KotaCubugu } from "@/components/kota-cubugu";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import {
  ILETI_IZINLERI,
  ILETI_IZNI_ADLARI,
  KAYIT_DURUM_ADLARI,
  KAYIT_DURUMLARI,
  KAYIT_KAYNAK_ADLARI,
  KAYIT_KAYNAKLARI,
  type IletiIzni,
  type KayitKaynagi,
  type KayitDurumu,
} from "@/lib/sabitler";
import { sayfaBaglami } from "@/server/oturum";
import { etiketleriListele, kayitGetir, kayitlariListele, type KayitFiltresi } from "@/server/repo/kayitlar";
import { kotaDurumu } from "@/server/repo/kullanim";
import { whatsappKisileriGetir } from "@/server/repo/whatsapp-kisileri";
import { WHATSAPP_IZINLERI, WHATSAPP_IZNI_ADLARI, type WhatsappIzni } from "@/lib/mesajlasma";
import { pencereAcikMi } from "@/lib/whatsapp-api";
import { canliBilgiGetir } from "@/server/servisler/canli-bilgi";
import type { TabloSatiri } from "./kayit-tablosu";
import { KayitlarEkrani } from "./kayitlar-ekrani";

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
    kaynak: KAYIT_KAYNAKLARI.find((d) => d === tek(p.kaynak)) as KayitKaynagi | undefined,
    whatsappIzni: WHATSAPP_IZINLERI.find((d) => d === tek(p.wa_izin)) as WhatsappIzni | undefined,
    arama: tek(p.q) || undefined,
  };
  const seciliId = tek(p.secili);
  const waDonus = whatsappDonusMetni(tek(p.wa), tek(p.neden));

  const liste = kayitlariListele(ctx, filtre);
  // Paylaşılan ?secili= bağlantısı: başka kiracının veya silinmiş kayıt → 404. (Detayın kendisi
  // istemcide /api/kayitlar/[id] ile yüklenir.)
  if (seciliId && !kayitGetir(ctx, seciliId)) notFound();

  // Görünen sayfadaki kayıtlar için yalnızca ad ve adres canlı çekilir (Place Details Pro, satır başına
  // bir istek); yalnızca bu isteğin belleğinde yaşar. Telefon/web sitesi yalnızca detay panelinde.
  // Aylık kota doluysa Places çağrısı yapılmaz (her istekten önce de atomik olarak kontrol edilir);
  // kullanıcının kendi verisi (durum, ileti izni, etiketler, yetkili) yine gösterilir.
  // Google dışı kayıtlarda (içe aktarma, elle, reklam) Places çağrısı yapılmaz; ad kullanıcının verisidir.
  const placeIdler = liste.kayitlar.flatMap((k) => (k.placeId ? [k.placeId] : []));
  const canli = await canliBilgiGetir(ctx, placeIdler, "liste");
  const kotaEtkiledi = [...canli.values()].some((c) => c.durum === "kota");
  const kota = kotaDurumu(ctx);
  const wa = whatsappKisileriGetir(ctx, liste.kayitlar.map((k) => k.id));
  const satirlar: TabloSatiri[] = liste.kayitlar.map((k) => {
    const c = k.placeId ? canli.get(k.placeId) : undefined;
    return {
      id: k.id,
      durum: k.durum,
      iletiIzni: k.iletiIzni,
      etiketler: k.etiketler,
      yetkiliAdi: k.yetkiliAdi,
      guncellemeTarihi: k.guncellemeTarihi.toISOString(),
      kaynak: k.kaynak,
      whatsappIzni: wa.get(k.id)?.izin ?? "yok",
      waPencereAcik: pencereAcikMi(wa.get(k.id)?.pencereBitis),
      canli: !k.placeId
        ? { ad: k.isletmeAdi ?? k.yetkiliAdi ?? "(adsız kişi)", adres: null }
        : c?.durum === "tamam"
          ? { ad: c.yer.ad, adres: c.yer.adres ?? null }
          : {
              hata:
                c?.durum === "kota"
                  ? "İşletme bilgisi gösterilemiyor (kota doldu)"
                  : c?.durum === "bulunamadi"
                    ? "Google'da artık bulunmuyor"
                    : "Bilgi alınamadı",
            },
    };
  });

  const etiketler = etiketleriListele(ctx);
  const sorgu = new URLSearchParams();
  for (const [k, v] of Object.entries({
    durum: filtre.durum,
    izin: filtre.iletiIzni,
    etiket: filtre.etiket,
    kaynak: filtre.kaynak,
    wa_izin: filtre.whatsappIzni,
    q: filtre.arama,
  })) {
    if (v) sorgu.set(k, v);
  }
  const sayfaBaglantisi = (sayfa: number) => {
    const s = new URLSearchParams(sorgu);
    if (sayfa > 1) s.set("sayfa", String(sayfa));
    return `/kayitlar${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <SayfaBasligi baslik="Kayıtlar">
        <div className="flex flex-wrap gap-2">
          <Link href="/kayitlar/yeni" className="dugme">
            Kişi ekle
          </Link>
          <Link href="/kayitlar/ice-aktar" className="dugme">
            İçe aktar
          </Link>
        <a href={`/api/kayitlar/disa-aktar${sorgu.size ? `?${sorgu}` : ""}`} className="dugme">
          CSV dışa aktar
        </a>
        </div>
      </SayfaBasligi>

      {(kota.doldu || kotaEtkiledi || kota.uyari) && (
        <section className={`kart mb-4 ${kota.doldu || kotaEtkiledi ? "border-tehlike/40 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
          <KotaCubugu durum={kota} aciklama={false} />
        </section>
      )}

      {waDonus && (
        <p role="alert" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          WhatsApp: {waDonus}
        </p>
      )}

      <form key={sorgu.toString()} method="get" className="kart mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto_auto_auto]">
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
          Kaynak
          <select name="kaynak" defaultValue={filtre.kaynak ?? ""} className="girdi">
            <option value="">Tümü</option>
            {KAYIT_KAYNAKLARI.map((d) => (
              <option key={d} value={d}>
                {KAYIT_KAYNAK_ADLARI[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="etiket">
          WhatsApp izni
          <select name="wa_izin" defaultValue={filtre.whatsappIzni ?? ""} className="girdi">
            <option value="">Tümü</option>
            {WHATSAPP_IZINLERI.map((d) => (
              <option key={d} value={d}>
                {WHATSAPP_IZNI_ADLARI[d]}
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

      <KayitlarEkrani
        key={sayfaBaglantisi(liste.sayfa)}
        satirlar={satirlar}
        toplam={liste.toplam}
        seciliIlk={seciliId ?? null}
        kullaniciId={ctx.userId}
        sorgu={new URLSearchParams(sayfaBaglantisi(liste.sayfa).split("?")[1] ?? "").toString()}
        sayfa={liste.sayfa}
        sayfaSayisi={liste.sayfaSayisi}
        oncekiBaglanti={liste.sayfa > 1 ? sayfaBaglantisi(liste.sayfa - 1) : null}
        sonrakiBaglanti={liste.sayfa < liste.sayfaSayisi ? sayfaBaglantisi(liste.sayfa + 1) : null}
      />
    </>
  );
}
