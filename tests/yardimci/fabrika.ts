import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { baglamUret, calismaAlaniKur } from "@/server/repo/sistem/uyelik";

/** Better Auth'u devreye sokmadan test kullanıcısı oluşturur. */
export function kullaniciOlustur(ad: string) {
  const id = crypto.randomUUID();
  db.insert(user)
    .values({ id, name: ad, email: `${ad.toLowerCase()}-${id.slice(0, 6)}@ornek.test`, emailVerified: true })
    .run();
  return db.select().from(user).all().find((u) => u.id === id)!;
}

/** Yeni kullanıcı + kendi çalışma alanı (yönetici). */
export function kiraciOlustur(ad: string) {
  const kullanici = kullaniciOlustur(ad);
  const ctx = calismaAlaniKur(kullanici.id, `${ad} Çalışma Alanı`);
  return { kullanici, ctx: baglamUret(kullanici.id, ctx.tenantId)! };
}
