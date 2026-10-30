// WhatsApp Business Platform (Cloud API) bağlantısı ve şablonları. Kalıcı erişim anahtarı, App Secret, verify token
// ve test numaraları AES-GCM ile şifreli saklanır; hiçbir API yanıtında dönmez (yalnızca "tanımlı / tanımlı değil").
// Verify token yalnızca üretildiği anda bir kez gösterilir.
import "server-only";
import { randomBytes } from "node:crypto";
import { cepMi, telefonNormallestir } from "@/lib/adres-normal";
import {
  KALITE_DEGERLERI,
  limitKatmaniSayisi,
  sablonCozumle,
  TEST_NUMARASI_AZAMI,
  type Kalite,
} from "@/lib/whatsapp-api";
import { uygulamaAdresi } from "../messaging/abonelik-belirteci";
import { coz, sifrele } from "../messaging/sifreleme";
import { yoneticiOlmali, type TenantContext } from "../repo/baglam";
import {
  baglantiGetir,
  baglantiKaydet,
  baglantiSifreliVeriYaz,
  numaraBilgisiYaz,
  numaraDogrulamaYaz,
  testModuAyarla,
  uygulamaPayiAyarla,
  type WhatsappBaglantisi,
} from "../repo/whatsapp-baglantilari";
import { sablonlariListele, sablonlariSenkronla, type WhatsappSablonu } from "../repo/whatsapp-sablonlari";
import { GraphHatasi, whatsappApiIstemcisi, type WhatsappApiIstemcisi } from "../whatsapp-api";

const KANAL = "whatsapp_api";

export class WhatsappApiHatasi extends Error {
  constructor(
    mesaj: string,
    readonly durum = 400,
  ) {
    super(mesaj);
    this.name = "WhatsappApiHatasi";
  }
}

/** Şifreli alanın içeriği. */
type Gizli = { erisimAnahtari: string; appSecret: string; verifyToken: string; testNumaralari: string[] };

const gizliCoz = (b: WhatsappBaglantisi) => coz<Gizli>(b.sifreliVeri, b.tenantId, KANAL);
const gizliSifrele = (tenantId: string, g: Gizli) => sifrele(g, tenantId, KANAL);
const yeniVerifyToken = () => randomBytes(24).toString("base64url");

export const webhookAdresi = (b: Pick<WhatsappBaglantisi, "webhookKimligi">) =>
  `${uygulamaAdresi()}/api/whatsapp/webhook/${b.webhookKimligi}`;

/**
 * Bağlantı ve çözülmüş gizli bilgiler (kampanya işçisi ve webhook için). Bağlantı yoksa ya da numara sahipliği
 * doğrulanmamışsa null: doğrulanmamış bağlantı "bağlı" sayılmaz.
 */
export function whatsappBaglantisiCoz(ctx: TenantContext): { baglanti: WhatsappBaglantisi; gizli: Gizli } | null {
  const baglanti = baglantiGetir(ctx);
  return baglanti?.numaraDogrulamaTarihi ? { baglanti, gizli: gizliCoz(baglanti) } : null;
}

/** Numara sahipliği doğrulanamadı. Numaranın başka bir çalışma alanına bağlı olup olmadığını AÇIĞA VURMAZ. */
const SAHIPLIK_HATASI =
  "Numara doğrulanamadı: Phone Number ID bu WABA'da bulunamadı, erişim anahtarının bu WABA'ya yetkisi yok ya da numara " +
  "bu çalışma alanına bağlanamıyor. WABA ID, Phone Number ID ve anahtarın izinlerini kontrol edin.";

/** Numara bu WABA'ya ait değil (ya da anahtar bu WABA'yı göremiyor): bağlantı kullanılmaz. */
class SahiplikHatasi extends WhatsappApiHatasi {
  constructor() {
    super(SAHIPLIK_HATASI, 400);
  }
}

