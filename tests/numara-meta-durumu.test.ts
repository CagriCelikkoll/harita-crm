// Numaranın Meta durumu (status, code_verification_status): "Bağlantıyı test et" CONNECTED değilse başarısız olur ve
// durum saklanır (kart rozeti); gönderimde 133010 (numara Cloud API'ye kayıtlı değil) yalnızca o numaranın
// kampanyalarını duraklatır ve "Son hata"ya yazılır; ortak Meta uygulamasındaki numaralar (silme uyarısı için) listelenir;
// gerçek istemci yeni alanları ister.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import { kampanyaGetir } from "@/server/repo/kampanyalar";
import { kisileriEkle } from "@/server/repo/kayitlar";
import { baglantiGetir } from "@/server/repo/whatsapp-baglantilari";
import { sablonlariListele } from "@/server/repo/whatsapp-sablonlari";
import { whatsappIzniAyarla } from "@/server/repo/whatsapp-kisileri";
import { isciTuru } from "@/server/servisler/isci";
import { KampanyaGirdisi, kampanyaBaslat } from "@/server/servisler/kampanya";
import * as wa from "@/server/servisler/whatsapp-api";
import { GraphHatasi } from "@/server/whatsapp-api";
import { gercekWhatsappIstemcisi } from "@/server/whatsapp-api/istemci";
import { mockWhatsapp, mockWhatsappSifirla } from "@/server/whatsapp-api/mock";
import { DURAKLATMA_NEDEN_ADLARI } from "@/lib/mesajlasma";
import { metaDurumuRozeti, numaraKayitsizKoduMu, numaraKayitsizMesaji } from "@/lib/whatsapp-api";
import type { TenantContext } from "@/server/repo/baglam";
import { kiraciOlustur } from "./yardimci/fabrika";

const SIMDI = new Date("2026-11-23T09:00:00Z"); // 12:00 İstanbul
const tur = () => isciTuru({ simdi: () => SIMDI, parti: 50, whatsappAralikMs: 0 });
let sayac = 0;

beforeEach(() => mockWhatsappSifirla());

function alan(ad: string) {
  const { ctx } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  return ctx;
}

async function numaraEkle(ctx: TenantContext, ad: string, waba: string, secret = "ortak-secret") {
  const phoneId = String(870000 + ++sayac);
  const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad, wabaId: waba, phoneNumberId: phoneId, erisimAnahtari: "anahtar", appSecret: secret });
  return { id: baglanti.id!, phoneId, waba };
}

/** Webhook ve imzalı durum alınmış, kalite yeşil ve taze (işçi Meta'ya sormasın), test modu kapalı. */
function hazirla(ctx: TenantContext, id: string) {
  db.$client
    .prepare(
      "update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ?, kalite = 'GREEN', limit_katmani = 'TIER_10K', son_kontrol = ? where id = ?",
    )
    .run(Date.now(), Date.now(), SIMDI.getTime(), id);
  wa.testModuDegistir(ctx, id, false);
}

function kisiler(ctx: TenantContext, etiket: string, telefonlar: string[]) {
  const eklenen = kisileriEkle(
    ctx,
    telefonlar.map((t) => ({ kaynak: "elle" as const, ekTelefon: t, etiketler: [etiket], aliciTuru: "tacir_esnaf" as const })),
    "test",
  );
  for (const k of eklenen) whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form" });
}

function girdi(ctx: TenantContext, n: { id: string; waba: string }, etiket: string) {
  const sablon = sablonlariListele(ctx, n.waba).find((s) => s.ad === "randevu_hatirlatma")!;
  return KampanyaGirdisi.parse({
    kanal: "whatsapp_api",
    ad: `K-${etiket}`,
    filtre: { etiket },
    testModu: false,
    baglantiId: n.id,
    sablonId: sablon.id,
    degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "Ali" }, "body:tarih": { kaynak: "sabit", deger: "yarın" } },
  });
}

const kuyruk = (kampanyaId: string) =>
  db.$client.prepare("select durum, neden from message_queue where kampanya_id = ? order by rowid").all(kampanyaId) as { durum: string; neden: string | null }[];

const numara = (ek: Record<string, unknown>) => ({
  id: "1",
  gorunenNumara: "+90 850 000 00 00",
  dogrulanmisAd: "Deneme",
  kalite: "GREEN",
  limitKatmani: "TIER_10K",
  gonderimDurumu: "AVAILABLE",
  ...ek,
});

