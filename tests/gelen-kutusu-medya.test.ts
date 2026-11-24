// Gelen kutusundan medya gönderme ve "Mesaja yanıtla": tür / boyut doğrulaması (içerikten; uzantısı değiştirilmiş dosya
// reddedilir), çoklu dosyada sıra ve açıklama, belge adının korunması (document.filename), context.message_id gövdesi
// (gerçek Graph istemcisi, sahte fetch), gelen yanıtın alıntısı, 24 saat kuralı, RET'li kişiye hizmet yanıtı, yetki ve
// izolasyon, medya kotası, Meta medya hataları ("başarısız" mesaj ve "Tekrar dene"), çift gönderim.
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kisileriEkle } = await import("@/server/repo/kayitlar");
const { olaylariListele } = await import("@/server/repo/olaylar");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const { whatsappIzniAyarla } = await import("@/server/repo/whatsapp-kisileri");
const { medyaKotaKullanimi } = await import("@/server/repo/sistem/medya");
const gk = await import("@/server/repo/gelen-kutusu");
const servis = await import("@/server/servisler/gelen-kutusu");
const { gidenMedyaDogrula } = await import("@/server/servisler/giden-medya");
const { medyaTamYolu } = await import("@/server/servisler/medya-dosyalari");
const wa = await import("@/server/servisler/whatsapp-api");
const { GraphHatasi } = await import("@/server/whatsapp-api");
const { gercekWhatsappIstemcisi } = await import("@/server/whatsapp-api/istemci");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const lib = await import("@/lib/gelen-kutusu");
const webhook = await import("@/app/api/whatsapp/webhook/[kimlik]/route");
const medyaRotasi = await import("@/app/api/sohbetler/[id]/medya/route");
const mesajRotasi = await import("@/app/api/sohbetler/[id]/mesaj/route");
const tekrarRotasi = await import("@/app/api/sohbetler/[id]/mesaj/[mesajId]/tekrar/route");
const sohbetRotasi = await import("@/app/api/sohbetler/[id]/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const U = "https://crm.ornek.test";
let sayac = 0;
let wamidSayac = 0;

beforeEach(() => {
  mockWhatsappSifirla();
  oturum.ctx = null;
});

// --- Örnek dosyalar (yalnızca imzaları ve kutuları gerçek) ---
const bayt = (...parcalar: (number[] | string)[]) =>
  new Uint8Array(parcalar.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : p)));
const dolgu = (n: number) => new Array(n).fill(0x20);
const JPEG = bayt([0xff, 0xd8, 0xff, 0xe0], dolgu(200));
const PNG = bayt([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], dolgu(200));
const PDF = bayt("%PDF-1.7\n", dolgu(200));
const EXE = bayt("MZ", [0x90, 0x00, 0x03], dolgu(200));
const mp4 = (marka: string, ...icerik: string[]) => bayt([0, 0, 0, 0x18], "ftyp", marka, [0, 0, 0, 0], "isommp42", "moov", ...icerik, dolgu(100));
const MP4 = mp4("isom", "trak", "vide", "avc1", "trak", "soun", "mp4a");
const DOCX = bayt([0x50, 0x4b, 0x03, 0x04], dolgu(26), "[Content_Types].xml", dolgu(40), "word/document.xml", dolgu(40));
const XLSX = bayt([0x50, 0x4b, 0x03, 0x04], dolgu(26), "[Content_Types].xml", dolgu(40), "xl/workbook.xml", dolgu(40));
const ZIP = bayt([0x50, 0x4b, 0x03, 0x04], dolgu(26), "fotograflar/a.jpg", dolgu(40));
const OLE = bayt([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], dolgu(200));

// --- Sohbet kurulumu (tests/gelen-kutusu.test.ts ile aynı düzen) ---
type Numara = { id: string; phoneId: string; waba: string; kimlik: string };

