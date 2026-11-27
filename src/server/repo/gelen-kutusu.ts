// Gelen kutusu: sohbetler (kişi × numara), mesajlar, iç notlar ve canlı yenileme sayacı. Her fonksiyon çalışma alanı
// (ctx.tenantId) ile süzer. Sohbeti ya da mesajı değiştiren her işlem çalışma alanının sayacını (gelen_kutusu_surumu)
// artırır ve yeni değeri satırın surum alanına yazar: istemci "bu sürümden sonrası" diye sorar (degisiklikler).
// İç fonksiyonlar kendi transaction'larını açar; çağıranın transaction'ı içinde savepoint olur (better-sqlite3).
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { WHATSAPP_TESLIM_SIRASI } from "@/lib/whatsapp-api";
import { DENETIM_SOHBET_SILME } from "@/lib/denetim";
import {
  MESAJ_SAYFA_BOYUTU,
  medyaIndirilir,
  PENCERE_MS,
  PENCERE_UYARI_MS,
  SOHBET_CIPLERI,
  SOHBET_SAYFA_BOYUTU,
  TOPLU_KAPATMA_AZAMI,
  type MesajKaynagi,
  type SohbetCipi,
  type SohbetDurumu,
  type SohbetMesajTuru,
} from "@/lib/gelen-kutusu";
import { db } from "../db";
import {
  bildirimKuyrugu,
  denetimKayitlari,
  gelenKutusuSurumu,
  leadEvents,
  kampanyalar,
  leads,
  memberships,
  sohbetler,
  sohbetMedyalari,
  sohbetMesajlari,
  sohbetNotlari,
  user,
  type Sohbet,
  type SohbetMedyasi,
  type SohbetMesaji,
} from "../db/schema";
import { KayitKuraliHatasi, likeKacir, yoneticiOlmali, type TenantContext } from "./baglam";

export type { Sohbet, SohbetMedyasi, SohbetMesaji };

/** Çalışma alanının sayacını bir artırır ve yeni değeri döner. */
function surumAl(ctx: TenantContext): number {
  return db
    .insert(gelenKutusuSurumu)
    .values({ tenantId: ctx.tenantId, surum: 1 })
    .onConflictDoUpdate({ target: gelenKutusuSurumu.tenantId, set: { surum: sql`${gelenKutusuSurumu.surum} + 1` } })
    .returning({ surum: gelenKutusuSurumu.surum })
    .get().surum;
}

/** Çalışma alanının şu anki sürümü (hiç değişiklik yoksa 0). */
export function gelenKutusuSurumuGetir(ctx: TenantContext): number {
  return db.select({ s: gelenKutusuSurumu.surum }).from(gelenKutusuSurumu).where(eq(gelenKutusuSurumu.tenantId, ctx.tenantId)).get()?.s ?? 0;
}

export function sohbetGetir(ctx: TenantContext, id: string): Sohbet | null {
  return db.select().from(sohbetler).where(and(eq(sohbetler.tenantId, ctx.tenantId), eq(sohbetler.id, id))).get() ?? null;
}

export function sohbetBul(ctx: TenantContext, baglantiId: string, leadId: string): Sohbet | null {
  return (
    db
      .select()
      .from(sohbetler)
      .where(and(eq(sohbetler.tenantId, ctx.tenantId), eq(sohbetler.baglantiId, baglantiId), eq(sohbetler.leadId, leadId)))
      .get() ?? null
  );
}

/** Sohbet yoksa açar (ilk durumu verilen); varsa olduğu gibi döner. Kayıt bu çalışma alanının olmalı. */
function sohbetHazirla(ctx: TenantContext, baglantiId: string, leadId: string, ilkDurum: SohbetDurumu, simdi: Date): Sohbet {
  const kayit = db.select({ id: leads.id }).from(leads).where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, leadId))).get();
  if (!kayit) throw new Error("Sohbet yalnızca bu çalışma alanının kaydına açılabilir.");
  db.insert(sohbetler)
    .values({ id: crypto.randomUUID(), tenantId: ctx.tenantId, baglantiId, leadId, durum: ilkDurum, olusturmaTarihi: simdi })
    .onConflictDoNothing()
    .run();
  return sohbetBul(ctx, baglantiId, leadId)!;
}

/**
 * İşletmenin başlattığı sohbet (gelen kutusu "Şablon gönder"): sohbet yoksa açık olarak açılır, varsa kapalıysa
 * yeniden açılır; listede en üste gelir (son mesaj tarihi şimdi). Gönderilen şablon işçi gönderince sohbete düşer.
 */
export function sohbetBaslat(ctx: TenantContext, baglantiId: string, leadId: string, simdi = new Date()): Sohbet {
  return db.transaction(() => {
    const sohbet = sohbetHazirla(ctx, baglantiId, leadId, "acik", simdi);
    const surum = surumAl(ctx);
    return db
      .update(sohbetler)
      .set({ durum: "acik", sonMesajTarihi: sql`max(coalesce(${sohbetler.sonMesajTarihi}, 0), ${simdi.getTime()})`, surum })
      .where(and(eq(sohbetler.tenantId, ctx.tenantId), eq(sohbetler.id, sohbet.id)))
      .returning()
      .get()!;
  });
}

