// Places kullanım sayacı ve aylık kota (birim cinsinden; ağırlıklar src/lib/places-birimleri.ts).
//
// Her ücretli Places isteğinden ÖNCE kotaAyir() çağrılır. Kontrol ve artırma TEK bir SQL ifadesindedir
// (INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING): SQLite her ifadeyi atomik yürüttüğü için
// eşzamanlı istekler — aynı süreçte ya da ayrı süreçlerde — kotayı aşamaz.
// Kota ayı Europe/Istanbul takvimine göredir. (Sütun adı places_istek_sayisi tarihseldir; değer birimdir.)
import { and, eq, sql } from "drizzle-orm";
import { KOTA_UYARI_ORANI } from "@/lib/sabitler";
import { ayAnahtari } from "@/lib/zaman";
import { db } from "../db";
import { tenants, usageCounters } from "../db/schema";
import type { TenantContext } from "./baglam";

export { ayAnahtari };

/** Kullanım kalemleri (Ayarlar > Kullanım dökümü); toplam her zaman places_istek_sayisi'dır. */
export type KullanimKalemi = "isletmeBilgisi" | "iletisimBilgisi" | "tarama";

// Sabit beyaz liste: SQL'e yalnızca bu sütun adları yazılır.
const KALEM_SUTUNLARI: Record<KullanimKalemi, string> = {
  isletmeBilgisi: "isletme_bilgisi_birim",
  iletisimBilgisi: "iletisim_bilgisi_birim",
  tarama: "tarama_birim",
};

export type KotaAyirSecenekleri = {
  ay?: string;
  kalem?: KullanimKalemi;
  /**
   * Kotanın bu oranının altında kalınması şartı (ör. 0,8: otomatik gösterim). Verilirse ayırma, ancak ayırmadan
   * sonraki toplam kota × esik'in ALTINDA kalıyorsa yapılır; verilmezse toplam kotayı aşmadıkça yapılır.
   */
  esik?: number;
};

/**
 * `birim` kadar kota ayırır. Kota (ya da eşik) yetiyorsa toplamı ve varsa kalemi artırıp true, yetmiyorsa hiçbir
 * şey yazmadan false döner. Toplam ve kalem aynı SQL ifadesinde artar (atomik).
 */
export function kotaAyir(ctx: TenantContext, birim = 1, secenek: KotaAyirSecenekleri = {}): boolean {
  const ay = secenek.ay ?? ayAnahtari();
  const kota = sql`(select ${tenants.aylikPlacesKotasi} from ${tenants} where ${tenants.id} = ${ctx.tenantId})`;
  const kalem = secenek.kalem ? sql.raw(KALEM_SUTUNLARI[secenek.kalem]) : null;
  const yeniToplamUygun = (toplam: ReturnType<typeof sql>) =>
    secenek.esik === undefined ? sql`${toplam} <= ${kota}` : sql`${toplam} < ${kota} * ${secenek.esik}`;
  const satir = db.get<{ n: number } | undefined>(sql`
    insert into ${usageCounters} (tenant_id, ay, places_istek_sayisi${kalem ? sql`, ${kalem}` : sql``})
    select ${ctx.tenantId}, ${ay}, ${birim}${kalem ? sql`, ${birim}` : sql``} where ${yeniToplamUygun(sql`${birim}`)}
    on conflict (tenant_id, ay) do update
      set places_istek_sayisi = ${usageCounters}.places_istek_sayisi + excluded.places_istek_sayisi${
        kalem ? sql`, ${kalem} = ${usageCounters}.${kalem} + excluded.${kalem}` : sql``
      }
      where ${yeniToplamUygun(sql`${usageCounters}.places_istek_sayisi + excluded.places_istek_sayisi`)}
    returning places_istek_sayisi as n`);
  return satir !== undefined;
}

/** Yapılamayan (ağ hatası / Google tarafından reddedilen) istek için ayrılan birimleri, ayrıldığı aya ve kaleme iade eder. */
export function kotaIadeEt(ctx: TenantContext, birim = 1, secenek: Omit<KotaAyirSecenekleri, "esik"> = {}) {
  const ay = secenek.ay ?? ayAnahtari();
  const kalem = secenek.kalem ? sql.raw(KALEM_SUTUNLARI[secenek.kalem]) : null;
  db.run(sql`
    update ${usageCounters}
      set places_istek_sayisi = max(0, places_istek_sayisi - ${birim})${kalem ? sql`, ${kalem} = max(0, ${kalem} - ${birim})` : sql``}
      where tenant_id = ${ctx.tenantId} and ay = ${ay}`);
}

export function aylikPlacesBirimi(ctx: TenantContext, ay = ayAnahtari()): number {
  return (
    db
      .select({ n: usageCounters.placesIstekSayisi })
      .from(usageCounters)
      .where(and(eq(usageCounters.tenantId, ctx.tenantId), eq(usageCounters.ay, ay)))
      .get()?.n ?? 0
  );
}

export type KotaDurumu = {
  kullanilan: number;
  kota: number;
  kalan: number;
  /** 0–1 arası (kota 0 ise 1). */
  oran: number;
  uyari: boolean; // %80 ve üstü
  doldu: boolean;
};

export function kotaDurumu(ctx: TenantContext, ay = ayAnahtari()): KotaDurumu {
  const kota = db.select({ k: tenants.aylikPlacesKotasi }).from(tenants).where(eq(tenants.id, ctx.tenantId)).get()?.k ?? 0;
  const kullanilan = aylikPlacesBirimi(ctx, ay);
  const oran = kota > 0 ? Math.min(1, kullanilan / kota) : 1;
  return {
    kullanilan,
    kota,
    kalan: Math.max(0, kota - kullanilan),
    oran,
    uyari: oran >= KOTA_UYARI_ORANI,
    doldu: kullanilan >= kota,
  };
}

/** Ayarlar > Kullanım: kalemlerin bu ayki toplam içindeki payı (yüzde, 0–100). Kalemsiz eski birimler payda yer almaz. */
export function kullanimDokumu(ctx: TenantContext, ay = ayAnahtari()): Record<KullanimKalemi, number> {
  const s = db
    .select({
      toplam: usageCounters.placesIstekSayisi,
      isletmeBilgisi: usageCounters.isletmeBilgisiBirim,
      iletisimBilgisi: usageCounters.iletisimBilgisiBirim,
      tarama: usageCounters.taramaBirim,
    })
    .from(usageCounters)
    .where(and(eq(usageCounters.tenantId, ctx.tenantId), eq(usageCounters.ay, ay)))
    .get();
  const pay = (n: number) => (s && s.toplam > 0 ? Math.round((n / s.toplam) * 100) : 0);
  return { isletmeBilgisi: pay(s?.isletmeBilgisi ?? 0), iletisimBilgisi: pay(s?.iletisimBilgisi ?? 0), tarama: pay(s?.tarama ?? 0) };
}
