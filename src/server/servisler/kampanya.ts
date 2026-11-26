// Kampanya özeti ve oluşturma. Alıcı kuralları (aliciDegerlendir) burada, kuyruğa eklemeden önce uygulanır;
// işçi her mesajdan hemen önce aynı fonksiyonla YENİDEN kontrol eder.
// WhatsApp (Cloud API): onaylı şablon + değişken eşleme; test modu açıksa yalnızca test numaraları; tahmini Meta
// ücreti (bilgi amaçlı); yalnızca yönetici başlatır (K12). Görselli (IMAGE başlıklı) şablonda kampanya görseli
// zorunludur (bu çalışma alanının, kampanya-gorseli.ts ile yüklenmiş); alıcı, izin, İYS, test modu, saat ve limit
// kuralları görselsiz kampanyayla aynıdır.
import { z } from "zod";
import {
  ALICI_TURLERI,
  HARIC_NEDEN_ADLARI,
  HARIC_NEDENLERI,
  KAMPANYA_AZAMI_ALICI,
  KUYRUK_KANALLARI,
  type HaricNedeni,
  type KuyrukKanali,
} from "@/lib/mesajlasma";
import { birimFiyat, WHATSAPP_FIYATLARI } from "@/lib/whatsapp-fiyatlar";
import {
  baslikBicimiBul,
  DEGISKEN_KAYNAKLARI,
  degiskenDegerleri,
  GORSEL_BASLIK,
  hesapKilidiMesaji,
  limitKatmaniSayisi,
  numaraEtiketi,
  sablonMetni,
  type DegiskenEslemi,
  type Kalite,
} from "@/lib/whatsapp-api";
import { KAYIT_DURUMLARI } from "@/lib/sabitler";
import { sablonDoldur, smsAltbilgisi } from "@/lib/sablon";
import { smsUzunlugu } from "@/lib/sms-uzunluk";
import { gunAnahtari } from "@/lib/zaman";
import { cagriBirimi } from "../places/istemci";
import { yoneticiOlmali, type TenantContext } from "../repo/baglam";
import { kotaDurumu } from "../repo/kullanim";
import { sayacDegeri } from "../repo/gonderim-sayaci";
import { iletiAyarlariGetir } from "../repo/ileti-ayarlari";
import {
  kampanyaAdaylari,
  kampanyaDevamEttir,
  kampanyaGetir,
  kampanyaOlustur,
  type Kampanya,
  type KampanyaAdayi,
} from "../repo/kampanyalar";
import { whatsappSon24Saat } from "../repo/kuyruk";
import { kampanyaGorseliGetir } from "../repo/kampanya-gorselleri";
import { baglantiGetir } from "../repo/whatsapp-baglantilari";
import { sablonGetir } from "../repo/whatsapp-sablonlari";
import { whatsappKisileriGetir } from "../repo/whatsapp-kisileri";
import type { AliciKarari } from "../messaging/alici-kurallari";
import { kampanyaGorselDto, type KampanyaGorselDto } from "./kampanya-gorseli";
import { baglantiyiTestEt, whatsappBaglantisiCoz } from "./whatsapp-api";
import { saglayiciDurumlari } from "../repo/saglayicilar";
import { aliciDegerlendir } from "../messaging/alici-kurallari";
import { engelSorgusuOlustur, gunlukSinir, ticariIletiEksikleri } from "./ileti";

export class KampanyaHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "KampanyaHatasi";
  }
}

/** WhatsApp şablon değişkenlerinin eşlemesi (kampanya ve gelen kutusundaki tek alıcılı gönderim). */
export const DegiskenEslemGirdisi = z.record(
  z.string().max(80),
  z
    .object({
      kaynak: z.enum(DEGISKEN_KAYNAKLARI),
      deger: z.string().trim().max(500).optional(),
      yedek: z.string().trim().max(500).optional(),
    })
    .strict(),
);

