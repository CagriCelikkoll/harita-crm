// Kayıtların WhatsApp (Cloud API) bilgileri: kanal izni ve kanıtı, BSUID, reklam kaynağı. leads ile 1:1; satır
// yoksa izin 'yok' sayılır. 'ret' yalnızca ret akışıyla (engel-listesi.ts retIsle, kayitGuncelle) yazılır ve
// buradan geri alınamaz.
import { and, eq, inArray } from "drizzle-orm";
import { WHATSAPP_IZIN_KAYNAK_ADLARI, WHATSAPP_IZNI_ADLARI, type WhatsappIzinKaynagi } from "@/lib/mesajlasma";
import type { AliciTuru } from "@/lib/mesajlasma";
import { db } from "../db";
import { leadEvents, leads, whatsappKisileri, type WhatsappKisisi } from "../db/schema";
import type { TenantContext } from "./baglam";
import { retliKayitAdresleriniEngelle } from "./engel-listesi";
import { kisileriEkle } from "./kayitlar";

export type { WhatsappKisisi };

export function whatsappKisisiGetir(ctx: TenantContext, leadId: string): WhatsappKisisi | null {
  return (
    db
      .select()
      .from(whatsappKisileri)
      .where(and(eq(whatsappKisileri.tenantId, ctx.tenantId), eq(whatsappKisileri.leadId, leadId)))
      .get() ?? null
  );
}

/** Verilen kayıtların WhatsApp bilgileri (yalnızca bu kiracınınkiler; satırı olmayan kayıt haritada yoktur). */
export function whatsappKisileriGetir(ctx: TenantContext, leadIdler: string[]): Map<string, WhatsappKisisi> {
  const benzersiz = [...new Set(leadIdler)];
  const sonuc = new Map<string, WhatsappKisisi>();
  for (let i = 0; i < benzersiz.length; i += 500) {
    for (const k of db
      .select()
      .from(whatsappKisileri)
      .where(
        and(eq(whatsappKisileri.tenantId, ctx.tenantId), inArray(whatsappKisileri.leadId, benzersiz.slice(i, i + 500))),
      )
      .all()) {
      sonuc.set(k.leadId, k);
    }
  }
  return sonuc;
}

export type WhatsappIzniGirdisi = {
  izin: "yok" | "var";
  kaynak?: WhatsappIzinKaynagi | null;
  tarih?: Date | null;
  not?: string | null;
  /** Bireysel alıcı için: izin İYS'ye kaydedildi beyanı. */
  iysBeyani?: boolean;
  iceAktarmaId?: string | null;
};

export type WhatsappIzniSonucu = { tamam: true; kisi: WhatsappKisisi } | { tamam: false; neden: "bulunamadi" | "ret" };

/**
 * WhatsApp iznini ayarlar ve 'izin' olayı yazar. Kayıt bu kiracıya ait değilse "bulunamadi"; izin 'ret' ise
 * değiştirilmez ("ret": ret geri alınamaz). 'var' için kaynak zorunludur (çağıran doğrular).
 */
