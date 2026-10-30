// WhatsApp webhook: GET doğrulama, imza (yanlış / imzasız / başka App Secret → 401, hiçbir yazma yok), başka
// çalışma alanının numarası, teslim durumları (yalnızca ileri), WhatsApp yok / 131050, test modu kilidinin açılması,
// ret metni (tam eşleşme) ve çıkış butonu, reklamdan gelen kişi (çift kayıt yok), BSUID eşleştirme ve değişimi,
// kullanıcı tercihleri, şablon durumu, limit, tekrar webhook'u, gelen metnin hiçbir yerde saklanmaması.
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adresOzeti } from "@/server/messaging/adres";
import type { TenantContext } from "@/server/repo/baglam";
import { engelliOzetler } from "@/server/repo/engel-listesi";
import { iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import { kampanyaMesajlari } from "@/server/repo/kampanyalar";
import { kayitGetir, kayitlariListele, kisileriEkle } from "@/server/repo/kayitlar";
import { olaylariListele } from "@/server/repo/olaylar";
import { baglantiGetir } from "@/server/repo/whatsapp-baglantilari";
import { sablonlariListele } from "@/server/repo/whatsapp-sablonlari";
import { whatsappIzniAyarla, whatsappKisisiGetir } from "@/server/repo/whatsapp-kisileri";
import { isciTuru } from "@/server/servisler/isci";
import { kampanyaBaslat } from "@/server/servisler/kampanya";
import * as wa from "@/server/servisler/whatsapp-api";
import { mockWhatsappSifirla } from "@/server/whatsapp-api/mock";
import { GET, POST } from "@/app/api/whatsapp/webhook/[kimlik]/route";
import { kiraciOlustur } from "./yardimci/fabrika";

const U = "https://crm.ornek.test";
const SIMDI = new Date("2026-10-29T09:00:00Z");
let sayac = 0;

type Kurulum = { ctx: TenantContext; kimlik: string; secret: string; phoneId: string; waba: string; verifyToken: string };

async function kur(ad: string): Promise<Kurulum> {
  const { ctx } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Ltd.", iletisimBilgisi: "İzmir", iysNo: "1", sorumlulukOnayi: true });
  const phoneId = String(800000 + ++sayac);
  const waba = String(900000 + sayac);
  const secret = `secret-${ad}`;
  const { verifyToken } = await wa.whatsappBaglantisiKaydet(ctx, { wabaId: waba, phoneNumberId: phoneId, erisimAnahtari: "x", appSecret: secret });
  await wa.sablonlariSenkronizeEt(ctx);
  return { ctx, kimlik: baglantiGetir(ctx)!.webhookKimligi, secret, phoneId, waba, verifyToken: verifyToken! };
}

const imzala = (secret: string, govde: string) => `sha256=${createHmac("sha256", secret).update(govde).digest("hex")}`;

async function gonder(k: Kurulum, yuk: unknown, imza: string | null = "dogru") {
  const govde = JSON.stringify(yuk);
  const basliklar: Record<string, string> = { "Content-Type": "application/json" };
  if (imza !== null) basliklar["X-Hub-Signature-256"] = imza === "dogru" ? imzala(k.secret, govde) : imza;
  return POST(new Request(`${U}/api/whatsapp/webhook/${k.kimlik}`, { method: "POST", headers: basliklar, body: govde }), {
    params: Promise.resolve({ kimlik: k.kimlik }),
  });
}

const mesajlar = (k: Kurulum, field: string, value: Record<string, unknown>, phoneId = k.phoneId) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: k.waba,
      changes: [{ field, value: { messaging_product: "whatsapp", metadata: { display_phone_number: "90850", phone_number_id: phoneId }, ...value } }],
    },
  ],
});
let wamidSayaci = 0;
const gelen = (k: Kurulum, m: Record<string, unknown>, kisi: Record<string, unknown>, phoneId?: string) =>
  mesajlar(k, "messages", { contacts: [kisi], messages: [{ id: `wamid.IN${++wamidSayaci}`, timestamp: String(SIMDI.getTime() / 1000), ...m }] }, phoneId);

beforeEach(() => mockWhatsappSifirla());

