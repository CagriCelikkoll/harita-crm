// Gelen kutusu bildirimi abonelikleri: oturumdaki kullanıcının kendi cihazları. Her kullanıcı yalnızca kendi
// aboneliğini ekler, görür ve siler (rolden bağımsız). Her sorgu bağlamın çalışma alanıyla sınırlıdır.
// Gönderim (alıcı seçimi, sonuç işleme) işçide: repo/sistem/bildirim.ts.
import { and, desc, eq } from "drizzle-orm";
import type { PushAboneligiGirdisi } from "@/lib/bildirim";
import { db } from "../db";
import { pushAbonelikleri } from "../db/schema";
import { KayitKuraliHatasi, type TenantContext } from "./baglam";

/** Ayarlar'daki cihaz listesi (anahtarlar ve adres dışarı verilmez). */
export type PushCihazi = { id: string; cihaz: string | null; olusturmaTarihi: Date; sonBasariTarihi: Date | null };

const kullaniciGerekli = (ctx: TenantContext) => {
  if (!ctx.userId) throw new KayitKuraliHatasi("Bildirim aboneliği için oturum gerekir.", 400);
};

/**
 * Bu cihazın aboneliğini kaydeder ya da yeniler. Aynı adres bu çalışma alanında başka kullanıcıya kayıtlıysa (aynı
 * tarayıcıda başka biri oturum açmış) abonelik oturumdaki kullanıcıya geçer: bildirim yalnızca o cihazdaki kişiye gider.
 */
export function pushAboneligiKaydet(ctx: TenantContext, g: PushAboneligiGirdisi, cihaz: string | null): PushCihazi {
  kullaniciGerekli(ctx);
  const simdi = new Date();
  const alanlar = { userId: ctx.userId, p256dh: g.keys.p256dh, auth: g.keys.auth, cihaz: cihaz?.slice(0, 120) ?? null };
  const s = db
    .insert(pushAbonelikleri)
    .values({ id: crypto.randomUUID(), tenantId: ctx.tenantId, endpoint: g.endpoint, ...alanlar, olusturmaTarihi: simdi, sonKayitTarihi: simdi })
    .onConflictDoUpdate({
      target: [pushAbonelikleri.tenantId, pushAbonelikleri.endpoint],
      set: { ...alanlar, sonKayitTarihi: simdi, ardisikHata: 0 },
    })
    .returning()
    .get();
  return { id: s.id, cihaz: s.cihaz, olusturmaTarihi: s.olusturmaTarihi, sonBasariTarihi: s.sonBasariTarihi };
}

/** Oturumdaki kullanıcının bu adresteki aboneliğini siler (bildirimi kapatma, çıkış). Silindiyse true. */
export function pushAboneligiSil(ctx: TenantContext, endpoint: string): boolean {
  if (!ctx.userId) return false;
  return (
    db
      .delete(pushAbonelikleri)
      .where(and(eq(pushAbonelikleri.tenantId, ctx.tenantId), eq(pushAbonelikleri.userId, ctx.userId), eq(pushAbonelikleri.endpoint, endpoint)))
      .run().changes > 0
  );
}

/** Oturumdaki kullanıcının bildirim alan cihazları (yeniden eskiye). */
export function pushCihazlariListele(ctx: TenantContext): PushCihazi[] {
  if (!ctx.userId) return [];
  return db
    .select({
      id: pushAbonelikleri.id,
      cihaz: pushAbonelikleri.cihaz,
      olusturmaTarihi: pushAbonelikleri.olusturmaTarihi,
      sonBasariTarihi: pushAbonelikleri.sonBasariTarihi,
    })
    .from(pushAbonelikleri)
    .where(and(eq(pushAbonelikleri.tenantId, ctx.tenantId), eq(pushAbonelikleri.userId, ctx.userId)))
    .orderBy(desc(pushAbonelikleri.sonKayitTarihi))
    .all();
}

/** Oturumdaki kullanıcının bir cihazını listeden kaldırır (ör. kaybolan telefon). Silindiyse true. */
export function pushCihaziKaldir(ctx: TenantContext, id: string): boolean {
  if (!ctx.userId) return false;
  return (
    db
      .delete(pushAbonelikleri)
      .where(and(eq(pushAbonelikleri.tenantId, ctx.tenantId), eq(pushAbonelikleri.userId, ctx.userId), eq(pushAbonelikleri.id, id)))
      .run().changes > 0
  );
}