export function whatsappIzniAyarla(ctx: TenantContext, leadId: string, g: WhatsappIzniGirdisi): WhatsappIzniSonucu {
  return db.transaction((tx) => {
    const kayit = tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId)))
      .get();
    if (!kayit) return { tamam: false, neden: "bulunamadi" };
    const eski = tx
      .select()
      .from(whatsappKisileri)
      .where(and(eq(whatsappKisileri.tenantId, ctx.tenantId), eq(whatsappKisileri.leadId, leadId)))
      .get();
    if (eski?.izin === "ret") return { tamam: false, neden: "ret" };

    const simdi = new Date();
    const alanlar = {
      izin: g.izin,
      izinTarihi: g.izin === "var" ? (g.tarih ?? simdi) : null,
      izinKaynagi: g.izin === "var" ? (g.kaynak ?? null) : null,
      izinNotu: g.not ?? null,
      izinIceAktarmaId: g.iceAktarmaId ?? null,
      iysBeyanTarihi: g.izin === "var" && g.iysBeyani ? (eski?.iysBeyanTarihi ?? simdi) : null,
      guncellemeTarihi: simdi,
    };
    const kisi = tx
      .insert(whatsappKisileri)
      .values({ tenantId: ctx.tenantId, leadId, ...alanlar })
      .onConflictDoUpdate({ target: [whatsappKisileri.tenantId, whatsappKisileri.leadId], set: alanlar })
      .returning()
      .get();

    const degisti =
      eski?.izin !== kisi.izin ||
      eski?.izinKaynagi !== kisi.izinKaynagi ||
      (eski?.izinNotu ?? null) !== kisi.izinNotu ||
      Boolean(eski?.iysBeyanTarihi) !== Boolean(kisi.iysBeyanTarihi);
    if (degisti) {
      // Liste "Son işlem" ve sıralaması: izin değişikliği kaydın güncelleme tarihini de değiştirir.
      tx.update(leads).set({ guncellemeTarihi: simdi }).where(and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId))).run();
      const ayrinti = [
        WHATSAPP_IZNI_ADLARI[kisi.izin],
        kisi.izinKaynagi ? WHATSAPP_IZIN_KAYNAK_ADLARI[kisi.izinKaynagi] : null,
        kisi.iysBeyanTarihi ? "İYS beyanı var" : null,
      ].filter(Boolean);
      tx.insert(leadEvents)
        .values({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          leadId,
          tur: "izin",
          aciklama: `WhatsApp izni: ${ayrinti.join(", ")}`,
          kullaniciId: ctx.userId || null,
          sistem: true,
        })
        .run();
    }
    return { tamam: true, kisi };
  });
}

/** Meta "alıcıda WhatsApp yok / teslim edilemez" (131026) bildirdi: bir süre kampanyalara alınmaz. */
export function whatsappYokIsaretle(ctx: TenantContext, leadId: string, simdi = new Date()): boolean {
  const kayit = db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId)))
    .get();
  if (!kayit) return false;
  db.insert(whatsappKisileri)
    .values({ tenantId: ctx.tenantId, leadId, whatsappYokTarihi: simdi })
    .onConflictDoUpdate({
      target: [whatsappKisileri.tenantId, whatsappKisileri.leadId],
      set: { whatsappYokTarihi: simdi, guncellemeTarihi: simdi },
    })
    .run();
  return true;
}

/** BSUID'i bu kiracıdaki kayda bağlı kişi (yoksa null). */
export function bsuidIleBul(ctx: TenantContext, bsuid: string): string | null {
  return (
    db
      .select({ leadId: whatsappKisileri.leadId })
      .from(whatsappKisileri)
      .where(and(eq(whatsappKisileri.tenantId, ctx.tenantId), eq(whatsappKisileri.bsuid, bsuid)))
      .get()?.leadId ?? null
  );
}

/**
 * Kayda BSUID (ve görünen kullanıcı adı) yazar. BSUID başka bir kayıtta zaten varsa dokunmaz (false); kullanıcı adı
 * verilmişse güncellenir.
 */
export function bsuidAta(ctx: TenantContext, leadId: string, bsuid: string | null, kullaniciAdi?: string | null): boolean {
  return db.transaction((tx) => {
    const kayit = tx.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId))).get();
    if (!kayit) return false;
    const baska = bsuid
      ? tx
          .select({ leadId: whatsappKisileri.leadId })
          .from(whatsappKisileri)
          .where(and(eq(whatsappKisileri.tenantId, ctx.tenantId), eq(whatsappKisileri.bsuid, bsuid)))
          .get()
      : undefined;
    const bsuidYaz = bsuid && (!baska || baska.leadId === leadId) ? { bsuid } : {};
    const adYaz = kullaniciAdi !== undefined ? { waKullaniciAdi: kullaniciAdi } : {};
    if (!Object.keys(bsuidYaz).length && !Object.keys(adYaz).length) return false;
    const simdi = new Date();
    tx.insert(whatsappKisileri)
      .values({ tenantId: ctx.tenantId, leadId, ...bsuidYaz, ...adYaz })
      .onConflictDoUpdate({ target: [whatsappKisileri.tenantId, whatsappKisileri.leadId], set: { ...bsuidYaz, ...adYaz, guncellemeTarihi: simdi } })
      .run();
    // Ret verilmiş kayda sonradan bağlanan BSUID de engellenir.
    if (bsuidYaz.bsuid) retliKayitAdresleriniEngelle(tx, ctx, leadId, "whatsapp_ret");
    return Boolean(Object.keys(bsuidYaz).length);
  });
}

