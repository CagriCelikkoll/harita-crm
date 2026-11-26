import { and, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { DENETIM_TOPLU_KAYIT } from "@/lib/denetim";
import {
  ILETI_IZNI_ADLARI,
  KAYIT_DURUM_ADLARI,
  KAYIT_ETIKET_AZAMI,
  KAYIT_SAYFA_BOYUTLARI,
  SAYFA_BOYUTU,
  TOPLU_ATLAMA_NEDENLERI,
  TOPLU_ISLEM_AZAMI,
  TOPLU_ISLEM_SINIRI_METNI,
  type KayitSayfaBoyutu,
  type TopluAtlamaNedeni,
  type KayitSirasi,
  type IletiIzni,
  type IncelemeDurumu,
  type KayitKaynagi,
  type KayitDurumu,
  type OlayTuru,
  type KayitGrubu,
  type KayitKampanyaDurumu,
  type TaramaKarari,
} from "@/lib/sabitler";
import { sayfaSayisiHesapla, sayfaSinirla } from "@/lib/sayfalama";
import { db } from "../db";
import { denetimKayitlari, engelListesi, leadEvents, leads, messageQueue, scans, taramaSonuclari, user, whatsappKisileri, type Kayit } from "../db/schema";
import { telefonNormallestir } from "../messaging/adres";
import {
  ALICI_TURU_ADLARI,
  WHATSAPP_IZIN_KAYNAK_ADLARI,
  WHATSAPP_TOPLU_IZIN_BEYANI,
  type AliciTuru,
  type TOPLU_IZIN_KAYNAKLARI,
  type WhatsappIzni,
} from "@/lib/mesajlasma";
import { WHATSAPP_YOK_GUN } from "../messaging/alici-kurallari";
import { KayitKuraliHatasi, likeKacir, TopluSecimDegistiHatasi, yoneticiOlmali, type TenantContext } from "./baglam";
import { engelliKayitlar, retliKayitAdresleriniEngelle } from "./engel-listesi";

export type { Kayit };

export type KayitFiltresi = {
  sayfa?: number;
  durum?: KayitDurumu;
  iletiIzni?: IletiIzni;
  kaynak?: KayitKaynagi;
  /** WhatsApp (Cloud API) izni; 'yok' satırı olmayan kayıtları da kapsar. */
  whatsappIzni?: WhatsappIzni;
  etiket?: string;
  /** Hiç etiketi olmayan kayıtlar (verilirse `etiket` yok sayılır). */
  etiketsiz?: boolean;
  /**
   * WhatsApp (Cloud API) kampanyası almış mı: "almis" = en az bir WhatsApp kampanyasında iletisi Meta'ya gönderilmiş ve
   * Meta kabul etmiş (kuyruk satırı "gonderildi", test / sandbox kaydı değil). Teslime bakılmaz: sonradan gelen teslim
   * hatası (ör. 131026, 131049) da "almis" sayılır. Hariç tutulan, bekleyen, gönderim anında başarısız olan (Meta
   * reddetti), iptal edilen ya da test modunda kaydedilen satırlar "almamis" sayılır.
   */
  kampanyaDurumu?: KayitKampanyaDurumu;
  /** Yalnızca kullanıcının girdiği alanlarda arar (Places içeriği saklanmadığı için). */
  arama?: string;
  /** Tarama sonucunun incelenmesi. Verilmezse "ilgilenmiyor" kayıtlar gizlenir; "hepsi" hiçbirini gizlemez. */
  inceleme?: IncelemeDurumu | "hepsi";
  /** Yalnızca kullanıcının kendi işletme adını girmediği Google kayıtları. */
  adsizGoogle?: boolean;
  /** Yalnızca bu taramanın kayıtları. */
  scanId?: string;
  /**
   * Kayıtlar ekranının sekmesi (verilirse `inceleme` yerine geçer):
   * - "ilgi" (İlgilendiklerim): inceleme "ilgileniyor" ve durum "İlgilenmiyor" değil;
   * - "incelenmemis": taramadan gelip henüz incelenmemiş;
   * - "tum": hepsi.
   */
  grup?: KayitGrubu;
  /** Liste sırası (yalnızca kayitlariListele): "son" (varsayılan) ya da "ad" (ad / işletme adı A-Z). */
  sira?: KayitSirasi;
  /** Sayfa boyutu (yalnızca kayitlariListele): 50 / 100 / 200; varsayılan 50. */
  boyut?: KayitSayfaBoyutu;
};

function filtreKosulu(ctx: TenantContext, f: KayitFiltresi): SQL {
  const kosullar: SQL[] = [eq(leads.tenantId, ctx.tenantId)];
  if (f.durum) kosullar.push(eq(leads.durum, f.durum));
  if (f.iletiIzni) kosullar.push(eq(leads.iletiIzni, f.iletiIzni));
  if (f.kaynak) kosullar.push(eq(leads.kaynak, f.kaynak));
  if (f.grup === "ilgi") kosullar.push(eq(leads.inceleme, "ilgileniyor"), ne(leads.durum, "ilgilenmiyor"));
  else if (f.grup === "incelenmemis") kosullar.push(eq(leads.inceleme, "incelenmedi"));
  else if (f.grup === "tum") {
    // sekme: hepsi
  } else if (f.inceleme === undefined) kosullar.push(ne(leads.inceleme, "ilgilenmiyor"));
  else if (f.inceleme !== "hepsi") kosullar.push(eq(leads.inceleme, f.inceleme));
  if (f.adsizGoogle) kosullar.push(eq(leads.kaynak, "google"), isNull(leads.isletmeAdi));
  if (f.scanId) kosullar.push(eq(leads.scanId, f.scanId));
  if (f.whatsappIzni) {
    const var_ = sql`exists (select 1 from ${whatsappKisileri} w where w.tenant_id = ${leads.tenantId}
      and w.lead_id = ${leads.id} and w.izin = ${f.whatsappIzni})`;
    kosullar.push(
      f.whatsappIzni === "yok"
        ? sql`(${var_} or not exists (select 1 from ${whatsappKisileri} w where w.tenant_id = ${leads.tenantId}
            and w.lead_id = ${leads.id}))`
        : var_,
    );
  }
  if (f.etiketsiz) kosullar.push(sql`json_array_length(${leads.etiketler}) = 0`);
  else if (f.etiket) {
    kosullar.push(sql`exists (select 1 from json_each(${leads.etiketler}) where json_each.value = ${f.etiket})`);
  }
  if (f.kampanyaDurumu) {
    // İlişkisiz alt sorgu: kiracının WhatsApp kuyruğu bir kez taranır (satır başına ayrı sorgu yok).
    const almis = sql`${leads.id} in (select q.lead_id from ${messageQueue} q where q.tenant_id = ${ctx.tenantId}
      and q.kanal = 'whatsapp_api' and q.durum = 'gonderildi' and q.sandbox_icerik is null)`;
    kosullar.push(f.kampanyaDurumu === "almis" ? almis : sql`not (${almis})`);
  }
  const arama = f.arama?.trim();
  if (arama) {
    const desen = `%${likeKacir(arama)}%`;
    const benzer = (kolon: unknown) => sql`${kolon} like ${desen} escape '\\'`;
    kosullar.push(
      or(
        benzer(leads.isletmeAdi),
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

/** Listede gösterilen ad: kullanıcının girdiği işletme adı, yoksa yetkili / kişi adı (Google'daki ad saklanmaz). */
const gorunenAd = sql`coalesce(nullif(trim(${leads.isletmeAdi}), ''), nullif(trim(${leads.yetkiliAdi}), ''))`;

export function kayitlariListele(ctx: TenantContext, f: KayitFiltresi = {}) {
  const boyut = KAYIT_SAYFA_BOYUTLARI.find((b) => b === f.boyut) ?? KAYIT_SAYFA_BOYUTLARI[0];
  const kosul = filtreKosulu(ctx, f);
  const toplam = db.select({ n: count() }).from(leads).where(kosul).get()?.n ?? 0;
  // Aralık dışı sayfa (0, eksi, toplamdan büyük) en yakın geçerli sayfaya çekilir.
  const sayfaSayisi = sayfaSayisiHesapla(toplam, boyut);
  const sayfa = sayfaSinirla(f.sayfa ?? 1, sayfaSayisi);
  const kayitlar = db
    .select()
    .from(leads)
    .where(kosul)
    // Ad A-Z: Türkçe alfabe (tr_sira, db/index.ts); adı girilmemiş kayıtlar (ör. Google kayıtları) sonda.
    .orderBy(
      ...(f.sira === "ad"
        ? [sql`${gorunenAd} is null`, sql`tr_sira(${gorunenAd})`, desc(leads.guncellemeTarihi), desc(leads.id)]
        : [desc(leads.guncellemeTarihi), desc(leads.id)]),
    )
    .limit(boyut)
    .offset((sayfa - 1) * boyut)
    .all();
  return { kayitlar, toplam, sayfa, boyut, sayfaSayisi };
}

/** Sekme sayıları: diğer süzgeçler (durum, izin, arama…) uygulanmış olarak her sekmenin kayıt sayısı. */
export function grupSayilari(ctx: TenantContext, f: Omit<KayitFiltresi, "grup" | "sayfa"> = {}): Record<KayitGrubu, number> {
  const say = (grup: KayitGrubu) => db.select({ n: count() }).from(leads).where(filtreKosulu(ctx, { ...f, grup })).get()?.n ?? 0;
  return { ilgi: say("ilgi"), incelenmemis: say("incelenmemis"), tum: say("tum") };
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
        // Yeni tarama sonuçları "incelenmedi" gelir (Sonuçları incele ekranı).
        .values(parca.map((placeId) => ({ id: crypto.randomUUID(), tenantId: ctx.tenantId, placeId, scanId, inceleme: "incelenmedi" as const })))
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
      // Bu taramanın bulduğu tüm kayıtlar (yeni ve daha önce başka taramayla eklenmiş olanlar): yalnızca kimlikler.
      const bulunan = tx
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.tenantId, ctx.tenantId), inArray(leads.placeId, parca)))
        .all();
      if (bulunan.length) {
        tx.insert(taramaSonuclari)
          .values(bulunan.map((b) => ({ tenantId: ctx.tenantId, scanId, leadId: b.id })))
          .onConflictDoNothing()
          .run();
      }
    }
    return { yeni, toplam: benzersiz.length };
  });
}

