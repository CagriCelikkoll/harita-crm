import { PLACES_BIRIMLERI } from "@/lib/places-birimleri";
import { ayAnahtari } from "@/lib/zaman";
import type { KotaKapisi } from "../places/tipler";
import type { TenantContext } from "../repo/baglam";
import { kotaAyir, kotaIadeEt, kullanimYaz } from "../repo/kullanim";

/**
 * Tarayıcıda bir harita oluşturuldu (Dynamic Maps yüklemesi): "harita" kalemine yazılır ve kotaya sayılır.
 * Kota denetimi yapılmaz; harita %80'de de, kota dolunca da engellenmez.
 */
export function haritaYuklemesiKaydet(ctx: TenantContext) {
  kullanimYaz(ctx, PLACES_BIRIMLERI.dynamicMaps, "harita");
}

/**
 * Kiracının aylık Places kotasına bağlı kapı: her ücretli istekten önce SKU'nun birimi, çağrının kalemiyle
 * (işletme bilgisi / iletişim bilgisi / tarama) atomik olarak ayrılır. İade, ayırmanın yapıldığı aya ve kaleme
 * yapılır (ay geçişinde yanlış aya iade olmasın).
 * `esik` verilirse (otomatik gösterim, ör. 0,8) ayırma yalnızca toplam kota × esik'in altında kalınıyorsa yapılır.
 */
export function kotaKapisi(ctx: TenantContext, secenek: { esik?: number } = {}): KotaKapisi {
  return {
    ayir(birim, kalem) {
      const ay = ayAnahtari();
      return kotaAyir(ctx, birim, { ay, kalem, esik: secenek.esik }) ? { iade: () => kotaIadeEt(ctx, birim, { ay, kalem }) } : null;
    },
  };
}
