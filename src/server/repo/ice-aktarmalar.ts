// Kişi içe aktarma oturumları. Ayrıştırılmış satırlar oturum boyunca burada (geçici) tutulur; uygulama tek
// transaction'da yapılır: yeni kişiler, WhatsApp izinleri, çakışan kayıtlarda boş alan doldurma, oturumun kapanması.
// Aynı oturum iki kez uygulanamaz (durum 'hazirlaniyor' → 'tamamlandi' atomik).
import { and, eq, sql } from "drizzle-orm";
import { IZIN_BEYANI_SURUMU, type SutunEslemi } from "@/lib/ice-aktarma";
import type { WhatsappIzinKaynagi } from "@/lib/mesajlasma";
import { db } from "../db";
import { iceAktarmalar, leadEvents, leads, whatsappKisileri, type IceAktarma } from "../db/schema";
import type { TenantContext } from "./baglam";
import { kisileriEkle, type YeniKisi } from "./kayitlar";

export type { IceAktarma };

export function iceAktarmaOlustur(ctx: TenantContext, g: { dosyaAdi: string; satirlar: string[][] }): IceAktarma {
  return db
    .insert(iceAktarmalar)
    .values({
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId,
      kullaniciId: ctx.userId || null,
      dosyaAdi: g.dosyaAdi,
      satirlar: g.satirlar,
      toplam: Math.max(0, g.satirlar.length - 1),
    })
    .returning()
    .get();
}

export function iceAktarmaGetir(ctx: TenantContext, id: string): IceAktarma | null {
  return (
    db
      .select()
      .from(iceAktarmalar)
      .where(and(eq(iceAktarmalar.id, id), eq(iceAktarmalar.tenantId, ctx.tenantId)))
      .get() ?? null
  );
}

/** Yalnızca hazırlanan oturum iptal edilir; satırlar silinir. */
export function iceAktarmaIptal(ctx: TenantContext, id: string): boolean {
  return Boolean(
    db
      .update(iceAktarmalar)
      .set({ durum: "iptal", satirlar: null })
      .where(and(eq(iceAktarmalar.id, id), eq(iceAktarmalar.tenantId, ctx.tenantId), eq(iceAktarmalar.durum, "hazirlaniyor")))
      .returning({ id: iceAktarmalar.id })
      .get(),
  );
}

export type IzinBilgisi = {
  izin: "var";
  kaynak: WhatsappIzinKaynagi;
  tarih: Date;
  iysBeyani: boolean;
};

export type IceAktarmaPlani = {
  eslem: SutunEslemi;
  yeniler: { kisi: YeniKisi; izin: IzinBilgisi | null }[];
  /** Çakışan kayıtlarda yalnızca boş olan alanlar doldurulur (bos_doldur politikası). */
  doldurmalar: {
    leadId: string;
    alanlar: Partial<Pick<YeniKisi, "isletmeAdi" | "yetkiliAdi" | "eposta">>;
    izin: IzinBilgisi | null;
  }[];
  sayilar: { hatali: number; cakisan: number; engelli: number };
  /** true: izinli satır var ve kullanıcı beyanı onayladı. */
  beyanOnaylandi: boolean;
};

export type IceAktarmaSonucu = { eklenen: string[]; guncellenen: string[] };

/**
 * Planı uygular. Oturum bu kiracıya ait değilse ya da zaten uygulanmış/iptal edilmişse null.
 * İzin 'ret' olan mevcut kayıtlarda izin değiştirilmez (ret geri alınamaz).
 */
