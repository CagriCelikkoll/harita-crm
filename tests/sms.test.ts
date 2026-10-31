// SMS kampanyaları: uzunluk hesabı, Netgsm adaptörü (sahte fetch), gönderim anında Places telefonu (saklanmadan,
// kota birimiyle), ret yolu ve gelen RET webhook'u, test SMS'i.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { smsUzunlugu } from "@/lib/sms-uzunluk";
import { db } from "@/server/db";
import { adresOzeti } from "@/server/messaging/adres";
import { netgsmSaglayici } from "@/server/messaging/netgsm";
import { mockPlaces, mockPlacesIstemcisi } from "@/server/places/mock";
import type { TenantContext } from "@/server/repo/baglam";
import { engelliOzetler } from "@/server/repo/engel-listesi";
import { iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import { kampanyaMesajlari } from "@/server/repo/kampanyalar";
import { kayitGetir } from "@/server/repo/kayitlar";
import { aylikPlacesBirimi } from "@/server/repo/kullanim";
import { olaylariListele } from "@/server/repo/olaylar";
import { saglayiciKaydet } from "@/server/repo/saglayicilar";
import { isciTuru } from "@/server/servisler/isci";
import { KampanyaHatasi, kampanyaBaslat, kampanyaOzeti, type KampanyaGirdisi } from "@/server/servisler/kampanya";
import { saglayiciBilgisiKaydet, testGonder } from "@/server/servisler/saglayici";
import { GET, POST } from "@/app/api/webhook/sms/[anahtar]/route";
import { kiraciOlustur } from "./yardimci/fabrika";
import { kayitOlustur, SahteSaglayici } from "./yardimci/mesaj-fabrika";

const OGLE = new Date("2026-10-12T09:00:00Z"); // 12:00 İstanbul
const girdi = (g: Partial<KampanyaGirdisi> = {}): KampanyaGirdisi => ({
  kanal: "sms",
  ad: "SMS kampanyası",
  sablon: "Merhaba {isletme}, yeni ilanlarımız var.",
  filtre: {},
  testModu: false,
  ...g,
});
const tur = (s: SahteSaglayici, simdi = OGLE) => isciTuru({ simdi: () => simdi, parti: 50, saglayiciSec: () => s });

function kiraci(kota = 6000) {
  const { ctx } = kiraciOlustur(`Sms${Math.random().toString(36).slice(2, 7)}`);
  db.$client.prepare("update tenants set aylik_places_kotasi = ? where id = ?").run(kota, ctx.tenantId);
  iletiAyarlariGuncelle(ctx, {
    gonderenUnvani: "Ege Emlak",
    iletisimBilgisi: "İzmir",
    iysNo: "123456",
    sorumlulukOnayi: true,
    smsRetNumarasi: "0850 111 22 33",
    yetkiliTelefonu: "0533 777 66 55",
  });
  return ctx;
}

/** Mock Places'ta telefonu cep olan / olmayan yer kimlikleri. */
async function mockYerler() {
  // Sahte Places telefonları cep (0500 000 xx xx); sabit hat yalnızca mockPlaces.sabitHatlar'daki yerler için döner.
  const istemci = mockPlacesIstemcisi();
  const sabit = ["mock_cafe_20000_100", "mock_cafe_20000_101"];
  for (const id of sabit) mockPlaces.sabitHatlar.add(id);
  const cep: { id: string; tel: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const id = `mock_cafe_20000_${i}`;
    const y = await istemci.yerDetayi(id, "telefon");
    cep.push({ id, tel: y!.telefonUluslararasi! });
  }
  return { cep, sabit };
}

beforeEach(() => {
  db.$client.prepare("update message_queue set durum = 'iptal' where durum in ('kuyrukta', 'gonderiliyor')").run();
  db.$client.prepare("update kampanyalar set durum = 'iptal' where durum in ('zamanlandi', 'calisiyor')").run();
});

describe("SMS uzunluğu", () => {
  it("standart karakterlerde 160 / 153; Türkçe karakterde 155 / 149 ve 2 karakter; emoji UCS-2 70 / 67", () => {
    expect(smsUzunlugu("a".repeat(160))).toMatchObject({ kodlama: "gsm7", karakter: 160, parca: 1 });
    expect(smsUzunlugu("a".repeat(161))).toMatchObject({ parca: 2, parcaBasina: 153 });
    expect(smsUzunlugu("Öğle")).toMatchObject({ kodlama: "gsm7-turkce", karakter: 5 }); // ğ = 2, Ö temel
    expect(smsUzunlugu("ş".repeat(77) + "a")).toMatchObject({ karakter: 155, parca: 1 });
    expect(smsUzunlugu("ş".repeat(78))).toMatchObject({ karakter: 156, parca: 2, parcaBasina: 149 });
    expect(smsUzunlugu("Ürün ÇÖÜ öü")).toMatchObject({ kodlama: "gsm7" }); // temel alfabede
    expect(smsUzunlugu("Merhaba 🙂")).toMatchObject({ kodlama: "ucs2", karakter: 10, parca: 1 });
    expect(smsUzunlugu("x".repeat(71) + "🙂")).toMatchObject({ kodlama: "ucs2", parca: 2, parcaBasina: 67 });
    expect(smsUzunlugu("{}")).toMatchObject({ karakter: 4 });
  });
});

describe("Netgsm adaptörü (resmî SDK'daki alanlar)", () => {
  const ileti = {
    kanal: "sms" as const,
    alici: "905321112233",
    metin: "Merhaba, ilanlarımız hazır.",
    aboneliktenCikmaBaglantisi: "Ret için RET yazıp 08501112233 numarasına gönderin.",
    aliciTuru: "tacir_esnaf" as const,
  };
  const bilgi = { kullanici: "8501112233", sifre: "netgsm-SIFRE", baslik: "EGEEMLAK" };

  it("istek: /sms/rest/v2/send, Basic Auth, msgheader, messages[{msg,no}], encoding tr, iysfilter (tacir 12, bireysel 11)", async () => {
    const cagrilar: { url: string; init: RequestInit }[] = [];
    const sahte = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      cagrilar.push({ url: String(url), init: init! });
      return Response.json({ code: "00", description: "ok", jobid: "778899" });
    }) as unknown as typeof fetch;
    const s = netgsmSaglayici(bilgi, { fetch: sahte });
    expect(await s.gonder(ileti)).toEqual({ durum: "gonderildi", saglayiciKimligi: "778899" });
    await s.gonder({ ...ileti, aliciTuru: "bireysel", metin: "Hello" });
    expect(cagrilar[0].url).toBe("https://api.netgsm.com.tr/sms/rest/v2/send");
    expect((cagrilar[0].init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("8501112233:netgsm-SIFRE").toString("base64")}`,
    );
    expect(JSON.parse(String(cagrilar[0].init.body))).toEqual({
      msgheader: "EGEEMLAK",
      messages: [{ msg: "Merhaba, ilanlarımız hazır.", no: "5321112233" }],
      encoding: "tr",
      iysfilter: "12",
    });
    expect(JSON.parse(String(cagrilar[1].init.body))).toEqual({
      msgheader: "EGEEMLAK",
      messages: [{ msg: "Hello", no: "5321112233" }],
      iysfilter: "11",
    });
  });

  it("hata kodları: 40/30/20 kalıcı, 80/85/100 geçici; bağlantı kurulamazsa geçici, zaman aşımı belirsiz", async () => {
    const yanit = (kod: string) => netgsmSaglayici(bilgi, { fetch: (async () => Response.json({ code: kod }, { status: 406 })) as unknown as typeof fetch });
    expect(await (yanit("40")).gonder(ileti)).toMatchObject({ durum: "kalici_hata", hata: expect.stringContaining("başlığı") });
    expect(await (yanit("30")).gonder(ileti)).toMatchObject({ durum: "kalici_hata" });
    expect(await (yanit("20")).gonder(ileti)).toMatchObject({ durum: "kalici_hata" });
    for (const kod of ["80", "85", "100"]) expect(await (yanit(kod)).gonder(ileti)).toMatchObject({ durum: "gecici_hata" });
    const reddedildi = netgsmSaglayici(bilgi, {
      fetch: (async () => {
        throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
      }) as unknown as typeof fetch,
    });
    expect(await reddedildi.gonder(ileti)).toMatchObject({ durum: "gecici_hata" });
    const zamanAsimi = netgsmSaglayici(bilgi, {
      fetch: (async () => {
        throw new DOMException("zaman aşımı", "TimeoutError");
      }) as unknown as typeof fetch,
    });
    expect(await zamanAsimi.gonder(ileti)).toMatchObject({ durum: "kalici_hata", belirsiz: true });
    const garip = netgsmSaglayici(bilgi, { fetch: (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch });
    expect(await garip.gonder(ileti)).toMatchObject({ durum: "kalici_hata", belirsiz: true });
  });
});

describe("SMS kampanyası: alıcılar ve Places telefonu", () => {
  it("ek_telefon cep ise kullanılır; sabit hat hariç; ret yolu ve gönderen her SMS'te", async () => {
    const ctx = kiraci();
    const cep = kayitOlustur(ctx, { ekTelefon: "0532 111 22 33", isletmeAdi: "Kordon" });
    const sabit = kayitOlustur(ctx, { ekTelefon: "0232 444 55 66" });
    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    const s = new SahteSaglayici("sms", true);
    await tur(s);
    expect(s.gonderilen.map((i) => i.alici)).toEqual(["905321112233"]);
    expect(s.gonderilen[0].metin).toBe(
      "Merhaba Kordon, yeni ilanlarımız var.\nEge Emlak İYS No:123456. Ret için RET yazıp 0850 111 22 33 numarasına gönderin.",
    );
    const m = kampanyaMesajlari(ctx, k.id).mesajlar;
    expect(m.find((x) => x.leadId === sabit.id)).toMatchObject({ durum: "haric", neden: "cep_degil" });
    expect(m.find((x) => x.leadId === cep.id)).toMatchObject({ durum: "gonderildi" });
    expect(olaylariListele(ctx, cep.id).some((o) => o.tur === "sms")).toBe(true);
  });

  it("ek_telefon yoksa numara gönderim anında Places'tan alınır: kota birimi düşer, numara hiçbir tabloya yazılmaz", async () => {
    const ctx = kiraci();
    const { cep, sabit } = await mockYerler();
    const a = kayitOlustur(ctx, {}, cep[0].id);
    const b = kayitOlustur(ctx, {}, sabit[0]);

    const ozet = kampanyaOzeti(ctx, girdi(), OGLE);
    expect(ozet).toMatchObject({ gonderilecek: 2, placesTelefonGerekli: 2, tahminiKotaBirimi: 8 });
    expect(ozet.smsParca).toBe(1);

    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    const s = new SahteSaglayici("sms", true);
    await tur(s);
    const rakam = cep[0].tel.replace(/\D/g, "");
    expect(s.gonderilen.map((i) => i.alici)).toEqual([rakam]);
    expect(aylikPlacesBirimi(ctx)).toBe(8); // iki telefon çağrısı × 4 birim
    const m = kampanyaMesajlari(ctx, k.id).mesajlar;
    expect(m.find((x) => x.leadId === b.id)).toMatchObject({ durum: "haric", neden: "cep_degil" });
    expect(m.find((x) => x.leadId === a.id)?.durum).toBe("gonderildi");

    // Numara saklanmadı: ilgili tablolarda numaranın hiçbir yazımı geçmiyor.
    const son10 = rakam.slice(2);
    for (const tablo of ["leads", "lead_events", "message_queue", "engel_listesi", "kampanyalar"]) {
      const dokum = JSON.stringify(db.$client.prepare(`select * from ${tablo} where tenant_id = ?`).all(ctx.tenantId));
      expect(dokum, tablo).not.toContain(son10);
      expect(dokum, tablo).not.toContain(son10.slice(0, 3) + " " + son10.slice(3, 6));
    }
    expect(kayitGetir(ctx, a.id)!.ekTelefon).toBeNull();
  });

  it("Places'tan gelen numara engel listesindeyse gönderilmez", async () => {
    const ctx = kiraci();
    const { cep } = await mockYerler();
    kayitOlustur(ctx, {}, cep[1].id);
    db.$client
      .prepare("insert into engel_listesi (id, tenant_id, tur, ozet, kaynak) values (?, ?, 'telefon', ?, 'sms_ret')")
      .run(crypto.randomUUID(), ctx.tenantId, adresOzeti(ctx.tenantId, "telefon", cep[1].tel.replace(/\D/g, "")));
    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    const s = new SahteSaglayici("sms", true);
    await tur(s);
    expect(s.gonderilen).toHaveLength(0);
    expect(kampanyaMesajlari(ctx, k.id).mesajlar[0]).toMatchObject({ durum: "haric", neden: "engel" });
  });

  it("Places kotası doluysa mesaj gönderilmez, ay başında (İstanbul 09:00) yeniden denenmek üzere bekler", async () => {
    const ctx = kiraci(0);
    const { cep } = await mockYerler();
    kayitOlustur(ctx, {}, cep[2].id);
    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    const s = new SahteSaglayici("sms", true);
    await tur(s);
    expect(s.gonderilen).toHaveLength(0);
    const m = kampanyaMesajlari(ctx, k.id).mesajlar[0];
    expect(m).toMatchObject({ durum: "kuyrukta", neden: "kota", denemeSayisi: 0 });
    expect(m.sonrakiDeneme).toEqual(new Date("2026-11-01T06:00:00Z"));
  });

  it("sağlayıcı tanımlıyken SMS ret numarası olmadan sandbox dışı SMS kampanyası başlatılamaz", () => {
    const ctx = kiraci();
    iletiAyarlariGuncelle(ctx, { smsRetNumarasi: null });
    kayitOlustur(ctx, { ekTelefon: "0532 000 00 01" });
    saglayiciKaydet(ctx, "sms", "netgsm", "v1:yok");
    expect(() => kampanyaBaslat(ctx, girdi(), OGLE)).toThrow(KampanyaHatasi);
    expect(() => kampanyaBaslat(ctx, girdi(), OGLE)).toThrow(/SMS ret numarası/);
    expect(kampanyaBaslat(ctx, girdi({ testModu: true }), OGLE).sandbox).toBe(true);
  });
});

describe("gelen RET webhook'u", () => {
  async function webhookKur(ctx: TenantContext) {
    const { webhookAnahtari } = await saglayiciBilgisiKaydet(ctx, "sms", { kullanici: "u", sifre: "p", baslik: "BASLIK" });
    return webhookAnahtari!;
  }
  const cagir = (anahtar: string, govde: unknown, tur: "json" | "form" = "json") =>
    POST(
      new Request(`https://crm.ornek.test/api/webhook/sms/${anahtar}`, {
        method: "POST",
        headers: { "content-type": tur === "json" ? "application/json" : "application/x-www-form-urlencoded" },
        body: tur === "json" ? JSON.stringify(govde) : new URLSearchParams(govde as Record<string, string>).toString(),
      }),
      { params: Promise.resolve({ anahtar }) },
    );

  it("anahtar yalnızca özet olarak saklanır; ilk kayıtta üretilir, yeniden kaydetmede korunur", async () => {
    const ctx = kiraci();
    const anahtar = await webhookKur(ctx);
    expect(anahtar).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(JSON.stringify(db.$client.prepare("select * from saglayici_ayarlari where tenant_id = ?").all(ctx.tenantId))).not.toContain(anahtar);
    expect((await saglayiciBilgisiKaydet(ctx, "sms", { kullanici: "u", sifre: "p2", baslik: "BASLIK" })).webhookAnahtari).toBeUndefined();
    const yeni = (await saglayiciBilgisiKaydet(ctx, "sms", { kullanici: "u", sifre: "p2", baslik: "BASLIK" }, { webhookYenile: true }))
      .webhookAnahtari!;
    expect(yeni).not.toBe(anahtar);
    expect((await cagir(anahtar, { no: "905321112233", msg: "RET" })).status).toBe(404); // eski anahtar geçersiz
    expect((await cagir(yeni, { no: "905321112233", msg: "RET" })).status).toBe(200);
  });

  it("RET yanıtı: ek_telefon'u eşleşen kayıt ret olur, numara engel listesine yazılır; RET olmayan mesaj yok sayılır", async () => {
    const ctx = kiraci();
    const anahtar = await webhookKur(ctx);
    const k = kayitOlustur(ctx, { ekTelefon: "0532 222 33 44" });
    expect(await (await cagir(anahtar, { no: "905322223344", msg: "Merhaba, bilgi alabilir miyim?" })).json()).toEqual({ tamam: true, ret: false });
    expect(kayitGetir(ctx, k.id)!.iletiIzni).toBe("bekliyor");
    expect(await (await cagir(anahtar, { gsmno: "5322223344", mesaj: " ret " }, "form")).json()).toEqual({ tamam: true, ret: true });
    expect(kayitGetir(ctx, k.id)!.iletiIzni).toBe("ret");
    expect(olaylariListele(ctx, k.id).filter((o) => o.tur === "ret")).toHaveLength(1);
    expect(engelliOzetler(ctx, [adresOzeti(ctx.tenantId, "telefon", "905322223344")]).size).toBe(1);
    expect(kampanyaOzeti(ctx, girdi(), OGLE).haricler.ret).toBe(1);
  });

  it("Places'tan alınıp gönderilmiş numaradan gelen RET, kuyruktaki adres özetiyle kayda bağlanır", async () => {
    const ctx = kiraci();
    const anahtar = await webhookKur(ctx);
    const { cep } = await mockYerler();
    const k = kayitOlustur(ctx, {}, cep[0].id);
    kampanyaBaslat(ctx, girdi(), OGLE);
    await tur(new SahteSaglayici("sms", true));
    const r = await GET(
      new Request(`https://crm.ornek.test/api/webhook/sms/${anahtar}?no=${encodeURIComponent(cep[0].tel)}&msg=RET`),
      { params: Promise.resolve({ anahtar }) },
    );
    expect(await r.json()).toEqual({ tamam: true, ret: true });
    expect(kayitGetir(ctx, k.id)!.iletiIzni).toBe("ret");
  });

  it("bir kiracının webhook'u başka kiracının kaydını etkilemez; geçersiz anahtar 404", async () => {
    const a = kiraci();
    const b = kiraci();
    const anahtarA = await webhookKur(a);
    const bKayit = kayitOlustur(b, { ekTelefon: "0532 555 66 77" });
    expect(await (await cagir(anahtarA, { no: "905325556677", msg: "RET" })).json()).toEqual({ tamam: true, ret: true });
    expect(kayitGetir(b, bKayit.id)!.iletiIzni).toBe("bekliyor");
    expect(engelliOzetler(b, [adresOzeti(b.tenantId, "telefon", "905325556677")]).size).toBe(0);
    expect((await cagir("A".repeat(32), { no: "905325556677", msg: "RET" })).status).toBe(404);
    expect((await cagir("kisa", { no: "905325556677", msg: "RET" })).status).toBe(404);
  });
});

