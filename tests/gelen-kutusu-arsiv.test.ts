// Gelen kutusu geliştirmeleri: liste çipleri (Okunmamış, Cevap bekleyen, Teklif / ilgi, Penceresi kapanmak
// üzere, RET verenler; birlikte ve atamayla), teklif / ilgi butonlarının Meta buton yükünden tanınması, pencere süresi,
// gönderimi geri al (Meta'ya istek gitmez), toplu ve otomatik kapatma, yeni mesajla yeniden açılma, sohbet silme
// (yetki, kapsam, RET / izin / kampanya istatistiği korunur, denetim kaydı) ve izolasyon.
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";
import type { SohbetListesi } from "@/server/servisler/gelen-kutusu";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { _baglamDamgala, YetkiHatasi } = await import("@/server/repo/baglam");
const { iletiAyarlariGetir, iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kayitGetir, kisileriEkle } = await import("@/server/repo/kayitlar");
const { olaylariListele } = await import("@/server/repo/olaylar");
const { denetimKayitlariListele } = await import("@/server/repo/denetim");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const { sablonlariListele } = await import("@/server/repo/whatsapp-sablonlari");
const { whatsappIzniAyarla, whatsappKisisiGetir } = await import("@/server/repo/whatsapp-kisileri");
const gk = await import("@/server/repo/gelen-kutusu");
const { temizlikYap } = await import("@/server/repo/sistem/bakim");
const { isciTuru } = await import("@/server/servisler/isci");
const { KampanyaGirdisi, kampanyaBaslat } = await import("@/server/servisler/kampanya");
const servis = await import("@/server/servisler/gelen-kutusu");
const wa = await import("@/server/servisler/whatsapp-api");
const { medyaTamYolu } = await import("@/server/servisler/medya-dosyalari");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const webhook = await import("@/app/api/whatsapp/webhook/[kimlik]/route");
const listeRotasi = await import("@/app/api/sohbetler/route");
const sohbetRotasi = await import("@/app/api/sohbetler/[id]/route");
const kapatRotasi = await import("@/app/api/sohbetler/kapat/route");
const mesajRotasi = await import("@/app/api/sohbetler/[id]/mesaj/route");
const lib = await import("@/lib/gelen-kutusu");
const { gecikmeliGonderici } = await import("@/lib/geri-al");
const { DENETIM_SOHBET_SILME } = await import("@/lib/denetim");
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");

const U = "https://crm.ornek.test";
const SAAT = 3_600_000;
const GUN = 24 * SAAT;
let sayac = 0;
let wamidSayac = 0;

beforeEach(() => {
  mockWhatsappSifirla();
  oturum.ctx = null;
});

type Numara = { id: string; phoneId: string; waba: string; kimlik: string };

async function alan(ad: string) {
  const { ctx, kullanici } = kiraciOlustur(`${ad}${++sayac}`);
  iletiAyarlariGuncelle(ctx, {
    gonderenUnvani: "Ege Emlak Ltd.",
    iletisimBilgisi: "İzmir",
    iysNo: "123456",
    sorumlulukOnayi: true,
    gonderimBaslangicDk: 0,
    gonderimBitisDk: 24 * 60,
  });
  const phoneId = String(830000 + ++sayac);
  const waba = String(500000 + sayac);
  const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad: "Merkez", wabaId: waba, phoneNumberId: phoneId, erisimAnahtari: "anahtar", appSecret: "app-secret" });
  db.$client
    .prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ?, kalite = 'GREEN', limit_katmani = 'TIER_10K', son_kontrol = ? where id = ?")
    .run(Date.now(), Date.now(), Date.now(), baglanti.id!);
  await wa.sablonlariSenkronizeEt(ctx, baglanti.id!);
  wa.testModuDegistir(ctx, baglanti.id!, false);
  const b = baglantiGetir(ctx, baglanti.id!)!;
  oturum.ctx = ctx;
  return { ctx, kullanici, n: { id: b.id, phoneId, waba, kimlik: b.webhookKimligi } as Numara };
}

async function bildirim(n: Numara, value: Record<string, unknown>) {
  const govde = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: n.waba, changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: n.phoneId }, ...value } }] }],
  });
  const imza = `sha256=${createHmac("sha256", "app-secret").update(govde).digest("hex")}`;
  const y = await webhook.POST(new Request(`${U}/api/whatsapp/webhook/${n.kimlik}`, { method: "POST", headers: { "X-Hub-Signature-256": imza }, body: govde }), {
    params: Promise.resolve({ kimlik: n.kimlik }),
  });
  expect(y.status).toBe(200);
}

