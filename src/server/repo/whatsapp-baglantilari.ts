// WhatsApp Cloud API bağlantıları: çalışma alanı başına birden çok numara (en fazla BAGLANTI_AZAMI). Bağlantıyı yalnızca
// yönetici değiştirir. Her fonksiyon kiracıya (ctx.tenantId) VE bağlantı kimliğine göre süzer: başka çalışma alanının
// bağlantı kimliği hiçbir satırı etkilemez.
// Şifreli alanı yalnızca servis katmanı çözer; bu modül şifreli metni olduğu gibi saklar.
// Hesap düzeyi bilgiler WABA'ya aittir: Meta hesap kilidi aynı WABA'daki tüm numaralara yazılır ve onlardan kalkar;
// limit katmanı (portföy) bildirimi de WABA ile eşleşen numaralara yazılır.
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, isNotNull, max } from "drizzle-orm";
import { BAGLANTI_AZAMI, VARSAYILAN_UYGULAMA_PAYI } from "@/lib/whatsapp-api";
import { db } from "../db";
import { whatsappBaglantilari, type WhatsappBaglantisi } from "../db/schema";
import { KayitKuraliHatasi, yoneticiOlmali, type TenantContext } from "./baglam";

export type { WhatsappBaglantisi };

const bu = (ctx: TenantContext, id: string) => and(eq(whatsappBaglantilari.tenantId, ctx.tenantId), eq(whatsappBaglantilari.id, id));

/** Çalışma alanının bütün numaraları, ekrandaki sırayla. */
export function baglantilariListele(ctx: TenantContext): WhatsappBaglantisi[] {
  return db
    .select()
    .from(whatsappBaglantilari)
    .where(eq(whatsappBaglantilari.tenantId, ctx.tenantId))
    .orderBy(asc(whatsappBaglantilari.sira), asc(whatsappBaglantilari.ad))
    .all();
}

export function baglantiGetir(ctx: TenantContext, id: string): WhatsappBaglantisi | null {
  return db.select().from(whatsappBaglantilari).where(bu(ctx, id)).get() ?? null;
}

/**
 * Webhook değişiklikleri, numara bilgilerini ve Meta hesap kilidini sıfırlar; numara/WABA değişince test modu yeniden
 * açılır (yeni numara hâlâ kilitliyse ilk gönderimde kilit yeniden yazılır).
 */
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
  hesapKilidiKodu: null,
  hesapKilidiTarihi: null,
  sablonSenkronTarihi: null,
} as const;

/** Numara adı: boş olamaz, 40 karakter; çalışma alanında benzersizliği veritabanı denetler. */
export function numaraAdiDuzelt(ad: string): string {
  const a = ad.trim().replace(/\s+/g, " ");
  if (!a) throw new KayitKuraliHatasi("Numaraya bir ad verin (ör. Merkez).", 400);
  if (a.length > 40) throw new KayitKuraliHatasi("Numara adı en fazla 40 karakter olabilir.", 400);
  return a;
}

const adCakismasiMi = (hata: unknown) => /UNIQUE.*whatsapp_baglantilari\.(tenant_id, whatsapp_baglantilari\.)?ad/.test((hata as Error).message);
const AD_CAKISMASI = "Bu adla bir numara zaten var; başka bir ad seçin.";

/**
 * Yeni numara ekler. Numara (phone_number_id) başka bir çalışma alanına ya da bu alanda başka satıra bağlıysa
 * veritabanı tekillik kuralı reddeder (çağıran yakalar). numaraDogrulamaTarihi: çağıran, numaranın WABA'ya ait
 * olduğunu kiracının kendi anahtarıyla Graph API'den doğruladıktan sonra verir.
 */
export function baglantiEkle(
  ctx: TenantContext,
  g: { ad: string; wabaId: string; phoneNumberId: string; sifreliVeri: string; numaraDogrulamaTarihi: Date },
): WhatsappBaglantisi {
  yoneticiOlmali(ctx);
  const ad = numaraAdiDuzelt(g.ad);
  return db.transaction((tx) => {
    const n = tx.select({ n: count(), s: max(whatsappBaglantilari.sira) }).from(whatsappBaglantilari).where(eq(whatsappBaglantilari.tenantId, ctx.tenantId)).get();
    if ((n?.n ?? 0) >= BAGLANTI_AZAMI) throw new KayitKuraliHatasi(`Bir çalışma alanına en fazla ${BAGLANTI_AZAMI} numara bağlanabilir.`, 400);
    try {
      return tx
        .insert(whatsappBaglantilari)
        .values({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          ad,
          sira: (n?.s ?? -1) + 1,
          webhookKimligi: randomBytes(24).toString("base64url"),
          wabaId: g.wabaId,
          phoneNumberId: g.phoneNumberId,
          sifreliVeri: g.sifreliVeri,
          numaraDogrulamaTarihi: g.numaraDogrulamaTarihi,
          uygulamaPayi: VARSAYILAN_UYGULAMA_PAYI,
          guncelleyen: ctx.userId,
          guncellemeTarihi: new Date(),
        })
        .returning()
        .get();
    } catch (hata) {
      if (adCakismasiMi(hata)) throw new KayitKuraliHatasi(AD_CAKISMASI, 400);
      throw hata;
    }
  });
}

