import { ayAnahtari } from "@/lib/zaman";
import type { KotaKapisi } from "../places/tipler";
import type { TenantContext } from "../repo/baglam";
import { kotaAyir, kotaIadeEt } from "../repo/kullanim";

/**
 * Kiracının aylık Places kotasına bağlı kapı: her ücretli istekten önce SKU'nun birimi atomik olarak
 * ayrılır. İade, ayırmanın yapıldığı aya yapılır (ay geçişinde yanlış aya iade olmasın).
 */
export function kotaKapisi(ctx: TenantContext): KotaKapisi {
  return {
    ayir(birim) {
      const ay = ayAnahtari();
      return kotaAyir(ctx, birim, ay) ? { iade: () => kotaIadeEt(ctx, birim, ay) } : null;
    },
  };
}