/** Müşterinin iletisi (varsayılan metin). ileti: Meta'nın ileti alanları (type, button, interactive …). */
async function yaz(n: Numara, tel: string, metin: string, s: { zaman?: Date; ileti?: Record<string, unknown> } = {}) {
  const ts = String(Math.floor((s.zaman ?? new Date()).getTime() / 1000));
  await bildirim(n, {
    contacts: [{ profile: { name: "Müşteri" }, wa_id: tel }],
    messages: [{ from: tel, id: `wamid.ARSIV${++wamidSayac}`, timestamp: ts, type: "text", text: { body: metin }, ...s.ileti }],
  });
}

function kisi(ctx: TenantContext, tel: string, izin: "var" | "yok" = "var") {
  const son4 = tel.replace(/\D/g, "").slice(-4);
  const [k] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: tel, isletmeAdi: `Kişi ${son4}`, aliciTuru: "tacir_esnaf", etiketler: [`e${son4}`] }], "test");
  if (izin === "var") whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form" });
  return k;
}

const istek = (method: string, govde?: unknown, adres = `${U}/api/x`) =>
  new Request(adres, { method, headers: { "Content-Type": "application/json", Origin: U }, body: govde === undefined ? undefined : JSON.stringify(govde) });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const sohbetId = (ctx: TenantContext, n: Numara, leadId: string) => gk.sohbetBul(ctx, n.id, leadId)!.id;

async function liste(sorgu: string): Promise<SohbetListesi> {
  const y = await listeRotasi.GET(istek("GET", undefined, `${U}/api/sohbetler?durum=tum&${sorgu}`));
  expect(y.status).toBe(200);
  return y.json();
}
const adlar = (l: SohbetListesi) => l.sohbetler.map((s) => s.ad).sort();

