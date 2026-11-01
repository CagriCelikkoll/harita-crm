import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BilgiNotu } from "@/components/arayuz/not";
import { SekmeGrubu } from "@/components/arayuz/sekmeler";
import { Simge } from "@/components/arayuz/simge";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { etkinSuzgecSayisi, kayitFiltresiCoz, kayitSorgusu } from "@/lib/kayit-filtresi";
import { WHATSAPP_IZINLERI, WHATSAPP_IZNI_ADLARI, whatsappDonusMetni } from "@/lib/mesajlasma";
import {
  ILETI_IZINLERI,
  ILETI_IZNI_ADLARI,
  KAYIT_DURUM_ADLARI,
  KAYIT_DURUMLARI,
  KAYIT_GRUP_ADLARI,
  KAYIT_GRUPLARI,
  KAYIT_KAYNAK_ADLARI,
  KAYIT_KAYNAKLARI,
  KULLANIM_DOLDU_METNI,
  OTOMATIK_GOSTERIM_SINIRI_METNI,
} from "@/lib/sabitler";
import { pencereAcikMi } from "@/lib/whatsapp-api";
import { sayfaBaglami } from "@/server/oturum";
import { engelliKayitlar } from "@/server/repo/engel-listesi";
import { etiketleriListele, grupSayilari, kayitGetir, kayitlariListele } from "@/server/repo/kayitlar";
import { kotaDurumu } from "@/server/repo/kullanim";
import { whatsappKisileriGetir } from "@/server/repo/whatsapp-kisileri";
import type { TabloSatiri } from "./kayit-tablosu";
import { KayitlarEkrani } from "./kayitlar-ekrani";

export const metadata: Metadata = { title: "Kayıtlar" };

const tek = (d: string | string[] | undefined) => (Array.isArray(d) ? d[0] : d);