export type GelenMesajGirdisi = {
  baglantiId: string;
  leadId: string;
  wamid: string;
  tur: SohbetMesajTuru;
  metin: string | null;
  medyaId: string | null;
  /** Webhook'taki medya bilgisi (MIME, belgenin adı, Meta'nın sha256 özeti). İndirilen türlerde "bekliyor" satırı açar. */
  medya?: { mime: string | null; dosyaAdi: string | null; metaSha256: string | null } | null;
  /** Meta'nın bildirdiği yazılma anı; yoksa simdi. */
  metaZamani: Date | null;
  /** Kişi bir mesaja yanıt verdi (context.id): yanıtlanan mesajın wamid'i. */
  yanitWamid?: string | null;
  /** WhatsApp profil adı: kayıtta ad yoksa bildirimde gösterilir (bildirim kuyruğuna yazılır). */
  profilAdi?: string | null;
  /** Müşteri teklif / ilgi butonuna bastı (Meta buton yükünden; lib/gelen-kutusu teklifIlgiButonuMu). */
  teklifIstegi?: boolean;
};

/**
 * Müşterinin yazdığı mesaj: sohbeti (yoksa) açar, kapalıysa yeniden açar, okunmamışı artırır, 24 saat penceresini
 * (son_gelen_tarihi) ilerletir. Aynı wamid ikinci kez yazılmaz (null döner). Fotoğraf, belge ve seste aynı transaction'da
 * "bekliyor" medya satırı eklenir (indirme işçide; webhook ağ isteği yapmaz). Aynı transaction'da sohbet bildirim
 * kuyruğuna yazılır (sohbet başına tek satır: art arda gelen mesajlar tek bildirimde birleşir; gönderim işçide).
 */
export function gelenMesajYaz(ctx: TenantContext, g: GelenMesajGirdisi, simdi = new Date()): { sohbetId: string; mesajId: string } | null {
  return db.transaction(() => {
    const sohbet = sohbetHazirla(ctx, g.baglantiId, g.leadId, "acik", simdi);
    const tarih = g.metaZamani && g.metaZamani.getTime() <= simdi.getTime() ? g.metaZamani : simdi;
    const surum = surumAl(ctx);
    const mesaj = db
      .insert(sohbetMesajlari)
      .values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        sohbetId: sohbet.id,
        yon: "gelen",
        kaynak: "musteri",
        wamid: g.wamid,
        tur: g.tur,
        metin: g.metin,
        medyaId: g.medyaId,
        yanitWamid: g.yanitWamid?.slice(0, 200) ?? null,
        metaZamani: g.metaZamani,
        tarih,
        surum,
        olusturmaTarihi: simdi,
      })
      .onConflictDoNothing()
      .returning({ id: sohbetMesajlari.id })
      .get();
    if (!mesaj) return null;
    if (g.medyaId && medyaIndirilir(g.tur)) {
      db.insert(sohbetMedyalari)
        .values({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          mesajId: mesaj.id,
          metaMedyaId: g.medyaId,
          mime: g.medya?.mime?.slice(0, 200) ?? null,
          dosyaAdi: g.medya?.dosyaAdi?.slice(0, 255) ?? null,
          metaSha256: g.medya?.metaSha256?.slice(0, 200) ?? null,
          olusturmaTarihi: simdi,
        })
        .run();
    }
    db.update(sohbetler)
      .set({
        durum: "acik",
        okunmamis: sql`${sohbetler.okunmamis} + 1`,
        sonGelenTarihi: sql`max(coalesce(${sohbetler.sonGelenTarihi}, 0), ${tarih.getTime()})`,
        sonMesajTarihi: sql`max(coalesce(${sohbetler.sonMesajTarihi}, 0), ${tarih.getTime()})`,
        ...(g.teklifIstegi ? { teklifIstegiTarihi: sql`max(coalesce(${sohbetler.teklifIstegiTarihi}, 0), ${tarih.getTime()})` } : {}),
        surum,
      })
      .where(and(eq(sohbetler.tenantId, ctx.tenantId), eq(sohbetler.id, sohbet.id)))
      .run();
    const profilAdi = g.profilAdi?.slice(0, 120) ?? null;
    db.insert(bildirimKuyrugu)
      .values({ tenantId: ctx.tenantId, sohbetId: sohbet.id, profilAdi, olusturmaTarihi: simdi })
      .onConflictDoUpdate({ target: [bildirimKuyrugu.tenantId, bildirimKuyrugu.sohbetId], set: { profilAdi } })
      .run();
    return { sohbetId: sohbet.id, mesajId: mesaj.id };
  });
}

export type GidenMesajGirdisi = {
  baglantiId: string;
  leadId: string;
  kaynak: Exclude<MesajKaynagi, "musteri">;
  tur: SohbetMesajTuru;
  metin: string | null;
  wamid: string | null;
  istemciKimligi?: string | null;
  gonderenKullanici?: string | null;
  kampanyaId?: string | null;
  teslimDurumu: string | null;
  teslimHataKodu?: number | null;
  /** Sohbet yoksa ilk durumu: kampanya mesajı sohbeti kapalı açar (müşteri cevap verince açılır). */
  ilkDurum: SohbetDurumu;
  /** Yanıtlanan mesajın wamid'i (gönderimde context.message_id). */
  yanitWamid?: string | null;
  /** Gönderilemediyse kullanıcıya gösterilen neden. */
  hataMetni?: string | null;
  /**
   * Gelen kutusundan gönderilen dosya (diske yazılmış ve doğrulanmış): aynı transaction'da sohbet_medyalari satırı
   * ("indirildi"; gelen medyayla aynı klasör, kota ve saklama süresi). metaMedyaId: Meta'ya yüklendiyse kimliği.
   */
  medya?: { yol: string; mime: string; boyut: number; sha256: string; dosyaAdi: string; metaMedyaId: string | null } | null;
};

