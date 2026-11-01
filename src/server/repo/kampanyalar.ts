// Kampanyalar ve kuyruğa ekleme. Alıcı kuralları çağıran serviste (servisler/kampanya.ts) uygulanır;
// burada yalnızca bu kiracının kayıtları kuyruğa yazılır.
import { and, count, desc, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { KAMPANYA_AZAMI_ALICI, type HaricNedeni, type MesajDurumu } from "@/lib/mesajlasma";
import { SAYFA_BOYUTU } from "@/lib/sabitler";
import { ayAnahtari, istanbulAni } from "@/lib/zaman";
import { db } from "../db";
import { kampanyalar, leads, messageQueue, type Kampanya, type KampanyaFiltresi, type Kayit } from "../db/schema";
import { yoneticiOlmali, type TenantContext } from "./baglam";

export type { Kampanya, KampanyaFiltresi };

export type KampanyaAdayi = Pick<
  Kayit,
  "id" | "placeId" | "durum" | "iletiIzni" | "aliciTuru" | "eposta" | "ekTelefon" | "isletmeAdi" | "yetkiliAdi" | "telefonE164" | "inceleme"
>;

function adayKosulu(ctx: TenantContext, f: KampanyaFiltresi): SQL {
  const kosullar: SQL[] = [eq(leads.tenantId, ctx.tenantId)];
  if (f.durum) kosullar.push(eq(leads.durum, f.durum));
  if (f.aliciTuru) kosullar.push(eq(leads.aliciTuru, f.aliciTuru));
  if (f.etiket) {
    kosullar.push(sql`exists (select 1 from json_each(${leads.etiketler}) where json_each.value = ${f.etiket})`);
  }
  return and(...kosullar)!;
}

/** Filtreye uyan kayıtlar (en fazla KAMPANYA_AZAMI_ALICI + 1: fazlası "çok fazla alıcı" demektir). */
export function kampanyaAdaylari(ctx: TenantContext, f: KampanyaFiltresi): KampanyaAdayi[] {
  return db
    .select({
      id: leads.id,
      placeId: leads.placeId,
      durum: leads.durum,
      iletiIzni: leads.iletiIzni,
      aliciTuru: leads.aliciTuru,
      eposta: leads.eposta,
      ekTelefon: leads.ekTelefon,
      isletmeAdi: leads.isletmeAdi,
      yetkiliAdi: leads.yetkiliAdi,
      telefonE164: leads.telefonE164,
      inceleme: leads.inceleme,
    })
    .from(leads)
    .where(adayKosulu(ctx, f))
    .orderBy(leads.olusturmaTarihi, leads.id)
    .limit(KAMPANYA_AZAMI_ALICI + 1)
    .all();
}

export type YeniKampanya = Pick<Kampanya, "kanal" | "ad" | "konu" | "sablon" | "bosIsimHitabi" | "filtre" | "sandbox"> & {
  planlananTarih: Date | null;
  /** Yalnızca WhatsApp (Cloud API). */
  sablonId?: string | null;
  degiskenEslem?: Kampanya["degiskenEslem"];
};
export type KuyrukGirdisi = { leadId: string; haric?: HaricNedeni };

/** Kampanyayı ve kuyruk satırlarını tek işlemde yazar. Başka kiracının kayıtları sessizce atlanır. */
export function kampanyaOlustur(ctx: TenantContext, k: YeniKampanya, alicilar: KuyrukGirdisi[], simdi = new Date()): Kampanya {
  return db.transaction((tx) => {
    const zamanlandi = k.planlananTarih !== null && k.planlananTarih > simdi;
    const kampanya = tx
      .insert(kampanyalar)
      .values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        olusturan: ctx.userId,
        ...k,
        durum: zamanlandi ? "zamanlandi" : "calisiyor",
        planlananTarih: k.planlananTarih,
        baslamaTarihi: zamanlandi ? null : simdi,
      })
      .returning()
      .get();
    for (let i = 0; i < alicilar.length; i += 200) {
      const parca = alicilar.slice(i, i + 200);
      const gecerli = new Set(
        tx
          .select({ id: leads.id })
          .from(leads)
          .where(and(eq(leads.tenantId, ctx.tenantId), inArray(leads.id, parca.map((a) => a.leadId))))
          .all()
          .map((s) => s.id),
      );
      const satirlar = parca
        .filter((a) => gecerli.has(a.leadId))
        .map((a) => ({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          kampanyaId: kampanya.id,
          leadId: a.leadId,
          kanal: k.kanal,
          durum: (a.haric ? "haric" : "kuyrukta") as MesajDurumu,
          neden: a.haric ?? null,
        }));
      if (satirlar.length) tx.insert(messageQueue).values(satirlar).onConflictDoNothing().run();
    }
    return kampanya;
  });
}

