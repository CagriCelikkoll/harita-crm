import type { Metadata } from "next";
import { whatsappDonusMetni } from "@/lib/mesajlasma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KotaCubugu } from "@/components/kota-cubugu";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import {
  ILETI_IZINLERI,
  ILETI_IZNI_ADLARI,
  INCELEME_ADLARI,
  INCELEME_DURUMLARI,
  KAYIT_DURUM_ADLARI,
  KAYIT_DURUMLARI,
  KAYIT_KAYNAK_ADLARI,
  KAYIT_KAYNAKLARI,
  type IletiIzni,
  type IncelemeDurumu,
  type KayitKaynagi,
  type KayitDurumu,
} from "@/lib/sabitler";
import { sayfaBaglami } from "@/server/oturum";
import { etiketleriListele, kayitGetir, kayitlariListele, type KayitFiltresi } from "@/server/repo/kayitlar";
import { engelliKayitlar } from "@/server/repo/engel-listesi";
import { kotaDurumu } from "@/server/repo/kullanim";
import { whatsappKisileriGetir } from "@/server/repo/whatsapp-kisileri";
import { WHATSAPP_IZINLERI, WHATSAPP_IZNI_ADLARI, type WhatsappIzni } from "@/lib/mesajlasma";
import { pencereAcikMi } from "@/lib/whatsapp-api";
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
    // Varsayılan: "ilgilenmiyor" işaretli kayıtlar gizli.
    inceleme:
      tek(p.inceleme) === "hepsi"
        ? "hepsi"
        : (INCELEME_DURUMLARI.find((d) => d === tek(p.inceleme)) as IncelemeDurumu | undefined),
    adsizGoogle: tek(p.ad) === "bos" || undefined,
  };
  const seciliId = tek(p.secili);
  const waDonus = whatsappDonusMetni(tek(p.wa), tek(p.neden));

  const liste = kayitlariListele(ctx, filtre);
  // Paylaşılan ?secili= bağlantısı: başka kiracının veya silinmiş kayıt → 404. (Detayın kendisi
  // istemcide /api/kayitlar/[id] ile yüklenir.)
  if (seciliId && !kayitGetir(ctx, seciliId)) notFound();

  // Liste Places'a GİTMEZ: yalnızca kullanıcının verisi gösterilir (0 birim). Google kayıtlarının ad ve adresi
  // istemcide "Göster" ile, maliyet önceden yazılarak istenir (/api/kayitlar/canli) ve yalnızca bellekte tutulur.
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

  const etiketler = etiketleriListele(ctx);
  const sorgu = new URLSearchParams();
  for (const [k, v] of Object.entries({
    durum: filtre.durum,
    izin: filtre.iletiIzni,
    etiket: filtre.etiket,
    kaynak: filtre.kaynak,
    wa_izin: filtre.whatsappIzni,
    q: filtre.arama,
    inceleme: filtre.inceleme,
    ad: filtre.adsizGoogle ? "bos" : undefined,
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

      {(kota.doldu || kota.uyari) && (
        <section className={`kart mb-4 ${kota.doldu ? "border-tehlike/40 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
          <KotaCubugu durum={kota} aciklama={false} />
        </section>
      )}

      {waDonus && (
        <p role="alert" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          WhatsApp: {waDonus}
        </p>
      )}

      <form key={sorgu.toString()} method="get" className="kart mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto]">
        {filtre.adsizGoogle && <input type="hidden" name="ad" value="bos" />}
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
          İnceleme
          <select name="inceleme" defaultValue={filtre.inceleme ?? ""} className="girdi">
            <option value="">İlgilenilmeyenler hariç</option>
            <option value="hepsi">Hepsi</option>
            {INCELEME_DURUMLARI.map((d) => (
              <option key={d} value={d}>
                {INCELEME_ADLARI[d]}
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
          Liste yalnızca sizin girdiğiniz bilgileri gösterir. Google&apos;daki ad ve adres saklanmaz; istediğinizde
          &quot;Göster&quot; ile (maliyeti yazılarak) gelir. &quot;Ara&quot; yalnızca sizin girdiğiniz alanlarda çalışır.
          {filtre.adsizGoogle && " Şu an yalnızca kendi işletme adını girmediğiniz Google kayıtları gösteriliyor."}
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