export type KayitDegisikligi = Partial<
  Pick<
    Kayit,
    "durum" | "isletmeAdi" | "aliciTuru" | "yetkiliAdi" | "eposta" | "ekTelefon" | "notlar" | "etiketler" | "iletiIzni"
  >
>;

const BILGI_ALANLARI: Record<string, string> = {
  isletmeAdi: "işletme adı",
  aliciTuru: "alıcı türü",
  yetkiliAdi: "yetkili adı",
  eposta: "e-posta",
  ekTelefon: "ek telefon",
  etiketler: "etiketler",
};

/**
 * Kaydı günceller ve her değişikliği lead_events'e yazar. Kayıt bu kiracıya ait değilse null.
 * İleti izni 'ret' yapılırsa kaydın adresleri engel listesine de yazılır (ret akışıyla aynı sonuç).
 * Kurallar (KayitKuraliHatasi):
 *  - 'ret' geri alınamaz: ret verilmiş kaydın ileti izni başka değere geçemez (400).
 *  - WhatsApp izni 'var' olan ya da Meta reklamından gelen kişiyi bireysel → tacir/esnaf yapmak İYS beyanı kuralını
 *    kaldırır: yalnızca yönetici (403); Meta reklamı kaynaklı kişide yönetici de açıklama yazmalı (400). Olay yazılır.
 */