type Sayilar = Record<MesajDurumu, number>;
const bosSayilar = (): Sayilar => ({ kuyrukta: 0, gonderiliyor: 0, gonderildi: 0, basarisiz: 0, haric: 0, iptal: 0 });

function sayilariGetir(ctx: TenantContext, kampanyaIdleri: string[]): Map<string, Sayilar> {
  const sonuc = new Map<string, Sayilar>();
  if (!kampanyaIdleri.length) return sonuc;
  const satirlar = db
    .select({ kampanyaId: messageQueue.kampanyaId, durum: messageQueue.durum, n: count() })
    .from(messageQueue)
    .where(and(eq(messageQueue.tenantId, ctx.tenantId), inArray(messageQueue.kampanyaId, kampanyaIdleri)))
    .groupBy(messageQueue.kampanyaId, messageQueue.durum)
    .all();
  for (const s of satirlar) {
    const say = sonuc.get(s.kampanyaId) ?? bosSayilar();
    say[s.durum] = s.n;
    sonuc.set(s.kampanyaId, say);
  }
  return sonuc;
}

export function kampanyalariListele(ctx: TenantContext, limit = 50) {
  const liste = db
    .select()
    .from(kampanyalar)
    .where(eq(kampanyalar.tenantId, ctx.tenantId))
    .orderBy(desc(kampanyalar.olusturmaTarihi))
    .limit(limit)
    .all();
  const sayilar = sayilariGetir(ctx, liste.map((k) => k.id));
  return liste.map((k) => ({ ...k, sayilar: sayilar.get(k.id) ?? bosSayilar() }));
}

/** Panel: bu ay (İstanbul takvimi) gönderilen kampanya mesajı sayısı (tüm kanallar). */
export function buAyGonderilenMesaj(ctx: TenantContext, simdi = new Date()): number {
  const ayBasi = istanbulAni(`${ayAnahtari(simdi)}-01`);
  return (
    db
      .select({ n: count() })
      .from(messageQueue)
      .where(
        and(eq(messageQueue.tenantId, ctx.tenantId), eq(messageQueue.durum, "gonderildi"), gte(messageQueue.gonderimTarihi, ayBasi)),
      )
      .get()?.n ?? 0
  );
}

export function kampanyaGetir(ctx: TenantContext, id: string) {
  const kampanya = db
    .select()
    .from(kampanyalar)
    .where(and(eq(kampanyalar.id, id), eq(kampanyalar.tenantId, ctx.tenantId)))
    .get();
  if (!kampanya) return null;
  const nedenler = db
    .select({ durum: messageQueue.durum, neden: messageQueue.neden, n: count() })
    .from(messageQueue)
    .where(and(eq(messageQueue.tenantId, ctx.tenantId), eq(messageQueue.kampanyaId, id)))
    .groupBy(messageQueue.durum, messageQueue.neden)
    .all();
  // WhatsApp: Meta teslim bildirimleri (webhook) ve ücretlendirilen iletiler (kategori bazında).
  const teslim =
    kampanya.kanal === "whatsapp_api"
      ? db
          .select({ durum: messageQueue.teslimDurumu, kod: messageQueue.teslimHataKodu, n: count() })
          .from(messageQueue)
          .where(and(eq(messageQueue.tenantId, ctx.tenantId), eq(messageQueue.kampanyaId, id), isNotNull(messageQueue.teslimDurumu)))
          .groupBy(messageQueue.teslimDurumu, messageQueue.teslimHataKodu)
          .all()
      : [];
  const ucretli =
    kampanya.kanal === "whatsapp_api"
      ? db
          .select({ kategori: messageQueue.ucretKategorisi, n: count() })
          .from(messageQueue)
          .where(and(eq(messageQueue.tenantId, ctx.tenantId), eq(messageQueue.kampanyaId, id), eq(messageQueue.ucretli, true)))
          .groupBy(messageQueue.ucretKategorisi)
          .all()
      : [];
  return { ...kampanya, sayilar: sayilariGetir(ctx, [id]).get(id) ?? bosSayilar(), nedenler, teslim, ucretli };
}