/**
 * phone_number_id'nin girilen WABA'ya ait olduğunu kiracının KENDİ erişim anahtarıyla Graph API'den doğrular
 * (GET /{waba-id}/phone_numbers). Meta'ya ulaşılamazsa 502 (geçici); anahtar geçersizse Meta'nın mesajı (400; yalnızca
 * kiracının kendi anahtarıyla ilgili); diğer her durumda tek tip SahiplikHatasi.
 */
async function numaraSahipligiDogrula(g: { wabaId: string; phoneNumberId: string; erisimAnahtari: string }) {
  let numaralar: string[];
  try {
    numaralar = await whatsappApiIstemcisi(g).wabaNumaralari();
  } catch (hata) {
    if (hata instanceof GraphHatasi && (hata.http === 0 || hata.http >= 500)) {
      throw new WhatsappApiHatasi("Meta'ya ulaşılamadı; numara doğrulanamadı. Biraz sonra tekrar deneyin.", 502);
    }
    if (hata instanceof GraphHatasi && hata.http === 401) throw new WhatsappApiHatasi(graphMesaji(hata), 400);
    throw new SahiplikHatasi();
  }
  if (!numaralar.includes(g.phoneNumberId)) throw new SahiplikHatasi();
}

function istemci(ctx: TenantContext, dogrulanmamisOlabilir = false): { baglanti: WhatsappBaglantisi; istemci: WhatsappApiIstemcisi } {
  const ham = baglantiGetir(ctx);
  const c = dogrulanmamisOlabilir && ham ? { baglanti: ham, gizli: gizliCoz(ham) } : whatsappBaglantisiCoz(ctx);
  if (!c && ham) throw new WhatsappApiHatasi("Numara sahipliği doğrulanmadı: önce \"Bağlantıyı test et\".", 409);
  if (!c) throw new WhatsappApiHatasi("WhatsApp Business bağlantısı tanımlı değil.", 404);
  return {
    baglanti: c.baglanti,
    istemci: whatsappApiIstemcisi({
      wabaId: c.baglanti.wabaId,
      phoneNumberId: c.baglanti.phoneNumberId,
      erisimAnahtari: c.gizli.erisimAnahtari,
    }),
  };
}

const graphMesaji = (hata: unknown) =>
  hata instanceof GraphHatasi
    ? hata.yetkiHatasi
      ? `Meta erişimi reddetti: ${hata.message} (erişim anahtarını ve izinlerini kontrol edin)`
      : `Meta hatası: ${hata.message}`
    : `Beklenmeyen hata: ${(hata as Error).message}`;

// --- Durum (istemciye giden; gizli bilgi yok) ---

export type BaglantiDto = {
  tanimli: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  erisimAnahtariTanimli: boolean;
  appSecretTanimli: boolean;
  verifyTokenTanimli: boolean;
  webhookAdresi: string | null;
  webhookDogrulandi: boolean;
  imzaliDurumAlindi: boolean;
  /** phone_number_id WABA'ya ait (Graph API); değilse bağlantı kullanılmaz. */
  numaraDogrulandi: boolean;
  testModu: boolean;
  testModuKapatilabilir: boolean;
  testNumaralari: string[];
  uygulamaPayi: number;
  numara: {
    gorunenNumara: string | null;
    dogrulanmisAd: string | null;
    kalite: Kalite | null;
    limitKatmani: string | null;
    /** 24 saatte benzersiz alıcı (portföy); null: bilinmiyor. */
    limit: number | null;
    sonKontrol: string | null;
    sonHata: string | null;
  };
  sablonSenkronTarihi: string | null;
};