export function kayitGuncelle(
  ctx: TenantContext,
  id: string,
  degisiklik: KayitDegisikligi,
  secenek: { aliciTuruAciklamasi?: string | null } = {},
): Kayit | null {
  return db.transaction((tx) => {
    const kosul = and(eq(leads.id, id), eq(leads.tenantId, ctx.tenantId));
    const eski = tx.select().from(leads).where(kosul).get();
    if (!eski) return null;

    if (eski.iletiIzni === "ret" && degisiklik.iletiIzni !== undefined && degisiklik.iletiIzni !== "ret") {
      throw new KayitKuraliHatasi("Ret verilmiş kaydın ileti izni değiştirilemez; ret geri alınamaz.", 400);
    }
    let turAciklamasi: string | null = null;
    if (eski.aliciTuru === "bireysel" && degisiklik.aliciTuru === "tacir_esnaf") {
      const waIzni = tx
        .select({ izin: whatsappKisileri.izin })
        .from(whatsappKisileri)
        .where(and(eq(whatsappKisileri.tenantId, ctx.tenantId), eq(whatsappKisileri.leadId, id)))
        .get()?.izin;
      const reklam = eski.kaynak === "meta_reklam";
      if (waIzni === "var" || reklam) {
        if (ctx.rol !== "yonetici") {
          throw new KayitKuraliHatasi(
            "WhatsApp izni olan bireysel kişinin alıcı türünü tacir/esnaf yapmak yalnızca yöneticiye açıktır (İYS beyanı kuralını kaldırır).",
            403,
          );
        }
        turAciklamasi = secenek.aliciTuruAciklamasi?.trim() || null;
        if (reklam && !turAciklamasi) {
          throw new KayitKuraliHatasi("Meta reklamından gelen kişinin alıcı türünü değiştirmek için açıklama yazın.", 400);
        }
      }
    }

    const yeni = tx
      .update(leads)
      .set({
        ...degisiklik,
        ...("ekTelefon" in degisiklik ? { telefonE164: telefonNormallestir(degisiklik.ekTelefon) } : {}),
        guncellemeTarihi: new Date(),
      })
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
          : { tur: "izin", aciklama: `İleti izni: ${ILETI_IZNI_ADLARI[degisiklik.iletiIzni]}` },
      );
    }
    if (degisiklik.notlar !== undefined && (degisiklik.notlar ?? "") !== (eski.notlar ?? "")) {
      olaylar.push({ tur: "bilgi", aciklama: "Kayıt notu güncellendi" });
    }
    const degisenBilgiler = Object.keys(BILGI_ALANLARI).filter((alan) => {
      const k = alan as keyof KayitDegisikligi;
      return k in degisiklik && JSON.stringify(degisiklik[k] ?? null) !== JSON.stringify(eski[k] ?? null);
    });
    if (degisenBilgiler.length) {
      olaylar.push({
        tur: "bilgi",
        aciklama: `Bilgiler güncellendi: ${degisenBilgiler.map((a) => BILGI_ALANLARI[a]).join(", ")}`,
      });
    }
    if (eski.aliciTuru === "bireysel" && yeni.aliciTuru === "tacir_esnaf" && (turAciklamasi || eski.kaynak === "meta_reklam")) {
      olaylar.push({
        tur: "izin",
        aciklama: `Alıcı türü bireysel → tacir/esnaf (yönetici; İYS beyanı kuralı kalktı)${turAciklamasi ? `: ${turAciklamasi}` : ""}`,
      });
    }
    if (yeni.iletiIzni === "ret") {
      // Ret verilmiş kayda eklenen her adres (ve gönderildiği adresler) de engellenir.
      retliKayitAdresleriniEngelle(tx, ctx, id);
      // Ret tüm kanallar içindir (retIsle ile aynı): WhatsApp izni de 'ret'.
      const simdi = new Date();
      tx.insert(whatsappKisileri)
        .values({ tenantId: ctx.tenantId, leadId: id, izin: "ret", izinTarihi: simdi })
        .onConflictDoUpdate({
          target: [whatsappKisileri.tenantId, whatsappKisileri.leadId],
          set: { izin: "ret", izinTarihi: simdi, guncellemeTarihi: simdi },
          setWhere: sql`${whatsappKisileri.izin} <> 'ret'`,
        })
        .run();
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
    .where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.scanId, scanId), isNotNull(leads.placeId)))
    .all() as { id: string; placeId: string; durum: Kayit["durum"] }[];
}