/** Kampanyanın alıcı bazında durumu (sayfalı). Alıcı adresi gösterilmez; kaydın kullanıcı verisi gösterilir. */
export function kampanyaMesajlari(ctx: TenantContext, id: string, f: { sayfa?: number; durum?: MesajDurumu } = {}) {
  const sayfa = Math.max(1, Math.floor(f.sayfa ?? 1));
  const kosul = and(
    eq(messageQueue.tenantId, ctx.tenantId),
    eq(messageQueue.kampanyaId, id),
    f.durum ? eq(messageQueue.durum, f.durum) : undefined,
  );
  const toplam = db.select({ n: count() }).from(messageQueue).where(kosul).get()?.n ?? 0;
  const mesajlar = db
    .select({
      id: messageQueue.id,
      leadId: messageQueue.leadId,
      isletmeAdi: leads.isletmeAdi,
      yetkiliAdi: leads.yetkiliAdi,
      kaynak: leads.kaynak,
      durum: messageQueue.durum,
      neden: messageQueue.neden,
      hata: messageQueue.hata,
      denemeSayisi: messageQueue.denemeSayisi,
      sonrakiDeneme: messageQueue.sonrakiDeneme,
      gonderimTarihi: messageQueue.gonderimTarihi,
      sandboxIcerik: messageQueue.sandboxIcerik,
    })
    .from(messageQueue)
    .innerJoin(leads, and(eq(leads.id, messageQueue.leadId), eq(leads.tenantId, messageQueue.tenantId)))
    .where(kosul)
    .orderBy(messageQueue.olusturmaTarihi, messageQueue.id)
    .limit(SAYFA_BOYUTU)
    .offset((sayfa - 1) * SAYFA_BOYUTU)
    .all();
  return { mesajlar, toplam, sayfa, sayfaSayisi: Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU)) };
}

/** Bekleyen mesajlar iptal edilir; gönderilmiş olanlar etkilenmez. Tamamlanmış kampanya iptal edilemez. */
export function kampanyaIptal(ctx: TenantContext, id: string): boolean {
  return db.transaction((tx) => {
    const k = tx
      .update(kampanyalar)
      .set({ durum: "iptal", tamamlanmaTarihi: new Date() })
      .where(
        and(
          eq(kampanyalar.id, id),
          eq(kampanyalar.tenantId, ctx.tenantId),
          inArray(kampanyalar.durum, ["zamanlandi", "calisiyor", "duraklatildi"]),
        ),
      )
      .returning({ id: kampanyalar.id })
      .get();
    if (!k) return false;
    tx.update(messageQueue)
      .set({ durum: "iptal", neden: "iptal" })
      .where(and(eq(messageQueue.tenantId, ctx.tenantId), eq(messageQueue.kampanyaId, id), eq(messageQueue.durum, "kuyrukta")))
      .run();
    return true;
  });
}

/**
 * Sistem duraklatması (WhatsApp): çalışan WhatsApp kampanyalarını durdurur — kampanyaId verilirse yalnızca onu,
 * verilmezse çalışma alanının tümünü (ör. numaranın kalitesi düştü). Bekleyen mesajlar kuyrukta kalır.
 */
export function whatsappKampanyalariniDuraklat(ctx: TenantContext, neden: string, kampanyaId?: string): number {
  return db
    .update(kampanyalar)
    .set({ durum: "duraklatildi", duraklatmaNedeni: neden })
    .where(
      and(
        eq(kampanyalar.tenantId, ctx.tenantId),
        eq(kampanyalar.kanal, "whatsapp_api"),
        eq(kampanyalar.durum, "calisiyor"),
        kampanyaId ? eq(kampanyalar.id, kampanyaId) : undefined,
      ),
    )
    .returning({ id: kampanyalar.id })
    .all().length;
}

/** Duraklatılmış kampanyayı devam ettirir (yalnızca yönetici). Koşulları (kalite vb.) çağıran servis denetler. */
export function kampanyaDevamEttir(ctx: TenantContext, id: string): boolean {
  yoneticiOlmali(ctx);
  return Boolean(
    db
      .update(kampanyalar)
      .set({ durum: "calisiyor", duraklatmaNedeni: null })
      .where(and(eq(kampanyalar.id, id), eq(kampanyalar.tenantId, ctx.tenantId), eq(kampanyalar.durum, "duraklatildi")))
      .returning({ id: kampanyalar.id })
      .get(),
  );
}
