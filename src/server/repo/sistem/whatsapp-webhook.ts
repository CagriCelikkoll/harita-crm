// WhatsApp webhook'u (oturumsuz): URL'deki kimlikten çalışma alanı ve doğrulama işaretleri. Çağıran, verify token'ı
// ya da imzayı DOĞRULADIKTAN sonra işaretler. Bağlamın userId'si "" (olaylar sistem olayı olarak yazılır).
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { whatsappBaglantilari, type WhatsappBaglantisi } from "../../db/schema";
import { _baglamDamgala, type TenantContext } from "../baglam";

/** Numara sahipliği doğrulanmamış bağlantı "bağlı" sayılmaz: webhook'u bulunmaz (404). */
export function webhookBaglantisi(webhookKimligi: string): { ctx: TenantContext; baglanti: WhatsappBaglantisi } | null {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(webhookKimligi)) return null;
  const baglanti = db
    .select()
    .from(whatsappBaglantilari)
    .where(and(eq(whatsappBaglantilari.webhookKimligi, webhookKimligi), isNotNull(whatsappBaglantilari.numaraDogrulamaTarihi)))
    .get();
  return baglanti ? { baglanti, ctx: _baglamDamgala({ tenantId: baglanti.tenantId, userId: "", rol: "uye" }) } : null;
}

/** Meta webhook GET doğrulaması başarılı (verify token eşleşti). */
export function webhookDogrulandiIsaretle(tenantId: string, simdi = new Date()) {
  db.update(whatsappBaglantilari).set({ webhookDogrulamaTarihi: simdi }).where(eq(whatsappBaglantilari.tenantId, tenantId)).run();
}

/**
 * Bizim gönderdiğimiz bir iletinin imzası doğrulanmış durum bildirimi alındı: test modu kilidinin ikinci koşulu.
 * Koşullu: bağlantının numarası hâlâ bu (arada numara değiştiyse eski numaranın bildirimi işaretlemez).
 */
export function imzaliDurumAlindiIsaretle(tenantId: string, phoneNumberId: string, simdi = new Date()) {
  db.update(whatsappBaglantilari)
    .set({ sonImzaliDurumTarihi: simdi })
    .where(and(eq(whatsappBaglantilari.tenantId, tenantId), eq(whatsappBaglantilari.phoneNumberId, phoneNumberId)))
    .run();
}

/**
 * Bir webhook bildiriminin tüm işlenmesi tek transaction'da: bir değişiklik hata verirse hiçbir şey (gelen ileti
 * kimliği dahil) kalıcı olmaz, Meta'nın tekrar denemesi bildirimi baştan işler. İç fonksiyonların kendi
 * transaction'ları savepoint olur (better-sqlite3).
 */
export function webhookIslemi<T>(fn: () => T): T {
  return db.transaction(() => fn());
}