/** İşletmenin gönderdiği mesaj (temsilci, kampanya …). Sohbetin durumunu değiştirmez; okunmamışı artırmaz. */
export function gidenMesajYaz(ctx: TenantContext, g: GidenMesajGirdisi, simdi = new Date()): SohbetMesaji {
  return db.transaction(() => {
    const sohbet = sohbetHazirla(ctx, g.baglantiId, g.leadId, g.ilkDurum, simdi);
    const surum = surumAl(ctx);
    const mesaj = db
      .insert(sohbetMesajlari)
      .values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        sohbetId: sohbet.id,
        yon: "giden",
        kaynak: g.kaynak,
        wamid: g.wamid,
        istemciKimligi: g.istemciKimligi ?? null,
        tur: g.tur,
        metin: g.metin,
        gonderenKullanici: g.gonderenKullanici ?? null,
        kampanyaId: g.kampanyaId ?? null,
        teslimDurumu: g.teslimDurumu,
        teslimHataKodu: g.teslimHataKodu ?? null,
        hataMetni: g.hataMetni?.slice(0, 500) ?? null,
        yanitWamid: g.yanitWamid ?? null,
        tarih: simdi,
        surum,
        olusturmaTarihi: simdi,
      })
      .returning()
      .get();
    if (g.medya) {
      db.insert(sohbetMedyalari)
        .values({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          mesajId: mesaj.id,
          metaMedyaId: g.medya.metaMedyaId,
          mime: g.medya.mime,
          boyut: g.medya.boyut,
          sha256: g.medya.sha256,
          dosyaAdi: g.medya.dosyaAdi.slice(0, 255),
          yol: g.medya.yol,
          durum: "indirildi",
          indirmeTarihi: simdi,
          olusturmaTarihi: simdi,
        })
        .run();
    }
    db.update(sohbetler)
      .set({ sonMesajTarihi: sql`max(coalesce(${sohbetler.sonMesajTarihi}, 0), ${simdi.getTime()})`, surum })
      .where(and(eq(sohbetler.tenantId, ctx.tenantId), eq(sohbetler.id, sohbet.id)))
      .run();
    return mesaj;
  });
}

/** Aynı istemci kimliğiyle daha önce yazılmış mesaj (çift gönderim koruması). */
export function istemciMesajiBul(ctx: TenantContext, istemciKimligi: string): SohbetMesaji | null {
  return (
    db
      .select()
      .from(sohbetMesajlari)
      .where(and(eq(sohbetMesajlari.tenantId, ctx.tenantId), eq(sohbetMesajlari.istemciKimligi, istemciKimligi)))
      .get() ?? null
  );
}

/**
 * Gönderilemeyen medya mesajının yeniden denenmesinin sonucu: aynı mesaj satırı güncellenir (yeni wamid, durum, hata),
 * medyanın Meta kimliği yazılır. Yalnızca hâlâ "failed" olan giden mesaj; güncellendiyse true.
 */
export function gidenMesajSonucuYaz(
  ctx: TenantContext,
  mesajId: string,
  g: { wamid: string | null; teslimDurumu: string; teslimHataKodu: number | null; hataMetni: string | null; metaMedyaId?: string | null },
): boolean {
  return db.transaction(() => {
    const m = db
      .select({ id: sohbetMesajlari.id, sohbetId: sohbetMesajlari.sohbetId })
      .from(sohbetMesajlari)
      .where(
        and(
          eq(sohbetMesajlari.tenantId, ctx.tenantId),
          eq(sohbetMesajlari.id, mesajId),
          eq(sohbetMesajlari.yon, "giden"),
          eq(sohbetMesajlari.teslimDurumu, "failed"),
        ),
      )
      .get();
    if (!m) return false;
    const surum = surumAl(ctx);
    db.update(sohbetMesajlari)
      .set({ wamid: g.wamid, teslimDurumu: g.teslimDurumu, teslimHataKodu: g.teslimHataKodu, hataMetni: g.hataMetni?.slice(0, 500) ?? null, surum })
      .where(and(eq(sohbetMesajlari.tenantId, ctx.tenantId), eq(sohbetMesajlari.id, m.id)))
      .run();
    if (g.metaMedyaId !== undefined) {
      db.update(sohbetMedyalari)
        .set({ metaMedyaId: g.metaMedyaId })
        .where(and(eq(sohbetMedyalari.tenantId, ctx.tenantId), eq(sohbetMedyalari.mesajId, m.id)))
        .run();
    }
    db.update(sohbetler).set({ surum }).where(and(eq(sohbetler.tenantId, ctx.tenantId), eq(sohbetler.id, m.sohbetId))).run();
    return true;
  });
}