export function baglantiDurumu(ctx: TenantContext): BaglantiDto {
  const b = baglantiGetir(ctx);
  if (!b) {
    return {
      tanimli: false,
      wabaId: null,
      phoneNumberId: null,
      erisimAnahtariTanimli: false,
      appSecretTanimli: false,
      verifyTokenTanimli: false,
      webhookAdresi: null,
      webhookDogrulandi: false,
      imzaliDurumAlindi: false,
      numaraDogrulandi: false,
      testModu: true,
      testModuKapatilabilir: false,
      testNumaralari: [],
      uygulamaPayi: 0,
      numara: { gorunenNumara: null, dogrulanmisAd: null, kalite: null, limitKatmani: null, limit: null, sonKontrol: null, sonHata: null },
      sablonSenkronTarihi: null,
    };
  }
  let gizli: Gizli | null = null;
  try {
    gizli = gizliCoz(b);
  } catch {
    /* anahtar değişmiş: bilgiler yeniden girilmeli; durum "tanımlı değil" görünür */
  }
  const limit = limitKatmaniSayisi(b.limitKatmani);
  return {
    tanimli: true,
    wabaId: b.wabaId,
    phoneNumberId: b.phoneNumberId,
    erisimAnahtariTanimli: Boolean(gizli?.erisimAnahtari),
    appSecretTanimli: Boolean(gizli?.appSecret),
    verifyTokenTanimli: Boolean(gizli?.verifyToken),
    webhookAdresi: webhookAdresi(b),
    webhookDogrulandi: Boolean(b.webhookDogrulamaTarihi),
    imzaliDurumAlindi: Boolean(b.sonImzaliDurumTarihi),
    numaraDogrulandi: Boolean(b.numaraDogrulamaTarihi),
    testModu: b.testModu,
    testModuKapatilabilir: Boolean(b.webhookDogrulamaTarihi && b.sonImzaliDurumTarihi),
    testNumaralari: gizli?.testNumaralari ?? [],
    uygulamaPayi: b.uygulamaPayi,
    numara: {
      gorunenNumara: b.gorunenNumara,
      dogrulanmisAd: b.dogrulanmisAd,
      kalite: KALITE_DEGERLERI.find((k) => k === b.kalite) ?? null,
      limitKatmani: b.limitKatmani,
      limit: limit === Number.POSITIVE_INFINITY ? null : limit,
      sonKontrol: b.sonKontrol?.toISOString() ?? null,
      sonHata: b.sonHata,
    },
    sablonSenkronTarihi: b.sablonSenkronTarihi?.toISOString() ?? null,
  };
}

// --- Bağlantı kaydı ---

export type BaglantiGirdisi = {
  wabaId: string;
  phoneNumberId: string;
  /** Boş/eksik: mevcut değer korunur (ilk kayıtta zorunlu). */
  erisimAnahtari?: string | null;
  appSecret?: string | null;
};

/**
 * Numara sahipliğini Graph API'den doğruladıktan sonra kaydeder (doğrulanamazsa hiçbir şey yazılmaz). İlk kayıtta
 * üretilen verify token yalnızca bu yanıtta döner.
 */
export async function whatsappBaglantisiKaydet(ctx: TenantContext, g: BaglantiGirdisi): Promise<{ verifyToken: string | null }> {
  yoneticiOlmali(ctx);
  const eski = baglantiGetir(ctx);
  let eskiGizli: Gizli | null = null;
  if (eski) {
    try {
      eskiGizli = gizliCoz(eski);
    } catch {
      eskiGizli = null; // çözülemiyorsa tüm gizli bilgiler yeniden girilmeli
    }
  }
  const erisimAnahtari = g.erisimAnahtari?.trim() || eskiGizli?.erisimAnahtari;
  const appSecret = g.appSecret?.trim() || eskiGizli?.appSecret;
  if (!erisimAnahtari || !appSecret) throw new WhatsappApiHatasi("Kalıcı erişim anahtarı ve App Secret girilmeli.");
  if (!/^\d{5,30}$/.test(g.wabaId) || !/^\d{5,30}$/.test(g.phoneNumberId)) {
    throw new WhatsappApiHatasi("WABA ID ve Phone Number ID sayısal olmalı.");
  }
  await numaraSahipligiDogrula({ wabaId: g.wabaId, phoneNumberId: g.phoneNumberId, erisimAnahtari });
  const yeniToken = eskiGizli?.verifyToken ? null : yeniVerifyToken();
  const gizli: Gizli = {
    erisimAnahtari,
    appSecret,
    verifyToken: yeniToken ?? eskiGizli!.verifyToken,
    testNumaralari: eskiGizli?.testNumaralari ?? [],
  };
  try {
    baglantiKaydet(ctx, {
      wabaId: g.wabaId,
      phoneNumberId: g.phoneNumberId,
      sifreliVeri: gizliSifrele(ctx.tenantId, gizli),
      numaraDogrulamaTarihi: new Date(),
    });
  } catch (hata) {
    // Başka çalışma alanına bağlı numara: sahiplik hatasıyla aynı mesaj ve durum (bağlı olduğu açığa çıkmaz).
    if (/UNIQUE/.test((hata as Error).message)) throw new WhatsappApiHatasi(SAHIPLIK_HATASI, 400);
    throw hata;
  }
  return { verifyToken: yeniToken };
}