/**
 * Bölge tara > sonuçlar: bir taramanın bulduğu kayıtlar (tarama_sonuclari; yeniden bulunanlar dahil), 20'şer.
 * karar: "ilgi" = inceleme "ilgileniyor", "gec" = "ilgilenmiyor", "tum" = hepsi. Sayılar her zaman taramanın tamamı
 * için döner. Sıra taramada eklenme sırasıdır (karar verilince kayıt sayfadan kaymaz).
 */
export function taramaSonuclariListele(ctx: TenantContext, scanId: string, secenek: { sayfa?: number; karar?: TaramaKarari } = {}) {
  const temel = and(eq(taramaSonuclari.tenantId, ctx.tenantId), eq(taramaSonuclari.scanId, scanId), eq(leads.tenantId, ctx.tenantId));
  const kararKosulu =
    secenek.karar === "ilgi" ? eq(leads.inceleme, "ilgileniyor") : secenek.karar === "gec" ? eq(leads.inceleme, "ilgilenmiyor") : undefined;
  const kosul = kararKosulu ? and(temel, kararKosulu) : temel;
  const toplam = db.select({ n: count() }).from(taramaSonuclari).innerJoin(leads, eq(leads.id, taramaSonuclari.leadId)).where(kosul).get()?.n ?? 0;
  const sayfaSayisi = sayfaSayisiHesapla(toplam, SAYFA_BOYUTU);
  const sayfa = sayfaSinirla(secenek.sayfa ?? 1, sayfaSayisi);
  const kayitlar = db
    .select({ id: leads.id, isletmeAdi: leads.isletmeAdi, inceleme: leads.inceleme, durum: leads.durum })
    .from(taramaSonuclari)
    .innerJoin(leads, eq(leads.id, taramaSonuclari.leadId))
    .where(kosul)
    .orderBy(leads.olusturmaTarihi, leads.id)
    .limit(SAYFA_BOYUTU)
    .offset((sayfa - 1) * SAYFA_BOYUTU)
    .all();
  const dagilim = db
    .select({ inceleme: leads.inceleme, n: count() })
    .from(taramaSonuclari)
    .innerJoin(leads, eq(leads.id, taramaSonuclari.leadId))
    .where(temel)
    .groupBy(leads.inceleme)
    .all();
  const say = (i: IncelemeDurumu) => dagilim.find((x) => x.inceleme === i)?.n ?? 0;
  return {
    kayitlar,
    toplam,
    sayfa,
    boyut: SAYFA_BOYUTU,
    sayfaSayisi,
    sayilar: {
      bulunan: dagilim.reduce((a, x) => a + x.n, 0),
      incelenmedi: say("incelenmedi"),
      ilgilenilen: say("ilgileniyor"),
      gecilen: say("ilgilenmiyor"),
    },
  };
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

/** Ek telefonu girilmiş kayıtlar (gelen RET yanıtını numarayla eşleştirmek için; normalleştirme çağıranda). */
export function ekTelefonluKayitlar(ctx: TenantContext): { id: string; ekTelefon: string }[] {
  return db
    .select({ id: leads.id, ekTelefon: leads.ekTelefon })
    .from(leads)
    .where(and(eq(leads.tenantId, ctx.tenantId), sql`${leads.ekTelefon} is not null`))
    .all() as { id: string; ekTelefon: string }[];
}

/** Google dışı kişi kaydı (içe aktarma, elle, Meta reklamı). Ad ve telefon kullanıcının verisidir. */
export type YeniKisi = {
  kaynak: Exclude<KayitKaynagi, "google">;
  isletmeAdi?: string | null;
  yetkiliAdi?: string | null;
  eposta?: string | null;
  ekTelefon?: string | null;
  notlar?: string | null;
  etiketler?: string[];
  aliciTuru?: AliciTuru;
  /** Yalnızca kaynak 'yonlendirme': "Yönlendirme — <yönlendiren>" ve yönlendiren sohbet. */
  kaynakAyrintisi?: string | null;
  yonlendirenSohbetId?: string | null;
};

/** Kişileri ekler; her biri için "eklendi" olayı yazılır. Çağıran aynı transaction'da ek işler yapabilir (tx). */
export function kisileriEkle(
  ctx: TenantContext,
  kisiler: YeniKisi[],
  aciklama: string,
  tx: Pick<typeof db, "insert"> = db,
): Kayit[] {
  const eklenen: Kayit[] = [];
  for (let i = 0; i < kisiler.length; i += 200) {
    const parca = kisiler.slice(i, i + 200);
    const satirlar = tx
      .insert(leads)
      .values(
        parca.map((k) => ({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          kaynak: k.kaynak,
          placeId: null,
          isletmeAdi: k.isletmeAdi ?? null,
          yetkiliAdi: k.yetkiliAdi ?? null,
          eposta: k.eposta ?? null,
          ekTelefon: k.ekTelefon ?? null,
          telefonE164: telefonNormallestir(k.ekTelefon),
          notlar: k.notlar ?? null,
          etiketler: k.etiketler ?? [],
          kaynakAyrintisi: k.kaynakAyrintisi ?? null,
          yonlendirenSohbetId: k.yonlendirenSohbetId ?? null,
          ...(k.aliciTuru ? { aliciTuru: k.aliciTuru } : {}),
        })),
      )
      .returning()
      .all();
    tx.insert(leadEvents)
      .values(
        satirlar.map((k) => ({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          leadId: k.id,
          tur: "eklendi" as const,
          aciklama,
          kullaniciId: ctx.userId || null,
          sistem: true,
        })),
      )
      .run();
    eklenen.push(...satirlar);
  }
  return eklenen;
}

/** Normalize telefonu (905XXXXXXXXX) verilen numaralardan biri olan kayıtlar: içe aktarma çakışması, WhatsApp eşleştirmesi. */
export function telefonlaKayitlar(ctx: TenantContext, telefonlar: string[]): { id: string; telefonE164: string }[] {
  const benzersiz = [...new Set(telefonlar)];
  const sonuc: { id: string; telefonE164: string }[] = [];
  for (let i = 0; i < benzersiz.length; i += 500) {
    sonuc.push(
      ...(db
        .select({ id: leads.id, telefonE164: leads.telefonE164 })
        .from(leads)
        .where(and(eq(leads.tenantId, ctx.tenantId), inArray(leads.telefonE164, benzersiz.slice(i, i + 500))))
        .all() as { id: string; telefonE164: string }[]),
    );
  }
  return sonuc;
}

/** Tarama sonucunun incelenmesini işaretler (İlgilen / İlgilenme). Yalnızca bu kiracının kayıtları; güncellenen sayı. */
export function incelemeAyarla(ctx: TenantContext, idler: string[], inceleme: IncelemeDurumu): number {
  if (!idler.length) return 0;
  return db
    .update(leads)
    .set({ inceleme, guncellemeTarihi: new Date() })
    .where(and(eq(leads.tenantId, ctx.tenantId), inArray(leads.id, [...new Set(idler)])))
    .run().changes;
}

/** Taramaların incelenmemiş kayıt sayıları (yalnızca bu kiracının taramaları). */
export function incelenmemisSayilari(ctx: TenantContext, scanIdler: string[]): Map<string, number> {
  if (!scanIdler.length) return new Map();
  const satirlar = db
    .select({ scanId: leads.scanId, n: count() })
    .from(leads)
    .where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.inceleme, "incelenmedi"), inArray(leads.scanId, scanIdler)))
    .groupBy(leads.scanId)
    .all();
  return new Map(satirlar.map((s) => [s.scanId!, s.n]));
}

