// WhatsApp Business Platform (Cloud API) bağlantısı ve şablonlar: şifreli saklama ve hiçbir yanıtta dönmeme,
// yalnızca yönetici, verify token'ın bir kez gösterilmesi, test modu kilidi, test numaraları, pay, bağlantı testi
// (sahte Graph istemcisi), şablon senkronu ve kampanyada kullanılabilirlik. Numara başına (çoklu numara:
// tests/coklu-numara.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { limitKatmaniSayisi, sablonCozumle } from "@/lib/whatsapp-api";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { baglantiGetir, baglantilariListele } = await import("@/server/repo/whatsapp-baglantilari");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { sablonlariListele } = await import("@/server/repo/whatsapp-sablonlari");
const { mockKullaniliyor, GraphHatasi } = await import("@/server/whatsapp-api");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const svc = await import("@/server/servisler/whatsapp-api");
const listeRotasi = await import("@/app/api/ayarlar/whatsapp-api/route");
const numaraRotasi = await import("@/app/api/ayarlar/whatsapp-api/[id]/route");
const testRotasi = await import("@/app/api/ayarlar/whatsapp-api/[id]/test/route");
const tokenRotasi = await import("@/app/api/ayarlar/whatsapp-api/[id]/verify-token/route");
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
const p = (id: string) => ({ params: Promise.resolve({ id }) });

