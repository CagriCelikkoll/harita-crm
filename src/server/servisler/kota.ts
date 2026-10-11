import type { KotaKapisi } from "../places/tipler";
import type { TenantContext } from "../repo/baglam";
import { kotaAyir, kotaIadeEt } from "../repo/kullanim";

/** Kiracının aylık Places kotasına bağlı kapı: her istekten önce 1 birim atomik olarak ayrılır. */
export function kotaKapisi(ctx: TenantContext): KotaKapisi {
  return { ayir: () => kotaAyir(ctx, 1), iade: () => kotaIadeEt(ctx, 1) };
}