describe("GET doğrulama", () => {
  it("doğru verify token → challenge ve 'webhook doğrulandı'; yanlış token ya da bilinmeyen adres → 403", async () => {
    const k = await kur("Get");
    const iste = (kimlik: string, token: string) =>
      GET(new Request(`${U}/api/whatsapp/webhook/${kimlik}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`), {
        params: Promise.resolve({ kimlik }),
      });
    expect((await iste(k.kimlik, "yanlis")).status).toBe(403);
    expect(baglantiGetir(k.ctx)?.webhookDogrulamaTarihi).toBeNull();
    expect((await iste("x".repeat(32), k.verifyToken)).status).toBe(403);
    const y = await iste(k.kimlik, k.verifyToken);
    expect(y.status).toBe(200);
    expect(await y.text()).toBe("12345");
    expect(baglantiGetir(k.ctx)?.webhookDogrulamaTarihi).toBeInstanceOf(Date);
  });
});

describe("POST imza ve çalışma alanı", () => {
  it("imzasız, yanlış imzalı ya da başka App Secret ile imzalı istek 401 ve hiçbir şey yazmaz", async () => {
    const k = await kur("Imza");
    const baska = await kur("ImzaBaska");
    const yuk = gelen(k, { from: "905321110001", type: "text", text: { body: "Merhaba" }, referral: { source_type: "ad", source_id: "1" } }, {
      profile: { name: "Saldırgan" },
      wa_id: "905321110001",
    });
    expect((await gonder(k, yuk, null)).status).toBe(401);
    expect((await gonder(k, yuk, "sha256=" + "0".repeat(64))).status).toBe(401);
    expect((await gonder(k, yuk, imzala(baska.secret, JSON.stringify(yuk)))).status).toBe(401);
    expect(kayitlariListele(k.ctx).toplam).toBe(0);
    expect(db.$client.prepare("select count(*) n from whatsapp_gelen_kimlikleri where tenant_id = ?").get(k.ctx.tenantId)).toEqual({ n: 0 });
  });

  it("başka çalışma alanının numarasına ait değişiklik işlenmez", async () => {
    const k = await kur("Numara");
    const baska = await kur("NumaraBaska");
    const yuk = gelen(k, { from: "905321110002", type: "text", text: { body: "x" }, referral: { source_type: "ad", source_id: "1" } }, { wa_id: "905321110002" }, baska.phoneId);
    expect((await gonder(k, yuk)).status).toBe(200);
    expect(kayitlariListele(k.ctx).toplam).toBe(0);
    expect(kayitlariListele(baska.ctx).toplam).toBe(0);
  });
});