async function alan(ad: string, ek: { testModu?: boolean } = {}) {
  const { ctx, kullanici } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  const phoneId = String(830000 + ++sayac);
  const waba = String(430000 + sayac);
  const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad: "Merkez", wabaId: waba, phoneNumberId: phoneId, erisimAnahtari: "anahtar", appSecret: "app-secret" });
  db.$client
    .prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ?, kalite = 'GREEN', limit_katmani = 'TIER_10K', son_kontrol = ? where id = ?")
    .run(Date.now(), Date.now(), Date.now(), baglanti.id!);
  if (!ek.testModu) wa.testModuDegistir(ctx, baglanti.id!, false);
  const b = baglantiGetir(ctx, baglanti.id!)!;
  oturum.ctx = ctx;
  return { ctx, kullanici, n: { id: b.id, phoneId, waba, kimlik: b.webhookKimligi } as Numara };
}

async function bildirim(n: Numara, field: string, value: Record<string, unknown>) {
  const govde = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: n.waba, changes: [{ field, value: { messaging_product: "whatsapp", metadata: { phone_number_id: n.phoneId }, ...value } }] }] });
  const imza = `sha256=${createHmac("sha256", "app-secret").update(govde).digest("hex")}`;
  const y = await webhook.POST(new Request(`${U}/api/whatsapp/webhook/${n.kimlik}`, { method: "POST", headers: { "X-Hub-Signature-256": imza }, body: govde }), {
    params: Promise.resolve({ kimlik: n.kimlik }),
  });
  expect(y.status).toBe(200);
}

async function yaz(n: Numara, tel: string, metin: string, s: { zaman?: Date; ek?: Record<string, unknown> } = {}) {
  const wamid = `wamid.MGELEN${++wamidSayac}`;
  const ts = String(Math.floor((s.zaman ?? new Date()).getTime() / 1000));
  await bildirim(n, "messages", {
    contacts: [{ profile: { name: "Müşteri" }, wa_id: tel }],
    messages: [{ from: tel, id: wamid, timestamp: ts, type: "text", text: { body: metin }, ...s.ek }],
  });
  return wamid;
}

/** Kişi + pencere açık sohbet (kişi az önce yazdı). */
async function sohbet(ad: string, s: { zaman?: Date; testModu?: boolean } = {}) {
  const a = await alan(ad, s);
  const tel = `90532${String(3000000 + ++sayac)}`;
  const [k] = kisileriEkle(a.ctx, [{ kaynak: "elle", ekTelefon: `+${tel}`, isletmeAdi: `Kişi ${sayac}`, aliciTuru: "tacir_esnaf" }], "test");
  whatsappIzniAyarla(a.ctx, k.id, { izin: "var", kaynak: "form" });
  const gelenWamid = await yaz(a.n, tel, "Merhaba, katalog var mı?", { zaman: s.zaman });
  const sh = gk.sohbetBul(a.ctx, a.n.id, k.id)!;
  return { ...a, k, tel, sohbetId: sh.id, gelenWamid };
}

const p = (id: string) => ({ params: Promise.resolve({ id }) });
const kimlik = () => `istemci${crypto.randomUUID().replace(/-/g, "")}`;

function medyaIstegi(dosyaAdi: string, icerik: Uint8Array, alanlar: Record<string, string> = {}, origin = U) {
  const form = new FormData();
  form.set("dosya", new File([new Uint8Array(icerik)], dosyaAdi));
  form.set("istemciKimligi", alanlar.istemciKimligi ?? kimlik());
  for (const [k, v] of Object.entries(alanlar)) if (k !== "istemciKimligi") form.set(k, v);
  return new Request(`${U}/api/sohbetler/x/medya`, { method: "POST", headers: { Origin: origin }, body: form });
}
const medyaGonder = (sohbetId: string, ad: string, icerik: Uint8Array, alanlar: Record<string, string> = {}) =>
  medyaRotasi.POST(medyaIstegi(ad, icerik, alanlar), p(sohbetId));

type Sonuc = { mesaj: import("@/lib/gelen-kutusu").SohbetMesajiDto; tekrar: boolean; uyari: string | null };

