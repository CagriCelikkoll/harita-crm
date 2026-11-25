// Tek görselli (IMAGE başlıklı) WhatsApp şablonuyla kampanya: başlık biçimi senkronda saklanır (VIDEO / DOCUMENT
// desteklenmez); görsel yalnızca JPEG / PNG, en fazla 5 MB, türü imzadan doğrulanır, sha256 alınır ve gelen medyanın
// klasörüne / kotasına yazılır; işçi görseli gönderen numarayla /media'ya BİR KEZ yükler, kimliği yeniden kullanır,
// süresi dolunca yeniden yükler; gönderimde header → image → id; medya hataları (yükleme reddi, 131053 gönderimde ve
// teslim bildiriminde) kampanyayı listeyi harcamadan duraklatır ve "Son hata"ya yazılır; alıcı / test modu / saat
// kuralları aynen geçerli; başka çalışma alanının görseline erişilemez.
import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _baglamDamgala, YetkiHatasi, type TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kampanyaGetir } = await import("@/server/repo/kampanyalar");
const { kisileriEkle } = await import("@/server/repo/kayitlar");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const { sablonlariListele } = await import("@/server/repo/whatsapp-sablonlari");
const { whatsappIzniAyarla } = await import("@/server/repo/whatsapp-kisileri");
const { kampanyaGorselAlanlari } = await import("@/server/repo/kampanya-gorselleri");
const { medyaKotaKullanimi } = await import("@/server/repo/sistem/medya");
const { isciTuru } = await import("@/server/servisler/isci");
const { KampanyaGirdisi, kampanyaBaslat, kampanyaOzeti, kampanyayiDevamEttir } = await import("@/server/servisler/kampanya");
const { gorselDogrula, kampanyaGorseliYukle, metaGorselHazirla, KampanyaGorselHatasi } = await import("@/server/servisler/kampanya-gorseli");
const { medyaDosyasi } = await import("@/server/servisler/medya");
const { medyaBakimi, medyaTamYolu } = await import("@/server/servisler/medya-dosyalari");
const wa = await import("@/server/servisler/whatsapp-api");
const gelenKutusu = await import("@/server/servisler/gelen-kutusu");
const gk = await import("@/server/repo/gelen-kutusu");
const { GraphHatasi, whatsappApiIstemcisi } = await import("@/server/whatsapp-api");
const { gercekWhatsappIstemcisi } = await import("@/server/whatsapp-api/istemci");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const webhook = await import("@/app/api/whatsapp/webhook/[kimlik]/route");
const gorselRotasi = await import("@/app/api/kampanyalar/gorsel/route");
const medyaRotasi = await import("@/app/api/medya/[id]/route");
const lib = await import("@/lib/whatsapp-api");
const { DURAKLATMA_NEDEN_ADLARI } = await import("@/lib/mesajlasma");
const { adimEngeli } = await import("@/lib/kampanya-sihirbazi");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const SIMDI = new Date("2026-11-23T09:00:00Z"); // 12:00 İstanbul
const GUN = 24 * 3600_000;
const tur = (simdi = SIMDI) => isciTuru({ simdi: () => simdi, parti: 50, whatsappAralikMs: 0 });
let sayac = 0;

// Geçerli imzalı küçük dosyalar (içerik önemsiz; tür imzadan belirlenir).
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 9, 9, 9]);
const GIF = new TextEncoder().encode("GIF89a\x01\x00\x01\x00");
const PDF = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj");

const GORSELLI = {
  id: "2001",
  name: "gorselli_tanitim",
  language: "tr",
  status: "APPROVED",
  category: "UTILITY",
  parameter_format: "POSITIONAL",
  components: [{ type: "HEADER", format: "IMAGE", example: { header_handle: ["4::aW1n"] } }, { type: "BODY", text: "{{1}}, yeni portföyümüz hazır." }],
};
const VIDEOLU = { ...GORSELLI, id: "2002", name: "videolu_tanitim", components: [{ type: "HEADER", format: "VIDEO" }, { type: "BODY", text: "Video" }] };
const BELGELI = { ...GORSELLI, id: "2003", name: "belgeli_tanitim", components: [{ type: "HEADER", format: "DOCUMENT" }, { type: "BODY", text: "Belge" }] };

beforeEach(() => {
  // İşçi turu bütün çalışma alanlarını işler: önceki testlerin bekleyen kampanyaları bu testin sayımlarına girmesin.
  db.$client.prepare("update kampanyalar set durum = 'iptal' where durum in ('calisiyor', 'zamanlandi', 'duraklatildi')").run();
  mockWhatsappSifirla();
  mockWhatsapp.sablonlar.push(GORSELLI, VIDEOLU, BELGELI);
  oturum.ctx = null;
});

type Numara = { id: string; phoneId: string; waba: string; kimlik: string };

async function alan(ad: string) {
  const { ctx } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  const waba = String(610000 + ++sayac);
  const phoneId = String(880000 + sayac);
  const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad: "Merkez", wabaId: waba, phoneNumberId: phoneId, erisimAnahtari: "anahtar", appSecret: "app-secret" });
  db.$client
    .prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ?, kalite = 'GREEN', limit_katmani = 'TIER_10K', son_kontrol = ? where id = ?")
    .run(Date.now(), Date.now(), SIMDI.getTime(), baglanti.id!);
  wa.testModuDegistir(ctx, baglanti.id!, false);
  await wa.sablonlariSenkronizeEt(ctx, baglanti.id!, SIMDI);
  const b = baglantiGetir(ctx, baglanti.id!)!;
  oturum.ctx = ctx;
  return { ctx, n: { id: b.id, phoneId, waba, kimlik: b.webhookKimligi } as Numara };
}

