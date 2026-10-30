// Gönderim işçisi (npm run worker) için kiracılar arası işlemler. HTTP'den çağrılmaz.
//
// İdempotans: mesajlariAl() satırları TEK bir UPDATE … WHERE durum='kuyrukta' … RETURNING ifadesiyle
// "gonderiliyor"a alır. SQLite her ifadeyi atomik yürüttüğü için aynı satırı iki işçi (aynı ya da ayrı
// süreçte) alamaz; satır sonuçlanınca bir daha alınmaz. Gönderim ortasında çöken işçinin satırı
// BELIRSIZ_MESAJ_DAKIKA sonra "belirsiz" olarak kapanır ve yeniden denenmez (en fazla bir kez gönderim).
//
// Tek işçi: tur, süresi dolan bir veritabanı kilidi (isci_kilitleri, nabızla uzatılır) altında çalışır; aynı anda
// ikinci bir tur çalışmaz. Alınan satıra turun kimliği (kilit_sahibi) yazılır; gönderimden hemen önce
// gonderimOncesiKontrol satırın hâlâ bu turda ve kampanyanın hâlâ çalışıyor olduğunu doğrular, kilidi yeniler.
import { and, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { BELIRSIZ_MESAJ_DAKIKA } from "@/lib/mesajlasma";
import { db } from "../../db";
import { isciKilitleri, kampanyalar, messageQueue, type KuyrukMesaji } from "../../db/schema";
import { _baglamDamgala, type TenantContext } from "../baglam";

/** Planlanan zamanı gelmiş kampanyaları başlatır. */
export function zamaniGelenKampanyalariBaslat(simdi = new Date()): number {
  return db
    .update(kampanyalar)
    .set({ durum: "calisiyor", baslamaTarihi: simdi })
    .where(and(eq(kampanyalar.durum, "zamanlandi"), lte(kampanyalar.planlananTarih, simdi)))
    .returning({ id: kampanyalar.id })
    .all().length;
}

/** İşçi gönderim sırasında çöktüyse: uzun süre "gonderiliyor" kalan satırlar belirsiz olarak kapanır. */
export function belirsizMesajlariKapat(simdi = new Date()): { tenantId: string; kampanyaId: string }[] {
  const sinir = new Date(simdi.getTime() - BELIRSIZ_MESAJ_DAKIKA * 60_000);
  return db
    .update(messageQueue)
    .set({
      durum: "basarisiz",
      neden: "belirsiz",
      hata: "Gönderim yarıda kaldı; ileti gönderilmiş olabilir. İki kez gönderilmemesi için yeniden denenmedi.",
      kilitZamani: null,
    })
    .where(and(eq(messageQueue.durum, "gonderiliyor"), lt(messageQueue.kilitZamani, sinir)))
    .returning({ tenantId: messageQueue.tenantId, kampanyaId: messageQueue.kampanyaId })
    .all();
}

/** Bekleyen ya da gönderilmekte olan mesajı kalmamış "calisiyor" kampanyaları tamamlar. */
export function bitenKampanyalariKapat(simdi = new Date()): number {
  return db
    .update(kampanyalar)
    .set({ durum: "tamamlandi", tamamlanmaTarihi: simdi })
    .where(
      and(
        eq(kampanyalar.durum, "calisiyor"),
        sql`not exists (select 1 from message_queue q where q.kampanya_id = ${kampanyalar.id}
          and q.tenant_id = ${kampanyalar.tenantId} and q.durum in ('kuyrukta', 'gonderiliyor'))`,
      ),
    )
    .returning({ id: kampanyalar.id })
    .all().length;
}

export type AlinanMesaj = { mesaj: KuyrukMesaji; ctx: TenantContext };

/**
 * Gönderilmeye hazır (kampanyası çalışıyor, bekleme zamanı gelmiş) en fazla `parti` mesajı atomik olarak
 * "gonderiliyor" durumuna alır. Her mesaj için kampanyayı oluşturan kullanıcı adına (silinmişse "")
 * kiracı bağlamı üretir.
 */
export function mesajlariAl(simdi: Date, parti: number, kilitSahibi: string): AlinanMesaj[] {
  const zaman = simdi.getTime();
  const alinan = db
    .update(messageQueue)
    .set({ durum: "gonderiliyor", kilitZamani: simdi, kilitSahibi, denemeSayisi: sql`${messageQueue.denemeSayisi} + 1` })
    .where(
      and(
        eq(messageQueue.durum, "kuyrukta"),
        sql`${messageQueue.id} in (
          select q.id from message_queue q
          join kampanyalar k on k.id = q.kampanya_id and k.tenant_id = q.tenant_id
          where q.durum = 'kuyrukta' and k.durum = 'calisiyor'
            and (q.sonraki_deneme is null or q.sonraki_deneme <= ${zaman})
          order by q.olusturma_tarihi, q.id
          limit ${parti})`,
      ),
    )
    .returning()
    .all();
  if (!alinan.length) return [];

  const olusturanlar = new Map(
    db
      .select({ id: kampanyalar.id, olusturan: kampanyalar.olusturan })
      .from(kampanyalar)
      .where(inArray(kampanyalar.id, [...new Set(alinan.map((m) => m.kampanyaId))]))
      .all()
      .map((k) => [k.id, k.olusturan]),
  );
  return alinan.map((mesaj) => ({
    mesaj,
    ctx: _baglamDamgala({ tenantId: mesaj.tenantId, userId: olusturanlar.get(mesaj.kampanyaId) ?? "", rol: "uye" }),
  }));
}

const KILIT_ADI = "gonderim";

/**
 * Gönderim işçisi kilidini alır: kilit yoksa, süresi dolmuşsa ya da zaten bu sahibindeyse. Tek ifade (INSERT … ON
 * CONFLICT DO UPDATE … WHERE) olduğu için iki işçi aynı anda alamaz.
 */
export function isciKilidiAl(sahip: string, sureMs: number, simdiMs = Date.now()): boolean {
  const bitis = new Date(simdiMs + sureMs);
  return Boolean(
    db
      .insert(isciKilitleri)
      .values({ ad: KILIT_ADI, sahip, bitis })
      .onConflictDoUpdate({
        target: isciKilitleri.ad,
        set: { sahip, bitis },
        setWhere: sql`${isciKilitleri.bitis} < ${simdiMs} or ${isciKilitleri.sahip} = ${sahip}`,
      })
      .returning({ sahip: isciKilitleri.sahip })
      .get(),
  );
}

/** Nabız: kilit hâlâ bu sahipteyse süresini uzatır. false: kilit kaybedildi (süresi dolup başkası aldı). */
export function isciKilidiYenile(sahip: string, sureMs: number, simdiMs = Date.now()): boolean {
  return Boolean(
    db
      .update(isciKilitleri)
      .set({ bitis: new Date(simdiMs + sureMs) })
      .where(and(eq(isciKilitleri.ad, KILIT_ADI), eq(isciKilitleri.sahip, sahip)))
      .returning({ sahip: isciKilitleri.sahip })
      .get(),
  );
}

export function isciKilidiBirak(sahip: string) {
  db.delete(isciKilitleri).where(and(eq(isciKilitleri.ad, KILIT_ADI), eq(isciKilitleri.sahip, sahip))).run();
}

export type GonderimOncesiSonuc =
  | { durum: "tamam" }
  /** Satır artık bu turda değil (belirsiz kapatıldı, bırakıldı ya da başka tura geçti): GÖNDERİLMEZ, satıra dokunulmaz. */
  | { durum: "satir_yok" }
  /** Kampanya iptal edildi ya da duraklatıldı: GÖNDERİLMEZ. */
  | { durum: "kampanya"; kampanyaDurumu: string | null; duraklatmaNedeni: string | null };

/**
 * Gönderim çağrısından HEMEN önce: satır hâlâ "gonderiliyor" ve bu turdaysa kilit zamanı yenilenir (belirsiz
 * kapatma sayacı sıfırlanır), sonra kampanyanın güncel durumu veritabanından okunur.
 */
export function gonderimOncesiKontrol(ctx: TenantContext, mesajId: string, kilitSahibi: string, simdi = new Date()): GonderimOncesiSonuc {
  return db.transaction((tx) => {
    const m = tx
      .update(messageQueue)
      .set({ kilitZamani: simdi })
      .where(
        and(
          eq(messageQueue.id, mesajId),
          eq(messageQueue.tenantId, ctx.tenantId),
          eq(messageQueue.durum, "gonderiliyor"),
          eq(messageQueue.kilitSahibi, kilitSahibi),
        ),
      )
      .returning({ kampanyaId: messageQueue.kampanyaId })
      .get();
    if (!m) return { durum: "satir_yok" };
    const k = tx
      .select({ durum: kampanyalar.durum, duraklatmaNedeni: kampanyalar.duraklatmaNedeni })
      .from(kampanyalar)
      .where(and(eq(kampanyalar.id, m.kampanyaId), eq(kampanyalar.tenantId, ctx.tenantId)))
      .get();
    if (k?.durum !== "calisiyor") return { durum: "kampanya", kampanyaDurumu: k?.durum ?? null, duraklatmaNedeni: k?.duraklatmaNedeni ?? null };
    return { durum: "tamam" };
  });
}
