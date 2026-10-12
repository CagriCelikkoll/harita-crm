// WhatsApp günlük liste: kullanıcının bugünkü sırası ve sonuçları. Gönderimi kullanıcı yapar; burada yalnızca
// sıra ve sonuç (gönderdim / atla / ret istedi / otomatik atlandı) tutulur. Telefon numarası saklanmaz.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { WhatsappDurumu } from "@/lib/mesajlasma";
import { KAYIT_DURUM_ADLARI } from "@/lib/sabitler";
import { db } from "../db";
import { leadEvents, leads, whatsappListesi } from "../db/schema";
import type { TenantContext } from "./baglam";

export type WhatsappOgesi = typeof whatsappListesi.$inferSelect;

/** Kullanıcının `gun` listesi, sırayla; kaydın kullanıcı verisiyle (işletme adı, ek telefon, place_id). */
export function gunlukListe(ctx: TenantContext, gun: string) {
  return db
    .select({
      id: whatsappListesi.id,
      leadId: whatsappListesi.leadId,
      sira: whatsappListesi.sira,
      durum: whatsappListesi.durum,
      neden: whatsappListesi.neden,
      isletmeAdi: leads.isletmeAdi,
    })
    .from(whatsappListesi)
    .innerJoin(leads, and(eq(leads.id, whatsappListesi.leadId), eq(leads.tenantId, whatsappListesi.tenantId)))
    .where(
      and(eq(whatsappListesi.tenantId, ctx.tenantId), eq(whatsappListesi.kullaniciId, ctx.userId), eq(whatsappListesi.gun, gun)),
    )
    .orderBy(asc(whatsappListesi.sira))
    .all();
}

/** Bu kiracıda `gun` için herhangi bir kullanıcının listesinde olan kayıtlar (yeniden sıraya alınmasın). */
export function gunlukListedekiKayitlar(ctx: TenantContext, gun: string): Set<string> {
  return new Set(
    db
      .select({ leadId: whatsappListesi.leadId })
      .from(whatsappListesi)
      .where(and(eq(whatsappListesi.tenantId, ctx.tenantId), eq(whatsappListesi.gun, gun)))
      .all()
      .map((s) => s.leadId),
  );
}

/** Kayıtları kullanıcının `gun` listesinin sonuna ekler. Başka kiracının kayıtları ve listede olanlar atlanır. */
export function listeyeEkle(ctx: TenantContext, gun: string, leadIdler: string[]): number {
  if (!leadIdler.length) return 0;
  return db.transaction((tx) => {
    const gecerli = tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.tenantId, ctx.tenantId), inArray(leads.id, leadIdler)))
      .all()
      .map((s) => s.id);
    const sonSira =
      tx
        .select({ n: sql<number>`coalesce(max(${whatsappListesi.sira}), 0)` })
        .from(whatsappListesi)
        .where(
          and(eq(whatsappListesi.tenantId, ctx.tenantId), eq(whatsappListesi.kullaniciId, ctx.userId), eq(whatsappListesi.gun, gun)),
        )
        .get()?.n ?? 0;
    const sirali = leadIdler.filter((id) => gecerli.includes(id));
    if (!sirali.length) return 0;
    return tx
      .insert(whatsappListesi)
      .values(
        sirali.map((leadId, i) => ({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          kullaniciId: ctx.userId,
          gun,
          leadId,
          sira: sonSira + i + 1,
        })),
      )
      .onConflictDoNothing({ target: [whatsappListesi.tenantId, whatsappListesi.gun, whatsappListesi.leadId] })
      .returning({ id: whatsappListesi.id })
      .all().length;
  });
}

/** Kullanıcının kendi liste öğesi (başka kullanıcının ya da kiracının öğesi → null). */
export function ogeGetir(ctx: TenantContext, id: string): WhatsappOgesi | null {
  return (
    db
      .select()
      .from(whatsappListesi)
      .where(
        and(eq(whatsappListesi.id, id), eq(whatsappListesi.tenantId, ctx.tenantId), eq(whatsappListesi.kullaniciId, ctx.userId)),
      )
      .get() ?? null
  );
}

/** Kullanıcının "bekliyor" durumundaki öğesini sonuçlandırır. Değilse false. */
export function ogeSonuclandir(ctx: TenantContext, id: string, durum: Exclude<WhatsappDurumu, "bekliyor">, neden: string | null = null) {
  return Boolean(
    db
      .update(whatsappListesi)
      .set({ durum, neden, guncellemeTarihi: new Date() })
      .where(
        and(
          eq(whatsappListesi.id, id),
          eq(whatsappListesi.tenantId, ctx.tenantId),
          eq(whatsappListesi.kullaniciId, ctx.userId),
          eq(whatsappListesi.durum, "bekliyor"),
        ),
      )
      .returning({ id: whatsappListesi.id })
      .get(),
  );
}

/**
 * Kullanıcı WhatsApp'ta gönderdiğini bildirdi: lead_events'e 'whatsapp', 'yeni' → 'iletisimde'. Kullanıcının
 * bugünkü listesinde bu kayıt bekliyorsa öğe de "gonderildi" olur. Kayıt bu kiracının değilse false.
 */
export function whatsappGonderimiKaydet(ctx: TenantContext, leadId: string, gun: string): boolean {
  return db.transaction((tx) => {
    const kayit = tx
      .select({ id: leads.id, durum: leads.durum })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId)))
      .get();
    if (!kayit) return false;
    const olay = (tur: "whatsapp" | "durum", aciklama: string) =>
      tx
        .insert(leadEvents)
        .values({ id: crypto.randomUUID(), tenantId: ctx.tenantId, leadId, tur, aciklama, kullaniciId: ctx.userId, sistem: true })
        .run();
    olay("whatsapp", "WhatsApp mesajı gönderildi (kullanıcı bildirdi)");
    const simdi = new Date();
    if (kayit.durum === "yeni") {
      tx.update(leads)
        .set({ durum: "iletisimde", guncellemeTarihi: simdi })
        .where(and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId)))
        .run();
      olay("durum", `${KAYIT_DURUM_ADLARI.yeni} → ${KAYIT_DURUM_ADLARI.iletisimde}`);
    } else {
      tx.update(leads)
        .set({ guncellemeTarihi: simdi })
        .where(and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId)))
        .run();
    }
    tx.update(whatsappListesi)
      .set({ durum: "gonderildi", neden: null, guncellemeTarihi: simdi })
      .where(
        and(
          eq(whatsappListesi.tenantId, ctx.tenantId),
          eq(whatsappListesi.kullaniciId, ctx.userId),
          eq(whatsappListesi.gun, gun),
          eq(whatsappListesi.leadId, leadId),
          eq(whatsappListesi.durum, "bekliyor"),
        ),
      )
      .run();
    return true;
  });
}

/** "WhatsApp'ta aç" sırasında çözülen numaranın özeti (numara değil); "Ret istedi"de engel listesine yazılır. */
export function ogeAdresOzetiYaz(ctx: TenantContext, id: string, adresOzeti: string): boolean {
  return Boolean(
    db
      .update(whatsappListesi)
      .set({ adresOzeti })
      .where(
        and(eq(whatsappListesi.id, id), eq(whatsappListesi.tenantId, ctx.tenantId), eq(whatsappListesi.kullaniciId, ctx.userId)),
      )
      .returning({ id: whatsappListesi.id })
      .get(),
  );
}
