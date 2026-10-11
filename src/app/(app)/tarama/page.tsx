import type { Metadata } from "next";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayfaBaglami } from "@/server/oturum";
import { taramalariListele, yarimKalanTaramalariKapat } from "@/server/repo/taramalar";
import { taramaButcesi } from "@/server/servisler/tarama";
import { TaramaPaneli } from "./tarama-paneli";

export const metadata: Metadata = { title: "Bölge taraması" };

export default async function TaramaSayfasi() {
  const { ctx } = await sayfaBaglami();
  yarimKalanTaramalariKapat(ctx); // 10 dk'dan uzun "calisiyor" kalanlar → hata ("Tarama yarıda kaldı…")
  const gecmis = taramalariListele(ctx, 30).map((t) => ({
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
  }));

  return (
    <>
      <SayfaBasligi
        baslik="Bölge taraması"
        aciklama="Haritada merkezi seçin (veya adres yazın), yarıçap ve kategoriyi belirleyip taramayı başlatın. Bulunan işletmeler Kayıtlar'a eklenir."
      />
      <TaramaPaneli gecmis={gecmis} butce={taramaButcesi()} mock={process.env.PLACES_MOCK === "true"} />
    </>
  );
}