/** Meta durum bildirimi: yalnızca ileri gider (sent < failed < delivered < read). Mesaj yoksa false. */
export function mesajTeslimDurumuYaz(ctx: TenantContext, wamid: string, durum: string, hataKodu: number | null): boolean {
  return db.transaction(() => {
    const m = db
      .select({ id: sohbetMesajlari.id, sohbetId: sohbetMesajlari.sohbetId, teslim: sohbetMesajlari.teslimDurumu })
      .from(sohbetMesajlari)
      .where(and(eq(sohbetMesajlari.tenantId, ctx.tenantId), eq(sohbetMesajlari.wamid, wamid)))
      .get();
    if (!m) return false;
    const sira = (d: string | null) => (d ? (WHATSAPP_TESLIM_SIRASI[d] ?? 0) : 0);
    if (sira(durum) <= sira(m.teslim)) return true;
    const surum = surumAl(ctx);
    db.update(sohbetMesajlari)
      .set({ teslimDurumu: durum, teslimHataKodu: durum === "failed" ? hataKodu : null, surum })
      .where(eq(sohbetMesajlari.id, m.id))
      .run();
    db.update(sohbetler).set({ surum }).where(and(eq(sohbetler.tenantId, ctx.tenantId), eq(sohbetler.id, m.sohbetId))).run();
    return true;
  });
}

// --- Liste ---

export type SohbetFiltresi = {
  baglantiId?: string;
  durum?: SohbetDurumu;
  /** Kullanıcı kimliği ya da "yok" (atanmamış). */
  atanan?: string;
  arama?: string;
  /** Yalnızca bu sohbetler (değişiklik ucu). */
  idler?: string[];
  /** Çipler (hepsi VE ile; lib/gelen-kutusu SOHBET_CIPLERI). "pencere" şimdiye göre hesaplanır. */
  cipler?: SohbetCipi[];
  simdi?: Date;
  sayfa?: number;
};

export type SohbetSatiri = Sohbet & {
  isletmeAdi: string | null;
  yetkiliAdi: string | null;
  telefon: string | null;
  atananAd: string | null;
  sonTur: SohbetMesajTuru | null;
  sonMetin: string | null;
  sonIcerikSilindi: boolean | null;
  /** Son ileti belge / medyaysa dosya adı (liste önizlemesi: "📎 Belge: dosya.pdf"). */
  sonDosyaAdi?: string | null;
  /** Kişi RET verdi (kaydın ileti izni ya da WhatsApp izni "ret"). */
  ret?: boolean;
};

/** Kişi RET verdi: kaydın ileti izni ya da WhatsApp izni. */
const RET_KOSULU = sql`(${leads.iletiIzni} = 'ret' or exists (select 1 from whatsapp_kisileri w where w.tenant_id = ${sohbetler.tenantId} and w.lead_id = ${sohbetler.leadId} and w.izin = 'ret'))`;

/** Çipin SQL koşulu (sohbetler + leads birleşimi üzerinde). */
function cipKosulu(cip: SohbetCipi, simdi: Date): SQL {
  switch (cip) {
    case "okunmamis":
      return sql`${sohbetler.okunmamis} > 0`;
    case "cevap_bekleyen":
      // Müşterinin son mesajından sonra (aynı an dahil) gönderilmiş bir giden mesaj yok; Meta'nın "iletilemedi" dediği
      // giden mesaj yanıt sayılmaz (müşteri hâlâ bekliyor).
      return sql`(${sohbetler.sonGelenTarihi} is not null and not exists (select 1 from sohbet_mesajlari m where m.tenant_id = ${sohbetler.tenantId} and m.sohbet_id = ${sohbetler.id} and m.yon = 'giden' and m.tarih >= ${sohbetler.sonGelenTarihi} and coalesce(m.teslim_durumu, '') <> 'failed'))`;
    case "teklif":
      return sql`${sohbetler.teklifIstegiTarihi} is not null`;
    case "pencere": {
      // Açık sohbet; pencere hâlâ açık ve bitmesine PENCERE_UYARI_MS'den az var: son gelen ∈ (şimdi − 24 sa, şimdi − 21 sa].
      const t = simdi.getTime();
      return sql`(${sohbetler.durum} = 'acik' and ${sohbetler.sonGelenTarihi} > ${t - PENCERE_MS} and ${sohbetler.sonGelenTarihi} <= ${t - PENCERE_MS + PENCERE_UYARI_MS})`;
    }
    case "ret":
      return RET_KOSULU;
  }
}

function sohbetKosulu(ctx: TenantContext, f: SohbetFiltresi): SQL | undefined {
  const kosul: (SQL | undefined)[] = [eq(sohbetler.tenantId, ctx.tenantId)];
  for (const c of new Set(f.cipler ?? [])) kosul.push(cipKosulu(c, f.simdi ?? new Date()));
  if (f.baglantiId) kosul.push(eq(sohbetler.baglantiId, f.baglantiId));
  if (f.durum) kosul.push(eq(sohbetler.durum, f.durum));
  if (f.atanan === "yok") kosul.push(isNull(sohbetler.atananKullanici));
  else if (f.atanan) kosul.push(eq(sohbetler.atananKullanici, f.atanan));
  if (f.idler) kosul.push(f.idler.length ? inArray(sohbetler.id, f.idler) : sql`0`);
  const arama = f.arama?.trim();
  if (arama) {
    const desen = `%${likeKacir(arama.toLocaleLowerCase("tr"))}%`;
    const rakam = arama.replace(/\D/g, "");
    kosul.push(
      or(
        sql`lower(coalesce(${leads.isletmeAdi}, '')) like ${desen} escape '\\'`,
        sql`lower(coalesce(${leads.yetkiliAdi}, '')) like ${desen} escape '\\'`,
        rakam.length >= 3 ? sql`coalesce(${leads.telefonE164}, '') like ${`%${rakam.replace(/^0/, "")}%`}` : undefined,
      ),
    );
  }
  return and(...kosul);
}

