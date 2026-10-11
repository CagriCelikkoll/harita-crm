// Kiracı bağlamı OLUŞMADAN önce gereken işlemler: üyelik sorgusu, bağlam üretimi,
// ilk çalışma alanı kurulumu ve davet kabulü. Hepsi oturumdan doğrulanmış userId alır.
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db";
import { invitations, memberships, tenants, user } from "../../db/schema";
import { _baglamDamgala, type TenantContext } from "../baglam";

export function kullaniciUyelikleri(userId: string) {
  return db
    .select({ tenantId: tenants.id, ad: tenants.ad, slug: tenants.slug, rol: memberships.rol })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.olusturmaTarihi))
    .all();
}

/**
 * TenantContext'in üretildiği TEK yer. Kullanıcının o kiracıda üyeliği yoksa null döner.
 * userId mutlaka doğrulanmış oturumdan gelmelidir.
 */
export function baglamUret(userId: string, tenantId: string): TenantContext | null {
  const uyelik = db
    .select({ rol: memberships.rol })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)))
    .get();
  return uyelik ? _baglamDamgala({ tenantId, userId, rol: uyelik.rol }) : null;
}

const TR_HARF: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };

export function slugUret(ad: string) {
  const temel = ad
    .replace(/[çğıİöşü]/gi, (h) => TR_HARF[h] ?? TR_HARF[h.toLowerCase()] ?? h)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return temel || "calisma-alani";
}

/** Kullanıcı için yeni çalışma alanı açar ve onu yönetici yapar. */
export function calismaAlaniKur(userId: string, ad: string): TenantContext {
  return db.transaction((tx) => {
    const temel = slugUret(ad);
    let slug = temel;
    for (let i = 2; tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).get(); i++) {
      slug = `${temel}-${i}`;
    }
    const tenantId = crypto.randomUUID();
    tx.insert(tenants).values({ id: tenantId, ad: ad.trim(), slug }).run();
    tx.insert(memberships).values({ userId, tenantId, rol: "yonetici" }).run();
    return _baglamDamgala({ tenantId, userId, rol: "yonetici" });
  });
}

export function davetBilgisi(token: string) {
  return (
    db
      .select({
        eposta: invitations.eposta,
        rol: invitations.rol,
        tenantAd: tenants.ad,
        sonGecerlilik: invitations.sonGecerlilik,
        kabulTarihi: invitations.kabulTarihi,
      })
      .from(invitations)
      .innerJoin(tenants, eq(tenants.id, invitations.tenantId))
      .where(eq(invitations.token, token))
      .get() ?? null
  );
}

export type DavetSonucu = { durum: "kabul"; tenantId: string } | { durum: "gecersiz" | "eposta-uyusmuyor" };

/** Daveti kabul eder: davet geçerli olmalı ve oturumdaki e-posta davet e-postasıyla eşleşmeli. */
export function davetKabulEt(token: string, userId: string): DavetSonucu {
  return db.transaction((tx) => {
    const davet = tx
      .select()
      .from(invitations)
      .where(
        and(eq(invitations.token, token), isNull(invitations.kabulTarihi), gt(invitations.sonGecerlilik, new Date())),
      )
      .get();
    if (!davet) return { durum: "gecersiz" };
    const kullanici = tx.select({ email: user.email }).from(user).where(eq(user.id, userId)).get();
    if (!kullanici || kullanici.email.toLowerCase() !== davet.eposta) return { durum: "eposta-uyusmuyor" };

    tx.insert(memberships)
      .values({ userId, tenantId: davet.tenantId, rol: davet.rol })
      .onConflictDoNothing()
      .run();
    tx.update(invitations).set({ kabulTarihi: new Date() }).where(eq(invitations.id, davet.id)).run();
    return { durum: "kabul", tenantId: davet.tenantId };
  });
}
