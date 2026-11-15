// WhatsApp webhook'u (oturumsuz): URL'deki kimlikten çalışma alanı ve numara, doğrulama işaretleri. Çağıran, verify
// token'ı ya da imzayı DOĞRULADIKTAN sonra işaretler. Bağlamın userId'si "" (olaylar sistem olayı olarak yazılır).
// Meta'da callback adresi uygulama düzeyindedir: aynı uygulamaya bağlı birden çok numaranın bildirimleri tek adrese
// gelebilir. Bu yüzden servis, her değişikliği aynı çalışma alanının numaralarından (webhookNumaralari) yönlendirir.
import { and, eq, isNotNull, isNull } from "drizzle-orm";
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

/** Aynı çalışma alanının numara sahipliği doğrulanmış bütün numaraları (webhook yönlendirmesi için). */
export function webhookNumaralari(ctx: TenantContext): WhatsappBaglantisi[] {
  return db
    .select()
    .from(whatsappBaglantilari)
    .where(and(eq(whatsappBaglantilari.tenantId, ctx.tenantId), isNotNull(whatsappBaglantilari.numaraDogrulamaTarihi)))
    .all();
}

/** Meta webhook GET doğrulaması başarılı (verify token eşleşti): yalnızca bu numara. */
export function webhookDogrulandiIsaretle(baglantiId: string, simdi = new Date()) {
  db.update(whatsappBaglantilari).set({ webhookDogrulamaTarihi: simdi }).where(eq(whatsappBaglantilari.id, baglantiId)).run();
}

/**
 * Ortak adres: bu numaranın imzası (kendi App Secret'ıyla aynı) doğrulanmış teslim bildirimi başka bir numaranın
 * adresine geldi. Meta'nın GET doğrulaması yalnızca uygulamanın tek adresine yapıldığından, numaranın "bildirim adresi
 * doğrulandı" adımı bununla tamamlanır. Zaten doğrulanmışsa tarih değişmez.
 */
export function webhookOrtakAdresleDogrulandi(baglantiId: string, simdi = new Date()) {
  db.update(whatsappBaglantilari)
    .set({ webhookDogrulamaTarihi: simdi })
    .where(and(eq(whatsappBaglantilari.id, baglantiId), isNull(whatsappBaglantilari.webhookDogrulamaTarihi)))
    .run();
}

/**
 * Bizim gönderdiğimiz bir iletinin imzası doğrulanmış durum bildirimi alındı: test modu kilidinin ikinci koşulu.
 * Yalnızca iletiyi gönderen numara işaretlenir; koşullu: numara hâlâ bu (arada değiştiyse eski numaranın bildirimi
 * işaretlemez).
 */
export function imzaliDurumAlindiIsaretle(baglantiId: string, phoneNumberId: string, simdi = new Date()) {
  db.update(whatsappBaglantilari)
    .set({ sonImzaliDurumTarihi: simdi })
    .where(and(eq(whatsappBaglantilari.id, baglantiId), eq(whatsappBaglantilari.phoneNumberId, phoneNumberId)))
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
