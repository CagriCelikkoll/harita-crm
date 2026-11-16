// Gelen kutusu (plan-mesajlasma-v2 B1, B10): gelen ileti sohbete ve mesaja düşer; RET önce işlenir; RET'li ve izinsiz
// kişiye pencere içinde elle metin gider, şablon gitmez (K4, B3); bilinmeyen numara izinsiz kayıt açar ve kampanya
// almaz; 24 saat penceresi; kampanya mesajı sohbete düşer ve teslim durumu iki yere yazılır; okundu bildirimi bir kez;
// değişiklik ucu (kısa yoklama); atama ve iç notlar; test modu ve hesap kilidi; çift gönderim; belirsiz sonuç; saklama.
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kayitGetir, kayitlariListele, kisileriEkle } = await import("@/server/repo/kayitlar");
const { olaylariListele } = await import("@/server/repo/olaylar");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const { sablonlariListele } = await import("@/server/repo/whatsapp-sablonlari");
const { whatsappIzniAyarla, whatsappKisisiGetir } = await import("@/server/repo/whatsapp-kisileri");
const gk = await import("@/server/repo/gelen-kutusu");
const { temizlikYap } = await import("@/server/repo/sistem/bakim");
const { isciTuru } = await import("@/server/servisler/isci");
const { KampanyaGirdisi, kampanyaBaslat } = await import("@/server/servisler/kampanya");
const servis = await import("@/server/servisler/gelen-kutusu");
const wa = await import("@/server/servisler/whatsapp-api");
const { GraphHatasi } = await import("@/server/whatsapp-api");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const webhook = await import("@/app/api/whatsapp/webhook/[kimlik]/route");
const listeRotasi = await import("@/app/api/sohbetler/route");
const sohbetRotasi = await import("@/app/api/sohbetler/[id]/route");
const mesajRotasi = await import("@/app/api/sohbetler/[id]/mesaj/route");
const okunduRotasi = await import("@/app/api/sohbetler/[id]/okundu/route");
const notRotasi = await import("@/app/api/sohbetler/[id]/notlar/route");
const degisiklikRotasi = await import("@/app/api/gelen-kutusu/degisiklikler/route");
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");

const U = "https://crm.ornek.test";
const SAAT = 3_600_000;
let sayac = 0;
let wamidSayac = 0;

beforeEach(() => {
  mockWhatsappSifirla();
  oturum.ctx = null;
});

type Numara = { id: string; phoneId: string; waba: string; kimlik: string };

/** Yönetici, ticari ileti ayarları tam, bir numara (test modu kapalı, webhook ve kalite hazır). */
async function alan(ad: string, ek: { testModu?: boolean; waba?: string } = {}) {
  const { ctx, kullanici } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  const n = await numaraEkle(ctx, "Merkez", ek.waba ?? String(400000 + ++sayac));
  if (!ek.testModu) wa.testModuDegistir(ctx, n.id, false);
  oturum.ctx = ctx;
  return { ctx, kullanici, n };
}

async function numaraEkle(ctx: TenantContext, ad: string, waba: string): Promise<Numara> {
  const phoneId = String(820000 + ++sayac);
  const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad, wabaId: waba, phoneNumberId: phoneId, erisimAnahtari: "anahtar", appSecret: "app-secret" });
  db.$client
    .prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ?, kalite = 'GREEN', limit_katmani = 'TIER_10K', son_kontrol = ? where id = ?")
    .run(Date.now(), Date.now(), Date.now(), baglanti.id!);
  await wa.sablonlariSenkronizeEt(ctx, baglanti.id!);
  const b = baglantiGetir(ctx, baglanti.id!)!;
  return { id: b.id, phoneId, waba, kimlik: b.webhookKimligi };
}