// Kayıtlar (docs/tasarim/Kayitlar.dc.html): sekmeler (İlgilendiklerim / İncelenmemiş / Tümü), arama, Filtreler,
// tablo ve sağda ayrıntı paneli. Bu sunucu sayfası Places'a GİTMEZ. Adı girilmemiş Google kayıtlarının adı ve adresi
// istemcide, kullanım %80'e ulaşana kadar otomatik istenir (/api/kayitlar/canli, otomatik: true; eşik sunucuda).
export default async function KayitlarSayfasi({ searchParams }: PageProps<"/kayitlar">) {
  const { ctx } = await sayfaBaglami();
  const p = await searchParams;
  const filtre = kayitFiltresiCoz((ad) => tek(p[ad]), "ilgi");
  const seciliId = tek(p.secili);
  const waDonus = whatsappDonusMetni(tek(p.wa), tek(p.neden));

  const liste = kayitlariListele(ctx, filtre);
  // Paylaşılan ?secili= bağlantısı: başka kiracının veya silinmiş kayıt → 404. (Detayın kendisi
  // istemcide /api/kayitlar/[id] ile yüklenir.)
  if (seciliId && !kayitGetir(ctx, seciliId)) notFound();

  const kota = kotaDurumu(ctx);
  const wa = whatsappKisileriGetir(ctx, liste.kayitlar.map((k) => k.id));
  const engelli = engelliKayitlar(ctx, liste.kayitlar);
  const satirlar: TabloSatiri[] = liste.kayitlar.map((k) => ({
    id: k.id,
    durum: k.durum,
    iletiIzni: k.iletiIzni,
    etiketler: k.etiketler,
    isletmeAdi: k.isletmeAdi,
    yetkiliAdi: k.yetkiliAdi,
    guncellemeTarihi: k.guncellemeTarihi.toISOString(),
    kaynak: k.kaynak,
    inceleme: k.inceleme,
    whatsappIzni: wa.get(k.id)?.izin ?? "yok",
    waPencereAcik: pencereAcikMi(wa.get(k.id)?.pencereBitis),
    engelli: engelli.has(k.id),
  }));

  const sayilar = grupSayilari(ctx, filtre); // sekme ve sayfa sayımda yok sayılır
  const etiketler = etiketleriListele(ctx);
  const sorgu = kayitSorgusu(filtre);
  const adres = (s: URLSearchParams) => `/kayitlar${s.size ? `?${s}` : ""}`;
  const sayfaBaglantisi = (sayfa: number) => {
    const s = new URLSearchParams(sorgu);
    if (sayfa > 1) s.set("sayfa", String(sayfa));
    return adres(s);
  };
  const suzgecSayisi = etkinSuzgecSayisi(filtre);
  // Arama ve Filtreler formları sekmeyi ve diğer süzgeci korur.
  const gizliAlanlar = (haric: string[]) =>
    [...sorgu.entries()].filter(([k]) => !haric.includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  const secim = "girdi";

  return (
    <>
      <SayfaBasligi baslik="Kayıtlar" aciklama="İlgilendiğiniz işletmeler ve kişiler. Bir satıra tıklayınca ayrıntılar sağda açılır.">
        <Link href="/kayitlar/ice-aktar" className="dugme">
          İçe aktar
        </Link>
        <Link href="/kayitlar/yeni" className="dugme-ana">
          Kişi ekle
        </Link>
      </SayfaBasligi>

      {(kota.doldu || kota.uyari) && (
        // Kullanım yalnızca menüde yüzde olarak görünür; burada sayı yazmadan davranış değişikliği açıklanır.
        <BilgiNotu ton={kota.doldu ? "tehlike" : "uyari"} uyariRolu className="mb-4">
          {kota.doldu ? KULLANIM_DOLDU_METNI : OTOMATIK_GOSTERIM_SINIRI_METNI}
        </BilgiNotu>
      )}

      {waDonus && (
        <BilgiNotu ton="uyari" uyariRolu className="mb-4">
          WhatsApp: {waDonus}
        </BilgiNotu>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SekmeGrubu
          etiket="Kayıt grubu"
          secili={filtre.grup ?? "tum"}
          secenekler={KAYIT_GRUPLARI.map((g) => ({
            deger: g,
            ad: KAYIT_GRUP_ADLARI[g],
            sayi: sayilar[g],
            href: adres(kayitSorgusu({ ...filtre, sayfa: undefined }, { grup: g })),
          }))}
        />
        <form key={`ara-${sorgu}`} method="get" role="search" className="flex min-w-0 flex-[1_1_240px] gap-2 sm:max-w-[420px]">
          {gizliAlanlar(["q"])}
          <input
            type="search"
            name="q"
            defaultValue={filtre.arama}
            aria-label="Kayıtlarda ara"
            placeholder="Ad, yetkili, e-posta, etiket veya not ara"
            className="girdi"
          />
          <button type="submit" className="dugme">
            Ara
          </button>
        </form>
        <details className="group relative">
          <summary className="dugme list-none [&::-webkit-details-marker]:hidden">
            <Simge ad="filtre" boyut={16} />
            Filtreler{suzgecSayisi > 0 && <span className="rozet ml-1">{suzgecSayisi}</span>}
          </summary>
          <form
            key={`suzgec-${sorgu}`}
            method="get"
            className="absolute right-0 z-20 mt-2 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3 rounded-kart border border-kenar bg-white p-5 shadow-lg"
          >
            {gizliAlanlar(["durum", "izin", "kaynak", "wa_izin", "etiket", "ad"])}
            <label className="etiket">
              Durum
              <select name="durum" defaultValue={filtre.durum ?? ""} className={secim}>
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
              <select name="izin" defaultValue={filtre.iletiIzni ?? ""} className={secim}>
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
              <select name="kaynak" defaultValue={filtre.kaynak ?? ""} className={secim}>
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
              <select name="wa_izin" defaultValue={filtre.whatsappIzni ?? ""} className={secim}>
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
              <select name="etiket" defaultValue={filtre.etiket ?? ""} className={secim}>
                <option value="">Tümü</option>
                {etiketler.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ad" value="bos" defaultChecked={filtre.adsizGoogle} className="size-4 accent-ana" />
              Yalnızca adını girmediğim Google kayıtları
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" className="dugme-ana">
                Uygula
              </button>
              {suzgecSayisi > 0 && (
                <Link href={adres(kayitSorgusu({ grup: filtre.grup, arama: filtre.arama }))} className="dugme">
                  Temizle
                </Link>
              )}
            </div>
            <a href={`/api/kayitlar/disa-aktar${sorgu.size ? `?${sorgu}` : ""}`} download className="text-sm text-ana underline">
              Bu listeyi CSV olarak indir
            </a>
            <p className="text-xs text-soluk">
              Arama ve süzgeçler yalnızca sizin girdiğiniz bilgilerde çalışır; Google&apos;dan gelen ad ve adres saklanmadığı için
              aranamaz.
            </p>
          </form>
        </details>
      </div>

      <KayitlarEkrani
        key={sayfaBaglantisi(liste.sayfa)}
        satirlar={satirlar}
        toplam={liste.toplam}
        seciliIlk={seciliId ?? null}
        kullaniciId={ctx.userId}
        otomatik={!kota.uyari && !kota.doldu}
        sorgu={new URLSearchParams(sayfaBaglantisi(liste.sayfa).split("?")[1] ?? "").toString()}
        sayfa={liste.sayfa}
        sayfaSayisi={liste.sayfaSayisi}
        oncekiBaglanti={liste.sayfa > 1 ? sayfaBaglantisi(liste.sayfa - 1) : null}
        sonrakiBaglanti={liste.sayfa < liste.sayfaSayisi ? sayfaBaglantisi(liste.sayfa + 1) : null}
      />
    </>
  );
}