describe("teslim durumları", () => {
  it("durum yalnızca ileri gider; ücret yazılır; imzalı durum bildirimi test modu kilidini açar; 131026 WhatsApp yok", async () => {
    const k = await kur("Durum");
    wa.testNumaralariKaydet(k.ctx, ["0532 111 00 01", "0532 111 00 02"]);
    const [a, b] = kisileriEkle(
      k.ctx,
      [
        { kaynak: "elle", ekTelefon: "0532 111 00 01", etiketler: ["wh"] },
        { kaynak: "elle", ekTelefon: "0532 111 00 02", etiketler: ["wh"] },
      ],
      "x",
    );
    for (const x of [a, b]) whatsappIzniAyarla(k.ctx, x.id, { izin: "var", kaynak: "form" });
    const sablon = sablonlariListele(k.ctx).find((s) => s.ad === "randevu_hatirlatma")!;
    const kampanya = kampanyaBaslat(
      k.ctx,
      { kanal: "whatsapp_api", ad: "K", filtre: { etiket: "wh" }, testModu: false, sablonId: sablon.id, degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "A" }, "body:tarih": { kaynak: "sabit", deger: "B" } } },
      SIMDI,
    );
    await isciTuru({ simdi: () => SIMDI, whatsappAralikMs: 0 });
    const wamid = (leadId: string) =>
      (db.$client.prepare("select saglayici_kimligi s from message_queue where lead_id = ?").get(leadId) as { s: string }).s;
    const teslim = (leadId: string) =>
      db.$client.prepare("select teslim_durumu d, teslim_hata_kodu k, ucretli u, ucret_kategorisi c from message_queue where lead_id = ?").get(leadId);
    const durum = (id: string, status: string, ek: Record<string, unknown> = {}) =>
      gonder(k, mesajlar(k, "messages", { statuses: [{ id, status, timestamp: "1761728400", recipient_id: "905321110001", ...ek }] }));

    expect(svcKapatilabilir(k)).toBe(false);
    await durum(wamid(a.id), "sent");
    await durum(wamid(a.id), "read", { pricing: { billable: true, category: "utility" } });
    await durum(wamid(a.id), "delivered"); // geç gelen: geri gitmez
    expect(teslim(a.id)).toEqual({ d: "read", k: null, u: 1, c: "utility" });

    await durum(wamid(b.id), "failed", { errors: [{ code: 131026, title: "undeliverable" }] });
    expect(teslim(b.id)).toMatchObject({ d: "failed", k: 131026 });
    expect(whatsappKisisiGetir(k.ctx, b.id)?.whatsappYokTarihi).toBeInstanceOf(Date);

    // Kampanya detay sayıları
    expect(kampanyaMesajlari(k.ctx, kampanya.id).toplam).toBe(2);
    // Webhook doğrulaması da yapılınca test modu kapatılabilir.
    db.$client.prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ? where tenant_id = ?").run(Date.now(), k.ctx.tenantId);
    expect(svcKapatilabilir(k)).toBe(true);
    expect(() => wa.testModuDegistir(k.ctx, false)).not.toThrow();
  });

  it("131050 (pazarlama durduruldu) teslim hatası ret akışını çalıştırır", async () => {
    const k = await kur("Durum131050");
    const [a] = kisileriEkle(k.ctx, [{ kaynak: "elle", ekTelefon: "0532 111 00 03" }], "x");
    db.$client
      .prepare("insert into kampanyalar (id, tenant_id, kanal, ad, sablon, filtre, sandbox, durum) values ('k131050', ?, 'whatsapp_api', 'K', 'S', '{}', 0, 'tamamlandi')")
      .run(k.ctx.tenantId);
    db.$client
      .prepare("insert into message_queue (id, tenant_id, kampanya_id, lead_id, kanal, durum, saglayici_kimligi) values ('m131050', ?, 'k131050', ?, 'whatsapp_api', 'gonderildi', 'wamid.X50')")
      .run(k.ctx.tenantId, a.id);
    await gonder(k, mesajlar(k, "messages", { statuses: [{ id: "wamid.X50", status: "failed", recipient_id: "905321110003", errors: [{ code: 131050 }] }] }));
    expect(kayitGetir(k.ctx, a.id)?.iletiIzni).toBe("ret");
    expect(whatsappKisisiGetir(k.ctx, a.id)?.izin).toBe("ret");
  });

  it("test modu kilidini yalnızca bizim gönderdiğimiz, sandbox olmayan ve mevcut numaradan giden iletinin bildirimi açar", async () => {
    const k = await kur("KilitKaynak");
    const [a] = kisileriEkle(k.ctx, [{ kaynak: "elle", ekTelefon: "0532 111 00 07" }], "x");
    const sonImzali = () => baglantiGetir(k.ctx)?.sonImzaliDurumTarihi ?? null;
    const durum = (id: string) => gonder(k, mesajlar(k, "messages", { statuses: [{ id, status: "delivered", recipient_id: "905321110007" }] }));
    const satir = (id: string, wamid: string, ek: { sandbox?: boolean; numara?: string | null }) => {
      db.$client
        .prepare("insert into kampanyalar (id, tenant_id, kanal, ad, sablon, filtre, sandbox, durum) values (?, ?, 'whatsapp_api', 'K', 'S', '{}', ?, 'tamamlandi')")
        .run(`k-${id}`, k.ctx.tenantId, ek.sandbox ? 1 : 0);
      db.$client
        .prepare(
          "insert into message_queue (id, tenant_id, kampanya_id, lead_id, kanal, durum, saglayici_kimligi, sandbox_icerik, gonderen_numara) values (?, ?, ?, ?, 'whatsapp_api', 'gonderildi', ?, ?, ?)",
        )
        .run(id, k.ctx.tenantId, `k-${id}`, a.id, wamid, ek.sandbox ? "metin" : null, ek.numara ?? null);
    };

    // Aynı numarayı kullanan başka bir aracın (bizim kuyruğumuzda olmayan) iletisi: imzalı ama kilidi açmaz.
    expect((await durum("wamid.BASKA_ARAC")).status).toBe(200);
    expect(sonImzali()).toBeNull();
    // Sandbox satırı ve eski numaradan gönderilmiş ileti de açmaz.
    satir("m-sb", "wamid.SANDBOX", { sandbox: true, numara: k.phoneId });
    satir("m-eski", "wamid.ESKI", { numara: "800999" });
    await durum("wamid.SANDBOX");
    await durum("wamid.ESKI");
    expect(sonImzali()).toBeNull();
    // Bizim, mevcut numaradan gönderdiğimiz ileti: açar.
    satir("m-bizim", "wamid.BIZIM", { numara: k.phoneId });
    await durum("wamid.BIZIM");
    expect(sonImzali()).toBeInstanceOf(Date);
  });
});