async function bildirim(n: Numara, field: string, value: Record<string, unknown>) {
  const govde = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: n.waba, changes: [{ field, value: { messaging_product: "whatsapp", metadata: { phone_number_id: n.phoneId }, ...value } }] }] });
  const imza = `sha256=${createHmac("sha256", "app-secret").update(govde).digest("hex")}`;
  const y = await webhook.POST(new Request(`${U}/api/whatsapp/webhook/${n.kimlik}`, { method: "POST", headers: { "X-Hub-Signature-256": imza }, body: govde }), {
    params: Promise.resolve({ kimlik: n.kimlik }),
  });
  expect(y.status).toBe(200);
}

/** Müşteri bu numaraya yazar. zaman: Meta'nın bildirdiği yazılma anı (varsayılan şimdi). */
async function yaz(n: Numara, tel: string, metin: string, s: { zaman?: Date; wamid?: string; ad?: string; ek?: Record<string, unknown> } = {}) {
  const wamid = s.wamid ?? `wamid.GELEN${++wamidSayac}`;
  const ts = String(Math.floor((s.zaman ?? new Date()).getTime() / 1000));
  await bildirim(n, "messages", {
    contacts: [{ profile: { name: s.ad ?? "Müşteri" }, wa_id: tel }],
    messages: [{ from: tel, id: wamid, timestamp: ts, type: "text", text: { body: metin }, ...s.ek }],
  });
  return wamid;
}

function kisi(ctx: TenantContext, tel: string, izin: "var" | "yok" = "var", aliciTuru: "tacir_esnaf" | "bireysel" = "tacir_esnaf") {
  const son4 = tel.replace(/\D/g, "").slice(-4);
  const [k] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: tel, isletmeAdi: `Kişi ${son4}`, aliciTuru, etiketler: [`e${son4}`] }], "test");
  if (izin === "var") whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form" });
  return k;
}

const sohbetiBul = (ctx: TenantContext, n: Numara, leadId: string) => gk.sohbetBul(ctx, n.id, leadId)!;
const istek = (method: string, govde?: unknown) =>
  new Request(`${U}/api/x`, { method, headers: { "Content-Type": "application/json", Origin: U }, body: govde === undefined ? undefined : JSON.stringify(govde) });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const kimlik = () => `istemci-${crypto.randomUUID()}`;
const metinGonder = (id: string, metin: string, istemciKimligi = kimlik()) => mesajRotasi.POST(istek("POST", { tur: "metin", metin, istemciKimligi }), p(id));
const sablonGonder = (id: string, sablonId: string, degiskenler: Record<string, string> = {}) =>
  mesajRotasi.POST(istek("POST", { tur: "sablon", sablonId, degiskenler, istemciKimligi: kimlik() }), p(id));
const sablon = (ctx: TenantContext, n: Numara, ad = "randevu_hatirlatma") => sablonlariListele(ctx, n.waba).find((s) => s.ad === ad)!;
const RANDEVU = { "body:ad": "Ayşe", "body:tarih": "Pazartesi" };

describe("gelen ileti", () => {
  it("sohbet ve mesaj oluşur, okunmamış artar, aynı wamid ikinci kez yazılmaz, kapalı sohbet yeni mesajla açılır", async () => {
    const { ctx, n } = await alan("Gelen");
    const k = kisi(ctx, "0532 100 00 01");
    const w = await yaz(n, "905321000001", "Merhaba, fiyat nedir?");
    await yaz(n, "905321000001", "Merhaba, fiyat nedir?", { wamid: w }); // Meta'nın tekrarı
    const s = sohbetiBul(ctx, n, k.id);
    expect(s).toMatchObject({ durum: "acik", okunmamis: 1 });
    expect(gk.sohbetMesajlariGetir(ctx, s.id).map((m) => [m.yon, m.kaynak, m.tur, m.metin])).toEqual([["gelen", "musteri", "text", "Merhaba, fiyat nedir?"]]);

    gk.sohbetGuncelle(ctx, s.id, { durum: "kapali" });
    await yaz(n, "905321000001", "Orada mısınız?");
    expect(gk.sohbetGetir(ctx, s.id)).toMatchObject({ durum: "acik", okunmamis: 2 });
    expect(olaylariListele(ctx, k.id).filter((o) => o.tur === "whatsapp_gelen")).toHaveLength(2);
  });

  it("medya: B1'de içerik indirilmez, başlık ve medya kimliği yazılır; konum metne çevrilir", async () => {
    const { ctx, n } = await alan("Medya");
    const k = kisi(ctx, "0532 100 00 02");
    await bildirim(n, "messages", {
      contacts: [{ profile: { name: "X" }, wa_id: "905321000002" }],
      messages: [
        { from: "905321000002", id: "wamid.M1", type: "image", image: { id: "medya-1", caption: "Daire fotoğrafı", mime_type: "image/jpeg" } },
        { from: "905321000002", id: "wamid.M2", type: "location", location: { latitude: 41.01, longitude: 29.02, name: "Ofis" } },
      ],
    });
    const m = gk.sohbetMesajlariGetir(ctx, sohbetiBul(ctx, n, k.id).id);
    expect(m.map((x) => [x.tur, x.metin, x.medyaId])).toEqual([
      ["image", "Daire fotoğrafı", "medya-1"],
      ["location", "Ofis (41.01, 29.02)", null],
    ]);
  });
});