/** Mevcut numaranın kimliklerini / gizli bilgilerini günceller; numara ya da WABA değiştiyse durum sıfırlanır. */
export function baglantiGuncelle(
  ctx: TenantContext,
  id: string,
  g: { wabaId: string; phoneNumberId: string; sifreliVeri: string; numaraDogrulamaTarihi: Date },
): WhatsappBaglantisi | null {
  yoneticiOlmali(ctx);
  return db.transaction((tx) => {
    const eski = tx.select().from(whatsappBaglantilari).where(bu(ctx, id)).get();
    if (!eski) return null;
    const numaraDegisti = eski.wabaId !== g.wabaId || eski.phoneNumberId !== g.phoneNumberId;
    return (
      tx
        .update(whatsappBaglantilari)
        .set({
          wabaId: g.wabaId,
          phoneNumberId: g.phoneNumberId,
          sifreliVeri: g.sifreliVeri,
          ...(numaraDegisti ? SIFIRLANAN : {}),
          numaraDogrulamaTarihi: g.numaraDogrulamaTarihi,
          guncelleyen: ctx.userId,
          guncellemeTarihi: new Date(),
        })
        .where(bu(ctx, id))
        .returning()
        .get() ?? null
    );
  });
}

/** Numaranın ekrandaki adını değiştirir. */
export function baglantiAdiYaz(ctx: TenantContext, id: string, ad: string): boolean {
  yoneticiOlmali(ctx);
  const temiz = numaraAdiDuzelt(ad);
  try {
    return Boolean(
      db
        .update(whatsappBaglantilari)
        .set({ ad: temiz, guncelleyen: ctx.userId, guncellemeTarihi: new Date() })
        .where(bu(ctx, id))
        .returning({ id: whatsappBaglantilari.id })
        .get(),
    );
  } catch (hata) {
    if (adCakismasiMi(hata)) throw new KayitKuraliHatasi(AD_CAKISMASI, 400);
    throw hata;
  }
}

/**
 * Yalnızca şifreli alanı değiştirir (test numaraları, verify token). webhookSifirla: yeni verify token sonrası
 * webhook yeniden doğrulanmalı; test modu da yeniden açılır.
 */
export function baglantiSifreliVeriYaz(ctx: TenantContext, id: string, sifreliVeri: string, webhookSifirla = false): boolean {
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
      .where(bu(ctx, id))
      .returning({ id: whatsappBaglantilari.id })
      .get(),
  );
}

export type TestModuSonucu = { tamam: true } | { tamam: false; neden: "baglanti_yok" | "webhook_dogrulanmadi" | "durum_alinmadi" };

/**
 * Bu numaranın test modunu açar/kapatır. Kapatma atomik koşulludur: BU numaranın webhook GET doğrulaması yapılmış VE
 * BU numaradan gönderilmiş bir iletinin imzası doğrulanmış durum (statuses) bildirimi alınmış olmalı.
 */
export function testModuAyarla(ctx: TenantContext, id: string, acik: boolean): TestModuSonucu {
  yoneticiOlmali(ctx);
  const kosullar = [bu(ctx, id)];
  if (!acik) {
    kosullar.push(isNotNull(whatsappBaglantilari.webhookDogrulamaTarihi), isNotNull(whatsappBaglantilari.sonImzaliDurumTarihi));
  }
  const guncellenen = db
    .update(whatsappBaglantilari)
    .set({ testModu: acik, guncelleyen: ctx.userId, guncellemeTarihi: new Date() })
    .where(and(...kosullar))
    .returning({ id: whatsappBaglantilari.id })
    .get();
  if (guncellenen) return { tamam: true };
  const b = baglantiGetir(ctx, id);
  if (!b) return { tamam: false, neden: "baglanti_yok" };
  return { tamam: false, neden: b.webhookDogrulamaTarihi ? "durum_alinmadi" : "webhook_dogrulanmadi" };
}

export function uygulamaPayiAyarla(ctx: TenantContext, id: string, yuzde: number): boolean {
  yoneticiOlmali(ctx);
  return Boolean(
    db
      .update(whatsappBaglantilari)
      .set({ uygulamaPayi: yuzde, guncelleyen: ctx.userId, guncellemeTarihi: new Date() })
      .where(bu(ctx, id))
      .returning({ id: whatsappBaglantilari.id })
      .get(),
  );
}