function svcKapatilabilir(k: Kurulum) {
  return wa.baglantiDurumu(k.ctx).testModuKapatilabilir;
}

describe("gelen iletiler", () => {
  it("ret metni tam eşleşmeyle (RET, DUR, İPTAL, STOP, ABONELİKTEN ÇIK, ÇIK) ve çıkış butonu; cümle içindeki kelime ret değil", async () => {
    const k = await kur("Ret");
    const kisiler = kisileriEkle(
      k.ctx,
      Array.from({ length: 8 }, (_, i) => ({ kaynak: "elle" as const, ekTelefon: `0532 222 00 0${i}` })),
      "x",
    );
    const metin = (i: number, body: string) => gonder(k, gelen(k, { from: `90532222000${i}`, type: "text", text: { body } }, { wa_id: `90532222000${i}` }));
    await metin(0, "RET");
    await metin(1, "  iptal ");
    await metin(2, "Abonelikten çık.");
    await metin(3, "cik");
    await metin(4, "Stop");
    await metin(5, "iptal etmek istemiyorum"); // ret değil
    await gonder(k, gelen(k, { from: "905322220006", type: "button", button: { payload: "Stop promotions", text: "Stop promotions" } }, { wa_id: "905322220006" }));
    await gonder(k, gelen(k, { from: "905322220007", type: "button", button: { payload: "Bilgi almak istiyorum", text: "Bilgi almak istiyorum" } }, { wa_id: "905322220007" }));
    const izin = kisiler.map((x) => kayitGetir(k.ctx, x.id)?.iletiIzni);
    expect(izin).toEqual(["ret", "ret", "ret", "ret", "ret", "bekliyor", "ret", "bekliyor"]);
    expect(olaylariListele(k.ctx, kisiler[5].id).some((o) => o.tur === "whatsapp_gelen")).toBe(true);
    const ozet = adresOzeti(k.ctx.tenantId, "telefon", "905322220000");
    expect(engelliOzetler(k.ctx, [ozet]).has(ozet)).toBe(true);
  });

  it("reklamdan gelen yeni kişi: meta_reklam kaydı, izin 'kendisi yazdı', bireysel, pencere 72 saat; aynı numara ikinci kez çift kayıt açmaz; tekrar webhook tek olay", async () => {
    const k = await kur("Reklam");
    const referral = { source_type: "ad", source_id: "ad-123", headline: "Yeni projemiz", ctwa_clid: "clid-1" };
    const kisi = { profile: { name: "Zeynep Kaya", username: "zeynepk" }, wa_id: "905339990001", user_id: "TR.111" };
    const yuk = gelen(k, { from: "905339990001", from_user_id: "TR.111", type: "text", text: { body: "GİZLİ-METİN-98765 fiyat nedir?" }, referral }, kisi);
    await gonder(k, yuk);
    await gonder(k, yuk); // Meta'nın tekrarı (aynı wamid)
    const liste = kayitlariListele(k.ctx).kayitlar;
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ kaynak: "meta_reklam", yetkiliAdi: "Zeynep Kaya", telefonE164: "905339990001", aliciTuru: "bireysel", placeId: null });
    const w = whatsappKisisiGetir(k.ctx, liste[0].id)!;
    expect(w).toMatchObject({ izin: "var", izinKaynagi: "kendisi_yazdi", bsuid: "TR.111", waKullaniciAdi: "zeynepk", reklamKimligi: "ad-123", reklamBasligi: "Yeni projemiz", ctwaClid: "clid-1" });
    expect(w.pencereBitis?.getTime()).toBe(SIMDI.getTime() + 72 * 3_600_000);
    const gelenOlaylari = () => olaylariListele(k.ctx, liste[0].id).filter((o) => o.tur === "whatsapp_gelen").length;
    expect(gelenOlaylari()).toBe(1);

    // Aynı kişi başka reklamdan tekrar yazar (yeni wamid): çift kayıt yok, olay eklenir.
    await gonder(k, gelen(k, { from: "905339990001", type: "text", text: { body: "tekrar" }, referral: { ...referral, source_id: "ad-456" } }, { wa_id: "905339990001" }));
    expect(kayitlariListele(k.ctx).toplam).toBe(1);
    expect(whatsappKisisiGetir(k.ctx, liste[0].id)?.reklamKimligi).toBe("ad-456");
    expect(gelenOlaylari()).toBe(2);

    // Gelen ileti METNİ hiçbir tabloda yok.
    const tablolar = (db.$client.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((t) => t.name);
    for (const t of tablolar) {
      const satirlar = db.$client.prepare(`select * from "${t}"`).all();
      expect(JSON.stringify(satirlar), t).not.toContain("GİZLİ-METİN-98765");
    }
  });

  it("telefonu gelmeyen (kullanıcı adlı) kişi BSUID ile kaydedilir ve eşleşir; ret BSUID'i engeller; BSUID değişimi izlenir", async () => {
    const k = await kur("Bsuid");
    const kisi = { profile: { name: "Anonim", username: "anonim" }, user_id: "TR.222" };
    await gonder(k, gelen(k, { from_user_id: "TR.222", type: "text", text: { body: "merhaba" }, referral: { source_type: "ad", source_id: "a" } }, kisi));
    const [kayit] = kayitlariListele(k.ctx).kayitlar;
    expect(kayit).toMatchObject({ ekTelefon: null, telefonE164: null });
    expect(whatsappKisisiGetir(k.ctx, kayit.id)?.bsuid).toBe("TR.222");

    // BSUID değişti (sistem iletisi)
    await gonder(k, gelen(k, { from_user_id: "TR.333", type: "system", system: { type: "user_changed_user_id", user_id: "TR.333", previous_user_id: "TR.222" } }, { user_id: "TR.333" }));
    expect(whatsappKisisiGetir(k.ctx, kayit.id)?.bsuid).toBe("TR.333");

    // Yeni BSUID'le ret
    await gonder(k, gelen(k, { from_user_id: "TR.333", type: "text", text: { body: "DUR" } }, { user_id: "TR.333" }));
    expect(kayitGetir(k.ctx, kayit.id)?.iletiIzni).toBe("ret");
    const ozet = adresOzeti(k.ctx.tenantId, "wa_kimlik", "TR.333");
    expect(engelliOzetler(k.ctx, [ozet]).has(ozet)).toBe(true);
    expect(kayitlariListele(k.ctx).toplam).toBe(1);
  });

  it("eşleştirme önce BSUID, sonra telefon; reklamsız ileti yeni kayıt açmaz", async () => {
    const k = await kur("Eslesme");
    const [a, b] = kisileriEkle(
      k.ctx,
      [
        { kaynak: "elle", ekTelefon: "0532 444 00 01" },
        { kaynak: "elle", ekTelefon: "0532 444 00 02" },
      ],
      "x",
    );
    db.$client.prepare("insert into whatsapp_kisileri (tenant_id, lead_id, bsuid) values (?, ?, 'TR.444')").run(k.ctx.tenantId, b.id);
    // Telefon a'nınki ama BSUID b'ninki: BSUID kazanır.
    await gonder(k, gelen(k, { from: "905324440001", from_user_id: "TR.444", type: "text", text: { body: "x" } }, { wa_id: "905324440001", user_id: "TR.444" }));
    expect(olaylariListele(k.ctx, b.id).some((o) => o.tur === "whatsapp_gelen")).toBe(true);
    expect(olaylariListele(k.ctx, a.id).some((o) => o.tur === "whatsapp_gelen")).toBe(false);
    // Telefonla eşleşme + BSUID öğrenilir
    await gonder(k, gelen(k, { from: "905324440001", from_user_id: "TR.555", type: "text", text: { body: "x" } }, { wa_id: "905324440001", user_id: "TR.555" }));
    expect(whatsappKisisiGetir(k.ctx, a.id)?.bsuid).toBe("TR.555");
    // Bilinmeyen numara, reklamsız: kayıt açılmaz
    await gonder(k, gelen(k, { from: "905324449999", type: "text", text: { body: "x" } }, { wa_id: "905324449999" }));
    expect(kayitlariListele(k.ctx).toplam).toBe(2);
  });

  it("kullanıcı tercihleri: stop → ret; resume ret'i geri almaz", async () => {
    const k = await kur("Tercih");
    const [a] = kisileriEkle(k.ctx, [{ kaynak: "elle", ekTelefon: "0532 555 00 01" }], "x");
    whatsappIzniAyarla(k.ctx, a.id, { izin: "var", kaynak: "form" });
    await gonder(k, mesajlar(k, "user_preferences", { user_preferences: [{ wa_id: "905325550001", category: "marketing_messages", value: "stop" }] }));
    expect(whatsappKisisiGetir(k.ctx, a.id)?.izin).toBe("ret");
    await gonder(k, mesajlar(k, "user_preferences", { user_preferences: [{ wa_id: "905325550001", category: "marketing_messages", value: "resume" }] }));
    expect(whatsappKisisiGetir(k.ctx, a.id)?.izin).toBe("ret");
  });
});

