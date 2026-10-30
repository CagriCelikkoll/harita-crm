// WhatsApp Cloud API bağlantısı (çalışma alanı başına bir). Bağlantıyı yalnızca yönetici değiştirir.
// Şifreli alanı yalnızca servis katmanı çözer; bu modül şifreli metni olduğu gibi saklar.
import { randomBytes } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { VARSAYILAN_UYGULAMA_PAYI } from "@/lib/whatsapp-api";
import { db } from "../db";
import { whatsappBaglantilari, type WhatsappBaglantisi } from "../db/schema";
import { yoneticiOlmali, type TenantContext } from "./baglam";

export type { WhatsappBaglantisi };

export function baglantiGetir(ctx: TenantContext): WhatsappBaglantisi | null {
  return db.select().from(whatsappBaglantilari).where(eq(whatsappBaglantilari.tenantId, ctx.tenantId)).get() ?? null;
}

/** Webhook doğrulaması ve numara bilgileri; numara/WABA değişince sıfırlanır ve test modu yeniden açılır. */
const SIFIRLANAN = {
  testModu: true,
  webhookDogrulamaTarihi: null,
  sonImzaliDurumTarihi: null,
  gorunenNumara: null,
  dogrulanmisAd: null,
  kalite: null,
  limitKatmani: null,
  sonKontrol: null,
  sonHata: null,
} as const;

/**
 * Bağlantıyı oluşturur ya da günceller. Numara (phone_number_id) başka bir çalışma alanına bağlıysa
 * veritabanı tekillik kuralı reddeder (çağıran yakalar). numaraDogrulamaTarihi: çağıran, numaranın WABA'ya ait
 * olduğunu kiracının kendi anahtarıyla Graph API'den doğruladıktan sonra verir.
 */
export function baglantiKaydet(
  ctx: TenantContext,
  g: { wabaId: string; phoneNumberId: string; sifreliVeri: string; numaraDogrulamaTarihi: Date },
): WhatsappBaglantisi {
  yoneticiOlmali(ctx);
  return db.transaction((tx) => {
    const eski = tx.select().from(whatsappBaglantilari).where(eq(whatsappBaglantilari.tenantId, ctx.tenantId)).get();
    const simdi = new Date();
    if (!eski) {
      return tx
        .insert(whatsappBaglantilari)
        .values({
          tenantId: ctx.tenantId,
          webhookKimligi: randomBytes(24).toString("base64url"),
          wabaId: g.wabaId,
          phoneNumberId: g.phoneNumberId,
          sifreliVeri: g.sifreliVeri,
          numaraDogrulamaTarihi: g.numaraDogrulamaTarihi,
          uygulamaPayi: VARSAYILAN_UYGULAMA_PAYI,
          guncelleyen: ctx.userId,
          guncellemeTarihi: simdi,
        })
        .returning()
        .get();
    }
    const numaraDegisti = eski.wabaId !== g.wabaId || eski.phoneNumberId !== g.phoneNumberId;
    return tx
      .update(whatsappBaglantilari)
      .set({
        wabaId: g.wabaId,
        phoneNumberId: g.phoneNumberId,
        sifreliVeri: g.sifreliVeri,
        ...(numaraDegisti ? SIFIRLANAN : {}),
        numaraDogrulamaTarihi: g.numaraDogrulamaTarihi,
        guncelleyen: ctx.userId,
        guncellemeTarihi: simdi,
      })
      .where(eq(whatsappBaglantilari.tenantId, ctx.tenantId))
      .returning()
      .get()!;
  });
}

/**
 * Yalnızca şifreli alanı değiştirir (test numaraları, verify token). webhookSifirla: yeni verify token sonrası
 * webhook yeniden doğrulanmalı; test modu da yeniden açılır.
 */
export function baglantiSifreliVeriYaz(ctx: TenantContext, sifreliVeri: string, webhookSifirla = false): boolean {
  yoneticiOlmali(ctx);
  return Boolean(
    db
      .update(whatsappBaglantilari)
      .set({
        sifreliVeri,
        ...(webhookSifirla ? { webhookDogrulamaTarihi: null, sonImzaliDurumTarihi: null, testModu: true } : {}),
        guncelleyen: ctx.userId,
        guncellemeTarihi: new Date(),
      })
      .where(eq(whatsappBaglantilari.tenantId, ctx.tenantId))
      .returning({ id: whatsappBaglantilari.tenantId })
      .get(),
  );
}