/** Bağlantı testinin (Graph API) sonucu; işçi de kaliteyi yenilerken kullanır. */
export function numaraBilgisiYaz(
  ctx: TenantContext,
  id: string,
  b: Partial<Pick<WhatsappBaglantisi, "gorunenNumara" | "dogrulanmisAd" | "kalite" | "limitKatmani" | "metaDurumu">> & {
    sonHata: string | null;
  },
  simdi = new Date(),
): boolean {
  return Boolean(
    db
      .update(whatsappBaglantilari)
      .set({ ...b, sonKontrol: simdi })
      .where(bu(ctx, id))
      .returning({ id: whatsappBaglantilari.id })
      .get(),
  );
}

/**
 * Yalnızca "Son hata" satırını yazar (gönderimde Meta'nın numara düzeyi hatası). sonKontrol'e dokunmaz: kalite bilgisi
 * taze sayılmasın, işçi bir sonraki gönderimde numarayı yeniden test etsin.
 */
export function sonHataYaz(ctx: TenantContext, id: string, sonHata: string): boolean {
  return Boolean(
    db.update(whatsappBaglantilari).set({ sonHata }).where(bu(ctx, id)).returning({ id: whatsappBaglantilari.id }).get(),
  );
}

/**
 * Bağlantı testinde numara sahipliği yeniden denetlendi: doğrulandıysa tarih, değilse null (bağlantı kullanılmaz).
 * Koşullu: test sırasında numara değiştiyse yazılmaz.
 */
export function numaraDogrulamaYaz(ctx: TenantContext, id: string, phoneNumberId: string, tarih: Date | null): boolean {
  return Boolean(
    db
      .update(whatsappBaglantilari)
      .set({ numaraDogrulamaTarihi: tarih })
      .where(and(bu(ctx, id), eq(whatsappBaglantilari.phoneNumberId, phoneNumberId)))
      .returning({ id: whatsappBaglantilari.id })
      .get(),
  );
}

export function baglantiSil(ctx: TenantContext, id: string): boolean {
  yoneticiOlmali(ctx);
  return Boolean(db.delete(whatsappBaglantilari).where(bu(ctx, id)).returning({ id: whatsappBaglantilari.id }).get());
}

/** Bu numarayla AYNI WABA'daki numaraların kimlikleri (kendisi dahil). Numara yoksa boş. */
export function ayniWabaBaglantilari(ctx: TenantContext, id: string): string[] {
  const b = baglantiGetir(ctx, id);
  if (!b) return [];
  return db
    .select({ id: whatsappBaglantilari.id })
    .from(whatsappBaglantilari)
    .where(and(eq(whatsappBaglantilari.tenantId, ctx.tenantId), eq(whatsappBaglantilari.wabaId, b.wabaId)))
    .all()
    .map((r) => r.id);
}

/**
 * Meta hesap düzeyi hatası (131031, 368, 131042) geldi: hesap (WABA) kilitlenir, yani bu numarayla aynı WABA'daki tüm
 * numaralar kilitli olur. Kilit zaten varsa ilk tarih korunur, kod güncellenir. Kilitlenen numaraların kimliklerini
 * döndürür (kampanyaları duraklatılır). İşçi ve webhook (oturumsuz) çağırır.
 */
export function hesapKilidiYaz(ctx: TenantContext, id: string, kod: number, simdi = new Date()): string[] {
  const idler = ayniWabaBaglantilari(ctx, id);
  for (const bid of idler) {
    const b = baglantiGetir(ctx, bid)!;
    db.update(whatsappBaglantilari)
      .set({ hesapKilidiKodu: kod, hesapKilidiTarihi: b.hesapKilidiTarihi ?? simdi })
      .where(bu(ctx, bid))
      .run();
  }
  return idler;
}

/** Kilidi kaldırır (aynı WABA'daki tüm numaralardan): yalnızca bağlantı testi Meta'dan gönderime açık durumu okuyunca. */
export function hesapKilidiKaldir(ctx: TenantContext, id: string): boolean {
  const idler = ayniWabaBaglantilari(ctx, id);
  for (const bid of idler) {
    db.update(whatsappBaglantilari).set({ hesapKilidiKodu: null, hesapKilidiTarihi: null }).where(bu(ctx, bid)).run();
  }
  return idler.length > 0;
}

/**
 * Limit değişikliği bildirimi (webhook, WABA düzeyi): bu WABA'daki numaralara katman yazılır, kalite bir sonraki
 * gönderimden önce Meta'dan yeniden okunur.
 */
export function limitKatmaniYaz(ctx: TenantContext, wabaId: string, katman: string): number {
  return db
    .update(whatsappBaglantilari)
    .set({ limitKatmani: katman, sonKontrol: null })
    .where(and(eq(whatsappBaglantilari.tenantId, ctx.tenantId), eq(whatsappBaglantilari.wabaId, wabaId)))
    .returning({ id: whatsappBaglantilari.id })
    .all().length;
}
