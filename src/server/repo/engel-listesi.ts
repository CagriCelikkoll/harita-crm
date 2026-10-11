// Engel listesi ve ret akışı. Ret nereden gelirse gelsin (abonelikten çıkma, SMS RET yanıtı, İYS reddi,
// WhatsApp "Ret istedi", kullanıcının elle işaretlemesi) aynı sonuç: kayıt ileti_izni = 'ret', adres(ler)
// engel listesinde, lead_events'te 'ret' olayı. Engel listesi kullanıcı verisidir; temizlikte silinmez.
import { and, count, eq, inArray } from "drizzle-orm";
import type { EngelKaynagi, EngelTuru } from "@/lib/mesajlasma";
import { db } from "../db";
import { engelListesi, leadEvents, leads } from "../db/schema";
import { kayitAdresOzetleri } from "../messaging/adres";
import type { TenantContext } from "./baglam";

export type EngelAdresi = { tur: EngelTuru; ozet: string };

/** Verilen özetlerden engel listesinde olanlar. */
export function engelliOzetler(ctx: TenantContext, ozetler: string[]): Set<string> {
  const benzersiz = [...new Set(ozetler)];
  const bulunan = new Set<string>();
  for (let i = 0; i < benzersiz.length; i += 500) {
    for (const s of db
      .select({ ozet: engelListesi.ozet })
      .from(engelListesi)
      .where(and(eq(engelListesi.tenantId, ctx.tenantId), inArray(engelListesi.ozet, benzersiz.slice(i, i + 500))))
      .all()) {
      bulunan.add(s.ozet);
    }
  }
  return bulunan;
}

export function engelSayisi(ctx: TenantContext): number {
  return db.select({ n: count() }).from(engelListesi).where(eq(engelListesi.tenantId, ctx.tenantId)).get()?.n ?? 0;
}

/** Adresleri engel listesine ekler (zaten varsa dokunmaz). */
export function engelEkle(ctx: TenantContext, adresler: EngelAdresi[], kaynak: EngelKaynagi, leadId: string | null = null) {
  if (!adresler.length) return;
  db.insert(engelListesi)
    .values(adresler.map((a) => ({ id: crypto.randomUUID(), tenantId: ctx.tenantId, tur: a.tur, ozet: a.ozet, kaynak, leadId })))
    .onConflictDoNothing({ target: [engelListesi.tenantId, engelListesi.tur, engelListesi.ozet] })
    .run();
}

/**
 * Ret akışı (tek yer). leadId bu kiracıya ait değilse kayda dokunulmaz; verilen adresler yine de
 * yalnızca BU kiracının engel listesine yazılır. Kaydın kendi adresleri (e-posta, ek telefon) de eklenir.
 * Dönüş: kayıt bulundu ve güncellendi mi.
 */
export function retIsle(
  ctx: TenantContext,
  girdi: { leadId: string | null; adresler: EngelAdresi[]; kaynak: EngelKaynagi; aciklama: string },
): boolean {
  return db.transaction((tx) => {
    const kayit = girdi.leadId
      ? tx
          .select({ id: leads.id, iletiIzni: leads.iletiIzni, eposta: leads.eposta, ekTelefon: leads.ekTelefon })
          .from(leads)
          .where(and(eq(leads.id, girdi.leadId), eq(leads.tenantId, ctx.tenantId)))
          .get()
      : undefined;
    const adresler = [...girdi.adresler, ...(kayit ? kayitAdresOzetleri(ctx.tenantId, kayit) : [])];
    if (adresler.length) {
      tx.insert(engelListesi)
        .values(
          adresler.map((a) => ({
            id: crypto.randomUUID(),
            tenantId: ctx.tenantId,
            tur: a.tur,
            ozet: a.ozet,
            kaynak: girdi.kaynak,
            leadId: kayit?.id ?? null,
          })),
        )
        .onConflictDoNothing({ target: [engelListesi.tenantId, engelListesi.tur, engelListesi.ozet] })
        .run();
    }
    if (!kayit) return false;
    if (kayit.iletiIzni === "ret") return true; // zaten ret: tekrar olay yazılmaz
    tx.update(leads)
      .set({ iletiIzni: "ret", guncellemeTarihi: new Date() })
      .where(and(eq(leads.id, kayit.id), eq(leads.tenantId, ctx.tenantId)))
      .run();
    tx.insert(leadEvents)
      .values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        leadId: kayit.id,
        tur: "ret",
        aciklama: girdi.aciklama,
        kullaniciId: ctx.userId || null,
        sistem: true,
      })
      .run();
    return true;
  });
}