const SON_MESAJ_ID =
  "(select m.id from sohbet_mesajlari m where m.tenant_id = sohbetler.tenant_id and m.sohbet_id = sohbetler.id order by m.tarih desc, m.rowid desc limit 1)";
const sonMesaj = (alan: "tur" | "metin" | "icerik_silindi") =>
  sql.raw(
    `(select m.${alan} from sohbet_mesajlari m where m.tenant_id = sohbetler.tenant_id and m.sohbet_id = sohbetler.id order by m.tarih desc, m.rowid desc limit 1)`,
  );
/** Son iletinin medya dosya adı (sohbet_medyalari, mesaj başına tek satır). */
const sonDosyaAdi = sql.raw(
  `(select md.dosya_adi from sohbet_medyalari md where md.tenant_id = sohbetler.tenant_id and md.mesaj_id = ${SON_MESAJ_ID})`,
);

export function sohbetleriListele(ctx: TenantContext, f: SohbetFiltresi = {}): { satirlar: SohbetSatiri[]; toplam: number } {
  const sayfa = Math.max(1, Math.floor(f.sayfa ?? 1));
  const kosul = sohbetKosulu(ctx, f);
  const satirlar = db
    .select({
      sohbet: sohbetler,
      isletmeAdi: leads.isletmeAdi,
      yetkiliAdi: leads.yetkiliAdi,
      telefon: leads.ekTelefon,
      atananAd: user.name,
      sonTur: sql<SohbetMesajTuru | null>`${sonMesaj("tur")}`,
      sonMetin: sql<string | null>`${sonMesaj("metin")}`,
      sonIcerikSilindi: sql<number | null>`${sonMesaj("icerik_silindi")}`,
      sonDosyaAdi: sql<string | null>`${sonDosyaAdi}`,
      ret: sql<number>`${RET_KOSULU}`,
    })
    .from(sohbetler)
    .innerJoin(leads, and(eq(leads.tenantId, sohbetler.tenantId), eq(leads.id, sohbetler.leadId)))
    .leftJoin(user, eq(user.id, sohbetler.atananKullanici))
    .where(kosul)
    .orderBy(desc(sql`coalesce(${sohbetler.sonMesajTarihi}, ${sohbetler.olusturmaTarihi})`), desc(sohbetler.id))
    .limit(SOHBET_SAYFA_BOYUTU)
    .offset((sayfa - 1) * SOHBET_SAYFA_BOYUTU)
    .all();
  const toplam =
    db
      .select({ n: sql<number>`count(*)` })
      .from(sohbetler)
      .innerJoin(leads, and(eq(leads.tenantId, sohbetler.tenantId), eq(leads.id, sohbetler.leadId)))
      .where(kosul)
      .get()?.n ?? 0;
  return {
    satirlar: satirlar.map((s) => ({
      ...s.sohbet,
      isletmeAdi: s.isletmeAdi,
      yetkiliAdi: s.yetkiliAdi,
      telefon: s.telefon,
      atananAd: s.atananAd,
      sonTur: s.sonTur,
      sonMetin: s.sonMetin,
      sonIcerikSilindi: s.sonIcerikSilindi === null ? null : Boolean(s.sonIcerikSilindi),
      sonDosyaAdi: s.sonDosyaAdi,
      ret: Boolean(s.ret),
    })),
    toplam,
  };
}

/**
 * Çip sayıları: her çip için, süzgecin geri kalanıyla (numara, durum, atama, arama; seçili diğer çipler hariç) kaç
 * sohbet. Tek sorgu.
 */
export function cipSayilari(ctx: TenantContext, f: SohbetFiltresi = {}): Record<SohbetCipi, number> {
  const simdi = f.simdi ?? new Date();
  const kosul = sohbetKosulu(ctx, { ...f, cipler: [], idler: undefined });
  const secim = Object.fromEntries(
    SOHBET_CIPLERI.map((c) => [c, sql<number>`coalesce(sum(case when ${cipKosulu(c, simdi)} then 1 else 0 end), 0)`]),
  ) as Record<SohbetCipi, SQL<number>>;
  const r = db
    .select(secim)
    .from(sohbetler)
    .innerJoin(leads, and(eq(leads.tenantId, sohbetler.tenantId), eq(leads.id, sohbetler.leadId)))
    .where(kosul)
    .get();
  return Object.fromEntries(SOHBET_CIPLERI.map((c) => [c, Number(r?.[c] ?? 0)])) as Record<SohbetCipi, number>;
}

/** Numara başına okunmamış toplamı (rozetler). Satırda tutulan sayı toplanır, mesaj sayımı yapılmaz. */
export function okunmamisSayilari(ctx: TenantContext): Map<string, number> {
  const sonuc = new Map<string, number>();
  for (const r of db
    .select({ b: sohbetler.baglantiId, n: sql<number>`sum(${sohbetler.okunmamis})` })
    .from(sohbetler)
    .where(and(eq(sohbetler.tenantId, ctx.tenantId), gt(sohbetler.okunmamis, 0)))
    .groupBy(sohbetler.baglantiId)
    .all()) {
    sonuc.set(r.b, r.n);
  }
  return sonuc;
}