/** Yeni verify token üretir (bir kez gösterilir). Webhook yeniden doğrulanana kadar test modu açık kalır. */
export function verifyTokenYenile(ctx: TenantContext): string {
  const c = whatsappBaglantisiCoz(ctx);
  if (!c) throw new WhatsappApiHatasi("WhatsApp Business bağlantısı tanımlı değil.", 404);
  const verifyToken = yeniVerifyToken();
  baglantiSifreliVeriYaz(ctx, gizliSifrele(ctx.tenantId, { ...c.gizli, verifyToken }), true);
  return verifyToken;
}

export function testNumaralariKaydet(ctx: TenantContext, numaralar: string[]): string[] {
  const c = whatsappBaglantisiCoz(ctx);
  if (!c) throw new WhatsappApiHatasi("WhatsApp Business bağlantısı tanımlı değil.", 404);
  const normal = [...new Set(numaralar.map((n) => n.trim()).filter(Boolean))].map((n) => {
    const t = telefonNormallestir(n);
    if (!cepMi(t)) throw new WhatsappApiHatasi(`Cep telefonu numarası değil: ${n}`);
    return t;
  });
  if (normal.length > TEST_NUMARASI_AZAMI) throw new WhatsappApiHatasi(`En fazla ${TEST_NUMARASI_AZAMI} test numarası.`);
  baglantiSifreliVeriYaz(ctx, gizliSifrele(ctx.tenantId, { ...c.gizli, testNumaralari: normal }));
  return normal;
}

const TEST_MODU_NEDENLERI = {
  baglanti_yok: "WhatsApp Business bağlantısı tanımlı değil.",
  webhook_dogrulanmadi:
    "Test modu kapatılamaz: webhook henüz doğrulanmadı. Meta uygulamanızda callback URL ve verify token'ı kaydedin.",
  durum_alinmadi:
    "Test modu kapatılamaz: henüz imzası doğrulanmış bir mesaj durumu (statuses) bildirimi alınmadı. Test modunda bir " +
    "test numarasına kampanya gönderip teslim bildiriminin gelmesini bekleyin.",
} as const;

export function testModuDegistir(ctx: TenantContext, acik: boolean) {
  const sonuc = testModuAyarla(ctx, acik);
  if (!sonuc.tamam) throw new WhatsappApiHatasi(TEST_MODU_NEDENLERI[sonuc.neden], sonuc.neden === "baglanti_yok" ? 404 : 409);
}

export function uygulamaPayiKaydet(ctx: TenantContext, yuzde: number) {
  if (!Number.isInteger(yuzde) || yuzde < 1 || yuzde > 100) throw new WhatsappApiHatasi("Pay 1 ile 100 arasında olmalı.");
  if (!uygulamaPayiAyarla(ctx, yuzde)) throw new WhatsappApiHatasi("WhatsApp Business bağlantısı tanımlı değil.", 404);
}

// --- Graph API ---

/**
 * Numara sahipliğini yeniden doğrular (doğrulanamazsa bağlantı kullanılmaz hale gelir), sonra numara bilgisi,
 * kalite ve portföy limitini okur ve saklar. Hata da saklanır (ekranda gösterilir). İşçi kaliteyi yenilerken de çağırır.
 */
