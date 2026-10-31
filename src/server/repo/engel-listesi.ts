// Engel listesi ve ret akışı. Ret nereden gelirse gelsin (abonelikten çıkma, SMS RET yanıtı, İYS reddi,
// WhatsApp "Ret istedi", kullanıcının elle işaretlemesi) aynı sonuç: kayıt ileti_izni = 'ret' (WhatsApp izni de), adres(ler)
// engel listesinde, lead_events'te 'ret' olayı. Engel listesi kullanıcı verisidir; temizlikte silinmez.
import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import type { EngelKaynagi, EngelTuru } from "@/lib/mesajlasma";
import { db } from "../db";
import { engelListesi, leadEvents, leads, messageQueue, whatsappKisileri, whatsappListesi } from "../db/schema";
import { adresOzeti, kayitAdresOzetleri } from "../messaging/adres";
import type { TenantContext } from "./baglam";

export type EngelAdresi = { tur: EngelTuru; ozet: string };

type Islem = Pick<typeof db, "select" | "selectDistinct" | "insert">;

/**
 * Bir kaydın bilinen TÜM adreslerinin özetleri: kaydın kendi adresleri (e-posta, ek telefon), WhatsApp BSUID'i,
 * kuyrukta gönderildiği adresler (gönderim anında Places'tan alınan telefon dahil; yalnızca özet tutulur) ve
 * WhatsApp günlük listesinde "WhatsApp'ta aç" ile çözülen numara. Ret verilmiş kayıt için hepsi engellenir.
 */
export function kayitTumAdresOzetleri(tx: Islem, ctx: TenantContext, leadId: string): EngelAdresi[] {
  const { tenantId } = ctx;
  const kayit = tx
    .select({ eposta: leads.eposta, ekTelefon: leads.ekTelefon })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
    .get();
  if (!kayit) return [];
  const bsuid = tx
    .select({ bsuid: whatsappKisileri.bsuid })
    .from(whatsappKisileri)
    .where(and(eq(whatsappKisileri.tenantId, tenantId), eq(whatsappKisileri.leadId, leadId)))
    .get()?.bsuid;
  const bsuidOzeti = bsuid ? adresOzeti(tenantId, "wa_kimlik", bsuid) : null;
  const sonuc: EngelAdresi[] = [...kayitAdresOzetleri(tenantId, kayit)];
  if (bsuidOzeti) sonuc.push({ tur: "wa_kimlik", ozet: bsuidOzeti });
  const gonderilen = tx
    .selectDistinct({ kanal: messageQueue.kanal, ozet: messageQueue.adresOzeti })
    .from(messageQueue)
    .where(and(eq(messageQueue.tenantId, tenantId), eq(messageQueue.leadId, leadId), isNotNull(messageQueue.adresOzeti)))
    .all();
  for (const g of gonderilen) {
    const tur: EngelTuru = g.kanal === "eposta" ? "eposta" : g.ozet === bsuidOzeti ? "wa_kimlik" : "telefon";
    sonuc.push({ tur, ozet: g.ozet! });
  }
  const acilan = tx
    .selectDistinct({ ozet: whatsappListesi.adresOzeti })
    .from(whatsappListesi)
    .where(and(eq(whatsappListesi.tenantId, tenantId), eq(whatsappListesi.leadId, leadId), isNotNull(whatsappListesi.adresOzeti)))
    .all();
  for (const a of acilan) sonuc.push({ tur: "telefon", ozet: a.ozet! });
  const gorulen = new Set<string>();
  return sonuc.filter((a) => !gorulen.has(`${a.tur}|${a.ozet}`) && gorulen.add(`${a.tur}|${a.ozet}`));
}

/**
 * Kayıt 'ret' ise bilinen tüm adreslerini engel listesine yazar (zaten varsa dokunmaz). Ret verilmiş kayda adres
 * eklenen her yol (kayıt güncelleme, içe aktarmada boş alan doldurma, BSUID bağlama) bunu aynı transaction'da çağırır.
 */
export function retliKayitAdresleriniEngelle(tx: Islem, ctx: TenantContext, leadId: string, kaynak: EngelKaynagi = "kayit_ret") {
  const { tenantId } = ctx;
  const kayit = tx
    .select({ iletiIzni: leads.iletiIzni })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
    .get();
  if (kayit?.iletiIzni !== "ret") return;
  const adresler = kayitTumAdresOzetleri(tx, ctx, leadId);
  if (!adresler.length) return;
  tx.insert(engelListesi)
    .values(adresler.map((a) => ({ id: crypto.randomUUID(), tenantId, tur: a.tur, ozet: a.ozet, kaynak, leadId })))
    .onConflictDoNothing({ target: [engelListesi.tenantId, engelListesi.tur, engelListesi.ozet] })
    .run();
}

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
          .select({ id: leads.id, iletiIzni: leads.iletiIzni })
          .from(leads)
          .where(and(eq(leads.id, girdi.leadId), eq(leads.tenantId, ctx.tenantId)))
          .get()
      : undefined;
    const waKisi = kayit
      ? tx
          .select({ izin: whatsappKisileri.izin })
          .from(whatsappKisileri)
          .where(and(eq(whatsappKisileri.tenantId, ctx.tenantId), eq(whatsappKisileri.leadId, kayit.id)))
          .get()
      : undefined;
    const adresler = [
      ...girdi.adresler,
      // Kaydın tüm bilinen adresleri: kendi adresleri, BSUID, gönderildiği (Places dahil) ve açıldığı numaralar.
      ...(kayit ? kayitTumAdresOzetleri(tx, ctx, kayit.id) : []),
    ];
    // Ret tüm kanallar içindir: kaydın WhatsApp (Cloud API) izni de 'ret' olur.
    if (kayit && waKisi?.izin !== "ret") {
      const simdi = new Date();
      tx.insert(whatsappKisileri)
        .values({ tenantId: ctx.tenantId, leadId: kayit.id, izin: "ret", izinTarihi: simdi })
        .onConflictDoUpdate({
          target: [whatsappKisileri.tenantId, whatsappKisileri.leadId],
          set: { izin: "ret", izinTarihi: simdi, guncellemeTarihi: simdi },
        })
        .run();
    }
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

/**
 * Kendi adreslerinden (e-posta, ek telefon) biri engel listesinde olan kayıtlar. Listede ve detayda "Engelli"
 * işareti için: engelli bir adresle içe aktarılan / eklenen kişi ret vermemiş görünse de ona gönderilmez.
 */
export function engelliKayitlar(ctx: TenantContext, kayitlar: { id: string; eposta: string | null; ekTelefon: string | null }[]): Set<string> {
  const ozetleri = new Map(kayitlar.map((k) => [k.id, kayitAdresOzetleri(ctx.tenantId, k).map((a) => a.ozet)]));
  const engelli = engelliOzetler(ctx, [...ozetleri.values()].flat());
  return new Set([...ozetleri].filter(([, o]) => o.some((x) => engelli.has(x))).map(([id]) => id));
}
