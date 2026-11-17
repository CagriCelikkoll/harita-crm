// Gelen medya: işçinin indirme kuyruğu ve günlük bakım (çalışma alanları arası; HTTP'den çağrılmaz). Durum değişikliği
// mesajın ve sohbetin sürümünü artırır: açık sohbet canlı yenilemeyle "indirildi"yi görür.
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { VARSAYILAN_MEDYA_SAKLAMA_GUN, type SohbetMesajTuru } from "@/lib/gelen-kutusu";
import { db } from "../../db";
import { gelenKutusuSurumu, sohbetler, sohbetMedyalari, sohbetMesajlari, type SohbetMedyasi } from "../../db/schema";
import { _baglamDamgala, type TenantContext } from "../baglam";

const GUN_MS = 24 * 3600_000;

export type IndirilecekMedya = SohbetMedyasi & { ctx: TenantContext; baglantiId: string; tur: SohbetMesajTuru; mesajTarihi: Date };

/** Sırası gelen "bekliyor" medyalar (eskiden yeniye), mesajın türü, tarihi ve sohbetin numarasıyla. */
export function indirilecekMedyalar(simdi: Date, adet: number): IndirilecekMedya[] {
  return db
    .select({ m: sohbetMedyalari, baglantiId: sohbetler.baglantiId, tur: sohbetMesajlari.tur, mesajTarihi: sohbetMesajlari.tarih })
    .from(sohbetMedyalari)
    .innerJoin(sohbetMesajlari, and(eq(sohbetMesajlari.tenantId, sohbetMedyalari.tenantId), eq(sohbetMesajlari.id, sohbetMedyalari.mesajId)))
    .innerJoin(sohbetler, and(eq(sohbetler.tenantId, sohbetMesajlari.tenantId), eq(sohbetler.id, sohbetMesajlari.sohbetId)))
    .where(and(eq(sohbetMedyalari.durum, "bekliyor"), or(isNull(sohbetMedyalari.sonrakiDeneme), lte(sohbetMedyalari.sonrakiDeneme, simdi))))
    .orderBy(asc(sohbetMedyalari.olusturmaTarihi))
    .limit(adet)
    .all()
    .map((r) => ({
      ...r.m,
      ctx: _baglamDamgala({ tenantId: r.m.tenantId, userId: "", rol: "uye" }),
      baglantiId: r.baglantiId,
      tur: r.tur,
      mesajTarihi: r.mesajTarihi,
    }));
}

/** Çalışma alanının indirilmiş medyasının toplam boyutu (kota). */
export function medyaKotaKullanimi(tenantId: string): number {
  return (
    db
      .select({ b: sql<number>`coalesce(sum(${sohbetMedyalari.boyut}), 0)` })
      .from(sohbetMedyalari)
      .where(and(eq(sohbetMedyalari.tenantId, tenantId), eq(sohbetMedyalari.durum, "indirildi")))
      .get()?.b ?? 0
  );
}

function surumArtir(tenantId: string, mesajIdler: string[]) {
  if (mesajIdler.length === 0) return;
  const surum = db
    .insert(gelenKutusuSurumu)
    .values({ tenantId, surum: 1 })
    .onConflictDoUpdate({ target: gelenKutusuSurumu.tenantId, set: { surum: sql`${gelenKutusuSurumu.surum} + 1` } })
    .returning({ surum: gelenKutusuSurumu.surum })
    .get().surum;
  const mesajlar = db
    .update(sohbetMesajlari)
    .set({ surum })
    .where(and(eq(sohbetMesajlari.tenantId, tenantId), inArray(sohbetMesajlari.id, mesajIdler)))
    .returning({ sohbetId: sohbetMesajlari.sohbetId })
    .all();
  const sohbetIdler = [...new Set(mesajlar.map((m) => m.sohbetId))];
  if (sohbetIdler.length) {
    db.update(sohbetler).set({ surum }).where(and(eq(sohbetler.tenantId, tenantId), inArray(sohbetler.id, sohbetIdler))).run();
  }
}

