// Gelen medya (plan-mesajlasma-v2 B6, B10): webhook ağ isteği yapmadan "bekliyor" satırı ekler; işçi indirir (Meta
// alanı dışındaki adres reddedilir, boyut sınırı aşılınca kesilir, sha256 doğrulanır, SVG gibi türler reddedilir);
// geçici hatada yeniden dener, kalıcıda bırakır; kota dolunca bekler; dosya oturum ve çalışma alanı denetimiyle,
// beyaz listedeki Content-Type ve nosniff ile sunulur (başka çalışma alanının medyası 404); saklama süresi dolunca ve
// sahipsiz kalınca silinir. Gerçek Meta isteği yoktur (sahte istemci).
import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kisileriEkle } = await import("@/server/repo/kayitlar");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const gk = await import("@/server/repo/gelen-kutusu");
const { isciTuru } = await import("@/server/servisler/isci");
const { medyalariIndir, MEDYA_AZAMI_DENEME } = await import("@/server/servisler/medya");
const { medyaBakimi, medyaKlasoru, medyaTamYolu } = await import("@/server/servisler/medya-dosyalari");
const servis = await import("@/server/servisler/gelen-kutusu");
const wa = await import("@/server/servisler/whatsapp-api");
const { GraphHatasi } = await import("@/server/whatsapp-api");
const { metaMedyaAdresiGecerli } = await import("@/server/whatsapp-api/medya-adresi");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const webhook = await import("@/app/api/whatsapp/webhook/[kimlik]/route");
const medyaRotasi = await import("@/app/api/medya/[id]/route");
const { MEDYA_AZAMI_BAYT, MEDYA_KOTA_BAYT } = await import("@/lib/gelen-kutusu");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const GUN = 24 * 3600_000;
let sayac = 0;

beforeEach(() => {
  mockWhatsappSifirla();
  oturum.ctx = null;
});

type Numara = { id: string; phoneId: string; waba: string; kimlik: string };

async function alan(ad: string) {
  const { ctx } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  const waba = String(500000 + ++sayac);
  const phoneId = String(830000 + sayac);
  const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad: "Merkez", wabaId: waba, phoneNumberId: phoneId, erisimAnahtari: "anahtar", appSecret: "app-secret" });
  db.$client
    .prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ?, kalite = 'GREEN', limit_katmani = 'TIER_10K', son_kontrol = ? where id = ?")
    .run(Date.now(), Date.now(), Date.now(), baglanti.id!);
  const b = baglantiGetir(ctx, baglanti.id!)!;
  const tel = `90532${String(7000000 + sayac).padStart(7, "0")}`;
  const [k] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: `+${tel}`, isletmeAdi: `Kişi ${sayac}`, aliciTuru: "tacir_esnaf", etiketler: [] }], "test");
  oturum.ctx = ctx;
  return { ctx, n: { id: b.id, phoneId, waba, kimlik: b.webhookKimligi } as Numara, tel, leadId: k.id };
}

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

/** Müşteri medya gönderir. Meta'daki içerik ayrıca mockWhatsapp.medyalar'a konur. */
async function medyaGonder(n: Numara, tel: string, tur: string, medya: Record<string, unknown>, zaman = new Date()) {
  const wamid = `wamid.MEDYA${++sayac}`;
  await bildirim(n, {
    contacts: [{ profile: { name: "Müşteri" }, wa_id: tel }],
    messages: [{ from: tel, id: wamid, timestamp: String(Math.floor(zaman.getTime() / 1000)), type: tur, [tur]: medya }],
  });
  return wamid;
}

const icerik = (bayt: number, dolgu = 7) => new Uint8Array(bayt).fill(dolgu);
const mesajlar = (ctx: TenantContext, n: Numara, leadId: string) => gk.sohbetMesajlariGetir(ctx, gk.sohbetBul(ctx, n.id, leadId)!.id);
const sonMedya = (ctx: TenantContext, n: Numara, leadId: string) => mesajlar(ctx, n, leadId).at(-1)!.medya!;
const medyaIste = (id: string, sorgu = "") => medyaRotasi.GET(new Request(`https://crm.ornek.test/api/medya/${id}${sorgu}`), { params: Promise.resolve({ id }) });