describe("RET ve izin (K4, B3)", () => {
  it("RET önce engel listesine, sonra sohbete; pencere içinde elle metin gider (uyarılı olay), şablon her durumda 403, pencere dışında metin 400; kampanya gitmez", async () => {
    const { ctx, n } = await alan("Ret");
    const k = kisi(ctx, "0532 200 00 01");
    await yaz(n, "905322000001", "RET");
    expect(kayitGetir(ctx, k.id)?.iletiIzni).toBe("ret");
    expect(whatsappKisisiGetir(ctx, k.id)?.izin).toBe("ret");
    const s = sohbetiBul(ctx, n, k.id);
    expect(gk.sohbetMesajlariGetir(ctx, s.id).map((m) => m.metin)).toEqual(["RET"]);

    const ayrinti = await (await sohbetRotasi.GET(istek("GET"), p(s.id))).json();
    expect(ayrinti.sohbet).toMatchObject({ retVerdi: true, izin: "ret" });

    const y = await metinGonder(s.id, "Talebiniz alındı, sizi listeden çıkardık.");
    expect(y.status).toBe(201);
    expect(mockWhatsapp.metinler.map((m) => [m.alici.deger, m.metin])).toEqual([["905322000001", "Talebiniz alındı, sizi listeden çıkardık."]]);
    expect(olaylariListele(ctx, k.id).some((o) => o.tur === "whatsapp_yanit" && o.aciklama?.startsWith("RET'li kişiye hizmet yanıtı"))).toBe(true);

    // Şablon (pazarlama ya da hizmet) RET'li kişiye hiçbir koşulda gitmez.
    for (const ad of ["randevu_hatirlatma", "butonsuz_pazarlama"]) {
      const r = await sablonGonder(s.id, sablon(ctx, n, ad).id, RANDEVU);
      expect(r.status, ad).toBe(403);
    }
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);

    // Pencere dışında serbest metin de gitmez.
    await expect(
      servis.sohbetMesajiGonder(ctx, s.id, { tur: "metin", metin: "x", istemciKimligi: kimlik() }, new Date(Date.now() + 24 * SAAT + 1000)),
    ).rejects.toMatchObject({ durum: 400, message: expect.stringContaining("RET verdi") });

    // Kampanya: alıcı kuralları "ret" der; kampanya hiç oluşmaz, Meta'ya hiçbir şey gitmez.
    const ozet = (await import("@/server/servisler/kampanya")).kampanyaOzeti(
      ctx,
      KampanyaGirdisi.parse({
        kanal: "whatsapp_api",
        ad: "K",
        filtre: { etiket: "e0001" },
        testModu: false,
        baglantiId: n.id,
        sablonId: sablon(ctx, n).id,
        degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "A" }, "body:tarih": { kaynak: "sabit", deger: "B" } },
      }),
    );
    expect(ozet).toMatchObject({ gonderilecek: 0, haricler: { ret: 1 } });
    expect(() => kampanyaBaslat(
      ctx,
      KampanyaGirdisi.parse({
        kanal: "whatsapp_api",
        ad: "K",
        filtre: { etiket: "e0001" },
        testModu: false,
        baglantiId: n.id,
        sablonId: sablon(ctx, n).id,
        degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "A" }, "body:tarih": { kaynak: "sabit", deger: "B" } },
      }),
    )).toThrow(/Kurallara uyan alıcı yok/);
    await isciTuru({ parti: 50, whatsappAralikMs: 0 });
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
  });

  it("izni olmayan kişi kendisi yazdıysa pencere içinde elle metin gider; şablon için izin kuralı aynen (403)", async () => {
    const { ctx, n } = await alan("Izinsiz");
    const k = kisi(ctx, "0532 200 00 02", "yok");
    await yaz(n, "905322000002", "Bilgi alabilir miyim?");
    const s = sohbetiBul(ctx, n, k.id);
    expect((await metinGonder(s.id, "Tabii, yardımcı olayım.")).status).toBe(201);
    const r = await sablonGonder(s.id, sablon(ctx, n).id, RANDEVU);
    expect(r.status).toBe(403);
    expect((await r.json()).hata).toMatch(/WhatsApp izni/);
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(olaylariListele(ctx, k.id).some((o) => o.aciklama?.startsWith("WhatsApp yanıtı gönderildi (Merkez numarası)"))).toBe(true);
  });

  it("bilinmeyen numara: 'whatsapp_gelen' kaydı, izin yok, bireysel; sohbet açılır, elle yanıt gider; kampanyaya girmez", async () => {
    const { ctx, n } = await alan("Bilinmeyen");
    await yaz(n, "905323000009", "Merhaba, ilanınızı gördüm", { ad: "Ali Veli" });
    const [k] = kayitlariListele(ctx).kayitlar;
    expect(k).toMatchObject({ kaynak: "whatsapp_gelen", yetkiliAdi: "Ali Veli", aliciTuru: "bireysel", telefonE164: "905323000009" });
    expect(whatsappKisisiGetir(ctx, k.id)?.izin).toBe("yok");
    expect(olaylariListele(ctx, k.id).some((o) => o.aciklama === "Müşteri WhatsApp'tan kendisi yazdı (Merkez numarası)")).toBe(true);
    const s = sohbetiBul(ctx, n, k.id);
    expect((await metinGonder(s.id, "Hoş geldiniz")).status).toBe(201);
    // Kampanya özeti: alıcı kuralları "WhatsApp izni yok" der.
    const { kampanyaOzeti } = await import("@/server/servisler/kampanya");
    const ozet = kampanyaOzeti(
      ctx,
      KampanyaGirdisi.parse({
        kanal: "whatsapp_api",
        ad: "K",
        filtre: {},
        testModu: false,
        baglantiId: n.id,
        sablonId: sablon(ctx, n).id,
        degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "A" }, "body:tarih": { kaynak: "sabit", deger: "B" } },
      }),
    );
    expect(ozet).toMatchObject({ gonderilecek: 0, haricler: { whatsapp_izni_yok: 1 } });
  });
});