describe("tür ve boyut doğrulaması", () => {
  it("içerik uzantıyla eşleşmeli: desteklenen türler geçer, uzantısı değiştirilmiş dosya reddedilir", () => {
    expect(gidenMedyaDogrula("vitrin.jpg", JPEG)).toMatchObject({ tur: "image", mime: "image/jpeg" });
    expect(gidenMedyaDogrula("Vitrin.PNG", PNG)).toMatchObject({ tur: "image", mime: "image/png" });
    expect(gidenMedyaDogrula("tanitim.mp4", MP4)).toMatchObject({ tur: "video", mime: "video/mp4" });
    expect(gidenMedyaDogrula("eski.3gp", mp4("3gp5", "avc1", "soun", "mp4a"))).toMatchObject({ tur: "video", mime: "video/3gpp" });
    expect(gidenMedyaDogrula("teklif.pdf", PDF)).toMatchObject({ tur: "document", mime: "application/pdf", dosyaAdi: "teklif.pdf" });
    expect(gidenMedyaDogrula("sozlesme.docx", DOCX).mime).toBe(lib.GIDEN_MEDYA_KURALLARI.document.uzantilar.docx);
    expect(gidenMedyaDogrula("fiyat.xlsx", XLSX).mime).toBe(lib.GIDEN_MEDYA_KURALLARI.document.uzantilar.xlsx);
    expect(gidenMedyaDogrula("eski.xls", OLE).mime).toBe("application/vnd.ms-excel");
    expect(gidenMedyaDogrula("not.txt", new Uint8Array(Buffer.from("Merhaba dünya\nİkinci satır", "utf8"))).mime).toBe("text/plain");

    const red = (ad: string, b: Uint8Array) => () => gidenMedyaDogrula(ad, b);
    expect(red("fatura.pdf", EXE)).toThrow(/içeriği uzantısıyla uyuşmuyor/); // .exe → .pdf
    expect(red("foto.jpg", PNG)).toThrow(/uyuşmuyor/); // PNG → .jpg
    expect(red("foto.png", PDF)).toThrow(/uyuşmuyor/);
    expect(red("sozlesme.docx", XLSX)).toThrow(/uyuşmuyor/); // Excel → .docx
    expect(red("arsiv.docx", ZIP)).toThrow(/uyuşmuyor/); // düz ZIP → .docx
    expect(red("not.txt", EXE)).toThrow(/uyuşmuyor/); // ikili dosya → .txt (NUL baytı)
    expect(red("video.mp4", mp4("3gp5", "avc1"))).toThrow(/uyuşmuyor/); // 3GP → .mp4
    expect(red("video.mp4", mp4("isom", "hvc1", "soun", "mp4a"))).toThrow(/H\.264/);
    expect(red("video.mp4", mp4("isom", "avc1", "soun", "samr"))).toThrow(/AAC/);
    expect(red("video.mp4", mp4("qt  ", "avc1"))).toThrow(/QuickTime/);
    expect(red("hareketli.gif", bayt("GIF89a", dolgu(50)))).toThrow(lib.DESTEKLENMEYEN_DOSYA_METNI);
    expect(red("uzantisiz", PDF)).toThrow(lib.DESTEKLENMEYEN_DOSYA_METNI);
    expect(red("bos.pdf", new Uint8Array(0))).toThrow(/boş/);
  });

  it("boyut sınırları (görsel 5 MB, video 16 MB, belge 20 MB) yüklemeden önce; tarayıcı ve sunucu aynı metni verir", () => {
    const MB = 1024 * 1024;
    expect(lib.gidenMedyaOnKontrol("a.jpg", 5 * MB)).toMatchObject({ tamam: true });
    expect(lib.gidenMedyaOnKontrol("a.jpg", 5 * MB + 1)).toEqual({ tamam: false, hata: "Görsel en fazla 5 MB olabilir (bu dosya 5.0 MB)." });
    expect(lib.gidenMedyaOnKontrol("a.mp4", 17 * MB)).toMatchObject({ tamam: false, hata: expect.stringContaining("Video en fazla 16 MB") });
    expect(lib.gidenMedyaOnKontrol("a.pdf", 20 * MB)).toMatchObject({ tamam: true });
    expect(lib.gidenMedyaOnKontrol("a.pdf", 21 * MB)).toMatchObject({ tamam: false, hata: expect.stringContaining("Belge en fazla 20 MB") });
    const buyuk = new Uint8Array(5 * MB + 10);
    buyuk.set(JPEG);
    expect(() => gidenMedyaDogrula("a.jpg", buyuk)).toThrow("Görsel en fazla 5 MB");
  });

  it("API: reddedilen dosya 400 ile döner, Meta'ya yüklenmez, diske yazılmaz", async () => {
    const { ctx, sohbetId } = await sohbet("MedyaRed");
    const once = medyaKotaKullanimi(ctx.tenantId);
    const y = await medyaGonder(sohbetId, "kampanya.pdf", EXE);
    expect(y.status).toBe(400);
    expect((await y.json()).hata).toMatch(/uyuşmuyor/);
    expect(mockWhatsapp.yuklemeDenemesi).toBe(0);
    expect(medyaKotaKullanimi(ctx.tenantId)).toBe(once);
    expect(gk.sohbetMesajlariGetir(ctx, sohbetId).filter((m) => m.yon === "giden")).toHaveLength(0);
  });
});