function kisiler(ctx: TenantContext, etiket: string, telefonlar: string[]) {
  const eklenen = kisileriEkle(
    ctx,
    telefonlar.map((t, i) => ({ kaynak: "elle" as const, ekTelefon: t, isletmeAdi: `İşletme ${i + 1}`, etiketler: [etiket], aliciTuru: "tacir_esnaf" as const })),
    "test",
  );
  for (const k of eklenen) whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form" });
  return eklenen;
}

const sablon = (ctx: TenantContext, waba: string, ad = "gorselli_tanitim") => sablonlariListele(ctx, waba).find((s) => s.ad === ad)!;

function girdi(ctx: TenantContext, n: Numara, etiket: string, gorselId?: string) {
  return KampanyaGirdisi.parse({
    kanal: "whatsapp_api",
    ad: `Görselli ${etiket}`,
    filtre: { etiket },
    testModu: false,
    baglantiId: n.id,
    sablonId: sablon(ctx, n.waba).id,
    degiskenEslem: { "body:1": { kaynak: "isletme_adi" } },
    ...(gorselId ? { gorselId } : {}),
  });
}

/** Görsel + kişiler + kampanya. */
async function gorselliKampanya(ad: string, telefonlar = ["0532 100 00 01", "0532 100 00 02", "0532 100 00 03"]) {
  const { ctx, n } = await alan(ad);
  kisiler(ctx, ad.toLowerCase(), telefonlar);
  const g = kampanyaGorseliYukle(ctx, "vitrin.png", PNG, SIMDI);
  const k = kampanyaBaslat(ctx, girdi(ctx, n, ad.toLowerCase(), g.id), SIMDI);
  return { ctx, n, g, k };
}

const kuyruk = (kampanyaId: string) =>
  db.$client.prepare("select durum, neden from message_queue where kampanya_id = ? order by rowid").all(kampanyaId) as { durum: string; neden: string | null }[];

async function bildirim(n: Numara, value: Record<string, unknown>) {
  const govde = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: n.waba, changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: n.phoneId }, ...value } }] }],
  });
  const imza = `sha256=${createHmac("sha256", "app-secret").update(govde).digest("hex")}`;
  const y = await webhook.POST(new Request(`https://crm.ornek.test/api/whatsapp/webhook/${n.kimlik}`, { method: "POST", headers: { "X-Hub-Signature-256": imza }, body: govde }), {
    params: Promise.resolve({ kimlik: n.kimlik }),
  });
  expect(y.status).toBe(200);
}

