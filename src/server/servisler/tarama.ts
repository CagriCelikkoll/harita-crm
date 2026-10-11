import { kategoriBul } from "@/lib/kategoriler";
import { placesIstemcisiOlustur } from "../places/istemci";
import type { TenantContext } from "../repo/baglam";
import { kayitlariEkle } from "../repo/kayitlar";
import { konumlariKaydet } from "../repo/konumlar";
import { placesIstegiSay } from "../repo/kullanim";
import { taramaBaslat, taramaGetir, taramaGuncelle, type Tarama } from "../repo/taramalar";
import { bolgeTara } from "../scan/motor";

export function taramaButcesi() {
  const deger = Number(process.env.SCAN_MAX_REQUESTS ?? 50);
  return Number.isFinite(deger) && deger > 0 ? Math.floor(deger) : 50;
}

/**
 * Taramayı senkron olarak çalıştırır (1. aşama). Durum ve istek sayısı ilerledikçe scans tablosuna
 * yazılır; arayüz GET /api/taramalar/[id] ile ilerlemeyi okur.
 * Tarama bu kiracıya ait değilse null döner (çağıran 404 verir).
 */
export async function taramaCalistir(ctx: TenantContext, id: string): Promise<Tarama | null> {
  const tarama = taramaBaslat(ctx, id);
  if (!tarama) return taramaGetir(ctx, id); // yok (null → 404) veya zaten başlatılmış

  let istekSayisi = 0;
  const istemci = placesIstemcisiOlustur({
    istekSayaci: (adet) => {
      istekSayisi += adet;
      placesIstegiSay(ctx, adet);
    },
  });

  try {
    const kategori = kategoriBul(tarama.kategori);
    if (!kategori) throw new Error(`Bilinmeyen kategori: ${tarama.kategori}`);
    if (tarama.merkezLat === null || tarama.merkezLng === null) {
      throw new Error("Merkez konumu 30 gün kuralıyla silinmiş. Adresi yeniden arayıp yeni tarama başlatın.");
    }
    const sonuc = await bolgeTara({
      merkez: { lat: tarama.merkezLat, lng: tarama.merkezLng },
      yaricapM: tarama.yaricapM,
      sorgu: kategori.sorgu,
      tur: kategori.tur,
      butce: taramaButcesi(),
      istemci,
      ilerleme: (d) => taramaGuncelle(ctx, id, { istekSayisi: d.istekSayisi, bulunanSayisi: d.bulunanSayisi }),
    });
    kayitlariEkle(ctx, id, sonuc.placeIdler);
    konumlariKaydet(ctx, sonuc.konumlar);
    return taramaGuncelle(ctx, id, {
      durum: "tamamlandi",
      bulunanSayisi: sonuc.placeIdler.length,
      istekSayisi,
      kapsamTamam: sonuc.kapsamTamam,
      tamamlanmaTarihi: new Date(),
    });
  } catch (hata) {
    console.error("Tarama hatası", id, hata);
    return taramaGuncelle(ctx, id, {
      durum: "hata",
      hataMesaji: (hata as Error).message.slice(0, 500),
      istekSayisi,
      tamamlanmaTarihi: new Date(),
    });
  }
}