describe("lib: Meta durumu rozeti ve mesajları", () => {
  it("CONNECTED → Bağlı, PENDING → Beklemede, OFFLINE/DISCONNECTED → Çevrimdışı, diğerleri ham değerle; okunmadıysa rozet yok", () => {
    expect(metaDurumuRozeti("CONNECTED")).toEqual({ etiket: "Meta: Bağlı", ton: "ana" });
    expect(metaDurumuRozeti("PENDING")).toEqual({ etiket: "Meta: Beklemede", ton: "uyari" });
    expect(metaDurumuRozeti("OFFLINE")).toEqual({ etiket: "Meta: Çevrimdışı", ton: "tehlike" });
    expect(metaDurumuRozeti("DISCONNECTED")).toEqual({ etiket: "Meta: Çevrimdışı", ton: "tehlike" });
    expect(metaDurumuRozeti("BANNED")).toEqual({ etiket: "Meta: BANNED", ton: "tehlike" });
    expect(metaDurumuRozeti(null)).toBeNull();
  });

  it("kayıtsız numara mesajı istenen metni ve (VERIFIED değilse) kod doğrulama durumunu içerir; 133010 tanınır", () => {
    expect(numaraKayitsizMesaji("PENDING", "VERIFIED")).toBe(
      "Numara Meta'da henüz kayıtlı değil (durum: PENDING). WhatsApp Manager'da numarayı doğrulayıp Cloud API'ye kaydedin (register + 6 haneli PIN), sonra tekrar test edin.",
    );
    expect(numaraKayitsizMesaji("PENDING", "NOT_VERIFIED")).toMatch(/Numara doğrulama durumu: NOT_VERIFIED\.$/);
    expect(numaraKayitsizKoduMu(133010)).toBe(true);
    expect(numaraKayitsizKoduMu(131031)).toBe(false);
    expect(numaraKayitsizKoduMu(null)).toBe(false);
    expect(DURAKLATMA_NEDEN_ADLARI.numara_kayitsiz).toMatch(/133010/);
  });
});