describe("lib: başlık biçimi, görsel imzası, parametreler, hata metinleri", () => {
  it("IMAGE başlık desteklenir (görselli), VIDEO / DOCUMENT / LOCATION desteklenmez; metin başlıkta rozet yok", () => {
    const govde = { type: "BODY", text: "Merhaba {{1}}" };
    expect(lib.sablonCozumle({ kategori: "UTILITY", durum: "APPROVED", bilesenler: [{ type: "HEADER", format: "IMAGE" }, govde] })).toMatchObject({
      baslikBicimi: "IMAGE",
      destekNedeni: null,
      degiskenler: [{ bilesen: "body", ad: "1" }],
    });
    for (const bicim of ["VIDEO", "DOCUMENT", "LOCATION"]) {
      const c = lib.sablonCozumle({ kategori: "UTILITY", durum: "APPROVED", bilesenler: [{ type: "HEADER", format: bicim }, govde] });
      expect(c.baslikBicimi).toBe(bicim);
      expect(c.destekNedeni).toMatch(new RegExp(`Medya başlık \\(${bicim}\\) desteklenmiyor`));
    }
    expect(lib.sablonCozumle({ kategori: "UTILITY", durum: "APPROVED", bilesenler: [{ type: "HEADER", format: "TEXT", text: "Başlık" }, govde] }).baslikBicimi).toBe("TEXT");
    expect(lib.sablonCozumle({ kategori: "UTILITY", durum: "APPROVED", bilesenler: [govde] }).baslikBicimi).toBeNull();
    expect(lib.baslikBicimiBul([{ type: "header", format: "image" }])).toBe("IMAGE");
    expect(lib.medyaBaslikRozeti("IMAGE")).toEqual({ etiket: "Görselli", ton: "ana" });
    expect(lib.medyaBaslikRozeti("VIDEO")).toEqual({ etiket: "Desteklenmiyor", ton: "uyari" });
    expect(lib.medyaBaslikRozeti("DOCUMENT")).toEqual({ etiket: "Desteklenmiyor", ton: "uyari" });
    expect(lib.medyaBaslikRozeti("TEXT")).toBeNull();
    expect(lib.medyaBaslikRozeti(null)).toBeNull();
  });

  it("görsel imzası: JPEG ve PNG tanınır; GIF, PDF, boş ve kısa dosya tanınmaz", () => {
    expect(lib.gorselImzasi(PNG)).toBe("image/png");
    expect(lib.gorselImzasi(JPEG)).toBe("image/jpeg");
    expect(lib.gorselImzasi(GIF)).toBeNull();
    expect(lib.gorselImzasi(PDF)).toBeNull();
    expect(lib.gorselImzasi(new Uint8Array())).toBeNull();
    expect(lib.gorselImzasi(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it("parametreler: görsel başlık { type: image, image: { id } } önce, sonra gövde; önizleme metninde [Görsel]", () => {
    const degiskenler = [{ bilesen: "body" as const, ad: "1" }];
    expect(lib.sablonParametreleri(degiskenler, { "body:1": "Ege" }, false, { metaId: "123456" })).toEqual([
      { type: "header", parameters: [{ type: "image", image: { id: "123456" } }] },
      { type: "body", parameters: [{ type: "text", text: "Ege" }] },
    ]);
    expect(lib.sablonParametreleri(degiskenler, { "body:1": "Ege" }, false)).toEqual([{ type: "body", parameters: [{ type: "text", text: "Ege" }] }]);
    expect(lib.sablonMetni(GORSELLI.components, { "body:1": "Ege" })).toBe("[Görsel]\n\nEge, yeni portföyümüz hazır.");
    expect(lib.sablonParcalari(GORSELLI.components)[0]).toEqual({ tur: "gorsel", parcalar: [{ metin: "[Görsel]" }] });
  });

  it("medya hata kodları ve Türkçe metinler; sihirbaz görselsiz ilerletmez", () => {
    expect(lib.medyaHataKoduMu(131053)).toBe(true);
    expect(lib.medyaHataKoduMu(131052)).toBe(true);
    expect(lib.medyaHataKoduMu(131026)).toBe(false);
    expect(lib.medyaHataKoduMu(null)).toBe(false);
    expect(lib.gorselHataMesaji(131053)).toMatch(/^Meta kampanya görselini işleyemedi \(Meta 131053\)\. .*JPEG ya da PNG/);
    expect(lib.gorselHataMesaji(null, "Param file must be a file")).toMatch(/^Kampanya görseli Meta'ya yüklenemedi: Param file must be a file\./);
    expect(lib.teslimHataAciklamasi(131053)).toBe("görsel işlenemedi");
    expect(DURAKLATMA_NEDEN_ADLARI.gorsel_hatasi).toMatch(/Son hata/);
    expect(DURAKLATMA_NEDEN_ADLARI.gorsel_yok).toBeTruthy();
    const taslak = { kanal: "whatsapp_api" as const, ad: "K", konu: "", sablon: "", baglantiId: "b", sablonId: "s", sabitDegerler: [], aliciSayisi: null, ozetVar: false };
    expect(adimEngeli(3, { ...taslak, gorselGerekli: true, gorselId: null })).toMatch(/görsel yükleyin/);
    expect(adimEngeli(3, { ...taslak, gorselGerekli: true, gorselId: "g1" })).toBeNull();
    expect(adimEngeli(3, { ...taslak, gorselGerekli: false })).toBeNull();
  });
});

describe("şablon senkronu", () => {
  it("başlık biçimi saklanır; görselli kullanılabilir, video / belge başlıklı kampanyada seçilemez; gelen kutusunda görselli listelenmez", async () => {
    const { ctx, n } = await alan("Senkron");
    expect(sablon(ctx, n.waba)).toMatchObject({ baslikBicimi: "IMAGE", destekNedeni: null });
    expect(sablon(ctx, n.waba, "videolu_tanitim")).toMatchObject({ baslikBicimi: "VIDEO", destekNedeni: expect.stringMatching(/VIDEO/) });
    expect(sablon(ctx, n.waba, "belgeli_tanitim")).toMatchObject({ baslikBicimi: "DOCUMENT", destekNedeni: expect.stringMatching(/DOCUMENT/) });
    expect(sablon(ctx, n.waba, "randevu_hatirlatma").baslikBicimi).toBeNull();
    const dto = wa.sablonlar(ctx, n.id);
    expect(dto.find((s) => s.ad === "gorselli_tanitim")).toMatchObject({ baslikBicimi: "IMAGE", kullanilabilir: true });
    expect(dto.find((s) => s.ad === "videolu_tanitim")).toMatchObject({ baslikBicimi: "VIDEO", kullanilabilir: false });
    // 0026 öncesi satır (baslik_bicimi boş): DTO bileşenlerden bulur.
    db.$client.prepare("update whatsapp_sablonlari set baslik_bicimi = null where tenant_id = ?").run(ctx.tenantId);
    expect(wa.sablonlar(ctx, n.id).find((s) => s.ad === "gorselli_tanitim")!.baslikBicimi).toBe("IMAGE");
    // Video başlıklı şablonla kampanya kurulamaz.
    kisiler(ctx, "senkron", ["0532 200 00 01"]);
    expect(() =>
      kampanyaBaslat(ctx, { ...girdi(ctx, n, "senkron"), sablonId: sablon(ctx, n.waba, "videolu_tanitim").id }, SIMDI),
    ).toThrow(/Medya başlık \(VIDEO\) desteklenmiyor/);
    // Gelen kutusu: görselli şablon listelenmez ve gönderilemez (görsel kampanyada yüklenir).
    const [kisi] = kisiler(ctx, "gelen", ["0532 200 00 09"]);
    const sohbet = gk.gelenMesajYaz(ctx, { baglantiId: n.id, leadId: kisi.id, wamid: `wamid.G${++sayac}`, tur: "text", metin: "Merhaba", medyaId: null, metaZamani: null }, SIMDI)!;
    const ayrinti = gelenKutusu.sohbetAyrintisi(ctx, sohbet.sohbetId, SIMDI)!;
    expect(ayrinti.sablonlar.map((s) => s.ad)).not.toContain("gorselli_tanitim");
    expect(ayrinti.sablonlar.map((s) => s.ad)).toContain("randevu_hatirlatma");
    await expect(
      gelenKutusu.sohbetMesajiGonder(ctx, sohbet.sohbetId, { tur: "sablon", sablonId: sablon(ctx, n.waba).id, degiskenler: { "body:1": "A" }, istemciKimligi: "gorselli-1" }, SIMDI),
    ).rejects.toThrow(/Görselli şablon gelen kutusundan gönderilemez/);
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
  });
});

describe("görsel yükleme ve doğrulama", () => {
  it("PNG kabul: tür imzadan, sha256 doğru, dosya medya klasöründe (0600 değil kontrol edilmez), kota sayar", async () => {
    const { ctx } = await alan("YuklePng");
    const once = medyaKotaKullanimi(ctx.tenantId);
    const g = kampanyaGorseliYukle(ctx, "vitrin.png", PNG, SIMDI);
    expect(g).toMatchObject({ mime: "image/png", boyut: PNG.byteLength, dosyaAdi: "vitrin.png", adres: `/api/medya/${g.id}` });
    const satir = db.$client.prepare("select mesaj_id, meta_medya_id, durum, sha256, yol from sohbet_medyalari where id = ?").get(g.id) as Record<string, string | null>;
    expect(satir).toMatchObject({ mesaj_id: null, meta_medya_id: null, durum: "indirildi", sha256: createHash("sha256").update(PNG).digest("hex") });
    expect(satir.yol).toMatch(new RegExp(`^${ctx.tenantId}/2026-11/[0-9a-f-]{36}$`));
    expect(fs.readFileSync(medyaTamYolu(satir.yol!))).toEqual(Buffer.from(PNG));
    expect(medyaKotaKullanimi(ctx.tenantId)).toBe(once + PNG.byteLength);
  });

  it("uzantısı değiştirilmiş dosya: içerik JPEG ise .png adlı olsa da JPEG; PDF / GIF .jpg adıyla reddedilir", async () => {
    const { ctx } = await alan("Uzanti");
    expect(kampanyaGorseliYukle(ctx, "aslinda-jpeg.png", JPEG, SIMDI)).toMatchObject({ mime: "image/jpeg", dosyaAdi: "aslinda-jpeg.jpg" });
    expect(() => kampanyaGorseliYukle(ctx, "fatura.jpg", PDF, SIMDI)).toThrow(/Yalnızca JPEG ya da PNG.*uzantısını değiştirmek yetmez/);
    expect(() => kampanyaGorseliYukle(ctx, "hareketli.png", GIF, SIMDI)).toThrow(KampanyaGorselHatasi);
  });

  it("yanlış MIME (tarayıcının bildirdiği image/png, içerik PDF), büyük dosya ve boş dosya reddedilir; üye yükleyemez", async () => {
    const { ctx } = await alan("Ret");
    // Rota: bildirilen tür dikkate alınmaz.
    const form = new FormData();
    form.set("dosya", new File([PDF], "gorsel.png", { type: "image/png" }));
    let y = await gorselRotasi.POST(new Request("https://crm.ornek.test/api/kampanyalar/gorsel", { method: "POST", body: form }));
    expect(y.status).toBe(400);
    expect((await y.json()).hata).toMatch(/Yalnızca JPEG ya da PNG/);
    // 5 MB + 1 bayt (imzası geçerli olsa da).
    const buyuk = new Uint8Array(lib.KAMPANYA_GORSEL_AZAMI_BAYT + 1);
    buyuk.set(PNG);
    expect(() => gorselDogrula(buyuk)).toThrow(/en fazla 5 MB/);
    const buyukForm = new FormData();
    buyukForm.set("dosya", new File([buyuk], "buyuk.png", { type: "image/png" }));
    y = await gorselRotasi.POST(new Request("https://crm.ornek.test/api/kampanyalar/gorsel", { method: "POST", body: buyukForm }));
    expect([400, 413]).toContain(y.status);
    expect(() => gorselDogrula(new Uint8Array())).toThrow(/boş/);
    // Tam 5 MB kabul.
    const sinirda = new Uint8Array(lib.KAMPANYA_GORSEL_AZAMI_BAYT);
    sinirda.set(JPEG);
    expect(gorselDogrula(sinirda)).toBe("image/jpeg");
    // Rota üzerinden geçerli PNG: 201 ve önizleme adresi.
    const iyi = new FormData();
    iyi.set("dosya", new File([PNG], "iyi.png", { type: "application/octet-stream" }));
    y = await gorselRotasi.POST(new Request("https://crm.ornek.test/api/kampanyalar/gorsel", { method: "POST", body: iyi }));
    expect(y.status).toBe(201);
    expect((await y.json()).gorsel).toMatchObject({ mime: "image/png", adres: expect.stringMatching(/^\/api\/medya\//) });
    // Üye (yönetici değil) yükleyemez.
    const uye = _baglamDamgala({ tenantId: ctx.tenantId, userId: ctx.userId, rol: "uye" });
    expect(() => kampanyaGorseliYukle(uye, "a.png", PNG, SIMDI)).toThrow(YetkiHatasi);
  });

  it("kota doluysa yüklenmez", async () => {
    const { ctx } = await alan("Kota");
    db.$client
      .prepare("insert into sohbet_medyalari (id, tenant_id, durum, boyut, olusturma_tarihi) values (?, ?, 'indirildi', ?, ?)")
      .run(crypto.randomUUID(), ctx.tenantId, 5 * 1024 * 1024 * 1024, Date.now());
    expect(() => kampanyaGorseliYukle(ctx, "a.png", PNG, SIMDI)).toThrow(/disk alanı doldu/);
  });
});

describe("kampanya oluşturma", () => {
  it("görselli şablonda görsel zorunlu; özet görseli ve [Görsel] önizlemesini verir; görsel kampanyaya bağlanır", async () => {
    const { ctx, n } = await alan("Olustur");
    kisiler(ctx, "olustur", ["0532 300 00 01"]);
    expect(() => kampanyaBaslat(ctx, girdi(ctx, n, "olustur"), SIMDI)).toThrow(/görselli: Mesaj adımında JPEG ya da PNG/);
    expect(() => kampanyaBaslat(ctx, girdi(ctx, n, "olustur", crypto.randomUUID()), SIMDI)).toThrow(/görseli bulunamadı/);
    const g = kampanyaGorseliYukle(ctx, "vitrin.png", PNG, SIMDI);
    const ozet = kampanyaOzeti(ctx, girdi(ctx, n, "olustur", g.id), SIMDI);
    expect(ozet.whatsapp!.gorsel).toMatchObject({ id: g.id, adres: `/api/medya/${g.id}` });
    expect(ozet.whatsapp!.onizlemeler[0]).toBe("[Görsel]\n\nİşletme 1, yeni portföyümüz hazır.");
    const k = kampanyaBaslat(ctx, girdi(ctx, n, "olustur", g.id), SIMDI);
    expect(kampanyaGorselAlanlari(ctx, k.id)).toMatchObject({ gorselMedyaId: g.id, metaGorselId: null });
    // Görselsiz şablonda verilen görsel yok sayılır.
    const metinli = kampanyaBaslat(ctx, { ...girdi(ctx, n, "olustur", g.id), sablonId: sablon(ctx, n.waba, "randevu_hatirlatma").id, degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "A" }, "body:tarih": { kaynak: "sabit", deger: "B" } } }, SIMDI);
    expect(kampanyaGorselAlanlari(ctx, metinli.id)!.gorselMedyaId).toBeNull();
  });
});

describe("gönderim", { timeout: 30_000 }, () => {
  it("görsel gönderen numarayla bir kez yüklenir, her alıcıda aynı kimlik header → image → id ile gider", async () => {
    const { ctx, n, g, k } = await gorselliKampanya("Gonder");
    const t = await tur();
    expect(t.gonderilen).toBe(3);
    expect(mockWhatsapp.medyaYuklemeleri).toEqual([
      { phoneNumberId: n.phoneId, mime: "image/png", dosyaAdi: "vitrin.png", boyut: PNG.byteLength, sha256: createHash("sha256").update(PNG).digest("hex"), id: "9000000001" },
    ]);
    expect(mockWhatsapp.gonderilenler).toHaveLength(3);
    for (const g of mockWhatsapp.gonderilenler) {
      expect(g.sablonAdi).toBe("gorselli_tanitim");
      expect(g.bilesenler).toEqual([
        { type: "header", parameters: [{ type: "image", image: { id: "9000000001" } }] },
        { type: "body", parameters: [{ type: "text", text: expect.stringMatching(/^İşletme [123]$/) }] },
      ]);
    }
    expect(mockWhatsapp.gonderilenler.map((g) => (g.bilesenler[1].parameters[0] as { text: string }).text).sort()).toEqual(["İşletme 1", "İşletme 2", "İşletme 3"]);
    expect(kampanyaGorselAlanlari(ctx, k.id)).toMatchObject({ metaGorselId: "9000000001", metaGorselNumarasi: n.phoneId, metaGorselTarihi: SIMDI });
    expect(kampanyaGetir(ctx, k.id)!.durum).toBe("tamamlandi");

    // Gelen kutusu: şablon iletisi balonda kampanyanın görseliyle; listede ham "[Görsel]" yerine okunur önizleme.
    const liste = gk.sohbetleriListele(ctx).satirlar;
    expect(liste).toHaveLength(3);
    const dto = gelenKutusu.mesajDto(gk.sohbetMesajlariGetir(ctx, liste[0].id)[0]);
    expect(dto).toMatchObject({ tur: "template", kampanyaId: k.id, sablonGorseli: `/api/medya/${g.id}` });
    expect(dto.metin).toMatch(/^\[Görsel\]\n\nİşletme [123], yeni portföyümüz hazır\.$/);
    expect(gelenKutusu.sohbetListesi(ctx, {}).sohbetler[0].sonMesaj).toMatch(/^🖼 İşletme [123], yeni portföyümüz hazır\.$/);
  });

  it("kimlik yeniden kullanılır; süresi (25 gün) dolunca ya da numara değişince yeniden yüklenir", async () => {
    const { ctx, n, k } = await gorselliKampanya("Sure", ["0532 400 00 01"]);
    const istemci = whatsappApiIstemcisi({ wabaId: n.waba, phoneNumberId: n.phoneId, erisimAnahtari: "anahtar" });
    const alan = () => kampanyaGorselAlanlari(ctx, k.id)!;
    const ilk = await metaGorselHazirla(ctx, alan(), n.phoneId, istemci, SIMDI);
    expect(await metaGorselHazirla(ctx, alan(), n.phoneId, istemci, new Date(SIMDI.getTime() + 24 * GUN))).toBe(ilk);
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(1);
    const ikinci = await metaGorselHazirla(ctx, alan(), n.phoneId, istemci, new Date(SIMDI.getTime() + 26 * GUN));
    expect(ikinci).not.toBe(ilk);
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(2);
    expect(alan()).toMatchObject({ metaGorselId: ikinci, metaGorselTarihi: new Date(SIMDI.getTime() + 26 * GUN) });
    // Başka numara: o numaranın adına yeniden yüklenir.
    const ucuncu = await metaGorselHazirla(ctx, alan(), "999888777", istemci, new Date(SIMDI.getTime() + 26 * GUN));
    expect(ucuncu).not.toBe(ikinci);
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(3);
    // Dosya değiştirilmişse (özet uyuşmuyor) Meta'ya gönderilmez.
    const yol = (db.$client.prepare("select yol from sohbet_medyalari where id = ?").get(alan().gorselMedyaId) as { yol: string }).yol;
    fs.writeFileSync(medyaTamYolu(yol), JPEG);
    await expect(metaGorselHazirla(ctx, { ...alan(), metaGorselId: null }, n.phoneId, istemci, SIMDI)).rejects.toThrow(/özet uyuşmuyor/);
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(3);
  });

  it("işçi: uzun süren kampanyada kimliğin süresi dolunca sonraki alıcı için görsel yeniden yüklenir", async () => {
    const { ctx, k } = await gorselliKampanya("Uzun", ["0532 410 00 01", "0532 410 00 02"]);
    await isciTuru({ simdi: () => SIMDI, parti: 1, whatsappAralikMs: 0 });
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(1);
    const sonra = new Date(SIMDI.getTime() + 26 * GUN);
    db.$client.prepare("update whatsapp_baglantilari set son_kontrol = ? where tenant_id = ?").run(sonra.getTime(), ctx.tenantId);
    await isciTuru({ simdi: () => sonra, parti: 1, whatsappAralikMs: 0 });
    expect(mockWhatsapp.gonderilenler).toHaveLength(2);
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(2);
    expect(mockWhatsapp.gonderilenler.map((g) => (g.bilesenler[0].parameters[0] as { image: { id: string } }).image.id)).toEqual(["9000000001", "9000000002"]);
    expect(kampanyaGorselAlanlari(ctx, k.id)!.metaGorselTarihi).toEqual(sonra);
  });

  it("gerçek istemci (sahte fetch): /media multipart yüklemesi ve şablon gövdesindeki components doğru", async () => {
    const istekler: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: URL, secenek: RequestInit) => {
      istekler.push({ url: String(url), method: secenek.method ?? "GET", body: secenek.body });
      const yanit = String(url).endsWith("/media") ? { id: "777000111" } : { messages: [{ id: "wamid.GERCEK1", message_status: "accepted" }] };
      return new Response(JSON.stringify(yanit), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const i = gercekWhatsappIstemcisi({ wabaId: "123456", phoneNumberId: "654321", erisimAnahtari: "anahtar" });
      expect(await i.medyaYukle({ icerik: PNG, mime: "image/png", dosyaAdi: "vitrin.png" })).toBe("777000111");
      expect(istekler[0]).toMatchObject({ url: "https://graph.facebook.com/v26.0/654321/media", method: "POST" });
      const form = istekler[0].body as FormData;
      expect(form.get("messaging_product")).toBe("whatsapp");
      expect(form.get("type")).toBe("image/png");
      const dosya = form.get("file") as File;
      expect([dosya.name, dosya.type, dosya.size]).toEqual(["vitrin.png", "image/png", PNG.byteLength]);
      expect(new Uint8Array(await dosya.arrayBuffer())).toEqual(PNG);

      await i.mesajGonder({
        alici: { tur: "telefon", deger: "905321000001" },
        sablonAdi: "gorselli_tanitim",
        dil: "tr",
        bilesenler: lib.sablonParametreleri([{ bilesen: "body", ad: "1" }], { "body:1": "Ege" }, false, { metaId: "777000111" }),
      });
      expect(istekler[1].url).toBe("https://graph.facebook.com/v26.0/654321/messages");
      expect(JSON.parse(String(istekler[1].body))).toEqual({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "905321000001",
        type: "template",
        template: {
          name: "gorselli_tanitim",
          language: { code: "tr" },
          components: [
            { type: "header", parameters: [{ type: "image", image: { id: "777000111" } }] },
            { type: "body", parameters: [{ type: "text", text: "Ege" }] },
          ],
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("gerçek istemci: /media hata gövdesi GraphHatasi'na çevrilir (kod korunur)", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: { message: "(#131053) Media upload error", code: 131053 } }), { status: 400 }),
    );
    try {
      const i = gercekWhatsappIstemcisi({ wabaId: "123456", phoneNumberId: "654321", erisimAnahtari: "anahtar" });
      await expect(i.medyaYukle({ icerik: PNG, mime: "image/png", dosyaAdi: "a.png" })).rejects.toMatchObject({ kod: 131053, http: 400 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("medya hataları", { timeout: 30_000 }, () => {
  it("/media yüklemesi reddedilirse: hiçbir ileti gitmez, liste harcanmaz, yalnızca bu kampanya duraklar, Son hata yazılır; devamda yeniden yüklenir", async () => {
    const { ctx, n, k } = await gorselliKampanya("YuklemeRet");
    mockWhatsapp.yuklemeHatasi = new GraphHatasi("(#131053) Media upload error", 400, 131053);
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(kampanyaGetir(ctx, k.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "gorsel_hatasi" });
    // Bütün alıcılar kuyrukta bekler (hiçbiri başarısız sayılmaz); Meta'ya yalnızca bir yükleme denemesi gider.
    expect(kuyruk(k.id)).toEqual(Array(3).fill({ durum: "kuyrukta", neden: "duraklatildi:gorsel_hatasi" }));
    expect(mockWhatsapp.yuklemeDenemesi).toBe(1);
    expect(wa.baglantiDurumu(ctx, n.id).numara.sonHata).toMatch(/^Meta kampanya görselini işleyemedi \(Meta 131053\)/);
    // Hesap kilidi değil: numara kilitlenmez.
    expect(baglantiGetir(ctx, n.id)!.hesapKilidiKodu).toBeNull();

    mockWhatsapp.yuklemeHatasi = null;
    await kampanyayiDevamEttir(ctx, k.id);
    await tur();
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(1);
    expect(mockWhatsapp.gonderilenler).toHaveLength(3);
  });

  it("geçici yükleme hatası (5xx) yeniden denenir; kampanya duraklamaz", async () => {
    const { ctx, k } = await gorselliKampanya("Gecici", ["0532 500 00 01"]);
    mockWhatsapp.yuklemeHatasi = new GraphHatasi("Service unavailable", 503);
    await tur();
    expect(kampanyaGetir(ctx, k.id)!.durum).toBe("calisiyor");
    expect(kuyruk(k.id)[0].durum).toBe("kuyrukta");
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
  });

  it("gönderimde 131053: bu kampanya duraklar, kalan alıcılar kuyrukta, Meta kimliği silinir, Son hata yazılır", async () => {
    const { ctx, n, k } = await gorselliKampanya("Gonderim131053");
    // Meta görseli her alıcıda reddeder: ilk denemede kampanya durur, kalan alıcılar harcanmaz.
    for (const t of ["905321000001", "905321000002", "905321000003"]) {
      mockWhatsapp.aliciHatalari.set(t, new GraphHatasi("(#131053) Media upload error", 400, 131053));
    }
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(1);
    expect(kampanyaGetir(ctx, k.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "gorsel_hatasi" });
    expect(kuyruk(k.id)).toEqual(Array(3).fill({ durum: "kuyrukta", neden: "duraklatildi:gorsel_hatasi" }));
    expect(mockWhatsapp.yuklemeDenemesi).toBe(1);
    expect(kampanyaGorselAlanlari(ctx, k.id)).toMatchObject({ metaGorselId: null, metaGorselNumarasi: null });
    expect(wa.baglantiDurumu(ctx, n.id).numara.sonHata).toMatch(/Meta 131053/);
  });

  it("teslim bildiriminde 131053: kampanya duraklar, kimlik silinir, Son hata yazılır (webhook)", async () => {
    const { ctx, n, k } = await gorselliKampanya("Webhook131053");
    await isciTuru({ simdi: () => SIMDI, parti: 1, whatsappAralikMs: 0 });
    expect(mockWhatsapp.gonderilenler).toHaveLength(1);
    await bildirim(n, {
      statuses: [{ id: mockWhatsapp.gonderilenler[0].wamid, status: "failed", timestamp: String(Math.floor(SIMDI.getTime() / 1000)), recipient_id: "905321000001", errors: [{ code: 131053, title: "Media upload error" }] }],
    });
    expect(kampanyaGetir(ctx, k.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "gorsel_hatasi" });
    expect(kampanyaGorselAlanlari(ctx, k.id)!.metaGorselId).toBeNull();
    expect(wa.baglantiDurumu(ctx, n.id).numara.sonHata).toMatch(/^Meta kampanya görselini işleyemedi \(Meta 131053\)/);
    expect(kuyruk(k.id).map((m) => m.durum).sort()).toEqual(["gonderildi", "kuyrukta", "kuyrukta"]);
  });

  it("görsel dosyası silinmişse kampanya gorsel_yok ile duraklar, Meta'ya istek gitmez", async () => {
    const { ctx, g, k } = await gorselliKampanya("DosyaYok", ["0532 510 00 01"]);
    const yol = (db.$client.prepare("select yol from sohbet_medyalari where id = ?").get(g.id) as { yol: string }).yol;
    fs.rmSync(medyaTamYolu(yol));
    await tur();
    expect(kampanyaGetir(ctx, k.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "gorsel_yok" });
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(0);
  });
});

describe("kurallar görselli kampanyada da aynen", { timeout: 30_000 }, () => {
  it("test modu, sonradan geri alınan izin ve gönderim saati: kurala uymayana gitmez; görsel yalnızca gerçekten gönderilecekse yüklenir", async () => {
    const { ctx, n } = await alan("Kurallar");
    const [a, b, c] = kisiler(ctx, "kurallar", ["0532 600 00 01", "0532 600 00 02", "0532 600 00 03"]);
    wa.testModuDegistir(ctx, n.id, true);
    wa.testNumaralariKaydet(ctx, n.id, ["0532 600 00 01", "0532 600 00 03"]);
    const g = kampanyaGorseliYukle(ctx, "vitrin.png", PNG, SIMDI);
    const k = kampanyaBaslat(ctx, girdi(ctx, n, "kurallar", g.id), SIMDI);
    // Test modu: test numarası olmayan oluşturmada hariç.
    const kisiDurumu = (leadId: string) =>
      db.$client.prepare("select durum, neden from message_queue where kampanya_id = ? and lead_id = ?").get(k.id, leadId) as { durum: string; neden: string | null };
    expect([kisiDurumu(a.id), kisiDurumu(b.id), kisiDurumu(c.id)]).toEqual([
      { durum: "kuyrukta", neden: null },
      { durum: "haric", neden: "test_modu" },
      { durum: "kuyrukta", neden: null },
    ]);
    // Sabah 06:00 İstanbul: gönderim penceresi (09:00–20:00) dışında hiçbir şey gitmez, görsel de yüklenmez.
    await tur(new Date("2026-11-23T03:00:00Z"));
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(0);
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    // İzin sonradan geri alındı (c), test numarası listeden çıkarıldı (a): ikisi de işçide hariç; görsel yüklenmez.
    whatsappIzniAyarla(ctx, c.id, { izin: "yok", kaynak: "form" });
    wa.testNumaralariKaydet(ctx, n.id, ["0532 600 00 03"]);
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(0);
    expect(kisiDurumu(a.id)).toEqual({ durum: "haric", neden: "test_modu" });
    expect(kisiDurumu(c.id)).toMatchObject({ durum: "haric", neden: "whatsapp_izni_yok" });
  });

  it("günlük sınır: dolunca kalan alıcılar ertesi güne kalır (görsel yüklenmiş olsa da tekrar yüklenmez)", async () => {
    const { ctx, k } = await gorselliKampanya("Sinir");
    db.$client.prepare("update ileti_ayarlari set gunluk_whatsapp_api_siniri = 1 where tenant_id = ?").run(ctx.tenantId);
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(1);
    expect(kuyruk(k.id).map((m) => `${m.durum}:${m.neden}`).sort()).toEqual(["gonderildi:null", "kuyrukta:gunluk_sinir", "kuyrukta:gunluk_sinir"]);
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(1);
  });

  it("sandbox (test) kampanyası Meta'ya görsel yüklemez; metinde [Görsel] kaydedilir", async () => {
    const { ctx, n } = await alan("Sandbox");
    kisiler(ctx, "sandbox", ["0532 700 00 01"]);
    const g = kampanyaGorseliYukle(ctx, "vitrin.png", PNG, SIMDI);
    const k = kampanyaBaslat(ctx, { ...girdi(ctx, n, "sandbox", g.id), testModu: true }, SIMDI);
    await tur();
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(0);
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    const icerik = db.$client.prepare("select sandbox_icerik from message_queue where kampanya_id = ?").get(k.id) as { sandbox_icerik: string };
    expect(icerik.sandbox_icerik).toBe("[Görsel]\n\nİşletme 1, yeni portföyümüz hazır.");
  });
});

describe("izolasyon ve bakım", () => {
  it("başka çalışma alanı görseli kampanyada kullanamaz, önizleme adresinden göremez", async () => {
    const a = await alan("IzoA");
    const ga = kampanyaGorseliYukle(a.ctx, "a.png", PNG, SIMDI);
    const b = await alan("IzoB");
    kisiler(b.ctx, "izob", ["0532 800 00 01"]);
    expect(() => kampanyaBaslat(b.ctx, girdi(b.ctx, b.n, "izob", ga.id), SIMDI)).toThrow(/görseli bulunamadı/);
    expect(medyaDosyasi(b.ctx, ga.id)).toBeNull();
    oturum.ctx = b.ctx;
    expect((await medyaRotasi.GET(new Request(`https://crm.ornek.test/api/medya/${ga.id}`), { params: Promise.resolve({ id: ga.id }) })).status).toBe(404);
    oturum.ctx = a.ctx;
    const y = await medyaRotasi.GET(new Request(`https://crm.ornek.test/api/medya/${ga.id}`), { params: Promise.resolve({ id: ga.id }) });
    expect(y.status).toBe(200);
    expect(y.headers.get("content-type")).toBe("image/png");
    expect(y.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("24 saatte kampanyaya bağlanmayan görsel bakımda silinir; bağlı olan kalır", async () => {
    const { ctx, g: bagli } = await gorselliKampanya("Bakim", ["0532 900 00 01"]);
    const sahipsiz = kampanyaGorseliYukle(ctx, "yarim.png", PNG, SIMDI);
    const yol = (id: string) => (db.$client.prepare("select yol from sohbet_medyalari where id = ?").get(id) as { yol: string } | undefined)?.yol;
    const sahipsizYol = medyaTamYolu(yol(sahipsiz.id)!);
    const bagliYol = medyaTamYolu(yol(bagli.id)!);
    // Oluşturma tarihi SIMDI; bakım gerçek saatten 24 saat sonrasında.
    const sonuc = medyaBakimi(new Date(Math.max(Date.now(), SIMDI.getTime()) + 25 * 3600_000));
    expect(sonuc.sahipsizGorsel).toBeGreaterThanOrEqual(1);
    expect(yol(sahipsiz.id)).toBeUndefined();
    expect(fs.existsSync(sahipsizYol)).toBe(false);
    expect(yol(bagli.id)).toBeTruthy();
    expect(fs.existsSync(bagliYol)).toBe(true);
  });
});