describe("24 saat penceresi ve şablon", () => {
  it("23 sa 59 dk'da metin gider, 24 saat 1 sn'de 400; pencere dışında izinli kişiye şablon gider; başka WABA'nın şablonu 400", async () => {
    const { ctx, n } = await alan("Pencere");
    const n2 = await numaraEkle(ctx, "Şube", "499999");
    await wa.sablonlariSenkronizeEt(ctx, n2.id);
    const k = kisi(ctx, "0532 300 00 01");
    const yazildi = new Date(Date.now() - 60_000);
    await yaz(n, "905323000001", "Selam", { zaman: yazildi });
    const s = sohbetiBul(ctx, n, k.id);
    const gonder = (simdi: Date) => servis.sohbetMesajiGonder(ctx, s.id, { tur: "metin", metin: "Yanıt", istemciKimligi: kimlik() }, simdi);
    await expect(gonder(new Date(yazildi.getTime() + 24 * SAAT - 60_000))).resolves.toMatchObject({ tekrar: false });
    await expect(gonder(new Date(yazildi.getTime() + 24 * SAAT + 1000))).rejects.toMatchObject({ durum: 400, message: expect.stringContaining("pencere kapalı") });

    const sonra = new Date(yazildi.getTime() + 30 * SAAT);
    const r = await servis.sohbetMesajiGonder(ctx, s.id, { tur: "sablon", sablonId: sablon(ctx, n).id, degiskenler: RANDEVU, istemciKimligi: kimlik() }, sonra);
    expect(r.mesaj).toMatchObject({ tur: "template", kaynak: "temsilci", metin: "Sayın Ayşe, randevunuz Pazartesi." });
    expect(mockWhatsapp.gonderilenler.map((g) => g.sablonAdi)).toEqual(["randevu_hatirlatma"]);

    const baskaWaba = sablonlariListele(ctx, "499999")[0];
    await expect(
      servis.sohbetMesajiGonder(ctx, s.id, { tur: "sablon", sablonId: baskaWaba.id, degiskenler: RANDEVU, istemciKimligi: kimlik() }, sonra),
    ).rejects.toMatchObject({ durum: 400, message: expect.stringContaining("WhatsApp hesabında yok") });
    // Eksik değişken.
    await expect(
      servis.sohbetMesajiGonder(ctx, s.id, { tur: "sablon", sablonId: sablon(ctx, n).id, degiskenler: { "body:ad": "A" }, istemciKimligi: kimlik() }, sonra),
    ).rejects.toMatchObject({ durum: 400 });
  });

  it("pencere numara başına: Merkez'e yazan kişiye Şube'den serbest metin gitmez", async () => {
    const { ctx, n } = await alan("NumaraPencere");
    const sube = await numaraEkle(ctx, "Şube", n.waba);
    wa.testModuDegistir(ctx, sube.id, false);
    const k = kisi(ctx, "0532 300 00 02");
    await yaz(n, "905323000002", "Merkez'e yazıyorum");
    await yaz(sube, "905323000002", "Şube'ye de", { zaman: new Date(Date.now() - 30 * SAAT) });
    expect((await metinGonder(sohbetiBul(ctx, n, k.id).id, "Merkez yanıtı")).status).toBe(201);
    expect((await metinGonder(sohbetiBul(ctx, sube, k.id).id, "Şube yanıtı")).status).toBe(400);
    expect(mockWhatsapp.metinler.map((m) => m.phoneNumberId)).toEqual([n.phoneId]);
  });
});