describe("hesap bildirimleri", () => {
  it("şablon durumu ve limit değişikliği (WABA eşleşmeli)", async () => {
    const k = await kur("Hesap");
    const hesap = (field: string, value: Record<string, unknown>, waba = k.waba) => ({
      object: "whatsapp_business_account",
      entry: [{ id: waba, time: 1, changes: [{ field, value }] }],
    });
    const tanitim = () => sablonlariListele(k.ctx).find((s) => s.ad === "kampanya_tanitim")!;
    await gonder(k, hesap("message_template_status_update", { event: "DISABLED", message_template_id: 1001, message_template_name: "kampanya_tanitim", message_template_language: "tr" }));
    expect(tanitim()).toMatchObject({ durum: "DISABLED", destekNedeni: expect.stringMatching(/onaylı değil/) });
    await gonder(k, hesap("message_template_status_update", { event: "APPROVED", message_template_id: 1001, message_template_name: "kampanya_tanitim", message_template_language: "tr" }));
    expect(tanitim()).toMatchObject({ durum: "APPROVED", destekNedeni: null });
    // Başka WABA: işlenmez
    await gonder(k, hesap("message_template_status_update", { event: "DISABLED", message_template_id: 1001, message_template_name: "kampanya_tanitim", message_template_language: "tr" }, "1"));
    expect(tanitim().durum).toBe("APPROVED");

    db.$client.prepare("update whatsapp_baglantilari set son_kontrol = ? where tenant_id = ?").run(Date.now(), k.ctx.tenantId);
    await gonder(k, hesap("business_capability_update", { max_daily_conversations_per_business: "TIER_100K" }));
    expect(baglantiGetir(k.ctx)).toMatchObject({ limitKatmani: "TIER_100K", sonKontrol: null });
    await gonder(k, hesap("phone_number_quality_update", { event: "THROUGHPUT_UPGRADE", current_limit: "TIER_10K", max_daily_conversations_per_business: "TIER_2K" }));
    expect(baglantiGetir(k.ctx)?.limitKatmani).toBe("TIER_2K");
  });
});
