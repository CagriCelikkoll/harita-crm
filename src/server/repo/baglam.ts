import type { Rol } from "@/lib/sabitler";

declare const marka: unique symbol;

/**
 * Oturumdan doğrulanmış kiracı bağlamı. Markalı tiptir: düz bir nesne literal'i TenantContext
 * yerine geçemez. Kullanıcı istekleri için yalnızca repo/sistem/uyelik.ts içindeki baglamUret()
 * (oturum + memberships kontrolünden sonra) üretir. İstemciden gelen tenant_id'ye asla güvenilmez.
 * Kullanıcısız sistem akışları da kendi doğrulamalarından sonra repo/sistem/ içinde üretir:
 * işçi (kuyruk satırının kiracısı, isci.ts) ve abonelikten çıkma / SMS ret (imzalı belirteç ya da
 * anahtar, abonelik.ts). Bu bağlamların userId'si kampanyayı oluşturan kullanıcı ya da "" olur.
 */
export type TenantContext = Readonly<{ tenantId: string; userId: string; rol: Rol }> & {
  readonly [marka]: true;
};

/** @internal Yalnızca repo/sistem/uyelik.ts ve testler kullanır. */
export function _baglamDamgala(deger: { tenantId: string; userId: string; rol: Rol }): TenantContext {
  return Object.freeze({ ...deger }) as TenantContext;
}

export class YetkiHatasi extends Error {
  constructor(mesaj = "Bu işlem için yönetici yetkisi gerekir.") {
    super(mesaj);
    this.name = "YetkiHatasi";
  }
}

export function yoneticiOlmali(ctx: TenantContext) {
  if (ctx.rol !== "yonetici") throw new YetkiHatasi();
}

/** LIKE desenindeki özel karakterleri kaçırır (ESCAPE '\'). */
export function likeKacir(metin: string) {
  return metin.replace(/[\\%_]/g, (k) => `\\${k}`);
}