describe("kampanya mesajı ve teslim durumu", () => {
  it("kampanya mesajı sohbete kapalı düşer; teslim durumu hem kuyruğa hem sohbete, yalnızca ileri; müşteri cevap verince açılır", async () => {
    const { ctx, n } = await alan("Kampanya");
    const k = kisi(ctx, "0532 400 00 01");
    const kampanya = kampanyaBaslat(
      ctx,
      KampanyaGirdisi.parse({
        kanal: "whatsapp_api",
        ad: "Tanıtım",
        filtre: { etiket: "e0001" },
        testModu: false,
        baglantiId: n.id,
        sablonId: sablon(ctx, n).id,
        degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "Ayşe" }, "body:tarih": { kaynak: "sabit", deger: "Salı" } },
      }),
    );
    await isciTuru({ parti: 50, whatsappAralikMs: 0 });
    const [g] = mockWhatsapp.gonderilenler;
    const s = sohbetiBul(ctx, n, k.id);
    expect(s).toMatchObject({ durum: "kapali", okunmamis: 0, sonGelenTarihi: null });
    const [m] = gk.sohbetMesajlariGetir(ctx, s.id);
    expect(m).toMatchObject({ yon: "giden", kaynak: "kampanya", tur: "template", kampanyaId: kampanya.id, wamid: g.wamid, metin: "Sayın Ayşe, randevunuz Salı." });

    const durum = (status: string) => bildirim(n, "messages", { statuses: [{ id: g.wamid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "905324000001" }] });
    await durum("read");
    await durum("delivered"); // geç gelen: geri gitmez
    expect(gk.sohbetMesajlariGetir(ctx, s.id)[0].teslimDurumu).toBe("read");
    expect(db.$client.prepare("select teslim_durumu t from message_queue where kampanya_id = ?").get(kampanya.id)).toEqual({ t: "read" });

    await yaz(n, "905324000001", "İlgileniyorum");
    expect(gk.sohbetGetir(ctx, s.id)).toMatchObject({ durum: "acik", okunmamis: 1 });
  });

  it("temsilci yanıtının teslim durumu sohbete yazılır (kuyrukta olmasa da)", async () => {
    const { ctx, n } = await alan("YanitDurum");
    const k = kisi(ctx, "0532 400 00 02");
    await yaz(n, "905324000002", "Soru");
    const s = sohbetiBul(ctx, n, k.id);
    const { mesaj } = await (await metinGonder(s.id, "Cevap")).json();
    expect(mesaj.teslimDurumu).toBe("gonderildi");
    const wamid = mockWhatsapp.metinler[0].wamid;
    await bildirim(n, "messages", { statuses: [{ id: wamid, status: "delivered", recipient_id: "905324000002" }] });
    expect(gk.sohbetMesajlariGetir(ctx, s.id).find((m) => m.wamid === wamid)?.teslimDurumu).toBe("delivered");
  });
});