/** Sohbetin son mesajları (eskiden yeniye). onceTarih: daha eskileri (geriye kaydırma). */
/** Yanıtlanan mesajın alıntı bilgisi (aynı sohbette wamid ile bulunur). */
export type YanitlananMesaj = Pick<SohbetMesaji, "id" | "yon" | "tur" | "metin" | "icerikSilindi">;

export type SohbetMesajiSatiri = SohbetMesaji & {
  gonderenAd: string | null;
  medya: SohbetMedyasi | null;
  yanitlanan: YanitlananMesaj | null;
  /** Görselli şablonla gönderilen kampanya iletisinde kampanyanın başlık görseli (sohbet_medyalari kimliği). */
  kampanyaGorselId?: string | null;
};

const yanitlanan = alias(sohbetMesajlari, "yanitlanan");

function mesajSorgusu() {
  return db
    .select({
      m: sohbetMesajlari,
      gonderenAd: user.name,
      medya: sohbetMedyalari,
      yanitlanan: { id: yanitlanan.id, yon: yanitlanan.yon, tur: yanitlanan.tur, metin: yanitlanan.metin, icerikSilindi: yanitlanan.icerikSilindi },
      kampanyaGorselId: kampanyalar.gorselMedyaId,
    })
    .from(sohbetMesajlari)
    .leftJoin(user, eq(user.id, sohbetMesajlari.gonderenKullanici))
    .leftJoin(kampanyalar, and(eq(kampanyalar.tenantId, sohbetMesajlari.tenantId), eq(kampanyalar.id, sohbetMesajlari.kampanyaId)))
    .leftJoin(sohbetMedyalari, and(eq(sohbetMedyalari.tenantId, sohbetMesajlari.tenantId), eq(sohbetMedyalari.mesajId, sohbetMesajlari.id)))
    .leftJoin(
      yanitlanan,
      and(
        eq(yanitlanan.tenantId, sohbetMesajlari.tenantId),
        eq(yanitlanan.sohbetId, sohbetMesajlari.sohbetId),
        eq(yanitlanan.wamid, sohbetMesajlari.yanitWamid),
      ),
    );
}

type MesajSorguSatiri = Awaited<ReturnType<ReturnType<typeof mesajSorgusu>["all"]>>[number];
const satiraCevir = (s: MesajSorguSatiri): SohbetMesajiSatiri => ({
  ...s.m,
  gonderenAd: s.gonderenAd,
  medya: s.medya,
  yanitlanan: s.yanitlanan?.id ? (s.yanitlanan as YanitlananMesaj) : null,
  kampanyaGorselId: s.kampanyaGorselId ?? null,
});

/** Tek mesaj (gönderen adı, medya ve alıntıyla); bu çalışma alanının değilse null. */
export function mesajSatiriGetir(ctx: TenantContext, mesajId: string): SohbetMesajiSatiri | null {
  const s = mesajSorgusu()
    .where(and(eq(sohbetMesajlari.tenantId, ctx.tenantId), eq(sohbetMesajlari.id, mesajId)))
    .get();
  return s ? satiraCevir(s) : null;
}

/**
 * Sohbetin mesajları (eskiden yeniye), gönderen temsilcinin adıyla. Varsayılan: son MESAJ_SAYFA_BOYUTU mesaj;
 * onceTarih: daha eskileri (geriye kaydırma); sonraSurum: bu sürümden sonra eklenen ya da değişenler (canlı yenileme).
 */
export function sohbetMesajlariGetir(
  ctx: TenantContext,
  sohbetId: string,
  secenek: { onceTarih?: Date; sonraSurum?: number } = {},
): SohbetMesajiSatiri[] {
  const kosul = [eq(sohbetMesajlari.tenantId, ctx.tenantId), eq(sohbetMesajlari.sohbetId, sohbetId)];
  if (secenek.onceTarih) kosul.push(lt(sohbetMesajlari.tarih, secenek.onceTarih));
  if (secenek.sonraSurum !== undefined) kosul.push(gt(sohbetMesajlari.surum, secenek.sonraSurum));
  const sira = sql.raw("sohbet_mesajlari.rowid");
  const sorgu = mesajSorgusu().where(and(...kosul));
  const satirlar =
    secenek.sonraSurum !== undefined
      ? sorgu.orderBy(asc(sohbetMesajlari.tarih), asc(sira)).limit(500).all()
      : sorgu.orderBy(desc(sohbetMesajlari.tarih), desc(sira)).limit(MESAJ_SAYFA_BOYUTU).all().reverse();
  return satirlar.map(satiraCevir);
}

/** Gelen medya satırı (yalnızca bu çalışma alanının). */
export function medyaGetir(ctx: TenantContext, id: string): SohbetMedyasi | null {
  return db.select().from(sohbetMedyalari).where(and(eq(sohbetMedyalari.tenantId, ctx.tenantId), eq(sohbetMedyalari.id, id))).get() ?? null;
}

/** Çalışma alanının diskte duran (indirilmiş) medyası: toplam bayt ve dosya sayısı. */
export function medyaKullanimi(ctx: TenantContext): { bayt: number; adet: number } {
  const r = db
    .select({ bayt: sql<number>`coalesce(sum(${sohbetMedyalari.boyut}), 0)`, adet: sql<number>`count(*)` })
    .from(sohbetMedyalari)
    .where(and(eq(sohbetMedyalari.tenantId, ctx.tenantId), eq(sohbetMedyalari.durum, "indirildi")))
    .get();
  return { bayt: r?.bayt ?? 0, adet: r?.adet ?? 0 };
}

