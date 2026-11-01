import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { kategoriBul } from "@/lib/kategoriler";
import { TARAMA_KARARLARI, type TaramaKarari } from "@/lib/sabitler";
import { sayfaBaglami } from "@/server/oturum";
import { kotaDurumu } from "@/server/repo/kullanim";
import { incelenmemisSayilari, taramaSonuclariListele } from "@/server/repo/kayitlar";
import { taramalariListele, taramaGetir, yarimKalanTaramalariKapat } from "@/server/repo/taramalar";
import { taramaButcesi } from "@/server/servisler/tarama";
import { SonucIzgarasi } from "./sonuc-izgarasi";
import { TaramaPaneli } from "./tarama-paneli";

export const metadata: Metadata = { title: "Bölge tara" };

const tek = (d: string | string[] | undefined) => (Array.isArray(d) ? d[0] : d);

// Bölge tara: form + harita, altında seçili taramanın (?tarama=, yoksa en son sonuç bulan tarama) sonuçları.
// Bu sunucu sayfası Places'a gitmez; kartlardaki ad, adres ve konum istemcide %80'e kadar otomatik gelir.
export default async function TaramaSayfasi({ searchParams }: PageProps<"/tarama">) {
  const { ctx } = await sayfaBaglami();
  const p = await searchParams;
  yarimKalanTaramalariKapat(ctx); // 10 dk'dan uzun "calisiyor" kalanlar → hata ("Tarama yarıda kaldı…")
  const taramalar = taramalariListele(ctx, 30);
  const incelenmemis = incelenmemisSayilari(ctx, taramalar.map((t) => t.id));
  const gecmis = taramalar.map((t) => ({
    id: t.id,
    merkezKaynagi: t.merkezKaynagi,
    merkezLat: t.merkezLat,
    merkezLng: t.merkezLng,
    adresMetni: t.adresMetni,
    yaricapM: t.yaricapM,
    kategori: t.kategori,
    durum: t.durum,
    bulunanSayisi: t.bulunanSayisi,
    istekSayisi: t.istekSayisi,
    kapsamTamam: t.kapsamTamam,
    hataMesaji: t.hataMesaji,
    olusturmaTarihi: t.olusturmaTarihi.toISOString(),
    incelenmemis: incelenmemis.get(t.id) ?? 0,
  }));

  const istenen = tek(p.tarama);
  const secili = istenen ? taramaGetir(ctx, istenen) : (taramalar.find((t) => t.durum === "tamamlandi" && t.bulunanSayisi > 0) ?? null);
  if (istenen && !secili) notFound();
  const karar: TaramaKarari = TARAMA_KARARLARI.find((k) => k === tek(p.karar)) ?? "tum";
  const sonuc = secili ? taramaSonuclariListele(ctx, secili.id, { sayfa: Number(tek(p.sonuc)) || 1, karar }) : null;
  const kota = kotaDurumu(ctx);
  const baglanti = (k: TaramaKarari, sayfa = 1) => {
    const s = new URLSearchParams({ tarama: secili!.id });
    if (k !== "tum") s.set("karar", k);
    if (sayfa > 1) s.set("sonuc", String(sayfa));
    return `/tarama?${s}`;
  };

  return (
    <>
      <SayfaBasligi
        baslik="Bölge tara"
        aciklama="Haritada bir nokta ve yarıçap seçin; bölgedeki işletmeleri bulup ilgilendiklerinizi kayıtlarınıza ekleyin."
      />
      <TaramaPaneli gecmis={gecmis} butce={taramaButcesi()} mock={process.env.PLACES_MOCK === "true"} kota={kota}>
        {secili && sonuc && (
          <SonucIzgarasi
            key={`${secili.id}-${karar}-${sonuc.sayfa}`}
            taramaId={secili.id}
            baslik={[
              secili.adresMetni ?? "Haritadan seçilen nokta",
              kategoriBul(secili.kategori)?.etiket ?? secili.kategori,
              `${secili.yaricapM / 1000} km`,
            ].join(" · ")}
            merkez={secili.merkezLat !== null && secili.merkezLng !== null ? { lat: secili.merkezLat, lng: secili.merkezLng } : null}
            satirlar={sonuc.kayitlar}
            sayilar={sonuc.sayilar}
            karar={karar}
            kararBaglantisi={Object.fromEntries(TARAMA_KARARLARI.map((k) => [k, baglanti(k)])) as Record<TaramaKarari, string>}
            oncekiBaglanti={sonuc.sayfa > 1 ? baglanti(karar, sonuc.sayfa - 1) : null}
            sonrakiBaglanti={sonuc.sayfa < sonuc.sayfaSayisi ? baglanti(karar, sonuc.sayfa + 1) : null}
            otomatik={!kota.uyari && !kota.doldu}
          />
        )}
      </TaramaPaneli>
    </>
  );
}