describe("okundu, değişiklikler, atama ve notlar", () => {
  it("okundu: sohbet açılınca bir kez gönderilir ve okunmamış sıfırlanır; ayar kapalıysa gönderilmez", async () => {
    const { ctx, n } = await alan("Okundu");
    const k = kisi(ctx, "0532 500 00 01");
    const w1 = await yaz(n, "905325000001", "Bir");
    const w2 = await yaz(n, "905325000001", "İki");
    const s = sohbetiBul(ctx, n, k.id);
    expect(await (await okunduRotasi.POST(istek("POST"), p(s.id))).json()).toEqual({ bildirildi: true });
    expect(await (await okunduRotasi.POST(istek("POST"), p(s.id))).json()).toEqual({ bildirildi: false });
    expect(mockWhatsapp.okundular).toEqual([w2]);
    expect(w1).not.toBe(w2);
    expect(gk.sohbetGetir(ctx, s.id)?.okunmamis).toBe(0);

    iletiAyarlariGuncelle(ctx, { okunduBildirimi: false });
    await yaz(n, "905325000001", "Üç");
    expect(await (await okunduRotasi.POST(istek("POST"), p(s.id))).json()).toEqual({ bildirildi: false });
    expect(mockWhatsapp.okundular).toHaveLength(1);
    expect(gk.sohbetGetir(ctx, s.id)?.okunmamis).toBe(0);
  });

  it("değişiklik ucu: değişiklik yoksa küçük yanıt; yalnızca yeni mesajlar döner; başka çalışma alanının değişikliği görünmez; oturum yoksa 401", async () => {
    const a = await alan("DegisA");
    const b = await alan("DegisB");
    const k = kisi(a.ctx, "0532 600 00 01");
    kisi(b.ctx, "0532 600 00 01");
    await yaz(a.n, "905326000001", "Eski");
    const s = sohbetiBul(a.ctx, a.n, k.id);
    oturum.ctx = a.ctx;
    const sor = async (sonra: number) =>
      (await degisiklikRotasi.GET(new Request(`${U}/api/gelen-kutusu/degisiklikler?sonra=${sonra}&sohbet=${s.id}`))).json();
    const ilk = await (await listeRotasi.GET(new Request(`${U}/api/sohbetler`))).json();
    expect(ilk.sohbetler.map((x: { id: string }) => x.id)).toEqual([s.id]);
    expect(ilk.okunmamis).toMatchObject({ toplam: 1, [a.n.id]: 1 });
    expect(await sor(ilk.surum)).toEqual({ degisti: false, surum: ilk.surum });

    await yaz(b.n, "905326000001", "B'nin müşterisi"); // başka çalışma alanı
    expect(await sor(ilk.surum)).toEqual({ degisti: false, surum: ilk.surum });

    await yaz(a.n, "905326000001", "Yeni");
    const d = await sor(ilk.surum);
    expect(d.degisti).toBe(true);
    expect(d.sohbet.mesajlar.map((m: { metin: string }) => m.metin)).toEqual(["Yeni"]);
    expect(d.liste.sohbetler[0]).toMatchObject({ id: s.id, okunmamis: 2, sonMesaj: "Yeni" });

    oturum.ctx = null;
    expect((await degisiklikRotasi.GET(new Request(`${U}/api/gelen-kutusu/degisiklikler?sonra=0`))).status).toBe(401);
    expect((await listeRotasi.GET(new Request(`${U}/api/sohbetler`))).status).toBe(401);
  });

  it("atama yalnızca aynı çalışma alanının üyesine; notlar Meta'ya gitmez; başka alanın sohbeti 404; süzgeçler", async () => {
    const { ctx, n } = await alan("Atama");
    const uye = kullaniciOlustur("Uye");
    db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(uye.id, ctx.tenantId);
    const yabanci = kiraciOlustur("Yabanci");
    const k = kisi(ctx, "0532 700 00 01");
    const k2 = kisi(ctx, "0532 700 00 02");
    await yaz(n, "905327000001", "Bir");
    await yaz(n, "905327000002", "İki");
    const s = sohbetiBul(ctx, n, k.id);
    oturum.ctx = ctx;

    expect((await sohbetRotasi.PATCH(istek("PATCH", { atananKullanici: uye.id }), p(s.id))).status).toBe(200);
    const r = await sohbetRotasi.PATCH(istek("PATCH", { atananKullanici: yabanci.kullanici.id }), p(s.id));
    expect(r.status).toBe(400);
    expect(gk.sohbetGetir(ctx, s.id)?.atananKullanici).toBe(uye.id);

    const notlar = await (await notRotasi.POST(istek("POST", { metin: "Fiyat teklifi bekliyor" }), p(s.id))).json();
    expect(notlar.notlar.map((x: { metin: string }) => x.metin)).toEqual(["Fiyat teklifi bekliyor"]);
    expect(mockWhatsapp.metinler.length + mockWhatsapp.gonderilenler.length).toBe(0);

    // Süzgeçler: atanmamış, kapalı, arama.
    const liste = async (q: string) => (await (await listeRotasi.GET(new Request(`${U}/api/sohbetler?${q}`))).json()).sohbetler.map((x: { leadId: string }) => x.leadId);
    expect(await liste("atanan=yok")).toEqual([k2.id]);
    await sohbetRotasi.PATCH(istek("PATCH", { durum: "kapali" }), p(s.id));
    expect(await liste("durum=kapali")).toEqual([k.id]);
    expect(await liste("q=7000002")).toEqual([k2.id]);
    expect(await liste(`numara=${n.id}&q=kişi 0001`)).toEqual([k.id]);

    // Başka çalışma alanından.
    oturum.ctx = yabanci.ctx;
    expect((await sohbetRotasi.GET(istek("GET"), p(s.id))).status).toBe(404);
    expect((await sohbetRotasi.PATCH(istek("PATCH", { durum: "acik" }), p(s.id))).status).toBe(404);
    expect((await metinGonder(s.id, "saldırı")).status).toBe(404);
    expect((await notRotasi.POST(istek("POST", { metin: "x" }), p(s.id))).status).toBe(404);
    expect((await okunduRotasi.POST(istek("POST"), p(s.id))).status).toBe(404);
    expect(mockWhatsapp.metinler).toHaveLength(0);
  });
});