async function kur(ad: string, phoneNumberId = String(100000 + Math.floor(Math.random() * 899999))) {
  const { ctx } = kiraciOlustur(ad);
  const { baglanti, verifyToken } = await svc.whatsappBaglantisiEkle(ctx, {
    ad: "Merkez",
    wabaId: "200001",
    phoneNumberId,
    erisimAnahtari: ANAHTAR,
    appSecret: SECRET,
  });
  return { ctx, verifyToken, phoneNumberId, id: baglanti.id! };
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
      baslikBicimi: null,
      destekNedeni: null,
    });
    expect(
      sablonCozumle({ kategori: "MARKETING", durum: "APPROVED", bilesenler: [govde, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Abonelikten çık" }] }] }).abonelikButonu,
    ).toBe(true);
    expect(sablonCozumle({ kategori: "MARKETING", durum: "APPROVED", bilesenler: [govde] }).destekNedeni).toMatch(/abonelikten çıkma/);
    // WhatsApp Manager'ın hazır "Marketing opt-out" butonu: Türkçe şablonda yerelleştirilmiş metinli QUICK_REPLY; ayrı
    // bir OPT_OUT türü gelirse metne bakılmadan sayılır ve "desteklenmiyor" denmez.
    const hazir = (buton: { type: string; text?: string }) =>
      sablonCozumle({ kategori: "MARKETING", durum: "APPROVED", bilesenler: [govde, { type: "BUTTONS", buttons: [buton] }] });
    expect(hazir({ type: "QUICK_REPLY", text: "Promosyonları durdur" })).toMatchObject({ abonelikButonu: true, destekNedeni: null });
    expect(hazir({ type: "MARKETING_OPT_OUT" })).toMatchObject({ abonelikButonu: true, destekNedeni: null });
    expect(hazir({ type: "QUICK_REPLY", text: "Bilgi al" }).destekNedeni).toMatch(/abonelikten çıkma/);
    // Hizmet şablonunda buton aranmaz; adlandırılmış parametreler.
    expect(sablonCozumle({ kategori: "UTILITY", durum: "APPROVED", bilesenler: [{ type: "BODY", text: "Sayın {{ad}}" }] })).toMatchObject({
      degiskenler: [{ bilesen: "body", ad: "ad" }],
      destekNedeni: null,
    });
    // Medya başlık: yalnızca tek görsel (IMAGE) desteklenir; video ve belge başlık desteklenmez.
    const gorselli = sablonCozumle({ kategori: "UTILITY", durum: "APPROVED", bilesenler: [{ type: "HEADER", format: "IMAGE" }, govde] });
    expect(gorselli).toMatchObject({ baslikBicimi: "IMAGE", destekNedeni: null });
    const medya = sablonCozumle({ kategori: "UTILITY", durum: "APPROVED", bilesenler: [{ type: "HEADER", format: "VIDEO" }, govde] });
    expect(medya.destekNedeni).toBe("Medya başlık (VIDEO) desteklenmiyor");
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

  it("gizli bilgiler şifreli saklanır, hiçbir yanıtta dönmez; verify token yalnızca numara eklenirken bir kez", async () => {
    const { ctx } = kiraciOlustur("Gizli");
    oturum.ctx = ctx;
    const y = await listeRotasi.POST(
      istek("/api/ayarlar/whatsapp-api", "POST", { ad: "Merkez", wabaId: "200001", phoneNumberId: "300001", erisimAnahtari: ANAHTAR, appSecret: SECRET }),
    );
    expect(y.status).toBe(201);
    const metin = await y.text();
    const govde = JSON.parse(metin);
    expect(govde.verifyToken).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(metin).not.toContain(ANAHTAR);
    expect(metin).not.toContain(SECRET);
    expect(govde.baglanti).toMatchObject({ ad: "Merkez", tanimli: true, erisimAnahtariTanimli: true, appSecretTanimli: true, testModu: true, uygulamaPayi: 10 });
    const id: string = govde.baglanti.id;

    const satir = db.$client.prepare("select sifreli_veri from whatsapp_baglantilari where id = ?").get(id) as { sifreli_veri: string };
    expect(satir.sifreli_veri.startsWith("v1:")).toBe(true);
    for (const gizli of [ANAHTAR, SECRET, govde.verifyToken]) expect(satir.sifreli_veri).not.toContain(gizli);

    // Liste, numara GET/PATCH/PUT, test ve şablon yanıtlarının hiçbirinde gizli bilgi yok; güncellemede token dönmez,
    // gizliler korunur.
    for (const r of [
      await listeRotasi.GET(),
      await numaraRotasi.GET(istek(`/api/ayarlar/whatsapp-api/${id}`, "GET"), p(id)),
      await numaraRotasi.PATCH(istek(`/api/ayarlar/whatsapp-api/${id}`, "PATCH", { uygulamaPayi: 20 }), p(id)),
      await testRotasi.POST(istek(`/api/ayarlar/whatsapp-api/${id}/test`, "POST"), p(id)),
      await sablonRotasi.POST(istek(`/api/whatsapp/sablonlar?baglanti=${id}`, "POST")),
      await numaraRotasi.PUT(istek(`/api/ayarlar/whatsapp-api/${id}`, "PUT", { wabaId: "200001", phoneNumberId: "300001" }), p(id)),
    ]) {
      const t = await r.text();
      expect(r.status, t).toBe(200);
      for (const gizli of [ANAHTAR, SECRET, govde.verifyToken]) expect(t).not.toContain(gizli);
      expect(JSON.parse(t).verifyToken ?? null).toBeNull();
    }
    // Sahte istemciye çözülmüş doğru anahtar gitti.
    expect(mockWhatsapp.sonBaglanti).toEqual({ wabaId: "200001", phoneNumberId: "300001", erisimAnahtari: ANAHTAR });
  });

  it("webhook adresi GENEL_ADRES'ten (yalnızca https kökü) üretilir; yoksa ya da geçersizse BETTER_AUTH_URL'den", async () => {
    const { ctx, id } = await kur("GenelAdres");
    const kimlik = baglantiGetir(ctx, id)!.webhookKimligi;
    const adres = (genel: string | undefined) => {
      if (genel === undefined) delete process.env.GENEL_ADRES;
      else process.env.GENEL_ADRES = genel;
      return svc.baglantiDurumu(ctx, id).webhookAdresi;
    };
    const uyari = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(adres(undefined)).toBe(`${U}/api/whatsapp/webhook/${kimlik}`);
      expect(adres("https://ornek-tunel.trycloudflare.com/")).toBe(`https://ornek-tunel.trycloudflare.com/api/whatsapp/webhook/${kimlik}`);
      expect(adres(" https://ornek-tunel.trycloudflare.com/yol?x=1 ")).toBe(`https://ornek-tunel.trycloudflare.com/api/whatsapp/webhook/${kimlik}`);
      expect(uyari).not.toHaveBeenCalled();
      for (const gecersiz of ["http://ornek-tunel.trycloudflare.com", "ornek-tunel.trycloudflare.com"]) {
        expect(adres(gecersiz)).toBe(`${U}/api/whatsapp/webhook/${kimlik}`);
      }
      expect(uyari).toHaveBeenCalledTimes(2);
      expect(adres("")).toBe(`${U}/api/whatsapp/webhook/${kimlik}`);
    } finally {
      delete process.env.GENEL_ADRES;
      uyari.mockRestore();
    }
  });

  it("şifreli değer başka kiracının satırına kopyalanırsa çözülemez", async () => {
    const a = await kur("KopyaA");
    const b = await kur("KopyaB");
    const aSifreli = baglantiGetir(a.ctx, a.id)!.sifreliVeri;
    db.$client.prepare("update whatsapp_baglantilari set sifreli_veri = ? where id = ?").run(aSifreli, b.id);
    expect(() => svc.whatsappBaglantisiCoz(b.ctx, b.id)).toThrow(/çözülemedi/);
    expect(svc.baglantiDurumu(b.ctx, b.id).erisimAnahtariTanimli).toBe(false);
  });

  it("yeni numarada erişim anahtarı ve App Secret zorunlu; aynı numara iki çalışma alanına bağlanamaz", async () => {
    const { ctx } = kiraciOlustur("Zorunlu");
    await expect(svc.whatsappBaglantisiEkle(ctx, { ad: "Merkez", wabaId: "200001", phoneNumberId: "300009" })).rejects.toThrow(/erişim anahtarı/);
    const a = await kur("NumaraA", "300010");
    expect(a.verifyToken).toBeTruthy();
    const { ctx: b } = kiraciOlustur("NumaraB");
    const hata = await svc
      .whatsappBaglantisiEkle(b, { ad: "Merkez", wabaId: "200002", phoneNumberId: "300010", erisimAnahtari: "x", appSecret: "y" })
      .catch((h: unknown) => h);
    // Numaranın başka bir çalışma alanına bağlı olduğu açığa çıkmaz: sahiplik hatasıyla aynı mesaj ve durum.
    expect(hata).toMatchObject({ durum: 400, message: expect.stringMatching(/^Numara doğrulanamadı/) });
    expect((hata as Error).message).not.toMatch(/başka bir çalışma alanı/);
    expect(baglantilariListele(b)).toEqual([]);
  });

  it("numara sahipliği kiracının kendi anahtarıyla Graph API'den doğrulanır; doğrulanmayan bağlantı kaydedilmez ve kullanılmaz", async () => {
    const { ctx } = kiraciOlustur("Sahiplik");
    const yeni = () => svc.whatsappBaglantisiEkle(ctx, { ad: "Merkez", wabaId: "200009", phoneNumberId: "700099", erisimAnahtari: ANAHTAR, appSecret: SECRET });
    // WABA'da bu numara yok (başkasının numara kimliği girildi).
    mockWhatsapp.wabaNumaralari = ["700001"];
    const ret = await yeni().catch((h: unknown) => h);
    expect(ret).toMatchObject({ durum: 400, message: expect.stringMatching(/^Numara doğrulanamadı/) });
    expect(mockWhatsapp.sonBaglanti).toMatchObject({ wabaId: "200009", erisimAnahtari: ANAHTAR });
    expect(baglantilariListele(ctx)).toEqual([]);

    // Anahtarın WABA'ya yetkisi yok → aynı mesaj; Meta'ya ulaşılamıyor → 502, kayıt yok.
    mockWhatsapp.wabaNumaralari = null;
    mockWhatsapp.hata = new GraphHatasi("Unsupported get request", 400, 100);
    await expect(yeni()).rejects.toThrow(/^Numara doğrulanamadı/);
    mockWhatsapp.hata = new GraphHatasi("Meta'ya ulaşılamadı", 0);
    await expect(yeni()).rejects.toMatchObject({ durum: 502 });
    expect(baglantilariListele(ctx)).toEqual([]);

    // Doğrulanınca bağlı; bağlantı testinde sahiplik reddedilirse bağlantı kullanılmaz (gönderim, webhook, senkron).
    const id = (await yeni()).baglanti.id!;
    expect(svc.baglantiDurumu(ctx, id).numaraDogrulandi).toBe(true);
    expect(svc.whatsappBaglantisiCoz(ctx, id)).not.toBeNull();
    mockWhatsapp.wabaNumaralari = ["700001"];
    await expect(svc.baglantiyiTestEt(ctx, id)).rejects.toThrow(/^Numara doğrulanamadı/);
    expect(svc.baglantiDurumu(ctx, id).numaraDogrulandi).toBe(false);
    expect(svc.whatsappBaglantisiCoz(ctx, id)).toBeNull();
    await expect(svc.sablonlariSenkronizeEt(ctx, id)).rejects.toThrow(/sahipliği doğrulanmadı/);
    // Sahiplik yeniden doğrulanınca bağlantı tekrar kullanılır.
    mockWhatsapp.wabaNumaralari = null;
    await svc.baglantiyiTestEt(ctx, id);
    expect(svc.whatsappBaglantisiCoz(ctx, id)).not.toBeNull();
  });

  it("yalnızca yönetici: üye numaraları göremez, ekleyemez, değiştiremez, şablon senkronlayamaz; şablon listesini görebilir", async () => {
    const { ctx, id } = await kur("Yetki");
    const uye = kullaniciOlustur("YetkiUye");
    db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(uye.id, ctx.tenantId);
    oturum.ctx = baglamUret(uye.id, ctx.tenantId)!;
    expect((await listeRotasi.GET()).status).toBe(403);
    expect(
      (await listeRotasi.POST(istek("/api/ayarlar/whatsapp-api", "POST", { ad: "Şube", wabaId: "1111111", phoneNumberId: "2222222", erisimAnahtari: "x", appSecret: "y" })))
        .status,
    ).toBe(403);
    expect((await numaraRotasi.GET(istek(`/api/ayarlar/whatsapp-api/${id}`, "GET"), p(id))).status).toBe(403);
    expect((await numaraRotasi.PUT(istek(`/api/ayarlar/whatsapp-api/${id}`, "PUT", { wabaId: "1111111", phoneNumberId: "2222222" }), p(id))).status).toBe(403);
    expect((await numaraRotasi.PATCH(istek(`/api/ayarlar/whatsapp-api/${id}`, "PATCH", { testModu: false }), p(id))).status).toBe(403);
    expect((await numaraRotasi.DELETE(istek(`/api/ayarlar/whatsapp-api/${id}`, "DELETE"), p(id))).status).toBe(403);
    expect((await tokenRotasi.POST(istek(`/api/ayarlar/whatsapp-api/${id}/verify-token`, "POST"), p(id))).status).toBe(403);
    expect((await sablonRotasi.POST(istek(`/api/whatsapp/sablonlar?baglanti=${id}`, "POST"))).status).toBe(403);
    expect((await sablonRotasi.GET(istek(`/api/whatsapp/sablonlar?baglanti=${id}`, "GET"))).status).toBe(200);
    expect(baglantiGetir(ctx, id)?.wabaId).toBe("200001");
    expect(baglantilariListele(ctx)).toHaveLength(1);
  });
});