describe("liste çipleri", () => {
  it("her çip doğru sohbetleri getirir; çipler ve atama birlikte (VE) çalışır; sayılar süzgecin geri kalanıyla", async () => {
    const { ctx, kullanici, n } = await alan("Cip");
    const simdi = Date.now();
    // 0001: yazdı, yanıt yok, okunmadı → okunmamış + cevap bekleyen; bana atanmış.
    const a = kisi(ctx, "0532 500 00 01");
    await yaz(n, "905325000001", "Fiyat nedir?");
    gk.sohbetGuncelle(ctx, sohbetId(ctx, n, a.id), { atananKullanici: kullanici.id });
    // 0002: yazdı, temsilci yanıtladı, okundu → hiçbir çip.
    const b = kisi(ctx, "0532 500 00 02");
    await yaz(n, "905325000002", "Merhaba");
    expect((await mesajRotasi.POST(istek("POST", { tur: "metin", metin: "Buyurun", istemciKimligi: `istemci-${crypto.randomUUID()}` }), p(sohbetId(ctx, n, b.id)))).status).toBe(201);
    gk.okunduIsaretle(ctx, sohbetId(ctx, n, b.id));
    // 0003: yanıt "iletilemedi" (failed) → hâlâ cevap bekliyor; atanmamış.
    const c = kisi(ctx, "0532 500 00 03");
    await yaz(n, "905325000003", "Adres?");
    gk.okunduIsaretle(ctx, sohbetId(ctx, n, c.id));
    gk.gidenMesajYaz(ctx, { baglantiId: n.id, leadId: c.id, kaynak: "temsilci", tur: "text", metin: "x", wamid: null, teslimDurumu: "failed", ilkDurum: "acik" });
    // 0004: 22 saat önce yazdı (pencereye < 3 saat) → penceresi kapanmak üzere (+ cevap bekleyen, okunmamış).
    const d = kisi(ctx, "0532 500 00 04");
    await yaz(n, "905325000004", "Dün yazmıştım", { zaman: new Date(simdi - 22 * SAAT) });
    // 0005: 20 saat önce yazdı → pencere 4 saat: çipte değil. 0006: 25 saat önce → pencere kapalı: çipte değil.
    const e = kisi(ctx, "0532 500 00 05");
    await yaz(n, "905325000005", "x", { zaman: new Date(simdi - 20 * SAAT) });
    const f = kisi(ctx, "0532 500 00 06");
    await yaz(n, "905325000006", "x", { zaman: new Date(simdi - 25 * SAAT) });
    // 0007: RET yazdı.
    const g = kisi(ctx, "0532 500 00 07");
    await yaz(n, "905325000007", "RET");
    // 0008: teklif / ilgi butonu (Meta buton yükü).
    const h = kisi(ctx, "0532 500 00 08");
    await yaz(n, "905325000008", "", { ileti: { type: "button", text: undefined, button: { payload: "Fiyat teklifi istiyorum", text: "Fiyat teklifi istiyorum" } } });
    for (const x of [d, e, f, g, h]) gk.okunduIsaretle(ctx, sohbetId(ctx, n, x.id));

    expect(adlar(await liste("cip=okunmamis"))).toEqual(["Kişi 0001"]);
    expect(adlar(await liste("cip=cevap_bekleyen"))).toEqual(["Kişi 0001", "Kişi 0003", "Kişi 0004", "Kişi 0005", "Kişi 0006", "Kişi 0007", "Kişi 0008"]);
    expect(adlar(await liste("cip=pencere"))).toEqual(["Kişi 0004"]);
    expect(adlar(await liste("cip=ret"))).toEqual(["Kişi 0007"]);
    expect(adlar(await liste("cip=teklif"))).toEqual(["Kişi 0008"]);
    // Birlikte: cevap bekleyen + bana atanan; cevap bekleyen + RET.
    expect(adlar(await liste("cip=cevap_bekleyen&atanan=ben"))).toEqual(["Kişi 0001"]);
    expect(adlar(await liste("cip=cevap_bekleyen,ret"))).toEqual(["Kişi 0007"]);
    // Tanınmayan çip yok sayılır.
    expect((await liste("cip=olmayan")).toplam).toBe(8);

    const l = await liste("atanan=ben");
    expect(l.cipSayilari).toEqual({ okunmamis: 1, cevap_bekleyen: 1, teklif: 0, pencere: 0, ret: 0 });
    expect((await liste("")).cipSayilari).toEqual({ okunmamis: 1, cevap_bekleyen: 7, teklif: 1, pencere: 1, ret: 1 });
    // Liste satırında rozet bilgileri.
    const tum: SohbetListesi = await liste("");
    expect(tum.sohbetler.find((s) => s.ad === "Kişi 0008")?.teklifIstegi).not.toBeNull();
    expect(tum.sohbetler.find((s) => s.ad === "Kişi 0007")?.ret).toBe(true);
    // Penceresi kapanmak üzere yalnızca açık sohbetlerde.
    gk.sohbetGuncelle(ctx, sohbetId(ctx, n, d.id), { durum: "kapali" });
    expect((await liste("cip=pencere")).toplam).toBe(0);
  });

  it("teklif / ilgi yalnızca Meta buton yükünden tanınır (fiyat, katalog, numune, bilgi); ekrandaki metin ve yazılan metin sayılmaz", async () => {
    const { ctx, n } = await alan("Teklif");
    const durum = (leadId: string) => gk.sohbetGetir(ctx, sohbetId(ctx, n, leadId))?.teklifIstegiTarihi ?? null;
    const a = kisi(ctx, "0532 510 00 01");
    await yaz(n, "905325100001", "", { ileti: { type: "button", button: { payload: "fiyat teklifi  İSTİYORUM", text: "Fiyat teklifi istiyorum" } } });
    // Metin aynı, yük farklı (ör. işletmenin kendi verdiği kimlik): tanınmaz.
    const b = kisi(ctx, "0532 510 00 02");
    await yaz(n, "905325100002", "", { ileti: { type: "button", button: { payload: "BTN_1", text: "Fiyat teklifi istiyorum" } } });
    // Müşteri aynı cümleyi yazdı: buton değil.
    const c = kisi(ctx, "0532 510 00 03");
    await yaz(n, "905325100003", "Fiyat teklifi istiyorum");
    // Etkileşimli buton: yanıt kimliği (id) yük sayılır; başlık sayılmaz.
    const d = kisi(ctx, "0532 510 00 04");
    await yaz(n, "905325100004", "", { ileti: { type: "interactive", interactive: { type: "button_reply", button_reply: { id: "fiyat_teklifi", title: "Bilgi" } } } });
    const e = kisi(ctx, "0532 510 00 05");
    await yaz(n, "905325100005", "", { ileti: { type: "interactive", interactive: { type: "button_reply", button_reply: { id: "x1", title: "Fiyat teklifi istiyorum" } } } });
    // Yeni ilgi butonları (yük metinle aynı; büyük/küçük harf ve boşluk duyarsız).
    const f = kisi(ctx, "0532 510 00 06");
    await yaz(n, "905325100006", "", { ileti: { type: "button", button: { payload: "KATALOG GÖNDERİN", text: "Katalog gönderin" } } });
    const g = kisi(ctx, "0532 510 00 07");
    await yaz(n, "905325100007", "", { ileti: { type: "button", button: { payload: "Numune istiyorum", text: "Numune istiyorum" } } });
    const h = kisi(ctx, "0532 510 00 08");
    await yaz(n, "905325100008", "", { ileti: { type: "button", button: { payload: " Bilgileri  yazacağım ", text: "Bilgileri yazacağım" } } });
    // Müşteri "Katalog gönderin" yazdı: buton değil.
    const i = kisi(ctx, "0532 510 00 09");
    await yaz(n, "905325100009", "Katalog gönderin");

    for (const x of [f, g, h]) expect(durum(x.id)).toBeInstanceOf(Date);
    expect(durum(i.id)).toBeNull();
    expect(durum(a.id)).toBeInstanceOf(Date);
    expect(durum(b.id)).toBeNull();
    expect(durum(c.id)).toBeNull();
    expect(durum(d.id)).toBeInstanceOf(Date);
    expect(durum(e.id)).toBeNull();
    // Buton yanıtı sohbete metniyle düşer (görünen metin).
    expect(gk.sohbetMesajlariGetir(ctx, sohbetId(ctx, n, a.id))[0]).toMatchObject({ tur: "button", metin: "Fiyat teklifi istiyorum" });

    // Saf işlev ve tek sabit.
    expect(lib.TEKLIF_ILGI_BUTONLARI).toEqual(expect.arrayContaining(["Fiyat teklifi istiyorum", "Katalog gönderin", "Numune istiyorum", "Bilgileri yazacağım"]));
    expect(lib.SOHBET_CIP_ADLARI.teklif).toBe("Teklif / ilgi");
    for (const b2 of lib.TEKLIF_ILGI_BUTONLARI) expect(lib.teklifIlgiButonuMu(b2), b2).toBe(true);
    expect(lib.teklifIlgiButonuMu("  FİYAT TEKLİFİ ALMAK İSTİYORUM ")).toBe(false);
    expect(lib.teklifIlgiButonuMu(null)).toBe(false);
    expect(lib.teklifIlgiButonuMu("")).toBe(false);
    const kaynak = fs.readFileSync(path.resolve(__dirname, "../src/server/servisler/whatsapp-webhook.ts"), "utf8");
    expect(kaynak).toContain("teklifIlgiButonuMu(m.button?.payload)");
    expect(kaynak).toContain("teklifIlgiButonuMu(m.interactive?.button_reply?.id)");
    expect(kaynak).not.toMatch(/teklifIlgiButonuMu\(m\.(button\?\.text|text|interactive\?\.button_reply\?\.title)/);
    // Geri doldurma yok: eski buton yanıtlarında yük saklanmadı (sohbet_mesajlari.metin ekrandaki metindir); metinden
    // tahmin "yalnızca yükten" kuralını bozar.
    expect(fs.readFileSync(path.resolve(__dirname, "../drizzle/0032_gelen_kutusu_arsiv.sql"), "utf8")).not.toMatch(/update/i);
    // Liste rozeti çiple aynı adı taşır.
    expect(fs.readFileSync(path.resolve(__dirname, "../src/app/(app)/gelen-kutusu/gelen-kutusu.tsx"), "utf8")).toContain("{SOHBET_CIP_ADLARI.teklif}</span>}");
  });

  it("pencere süresi: 24 saatten kalan, 3 saat eşiği, kapalı pencere", () => {
    const t0 = new Date("2026-11-27T09:00:00Z");
    const simdi = (saat: number) => t0.getTime() + saat * SAAT;
    expect(lib.pencereKalanMs(t0, simdi(0))).toBe(24 * SAAT);
    expect(lib.pencereKalanMs(t0.toISOString(), simdi(21))).toBe(3 * SAAT);
    expect(lib.pencereKapanmakUzere(t0, simdi(21))).toBe(false); // tam 3 saat: henüz değil
    expect(lib.pencereKapanmakUzere(t0, simdi(21) + 1)).toBe(true);
    expect(lib.pencereKapanmakUzere(t0, simdi(24) - 1)).toBe(true);
    expect(lib.pencereKalanMs(t0, simdi(24))).toBeNull();
    expect(lib.pencereKapanmakUzere(t0, simdi(24))).toBe(false);
    expect(lib.pencereKalanMs(null, simdi(0))).toBeNull();
    expect(lib.PENCERE_UYARI_MS).toBe(3 * SAAT);
  });
});

describe("gönderimi geri al", () => {
  afterEach(() => vi.useRealTimers());

  it("geri alınırsa Meta'ya istek gitmez ve veri döner; süre dolunca gider; yeni gönderim öncekini hemen gönderir", async () => {
    const { ctx, n } = await alan("GeriAl");
    const k = kisi(ctx, "0532 520 00 01");
    await yaz(n, "905325200001", "Soru");
    const id = sohbetId(ctx, n, k.id);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const istekler: Promise<Response>[] = [];
    const g = gecikmeliGonderici<string>({
      sureMs: lib.GERI_AL_MS,
      gonder: (metin) => void istekler.push(mesajRotasi.POST(istek("POST", { tur: "metin", metin, istemciKimligi: `istemci-${crypto.randomUUID()}` }), p(id))),
    });

    g.baslat("İlk taslak");
    expect(g.bekleyen()?.veri).toBe("İlk taslak");
    vi.advanceTimersByTime(lib.GERI_AL_MS - 1);
    expect(g.geriAl()).toBe("İlk taslak");
    vi.advanceTimersByTime(60_000);
    expect(istekler).toHaveLength(0);
    expect(mockWhatsapp.metinler).toHaveLength(0);
    expect(gk.sohbetMesajlariGetir(ctx, id).filter((m) => m.yon === "giden")).toHaveLength(0);
    expect(g.geriAl()).toBeNull();

    g.baslat("Gönderilecek");
    vi.advanceTimersByTime(lib.GERI_AL_MS);
    expect(istekler).toHaveLength(1);
    expect((await istekler[0]).status).toBe(201);
    expect(mockWhatsapp.metinler.map((m) => m.metin)).toEqual(["Gönderilecek"]);

    // Bekleyen varken yenisi: önceki hemen gider (sıra korunur), yenisi bekler.
    g.baslat("Bir");
    g.baslat("İki");
    expect(istekler).toHaveLength(2);
    await istekler[1];
    expect(g.bekleyen()?.veri).toBe("İki");
    g.hemen();
    await Promise.all(istekler);
    expect(mockWhatsapp.metinler.map((m) => m.metin)).toEqual(["Gönderilecek", "Bir", "İki"]);

    // Süre 0 (tercih kapalı): hemen gönderilir.
    const hemen: string[] = [];
    gecikmeliGonderici<string>({ sureMs: 0, gonder: (v) => hemen.push(v) }).baslat("x");
    expect(hemen).toEqual(["x"]);
  });

  it("tercih kullanıcı + çalışma alanı başına; varsayılan açık, yalnızca kendi üyeliği değişir; istemci bekletmeyi tercihe göre yapar", async () => {
    const { ctx } = await alan("Tercih");
    const uye = kullaniciOlustur("TercihUye");
    db.$client.prepare("insert into memberships (user_id, tenant_id, rol, olusturma_tarihi) values (?, ?, 'uye', ?)").run(uye.id, ctx.tenantId, Date.now());
    const uyeCtx = _baglamDamgala({ tenantId: ctx.tenantId, userId: uye.id, rol: "uye" });
    expect(gk.gonderimGeriAlGetir(ctx)).toBe(true);
    expect(gk.gonderimGeriAlAyarla(uyeCtx, false)).toBe(true);
    expect(gk.gonderimGeriAlGetir(uyeCtx)).toBe(false);
    expect(gk.gonderimGeriAlGetir(ctx)).toBe(true);
    const istemci = fs.readFileSync(path.resolve(__dirname, "../src/app/(app)/gelen-kutusu/gelen-kutusu.tsx"), "utf8");
    expect(istemci).toContain("geriAlMs={props.gonderimGeriAl ? GERI_AL_MS : 0}");
    expect(istemci).toContain('if (props.geriAlMs > 0) return bekletVeyaGonder({ tur: "metin"');
    expect(istemci).toContain('if (props.geriAlMs > 0) return bekletVeyaGonder({ tur: "ek"');
    // Bağlantı yoksa gönderilmez, yazı alanına geri konur.
    expect(istemci).toContain("if (!navigator.onLine)");
    expect(fs.readFileSync(path.resolve(__dirname, "../src/app/(app)/gelen-kutusu/page.tsx"), "utf8")).toContain("gonderimGeriAl={gonderimGeriAlGetir(ctx)}");
  });
});

describe("arşiv: toplu ve otomatik kapatma", () => {
  it("seçilenleri kapat: yalnızca bu çalışma alanının açık sohbetleri; başka alanın kimliği sayılmaz; yeni mesajla yeniden açılır", async () => {
    const diger = await alan("Diger");
    const dk = kisi(diger.ctx, "0532 530 00 09");
    await yaz(diger.n, "905325300009", "Diğer");
    const digerSohbet = sohbetId(diger.ctx, diger.n, dk.id);

    const { ctx, n } = await alan("Toplu");
    const a = kisi(ctx, "0532 530 00 01");
    const b = kisi(ctx, "0532 530 00 02");
    const c = kisi(ctx, "0532 530 00 03");
    for (const t of ["905325300001", "905325300002", "905325300003"]) await yaz(n, t, "Merhaba");
    const [sa, sb, sc] = [a, b, c].map((x) => sohbetId(ctx, n, x.id));
    gk.sohbetGuncelle(ctx, sc, { durum: "kapali" });

    const y = await kapatRotasi.POST(istek("POST", { idler: [sa, sb, sc, digerSohbet, "olmayan"] }));
    expect(y.status).toBe(200);
    expect(await y.json()).toEqual({ kapatilan: 2 });
    expect([sa, sb].map((id) => gk.sohbetGetir(ctx, id)?.durum)).toEqual(["kapali", "kapali"]);
    expect(gk.sohbetGetir(diger.ctx, digerSohbet)?.durum).toBe("acik");
    expect((await kapatRotasi.POST(istek("POST", { idler: [] }))).status).toBe(400);
    expect((await kapatRotasi.POST(istek("POST", { idler: Array.from({ length: lib.TOPLU_KAPATMA_AZAMI + 1 }, (_, i) => `s${i}`) }))).status).toBe(400);
    oturum.ctx = null;
    expect((await kapatRotasi.POST(istek("POST", { idler: [sa] }))).status).toBe(401);

    await yaz(n, "905325300001", "Yine ben");
    expect(gk.sohbetGetir(ctx, sa)).toMatchObject({ durum: "acik", okunmamis: 2 });
  });

  it("otomatik kapatma: ayarlı alanda N gün sessiz açık sohbet günlük bakımda kapanır; ayarsız alanda kapanmaz; müşteri yazınca açılır", async () => {
    const { ctx, n } = await alan("Oto");
    expect(iletiAyarlariGetir(ctx).otomatikKapatmaGun).toBeNull();
    iletiAyarlariGuncelle(ctx, { otomatikKapatmaGun: 3 });
    const simdi = Date.now();
    const eski = kisi(ctx, "0532 540 00 01");
    await yaz(n, "905325400001", "Eski", { zaman: new Date(simdi - 4 * GUN) });
    const yeni = kisi(ctx, "0532 540 00 02");
    await yaz(n, "905325400002", "Yeni", { zaman: new Date(simdi - 2 * GUN) });
    // Ayarsız çalışma alanı: 30 gün sessiz sohbet açık kalır.
    const ayarsiz = await alan("Ayarsiz");
    const sk = kisi(ayarsiz.ctx, "0532 540 00 03");
    await yaz(ayarsiz.n, "905325400003", "Çok eski", { zaman: new Date(simdi - 30 * GUN) });

    const surum = gk.gelenKutusuSurumuGetir(ctx);
    const sonuc = temizlikYap(new Date(simdi));
    expect(sonuc.kapatilanSohbet).toBe(1);
    expect(gk.sohbetGetir(ctx, sohbetId(ctx, n, eski.id))?.durum).toBe("kapali");
    expect(gk.sohbetGetir(ctx, sohbetId(ctx, n, yeni.id))?.durum).toBe("acik");
    expect(gk.sohbetGetir(ayarsiz.ctx, sohbetId(ayarsiz.ctx, ayarsiz.n, sk.id))?.durum).toBe("acik");
    expect(gk.gelenKutusuSurumuGetir(ctx)).toBeGreaterThan(surum); // açık gelen kutuları canlı yenilemeyle görür
    expect(temizlikYap(new Date(simdi)).kapatilanSohbet).toBe(0);

    await yaz(n, "905325400001", "Hâlâ ilgileniyorum");
    expect(gk.sohbetGetir(ctx, sohbetId(ctx, n, eski.id))?.durum).toBe("acik");

    // Ayar yalnızca yönetici; geçerli değerler 3 / 7 / 14.
    const uye = _baglamDamgala({ tenantId: ctx.tenantId, userId: kullaniciOlustur("OtoUye").id, rol: "uye" });
    expect(() => iletiAyarlariGuncelle(uye, { otomatikKapatmaGun: 7 })).toThrow(YetkiHatasi);
    expect(lib.OTOMATIK_KAPATMA_GUNLERI).toEqual([3, 7, 14]);
    expect([3, 7, 14, null, 5].map((g) => lib.otomatikKapatmaGunuMu(g))).toEqual([true, true, true, false, false]);
  });
});

describe("sohbet silme", () => {
  async function kurulum(ad: string) {
    const a = await alan(ad);
    const k = kisi(a.ctx, "0532 550 00 01");
    // Kampanya mesajı (istatistik message_queue'da), müşteri yanıtı, temsilcinin dosyası (diskte) ve iç not.
    const kampanya = kampanyaBaslat(
      a.ctx,
      KampanyaGirdisi.parse({
        kanal: "whatsapp_api",
        ad: "Tanıtım",
        filtre: { etiket: "e0001" },
        testModu: false,
        baglantiId: a.n.id,
        sablonId: sablonlariListele(a.ctx, a.n.waba).find((s) => s.ad === "randevu_hatirlatma")!.id,
        degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "Ayşe" }, "body:tarih": { kaynak: "sabit", deger: "Salı" } },
      }),
    );
    await isciTuru({ parti: 50, whatsappAralikMs: 0 });
    await yaz(a.n, "905325500001", "İlgileniyorum");
    const id = sohbetId(a.ctx, a.n, k.id);
    const yol = `${a.ctx.tenantId}/2026-11/${crypto.randomUUID()}`;
    fs.mkdirSync(path.dirname(medyaTamYolu(yol)), { recursive: true });
    fs.writeFileSync(medyaTamYolu(yol), "%PDF-1.4 deneme");
    gk.gidenMesajYaz(a.ctx, {
      baglantiId: a.n.id,
      leadId: k.id,
      kaynak: "temsilci",
      tur: "document",
      metin: null,
      wamid: "wamid.SIL-BELGE",
      teslimDurumu: "delivered",
      ilkDurum: "acik",
      medya: { yol, mime: "application/pdf", boyut: 15, sha256: "a".repeat(64), dosyaAdi: "fiyat.pdf", metaMedyaId: "m1" },
    });
    gk.notEkle(a.ctx, id, "Pazartesi aranacak");
    return { ...a, k, id, yol, kampanya };
  }
  const sil = (id: string, onay: string) => sohbetRotasi.DELETE(istek("DELETE", { onay }), p(id));
  const kuyruk = (kampanyaId: string) =>
    db.$client.prepare("select id, durum, teslim_durumu from message_queue where kampanya_id = ? order by id").all(kampanyaId);

  it("yalnızca yönetici; onay için sohbetin adı yazılmalı; başka çalışma alanının sohbeti 404", async () => {
    const s = await kurulum("SilYetki");
    const uye = kullaniciOlustur("SilUye");
    oturum.ctx = _baglamDamgala({ tenantId: s.ctx.tenantId, userId: uye.id, rol: "uye" });
    const y = await sil(s.id, "Kişi 0001");
    expect(y.status).toBe(403);
    expect(() => gk.sohbetSil(oturum.ctx!, s.id, { ad: "x", numara: "y" })).toThrow(YetkiHatasi);

    oturum.ctx = s.ctx;
    const yanlis = await sil(s.id, "Kişi 0002");
    expect(yanlis.status).toBe(400);
    expect((await yanlis.json()).hata).toContain("Kişi 0001");
    expect((await sil(s.id, "")).status).toBe(400);

    const baska = await alan("SilBaska");
    oturum.ctx = baska.ctx;
    expect((await sil(s.id, "Kişi 0001")).status).toBe(404);
    expect(gk.sohbetGetir(s.ctx, s.id)).not.toBeNull();
    expect(gk.sohbetMesajlariGetir(s.ctx, s.id)).toHaveLength(3);
    expect(fs.existsSync(medyaTamYolu(s.yol))).toBe(true);
  });

  it("mesajlar, medya dosyası ve notlar silinir; kayıt, izin ve kampanya istatistikleri kalır; denetim kaydı ve kayıt olayı yazılır", async () => {
    const s = await kurulum("SilKapsam");
    const kuyrukOnce = kuyruk(s.kampanya.id);
    expect(kuyrukOnce).toHaveLength(1);
    const kampanyaOnce = db.$client.prepare("select * from kampanyalar where id = ?").get(s.kampanya.id);

    const y = await sil(s.id, "  kişi 0001 ");
    expect(y.status).toBe(200);
    expect(await y.json()).toEqual({ silindi: { mesaj: 3, medya: 1, not: 1 } });

    expect(gk.sohbetGetir(s.ctx, s.id)).toBeNull();
    const say = (tablo: string) => (db.$client.prepare(`select count(*) n from ${tablo} where tenant_id = ?`).get(s.ctx.tenantId) as { n: number }).n;
    expect(say("sohbet_mesajlari")).toBe(0);
    expect(say("sohbet_medyalari")).toBe(0);
    expect(say("sohbet_notlari")).toBe(0);
    expect(say("bildirim_kuyrugu")).toBe(0);
    expect(fs.existsSync(medyaTamYolu(s.yol))).toBe(false);

    // Kayıt, WhatsApp izni ve kampanya istatistikleri korunur.
    expect(kayitGetir(s.ctx, s.k.id)).not.toBeNull();
    expect(whatsappKisisiGetir(s.ctx, s.k.id)?.izin).toBe("var");
    expect(kuyruk(s.kampanya.id)).toEqual(kuyrukOnce);
    expect(db.$client.prepare("select * from kampanyalar where id = ?").get(s.kampanya.id)).toEqual(kampanyaOnce);

    const [d] = denetimKayitlariListele(s.ctx, { olay: DENETIM_SOHBET_SILME });
    expect(d).toMatchObject({ kullaniciId: s.ctx.userId, deger: s.id });
    expect(d.aciklama).toContain('"Kişi 0001"');
    expect(d.aciklama).toContain("3 mesaj, 1 dosya, 1 iç not");
    expect(olaylariListele(s.ctx, s.k.id).some((o) => o.aciklama?.includes("Harita CRM'den silindi") && o.aciklama.includes("telefonundaki mesajlar silinmedi"))).toBe(true);

    // Müşteri yeniden yazınca yeni (boş geçmişli) sohbet açılır.
    await yaz(s.n, "905325500001", "Merhaba yine");
    const yeni = gk.sohbetBul(s.ctx, s.n.id, s.k.id)!;
    expect(yeni.id).not.toBe(s.id);
    expect(gk.sohbetMesajlariGetir(s.ctx, yeni.id).map((m) => m.metin)).toEqual(["Merhaba yine"]);
  });

  it("RET bilgisi ve engel listesi korunur; silindikten sonra da şablon gitmez", async () => {
    const { ctx, n } = await alan("SilRet");
    const k = kisi(ctx, "0532 560 00 01");
    await yaz(n, "905325600001", "RET");
    const engel = () => (db.$client.prepare("select count(*) n from engel_listesi where tenant_id = ?").get(ctx.tenantId) as { n: number }).n;
    const engelOnce = engel();
    expect(engelOnce).toBeGreaterThan(0);
    expect((await sil(sohbetId(ctx, n, k.id), "Kişi 0001")).status).toBe(200);
    expect(kayitGetir(ctx, k.id)?.iletiIzni).toBe("ret");
    expect(whatsappKisisiGetir(ctx, k.id)?.izin).toBe("ret");
    expect(engel()).toBe(engelOnce);

    await yaz(n, "905325600001", "Bir soru");
    const yeni = sohbetId(ctx, n, k.id);
    const r = await mesajRotasi.POST(
      istek("POST", { tur: "sablon", sablonId: sablonlariListele(ctx, n.waba).find((s) => s.ad === "randevu_hatirlatma")!.id, degiskenler: { "body:ad": "A", "body:tarih": "B" }, istemciKimligi: `istemci-${crypto.randomUUID()}` }),
      p(yeni),
    );
    expect(r.status).toBe(403);
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
  });

  it("son 24 saatte temsilci şablonu gönderilmiş sohbet silinmez (Meta limit payı bozulmasın)", async () => {
    const { ctx, n } = await alan("Sil24");
    const k = kisi(ctx, "0532 570 00 01");
    await yaz(n, "905325700001", "Soru");
    gk.gidenMesajYaz(ctx, { baglantiId: n.id, leadId: k.id, kaynak: "temsilci", tur: "template", metin: "Şablon", wamid: "wamid.S24", teslimDurumu: "sent", ilkDurum: "acik" });
    const id = sohbetId(ctx, n, k.id);
    const y = await sil(id, "Kişi 0001");
    expect(y.status).toBe(409);
    expect(gk.sohbetGetir(ctx, id)).not.toBeNull();
    // 24 saat sonra silinebilir.
    expect(servis.sohbetiSil(ctx, id, "Kişi 0001", new Date(Date.now() + 25 * SAAT))).toMatchObject({ mesaj: 2 });
  });

  it("arayüz metni: uyarı aynen; \"Herkesten sil\" hiçbir yerde yok", () => {
    expect(lib.SOHBET_SILME_UYARISI).toBe(
      "Bu sohbet ve dosyaları yalnızca Harita CRM'den kalıcı olarak silinir; müşterinin telefonundaki mesajlar silinmez.",
    );
    expect(lib.silmeOnayiDogruMu("ayşe  YILMAZ", "Ayşe Yılmaz")).toBe(true);
    expect(lib.silmeOnayiDogruMu("", "")).toBe(false);
    const dosyalar = (k: string): string[] =>
      fs.readdirSync(k, { withFileTypes: true }).flatMap((g) => (g.isDirectory() ? dosyalar(path.join(k, g.name)) : [path.join(k, g.name)]));
    for (const d of dosyalar(path.resolve(__dirname, "../src"))) {
      expect(fs.readFileSync(d, "utf8").toLocaleLowerCase("tr"), d).not.toContain("herkesten sil");
    }
    const istemci = fs.readFileSync(path.resolve(__dirname, "../src/app/(app)/gelen-kutusu/gelen-kutusu.tsx"), "utf8");
    expect(istemci).toContain("{props.yonetici && (");
    expect(istemci).toContain("{SOHBET_SILME_UYARISI}");
  });
});