/** Kullanıcının BSUID'i değişti (user_changed_user_id / user_changed_number): eski kimlik yenisiyle değiştirilir. */
export function bsuidDegistir(ctx: TenantContext, eski: string, yeni: string): string | null {
  return db.transaction((tx) => {
    const g = tx
      .update(whatsappKisileri)
      .set({ bsuid: yeni, guncellemeTarihi: new Date() })
      .where(and(eq(whatsappKisileri.tenantId, ctx.tenantId), eq(whatsappKisileri.bsuid, eski)))
      .returning({ leadId: whatsappKisileri.leadId })
      .get();
    if (g) retliKayitAdresleriniEngelle(tx, ctx, g.leadId, "whatsapp_ret");
    return g?.leadId ?? null;
  });
}

export type ReklamBilgisi = { reklamKimligi: string | null; reklamBasligi: string | null; ctwaClid: string | null; pencereBitis: Date };

/** Mevcut kişinin son reklam bilgisi ve ücretsiz pencere bitişi (izni değiştirmez). */
export function reklamBilgisiYaz(ctx: TenantContext, leadId: string, r: ReklamBilgisi): boolean {
  const kayit = db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId))).get();
  if (!kayit) return false;
  db.insert(whatsappKisileri)
    .values({ tenantId: ctx.tenantId, leadId, ...r })
    .onConflictDoUpdate({ target: [whatsappKisileri.tenantId, whatsappKisileri.leadId], set: { ...r, guncellemeTarihi: new Date() } })
    .run();
  return true;
}

/**
 * Click-to-WhatsApp reklamından ilk kez yazan kişi: kaynak 'meta_reklam' kayıt + WhatsApp izni 'var'
 * ("WhatsApp'tan kendisi yazdı"), BSUID, reklam bilgisi — tek transaction. BSUID başka kayıttaysa null.
 */
export function reklamKisisiOlustur(
  ctx: TenantContext,
  g: { ad: string | null; telefon: string | null; bsuid: string | null; kullaniciAdi: string | null; aliciTuru: AliciTuru; reklam: ReklamBilgisi },
  simdi = new Date(),
): string | null {
  return db.transaction((tx) => {
    if (g.bsuid) {
      const var_ = tx
        .select({ leadId: whatsappKisileri.leadId })
        .from(whatsappKisileri)
        .where(and(eq(whatsappKisileri.tenantId, ctx.tenantId), eq(whatsappKisileri.bsuid, g.bsuid)))
        .get();
      if (var_) return null;
    }
    const aciklama = `Meta reklamından WhatsApp ile yazdı${g.reklam.reklamBasligi ? `: ${g.reklam.reklamBasligi}` : ""}`;
    const [kayit] = kisileriEkle(
      ctx,
      [{ kaynak: "meta_reklam", yetkiliAdi: g.ad, ekTelefon: g.telefon, aliciTuru: g.aliciTuru }],
      aciklama,
      tx,
    );
    tx.insert(whatsappKisileri)
      .values({
        tenantId: ctx.tenantId,
        leadId: kayit.id,
        bsuid: g.bsuid,
        waKullaniciAdi: g.kullaniciAdi,
        izin: "var",
        izinTarihi: simdi,
        izinKaynagi: "kendisi_yazdi",
        ...g.reklam,
      })
      .run();
    return kayit.id;
  });
}