describe("webhook", () => {
  it("fotoğraf, belge, ses ve videoda 'bekliyor' satırı ekler, Meta'ya istek yapmaz; konumda medya satırı yok", async () => {
    const { ctx, n, tel, leadId } = await alan("Webhook");
    mockWhatsapp.sonBaglanti = null; // numara eklenirken yapılan doğrulama çağrısı
    await medyaGonder(n, tel, "image", { id: "1001", mime_type: "image/jpeg", sha256: "abc", caption: "Daire" });
    await medyaGonder(n, tel, "document", { id: "1002", mime_type: "application/pdf", filename: "tapu.pdf" });
    await medyaGonder(n, tel, "audio", { id: "1003", mime_type: "audio/ogg; codecs=opus", voice: true });
    await medyaGonder(n, tel, "video", { id: "1004", mime_type: "video/mp4" });
    await bildirim(n, { contacts: [{ profile: { name: "Müşteri" }, wa_id: tel }], messages: [{ from: tel, id: `wamid.KONUM${++sayac}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "location", location: { latitude: 38.4, longitude: 27.1 } }] });
    const m = mesajlar(ctx, n, leadId);
    expect(m.map((x) => [x.tur, x.medya?.durum ?? null, x.medya?.mime ?? null, x.medya?.dosyaAdi ?? null])).toEqual([
      ["image", "bekliyor", "image/jpeg", null],
      ["document", "bekliyor", "application/pdf", "tapu.pdf"],
      ["audio", "bekliyor", "audio/ogg; codecs=opus", null],
      ["video", "bekliyor", "video/mp4", null],
      ["location", null, null, null],
    ]);
    expect(m[0].medya!.metaSha256).toBe("abc");
    expect(mockWhatsapp.medyaIndirmeleri).toEqual([]);
    expect(mockWhatsapp.sonBaglanti).toBeNull(); // webhook hiçbir Graph çağrısı yapmadı
    expect(m[4]).toMatchObject({ tur: "location", medya: null });
    // DTO: indirilene kadar "Yükleniyor".
    const dto = m.map(servis.mesajDto);
    expect(dto[0].medya).toMatchObject({ durum: "bekliyor", gorunum: "gorsel", neden: "Yükleniyor…" });
    expect(dto[3].medya).toMatchObject({ durum: "bekliyor", gorunum: "video", neden: "Yükleniyor…" });
    expect(dto[4].medya).toBeNull();
  });
});

// İşçi turu ilk çağrıda işçinin tüm modüllerini yükler (tek başına ~3,5 sn); tam takım paralel koşarken 5 sn'yi aşabiliyor.
describe("işçi indirir", { timeout: 30_000 }, () => {
  it("işçi turu bekleyeni indirir: dosya diskte, özet doğru, durum 'indirildi', sohbet canlı yenilenir; dosya beyaz listedeki türle sunulur", async () => {
    const { ctx, n, tel, leadId } = await alan("Indir");
    const foto = icerik(200_000, 3);
    mockWhatsapp.medyalar.set("2001", { icerik: foto, mime: "image/jpeg" });
    await medyaGonder(n, tel, "image", { id: "2001", mime_type: "image/jpeg" });
    const s = gk.sohbetBul(ctx, n.id, leadId)!;
    const surum = gk.gelenKutusuSurumuGetir(ctx);

    const tur = await isciTuru({ parti: 10, whatsappAralikMs: 0 });
    // (Önceki testin Meta'da olmayan medyaları da bu turda "hata" olur.)
    expect(tur.medya).toMatchObject({ indirilen: 1, reddedilen: 0, bekletilen: 0 });
    const m = sonMedya(ctx, n, leadId);
    expect(m).toMatchObject({ durum: "indirildi", mime: "image/jpeg", boyut: 200_000, sha256: createHash("sha256").update(foto).digest("hex"), neden: null });
    expect(m.yol).toMatch(new RegExp(`^${ctx.tenantId}/\\d{4}-\\d{2}/[0-9a-f-]{36}$`));
    expect(fs.readFileSync(medyaTamYolu(m.yol!))).toEqual(Buffer.from(foto));
    expect(gk.degisenSohbetler(ctx, surum)).toContain(s.id);
    expect(servis.mesajDto(mesajlar(ctx, n, leadId).at(-1)!).medya).toMatchObject({ durum: "indirildi", gorunum: "gorsel", neden: null });

    const y = await medyaIste(m.id);
    expect(y.status).toBe(200);
    expect(y.headers.get("content-type")).toBe("image/jpeg");
    expect(y.headers.get("x-content-type-options")).toBe("nosniff");
    expect(y.headers.get("content-security-policy")).toContain("sandbox");
    expect(y.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(new Uint8Array(await y.arrayBuffer())).toEqual(foto);
    expect((await medyaIste(m.id, "?indir=1")).headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("belge ve ses dosya olarak iner (adı korunur); Meta'nın 'audio/ogg; codecs=opus' türü sadeleşir; özet base64 da kabul edilir", async () => {
    const { ctx, n, tel, leadId } = await alan("Belge");
    const pdf = icerik(5000, 1);
    const ses = icerik(3000, 2);
    mockWhatsapp.medyalar.set("2101", { icerik: pdf, mime: "application/pdf" });
    mockWhatsapp.medyalar.set("2102", { icerik: ses, mime: "audio/ogg; codecs=opus", sha256: createHash("sha256").update(ses).digest("base64") });
    await medyaGonder(n, tel, "document", { id: "2101", mime_type: "application/pdf", filename: "Tapu fotokopisi.pdf" });
    await medyaGonder(n, tel, "audio", { id: "2102", mime_type: "audio/ogg; codecs=opus" });
    expect(await medyalariIndir()).toMatchObject({ indirilen: 2 });
    const [belge, sesKaydi] = mesajlar(ctx, n, leadId).map((x) => x.medya!);
    expect(sesKaydi.mime).toBe("audio/ogg");

    const yb = await medyaIste(belge.id);
    expect(yb.headers.get("content-type")).toBe("application/pdf");
    expect(yb.headers.get("content-disposition")).toBe(`attachment; filename="Tapu fotokopisi.pdf"; filename*=UTF-8''Tapu%20fotokopisi.pdf`);
    const ys = await medyaIste(sesKaydi.id);
    expect(ys.headers.get("content-type")).toBe("audio/ogg");
    expect(ys.headers.get("content-disposition")).toMatch(/^attachment; filename="whatsapp-[0-9a-f]{8}\.ogg"/);
    expect(servis.mesajDto(mesajlar(ctx, n, leadId)[1]).medya).toMatchObject({ gorunum: "ses", boyut: 3000 });
  });

  it("video (MP4, 3GP) iner ve dosya olarak sunulur; parça (Range) isteği 206, karşılanamayan 416; 16 MB sınırı; başka video türü reddedilir", async () => {
    const { ctx, n, tel, leadId } = await alan("Video");
    const mp4 = Uint8Array.from({ length: 10_000 }, (_, i) => i % 251);
    const ucgp = icerik(4000, 9);
    const sinir = MEDYA_AZAMI_BAYT.video;
    expect(sinir).toBe(16 * 1024 * 1024);
    mockWhatsapp.medyalar.set("2201", { icerik: mp4, mime: "video/mp4" });
    mockWhatsapp.medyalar.set("2202", { icerik: ucgp, mime: "video/3gpp" });
    mockWhatsapp.medyalar.set("2203", { icerik: icerik(10), mime: "video/mp4", boyut: sinir + 1 });
    mockWhatsapp.medyalar.set("2204", { icerik: icerik(sinir + 1), mime: "video/mp4", boyut: 1000, sha256: null, akisBoyutu: null });
    mockWhatsapp.medyalar.set("2205", { icerik: icerik(10), mime: "video/quicktime" });
    await medyaGonder(n, tel, "video", { id: "2201", mime_type: "video/mp4", caption: "Daire turu" });
    await medyaGonder(n, tel, "video", { id: "2202", mime_type: "video/3gpp" });
    await medyaGonder(n, tel, "video", { id: "2203", mime_type: "video/mp4" });
    await medyaGonder(n, tel, "video", { id: "2204", mime_type: "video/mp4" });
    await medyaGonder(n, tel, "video", { id: "2205", mime_type: "video/quicktime" });
    expect(await medyalariIndir()).toMatchObject({ indirilen: 2, reddedilen: 3 });
    const [v, g, buyuk, yalanci, mov] = mesajlar(ctx, n, leadId).map((x) => x.medya!);
    expect(v).toMatchObject({ durum: "indirildi", mime: "video/mp4", boyut: 10_000 });
    expect(g).toMatchObject({ durum: "indirildi", mime: "video/3gpp" });
    expect(buyuk.neden).toBe("Dosya çok büyük (17 MB; sınır 16 MB); telefondan bakın");
    expect(yalanci.neden).toBe("Dosya çok büyük (sınır 16 MB); indirme kesildi, telefondan bakın");
    expect(mov).toMatchObject({ durum: "reddedildi", yol: null, neden: "Desteklenmeyen dosya türü (video/quicktime); telefondan bakın" });
    expect(servis.mesajDto(mesajlar(ctx, n, leadId)[0]).medya).toMatchObject({ durum: "indirildi", gorunum: "video", boyut: 10_000 });

    const y = await medyaIste(v.id);
    expect(y.status).toBe(200);
    expect(y.headers.get("content-type")).toBe("video/mp4");
    expect(y.headers.get("accept-ranges")).toBe("bytes");
    expect(y.headers.get("x-content-type-options")).toBe("nosniff");
    expect(y.headers.get("content-disposition")).toMatch(/^attachment; filename="whatsapp-[0-9a-f]{8}.mp4"/);
    expect(new Uint8Array(await y.arrayBuffer())).toEqual(mp4);
    expect((await medyaIste(g.id)).headers.get("content-disposition")).toMatch(/.3gp"/);

    const parca = async (range: string) =>
      medyaRotasi.GET(new Request(`https://crm.ornek.test/api/medya/${v.id}`, { headers: { range } }), { params: Promise.resolve({ id: v.id }) });
    const p = await parca("bytes=100-199");
    expect(p.status).toBe(206);
    expect(p.headers.get("content-range")).toBe("bytes 100-199/10000");
    expect(p.headers.get("content-length")).toBe("100");
    expect(p.headers.get("content-type")).toBe("video/mp4");
    expect(new Uint8Array(await p.arrayBuffer())).toEqual(mp4.slice(100, 200));
    const acik = await parca("bytes=9990-");
    expect(acik.headers.get("content-range")).toBe("bytes 9990-9999/10000");
    expect(new Uint8Array(await acik.arrayBuffer())).toEqual(mp4.slice(9990));
    const son = await parca("bytes=-5");
    expect(son.headers.get("content-range")).toBe("bytes 9995-9999/10000");
    expect(new Uint8Array(await son.arrayBuffer())).toEqual(mp4.slice(9995));
    const tasan = await parca("bytes=0-99999");
    expect(tasan.headers.get("content-range")).toBe("bytes 0-9999/10000");
    for (const kotu of ["bytes=10000-", "bytes=50-10", "bytes=-0", "items=0-5"]) {
      const k = await parca(kotu);
      expect(k.status, kotu).toBe(416);
      expect(k.headers.get("content-range")).toBe("bytes */10000");
    }
    // Çok parçalı istek desteklenmez: tüm dosya 200 ile gelir.
    expect((await parca("bytes=0-5,10-20")).status).toBe(200);
    // Başka çalışma alanı parça isteğiyle de erişemez.
    oturum.ctx = (await alan("Video yabanci")).ctx;
    expect((await parca("bytes=0-10")).status).toBe(404);
  });
});

describe("indirme kuralları", () => {
  it("Meta alanı dışındaki adres reddedilir ve hiç istenmez; SVG ve HTML reddedilir; özet uyuşmazsa dosya tutulmaz", async () => {
    expect(metaMedyaAdresiGecerli("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1")).toBe(true);
    expect(metaMedyaAdresiGecerli("https://mmg.whatsapp.net/v/t62/abc")).toBe(true);
    expect(metaMedyaAdresiGecerli("http://lookaside.fbsbx.com/x")).toBe(false);
    expect(metaMedyaAdresiGecerli("https://lookaside.fbsbx.com.saldirgan.test/x")).toBe(false);
    expect(metaMedyaAdresiGecerli("https://fbsbx.com@saldirgan.test/x")).toBe(false);
    expect(metaMedyaAdresiGecerli("https://lookaside.fbsbx.com:8443/x")).toBe(false);
    expect(metaMedyaAdresiGecerli("https://169.254.169.254/latest")).toBe(false);

    const { ctx, n, tel, leadId } = await alan("Kurallar");
    mockWhatsapp.medyalar.set("3001", { icerik: icerik(100), mime: "image/jpeg", url: "https://saldirgan.test/dosya.jpg" });
    mockWhatsapp.medyalar.set("3002", { icerik: new TextEncoder().encode("<svg onload=alert(1)>"), mime: "image/svg+xml" });
    mockWhatsapp.medyalar.set("3003", { icerik: new TextEncoder().encode("<script>"), mime: "text/html" });
    mockWhatsapp.medyalar.set("3004", { icerik: icerik(100), mime: "image/png", sha256: "0".repeat(64) });
    for (const id of ["3001", "3002"]) await medyaGonder(n, tel, "image", { id, mime_type: "image/jpeg" });
    await medyaGonder(n, tel, "document", { id: "3003", mime_type: "text/html", filename: "a.html" });
    await medyaGonder(n, tel, "image", { id: "3004", mime_type: "image/png" });

    expect(await medyalariIndir()).toEqual({ indirilen: 0, reddedilen: 4, hata: 0, bekletilen: 0 });
    const m = mesajlar(ctx, n, leadId).map((x) => x.medya!);
    expect(m.map((x) => [x.durum, x.neden, x.yol])).toEqual([
      ["reddedildi", "İndirme adresi Meta'nın alanında değil; indirilmedi", null],
      ["reddedildi", "Desteklenmeyen dosya türü (image/svg+xml); telefondan bakın", null],
      ["reddedildi", "Desteklenmeyen dosya türü (text/html); telefondan bakın", null],
      ["reddedildi", "Dosya doğrulanamadı (özet uyuşmuyor); indirilmedi", null],
    ]);
    // Yalnızca özeti uyuşmayan dosya indirildi (Meta adresinden); diskte hiçbir şey kalmadı.
    expect(mockWhatsapp.medyaIndirmeleri).toEqual(["https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=3004"]);
    expect(fs.readdirSync(path.join(medyaKlasoru(), ctx.tenantId), { recursive: true }).filter((d) => String(d).includes("."))).toEqual([]);
    for (const x of m) expect((await medyaIste(x.id)).status).toBe(404);
  });

  it("boyut sınırı: Meta büyük bildirirse hiç indirilmez; küçük bildirip fazlasını gönderirse indirme kesilir, yarım dosya silinir", async () => {
    const { ctx, n, tel, leadId } = await alan("Boyut");
    const sinir = MEDYA_AZAMI_BAYT.image;
    mockWhatsapp.medyalar.set("4001", { icerik: icerik(10), mime: "image/jpeg", boyut: sinir + 1 });
    // Bildirilen boyut küçük, Content-Length yok: sınır akış sırasında yakalanmalı.
    mockWhatsapp.medyalar.set("4002", { icerik: icerik(sinir + 1), mime: "image/jpeg", boyut: 1000, sha256: null, akisBoyutu: null });
    await medyaGonder(n, tel, "image", { id: "4001", mime_type: "image/jpeg" });
    await medyaGonder(n, tel, "image", { id: "4002", mime_type: "image/jpeg" });
    expect(await medyalariIndir()).toMatchObject({ reddedilen: 2, indirilen: 0 });
    const [buyuk, yalanci] = mesajlar(ctx, n, leadId).map((x) => x.medya!);
    expect(buyuk.neden).toBe("Dosya çok büyük (6 MB; sınır 5 MB); telefondan bakın");
    expect(yalanci.neden).toBe("Dosya çok büyük (sınır 5 MB); indirme kesildi, telefondan bakın");
    expect(mockWhatsapp.medyaIndirmeleri).toHaveLength(1);
    const kalan = fs.readdirSync(path.join(medyaKlasoru(), ctx.tenantId), { recursive: true }).filter((d) => String(d).match(/[0-9a-f-]{36}/));
    expect(kalan).toEqual([]);
  });

  it("geçici hata yeniden denenir (artan aralıkla), deneme hakkı bitince 'hata'; Meta'da yoksa (404) hemen 'hata'", async () => {
    const { ctx, n, tel, leadId } = await alan("Deneme");
    mockWhatsapp.medyalar.set("5001", { icerik: icerik(100), mime: "image/jpeg" });
    await medyaGonder(n, tel, "image", { id: "5001", mime_type: "image/jpeg" });
    let simdi = new Date();
    for (let i = 1; i < MEDYA_AZAMI_DENEME; i++) {
      mockWhatsapp.hata = new GraphHatasi("Service unavailable", 503);
      expect(await medyalariIndir({ simdi: () => simdi })).toMatchObject({ bekletilen: 1 });
      const m = sonMedya(ctx, n, leadId);
      expect(m).toMatchObject({ durum: "bekliyor", deneme: i, neden: "Yükleniyor (yeniden denenecek)" });
      expect(m.sonrakiDeneme!.getTime()).toBe(simdi.getTime() + 2 ** i * 60_000);
      // Sırası gelmeden alınmaz.
      expect(await medyalariIndir({ simdi: () => simdi })).toMatchObject({ bekletilen: 0, indirilen: 0 });
      simdi = new Date(m.sonrakiDeneme!.getTime());
    }
    mockWhatsapp.hata = new GraphHatasi("Service unavailable", 503);
    expect(await medyalariIndir({ simdi: () => simdi })).toMatchObject({ hata: 1 });
    expect(sonMedya(ctx, n, leadId)).toMatchObject({ durum: "hata", deneme: MEDYA_AZAMI_DENEME });
    expect(sonMedya(ctx, n, leadId).neden).toMatch(/^İndirilemedi \(5 deneme/);

    await medyaGonder(n, tel, "image", { id: "5999", mime_type: "image/jpeg" }); // Meta'da yok
    expect(await medyalariIndir({ simdi: () => simdi })).toMatchObject({ hata: 1 });
    expect(sonMedya(ctx, n, leadId)).toMatchObject({ durum: "hata", deneme: 0, neden: "Meta medyayı vermedi (HTTP 404); telefondan bakın" });
  });

  it("Meta'daki ömrü (7 gün) dolan medya indirilmez; kota doluysa medya bekler ve sonra indirilir", async () => {
    const { ctx, n, tel, leadId } = await alan("Kota");
    mockWhatsapp.medyalar.set("6001", { icerik: icerik(100), mime: "image/jpeg" });
    mockWhatsapp.medyalar.set("6002", { icerik: icerik(100), mime: "image/jpeg" });
    await medyaGonder(n, tel, "image", { id: "6001", mime_type: "image/jpeg" }, new Date(Date.now() - 2 * GUN));
    expect(await medyalariIndir({ simdi: () => new Date(Date.now() + 6 * GUN) })).toMatchObject({ hata: 1 });
    expect(sonMedya(ctx, n, leadId)).toMatchObject({ durum: "hata", neden: "Meta'daki süresi doldu (7 gün); telefondan bakın" });

    // Kotayı dolduran bir kayıt (diskte dosyası olmadan).
    await medyaGonder(n, tel, "image", { id: "6000", mime_type: "image/jpeg" });
    const dolu = sonMedya(ctx, n, leadId);
    db.$client.prepare("update sohbet_medyalari set durum = 'indirildi', boyut = ? where id = ?").run(MEDYA_KOTA_BAYT, dolu.id);
    await medyaGonder(n, tel, "image", { id: "6002", mime_type: "image/jpeg" });
    const simdi = new Date();
    expect(await medyalariIndir({ simdi: () => simdi })).toMatchObject({ bekletilen: 1 });
    expect(sonMedya(ctx, n, leadId)).toMatchObject({ durum: "bekliyor", deneme: 0, neden: "Medya için ayrılan disk alanı doldu" });
    expect(mockWhatsapp.medyaIndirmeleri).toEqual([]);
    expect(gk.medyaKullanimi(ctx).bayt).toBe(MEDYA_KOTA_BAYT);

    db.$client.prepare("update sohbet_medyalari set durum = 'silindi', boyut = null where id = ?").run(dolu.id);
    expect(await medyalariIndir({ simdi: () => new Date(simdi.getTime() + 3600_000) })).toMatchObject({ indirilen: 1 });
  });
});

describe("erişim", () => {
  it("başka çalışma alanının medyası 404, oturumsuz 401", async () => {
    const a = await alan("ErisimA");
    mockWhatsapp.medyalar.set("7001", { icerik: icerik(50), mime: "image/png" });
    await medyaGonder(a.n, a.tel, "image", { id: "7001", mime_type: "image/png" });
    await medyalariIndir();
    const m = sonMedya(a.ctx, a.n, a.leadId);
    expect((await medyaIste(m.id)).status).toBe(200);

    const b = await alan("ErisimB"); // oturum artık B'de
    expect((await medyaIste(m.id)).status).toBe(404);
    expect(gk.medyaGetir(b.ctx, m.id)).toBeNull();
    oturum.ctx = null;
    expect((await medyaIste(m.id)).status).toBe(401);
  });
});

describe("saklama ve bakım", () => {
  it("saklama süresi dolan dosya silinir (satır 'silindi', sohbette 'saklama süresi doldu'); sahipsiz dosya ve yarım indirme silinir, süren indirmeye dokunulmaz", async () => {
    const { ctx, n, tel, leadId } = await alan("Saklama");
    iletiAyarlariGuncelle(ctx, { medyaSaklamaGun: 30 });
    mockWhatsapp.medyalar.set("8001", { icerik: icerik(100), mime: "image/jpeg" });
    await medyaGonder(n, tel, "image", { id: "8001", mime_type: "image/jpeg" });
    await medyalariIndir();
    const m = sonMedya(ctx, n, leadId);
    const tam = medyaTamYolu(m.yol!);

    expect(medyaBakimi(new Date(Date.now() + 29 * GUN)).suresiDolan).toBe(0);
    expect(fs.existsSync(tam)).toBe(true);

    // Sahipsiz dosyalar: mesajı silinmiş medyanın dosyası ve yarım kalmış indirme (ikisi de eski); yeni bir yarım indirme.
    const klasor = path.dirname(tam);
    const sahipsiz = path.join(klasor, crypto.randomUUID());
    const yarim = path.join(klasor, `${crypto.randomUUID()}.part`);
    const suren = path.join(klasor, `${crypto.randomUUID()}.part`);
    for (const d of [sahipsiz, yarim, suren]) fs.writeFileSync(d, "x");
    const eski = new Date(Date.now() - 2 * 3600_000);
    fs.utimesSync(sahipsiz, eski, eski);
    fs.utimesSync(yarim, eski, eski);

    const sonuc = medyaBakimi(new Date(Date.now() + 31 * GUN));
    expect(sonuc.suresiDolan).toBe(1);
    expect(sonuc.artakalan).toBeGreaterThanOrEqual(2);
    expect([fs.existsSync(tam), fs.existsSync(sahipsiz), fs.existsSync(yarim), fs.existsSync(suren)]).toEqual([false, false, false, true]);
    fs.rmSync(suren);

    const sonra = sonMedya(ctx, n, leadId);
    expect(sonra).toMatchObject({ durum: "silindi", yol: null });
    expect(servis.mesajDto(mesajlar(ctx, n, leadId).at(-1)!).medya).toMatchObject({ durum: "silindi", neden: "Medya saklama süresi doldu" });
    expect((await medyaIste(m.id)).status).toBe(404);
  });

  it("kayıt silinince medya satırı da silinir; dosyası günlük bakımda sahipsiz olarak temizlenir", async () => {
    const { ctx, n, tel, leadId } = await alan("KayitSil");
    mockWhatsapp.medyalar.set("9001", { icerik: icerik(100), mime: "image/jpeg" });
    await medyaGonder(n, tel, "image", { id: "9001", mime_type: "image/jpeg" });
    await medyalariIndir();
    const m = sonMedya(ctx, n, leadId);
    const tam = medyaTamYolu(m.yol!);
    db.$client.prepare("delete from leads where id = ?").run(leadId);
    expect(gk.medyaGetir(ctx, m.id)).toBeNull();
    const eski = new Date(Date.now() - 2 * 3600_000);
    fs.utimesSync(tam, eski, eski);
    medyaBakimi();
    expect(fs.existsSync(tam)).toBe(false);
  });
});