export function iceAktarmaUygula(ctx: TenantContext, id: string, plan: IceAktarmaPlani): IceAktarmaSonucu | null {
  return db.transaction((tx) => {
    const simdi = new Date();
    const oturum = tx
      .update(iceAktarmalar)
      .set({ durum: "tamamlandi", tamamlanmaTarihi: simdi, satirlar: null, eslem: plan.eslem })
      .where(and(eq(iceAktarmalar.id, id), eq(iceAktarmalar.tenantId, ctx.tenantId), eq(iceAktarmalar.durum, "hazirlaniyor")))
      .returning()
      .get();
    if (!oturum) return null;

    const aciklama = `İçe aktarma: ${oturum.dosyaAdi}`;
    const eklenenler = kisileriEkle(
      ctx,
      plan.yeniler.map((y) => y.kisi),
      aciklama,
      tx,
    );
    const izinSatiri = (leadId: string, izin: IzinBilgisi) => ({
      tenantId: ctx.tenantId,
      leadId,
      izin: izin.izin,
      izinTarihi: izin.tarih,
      izinKaynagi: izin.kaynak,
      izinIceAktarmaId: id,
      iysBeyanTarihi: izin.iysBeyani ? simdi : null,
    });
    const izinliYeniler = eklenenler.flatMap((k, i) => {
      const izin = plan.yeniler[i].izin;
      return izin ? [izinSatiri(k.id, izin)] : [];
    });
    for (let i = 0; i < izinliYeniler.length; i += 200) {
      tx.insert(whatsappKisileri).values(izinliYeniler.slice(i, i + 200)).run();
    }

    const guncellenen: string[] = [];
    for (const d of plan.doldurmalar) {
      const kosul = and(eq(leads.id, d.leadId), eq(leads.tenantId, ctx.tenantId));
      const eski = tx.select().from(leads).where(kosul).get();
      if (!eski) continue;
      const set: Partial<typeof leads.$inferInsert> = {};
      if (d.alanlar.isletmeAdi && !eski.isletmeAdi) set.isletmeAdi = d.alanlar.isletmeAdi;
      if (d.alanlar.yetkiliAdi && !eski.yetkiliAdi) set.yetkiliAdi = d.alanlar.yetkiliAdi;
      if (d.alanlar.eposta && !eski.eposta) set.eposta = d.alanlar.eposta;
      let izinVerildi = false;
      if (d.izin) {
        const sonuc = tx
          .insert(whatsappKisileri)
          .values(izinSatiri(d.leadId, d.izin))
          .onConflictDoUpdate({
            target: [whatsappKisileri.tenantId, whatsappKisileri.leadId],
            set: { ...izinSatiri(d.leadId, d.izin), guncellemeTarihi: simdi },
            // Yalnızca izni 'yok' olan doldurulur; 'var' korunur, 'ret' asla geri alınmaz.
            setWhere: sql`${whatsappKisileri.izin} = 'yok'`,
          })
          .returning({ leadId: whatsappKisileri.leadId })
          .get();
        izinVerildi = Boolean(sonuc);
      }
      const alanSayisi = Object.keys(set).length;
      if (!alanSayisi && !izinVerildi) continue;
      if (alanSayisi) tx.update(leads).set({ ...set, guncellemeTarihi: simdi }).where(kosul).run();
      const ALAN_ADLARI = { isletmeAdi: "işletme adı", yetkiliAdi: "ad", eposta: "e-posta" } as const;
      const degisen = [
        ...Object.keys(set).map((a) => ALAN_ADLARI[a as keyof typeof ALAN_ADLARI]),
        ...(izinVerildi ? ["WhatsApp izni"] : []),
      ];
      tx.insert(leadEvents)
        .values({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          leadId: d.leadId,
          tur: "not",
          aciklama: `${aciklama} — boş alanlar dolduruldu: ${degisen.join(", ")}`,
          kullaniciId: ctx.userId || null,
          sistem: true,
        })
        .run();
      guncellenen.push(d.leadId);
    }

    tx.update(iceAktarmalar)
      .set({
        eklenen: eklenenler.length,
        guncellenen: guncellenen.length,
        hatali: plan.sayilar.hatali,
        cakisan: plan.sayilar.cakisan,
        engelli: plan.sayilar.engelli,
        ...(plan.beyanOnaylandi ? { beyanOnayTarihi: simdi, beyanSurumu: IZIN_BEYANI_SURUMU } : {}),
      })
      .where(eq(iceAktarmalar.id, id))
      .run();
    return { eklenen: eklenenler.map((k) => k.id), guncellenen };
  });
}

