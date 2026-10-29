// Kayıtların WhatsApp (Cloud API) bilgileri: kanal izni ve kanıtı, BSUID, reklam kaynağı. leads ile 1:1; satır
// yoksa izin 'yok' sayılır. 'ret' yalnızca ret akışıyla (engel-listesi.ts retIsle, kayitGuncelle) yazılır ve
// buradan geri alınamaz.
import { and, eq, inArray } from "drizzle-orm";
import { WHATSAPP_IZIN_KAYNAK_ADLARI, WHATSAPP_IZNI_ADLARI, type WhatsappIzinKaynagi } from "@/lib/mesajlasma";
import { db } from "../db";
import { leadEvents, leads, whatsappKisileri, type WhatsappKisisi } from "../db/schema";
import type { TenantContext } from "./baglam";

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
