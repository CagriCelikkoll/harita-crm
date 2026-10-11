// Çalışma alanının ticari ileti bilgileri ve gönderim kuralları (ileti_ayarlari, kiracı başına tek satır).
import { eq } from "drizzle-orm";
import { VARSAYILAN_GONDERIM_BASLANGIC_DK, VARSAYILAN_GONDERIM_BITIS_DK } from "@/lib/mesajlasma";
import { db } from "../db";
import { iletiAyarlari, type IletiAyarlari } from "../db/schema";
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
  smsRetNumarasi: null,
  yetkiliTelefonu: null,
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
  /** true: sorumluluk onayı verilir (zaman ve onaylayan kaydedilir); false: geri alınır. */
  sorumlulukOnayi: boolean;
  gonderimBaslangicDk: number;
  gonderimBitisDk: number;
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
