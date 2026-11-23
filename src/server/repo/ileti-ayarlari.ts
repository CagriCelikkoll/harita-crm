// Çalışma alanının ticari ileti bilgileri ve gönderim kuralları (ileti_ayarlari, kiracı başına tek satır).
import { eq } from "drizzle-orm";
import { VARSAYILAN_MEDYA_SAKLAMA_GUN, VARSAYILAN_MESAJ_SAKLAMA_GUN } from "@/lib/gelen-kutusu";
import {
  DENETIM_IYS_KONTROLU,
  IYS_KAPATMA_ONAY_METNI,
  VARSAYILAN_GONDERIM_BASLANGIC_DK,
  VARSAYILAN_GONDERIM_BITIS_DK,
} from "@/lib/mesajlasma";
import { db } from "../db";
import { denetimKayitlari, iletiAyarlari, user, type IletiAyarlari } from "../db/schema";
import { yoneticiOlmali, type TenantContext } from "./baglam";

export type { IletiAyarlari };

const varsayilan = (tenantId: string): IletiAyarlari => ({
  tenantId,
  gonderenUnvani: null,
  iletisimBilgisi: null,
  iysNo: null,
  sorumlulukOnayTarihi: null,
  sorumlulukOnaylayan: null,
  gonderimBaslangicDk: VARSAYILAN_GONDERIM_BASLANGIC_DK,
  gonderimBitisDk: VARSAYILAN_GONDERIM_BITIS_DK,
  gunlukEpostaSiniri: null,
  gunlukSmsSiniri: null,
  gunlukWhatsappApiSiniri: null,
  smsRetNumarasi: null,
  yetkiliTelefonu: null,
  whatsappSablonu: null,
  whatsappGunlukSinir: null,
  mesajSaklamaGun: VARSAYILAN_MESAJ_SAKLAMA_GUN,
  medyaSaklamaGun: VARSAYILAN_MEDYA_SAKLAMA_GUN,
  okunduBildirimi: true,
  iysKontrolu: true,
  guncellemeTarihi: new Date(0),
});

/** Satır yoksa varsayılanlar döner (yazmaz). */
export function iletiAyarlariGetir(ctx: TenantContext): IletiAyarlari {
  return (
    db.select().from(iletiAyarlari).where(eq(iletiAyarlari.tenantId, ctx.tenantId)).get() ?? varsayilan(ctx.tenantId)
  );
}

export type IletiAyarDegisikligi = Partial<{
  gonderenUnvani: string | null;
  iletisimBilgisi: string | null;
  iysNo: string | null;
  smsRetNumarasi: string | null;
  yetkiliTelefonu: string | null;
  whatsappSablonu: string | null;
  /** Kullanıcı başına günlük WhatsApp sınırı (1–50); null = varsayılan. */
  whatsappGunlukSinir: number | null;
  /** true: sorumluluk onayı verilir (zaman ve onaylayan kaydedilir); false: geri alınır. */
  sorumlulukOnayi: boolean;
  gonderimBaslangicDk: number;
  gonderimBitisDk: number;
  /** Gelen kutusu: yazışma metni ve medya saklama süresi (gün); sohbet açılınca okundu bildirimi. */
  mesajSaklamaGun: number;
  medyaSaklamaGun: number;
  okunduBildirimi: boolean;
}>;

/** Yalnızca yönetici. Onay zaten verilmişse ilk onay zamanı ve onaylayan korunur. */
export function iletiAyarlariGuncelle(ctx: TenantContext, d: IletiAyarDegisikligi): IletiAyarlari {
  yoneticiOlmali(ctx);
  const { sorumlulukOnayi, ...alanlar } = d;
  const mevcut = iletiAyarlariGetir(ctx);
  const onay =
    sorumlulukOnayi === undefined
      ? {}
      : sorumlulukOnayi
        ? mevcut.sorumlulukOnayTarihi
          ? {}
          : { sorumlulukOnayTarihi: new Date(), sorumlulukOnaylayan: ctx.userId }
        : { sorumlulukOnayTarihi: null, sorumlulukOnaylayan: null };
  const degerler = { ...alanlar, ...onay, guncellemeTarihi: new Date() };
  return db
    .insert(iletiAyarlari)
    .values({ ...varsayilan(ctx.tenantId), ...degerler, tenantId: ctx.tenantId })
    .onConflictDoUpdate({ target: iletiAyarlari.tenantId, set: degerler })
    .returning()
    .get();
}

/**
 * İYS kontrolünü açar / kapatır (yalnızca yönetici). Kapatmak, IYS_KAPATMA_ONAY_METNI'nin onayını ister (onay: true).
 * Değer gerçekten değiştiyse ayar ve denetim kaydı (kim, ne zaman, ne yaptı) tek işlemde yazılır; değişmediyse hiçbir
 * şey yazılmaz. Değişti mi döner.
 */
export function iysKontroluDegistir(ctx: TenantContext, g: { acik: boolean; onay?: boolean }, simdi = new Date()): boolean {
  yoneticiOlmali(ctx);
  if (!g.acik && g.onay !== true) throw new Error("İYS kontrolünü kapatmak için sorumluluk beyanı onaylanmalı.");
  return db.transaction((tx) => {
    const mevcut = tx.select({ iysKontrolu: iletiAyarlari.iysKontrolu }).from(iletiAyarlari).where(eq(iletiAyarlari.tenantId, ctx.tenantId)).get();
    if ((mevcut?.iysKontrolu ?? true) === g.acik) return false;
    tx.insert(iletiAyarlari)
      .values({ ...varsayilan(ctx.tenantId), iysKontrolu: g.acik, guncellemeTarihi: simdi, tenantId: ctx.tenantId })
      .onConflictDoUpdate({ target: iletiAyarlari.tenantId, set: { iysKontrolu: g.acik, guncellemeTarihi: simdi } })
      .run();
    const ad = tx.select({ ad: user.name }).from(user).where(eq(user.id, ctx.userId)).get()?.ad ?? null;
    tx.insert(denetimKayitlari)
      .values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        kullaniciId: ctx.userId || null,
        kullaniciAdi: ad,
        olay: DENETIM_IYS_KONTROLU,
        deger: g.acik ? "acik" : "kapali",
        aciklama: g.acik ? "İYS kontrolü açıldı." : `İYS kontrolü kapatıldı. Onaylanan beyan: "${IYS_KAPATMA_ONAY_METNI}"`,
        tarih: simdi,
      })
      .run();
    return true;
  });
}
