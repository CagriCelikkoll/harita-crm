// WhatsApp Business Platform (Cloud API) bağlantıları (çalışma alanı başına birden çok numara) ve şablonları. Kalıcı erişim anahtarı, App Secret, verify token
// ve test numaraları AES-GCM ile şifreli saklanır; hiçbir API yanıtında dönmez (yalnızca "tanımlı / tanımlı değil").
// Verify token yalnızca üretildiği anda bir kez gösterilir.
import "server-only";
import { randomBytes } from "node:crypto";
import { cepMi, telefonNormallestir } from "@/lib/adres-normal";
import {
  BAGLANTI_AZAMI,
  hesapKilidiMesaji,
  hesapKilidiNedeni,
  KALITE_DEGERLERI,
  limitKatmaniSayisi,
  META_BAGLI,
  numaraEtiketi,
  numaraKayitsizMesaji,
  sablonCozumle,
  TEST_NUMARASI_AZAMI,
  type Kalite,
} from "@/lib/whatsapp-api";
import { genelAdres } from "../messaging/abonelik-belirteci";
import { coz, sifrele } from "../messaging/sifreleme";
import { iletiAyarlariGetir } from "../repo/ileti-ayarlari";
import { yoneticiOlmali, type TenantContext } from "../repo/baglam";
import { whatsappKampanyalariniDuraklat } from "../repo/kampanyalar";
import {
  baglantiAdiYaz,
  baglantiEkle,
  baglantiGetir,
  baglantiGuncelle,
  baglantilariListele,
  baglantiSil,
  baglantiSifreliVeriYaz,
  hesapKilidiKaldir,
  numaraAdiDuzelt,
  numaraBilgisiYaz,
  numaraDogrulamaYaz,
  testModuAyarla,
  uygulamaPayiAyarla,
  type WhatsappBaglantisi,
} from "../repo/whatsapp-baglantilari";
import { sablonlariListele, sablonlariSenkronla, type WhatsappSablonu } from "../repo/whatsapp-sablonlari";
import { GraphHatasi, whatsappApiIstemcisi, type WhatsappApiIstemcisi } from "../whatsapp-api";
import { bosBaglantiDto, type BaglantiDto, type NumaraOzeti } from "@/lib/whatsapp-baglanti";
import { ticariIletiEksikleri } from "./ileti";

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

/** Meta'daki callback URL'si: GENEL_ADRES'ten (yoksa BETTER_AUTH_URL'den) üretilir. */
export const webhookAdresi = (b: Pick<WhatsappBaglantisi, "webhookKimligi">) =>
  `${genelAdres()}/api/whatsapp/webhook/${b.webhookKimligi}`;

/**
 * Bağlantı ve çözülmüş gizli bilgiler (kampanya işçisi ve webhook için). Bağlantı yoksa ya da numara sahipliği
 * doğrulanmamışsa null: doğrulanmamış bağlantı "bağlı" sayılmaz.
 */