describe("gönderim", () => {
  it("görsel + açıklama: Meta'ya yüklenir, kimlikle gönderilir; dosya medya klasöründe, sohbette küçük resim; teslim tikleri işlenir", async () => {
    const { ctx, sohbetId, tel, n, k } = await sohbet("MedyaGorsel");
    const y = await medyaGonder(sohbetId, "vitrin.jpg", JPEG, { aciklama: "  Yeni vitrin  " });
    expect(y.status).toBe(201);
    const s = (await y.json()) as Sonuc;
    expect(s.uyari).toBeNull();
    expect(mockWhatsapp.medyaYuklemeleri).toMatchObject([{ phoneNumberId: n.phoneId, mime: "image/jpeg", dosyaAdi: "vitrin.jpg", boyut: JPEG.byteLength }]);
    expect(mockWhatsapp.medyaGonderimleri).toEqual([
      expect.objectContaining({ alici: { tur: "telefon", deger: tel }, tur: "image", medyaId: mockWhatsapp.medyaYuklemeleri[0].id, aciklama: "Yeni vitrin", dosyaAdi: null, yanitWamid: null }),
    ]);
    expect(s.mesaj).toMatchObject({ yon: "giden", kaynak: "temsilci", tur: "image", metin: "Yeni vitrin", teslimDurumu: "gonderildi", medya: { durum: "indirildi", gorunum: "gorsel" } });

    const satir = gk.medyaGetir(ctx, s.mesaj.medya!.id)!;
    expect(satir).toMatchObject({ mime: "image/jpeg", boyut: JPEG.byteLength, metaMedyaId: mockWhatsapp.medyaYuklemeleri[0].id, durum: "indirildi" });
    expect(fs.readFileSync(medyaTamYolu(satir.yol!))).toEqual(Buffer.from(JPEG));
    expect(medyaKotaKullanimi(ctx.tenantId)).toBe(JPEG.byteLength);
    expect(olaylariListele(ctx, k.id).some((o) => o.tur === "whatsapp_yanit" && o.aciklama?.includes("Fotoğraf"))).toBe(true);

    // Teslim / okundu bildirimi aynı mesaja işlenir.
    const wamid = mockWhatsapp.medyaGonderimleri[0].wamid;
    await bildirim(n, "messages", { statuses: [{ id: wamid, status: "delivered", recipient_id: tel }] });
    await bildirim(n, "messages", { statuses: [{ id: wamid, status: "read", recipient_id: tel }] });
    expect(gk.mesajSatiriGetir(ctx, s.mesaj.id)!.teslimDurumu).toBe("read");
  });

  it("çoklu dosya: her biri ayrı mesaj, gönderim sırasıyla; açıklama yalnızca ilkinde", async () => {
    const { ctx, sohbetId } = await sohbet("MedyaCoklu");
    for (const [ad, b, aciklama] of [["1.jpg", JPEG, "Daire fotoğrafları"], ["2.png", PNG, ""], ["3.mp4", MP4, ""], ["plan.pdf", PDF, ""]] as const) {
      expect((await medyaGonder(sohbetId, ad, b, aciklama ? { aciklama } : {})).status).toBe(201);
    }
    expect(mockWhatsapp.medyaGonderimleri.map((g) => [g.tur, g.aciklama ?? null])).toEqual([
      ["image", "Daire fotoğrafları"],
      ["image", null],
      ["video", null],
      ["document", null],
    ]);
    const gidenler = gk.sohbetMesajlariGetir(ctx, sohbetId).filter((m) => m.yon === "giden");
    expect(gidenler.map((m) => [m.tur, m.metin, m.medya?.dosyaAdi])).toEqual([
      ["image", "Daire fotoğrafları", "1.jpg"],
      ["image", null, "2.png"],
      ["video", null, "3.mp4"],
      ["document", null, "plan.pdf"],
    ]);
  });

  it("belge: dosya adı korunur (document.filename), açıklama eklenir; aynı istemci kimliği ikinci kez gönderilmez", async () => {
    const { sohbetId } = await sohbet("MedyaBelge");
    const ik = kimlik();
    const y = await medyaGonder(sohbetId, "Teklif — Ekim 2026.pdf", PDF, { istemciKimligi: ik, aciklama: "Teklifimiz ektedir" });
    expect(y.status).toBe(201);
    expect(mockWhatsapp.medyaGonderimleri[0]).toMatchObject({ tur: "document", dosyaAdi: "Teklif — Ekim 2026.pdf", aciklama: "Teklifimiz ektedir" });
    expect(mockWhatsapp.medyaYuklemeleri[0].dosyaAdi).toBe("Teklif — Ekim 2026.pdf");

    const ikinci = await medyaGonder(sohbetId, "Teklif — Ekim 2026.pdf", PDF, { istemciKimligi: ik });
    expect(ikinci.status).toBe(200);
    expect(((await ikinci.json()) as Sonuc).tekrar).toBe(true);
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(1);
    expect(mockWhatsapp.medyaGonderimleri).toHaveLength(1);
  });

  it("açıklama en fazla 1024 karakter", async () => {
    const { sohbetId } = await sohbet("MedyaAciklama");
    expect((await medyaGonder(sohbetId, "a.jpg", JPEG, { aciklama: "x".repeat(1025) })).status).toBe(400);
    expect((await medyaGonder(sohbetId, "a.jpg", JPEG, { aciklama: "x".repeat(1024) })).status).toBe(201);
  });
});