export type TestModuSonucu = { tamam: true } | { tamam: false; neden: "baglanti_yok" | "webhook_dogrulanmadi" | "durum_alinmadi" };

/**
 * Test modunu açar/kapatır. Kapatma atomik koşulludur: webhook GET doğrulaması yapılmış VE imzası doğrulanmış en az
 * bir durum (statuses) bildirimi alınmış olmalı.
 */
export function testModuAyarla(ctx: TenantContext, acik: boolean): TestModuSonucu {
  yoneticiOlmali(ctx);
  const kosullar = [eq(whatsappBaglantilari.tenantId, ctx.tenantId)];
  if (!acik) {
    kosullar.push(isNotNull(whatsappBaglantilari.webhookDogrulamaTarihi), isNotNull(whatsappBaglantilari.sonImzaliDurumTarihi));
  }
  const guncellenen = db
    .update(whatsappBaglantilari)
    .set({ testModu: acik, guncelleyen: ctx.userId, guncellemeTarihi: new Date() })
    .where(and(...kosullar))
    .returning({ id: whatsappBaglantilari.tenantId })
    .get();
  if (guncellenen) return { tamam: true };
  const b = baglantiGetir(ctx);
  if (!b) return { tamam: false, neden: "baglanti_yok" };
  return { tamam: false, neden: b.webhookDogrulamaTarihi ? "durum_alinmadi" : "webhook_dogrulanmadi" };
}

export function uygulamaPayiAyarla(ctx: TenantContext, yuzde: number): boolean {
  yoneticiOlmali(ctx);
  return Boolean(
    db
      .update(whatsappBaglantilari)
      .set({ uygulamaPayi: yuzde, guncelleyen: ctx.userId, guncellemeTarihi: new Date() })
      .where(eq(whatsappBaglantilari.tenantId, ctx.tenantId))
      .returning({ id: whatsappBaglantilari.tenantId })
      .get(),
  );
}

/** Bağlantı testinin (Graph API) sonucu; işçi de kaliteyi yenilerken kullanır. */
export function numaraBilgisiYaz(
  ctx: TenantContext,
  b: Partial<Pick<WhatsappBaglantisi, "gorunenNumara" | "dogrulanmisAd" | "kalite" | "limitKatmani">> & {
    sonHata: string | null;
  },
  simdi = new Date(),
): boolean {
  return Boolean(
    db
      .update(whatsappBaglantilari)
      .set({ ...b, sonKontrol: simdi })
      .where(eq(whatsappBaglantilari.tenantId, ctx.tenantId))
      .returning({ id: whatsappBaglantilari.tenantId })
      .get(),
  );
}

/**
 * Bağlantı testinde numara sahipliği yeniden denetlendi: doğrulandıysa tarih, değilse null (bağlantı kullanılmaz).
 * Koşullu: test sırasında numara değiştiyse yazılmaz.
 */
export function numaraDogrulamaYaz(ctx: TenantContext, phoneNumberId: string, tarih: Date | null): boolean {
  return Boolean(
    db
      .update(whatsappBaglantilari)
      .set({ numaraDogrulamaTarihi: tarih })
      .where(and(eq(whatsappBaglantilari.tenantId, ctx.tenantId), eq(whatsappBaglantilari.phoneNumberId, phoneNumberId)))
      .returning({ id: whatsappBaglantilari.tenantId })
      .get(),
  );
}

export function baglantiSil(ctx: TenantContext): boolean {
  yoneticiOlmali(ctx);
  return Boolean(
    db
      .delete(whatsappBaglantilari)
      .where(eq(whatsappBaglantilari.tenantId, ctx.tenantId))
      .returning({ id: whatsappBaglantilari.tenantId })
      .get(),
  );
}

/** Limit değişikliği bildirimi (webhook): katman yazılır, kalite bir sonraki gönderimden önce Meta'dan yeniden okunur. */
export function limitKatmaniYaz(ctx: TenantContext, katman: string): boolean {
  return Boolean(
    db
      .update(whatsappBaglantilari)
      .set({ limitKatmani: katman, sonKontrol: null })
      .where(eq(whatsappBaglantilari.tenantId, ctx.tenantId))
      .returning({ id: whatsappBaglantilari.tenantId })
      .get(),
  );
}