// ——— Toplu işlem (Kayıtlar listesi) ———

export type TopluIslem =
  | { tur: "etiket_ekle"; etiket: string }
  | { tur: "etiket_kaldir"; etiket: string }
  | { tur: "alici_turu"; aliciTuru: AliciTuru }
  /** beyan: WHATSAPP_TOPLU_IZIN_BEYANI onaylandı (zorunlu). kaynak "diger" ise açıklama zorunlu; açıklama izin_notu olur. */
  | { tur: "whatsapp_izni"; kaynak: (typeof TOPLU_IZIN_KAYNAKLARI)[number]; aciklama?: string | null; beyan: boolean };

/**
 * Seçim: sayfada işaretlenen id'ler ya da "filtreye uyan tümü" (süzgeç sunucuda yeniden uygulanır; sayfa, sıra ve
 * boyut yok sayılır). `beklenenToplam`: onay penceresinde gösterilen sayı; filtreye uyan kayıt sayısı o arada
 * değiştiyse hiçbir şey yazılmaz (TopluSecimDegistiHatasi), kullanıcı yeni sayıyı onaylar.
 */
export type TopluSecim = { idler: string[] } | { filtre: Omit<KayitFiltresi, "sayfa" | "sira" | "boyut">; beklenenToplam?: number };

