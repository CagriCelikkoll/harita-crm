// WhatsApp Business Platform (Cloud API) bağlantısı ve şablonlar: şifreli saklama ve hiçbir yanıtta dönmeme,
// yalnızca yönetici, verify token'ın bir kez gösterilmesi, test modu kilidi, test numaraları, pay, bağlantı testi
// (sahte Graph istemcisi), şablon senkronu ve kampanyada kullanılabilirlik.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { limitKatmaniSayisi, sablonCozumle } from "@/lib/whatsapp-api";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const { sablonlariListele } = await import("@/server/repo/whatsapp-sablonlari");
const { mockKullaniliyor, GraphHatasi } = await import("@/server/whatsapp-api");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const svc = await import("@/server/servisler/whatsapp-api");
const baglantiRotasi = await import("@/app/api/ayarlar/whatsapp-api/route");
const testRotasi = await import("@/app/api/ayarlar/whatsapp-api/test/route");
const tokenRotasi = await import("@/app/api/ayarlar/whatsapp-api/verify-token/route");
const sablonRotasi = await import("@/app/api/whatsapp/sablonlar/route");
const { baglamUret } = await import("@/server/repo/sistem/uyelik");
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");

const U = "https://crm.ornek.test";
const ANAHTAR = "EAAG-gizli-erisim-anahtari-123";
const SECRET = "app-secret-gizli-456";
const istek = (yol: string, method: string, govde?: unknown) =>
  new Request(`${U}${yol}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: U },
    body: govde === undefined ? undefined : JSON.stringify(govde),
  });

function kur(ad: string, phoneNumberId = String(100000 + Math.floor(Math.random() * 899999))) {
  const { ctx } = kiraciOlustur(ad);
  const { verifyToken } = svc.whatsappBaglantisiKaydet(ctx, { wabaId: "200001", phoneNumberId, erisimAnahtari: ANAHTAR, appSecret: SECRET });
  return { ctx, verifyToken: verifyToken!, phoneNumberId };
}

beforeEach(() => mockWhatsappSifirla());

describe("sabitler ve şablon çözümleme", () => {
  it("limit katmanı", () => {
    expect(limitKatmaniSayisi("TIER_250")).toBe(250);
    expect(limitKatmaniSayisi("TIER_10K")).toBe(10_000);
    expect(limitKatmaniSayisi("TIER_UNLIMITED")).toBe(Number.POSITIVE_INFINITY);
    expect(limitKatmaniSayisi("BILINMEYEN")).toBeNull();
  });

  it("pazarlama şablonunda abonelikten çıkma butonu zorunlu; değişkenler; desteklenmeyen bileşenler", () => {
    const govde = { type: "BODY", text: "Merhaba {{1}}, {{2}} {{1}}" };
    const cikis = { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Stop promotions" }] };
    expect(sablonCozumle({ kategori: "MARKETING", durum: "APPROVED", bilesenler: [govde, cikis] })).toEqual({
      degiskenler: [
        { bilesen: "body", ad: "1" },
        { bilesen: "body", ad: "2" },
      ],
      abonelikButonu: true,
      destekNedeni: null,
    });
    expect(
      sablonCozumle({ kategori: "MARKETING", durum: "APPROVED", bilesenler: [govde, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Abonelikten çık" }] }] }).abonelikButonu,
    ).toBe(true);
    expect(sablonCozumle({ kategori: "MARKETING", durum: "APPROVED", bilesenler: [govde] }).destekNedeni).toMatch(/abonelikten çıkma/);
    // Hizmet şablonunda buton aranmaz; adlandırılmış parametreler.
    expect(sablonCozumle({ kategori: "UTILITY", durum: "APPROVED", bilesenler: [{ type: "BODY", text: "Sayın {{ad}}" }] })).toMatchObject({
      degiskenler: [{ bilesen: "body", ad: "ad" }],
      destekNedeni: null,
    });
    const medya = sablonCozumle({ kategori: "UTILITY", durum: "APPROVED", bilesenler: [{ type: "HEADER", format: "IMAGE" }, govde] });
    expect(medya.destekNedeni).toMatch(/Medya başlık/);
    const url = sablonCozumle({
      kategori: "UTILITY",
      durum: "APPROVED",
      bilesenler: [govde, { type: "BUTTONS", buttons: [{ type: "URL", text: "Aç", url: "https://x.test/{{1}}" }] }],
    });
    expect(url.destekNedeni).toMatch(/Dinamik URL/);
    expect(sablonCozumle({ kategori: "UTILITY", durum: "PENDING", bilesenler: [govde] }).destekNedeni).toMatch(/onaylı değil/);
  });
});

describe("bağlantı ve gizli bilgiler", () => {
  it("testlerde her zaman sahte istemci kullanılır", () => {
    expect(mockKullaniliyor()).toBe(true);
  });

  it("gizli bilgiler şifreli saklanır, hiçbir yanıtta dönmez; verify token yalnızca ilk kayıtta bir kez", async () => {
    const { ctx } = kiraciOlustur("Gizli");
    oturum.ctx = ctx;
    const y = await baglantiRotasi.PUT(istek("/api/ayarlar/whatsapp-api", "PUT", {
      wabaId: "200001",
      phoneNumberId: "300001",
      erisimAnahtari: ANAHTAR,
      appSecret: SECRET,
    }));
    expect(y.status).toBe(200);
    const metin = await y.text();
    const govde = JSON.parse(metin);
    expect(govde.verifyToken).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(metin).not.toContain(ANAHTAR);
    expect(metin).not.toContain(SECRET);
    expect(govde.baglanti).toMatchObject({ tanimli: true, erisimAnahtariTanimli: true, appSecretTanimli: true, testModu: true, uygulamaPayi: 10 });

    const satir = db.$client.prepare("select sifreli_veri from whatsapp_baglantilari where tenant_id = ?").get(ctx.tenantId) as {
      sifreli_veri: string;
    };
    expect(satir.sifreli_veri.startsWith("v1:")).toBe(true);
    for (const gizli of [ANAHTAR, SECRET, govde.verifyToken]) expect(satir.sifreli_veri).not.toContain(gizli);

    // GET, PATCH, test, şablon yanıtlarının hiçbirinde gizli bilgi yok; ikinci kayıtta token dönmez, gizliler korunur.
    for (const r of [
      await baglantiRotasi.GET(),
      await baglantiRotasi.PATCH(istek("/api/ayarlar/whatsapp-api", "PATCH", { uygulamaPayi: 20 })),
      await testRotasi.POST(istek("/api/ayarlar/whatsapp-api/test", "POST")),
      await sablonRotasi.POST(istek("/api/whatsapp/sablonlar", "POST")),
      await baglantiRotasi.PUT(istek("/api/ayarlar/whatsapp-api", "PUT", { wabaId: "200001", phoneNumberId: "300001" })),
    ]) {
      const t = await r.text();
      expect(r.status, t).toBe(200);
      for (const gizli of [ANAHTAR, SECRET, govde.verifyToken]) expect(t).not.toContain(gizli);
      expect(JSON.parse(t).verifyToken ?? null).toBeNull();
    }
    // Sahte istemciye çözülmüş doğru anahtar gitti.
    expect(mockWhatsapp.sonBaglanti).toEqual({ wabaId: "200001", phoneNumberId: "300001", erisimAnahtari: ANAHTAR });
  });

  it("şifreli değer başka kiracının satırına kopyalanırsa çözülemez", () => {
    const a = kur("KopyaA");
    const b = kur("KopyaB");
    const aSifreli = baglantiGetir(a.ctx)!.sifreliVeri;
    db.$client.prepare("update whatsapp_baglantilari set sifreli_veri = ? where tenant_id = ?").run(aSifreli, b.ctx.tenantId);
    expect(() => svc.whatsappBaglantisiCoz(b.ctx)).toThrow(/çözülemedi/);
    expect(svc.baglantiDurumu(b.ctx).erisimAnahtariTanimli).toBe(false);
  });

  it("ilk kayıtta erişim anahtarı ve App Secret zorunlu; aynı numara iki çalışma alanına bağlanamaz", () => {
    const { ctx } = kiraciOlustur("Zorunlu");
    expect(() => svc.whatsappBaglantisiKaydet(ctx, { wabaId: "200001", phoneNumberId: "300009" })).toThrow(/erişim anahtarı/);
    const a = kur("NumaraA", "300010");
    expect(a.verifyToken).toBeTruthy();
    const { ctx: b } = kiraciOlustur("NumaraB");
    expect(() =>
      svc.whatsappBaglantisiKaydet(b, { wabaId: "200002", phoneNumberId: "300010", erisimAnahtari: "x", appSecret: "y" }),
    ).toThrow(/başka bir çalışma alanına/);
  });

  it("yalnızca yönetici: üye bağlantıyı göremez, değiştiremez, şablon senkronlayamaz; şablon listesini görebilir", async () => {
    const { ctx } = kur("Yetki");
    const uye = kullaniciOlustur("YetkiUye");
    db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(uye.id, ctx.tenantId);
    oturum.ctx = baglamUret(uye.id, ctx.tenantId)!;
    expect((await baglantiRotasi.GET()).status).toBe(403);
    expect((await baglantiRotasi.PUT(istek("/api/ayarlar/whatsapp-api", "PUT", { wabaId: "1111111", phoneNumberId: "2222222" }))).status).toBe(403);
    expect((await baglantiRotasi.PATCH(istek("/api/ayarlar/whatsapp-api", "PATCH", { testModu: false }))).status).toBe(403);
    expect((await tokenRotasi.POST(istek("/api/ayarlar/whatsapp-api/verify-token", "POST"))).status).toBe(403);
    expect((await sablonRotasi.POST(istek("/api/whatsapp/sablonlar", "POST"))).status).toBe(403);
    expect((await sablonRotasi.GET()).status).toBe(200);
    expect(baglantiGetir(ctx)?.wabaId).toBe("200001");
  });
});

describe("test modu kilidi", () => {
  const isaretle = (tenantId: string, alan: "webhook_dogrulama_tarihi" | "son_imzali_durum_tarihi") =>
    db.$client.prepare(`update whatsapp_baglantilari set ${alan} = ? where tenant_id = ?`).run(Date.now(), tenantId);

  it("varsayılan açık; webhook doğrulaması ve imzalı durum bildirimi olmadan kapatılamaz (sunucu + neden)", async () => {
    const { ctx } = kur("Kilit");
    oturum.ctx = ctx;
    const kapat = () => baglantiRotasi.PATCH(istek("/api/ayarlar/whatsapp-api", "PATCH", { testModu: false }));
    expect(svc.baglantiDurumu(ctx)).toMatchObject({ testModu: true, testModuKapatilabilir: false });

    let y = await kapat();
    expect(y.status).toBe(409);
    expect((await y.json()).hata).toMatch(/webhook henüz doğrulanmadı/);

    isaretle(ctx.tenantId, "webhook_dogrulama_tarihi");
    y = await kapat();
    expect(y.status).toBe(409);
    expect((await y.json()).hata).toMatch(/imzası doğrulanmış/);
    expect(baglantiGetir(ctx)?.testModu).toBe(true);

    isaretle(ctx.tenantId, "son_imzali_durum_tarihi");
    y = await kapat();
    expect(y.status).toBe(200);
    expect((await y.json()).baglanti).toMatchObject({ testModu: false });
  });

  it("verify token yenilenince ya da numara değişince doğrulama sıfırlanır ve test modu yeniden açılır", async () => {
    const { ctx, verifyToken } = kur("Sifirla");
    oturum.ctx = ctx;
    isaretle(ctx.tenantId, "webhook_dogrulama_tarihi");
    isaretle(ctx.tenantId, "son_imzali_durum_tarihi");
    svc.testModuDegistir(ctx, false);

    const y = await tokenRotasi.POST(istek("/api/ayarlar/whatsapp-api/verify-token", "POST"));
    const g = await y.json();
    expect(g.verifyToken).toBeTruthy();
    expect(g.verifyToken).not.toBe(verifyToken);
    expect(g.baglanti).toMatchObject({ testModu: true, webhookDogrulandi: false, imzaliDurumAlindi: false });
    expect(svc.whatsappBaglantisiCoz(ctx)?.gizli.verifyToken).toBe(g.verifyToken);

    isaretle(ctx.tenantId, "webhook_dogrulama_tarihi");
    isaretle(ctx.tenantId, "son_imzali_durum_tarihi");
    svc.testModuDegistir(ctx, false);
    svc.whatsappBaglantisiKaydet(ctx, { wabaId: "200001", phoneNumberId: "399999" });
    expect(svc.baglantiDurumu(ctx)).toMatchObject({ testModu: true, webhookDogrulandi: false, phoneNumberId: "399999" });
    // Gizli bilgiler korunur.
    expect(svc.whatsappBaglantisiCoz(ctx)?.gizli).toMatchObject({ erisimAnahtari: ANAHTAR, appSecret: SECRET });
  });

  it("test numaraları: cep, normalize, en fazla 5; pay 1–100", () => {
    const { ctx } = kur("Numaralar");
    expect(svc.testNumaralariKaydet(ctx, ["0532 111 22 33", "+90 533 444 55 66", "0532 111 22 33", ""])).toEqual([
      "905321112233",
      "905334445566",
    ]);
    expect(svc.baglantiDurumu(ctx).testNumaralari).toEqual(["905321112233", "905334445566"]);
    expect(() => svc.testNumaralariKaydet(ctx, ["0216 555 44 33"])).toThrow(/Cep telefonu/);
    expect(() => svc.testNumaralariKaydet(ctx, ["05321110001", "05321110002", "05321110003", "05321110004", "05321110005", "05321110006"])).toThrow(/En fazla 5/);
    expect(() => svc.uygulamaPayiKaydet(ctx, 0)).toThrow(/1 ile 100/);
    svc.uygulamaPayiKaydet(ctx, 25);
    expect(svc.baglantiDurumu(ctx).uygulamaPayi).toBe(25);
  });
});

describe("Graph API (sahte istemci)", () => {
  it("bağlantı testi numara, kalite ve limiti saklar; hata saklanır ve 502 döner", async () => {
    const { ctx } = kur("Test");
    mockWhatsapp.numara = { id: "1", gorunenNumara: "+90 850 111 11 11", dogrulanmisAd: "Ege Emlak", kalite: "YELLOW", limitKatmani: "TIER_10K" };
    const d = await svc.baglantiyiTestEt(ctx);
    expect(d.numara).toMatchObject({ gorunenNumara: "+90 850 111 11 11", kalite: "YELLOW", limit: 10_000, sonHata: null });

    mockWhatsapp.hata = new GraphHatasi("Invalid OAuth access token", 401, 190);
    await expect(svc.baglantiyiTestEt(ctx)).rejects.toMatchObject({ durum: 502, message: expect.stringMatching(/erişimi reddetti/) });
    expect(svc.baglantiDurumu(ctx).numara.sonHata).toMatch(/erişimi reddetti/);
    expect(svc.baglantiDurumu(ctx).numara.kalite).toBe("YELLOW"); // önceki bilgi korunur
  });

  it("webhook aboneliği yalnızca istenince", async () => {
    const { ctx } = kur("Abone");
    expect(mockWhatsapp.abonelikSayisi).toBe(0);
    await svc.webhookAboneligiEtkinlestir(ctx);
    expect(mockWhatsapp.abonelikSayisi).toBe(1);
  });

  it("şablon senkronu: kullanılabilirlik, güncelleme ve Meta'da silinen şablon", async () => {
    const { ctx } = kur("Sablon");
    expect(await svc.sablonlariSenkronizeEt(ctx)).toEqual({ eklenen: 3, guncellenen: 0, silinen: 0 });
    const liste = Object.fromEntries(svc.sablonlar(ctx).map((s) => [s.ad, s]));
    expect(liste.kampanya_tanitim).toMatchObject({
      kullanilabilir: true,
      abonelikButonu: true,
      degiskenler: [
        { bilesen: "header", ad: "1" },
        { bilesen: "body", ad: "1" },
        { bilesen: "body", ad: "2" },
      ],
    });
    expect(liste.butonsuz_pazarlama).toMatchObject({ kullanilabilir: false, destekNedeni: expect.stringMatching(/abonelikten çıkma/) });
    expect(liste.randevu_hatirlatma).toMatchObject({ kullanilabilir: true, degiskenler: [{ bilesen: "body", ad: "ad" }, { bilesen: "body", ad: "tarih" }] });
    expect(svc.baglantiDurumu(ctx).sablonSenkronTarihi).not.toBeNull();

    mockWhatsapp.sablonlar = mockWhatsapp.sablonlar.filter((s) => s.name !== "randevu_hatirlatma");
    mockWhatsapp.sablonlar[0].status = "PAUSED";
    expect(await svc.sablonlariSenkronizeEt(ctx)).toEqual({ eklenen: 0, guncellenen: 2, silinen: 1 });
    const ikinci = Object.fromEntries(sablonlariListele(ctx).map((s) => [s.ad, s]));
    expect(ikinci.randevu_hatirlatma.durum).toBe("SILINDI");
    expect(ikinci.kampanya_tanitim.destekNedeni).toMatch(/onaylı değil \(PAUSED\)/);
    expect(await svc.sablonlariSenkronizeEt(ctx)).toEqual({ eklenen: 0, guncellenen: 2, silinen: 0 });
  });

  it("bağlantı yoksa Graph çağrıları 404 hatası verir", async () => {
    const { ctx } = kiraciOlustur("Yok");
    await expect(svc.baglantiyiTestEt(ctx)).rejects.toMatchObject({ durum: 404 });
    expect(svc.baglantiDurumu(ctx)).toMatchObject({ tanimli: false, testModu: true });
  });
});