export type MedyaGuncellemesi = Partial<
  Pick<SohbetMedyasi, "durum" | "neden" | "deneme" | "sonrakiDeneme" | "mime" | "boyut" | "sha256" | "yol" | "indirmeTarihi">
>;

/**
 * Medya satırını günceller; yalnızca hâlâ "bekliyor" ise (aynı satırı başka bir yol değiştirdiyse dokunmaz). Mesajın ve
 * sohbetin sürümünü artırır. Güncellendiyse true.
 */
export function medyaGuncelle(m: Pick<SohbetMedyasi, "id" | "tenantId" | "mesajId">, g: MedyaGuncellemesi): boolean {
  return db.transaction(() => {
    const r = db
      .update(sohbetMedyalari)
      .set(g)
      .where(and(eq(sohbetMedyalari.tenantId, m.tenantId), eq(sohbetMedyalari.id, m.id), eq(sohbetMedyalari.durum, "bekliyor")))
      .returning({ id: sohbetMedyalari.id })
      .all();
    if (r.length === 0) return false;
    surumArtir(m.tenantId, [m.mesajId]);
    return true;
  });
}

/**
 * Saklama süresi (ileti_ayarlari.medya_saklama_gun; satır yoksa varsayılan, mesajın tarihinden) dolan indirilmiş medyalar
 * "silindi" olur. Dosyası silinecek göreli yollar döner (dosyaları servis siler; transaction kısa kalır).
 */
export function saklamasiDolanMedyalariIsaretle(simdi: Date): string[] {
  return db.transaction(() => {
    const gun = sql`coalesce((select a.medya_saklama_gun from ileti_ayarlari a where a.tenant_id = ${sohbetMedyalari.tenantId}), ${VARSAYILAN_MEDYA_SAKLAMA_GUN})`;
    const dolanlar = db
      .select({ id: sohbetMedyalari.id, tenantId: sohbetMedyalari.tenantId, mesajId: sohbetMedyalari.mesajId, yol: sohbetMedyalari.yol })
      .from(sohbetMedyalari)
      .innerJoin(sohbetMesajlari, and(eq(sohbetMesajlari.tenantId, sohbetMedyalari.tenantId), eq(sohbetMesajlari.id, sohbetMedyalari.mesajId)))
      .where(and(eq(sohbetMedyalari.durum, "indirildi"), sql`${sohbetMesajlari.tarih} < ${simdi.getTime()} - ${gun} * ${GUN_MS}`))
      .all();
    if (dolanlar.length === 0) return [];
    for (let i = 0; i < dolanlar.length; i += 500) {
      const parca = dolanlar.slice(i, i + 500);
      db.update(sohbetMedyalari)
        .set({ durum: "silindi", yol: null, silinmeTarihi: simdi })
        .where(inArray(sohbetMedyalari.id, parca.map((d) => d.id)))
        .run();
    }
    const tenantlar = new Map<string, string[]>();
    for (const d of dolanlar) tenantlar.set(d.tenantId, [...(tenantlar.get(d.tenantId) ?? []), d.mesajId]);
    for (const [tenantId, mesajlar] of tenantlar) {
      for (let i = 0; i < mesajlar.length; i += 500) surumArtir(tenantId, mesajlar.slice(i, i + 500));
    }
    return dolanlar.flatMap((d) => (d.yol ? [d.yol] : []));
  });
}

/** Diskteki bir dosya hâlâ indirilmiş bir medya satırına ait mi (değilse günlük bakım siler). */
export function medyaYoluKayitli(yol: string): boolean {
  return Boolean(
    db
      .select({ id: sohbetMedyalari.id })
      .from(sohbetMedyalari)
      .where(and(eq(sohbetMedyalari.yol, yol), eq(sohbetMedyalari.durum, "indirildi")))
      .get(),
  );
}