export function whatsappBaglantisiCoz(ctx: TenantContext, baglantiId: string): { baglanti: WhatsappBaglantisi; gizli: Gizli } | null {
  const baglanti = baglantiGetir(ctx, baglantiId);
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

const BAGLANTI_YOK = "Bu WhatsApp numarası bulunamadı.";

function istemci(
  ctx: TenantContext,
  baglantiId: string,
  dogrulanmamisOlabilir = false,
): { baglanti: WhatsappBaglantisi; istemci: WhatsappApiIstemcisi } {
  const ham = baglantiGetir(ctx, baglantiId);
  const c = dogrulanmamisOlabilir && ham ? { baglanti: ham, gizli: gizliCoz(ham) } : whatsappBaglantisiCoz(ctx, baglantiId);
  if (!c && ham) throw new WhatsappApiHatasi("Numara sahipliği doğrulanmadı: önce \"Bağlantıyı test et\".", 409);
  if (!c) throw new WhatsappApiHatasi(BAGLANTI_YOK, 404);
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


// --- Durum (istemciye giden; gizli bilgi yok). Tipler: src/lib/whatsapp-baglanti.ts ---
export type { BaglantiDto, NumaraOzeti };
export { bosBaglantiDto };

function hesapKilidiDto(b: WhatsappBaglantisi): BaglantiDto["hesapKilidi"] {
  const kod = b.hesapKilidiKodu;
  if (kod == null) return null;
  return {
    kod,
    neden: hesapKilidiNedeni(kod) ?? "meta_hesap_kilitli",
    mesaj: hesapKilidiMesaji(kod),
    tarih: (b.hesapKilidiTarihi ?? b.guncellemeTarihi).toISOString(),
  };
}

const kaliteDegeri = (k: string | null): Kalite | null => KALITE_DEGERLERI.find((x) => x === k) ?? null;

/**
 * Aynı çalışma alanında aynı App Secret'ı kullanan diğer numaralar (webhook POST'u bunların imzasını da doğrular ve
 * bildirimlerini yönlendirir; servisler/whatsapp-webhook.ts). Gizli bilgisi çözülemeyen numara atlanır.
 */
function ortakUygulamaNumaralari(ctx: TenantContext, b: WhatsappBaglantisi, gizli: Gizli | null, tumu: WhatsappBaglantisi[]) {
  if (!gizli?.appSecret) return [];
  return tumu
    .filter((x) => {
      if (x.id === b.id) return false;
      try {
        return gizliCoz(x).appSecret === gizli.appSecret;
      } catch {
        return false;
      }
    })
    .map((x) => ({ ad: x.ad, webhookAdresi: webhookAdresi(x) }));
}

function dto(ctx: TenantContext, b: WhatsappBaglantisi, tumu: WhatsappBaglantisi[] = baglantilariListele(ctx)): BaglantiDto {
  let gizli: Gizli | null = null;
  try {
    gizli = gizliCoz(b);
  } catch {
    /* anahtar değişmiş: bilgiler yeniden girilmeli; durum "tanımlı değil" görünür */
  }
  const limit = limitKatmaniSayisi(b.limitKatmani);
  const gonderenEksikleri = ticariIletiEksikleri(iletiAyarlariGetir(ctx), "whatsapp_api");
  return {
    id: b.id,
    ad: b.ad,
    etiket: numaraEtiketi(b),
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
    testModuKapatilabilir: Boolean(b.webhookDogrulamaTarihi && b.sonImzaliDurumTarihi) && gonderenEksikleri.length === 0,
    gonderenEksikleri,
    testNumaralari: gizli?.testNumaralari ?? [],
    uygulamaPayi: b.uygulamaPayi,
    hesapKilidi: hesapKilidiDto(b),
    numara: {
      gorunenNumara: b.gorunenNumara,
      dogrulanmisAd: b.dogrulanmisAd,
      kalite: kaliteDegeri(b.kalite),
      limitKatmani: b.limitKatmani,
      metaDurumu: b.metaDurumu,
      limit: limit === Number.POSITIVE_INFINITY ? null : limit,
      sonKontrol: b.sonKontrol?.toISOString() ?? null,
      sonHata: b.sonHata,
    },
    ortakUygulamaNumaralari: ortakUygulamaNumaralari(ctx, b, gizli, tumu),
    sablonSenkronTarihi: b.sablonSenkronTarihi?.toISOString() ?? null,
  };
}

/** Bir numaranın durumu; numara bu çalışma alanında yoksa 404. */
export function baglantiDurumu(ctx: TenantContext, baglantiId: string): BaglantiDto {
  const b = baglantiGetir(ctx, baglantiId);
  if (!b) throw new WhatsappApiHatasi(BAGLANTI_YOK, 404);
  return dto(ctx, b);
}

/** Çalışma alanının bütün numaralarının ayrıntılı durumu (yalnızca yönetici ekranı). */
export function baglantilarDurumu(ctx: TenantContext): BaglantiDto[] {
  const tumu = baglantilariListele(ctx);
  return tumu.map((b) => dto(ctx, b, tumu));
}

/** Numara kimliği → "Merkez · …4567" (kampanya listesi ve ayrıntısı). */
export const numaraEtiketleri = (ctx: TenantContext): Map<string, string> =>
  new Map(baglantilariListele(ctx).map((b) => [b.id, numaraEtiketi(b)]));

/** WhatsApp kampanyasının gönderen numarasının etiketi; numara silinmişse "Silinmiş numara", diğer kanallarda null. */
export function kampanyaNumarasi(ctx: TenantContext, k: { kanal: string; baglantiId: string | null }): string | null {
  if (k.kanal !== "whatsapp_api") return null;
  return numaraEtiketi(k.baglantiId ? baglantiGetir(ctx, k.baglantiId) : null);
}

export function numaraOzetleri(ctx: TenantContext): NumaraOzeti[] {
  return baglantilariListele(ctx).map((b) => ({
    id: b.id,
    ad: b.ad,
    etiket: numaraEtiketi(b),
    gorunenNumara: b.gorunenNumara,
    numaraDogrulandi: Boolean(b.numaraDogrulamaTarihi),
    testModu: b.testModu,
    kalite: kaliteDegeri(b.kalite),
    hesapKilidi: b.hesapKilidiKodu != null,
    kurulumTamam: Boolean(b.numaraDogrulamaTarihi && b.webhookDogrulamaTarihi && b.sonImzaliDurumTarihi && !b.testModu),
  }));
}

// --- Bağlantı kaydı ---

export type BaglantiGirdisi = {
  wabaId: string;
  phoneNumberId: string;
  /** Boş/eksik: mevcut değer korunur (ilk kayıtta zorunlu). */
  erisimAnahtari?: string | null;
  appSecret?: string | null;
};

function kimlikleriDenetle(g: BaglantiGirdisi) {
  if (!/^\d{5,30}$/.test(g.wabaId) || !/^\d{5,30}$/.test(g.phoneNumberId)) {
    throw new WhatsappApiHatasi("WABA ID ve Phone Number ID sayısal olmalı.");
  }
}

/** Numara başka çalışma alanına (ya da bu alanda başka satıra) bağlı: sahiplik hatasıyla aynı mesaj (açığa çıkmaz). */
function tekillikHatasi(hata: unknown): never {
  if (/UNIQUE.*phone_number_id/.test((hata as Error).message)) throw new WhatsappApiHatasi(SAHIPLIK_HATASI, 400);
  throw hata;
}

/**
 * Yeni numara ekler: numara sahipliğini Graph API'den doğruladıktan sonra kaydeder (doğrulanamazsa hiçbir şey
 * yazılmaz). Üretilen verify token yalnızca bu yanıtta döner. En fazla BAGLANTI_AZAMI numara.
 */
export async function whatsappBaglantisiEkle(
  ctx: TenantContext,
  g: BaglantiGirdisi & { ad: string },
): Promise<{ baglanti: BaglantiDto; verifyToken: string }> {
  yoneticiOlmali(ctx);
  numaraAdiDuzelt(g.ad);
  if (baglantilariListele(ctx).length >= BAGLANTI_AZAMI) {
    throw new WhatsappApiHatasi(`Bir çalışma alanına en fazla ${BAGLANTI_AZAMI} numara bağlanabilir.`);
  }
  const erisimAnahtari = g.erisimAnahtari?.trim();
  const appSecret = g.appSecret?.trim();
  if (!erisimAnahtari || !appSecret) throw new WhatsappApiHatasi("Kalıcı erişim anahtarı ve App Secret girilmeli.");
  kimlikleriDenetle(g);
  await numaraSahipligiDogrula({ wabaId: g.wabaId, phoneNumberId: g.phoneNumberId, erisimAnahtari });
  const verifyToken = yeniVerifyToken();
  let b: WhatsappBaglantisi;
  try {
    b = baglantiEkle(ctx, {
      ad: g.ad,
      wabaId: g.wabaId,
      phoneNumberId: g.phoneNumberId,
      sifreliVeri: gizliSifrele(ctx.tenantId, { erisimAnahtari, appSecret, verifyToken, testNumaralari: [] }),
      numaraDogrulamaTarihi: new Date(),
    });
  } catch (hata) {
    tekillikHatasi(hata);
  }
  return { baglanti: dto(ctx, b), verifyToken };
}

/**
 * Mevcut numaranın kimliklerini ve gizli bilgilerini günceller (boş gizli alan: mevcut değer korunur). Numara
 * sahipliği yeniden doğrulanır. Verify token yoksa (çözülemediyse) yenisi üretilir ve yalnızca bu yanıtta döner.
 */
export async function whatsappBaglantisiKaydet(
  ctx: TenantContext,
  baglantiId: string,
  g: BaglantiGirdisi,
): Promise<{ verifyToken: string | null }> {
  yoneticiOlmali(ctx);
  const eski = baglantiGetir(ctx, baglantiId);
  if (!eski) throw new WhatsappApiHatasi(BAGLANTI_YOK, 404);
  let eskiGizli: Gizli | null = null;
  try {
    eskiGizli = gizliCoz(eski);
  } catch {
    eskiGizli = null; // çözülemiyorsa tüm gizli bilgiler yeniden girilmeli
  }
  const erisimAnahtari = g.erisimAnahtari?.trim() || eskiGizli?.erisimAnahtari;
  const appSecret = g.appSecret?.trim() || eskiGizli?.appSecret;
  if (!erisimAnahtari || !appSecret) throw new WhatsappApiHatasi("Kalıcı erişim anahtarı ve App Secret girilmeli.");
  kimlikleriDenetle(g);
  await numaraSahipligiDogrula({ wabaId: g.wabaId, phoneNumberId: g.phoneNumberId, erisimAnahtari });
  const yeniToken = eskiGizli?.verifyToken ? null : yeniVerifyToken();
  const gizli: Gizli = {
    erisimAnahtari,
    appSecret,
    verifyToken: yeniToken ?? eskiGizli!.verifyToken,
    testNumaralari: eskiGizli?.testNumaralari ?? [],
  };
  try {
    baglantiGuncelle(ctx, baglantiId, {
      wabaId: g.wabaId,
      phoneNumberId: g.phoneNumberId,
      sifreliVeri: gizliSifrele(ctx.tenantId, gizli),
      numaraDogrulamaTarihi: new Date(),
    });
  } catch (hata) {
    tekillikHatasi(hata);
  }
  return { verifyToken: yeniToken };
}

export function numaraAdiKaydet(ctx: TenantContext, baglantiId: string, ad: string) {
  if (!baglantiAdiYaz(ctx, baglantiId, ad)) throw new WhatsappApiHatasi(BAGLANTI_YOK, 404);
}

/**
 * Numarayı kaldırır. Bu numaradan gönderen çalışan kampanyalar duraklar ("baglanti_yok"); kampanya geçmişi kalır
 * ("Silinmiş numara" görünür). Diğer numaralar etkilenmez.
 */
export function whatsappBaglantisiKaldir(ctx: TenantContext, baglantiId: string) {
  yoneticiOlmali(ctx);
  if (!baglantiGetir(ctx, baglantiId)) throw new WhatsappApiHatasi(BAGLANTI_YOK, 404);
  whatsappKampanyalariniDuraklat(ctx, "baglanti_yok", { baglantiIdler: [baglantiId] });
  baglantiSil(ctx, baglantiId);
}

/** Yeni verify token üretir (bir kez gösterilir). Webhook yeniden doğrulanana kadar bu numaranın test modu açık kalır. */
export function verifyTokenYenile(ctx: TenantContext, baglantiId: string): string {
  const c = whatsappBaglantisiCoz(ctx, baglantiId);
  if (!c) throw new WhatsappApiHatasi(BAGLANTI_YOK, 404);
  const verifyToken = yeniVerifyToken();
  baglantiSifreliVeriYaz(ctx, baglantiId, gizliSifrele(ctx.tenantId, { ...c.gizli, verifyToken }), true);
  return verifyToken;
}

export function testNumaralariKaydet(ctx: TenantContext, baglantiId: string, numaralar: string[]): string[] {
  const c = whatsappBaglantisiCoz(ctx, baglantiId);
  if (!c) throw new WhatsappApiHatasi(BAGLANTI_YOK, 404);
  const normal = [...new Set(numaralar.map((n) => n.trim()).filter(Boolean))].map((n) => {
    const t = telefonNormallestir(n);
    if (!cepMi(t)) throw new WhatsappApiHatasi(`Cep telefonu numarası değil: ${n}`);
    return t;
  });
  if (normal.length > TEST_NUMARASI_AZAMI) throw new WhatsappApiHatasi(`En fazla ${TEST_NUMARASI_AZAMI} test numarası.`);
  baglantiSifreliVeriYaz(ctx, baglantiId, gizliSifrele(ctx.tenantId, { ...c.gizli, testNumaralari: normal }));
  return normal;
}

const TEST_MODU_NEDENLERI = {
  baglanti_yok: BAGLANTI_YOK,
  webhook_dogrulanmadi:
    "Test modu kapatılamaz: bu numaranın bildirim adresi henüz doğrulanmadı. Meta uygulamanızda callback URL ve verify " +
    "token'ı kaydedin (aynı uygulamadaki başka bir numaranın adresini kullanıyorsanız bu numaradan bir test gönderin).",
  gonderen_eksik: "Test modu kapatılamaz: Ayarlar → Gönderen bilgileri eksik",
  durum_alinmadi:
    "Test modu kapatılamaz: bu numaradan gönderilen bir mesajın imzası doğrulanmış durum (statuses) bildirimi henüz " +
    "alınmadı. Test modunda bir test numarasına bu numaradan kampanya gönderip teslim bildiriminin gelmesini bekleyin.",
} as const;

/**
 * Numaranın test modunu açar / kapatır. Kapatmak için BU numaranın webhook doğrulaması ve imzalı durum bildirimine
 * (depo, atomik) ek olarak gönderen bilgileri tam olmalı: test modu kapalıyken her kampanya bunları ister.
 */
export function testModuDegistir(ctx: TenantContext, baglantiId: string, acik: boolean) {
  if (!acik) {
    yoneticiOlmali(ctx);
    const eksik = ticariIletiEksikleri(iletiAyarlariGetir(ctx), "whatsapp_api");
    const bag = eksik.length ? baglantiGetir(ctx, baglantiId) : null;
    if (bag) {
      // Eksik varsa depoya hiç gidilmez (kapatma denenmez); neden kurulum sırasına göre seçilir.
      if (!bag.webhookDogrulamaTarihi) throw new WhatsappApiHatasi(TEST_MODU_NEDENLERI.webhook_dogrulanmadi, 409);
      if (!bag.sonImzaliDurumTarihi) throw new WhatsappApiHatasi(TEST_MODU_NEDENLERI.durum_alinmadi, 409);
      throw new WhatsappApiHatasi(`${TEST_MODU_NEDENLERI.gonderen_eksik}: ${eksik.join(", ")}.`, 409);
    }
  }
  const sonuc = testModuAyarla(ctx, baglantiId, acik);
  if (!sonuc.tamam) throw new WhatsappApiHatasi(TEST_MODU_NEDENLERI[sonuc.neden], sonuc.neden === "baglanti_yok" ? 404 : 409);
}

export function uygulamaPayiKaydet(ctx: TenantContext, baglantiId: string, yuzde: number) {
  if (!Number.isInteger(yuzde) || yuzde < 1 || yuzde > 100) throw new WhatsappApiHatasi("Pay 1 ile 100 arasında olmalı.");
  if (!uygulamaPayiAyarla(ctx, baglantiId, yuzde)) throw new WhatsappApiHatasi(BAGLANTI_YOK, 404);
}

// --- Graph API ---

const GONDERIM_ENGELLI =
  "Meta bu numaradan gönderime izin vermiyor (health_status: BLOCKED). Meta Business Suite > Business Support Home'dan " +
  "nedenini görün; sorun giderilince yeniden test edin.";

/**
 * Numara sahipliğini yeniden doğrular (doğrulanamazsa bağlantı kullanılmaz hale gelir), sonra numara bilgisi,
 * kalite, portföy limitini ve gönderim durumunu (health_status) okur ve saklar. Hata da saklanır (ekranda gösterilir).
 * İşçi kaliteyi yenilerken de çağırır.
 * Meta hesap kilidi yalnızca burada kalkar: Meta gönderime açık dediyse (health_status BLOCKED değil) kilit bu WABA'daki
 * tüm numaralardan silinir; BLOCKED ise kilit kalır ve test başarısız sayılır. Duraklatılmış kampanyalar kendiliğinden
 * başlamaz; yönetici devam ettirir.
 */
export async function baglantiyiTestEt(ctx: TenantContext, baglantiId: string, simdi = new Date()) {
  const { baglanti, istemci: i } = istemci(ctx, baglantiId, true);
  const erisimAnahtari = gizliCoz(baglanti).erisimAnahtari;
  try {
    await numaraSahipligiDogrula({ wabaId: baglanti.wabaId, phoneNumberId: baglanti.phoneNumberId, erisimAnahtari });
    numaraDogrulamaYaz(ctx, baglantiId, baglanti.phoneNumberId, baglanti.numaraDogrulamaTarihi ?? simdi);
  } catch (hata) {
    // Sahiplik reddedildiyse bağlantı kullanılmaz; Meta'ya ulaşılamadı ya da anahtar geçersizse son doğrulama korunur.
    numaraBilgisiYaz(ctx, baglantiId, { sonHata: (hata as Error).message }, simdi);
    if (hata instanceof SahiplikHatasi) {
      numaraDogrulamaYaz(ctx, baglantiId, baglanti.phoneNumberId, null);
      throw hata;
    }
    throw new WhatsappApiHatasi((hata as Error).message, 502);
  }
  let n;
  try {
    n = await i.numaraBilgisi();
  } catch (hata) {
    const mesaj = graphMesaji(hata);
    numaraBilgisiYaz(ctx, baglantiId, { sonHata: mesaj }, simdi);
    throw new WhatsappApiHatasi(mesaj, 502);
  }
  const engelli = n.gonderimDurumu === "BLOCKED";
  // Meta durumu dönmediyse (null) bilinmiyor sayılır; döndüyse CONNECTED dışındaki her durum (PENDING, OFFLINE…) başarısız.
  const metaDurumu = n.metaDurumu ?? null;
  const kayitsiz = metaDurumu !== null && metaDurumu !== META_BAGLI ? numaraKayitsizMesaji(metaDurumu, n.kodDogrulamaDurumu) : null;
  numaraBilgisiYaz(
    ctx,
    baglantiId,
    {
      gorunenNumara: n.gorunenNumara,
      dogrulanmisAd: n.dogrulanmisAd,
      kalite: n.kalite,
      limitKatmani: n.limitKatmani,
      metaDurumu,
      sonHata: engelli ? GONDERIM_ENGELLI : kayitsiz,
    },
    simdi,
  );
  if (engelli) throw new WhatsappApiHatasi(GONDERIM_ENGELLI, 409);
  // Kayıtsız numarada hesap kilidi de kaldırılmaz: test başarılı sayılmaz.
  if (kayitsiz) throw new WhatsappApiHatasi(kayitsiz, 409);
  hesapKilidiKaldir(ctx, baglantiId);
  return baglantiDurumu(ctx, baglantiId);
}

/** Numaranın WABA'sını bu uygulamanın webhook'larına abone eder (yalnızca kullanıcı isteğiyle). */
export async function webhookAboneligiEtkinlestir(ctx: TenantContext, baglantiId: string) {
  const { istemci: i } = istemci(ctx, baglantiId);
  try {
    await i.uygulamayiAboneEt();
  } catch (hata) {
    throw new WhatsappApiHatasi(graphMesaji(hata), 502);
  }
}

/** Numaranın WABA'sının şablonlarını Meta'dan senkronize eder (aynı WABA'daki numaralar ortak kullanır). */
export async function sablonlariSenkronizeEt(ctx: TenantContext, baglantiId: string, simdi = new Date()) {
  const { baglanti, istemci: i } = istemci(ctx, baglantiId);
  let meta;
  try {
    meta = await i.sablonlar();
  } catch (hata) {
    throw new WhatsappApiHatasi(graphMesaji(hata), 502);
  }
  return sablonlariSenkronla(
    ctx,
    baglanti.wabaId,
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

/** Bu numaranın (WABA'sının) şablonları; numara bu çalışma alanında yoksa boş. */
export function sablonlar(ctx: TenantContext, baglantiId: string): SablonDto[] {
  const b = baglantiGetir(ctx, baglantiId);
  return b ? sablonlariListele(ctx, b.wabaId).map(sablonDto) : [];
}