export type TopluSonuc = {
  /** Seçimde bulunan (bu çalışma alanına ait) kayıt sayısı. */
  hedef: number;
  degisen: number;
  atlanan: Record<TopluAtlamaNedeni, number>;
  /** id ile seçilip bulunamayan (silinmiş ya da başka çalışma alanına ait) kayıtlar: dokunulmaz. */
  bulunamayan: number;
};


/**
 * Seçilen kayıtlara toplu işlem (yalnızca yönetici; YetkiHatasi). Tek transaction; yalnızca bu çalışma alanının
 * kayıtları. Değişen her kayda lead_events'e olay, işlemin özetine denetim kaydı yazılır.
 *  - etiket_ekle / etiket_kaldir: yalnızca `etiketler` alanı. Etiketi zaten olan / olmayan kayıt "ayni"; etiket sınırı
 *    (KAYIT_ETIKET_AZAMI) dolu kayıt "etiket_siniri" olarak atlanır.
 *  - alici_turu: yalnızca `alici_turu` alanı. RET vermiş (ileti izni ya da WhatsApp izni 'ret') ve engel listesindeki
 *    kayıtlara dokunulmaz; Meta reklamından gelen bireysel kişi tacir/esnaf yapılmaz (tek tek, açıklamayla yapılır).
 *  - whatsapp_izni: yalnızca WhatsApp izni (izin 'var', izin tarihi = işlem anı, kaynak, açıklama, kaydeden kullanıcı).
 *    Beyan ve ("diger" kaynağında) açıklama zorunlu (KayitKuraliHatasi 400). RET vermiş (ileti reddi ya da WhatsApp
 *    reddi), engel listesindeki ve son WHATSAPP_YOK_GUN günde "WhatsApp yok" bildirilmiş kayıtlar atlanır; izni zaten
 *    'var' olan kayıt "ayni" (kanıtı ezilmez). 'ret' satırı hiçbir koşulda güncellenmez; İYS beyanı alanına dokunulmaz.
 * Diğer işlemler WhatsApp izni / ret alanlarını değiştirmez; hiçbir işlem ileti iznini ya da engel listesini
 * değiştirmez. Seçim TOPLU_ISLEM_AZAMI kaydı aşarsa hiçbir şey yazılmaz (400).
 * `onizleme`: onay penceresi için kuru çalıştırma; aynı kurallarla kaç kaydın değişeceği ve atlanacağı hesaplanır,
 * transaction sonunda geri alınır (hiçbir şey yazılmaz; olay ve denetim kaydı da). Beyan / açıklama aranmaz.
 */