describe("Bağlantıyı test et: Meta durumu", () => {
  it("PENDING/OFFLINE: test başarısız, uyarı Son hata'ya yazılır, durum saklanır; CONNECTED olunca başarılı ve hata silinir", async () => {
    const ctx = alan("MetaDurumu");
    const n = await numaraEkle(ctx, "Yeni", "400101");

    mockWhatsapp.numara = numara({ metaDurumu: "PENDING", kodDogrulamaDurumu: "NOT_VERIFIED" });
    await expect(wa.baglantiyiTestEt(ctx, n.id, SIMDI)).rejects.toMatchObject({
      durum: 409,
      message: expect.stringMatching(/^Numara Meta'da henüz kayıtlı değil \(durum: PENDING\)\. .*register \+ 6 haneli PIN/),
    });
    let d = wa.baglantiDurumu(ctx, n.id);
    expect(d.numara.metaDurumu).toBe("PENDING");
    expect(d.numara.sonHata).toMatch(/durum: PENDING.*NOT_VERIFIED/);
    // Sahiplik doğrulandı: "Bağlı" (WABA'ya ait) ayrı bir bilgi, korunur.
    expect(d.numaraDogrulandi).toBe(true);

    mockWhatsapp.numara = numara({ metaDurumu: "OFFLINE" });
    await expect(wa.baglantiyiTestEt(ctx, n.id, SIMDI)).rejects.toThrow(/durum: OFFLINE/);
    expect(wa.baglantiDurumu(ctx, n.id).numara.metaDurumu).toBe("OFFLINE");

    mockWhatsapp.numara = numara({ metaDurumu: "CONNECTED", kodDogrulamaDurumu: "VERIFIED" });
    d = await wa.baglantiyiTestEt(ctx, n.id, SIMDI);
    expect(d.numara).toMatchObject({ metaDurumu: "CONNECTED", sonHata: null });
  });

  it("Meta durumu dönmezse (alan yok) bilinmiyor sayılır: test başarılı, rozet yok", async () => {
    const ctx = alan("MetaDurumuYok");
    const n = await numaraEkle(ctx, "Eski", "400201");
    mockWhatsapp.numara = numara({});
    const d = await wa.baglantiyiTestEt(ctx, n.id, SIMDI);
    expect(d.numara).toMatchObject({ metaDurumu: null, sonHata: null });
  });

  it("kayıtsız numarada Meta hesap kilidi kaldırılmaz", async () => {
    const ctx = alan("MetaKilit");
    const n = await numaraEkle(ctx, "Kilitli", "400301");
    db.$client.prepare("update whatsapp_baglantilari set hesap_kilidi_kodu = 131031, hesap_kilidi_tarihi = ? where id = ?").run(Date.now(), n.id);
    mockWhatsapp.numara = numara({ metaDurumu: "PENDING" });
    await expect(wa.baglantiyiTestEt(ctx, n.id, SIMDI)).rejects.toThrow(/PENDING/);
    expect(baglantiGetir(ctx, n.id)?.hesapKilidiKodu).toBe(131031);
  });
});

describe("gönderimde 133010 (numara Cloud API'ye kayıtlı değil)", () => {
  it("yalnızca o numaranın kampanyası duraklar, mesaj kuyrukta bekler, Son hata yazılır; aynı WABA'daki diğer numara gönderir ve kilit konmaz", async () => {
    const ctx = alan("Kayitsiz");
    const n1 = await numaraEkle(ctx, "Yeni", "400401");
    const n2 = await numaraEkle(ctx, "Merkez", "400401");
    await wa.sablonlariSenkronizeEt(ctx, n1.id);
    hazirla(ctx, n1.id);
    hazirla(ctx, n2.id);
    kisiler(ctx, "k1", ["0532 910 00 01", "0532 910 00 02"]);
    kisiler(ctx, "k2", ["0532 910 00 03"]);
    const k1 = kampanyaBaslat(ctx, girdi(ctx, n1, "k1"), SIMDI);
    const k2 = kampanyaBaslat(ctx, girdi(ctx, n2, "k2"), SIMDI);
    const hata = new GraphHatasi("(#133010) Account not registered", 400, 133010);
    mockWhatsapp.aliciHatalari.set("905329100001", hata);
    mockWhatsapp.aliciHatalari.set("905329100002", hata);
    const oncekiKontrol = baglantiGetir(ctx, n1.id)!.sonKontrol;

    await tur();

    expect(kampanyaGetir(ctx, k1.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "numara_kayitsiz" });
    expect(kuyruk(k1.id).map((m) => m.durum)).toEqual(["kuyrukta", "kuyrukta"]);
    expect(kuyruk(k1.id)[0].neden).toBe("duraklatildi:numara_kayitsiz");
    expect(kampanyaGetir(ctx, k2.id)?.durum).not.toBe("duraklatildi");
    expect(kuyruk(k2.id).map((m) => m.durum)).toEqual(["gonderildi"]);

    const b1 = baglantiGetir(ctx, n1.id)!;
    expect(b1.sonHata).toMatch(/numara Cloud API'ye kayıtlı değil \(Meta 133010\).*register \+ 6 haneli PIN/);
    // sonKontrol değişmez: işçi bir sonraki turda numarayı yeniden test eder.
    expect(b1.sonKontrol?.getTime()).toBe(oncekiKontrol?.getTime());
    expect(b1.hesapKilidiKodu).toBeNull();
    expect(baglantiGetir(ctx, n2.id)!.hesapKilidiKodu).toBeNull();
    expect(wa.baglantiDurumu(ctx, n1.id).numara.sonHata).toBe(b1.sonHata);
  });
});

describe("ortak Meta uygulaması (silme uyarısı)", () => {
  it("aynı App Secret'ı kullanan diğer numaralar adresleriyle listelenir; farklı secret ve başka çalışma alanı listelenmez", async () => {
    const ctx = alan("Ortak");
    const n1 = await numaraEkle(ctx, "Merkez", "400501");
    const n2 = await numaraEkle(ctx, "Şube", "400502");
    const n3 = await numaraEkle(ctx, "Başka uygulama", "400503", "baska-secret");
    const diger = alan("OrtakDiger");
    await numaraEkle(diger, "Yabancı", "400504");

    const liste = new Map(wa.baglantilarDurumu(ctx).map((b) => [b.id, b]));
    const adres = (id: string) => liste.get(id)!.webhookAdresi;
    expect(liste.get(n1.id)!.ortakUygulamaNumaralari).toEqual([{ ad: "Şube", webhookAdresi: adres(n2.id) }]);
    expect(liste.get(n2.id)!.ortakUygulamaNumaralari).toEqual([{ ad: "Merkez", webhookAdresi: adres(n1.id) }]);
    expect(liste.get(n3.id)!.ortakUygulamaNumaralari).toEqual([]);
    expect(wa.baglantiDurumu(ctx, n1.id).ortakUygulamaNumaralari).toEqual(liste.get(n1.id)!.ortakUygulamaNumaralari);
  });
});

describe("gerçek istemci", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("numara sorgusu status ve code_verification_status alanlarını ister ve okur", async () => {
    const istekler: URL[] = [];
    vi.stubGlobal("fetch", async (url: URL) => {
      istekler.push(new URL(url));
      return new Response(JSON.stringify({ id: "1234567", status: "PENDING", code_verification_status: "NOT_VERIFIED" }), {
        headers: { "Content-Type": "application/json" },
      });
    });
    const n = await gercekWhatsappIstemcisi({ wabaId: "1234567", phoneNumberId: "7654321", erisimAnahtari: "x" }).numaraBilgisi();
    expect(istekler[0].searchParams.get("fields")?.split(",")).toEqual(expect.arrayContaining(["health_status", "status", "code_verification_status"]));
    expect(n).toMatchObject({ metaDurumu: "PENDING", kodDogrulamaDurumu: "NOT_VERIFIED", gonderimDurumu: null });
  });
});