export const KampanyaGirdisi = z
  .object({
    kanal: z.enum(KUYRUK_KANALLARI),
    ad: z.string().trim().min(1, "Kampanya adı gerekli.").max(120),
    konu: z.string().trim().max(200).optional(),
    /** E-posta / SMS metni. WhatsApp'ta kullanılmaz (onaylı şablon). */
    sablon: z.string().trim().max(5000, "Mesaj en fazla 5.000 karakter olabilir.").optional(),
    /** Yalnızca WhatsApp: gönderen numara (bu çalışma alanının bağlantısı), senkronize şablonun kimliği ve değişken eşlemesi. */
    baglantiId: z.string().max(100).optional(),
    sablonId: z.string().max(100).optional(),
    /** Yalnızca görselli WhatsApp şablonu: yüklenen kampanya görselinin kimliği (POST /api/kampanyalar/gorsel). */
    gorselId: z.string().max(100).optional(),
    degiskenEslem: DegiskenEslemGirdisi.optional(),
    bosIsimHitabi: z.string().trim().max(80).optional(),
    filtre: z
      .object({
        durum: z.enum(KAYIT_DURUMLARI).optional(),
        etiket: z.string().trim().toLowerCase().max(40).optional(),
        aliciTuru: z.enum(ALICI_TURLERI).optional(),
      })
      .strict(),
    /** true: sağlayıcı tanımlı olsa da gerçek gönderim yapılmaz (sandbox). */
    testModu: z.boolean().default(false),
    planlananTarih: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .superRefine((k, c) => {
    if (k.kanal === "eposta" && !k.konu) c.addIssue({ code: "custom", message: "E-posta konusu gerekli.", path: ["konu"] });
    if (k.kanal !== "whatsapp_api" && !k.sablon) c.addIssue({ code: "custom", message: "Mesaj metni gerekli.", path: ["sablon"] });
    if (k.kanal === "whatsapp_api" && !k.baglantiId) c.addIssue({ code: "custom", message: "Gönderen WhatsApp numarasını seçin.", path: ["baglantiId"] });
    if (k.kanal === "whatsapp_api" && !k.sablonId) c.addIssue({ code: "custom", message: "WhatsApp şablonu seçin.", path: ["sablonId"] });
    if (k.kanal === "sms" && (k.sablon ?? "").length > 900) {
      c.addIssue({ code: "custom", message: "SMS metni en fazla 900 karakter olabilir.", path: ["sablon"] });
    }
  });
export type KampanyaGirdisi = z.infer<typeof KampanyaGirdisi>;

/** WhatsApp (Cloud API) kampanyasına özel özet. */
export type WhatsappOzeti = {
  /** Gönderen numara ("Merkez · …4567"). */
  numara: { id: string; etiket: string };
  sablonAdi: string;
  dil: string;
  kategori: string;
  /** Görselli şablon: kampanya görseli (önizleme adresiyle); görselsizse null. */
  gorsel: KampanyaGorselDto | null;
  baglantiVar: boolean;
  /** Bağlantının test modu: yalnızca test numaraları. */
  testModu: boolean;
  kalite: Kalite | null;
  /** Meta hesap kilidinin uyarısı (131031, 368, 131042); doluyken gerçek kampanya başlatılamaz. */
  hesapKilidi: string | null;
  /** Meta limitinin bu uygulamaya ayrılan payı (24 saatte ileti); null: sınırsız. */
  limitPayi: number | null;
  son24Saat: number;
  birimFiyatUsd: number | null;
  tahminiUcretUsd: number | null;
  fiyatTarihi: string;
  fiyatDogrulandi: boolean;
  /** İlk (en fazla) üç uygun alıcının şablon metni. */
  onizlemeler: string[];
};

export type KampanyaOzeti = {
  kanal: KuyrukKanali;
  toplamAday: number;
  gonderilecek: number;
  haricler: Record<HaricNedeni, number>;
  /** Çalışma alanının İYS kontrolü; kapalıysa özet ve sihirbaz IYS_KAPALI_UYARISI'nı gösterir. */
  iysKontrolu: boolean;
  /** Uygun alıcılardan işletme adı girilmemiş olanlar ({isletme} boş isim hitabıyla dolar / kaldırılır). */
  isletmeAdiEksik: number;
  /** Başlangıç gününün kalan sınırını aşan alıcılar sonraki günlere kalır. */
  gunlukSinir: number;
  bugunKalan: number;
  sonrakiGunlereKalacak: number;
  sandbox: boolean;
  /** Sandbox dışı gönderim için Ayarlar'da eksik olanlar. */
  eksikAyarlar: string[];
  onizleme: string | null;
  /** SMS: telefonu kayıtta olmayan, gönderim anında Places'tan alınacak alıcılar ve tahmini kota maliyeti. */
  placesTelefonGerekli: number;
  tahminiKotaBirimi: number;
  kotaKalan: number;
  /** Arayüz için: tahmini kullanımın aylık kotaya oranı (yüzde, yukarı yuvarlanmış) ve kalan kotanın yetip yetmediği. */
  tahminiKullanimYuzdesi: number;
  kotaYetmez: boolean;
  /** SMS: ilk alıcının mesajı (altbilgi dahil) kaç parça. */
  smsParca: number | null;
  whatsapp: WhatsappOzeti | null;
};

type Karar = { kayit: KampanyaAdayi; karar: AliciKarari };

/** WhatsApp: alıcı kuralları + test modu + değişken değerleri; şablon ve bağlantı bilgisi. */
function whatsappKararlari(ctx: TenantContext, g: KampanyaGirdisi, adaylar: KampanyaAdayi[], simdi: Date) {
  const numara = g.baglantiId ? baglantiGetir(ctx, g.baglantiId) : null;
  if (!numara) throw new KampanyaHatasi("Gönderen WhatsApp numarası bulunamadı (Ayarlar → WhatsApp).");
  const sablon = g.sablonId ? sablonGetir(ctx, g.sablonId) : null;
  if (!sablon) throw new KampanyaHatasi("Şablon bulunamadı; Ayarlar'dan şablonları senkronize edin.");
  // Şablon WABA'ya aittir: başka WABA'daki numara bu şablonla gönderemez.
  if (sablon.wabaId !== numara.wabaId) throw new KampanyaHatasi(`Bu şablon ${numaraEtiketi(numara)} numarasının WhatsApp hesabında yok.`);
  if (sablon.destekNedeni) throw new KampanyaHatasi(`Bu şablon kampanyada kullanılamaz: ${sablon.destekNedeni}`);
  // Görselli şablon: görsel zorunlu ve bu çalışma alanının olmalı (başka çalışma alanının görseli "bulunamadı").
  let gorsel = null;
  if (baslikBicimiBul(sablon.bilesenler) === GORSEL_BASLIK) {
    if (!g.gorselId) throw new KampanyaHatasi("Bu şablon görselli: Mesaj adımında JPEG ya da PNG bir görsel yükleyin.");
    gorsel = kampanyaGorseliGetir(ctx, g.gorselId);
    if (!gorsel) throw new KampanyaHatasi("Kampanya görseli bulunamadı; görseli yeniden yükleyin.");
  }
  const eslem: DegiskenEslemi = g.degiskenEslem ?? {};
  const c = whatsappBaglantisiCoz(ctx, numara.id);
  const testModu = !g.testModu && (c?.baglanti.testModu ?? true);
  const testNumaralari = new Set(c?.gizli.testNumaralari ?? []);
  const waBilgisi = whatsappKisileriGetir(ctx, adaylar.map((k) => k.id));
  const engelli = engelSorgusuOlustur(ctx, adaylar);
  const iysKontrolu = iletiAyarlariGetir(ctx).iysKontrolu;
  const kararlar: Karar[] = adaylar.map((kayit) => {
    // Test modunda test numaralarına İYS beyanı aranmaz (alici-kurallari.ts); sandbox ve test modu kapalıyken aranır.
    let karar = aliciDegerlendir({ ...kayit, whatsapp: waBilgisi.get(kayit.id) ?? null }, "whatsapp_api", engelli, {
      simdi,
      testNumaralari: testModu ? testNumaralari : undefined,
      iysKontrolu,
    });
    if (karar.uygun && testModu && (karar.kaynak !== "kayit" || !testNumaralari.has(karar.adres!))) {
      karar = { uygun: false, neden: "test_modu" };
    }
    if (karar.uygun && !degiskenDegerleri(sablon.degiskenler, eslem, kayit)) karar = { uygun: false, neden: "degisken_bos" };
    return { kayit, karar };
  });
  return { numara, sablon, eslem, c, testModu, kararlar, gorsel };
}

function whatsappOzeti(
  ctx: TenantContext,
  w: ReturnType<typeof whatsappKararlari>,
  gonderilecek: number,
  simdi: Date,
): WhatsappOzeti {
  const { numara, sablon, eslem, c } = w;
  const limit = c ? (limitKatmaniSayisi(c.baglanti.limitKatmani) ?? 250) : null;
  const fiyat = birimFiyat(sablon.kategori);
  return {
    numara: { id: numara.id, etiket: numaraEtiketi(numara) },
    sablonAdi: sablon.ad,
    dil: sablon.dil,
    kategori: sablon.kategori,
    gorsel: w.gorsel ? kampanyaGorselDto(w.gorsel) : null,
    baglantiVar: Boolean(c),
    testModu: w.testModu,
    kalite: (c?.baglanti.kalite as Kalite | null) ?? null,
    hesapKilidi: c?.baglanti.hesapKilidiKodu != null ? hesapKilidiMesaji(c.baglanti.hesapKilidiKodu) : null,
    limitPayi: limit === null || !Number.isFinite(limit) ? null : Math.max(1, Math.floor((limit * c!.baglanti.uygulamaPayi) / 100)),
    son24Saat: c ? whatsappSon24Saat(ctx, simdi, "") : 0,
    birimFiyatUsd: fiyat,
    tahminiUcretUsd: fiyat === null ? null : Math.round(fiyat * gonderilecek * 10_000) / 10_000,
    fiyatTarihi: WHATSAPP_FIYATLARI.tarih,
    fiyatDogrulandi: WHATSAPP_FIYATLARI.dogrulandi,
    onizlemeler: w.kararlar
      .filter((x) => x.karar.uygun)
      .slice(0, 3)
      .map((x) => sablonMetni(sablon.bilesenler, degiskenDegerleri(sablon.degiskenler, eslem, x.kayit)!)),
  };
}

/** tekilAday verilirse (tek alıcılı kampanya) filtre kullanılmaz; kurallar aynen uygulanır. */
function hazirla(ctx: TenantContext, g: KampanyaGirdisi, simdi: Date, tekilAday?: KampanyaAdayi) {
  const adaylar = tekilAday ? [tekilAday] : kampanyaAdaylari(ctx, g.filtre);
  if (adaylar.length > KAMPANYA_AZAMI_ALICI) {
    throw new KampanyaHatasi(`Bir kampanyada en fazla ${KAMPANYA_AZAMI_ALICI} alıcı olabilir; filtreyi daraltın.`);
  }
  const wa = g.kanal === "whatsapp_api" ? whatsappKararlari(ctx, g, adaylar, simdi) : null;
  const kanal = g.kanal;
  const kararlar: Karar[] =
    wa?.kararlar ??
    (kanal === "whatsapp_api"
      ? []
      : (() => {
          const engelli = engelSorgusuOlustur(ctx, adaylar);
          return adaylar.map((k) => ({ kayit: k, karar: aliciDegerlendir(k, kanal, engelli) }));
        })());

  const ayar = iletiAyarlariGetir(ctx);
  // WhatsApp'ta "test (sandbox)" yalnızca açıkça seçilirse; bağlantı yoksa gerçek kampanya başlatılamaz.
  const sandbox = kanal === "whatsapp_api" ? g.testModu : g.testModu || !saglayiciDurumlari(ctx)[kanal].tanimli;
  const haricler = Object.fromEntries(HARIC_NEDENLERI.map((n) => [n, 0])) as Record<HaricNedeni, number>;
  let gonderilecek = 0;
  let isletmeAdiEksik = 0;
  let placesTelefonGerekli = 0;
  for (const { kayit, karar } of kararlar) {
    if (!karar.uygun) haricler[karar.neden]++;
    else {
      gonderilecek++;
      if (!kayit.isletmeAdi?.trim()) isletmeAdiEksik++;
      if (karar.adres === null) placesTelefonGerekli++;
    }
  }
  const baslangic = g.planlananTarih ? new Date(g.planlananTarih) : simdi;
  const sinir = gunlukSinir(ayar, g.kanal);
  let bugunKalan = Math.max(0, sinir - sayacDegeri(ctx, g.kanal, gunAnahtari(baslangic)));
  const ilk = kararlar.find((x) => x.karar.uygun)?.kayit;
  const whatsapp = wa ? whatsappOzeti(ctx, wa, gonderilecek, simdi) : null;
  if (whatsapp && !sandbox && whatsapp.limitPayi !== null) {
    bugunKalan = Math.min(bugunKalan, Math.max(0, whatsapp.limitPayi - whatsapp.son24Saat));
  }
  const onizleme = whatsapp
    ? (whatsapp.onizlemeler[0] ?? null)
    : ilk
      ? sablonDoldur(g.sablon ?? "", ilk.isletmeAdi, g.bosIsimHitabi)
      : null;

  const ozet: KampanyaOzeti = {
    kanal: g.kanal,
    toplamAday: adaylar.length,
    gonderilecek,
    haricler,
    isletmeAdiEksik,
    iysKontrolu: ayar.iysKontrolu,
    gunlukSinir: sinir,
    bugunKalan,
    sonrakiGunlereKalacak: Math.max(0, gonderilecek - bugunKalan),
    sandbox,
    // WhatsApp test modu (bağlantı var, kampanya yalnızca test numaralarına): gönderen bilgileri aranmaz, Meta'ya
    // gerçekten gönderilir. Test modu kapalıyken her gerçek kampanya bunları ister (işçi gönderirken yeniden bakar).
    eksikAyarlar: sandbox || (whatsapp?.baglantiVar && whatsapp.testModu) ? [] : ticariIletiEksikleri(ayar, g.kanal),
    onizleme,
    placesTelefonGerekli,
    ...telefonKullanimi(placesTelefonGerekli * cagriBirimi("telefon"), kotaDurumu(ctx)),
    whatsapp,
    smsParca: g.kanal === "sms" && onizleme !== null ? smsUzunlugu(`${onizleme}
${smsAltbilgisi(ayar)}`).parca : null,
  };
  return { ozet, kararlar, sablon: wa?.sablon ?? null };
}

/** Gönderim anında Places'tan alınacak numaraların tahmini kullanımı (birim) ve arayüzdeki yüzdesi. */
function telefonKullanimi(birim: number, kota: { kota: number; kalan: number }) {
  return {
    tahminiKotaBirimi: birim,
    kotaKalan: kota.kalan,
    tahminiKullanimYuzdesi: birim === 0 ? 0 : kota.kota > 0 ? Math.ceil((birim / kota.kota) * 100) : 100,
    kotaYetmez: birim > kota.kalan,
  };
}

export function kampanyaOzeti(ctx: TenantContext, g: KampanyaGirdisi, simdi = new Date()): KampanyaOzeti {
  return hazirla(ctx, g, simdi).ozet;
}

/** Kampanyanın başlatılmasını engelleyen ilk koşul (numara, kalite, hesap kilidi, ticari ileti ayarları); yoksa null. */
function baslatmaEngeli(ozet: KampanyaOzeti): string | null {
  if (ozet.whatsapp && !ozet.sandbox && !ozet.whatsapp.baglantiVar) {
    return "Seçilen numaranın sahipliği doğrulanmadı (Ayarlar → WhatsApp → Bağlantıyı test et).";
  }
  if (ozet.whatsapp?.kalite === "RED" && !ozet.sandbox) {
    return "Numaranın kalite puanı düşük (kırmızı); kalite düzelene kadar kampanya başlatılamaz.";
  }
  if (ozet.whatsapp?.hesapKilidi && !ozet.sandbox) return `${ozet.whatsapp.hesapKilidi} Kilit kalkana kadar kampanya başlatılamaz.`;
  if (!ozet.sandbox && ozet.eksikAyarlar.length) {
    return `Gerçek gönderim için Ayarlar → Ticari ileti bölümünü tamamlayın: ${ozet.eksikAyarlar.join(", ")}.`;
  }
  return null;
}

export function kampanyaBaslat(ctx: TenantContext, g: KampanyaGirdisi, simdi = new Date()): Kampanya {
  if (g.kanal === "whatsapp_api") yoneticiOlmali(ctx); // Meta ücreti var (K12)
  const hazir = hazirla(ctx, g, simdi);
  const engel = baslatmaEngeli(hazir.ozet);
  if (engel) throw new KampanyaHatasi(engel);
  if (hazir.ozet.gonderilecek === 0) throw new KampanyaHatasi("Kurallara uyan alıcı yok; kampanya oluşturulmadı.");
  return kampanyaYaz(ctx, g, hazir, simdi);
}

/**
 * Tek alıcılı WhatsApp kampanyası (gelen kutusu "Şablon gönder"): toplu kampanyanın bütün kuralları aynen uygulanır
 * (RET, engel listesi, WhatsApp izni ve İYS, "Numarada WhatsApp yok", test modu, şablon WABA eşleşmesi, numara durumu,
 * ticari ileti ayarları). Ayrıca alıcı bugün gönderilemiyorsa (günlük sınır ya da Meta limitinin bu uygulamaya ayrılan
 * payı dolu) kampanya ertesi güne bırakılmaz: engel döner. Yazmaz; engel null ise tekilKampanyaBaslat başlatır.
 */
export function tekilKampanyaDegerlendir(ctx: TenantContext, g: KampanyaGirdisi, aday: KampanyaAdayi, simdi = new Date()) {
  const tekilGirdi: KampanyaGirdisi = { ...g, kanal: "whatsapp_api", testModu: false, planlananTarih: null, filtre: {} };
  const hazir = hazirla(ctx, tekilGirdi, simdi, aday);
  const karar = hazir.kararlar[0]?.karar;
  let engel = baslatmaEngeli(hazir.ozet);
  if (!engel && karar && !karar.uygun) engel = `Gönderilemez: ${HARIC_NEDEN_ADLARI[karar.neden]}.`;
  if (!engel && hazir.ozet.bugunKalan === 0) {
    const sinirKalan = hazir.ozet.gunlukSinir - sayacDegeri(ctx, "whatsapp_api", gunAnahtari(simdi));
    engel =
      sinirKalan <= 0
        ? "Bugünkü WhatsApp gönderim sınırı doldu (Ayarlar → Ticari ileti); yarın yeniden deneyin."
        : "Meta mesajlaşma limitinin bu uygulamaya ayrılan payı doldu (son 24 saat); daha sonra yeniden deneyin.";
  }
  return { hazir, girdi: tekilGirdi, engel };
}

/** Üyeler de başlatabilir (toplu WhatsApp kampanyası yalnızca yönetici); kullanıcı başı günlük sınır çağıranda (yonlendirme.ts). */
export function tekilKampanyaBaslat(ctx: TenantContext, g: KampanyaGirdisi, aday: KampanyaAdayi, simdi = new Date()): Kampanya {
  const { hazir, girdi, engel } = tekilKampanyaDegerlendir(ctx, g, aday, simdi);
  if (engel) throw new KampanyaHatasi(engel);
  return kampanyaYaz(ctx, girdi, hazir, simdi, true);
}

function kampanyaYaz(ctx: TenantContext, g: KampanyaGirdisi, hazir: ReturnType<typeof hazirla>, simdi: Date, tekil = false): Kampanya {
  const { ozet, kararlar, sablon } = hazir;
  return kampanyaOlustur(
    ctx,
    {
      kanal: g.kanal,
      ad: g.ad,
      konu: g.kanal === "eposta" ? (g.konu ?? null) : null,
      sablon: sablon ? `${sablon.ad} (${sablon.dil})` : (g.sablon ?? ""),
      bosIsimHitabi: g.bosIsimHitabi || null,
      sablonId: sablon?.id ?? null,
      degiskenEslem: sablon ? (g.degiskenEslem ?? {}) : null,
      baglantiId: ozet.whatsapp?.numara.id ?? null,
      gorselMedyaId: ozet.whatsapp?.gorsel?.id ?? null,
      filtre: g.filtre,
      sandbox: ozet.sandbox,
      planlananTarih: g.planlananTarih ? new Date(g.planlananTarih) : null,
      tekil,
    },
    kararlar.map(({ kayit, karar }) => ({ leadId: kayit.id, haric: karar.uygun ? undefined : karar.neden })),
    simdi,
  );
}

/**
 * Duraklatılmış WhatsApp kampanyasını devam ettirir (yalnızca yönetici). Bağlantı Meta'dan yeniden test edilir: kalite
 * hâlâ kırmızıysa ya da Meta hesap kilidi kalkmadıysa (test başarısız; kilit yalnızca başarılı testte silinir) devam
 * ettirilmez.
 */
export async function kampanyayiDevamEttir(ctx: TenantContext, id: string): Promise<void> {
  yoneticiOlmali(ctx);
  const k = kampanyaGetir(ctx, id);
  if (!k) throw new KampanyaHatasi("Kampanya bulunamadı.");
  if (k.durum !== "duraklatildi") throw new KampanyaHatasi("Kampanya duraklatılmış değil.");
  if (k.kanal === "whatsapp_api" && !k.sandbox) {
    const c0 = k.baglantiId ? whatsappBaglantisiCoz(ctx, k.baglantiId) : null;
    if (!k.baglantiId || !c0) throw new KampanyaHatasi("Kampanyanın gönderen numarası artık bağlı değil; kampanya devam ettirilemez.");
    try {
      await baglantiyiTestEt(ctx, k.baglantiId);
    } catch {
      /* Meta'ya ulaşılamadıysa son bilinen kalite kullanılır */
    }
    const c = whatsappBaglantisiCoz(ctx, k.baglantiId);
    if (!c) throw new KampanyaHatasi("Kampanyanın gönderen numarası artık doğrulanmış değil (Ayarlar → WhatsApp → Bağlantıyı test et).");
    if (c.baglanti.kalite === "RED") {
      throw new KampanyaHatasi("Numaranın kalite puanı hâlâ düşük (kırmızı); kampanya devam ettirilemez.");
    }
    if (c.baglanti.hesapKilidiKodu != null) {
      throw new KampanyaHatasi(
        `${hesapKilidiMesaji(c.baglanti.hesapKilidiKodu)} Kilit kalkınca Ayarlar'da "Bağlantıyı test et", sonra devam ettirin.`,
      );
    }
  }
  if (!kampanyaDevamEttir(ctx, id)) throw new KampanyaHatasi("Kampanya devam ettirilemedi.");
}