export function kayitlariTopluGuncelle(ctx: TenantContext, secim: TopluSecim, islem: TopluIslem, secenek: { onizleme?: boolean } = {}): TopluSonuc {
  yoneticiOlmali(ctx);
  const izinAciklamasi = islem.tur === "whatsapp_izni" ? islem.aciklama?.trim() || null : null;
  if (islem.tur === "whatsapp_izni" && !secenek.onizleme) {
    if (islem.beyan !== true) throw new KayitKuraliHatasi("WhatsApp izni için beyan onay kutusunu işaretleyin.", 400);
    if (islem.kaynak === "diger" && !izinAciklamasi) throw new KayitKuraliHatasi('"Diğer" izin kaynağı için açıklama yazın.', 400);
  }
  if ("idler" in secim && new Set(secim.idler).size > TOPLU_ISLEM_AZAMI) throw new KayitKuraliHatasi(TOPLU_ISLEM_SINIRI_METNI, 400);
  let onizlemeSonucu: TopluSonuc | null = null;
  try {
    return db.transaction((tx) => {
      const kolonlar = {
        id: leads.id,
        etiketler: leads.etiketler,
        aliciTuru: leads.aliciTuru,
        iletiIzni: leads.iletiIzni,
        kaynak: leads.kaynak,
        eposta: leads.eposta,
        ekTelefon: leads.ekTelefon,
      };
      let hedefler: { id: string; etiketler: string[]; aliciTuru: AliciTuru; iletiIzni: IletiIzni; kaynak: KayitKaynagi; eposta: string | null; ekTelefon: string | null }[] = [];
      let bulunamayan = 0;
      if ("idler" in secim) {
        const benzersiz = [...new Set(secim.idler)];
        for (let i = 0; i < benzersiz.length; i += 500) {
          hedefler.push(
            ...tx
              .select(kolonlar)
              .from(leads)
              .where(and(eq(leads.tenantId, ctx.tenantId), inArray(leads.id, benzersiz.slice(i, i + 500))))
              .all(),
          );
        }
        bulunamayan = benzersiz.length - hedefler.length;
      } else {
        hedefler = tx.select(kolonlar).from(leads).where(filtreKosulu(ctx, secim.filtre)).all();
        if (secim.beklenenToplam !== undefined && hedefler.length !== secim.beklenenToplam) {
          throw new TopluSecimDegistiHatasi(hedefler.length);
        }
      }
      if (hedefler.length > TOPLU_ISLEM_AZAMI) throw new KayitKuraliHatasi(TOPLU_ISLEM_SINIRI_METNI, 400);

      const atlanan = Object.fromEntries(TOPLU_ATLAMA_NEDENLERI.map((n) => [n, 0])) as Record<TopluAtlamaNedeni, number>;
      const idler = hedefler.map((h) => h.id);
      const waIzinleri = new Map<string, WhatsappIzni>();
      const waYok = new Set<string>();
      const engelli = new Set<string>();
      const simdi = new Date();
      if ((islem.tur === "alici_turu" || islem.tur === "whatsapp_izni") && idler.length) {
        for (let i = 0; i < idler.length; i += 500) {
          const parca = idler.slice(i, i + 500);
          for (const w of tx
            .select({ leadId: whatsappKisileri.leadId, izin: whatsappKisileri.izin, whatsappYokTarihi: whatsappKisileri.whatsappYokTarihi })
            .from(whatsappKisileri)
            .where(and(eq(whatsappKisileri.tenantId, ctx.tenantId), inArray(whatsappKisileri.leadId, parca)))
            .all()) {
            waIzinleri.set(w.leadId, w.izin);
            // Gönderim kuralıyla aynı pencere (alici-kurallari.ts): Meta son 90 günde "numarada WhatsApp yok" dedi.
            if (w.whatsappYokTarihi && simdi.getTime() - w.whatsappYokTarihi.getTime() < WHATSAPP_YOK_GUN * 86_400_000) waYok.add(w.leadId);
          }
          // Engel listesine bu kayıt adına yazılmış adres (ret akışı) ...
          for (const e of tx
            .selectDistinct({ leadId: engelListesi.leadId })
            .from(engelListesi)
            .where(and(eq(engelListesi.tenantId, ctx.tenantId), inArray(engelListesi.leadId, parca)))
            .all()) {
            if (e.leadId) engelli.add(e.leadId);
          }
        }
        // ... ya da kendi adreslerinden (e-posta, ek telefon) biri engel listesinde (listedeki "Engelli" işareti).
        for (const id of engelliKayitlar(ctx, hedefler)) engelli.add(id);
      }

      const olaylar: { leadId: string; tur: OlayTuru; aciklama: string }[] = [];
      for (const h of hedefler) {
        const kosul = and(eq(leads.id, h.id), eq(leads.tenantId, ctx.tenantId));
        if (islem.tur === "etiket_ekle" || islem.tur === "etiket_kaldir") {
          const var_ = h.etiketler.includes(islem.etiket);
          if (islem.tur === "etiket_ekle" ? var_ : !var_) {
            atlanan.ayni++;
            continue;
          }
          if (islem.tur === "etiket_ekle" && h.etiketler.length >= KAYIT_ETIKET_AZAMI) {
            atlanan.etiket_siniri++;
            continue;
          }
          const etiketler = islem.tur === "etiket_ekle" ? [...h.etiketler, islem.etiket] : h.etiketler.filter((e) => e !== islem.etiket);
          tx.update(leads).set({ etiketler, guncellemeTarihi: simdi }).where(kosul).run();
          olaylar.push({
            leadId: h.id,
            tur: "bilgi",
            aciklama: `Toplu işlem: "${islem.etiket}" etiketi ${islem.tur === "etiket_ekle" ? "eklendi" : "kaldırıldı"}`,
          });
          continue;
        }
        // alici_turu / whatsapp_izni: önce ret / engel (aynı değerde olsa da "ret" / "engelli" sayılır: dokunulmayan kayıt
        // nedeniyle görünür).
        if (h.iletiIzni === "ret" || waIzinleri.get(h.id) === "ret") {
          atlanan.ret++;
          continue;
        }
        if (engelli.has(h.id)) {
          atlanan.engelli++;
          continue;
        }
        if (islem.tur === "whatsapp_izni") {
          if (waYok.has(h.id)) {
            atlanan.whatsapp_yok++;
            continue;
          }
          if (waIzinleri.get(h.id) === "var") {
            atlanan.ayni++;
            continue;
          }
          const alanlar = {
            izin: "var" as const,
            izinTarihi: simdi,
            izinKaynagi: islem.kaynak,
            izinNotu: izinAciklamasi,
            izinIceAktarmaId: null,
            izinKaydedenId: ctx.userId || null,
            guncellemeTarihi: simdi,
          };
          // İYS beyanı (iys_beyan_tarihi) alanlarda yok: dokunulmaz. 'ret' satırı koşulla da korunur.
          const yazilan = tx
            .insert(whatsappKisileri)
            .values({ tenantId: ctx.tenantId, leadId: h.id, ...alanlar })
            .onConflictDoUpdate({
              target: [whatsappKisileri.tenantId, whatsappKisileri.leadId],
              set: alanlar,
              setWhere: sql`${whatsappKisileri.izin} <> 'ret'`,
            })
            .returning({ leadId: whatsappKisileri.leadId })
            .get();
          if (!yazilan) {
            atlanan.ret++;
            continue;
          }
          tx.update(leads).set({ guncellemeTarihi: simdi }).where(kosul).run();
          olaylar.push({
            leadId: h.id,
            tur: "izin",
            aciklama: `Toplu işlem: WhatsApp izni kaydedildi (${WHATSAPP_IZIN_KAYNAK_ADLARI[islem.kaynak]}${izinAciklamasi ? `: ${izinAciklamasi}` : ""})`,
          });
          continue;
        }
        if (h.aliciTuru === islem.aliciTuru) {
          atlanan.ayni++;
          continue;
        }
        const iysKuraliKalkar = h.aliciTuru === "bireysel" && islem.aliciTuru === "tacir_esnaf";
        if (iysKuraliKalkar && h.kaynak === "meta_reklam") {
          atlanan.meta_reklam++;
          continue;
        }
        tx.update(leads).set({ aliciTuru: islem.aliciTuru, guncellemeTarihi: simdi }).where(kosul).run();
        const waIzinli = waIzinleri.get(h.id) === "var";
        olaylar.push({
          leadId: h.id,
          // Tek kayıt düzenlemesiyle aynı: WhatsApp izinli bireysel kişi tacir/esnaf olunca İYS beyanı kuralı kalkar.
          tur: iysKuraliKalkar && waIzinli ? "izin" : "bilgi",
          aciklama: `Toplu işlem: alıcı türü ${ALICI_TURU_ADLARI[h.aliciTuru]} → ${ALICI_TURU_ADLARI[islem.aliciTuru]}${
            iysKuraliKalkar && waIzinli ? " (yönetici; İYS beyanı kuralı kalktı)" : ""
          }`,
        });
      }

      for (let i = 0; i < olaylar.length; i += 500) {
        tx.insert(leadEvents)
          .values(
            olaylar.slice(i, i + 500).map((o) => ({
              id: crypto.randomUUID(),
              tenantId: ctx.tenantId,
              leadId: o.leadId,
              tur: o.tur,
              aciklama: o.aciklama,
              kullaniciId: ctx.userId || null,
              sistem: true,
            })),
          )
          .run();
      }

      const sonuc: TopluSonuc = { hedef: hedefler.length, degisen: olaylar.length, atlanan, bulunamayan };
      const islemMetni =
        islem.tur === "alici_turu"
          ? `alıcı türü → ${ALICI_TURU_ADLARI[islem.aliciTuru]}`
          : islem.tur === "whatsapp_izni"
            ? `WhatsApp izni kaydı; kaynak: ${WHATSAPP_IZIN_KAYNAK_ADLARI[islem.kaynak]}${izinAciklamasi ? ` (${izinAciklamasi})` : ""}`
            : `"${islem.etiket}" etiketi ${islem.tur === "etiket_ekle" ? "ekleme" : "kaldırma"}`;
      const atlananMetni = TOPLU_ATLAMA_NEDENLERI.filter((n) => atlanan[n]).map((n) => `${n}: ${atlanan[n]}`);
      tx.insert(denetimKayitlari)
        .values({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          kullaniciId: ctx.userId || null,
          kullaniciAdi: tx.select({ ad: user.name }).from(user).where(eq(user.id, ctx.userId)).get()?.ad ?? null,
          olay: DENETIM_TOPLU_KAYIT,
          deger: islem.tur,
          aciklama: `Toplu işlem (${"idler" in secim ? "seçilen kayıtlar" : "filtreye uyan tümü"}): ${islemMetni}. ${sonuc.hedef} kayıt, ${
            sonuc.degisen
          } değişti${atlananMetni.length ? `; atlanan ${atlananMetni.join(", ")}` : ""}.${
            islem.tur === "whatsapp_izni" ? ` İzin kaydedilen kişi sayısı: ${sonuc.degisen}. Onaylanan beyan: "${WHATSAPP_TOPLU_IZIN_BEYANI}"` : ""
          }`,
          tarih: simdi,
        })
        .run();
      if (secenek.onizleme) {
        onizlemeSonucu = sonuc;
        throw new TopluOnizlemeGeriAlindi(); // transaction geri alınır: hiçbir şey yazılmaz
      }
      return sonuc;
    });
  } catch (h) {
    // Önizlemede transaction bilerek geri alınır; hesaplanan sonuç döner.
    if (onizlemeSonucu && h instanceof TopluOnizlemeGeriAlindi) return onizlemeSonucu;
    throw h;
  }
}

/** Toplu işlem önizlemesinin transaction'ı geri almak için fırlattığı iç sinyal (dışarı çıkmaz). */
class TopluOnizlemeGeriAlindi extends Error {}
