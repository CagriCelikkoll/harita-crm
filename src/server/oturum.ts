// Oturumdan kiracı bağlamı üretimi. TenantContext'e giden TEK yol budur:
// doğrulanmış oturum (Better Auth) + memberships tablosu. İstemciden gelen tenant_id kullanılmaz;
// aktif çalışma alanı çerezi yalnızca kullanıcının ZATEN üye olduğu alanlar arasından seçim yapar.
import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import type { TenantContext } from "./repo/baglam";
import { baglamUret, kullaniciUyelikleri } from "./repo/sistem/uyelik";

export const AKTIF_ALAN_CEREZI = "hc_aktif_alan";

export const oturumGetir = cache(async () => auth.api.getSession({ headers: await headers() }));

export type Oturum = NonNullable<Awaited<ReturnType<typeof oturumGetir>>>;
export type Uyelik = ReturnType<typeof kullaniciUyelikleri>[number];

type BaglamDurumu =
  | { durum: "oturum-yok" }
  | { durum: "uyelik-yok"; oturum: Oturum }
  | { durum: "tamam"; ctx: TenantContext; oturum: Oturum; uyelikler: Uyelik[]; aktif: Uyelik };

export const baglamGetir = cache(async (): Promise<BaglamDurumu> => {
  const oturum = await oturumGetir();
  if (!oturum) return { durum: "oturum-yok" };
  const uyelikler = kullaniciUyelikleri(oturum.user.id);
  if (!uyelikler.length) return { durum: "uyelik-yok", oturum };
  const tercih = (await cookies()).get(AKTIF_ALAN_CEREZI)?.value;
  const aktif = uyelikler.find((u) => u.tenantId === tercih) ?? uyelikler[0];
  const ctx = baglamUret(oturum.user.id, aktif.tenantId);
  if (!ctx) return { durum: "uyelik-yok", oturum };
  return { durum: "tamam", ctx, oturum, uyelikler, aktif };
});

/** Sayfalar ve server action'lar için: oturum yoksa /giris, üyelik yoksa /kurulum. */
export async function sayfaBaglami() {
  const b = await baglamGetir();
  if (b.durum === "oturum-yok") redirect("/giris");
  if (b.durum === "uyelik-yok") redirect("/kurulum");
  return b;
}

/** Route handler'lar için: bağlam yoksa null (çağıran 401 döner). */
export async function apiBaglami(): Promise<TenantContext | null> {
  const b = await baglamGetir();
  return b.durum === "tamam" ? b.ctx : null;
}
