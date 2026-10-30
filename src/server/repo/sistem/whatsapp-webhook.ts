// WhatsApp webhook'u (oturumsuz): URL'deki kimlikten çalışma alanı ve doğrulama işaretleri. Çağıran, verify token'ı
// ya da imzayı DOĞRULADIKTAN sonra işaretler. Bağlamın userId'si "" (olaylar sistem olayı olarak yazılır).
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { whatsappBaglantilari, type WhatsappBaglantisi } from "../../db/schema";
import { _baglamDamgala, type TenantContext } from "../baglam";

export function webhookBaglantisi(webhookKimligi: string): { ctx: TenantContext; baglanti: WhatsappBaglantisi } | null {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(webhookKimligi)) return null;
  const baglanti = db.select().from(whatsappBaglantilari).where(eq(whatsappBaglantilari.webhookKimligi, webhookKimligi)).get();
  return baglanti ? { baglanti, ctx: _baglamDamgala({ tenantId: baglanti.tenantId, userId: "", rol: "uye" }) } : null;
}

/** Meta webhook GET doğrulaması başarılı (verify token eşleşti). */
export function webhookDogrulandiIsaretle(tenantId: string, simdi = new Date()) {
  db.update(whatsappBaglantilari).set({ webhookDogrulamaTarihi: simdi }).where(eq(whatsappBaglantilari.tenantId, tenantId)).run();
}

/** İmzası doğrulanmış bir mesaj durumu (statuses) bildirimi alındı: test modu kilidinin ikinci koşulu. */
export function imzaliDurumAlindiIsaretle(tenantId: string, simdi = new Date()) {
  db.update(whatsappBaglantilari).set({ sonImzaliDurumTarihi: simdi }).where(eq(whatsappBaglantilari.tenantId, tenantId)).run();
}