describe("test modu kilidi", () => {
  const isaretle = (id: string, alan: "webhook_dogrulama_tarihi" | "son_imzali_durum_tarihi") =>
    db.$client.prepare(`update whatsapp_baglantilari set ${alan} = ? where id = ?`).run(Date.now(), id);
  /** Test modu kapalıyken gereken gönderen bilgileri (kapatmanın üçüncü koşulu). */
  const gonderenTamamla = (ctx: TenantContext) =>
    iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });

  it("varsayılan açık; webhook doğrulaması, imzalı durum bildirimi ve gönderen bilgileri olmadan kapatılamaz (sunucu + neden)", async () => {
    const { ctx, id } = await kur("Kilit");
    oturum.ctx = ctx;
    const kapat = () => numaraRotasi.PATCH(istek(`/api/ayarlar/whatsapp-api/${id}`, "PATCH", { testModu: false }), p(id));
    expect(svc.baglantiDurumu(ctx, id)).toMatchObject({ testModu: true, testModuKapatilabilir: false });

    let y = await kapat();
    expect(y.status).toBe(409);
    expect((await y.json()).hata).toMatch(/bildirim adresi henüz doğrulanmadı/);

    isaretle(id, "webhook_dogrulama_tarihi");
    y = await kapat();
    expect(y.status).toBe(409);
    expect((await y.json()).hata).toMatch(/imzası doğrulanmış/);
    expect(baglantiGetir(ctx, id)?.testModu).toBe(true);

    isaretle(id, "son_imzali_durum_tarihi");
    y = await kapat();
    expect(y.status).toBe(409);
    expect((await y.json()).hata).toMatch(/Gönderen bilgileri eksik: gönderen unvanı/);
    expect(baglantiGetir(ctx, id)?.testModu).toBe(true);

    gonderenTamamla(ctx);
    y = await kapat();
    expect(y.status).toBe(200);
    expect((await y.json()).baglanti).toMatchObject({ testModu: false });
  });

  it("verify token yenilenince ya da numara değişince doğrulama sıfırlanır ve test modu yeniden açılır", async () => {
    const { ctx, id, verifyToken } = await kur("Sifirla");
    oturum.ctx = ctx;
    gonderenTamamla(ctx);
    isaretle(id, "webhook_dogrulama_tarihi");
    isaretle(id, "son_imzali_durum_tarihi");
    svc.testModuDegistir(ctx, id, false);

    const y = await tokenRotasi.POST(istek(`/api/ayarlar/whatsapp-api/${id}/verify-token`, "POST"), p(id));
    const g = await y.json();
    expect(g.verifyToken).toBeTruthy();
    expect(g.verifyToken).not.toBe(verifyToken);
    expect(g.baglanti).toMatchObject({ testModu: true, webhookDogrulandi: false, imzaliDurumAlindi: false });
    expect(svc.whatsappBaglantisiCoz(ctx, id)?.gizli.verifyToken).toBe(g.verifyToken);

    isaretle(id, "webhook_dogrulama_tarihi");
    isaretle(id, "son_imzali_durum_tarihi");
    svc.testModuDegistir(ctx, id, false);
    await svc.whatsappBaglantisiKaydet(ctx, id, { wabaId: "200001", phoneNumberId: "399999" });
    expect(svc.baglantiDurumu(ctx, id)).toMatchObject({ testModu: true, webhookDogrulandi: false, phoneNumberId: "399999" });
    // Gizli bilgiler korunur.
    expect(svc.whatsappBaglantisiCoz(ctx, id)?.gizli).toMatchObject({ erisimAnahtari: ANAHTAR, appSecret: SECRET });
  });

  it("test numaraları: cep, normalize, en fazla 5; pay 1–100", async () => {
    const { ctx, id } = await kur("Numaralar");
    expect(svc.testNumaralariKaydet(ctx, id, ["0532 111 22 33", "+90 533 444 55 66", "0532 111 22 33", ""])).toEqual([
      "905321112233",
      "905334445566",
    ]);
    expect(svc.baglantiDurumu(ctx, id).testNumaralari).toEqual(["905321112233", "905334445566"]);
    expect(() => svc.testNumaralariKaydet(ctx, id, ["0216 555 44 33"])).toThrow(/Cep telefonu/);
    expect(() => svc.testNumaralariKaydet(ctx, id, ["05321110001", "05321110002", "05321110003", "05321110004", "05321110005", "05321110006"])).toThrow(
      /En fazla 5/,
    );
    expect(() => svc.uygulamaPayiKaydet(ctx, id, 0)).toThrow(/1 ile 100/);
    svc.uygulamaPayiKaydet(ctx, id, 25);
    expect(svc.baglantiDurumu(ctx, id).uygulamaPayi).toBe(25);
  });
});