export async function baglantiyiTestEt(ctx: TenantContext, simdi = new Date()) {
  const { baglanti, istemci: i } = istemci(ctx, true);
  const erisimAnahtari = gizliCoz(baglanti).erisimAnahtari;
  try {
    await numaraSahipligiDogrula({ wabaId: baglanti.wabaId, phoneNumberId: baglanti.phoneNumberId, erisimAnahtari });
    numaraDogrulamaYaz(ctx, baglanti.phoneNumberId, baglanti.numaraDogrulamaTarihi ?? simdi);
  } catch (hata) {
    // Sahiplik reddedildiyse bağlantı kullanılmaz; Meta'ya ulaşılamadı ya da anahtar geçersizse son doğrulama korunur.
    numaraBilgisiYaz(ctx, { sonHata: (hata as Error).message }, simdi);
    if (hata instanceof SahiplikHatasi) {
      numaraDogrulamaYaz(ctx, baglanti.phoneNumberId, null);
      throw hata;
    }
    throw new WhatsappApiHatasi((hata as Error).message, 502);
  }
  try {
    const n = await i.numaraBilgisi();
    numaraBilgisiYaz(
      ctx,
      { gorunenNumara: n.gorunenNumara, dogrulanmisAd: n.dogrulanmisAd, kalite: n.kalite, limitKatmani: n.limitKatmani, sonHata: null },
      simdi,
    );
  } catch (hata) {
    const mesaj = graphMesaji(hata);
    numaraBilgisiYaz(ctx, { sonHata: mesaj }, simdi);
    throw new WhatsappApiHatasi(mesaj, 502);
  }
  return baglantiDurumu(ctx);
}

/** WABA'yı bu uygulamanın webhook'larına abone eder (yalnızca kullanıcı isteğiyle). */
export async function webhookAboneligiEtkinlestir(ctx: TenantContext) {
  const { istemci: i } = istemci(ctx);
  try {
    await i.uygulamayiAboneEt();
  } catch (hata) {
    throw new WhatsappApiHatasi(graphMesaji(hata), 502);
  }
}

export async function sablonlariSenkronizeEt(ctx: TenantContext, simdi = new Date()) {
  const { istemci: i } = istemci(ctx);
  let meta;
  try {
    meta = await i.sablonlar();
  } catch (hata) {
    throw new WhatsappApiHatasi(graphMesaji(hata), 502);
  }
  return sablonlariSenkronla(
    ctx,
    meta.map((s) => {
      const c = sablonCozumle({ kategori: s.category, durum: s.status, bilesenler: s.components ?? [] });
      return {
        metaId: s.id,
        ad: s.name,
        dil: s.language,
        kategori: s.category,
        durum: s.status,
        parametreBicimi: s.parameter_format ?? null,
        bilesenler: s.components ?? [],
        degiskenler: c.degiskenler,
        abonelikButonu: c.abonelikButonu,
        destekNedeni: c.destekNedeni,
        kalite: s.quality_score?.score ?? null,
      };
    }),
    simdi,
  );
}

export type SablonDto = Pick<
  WhatsappSablonu,
  "id" | "ad" | "dil" | "kategori" | "durum" | "degiskenler" | "abonelikButonu" | "destekNedeni" | "kalite" | "bilesenler"
> & { kullanilabilir: boolean };

export const sablonDto = (s: WhatsappSablonu): SablonDto => ({
  id: s.id,
  ad: s.ad,
  dil: s.dil,
  kategori: s.kategori,
  durum: s.durum,
  degiskenler: s.degiskenler,
  abonelikButonu: s.abonelikButonu,
  destekNedeni: s.destekNedeni,
  kalite: s.kalite,
  bilesenler: s.bilesenler,
  kullanilabilir: s.destekNedeni === null,
});

export const sablonlar = (ctx: TenantContext) => sablonlariListele(ctx).map(sablonDto);
