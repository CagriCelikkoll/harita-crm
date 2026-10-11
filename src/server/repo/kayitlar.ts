import { and, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  ILETI_IZNI_ADLARI,
  KAYIT_DURUM_ADLARI,
  SAYFA_BOYUTU,
  type IletiIzni,
  type KayitDurumu,
  type OlayTuru,
} from "@/lib/sabitler";
import { db } from "../db";
import { leadEvents, leads, scans, type Kayit } from "../db/schema";
import { likeKacir, type TenantContext } from "./baglam";

export type { Kayit };

export type KayitFiltresi = {
  sayfa?: number;
  durum?: KayitDurumu;
  iletiIzni?: IletiIzni;
  etiket?: string;
  /** Yalnızca kullanıcının girdiği alanlarda arar (Places içeriği saklanmadığı için). */
  arama?: string;
};

function filtreKosulu(ctx: TenantContext, f: KayitFiltresi): SQL {
  const kosullar: SQL[] = [eq(leads.tenantId, ctx.tenantId)];
  if (f.durum) kosullar.push(eq(leads.durum, f.durum));
  if (f.iletiIzni) kosullar.push(eq(leads.iletiIzni, f.iletiIzni));
  if (f.etiket) {
    kosullar.push(sql`exists (select 1 from json_each(${leads.etiketler}) where json_each.value = ${f.etiket})`);
  }
  const arama = f.arama?.trim();
  if (arama) {
    const desen = `%${likeKacir(arama)}%`;
    const benzer = (kolon: unknown) => sql`${kolon} like ${desen} escape '\\'`;
    kosullar.push(
      or(
        benzer(leads.yetkiliAdi),
        benzer(leads.eposta),
        benzer(leads.ekTelefon),
        benzer(leads.notlar),
        benzer(sql`${leads.etiketler}`),
      )!,
    );
  }
  return and(...kosullar)!;
}

export function kayitlariListele(ctx: TenantContext, f: KayitFiltresi = {}) {
  const sayfa = Math.max(1, Math.floor(f.sayfa ?? 1));
  const kosul = filtreKosulu(ctx, f);
  const toplam = db.select({ n: count() }).from(leads).where(kosul).get()?.n ?? 0;
  const kayitlar = db
    .select()
    .from(leads)
    .where(kosul)
    .orderBy(desc(leads.guncellemeTarihi), desc(leads.id))
    .limit(SAYFA_BOYUTU)
    .offset((sayfa - 1) * SAYFA_BOYUTU)
    .all();
  return { kayitlar, toplam, sayfa, sayfaSayisi: Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU)) };
}

export function kayitGetir(ctx: TenantContext, id: string): Kayit | null {
  return db.select().from(leads).where(and(eq(leads.id, id), eq(leads.tenantId, ctx.tenantId))).get() ?? null;
}

/** Bir taramanın bulduğu place_id'leri kayıt olarak ekler; var olanlar atlanır. */
export function kayitlariEkle(ctx: TenantContext, scanId: string, placeIdler: string[]) {
  return db.transaction((tx) => {
    const tarama = tx
      .select({ id: scans.id })
      .from(scans)
      .where(and(eq(scans.id, scanId), eq(scans.tenantId, ctx.tenantId)))
      .get();
    if (!tarama) return null;

    let yeni = 0;
    const benzersiz = [...new Set(placeIdler)];
    for (let i = 0; i < benzersiz.length; i += 200) {
      const parca = benzersiz.slice(i, i + 200);
      const eklenen = tx
        .insert(leads)
        .values(parca.map((placeId) => ({ id: crypto.randomUUID(), tenantId: ctx.tenantId, placeId, scanId })))
        .onConflictDoNothing({ target: [leads.tenantId, leads.placeId] })
        .returning({ id: leads.id })
        .all();
      if (eklenen.length) {
        tx.insert(leadEvents)
          .values(
            eklenen.map((k) => ({
              id: crypto.randomUUID(),
              tenantId: ctx.tenantId,
              leadId: k.id,
              tur: "eklendi" as const,
              aciklama: "Bölge taramasıyla eklendi",
              kullaniciId: ctx.userId,
              sistem: true,
            })),
          )
          .run();
      }
      yeni += eklenen.length;
    }
    return { yeni, toplam: benzersiz.length };
  });
}

export type KayitDegisikligi = Partial<
  Pick<Kayit, "durum" | "yetkiliAdi" | "eposta" | "ekTelefon" | "notlar" | "etiketler" | "iletiIzni">
>;

const BILGI_ALANLARI: Record<string, string> = {
  yetkiliAdi: "yetkili adı",
  eposta: "e-posta",
  ekTelefon: "ek telefon",
  etiketler: "etiketler",
};