describe("Graph API (sahte istemci)", () => {
  it("bağlantı testi numara, kalite ve limiti saklar; hata saklanır ve 502 döner", async () => {
    const { ctx, id } = await kur("Test");
    mockWhatsapp.numara = { id: "1", gorunenNumara: "+90 850 111 11 11", dogrulanmisAd: "Ege Emlak", kalite: "YELLOW", limitKatmani: "TIER_10K" };
    const d = await svc.baglantiyiTestEt(ctx, id);
    expect(d.numara).toMatchObject({ gorunenNumara: "+90 850 111 11 11", kalite: "YELLOW", limit: 10_000, sonHata: null });
    expect(d.etiket).toBe("Merkez · …1111");

    mockWhatsapp.hata = new GraphHatasi("Invalid OAuth access token", 401, 190);
    await expect(svc.baglantiyiTestEt(ctx, id)).rejects.toMatchObject({ durum: 502, message: expect.stringMatching(/erişimi reddetti/) });
    expect(svc.baglantiDurumu(ctx, id).numara.sonHata).toMatch(/erişimi reddetti/);
    expect(svc.baglantiDurumu(ctx, id).numara.kalite).toBe("YELLOW"); // önceki bilgi korunur
  });

  it("webhook aboneliği yalnızca istenince", async () => {
    const { ctx, id } = await kur("Abone");
    expect(mockWhatsapp.abonelikSayisi).toBe(0);
    await svc.webhookAboneligiEtkinlestir(ctx, id);
    expect(mockWhatsapp.abonelikSayisi).toBe(1);
  });

  it("şablon senkronu: kullanılabilirlik, güncelleme ve Meta'da silinen şablon", async () => {
    const { ctx, id } = await kur("Sablon");
    expect(await svc.sablonlariSenkronizeEt(ctx, id)).toEqual({ eklenen: 3, guncellenen: 0, silinen: 0 });
    const liste = Object.fromEntries(svc.sablonlar(ctx, id).map((s) => [s.ad, s]));
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
    expect(svc.baglantiDurumu(ctx, id).sablonSenkronTarihi).not.toBeNull();

    mockWhatsapp.sablonlar = mockWhatsapp.sablonlar.filter((s) => s.name !== "randevu_hatirlatma");
    mockWhatsapp.sablonlar[0].status = "PAUSED";
    expect(await svc.sablonlariSenkronizeEt(ctx, id)).toEqual({ eklenen: 0, guncellenen: 2, silinen: 1 });
    const ikinci = Object.fromEntries(sablonlariListele(ctx).map((s) => [s.ad, s]));
    // Meta'da silinen ve kampanyada kullanılmamış şablon satırı silinir (kullanılmışsa SILINDI kalır: sablon-waba.test.ts).
    expect(ikinci.randevu_hatirlatma).toBeUndefined();
    expect(ikinci.kampanya_tanitim.destekNedeni).toMatch(/onaylı değil \(PAUSED\)/);
    expect(await svc.sablonlariSenkronizeEt(ctx, id)).toEqual({ eklenen: 0, guncellenen: 2, silinen: 0 });
  });

  it("numara yoksa (ya da başka çalışma alanınınsa) Graph çağrıları ve durum 404 verir", async () => {
    const { ctx } = kiraciOlustur("Yok");
    const baska = await kur("YokBaska");
    for (const id of ["olmayan-numara", baska.id]) {
      await expect(svc.baglantiyiTestEt(ctx, id)).rejects.toMatchObject({ durum: 404 });
      expect(() => svc.baglantiDurumu(ctx, id)).toThrow(expect.objectContaining({ durum: 404 }));
      expect(svc.sablonlar(ctx, id)).toEqual([]);
    }
    expect(svc.baglantilarDurumu(ctx)).toEqual([]);
    expect(svc.bosBaglantiDto()).toMatchObject({ id: null, tanimli: false, testModu: true });
  });
});