/** Sürümden sonra değişen sohbetlerin kimlikleri (en fazla 200). */
export function degisenSohbetler(ctx: TenantContext, sonra: number): string[] {
  return db
    .select({ id: sohbetler.id })
    .from(sohbetler)
    .where(and(eq(sohbetler.tenantId, ctx.tenantId), gt(sohbetler.surum, sonra)))
    .orderBy(desc(sohbetler.surum))
    .limit(200)
    .all()
    .map((r) => r.id);
}

/**
 * Temsilci sohbeti açtı: okunmamış sıfırlanır. Okunmamış varsa son gelen mesajın wamid'i döner (okundu bildirimi bir
 * kez gönderilsin diye); yoksa null.
 */
export function okunduIsaretle(ctx: TenantContext, sohbetId: string): string | null {
  return db.transaction(() => {
    const s = sohbetGetir(ctx, sohbetId);
    if (!s || s.okunmamis === 0) return null;
    const surum = surumAl(ctx);
    db.update(sohbetler).set({ okunmamis: 0, surum }).where(and(eq(sohbetler.tenantId, ctx.tenantId), eq(sohbetler.id, sohbetId))).run();
    return (
      db
        .select({ wamid: sohbetMesajlari.wamid })
        .from(sohbetMesajlari)
        .where(and(eq(sohbetMesajlari.tenantId, ctx.tenantId), eq(sohbetMesajlari.sohbetId, sohbetId), eq(sohbetMesajlari.yon, "gelen")))
        .orderBy(desc(sohbetMesajlari.tarih), desc(sql`rowid`))
        .get()?.wamid ?? null
    );
  });
}

/** Durum (açık/kapalı) ve atama. Atanan bu çalışma alanının üyesi olmalı (değilse 400). */
export function sohbetGuncelle(
  ctx: TenantContext,
  id: string,
  d: { durum?: SohbetDurumu; atananKullanici?: string | null },
): Sohbet | null {
  return db.transaction(() => {
    if (!sohbetGetir(ctx, id)) return null;
    if (d.atananKullanici) {
      const uye = db
        .select({ u: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, d.atananKullanici)))
        .get();
      if (!uye) throw new KayitKuraliHatasi("Sohbet yalnızca bu çalışma alanının bir üyesine atanabilir.", 400);
    }
    const surum = surumAl(ctx);
    return db
      .update(sohbetler)
      .set({
        ...(d.durum ? { durum: d.durum } : {}),
        ...(d.atananKullanici !== undefined ? { atananKullanici: d.atananKullanici } : {}),
        surum,
      })
      .where(and(eq(sohbetler.tenantId, ctx.tenantId), eq(sohbetler.id, id)))
      .returning()
      .get()!;
  });
}

/**
 * Toplu kapatma ("Seçilenleri kapat"): bu çalışma alanının verilen açık sohbetleri kapanır (en fazla
 * TOPLU_KAPATMA_AZAMI); başka çalışma alanının ya da zaten kapalı sohbet sayılmaz. Tek sürüm. Kapanan sayısı döner.
 * Müşteri yeniden yazınca sohbet kendiliğinden açılır (gelenMesajYaz).
 */
export function sohbetleriKapat(ctx: TenantContext, idler: string[]): number {
  const hedef = [...new Set(idler)].slice(0, TOPLU_KAPATMA_AZAMI);
  if (!hedef.length) return 0;
  return db.transaction(() => {
    const kosul = and(eq(sohbetler.tenantId, ctx.tenantId), inArray(sohbetler.id, hedef), eq(sohbetler.durum, "acik"));
    const n = db.select({ n: sql<number>`count(*)` }).from(sohbetler).where(kosul).get()?.n ?? 0;
    if (!n) return 0;
    const surum = surumAl(ctx);
    return db.update(sohbetler).set({ durum: "kapali", surum }).where(kosul).returning({ id: sohbetler.id }).all().length;
  });
}

/** Silme sonucu: silinen satır sayıları ve diskten silinecek medya dosyalarının göreli yolları. */
export type SohbetSilmeSonucu = { mesaj: number; medya: number; not: number; dosyalar: string[] };

/**
 * Sohbeti yalnızca Harita CRM'den kalıcı olarak siler (yalnızca yönetici): mesajlar, medya satırları, iç notlar ve
 * bildirim kuyruğu (bileşik yabancı anahtarla, aynı işlemde). Kayıt (lead), WhatsApp izni / RET, engel listesi ve
 * kampanya istatistikleri (message_queue) korunur. Kayda olay ve çalışma alanının denetim kaydına satır yazılır.
 * Dosyaların diskten silinmesi çağıranın işidir (dönen yollar; kalan dosyayı günlük medya bakımı da siler).
 * Son 24 saatte bu sohbetten temsilcinin gönderdiği şablon varsa silinmez (409): Meta limitinin payı bu iletilerden
 * sayılır (repo/kuyruk whatsappSon24Saat). Sohbet yoksa null.
 */