describe("test SMS'i", () => {
  it("yalnızca yetkili cep telefonuna, bilgilendirme (iysfilter 0) olarak; saatte en fazla 5", async () => {
    const ctx = kiraci();
    await saglayiciBilgisiKaydet(ctx, "sms", { kullanici: "u", sifre: "p", baslik: "BASLIK" });
    const govdeler: { messages: { no: string }[]; iysfilter: string }[] = [];
    const sahte = (async (_u: string, init: RequestInit) => {
      govdeler.push(JSON.parse(String(init.body)));
      return Response.json({ code: "00", jobid: "1" });
    }) as unknown as typeof fetch;
    for (let i = 0; i < 5; i++) expect((await testGonder(ctx, "sms", { netgsm: { fetch: sahte } })).durum).toBe("gonderildi");
    await expect(testGonder(ctx, "sms", { netgsm: { fetch: sahte } })).rejects.toThrow(/Saatte en fazla 5/);
    expect(new Set(govdeler.map((g) => g.messages[0].no))).toEqual(new Set(["5337776655"]));
    expect(new Set(govdeler.map((g) => g.iysfilter))).toEqual(new Set(["0"]));
  });

  it("yetkili telefonu yoksa test SMS'i gönderilmez", async () => {
    const ctx = kiraci();
    iletiAyarlariGuncelle(ctx, { yetkiliTelefonu: null });
    await saglayiciBilgisiKaydet(ctx, "sms", { kullanici: "u", sifre: "p", baslik: "BASLIK" });
    await expect(testGonder(ctx, "sms")).rejects.toThrow(/yetkili cep telefonu/);
  });
});