describe("Graph istemcisi gövdesi (sahte fetch)", () => {
  it("medya: type, kimlik, caption, document.filename ve context.message_id; metin yanıtında context.message_id", async () => {
    const istekler: { url: string; govde: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: URL, secenek: RequestInit) => {
      istekler.push({ url: String(url), govde: JSON.parse(String(secenek.body)) });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.G${istekler.length}` }] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const i = gercekWhatsappIstemcisi({ wabaId: "123456", phoneNumberId: "654321", erisimAnahtari: "anahtar" });
      const alici = { tur: "telefon" as const, deger: "905320000000" };
      await i.medyaGonder({ alici, tur: "document", medyaId: "777", aciklama: "Teklif", dosyaAdi: "Teklif.pdf", yanitWamid: "wamid.ONCEKI" });
      await i.medyaGonder({ alici, tur: "image", medyaId: "778", aciklama: null, dosyaAdi: "yok-sayilir.jpg" });
      await i.metinGonder({ alici, metin: "Evet, var.", yanitWamid: "wamid.SORU" });
      await i.metinGonder({ alici, metin: "Alıntısız" });
      expect(istekler.map((x) => x.url)).toEqual(Array(4).fill("https://graph.facebook.com/v26.0/654321/messages"));
      expect(istekler[0].govde).toEqual({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "905320000000",
        context: { message_id: "wamid.ONCEKI" },
        type: "document",
        document: { id: "777", caption: "Teklif", filename: "Teklif.pdf" },
      });
      expect(istekler[1].govde).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", to: "905320000000", type: "image", image: { id: "778" } });
      expect(istekler[2].govde).toMatchObject({ context: { message_id: "wamid.SORU" }, type: "text", text: { body: "Evet, var." } });
      expect(istekler[3].govde).not.toHaveProperty("context");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Mesaja yanıtla", () => {
  it("giden yanıt context.message_id ile gider ve alıntıyı taşır; gelen yanıtın context'i işlenir; başka sohbetin mesajı yanıtlanamaz", async () => {
    const { ctx, sohbetId, gelenWamid, n, tel } = await sohbet("Yanitla");
    const gelen = gk.sohbetMesajlariGetir(ctx, sohbetId).find((m) => m.wamid === gelenWamid)!;

    const y = await mesajRotasi.POST(
      new Request(`${U}/api/x`, { method: "POST", headers: { "Content-Type": "application/json", Origin: U }, body: JSON.stringify({ tur: "metin", metin: "Evet, ekte.", yanitlananId: gelen.id, istemciKimligi: kimlik() }) }),
      p(sohbetId),
    );
    expect(y.status).toBe(201);
    expect(mockWhatsapp.metinler[0]).toMatchObject({ metin: "Evet, ekte.", yanitWamid: gelenWamid });
    const giden = ((await y.json()) as Sonuc).mesaj;
    expect(giden.yanit).toEqual({ id: gelen.id, yon: "gelen", ozet: "Merhaba, katalog var mı?" });

    // Medya da yanıt olabilir.
    await medyaGonder(sohbetId, "katalog.pdf", PDF, { yanitlananId: gelen.id });
    expect(mockWhatsapp.medyaGonderimleri[0].yanitWamid).toBe(gelenWamid);

    // Müşteri bizim mesajımıza WhatsApp'ta "Yanıtla" ile cevap verir.
    const gidenWamid = mockWhatsapp.metinler[0].wamid;
    await yaz(n, tel, "Teşekkürler", { ek: { context: { from: n.phoneId, id: gidenWamid } } });
    const ayrinti = await (await sohbetRotasi.GET(new Request(`${U}/api/x`), p(sohbetId))).json();
    const cevap = ayrinti.mesajlar.find((m: { metin: string }) => m.metin === "Teşekkürler");
    expect(cevap.yanit).toEqual({ id: giden.id, yon: "giden", ozet: "Evet, ekte." });
    // Bilinmeyen iletiye yanıt (ör. telefondan gönderilmiş): alıntı kutusu yine görünür.
    await yaz(n, tel, "Bu ne?", { ek: { context: { id: "wamid.BILINMEYEN" } } });
    const bilinmeyen = gk.sohbetMesajlariGetir(ctx, sohbetId).find((m) => m.metin === "Bu ne?")!;
    expect(servis.mesajDto(bilinmeyen).yanit).toEqual({ id: null, yon: null, ozet: "Önceki bir mesaj" });

    // Başka sohbetin (başka kişinin) mesajı yanıtlanamaz.
    const tel2 = `90532${String(3900000 + ++sayac)}`;
    const [k2] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: `+${tel2}`, isletmeAdi: "İkinci", aliciTuru: "tacir_esnaf" }], "test");
    await yaz(n, tel2, "Selam");
    const ikinciSohbet = gk.sohbetBul(ctx, n.id, k2.id)!;
    const r = await medyaGonder(ikinciSohbet.id, "a.jpg", JPEG, { yanitlananId: gelen.id });
    expect(r.status).toBe(400);
    expect((await r.json()).hata).toMatch(/Yanıtlanan mesaj bulunamadı/);
  });
});

describe("kurallar", () => {
  it("24 saat penceresi kapalıysa medya gönderilmez (metinle aynı mesaj); dosya yüklenmez", async () => {
    const { ctx, sohbetId } = await sohbet("MedyaPencere", { zaman: new Date(Date.now() - 25 * 3_600_000) });
    const y = await medyaGonder(sohbetId, "a.jpg", JPEG);
    expect(y.status).toBe(400);
    expect((await y.json()).hata).toBe("24 saatlik pencere kapalı: serbest metin gönderilemez, onaylı bir şablon seçin.");
    expect(mockWhatsapp.yuklemeDenemesi).toBe(0);
    expect(medyaKotaKullanimi(ctx.tenantId)).toBe(0);
  });

  it("RET veren kişi pencere içinde yazdıysa yanıt (medya dahil) serbest; olay 'RET'li kişiye hizmet yanıtı'", async () => {
    const { ctx, k, n, tel, sohbetId } = await sohbet("MedyaRet");
    await yaz(n, tel, "RET");
    const y = await medyaGonder(sohbetId, "onay.pdf", PDF);
    expect(y.status).toBe(201);
    expect(olaylariListele(ctx, k.id).some((o) => o.aciklama?.startsWith("RET'li kişiye hizmet yanıtı") && o.aciklama.includes("Belge"))).toBe(true);
  });

  it("yetki ve izolasyon: oturumsuz 401, başka kaynak 403, başka çalışma alanının sohbeti ve mesajı 404", async () => {
    const a = await sohbet("MedyaA");
    const b = await alan("MedyaB");
    oturum.ctx = null;
    expect((await medyaGonder(a.sohbetId, "a.jpg", JPEG)).status).toBe(401);
    oturum.ctx = a.ctx;
    expect((await medyaRotasi.POST(medyaIstegi("a.jpg", JPEG, {}, "https://kotu.ornek.test"), p(a.sohbetId))).status).toBe(403);
    oturum.ctx = b.ctx;
    expect((await medyaGonder(a.sohbetId, "a.jpg", JPEG)).status).toBe(404);

    // A'da başarısız bir medya mesajı: B yeniden deneyemez.
    oturum.ctx = a.ctx;
    mockWhatsapp.medyaGonderimHatasi = new GraphHatasi("(#131053) Media upload error", 400, 131053);
    const hatali = ((await (await medyaGonder(a.sohbetId, "a.jpg", JPEG)).json()) as Sonuc).mesaj;
    oturum.ctx = b.ctx;
    const tekrar = await tekrarRotasi.POST(new Request(`${U}/api/x`, { method: "POST", headers: { Origin: U } }), {
      params: Promise.resolve({ id: a.sohbetId, mesajId: hatali.id }),
    });
    expect(tekrar.status).toBe(404);
    expect(mockWhatsapp.medyaGonderimleri).toHaveLength(0);
    expect(gk.sohbetMesajlariGetir(b.ctx, a.sohbetId)).toEqual([]);
  });

  it("medya kotası doluysa gönderilmez (409), Meta'ya yüklenmez", async () => {
    const { ctx, sohbetId } = await sohbet("MedyaKota");
    db.$client
      .prepare("insert into sohbet_medyalari (id, tenant_id, mesaj_id, boyut, durum, yol) values (?, ?, null, ?, 'indirildi', ?)")
      .run(crypto.randomUUID(), ctx.tenantId, lib.MEDYA_KOTA_BAYT - 100, `${ctx.tenantId}/2026-01/dolu`);
    const y = await medyaGonder(sohbetId, "a.jpg", JPEG);
    expect(y.status).toBe(409);
    expect((await y.json()).hata).toBe(servis.MEDYA_KOTASI_DOLU);
    expect(mockWhatsapp.yuklemeDenemesi).toBe(0);
  });
});

describe("Meta medya hataları ve Tekrar dene", () => {
  it("131053: mesaj 'başarısız' ve Türkçe nedenle yazılır; Tekrar dene aynı dosyayla aynı mesajı gönderir", async () => {
    const { ctx, sohbetId } = await sohbet("MedyaHata");
    mockWhatsapp.medyaGonderimHatasi = new GraphHatasi("(#131053) Media upload error", 400, 131053);
    const y = await medyaGonder(sohbetId, "tur.mp4", MP4, { aciklama: "Sanal tur" });
    expect(y.status).toBe(201);
    const s = (await y.json()) as Sonuc;
    expect(s.uyari).toBe(lib.medyaGonderimHataMetni(131053));
    expect(s.mesaj).toMatchObject({ teslimDurumu: "failed", teslimHataKodu: 131053, hataMetni: lib.medyaGonderimHataMetni(131053), tekrarDenenebilir: true, metin: "Sanal tur" });

    const t = await tekrarRotasi.POST(new Request(`${U}/api/x`, { method: "POST", headers: { Origin: U } }), {
      params: Promise.resolve({ id: sohbetId, mesajId: s.mesaj.id }),
    });
    expect(t.status).toBe(200);
    const ts = (await t.json()) as Sonuc;
    expect(ts.mesaj).toMatchObject({ id: s.mesaj.id, teslimDurumu: "gonderildi", hataMetni: null, tekrarDenenebilir: false });
    expect(mockWhatsapp.medyaYuklemeleri).toHaveLength(2); // her denemede yeniden yüklenir
    expect(mockWhatsapp.medyaGonderimleri).toEqual([expect.objectContaining({ tur: "video", aciklama: "Sanal tur" })]);
    expect(gk.mesajSatiriGetir(ctx, s.mesaj.id)!.wamid).toBe(mockWhatsapp.medyaGonderimleri[0].wamid);
    expect(gk.sohbetMesajlariGetir(ctx, sohbetId).filter((m) => m.yon === "giden")).toHaveLength(1);

    // Gönderilmiş mesaj yeniden denenemez.
    const yine = await tekrarRotasi.POST(new Request(`${U}/api/x`, { method: "POST", headers: { Origin: U } }), {
      params: Promise.resolve({ id: sohbetId, mesajId: s.mesaj.id }),
    });
    expect(yine.status).toBe(409);
  });

  it("yükleme reddi: mesaj başarısız, anlaşılır neden; geçici yükleme hatası da tekrar denenebilir", async () => {
    const { sohbetId } = await sohbet("MedyaYukleme");
    mockWhatsapp.yuklemeHatasi = new GraphHatasi("(#100) Param file must be a file with one of the following types", 400, 100);
    const s = (await (await medyaGonder(sohbetId, "a.png", PNG)).json()) as Sonuc;
    expect(s.mesaj).toMatchObject({ teslimDurumu: "failed", tekrarDenenebilir: true });
    expect(s.mesaj.hataMetni).toMatch(/^Meta dosyayı kabul etmedi \(yükleme reddedildi\)/);

    mockWhatsapp.yuklemeHatasi = new GraphHatasi("Meta'ya ulaşılamadı: zaman aşımı", 0);
    const g = (await (await medyaGonder(sohbetId, "b.png", PNG)).json()) as Sonuc;
    expect(g.mesaj).toMatchObject({ teslimDurumu: "failed", tekrarDenenebilir: true, hataMetni: expect.stringContaining("yüklenemedi") });
    expect(mockWhatsapp.medyaGonderimleri).toHaveLength(0);
  });

  it("gönderimde zaman aşımı: sonuç belirsiz, tekrar denenmez; teslim bildirimindeki 131052 Türkçe metne eşlenir", async () => {
    const { ctx, sohbetId, n, tel } = await sohbet("MedyaBelirsiz");
    mockWhatsapp.medyaGonderimHatasi = new GraphHatasi("Meta'ya ulaşılamadı: zaman aşımı", 0);
    const b = (await (await medyaGonder(sohbetId, "a.jpg", JPEG)).json()) as Sonuc;
    expect(b.mesaj).toMatchObject({ teslimDurumu: "belirsiz", tekrarDenenebilir: false });
    expect(b.uyari).toMatch(/gitmiş de olabilir/);

    const s = (await (await medyaGonder(sohbetId, "b.jpg", JPEG)).json()) as Sonuc;
    await bildirim(n, "messages", { statuses: [{ id: mockWhatsapp.medyaGonderimleri[0].wamid, status: "failed", recipient_id: tel, errors: [{ code: 131052 }] }] });
    const m = servis.mesajDto(gk.mesajSatiriGetir(ctx, s.mesaj.id)!);
    expect(m).toMatchObject({ teslimDurumu: "failed", hataMetni: lib.medyaGonderimHataMetni(131052), tekrarDenenebilir: true });
  });
});
