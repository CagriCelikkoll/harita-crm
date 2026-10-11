// Kuyruk satırının sonuçlandırılması (işçi, satırı repo/sistem/isci.ts → mesajlariAl ile atomik olarak
// "gonderiliyor" durumuna aldıktan sonra). Her güncelleme yalnızca "gonderiliyor" durumundaki satıra yapılır:
// aynı mesaj iki kez sonuçlandırılamaz.
import { and, eq, sql } from "drizzle-orm";
import { KAYIT_DURUM_ADLARI } from "@/lib/sabitler";
import type { MesajDurumu } from "@/lib/mesajlasma";
import { db } from "../db";
import { leadEvents, leads, messageQueue, type KuyrukMesaji } from "../db/schema";
import type { TenantContext } from "./baglam";

export type { KuyrukMesaji };

export function mesajGetir(ctx: TenantContext, id: string): KuyrukMesaji | null {
  return (
    db
      .select()
      .from(messageQueue)
      .where(and(eq(messageQueue.id, id), eq(messageQueue.tenantId, ctx.tenantId)))
      .get() ?? null
  );
}

const gonderiliyorKosulu = (ctx: TenantContext, id: string) =>
  and(eq(messageQueue.id, id), eq(messageQueue.tenantId, ctx.tenantId), eq(messageQueue.durum, "gonderiliyor"));

/**
 * Gönderildi: kuyruk satırı, lead_events (kanal olayı) ve — sandbox değilse — 'yeni' → 'iletisimde'.
 * Satır "gonderiliyor" değilse hiçbir şey yazılmaz (false).
 */
export function mesajGonderildi(
  ctx: TenantContext,
  id: string,
  g: {
    saglayiciKimligi: string | null;
    sandbox: boolean;
    sandboxIcerik: string | null;
    olayAciklamasi: string;
    /** Gönderilen adresin engel listesi özeti (adresin kendisi saklanmaz). */
    adresOzeti?: string | null;
  },
  simdi = new Date(),
): boolean {
  return db.transaction((tx) => {
    const m = tx
      .update(messageQueue)
      .set({
        durum: "gonderildi",
        neden: null,
        hata: null,
        saglayiciKimligi: g.saglayiciKimligi,
        adresOzeti: g.adresOzeti ?? null,
        sandboxIcerik: g.sandbox ? g.sandboxIcerik : null,
        gonderimTarihi: simdi,
        kilitZamani: null,
      })
      .where(gonderiliyorKosulu(ctx, id))
      .returning({ leadId: messageQueue.leadId, kanal: messageQueue.kanal })
      .get();
    if (!m) return false;
    const olay = (tur: "eposta" | "sms" | "durum", aciklama: string) =>
      tx
        .insert(leadEvents)
        .values({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          leadId: m.leadId,
          tur,
          aciklama,
          kullaniciId: ctx.userId || null,
          sistem: true,
          tarih: simdi,
        })
        .run();
    olay(m.kanal, g.sandbox ? `(test) ${g.olayAciklamasi}` : g.olayAciklamasi);
    if (!g.sandbox) {
      const ilerledi = tx
        .update(leads)
        .set({ durum: "iletisimde", guncellemeTarihi: simdi })
        .where(and(eq(leads.id, m.leadId), eq(leads.tenantId, ctx.tenantId), eq(leads.durum, "yeni")))
        .returning({ id: leads.id })
        .get();
      if (ilerledi) olay("durum", `${KAYIT_DURUM_ADLARI.yeni} → ${KAYIT_DURUM_ADLARI.iletisimde}`);
    }
    return true;
  });
}

/**
 * "gonderiliyor" satırını başka bir duruma bırakır: kuyruğa geri (bekleme / yeniden deneme), hariç,
 * başarısız ya da iptal. denemeGeriAl: gönderim denenmediyse (saat penceresi, günlük sınır) deneme sayılmaz.
 */
export function mesajBirak(
  ctx: TenantContext,
  id: string,
  b: {
    durum: Exclude<MesajDurumu, "gonderiliyor" | "gonderildi">;
    neden: string | null;
    hata?: string | null;
    sonrakiDeneme?: Date | null;
    denemeGeriAl?: boolean;
    sayacGunu?: string | null;
  },
): boolean {
  return Boolean(
    db
      .update(messageQueue)
      .set({
        durum: b.durum,
        neden: b.neden,
        hata: b.hata ?? null,
        sonrakiDeneme: b.sonrakiDeneme ?? null,
        kilitZamani: null,
        ...(b.denemeGeriAl ? { denemeSayisi: sql`max(0, ${messageQueue.denemeSayisi} - 1)` } : {}),
        ...(b.sayacGunu !== undefined ? { sayacGunu: b.sayacGunu } : {}),
      })
      .where(gonderiliyorKosulu(ctx, id))
      .returning({ id: messageQueue.id })
      .get(),
  );
}

/** Bu adrese (özetine) gönderim yapılmış kayıtlar: gelen SMS RET yanıtını kayda bağlamak için. */
export function adreseGonderilenKayitlar(ctx: TenantContext, adresOzeti: string): string[] {
  return db
    .selectDistinct({ leadId: messageQueue.leadId })
    .from(messageQueue)
    .where(and(eq(messageQueue.tenantId, ctx.tenantId), eq(messageQueue.adresOzeti, adresOzeti)))
    .all()
    .map((s) => s.leadId);
}