describe("gönderim güvenceleri", () => {
  it("test modu: test numarası dışına metin 403, test numarasına gider; hesap kilidinde hiçbir şey gitmez", async () => {
    const { ctx, n } = await alan("TestModu", { testModu: true });
    wa.testNumaralariKaydet(ctx, n.id, ["0532 800 00 01"]);
    const test = kisi(ctx, "0532 800 00 01");
    const diger = kisi(ctx, "0532 800 00 02");
    await yaz(n, "905328000001", "a");
    await yaz(n, "905328000002", "b");
    expect((await metinGonder(sohbetiBul(ctx, n, diger.id).id, "x")).status).toBe(403);
    expect((await metinGonder(sohbetiBul(ctx, n, test.id).id, "x")).status).toBe(201);

    db.$client.prepare("update whatsapp_baglantilari set hesap_kilidi_kodu = 131031 where id = ?").run(n.id);
    expect((await metinGonder(sohbetiBul(ctx, n, test.id).id, "y")).status).toBe(409);
    expect(mockWhatsapp.metinler).toHaveLength(1);
  });

  it("aynı istemci kimliği iki kez gönderilmez; belirsiz sonuç tekrar denenmez ve 'durum belirsiz' yazılır", async () => {
    const { ctx, n } = await alan("Cift");
    const k = kisi(ctx, "0532 900 00 01");
    await yaz(n, "905329000001", "Soru");
    const s = sohbetiBul(ctx, n, k.id);
    const id = kimlik();
    expect((await metinGonder(s.id, "Cevap", id)).status).toBe(201);
    const tekrar = await metinGonder(s.id, "Cevap", id);
    expect(tekrar.status).toBe(200);
    expect((await tekrar.json()).tekrar).toBe(true);
    expect(mockWhatsapp.metinler).toHaveLength(1);

    mockWhatsapp.hata = new GraphHatasi("Meta'ya ulaşılamadı: zaman aşımı", 0);
    const belirsiz = await metinGonder(s.id, "İkinci cevap");
    expect(belirsiz.status).toBe(201);
    const govde = await belirsiz.json();
    expect(govde.mesaj).toMatchObject({ teslimDurumu: "belirsiz", metin: "İkinci cevap" });
    expect(govde.uyari).toMatch(/teyit/);
    expect(mockWhatsapp.metinler).toHaveLength(1);
  });

  it("geçersiz gövde 400; boş metin 400", async () => {
    const { ctx, n } = await alan("Gecersiz");
    const k = kisi(ctx, "0532 900 00 02");
    await yaz(n, "905329000002", "Soru");
    const s = sohbetiBul(ctx, n, k.id);
    expect((await mesajRotasi.POST(istek("POST", { tur: "metin", metin: "x" }), p(s.id))).status).toBe(400);
    expect((await metinGonder(s.id, "   ")).status).toBe(400);
  });
});

describe("saklama (K3)", () => {
  it("süresi dolan mesajın metni boşaltılır; satır, yön ve teslim bilgisi kalır; süre ayardan", async () => {
    const { ctx, n } = await alan("Saklama");
    const k = kisi(ctx, "0532 990 00 01");
    await yaz(n, "905329900001", "Eski mesaj");
    const s = sohbetiBul(ctx, n, k.id);
    temizlikYap(new Date(Date.now() + 364 * 24 * SAAT)); // varsayılan 365 gün: henüz değil
    expect(gk.sohbetMesajlariGetir(ctx, s.id)[0].metin).toBe("Eski mesaj");
    iletiAyarlariGuncelle(ctx, { mesajSaklamaGun: 30 });
    temizlikYap(new Date(Date.now() + 31 * 24 * SAAT));
    const [m] = gk.sohbetMesajlariGetir(ctx, s.id);
    expect(m).toMatchObject({ metin: null, icerikSilindi: true, yon: "gelen", tur: "text" });
    const liste = servis.sohbetListesi(ctx, {});
    expect(liste.sohbetler[0].sonMesaj).toBe("(içerik saklama süresi doldu)");
  });
});