/**
 * Kaydı günceller ve her değişikliği lead_events'e yazar. Kayıt bu kiracıya ait değilse null.
 */
export function kayitGuncelle(ctx: TenantContext, id: string, degisiklik: KayitDegisikligi): Kayit | null {
  return db.transaction((tx) => {
    const kosul = and(eq(leads.id, id), eq(leads.tenantId, ctx.tenantId));
    const eski = tx.select().from(leads).where(kosul).get();
    if (!eski) return null;

    const yeni = tx
      .update(leads)
      .set({ ...degisiklik, guncellemeTarihi: new Date() })
      .where(kosul)
      .returning()
      .get();
    if (!yeni) return null;

    const olaylar: { tur: OlayTuru; aciklama: string }[] = [];
    if (degisiklik.durum && degisiklik.durum !== eski.durum) {
      olaylar.push({
        tur: "durum",
        aciklama: `${KAYIT_DURUM_ADLARI[eski.durum]} → ${KAYIT_DURUM_ADLARI[degisiklik.durum]}`,
      });
    }
    if (degisiklik.iletiIzni && degisiklik.iletiIzni !== eski.iletiIzni) {
      olaylar.push(
        degisiklik.iletiIzni === "ret"
          ? { tur: "ret", aciklama: "İleti reddi işaretlendi" }
          : { tur: "not", aciklama: `İleti izni: ${ILETI_IZNI_ADLARI[degisiklik.iletiIzni]}` },
      );
    }
    if (degisiklik.notlar !== undefined && (degisiklik.notlar ?? "") !== (eski.notlar ?? "")) {
      olaylar.push({ tur: "not", aciklama: "Notlar güncellendi" });
    }
    const degisenBilgiler = Object.keys(BILGI_ALANLARI).filter((alan) => {
      const k = alan as keyof KayitDegisikligi;
      return k in degisiklik && JSON.stringify(degisiklik[k] ?? null) !== JSON.stringify(eski[k] ?? null);
    });
    if (degisenBilgiler.length) {
      olaylar.push({
        tur: "not",
        aciklama: `Bilgiler güncellendi: ${degisenBilgiler.map((a) => BILGI_ALANLARI[a]).join(", ")}`,
      });
    }
    if (olaylar.length) {
      tx.insert(leadEvents)
        .values(
          olaylar.map((o) => ({
            id: crypto.randomUUID(),
            tenantId: ctx.tenantId,
            leadId: id,
            tur: o.tur,
            aciklama: o.aciklama,
            kullaniciId: ctx.userId,
            sistem: true,
          })),
        )
        .run();
    }
    return yeni;
  });
}

/** Kaydı ve olaylarını siler. Kayıt bu kiracıya ait değilse false. */
export function kayitSil(ctx: TenantContext, id: string): boolean {
  const silinen = db
    .delete(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, ctx.tenantId)))
    .returning({ id: leads.id })
    .get();
  return Boolean(silinen);
}

export function durumSayilari(ctx: TenantContext): Record<KayitDurumu, number> {
  const satirlar = db
    .select({ durum: leads.durum, n: count() })
    .from(leads)
    .where(eq(leads.tenantId, ctx.tenantId))
    .groupBy(leads.durum)
    .all();
  const sonuc = { yeni: 0, iletisimde: 0, gorusme: 0, kazanildi: 0, ilgilenmiyor: 0 };
  for (const s of satirlar) sonuc[s.durum] = s.n;
  return sonuc;
}

export function etiketleriListele(ctx: TenantContext): string[] {
  const satirlar = db.all<{ value: string }>(
    sql`select distinct json_each.value as value from ${leads}, json_each(${leads.etiketler})
        where ${leads.tenantId} = ${ctx.tenantId} order by 1`,
  );
  return satirlar.map((s) => s.value);
}

/** Bir taramayla eklenen kayıtların place_id'leri (harita işaretçileri için). */
export function taramaKayitlari(ctx: TenantContext, scanId: string) {
  return db
    .select({ id: leads.id, placeId: leads.placeId, durum: leads.durum })
    .from(leads)
    .where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.scanId, scanId)))
    .all();
}

/** CSV için: yalnızca kullanıcının kendi verisi (Places içeriği yok). */
export function disaAktarilacakKayitlar(ctx: TenantContext, f: Omit<KayitFiltresi, "sayfa"> = {}): Kayit[] {
  return db.select().from(leads).where(filtreKosulu(ctx, f)).orderBy(desc(leads.guncellemeTarihi)).all();
}

/** Verilen id'lerden yalnızca bu kiracıya ait olanları döndürür. */
export function kayitlariGetir(ctx: TenantContext, idler: string[]): Kayit[] {
  if (!idler.length) return [];
  return db
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, ctx.tenantId), inArray(leads.id, idler)))
    .all();
}