export function sohbetSil(ctx: TenantContext, id: string, g: { ad: string; numara: string }, simdi = new Date()): SohbetSilmeSonucu | null {
  yoneticiOlmali(ctx);
  return db.transaction(() => {
    const sohbet = sohbetGetir(ctx, id);
    if (!sohbet) return null;
    const ayni = and(eq(sohbetMesajlari.tenantId, ctx.tenantId), eq(sohbetMesajlari.sohbetId, id));
    const yeniSablon = db
      .select({ n: sql<number>`count(*)` })
      .from(sohbetMesajlari)
      .where(
        and(
          ayni,
          eq(sohbetMesajlari.yon, "giden"),
          eq(sohbetMesajlari.kaynak, "temsilci"),
          eq(sohbetMesajlari.tur, "template"),
          gt(sohbetMesajlari.tarih, new Date(simdi.getTime() - 24 * 3_600_000)),
        ),
      )
      .get()?.n;
    if (yeniSablon) {
      throw new KayitKuraliHatasi("Bu sohbetten son 24 saatte şablon gönderildi; Meta gönderim limiti hesabı bozulmasın diye 24 saat sonra silebilirsiniz.", 409);
    }
    const mesaj = db.select({ n: sql<number>`count(*)` }).from(sohbetMesajlari).where(ayni).get()?.n ?? 0;
    const medyalar = db
      .select({ yol: sohbetMedyalari.yol })
      .from(sohbetMedyalari)
      .innerJoin(sohbetMesajlari, and(eq(sohbetMesajlari.tenantId, sohbetMedyalari.tenantId), eq(sohbetMesajlari.id, sohbetMedyalari.mesajId)))
      .where(ayni)
      .all();
    const not =
      db
        .select({ n: sql<number>`count(*)` })
        .from(sohbetNotlari)
        .where(and(eq(sohbetNotlari.tenantId, ctx.tenantId), eq(sohbetNotlari.sohbetId, id)))
        .get()?.n ?? 0;
    // Satırlar bileşik yabancı anahtarlarla (ON DELETE CASCADE) silinir: mesajlar → medya, notlar, bildirim kuyruğu.
    db.delete(sohbetler).where(and(eq(sohbetler.tenantId, ctx.tenantId), eq(sohbetler.id, id))).run();
    surumAl(ctx);
    const kullaniciAdi = db.select({ ad: user.name }).from(user).where(eq(user.id, ctx.userId)).get()?.ad ?? null;
    const ozet = `"${g.ad}" (numara: ${g.numara}): ${mesaj} mesaj, ${medyalar.length} dosya, ${not} iç not`;
    db.insert(denetimKayitlari)
      .values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        kullaniciId: ctx.userId || null,
        kullaniciAdi,
        olay: DENETIM_SOHBET_SILME,
        deger: id,
        aciklama: `Sohbet yalnızca Harita CRM'den silindi ${ozet}. Kayıt, izin / RET bilgisi ve kampanya istatistikleri korundu.`,
        tarih: simdi,
      })
      .run();
    db.insert(leadEvents)
      .values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        leadId: sohbet.leadId,
        tur: "whatsapp_gelen",
        aciklama: `Gelen kutusu sohbeti Harita CRM'den silindi (numara: ${g.numara}; silen: ${kullaniciAdi ?? "yönetici"}). Müşterinin telefonundaki mesajlar silinmedi.`,
        kullaniciId: ctx.userId || null,
        sistem: true,
      })
      .run();
    return { mesaj, medya: medyalar.length, not, dosyalar: medyalar.map((m) => m.yol).filter((y): y is string => Boolean(y)) };
  });
}

// --- Kullanıcı tercihi ---

/** Gönderimi geri al (kullanıcının bu çalışma alanındaki tercihi; üyelik yoksa açık varsayılır). */
export function gonderimGeriAlGetir(ctx: TenantContext): boolean {
  return (
    db
      .select({ g: memberships.gonderimGeriAl })
      .from(memberships)
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, ctx.userId)))
      .get()?.g ?? true
  );
}

/** Kullanıcı kendi tercihini değiştirir (yalnızca kendi üyeliği). Üyelik yoksa false. */
export function gonderimGeriAlAyarla(ctx: TenantContext, acik: boolean): boolean {
  return (
    db
      .update(memberships)
      .set({ gonderimGeriAl: acik })
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, ctx.userId)))
      .returning({ u: memberships.userId })
      .all().length > 0
  );
}

// --- İç notlar ---

export function notEkle(ctx: TenantContext, sohbetId: string, metin: string, simdi = new Date()) {
  if (!sohbetGetir(ctx, sohbetId)) return null;
  return db
    .insert(sohbetNotlari)
    .values({ id: crypto.randomUUID(), tenantId: ctx.tenantId, sohbetId, kullaniciId: ctx.userId || null, metin, tarih: simdi })
    .returning()
    .get();
}

export function notlariListele(ctx: TenantContext, sohbetId: string) {
  return db
    .select({ id: sohbetNotlari.id, metin: sohbetNotlari.metin, tarih: sohbetNotlari.tarih, kullanici: user.name })
    .from(sohbetNotlari)
    .leftJoin(user, eq(user.id, sohbetNotlari.kullaniciId))
    .where(and(eq(sohbetNotlari.tenantId, ctx.tenantId), eq(sohbetNotlari.sohbetId, sohbetId)))
    .orderBy(asc(sohbetNotlari.tarih))
    .all();
}

/** Bu çalışma alanının üyeleri (atama seçimi). */
export function atanabilirUyeler(ctx: TenantContext) {
  return db
    .select({ id: user.id, ad: user.name })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(eq(memberships.tenantId, ctx.tenantId))
    .orderBy(asc(user.name))
    .all();
}
