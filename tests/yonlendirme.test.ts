// Gelen kutusu: yönlendirilen numaraya tek kişilik şablon gönderimi (servisler/yonlendirme.ts).
// - Gelen mesajdaki numara biçimleri algılanır (lib/telefon-algilama).
// - Kayıt yoksa "Yönlendirme — <yönlendiren>" kaynağıyla açılır; izin seçilen kaynakla ve işlemi yapan kullanıcıyla yazılır;
//   tek alıcılı ("Tekil") kampanya kuyruğa girer, işçi gönderir; yeni sohbet açılır, yönlendiren sohbete iç not düşer.
// - "Müşteri yönlendirdi" yalnızca tacir/esnafta; RET, engel listesi, "Numarada WhatsApp yok", test modu, günlük sınır,
//   Meta payı ve şablon WABA'sı engellerinde hiçbir şey yazılmaz, neden döner.
// - Üyeler de gönderebilir; kullanıcı başına günde TEKIL_GUNLUK_SINIR. Başka çalışma alanı etkilenmez.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";
import type { YonlendirmeGirdisi as YGirdi, YonlendirmeOzeti as YOzet } from "@/server/servisler/yonlendirme";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { _baglamDamgala } = await import("@/server/repo/baglam");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const kampanyaRepo = await import("@/server/repo/kampanyalar");
const { kayitGetir, kisileriEkle } = await import("@/server/repo/kayitlar");
const { olaylariListele } = await import("@/server/repo/olaylar");
const { engelEkle, retIsle } = await import("@/server/repo/engel-listesi");
const { sayacAyir } = await import("@/server/repo/gonderim-sayaci");
const { whatsappIzniAyarla, whatsappKisisiGetir, whatsappYokIsaretle } = await import("@/server/repo/whatsapp-kisileri");
const gk = await import("@/server/repo/gelen-kutusu");
const { adresOzeti } = await import("@/server/messaging/adres");
const { aliciDegerlendir } = await import("@/server/messaging/alici-kurallari");
const { isciTuru } = await import("@/server/servisler/isci");
const { sohbetAyrintisi } = await import("@/server/servisler/gelen-kutusu");
const wa = await import("@/server/servisler/whatsapp-api");
const y = await import("@/server/servisler/yonlendirme");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const rota = await import("@/app/api/yonlendirme/route");
const ozetRota = await import("@/app/api/yonlendirme/ozet/route");
const izinRota = await import("@/app/api/kayitlar/[id]/whatsapp-izni/route");
const { HARIC_NEDEN_ADLARI, TEKIL_GUNLUK_SINIR, TEKIL_SINIR_DOLDU, yonlendirmeIzniSecilebilir } = await import("@/lib/mesajlasma");
const { telefonlaParcala, telefonlariBul } = await import("@/lib/telefon-algilama");
const { hazirCevapDoldur, ORNEK_HAZIR_CEVAPLAR } = await import("@/lib/hazir-cevaplar");
const { gunAnahtari } = await import("@/lib/zaman");
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");

const SIMDI = new Date("2026-11-23T09:00:00Z"); // İstanbul 12:00 (gönderim saati içinde)
const tur = () => isciTuru({ simdi: () => SIMDI, parti: 50, whatsappAralikMs: 0 });
const WABA = "1609185550499139";
const WABA_BASKA = "1485651723697727";
const HEDEF = "905321112233";
const HEDEF_YEREL = "0532 111 22 33";
let sayac = 0;

const sablon = (id: string, name: string) => ({
  id,
  name,
  language: "tr",
  status: "APPROVED",
  category: "MARKETING",
  parameter_format: "POSITIONAL",
  components: [
    { type: "BODY", text: "Merhaba {{1}}, bilgi için yazıyoruz." },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Promosyonları durdur" }] },
  ],
});

beforeEach(() => {
  db.$client.prepare("update kampanyalar set durum = 'iptal' where durum in ('calisiyor', 'zamanlandi', 'duraklatildi')").run();
  mockWhatsappSifirla();
  oturum.ctx = null;
});

async function numaraEkle(ctx: TenantContext, ad: string, waba: string) {
  const phone = String(1515541464980000 + ++sayac);
  const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad, wabaId: waba, phoneNumberId: phone, erisimAnahtari: "anahtar", appSecret: `secret-${ad}-${sayac}` });
  db.$client
    .prepare(
      "update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ?, kalite = 'GREEN', limit_katmani = 'TIER_10K', gorunen_numara = '+90 212 555 00 11', son_kontrol = ? where id = ?",
    )
    .run(Date.now(), Date.now(), SIMDI.getTime(), baglanti.id!);
  wa.testModuDegistir(ctx, baglanti.id!, false);
  await wa.sablonlariSenkronizeEt(ctx, baglanti.id!, SIMDI);
  return { id: baglanti.id!, sablonId: wa.sablonlar(ctx, baglanti.id!)[0].id };
}

/** Çalışma alanı + numara + yönlendiren kişinin sohbeti (mesajında numara geçer). */
async function kur(ad: string) {
  const { ctx, kullanici } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Tisotti Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  mockWhatsapp.wabaSablonlari.set(WABA, [sablon(`${WABA}-1`, "tanitim")]);
  mockWhatsapp.wabaSablonlari.set(WABA_BASKA, [sablon(`${WABA_BASKA}-1`, "baska_tanitim")]);
  const numara = await numaraEkle(ctx, `Merkez ${ad}`, WABA);
  const [yonlendiren] = kisileriEkle(ctx, [{ kaynak: "elle", yetkiliAdi: "Ayşe Yılmaz", ekTelefon: "0533 444 55 66", aliciTuru: "tacir_esnaf" }], "x");
  const s = gk.gelenMesajYaz(
    ctx,
    { baglantiId: numara.id, leadId: yonlendiren.id, wamid: `wamid.Y-${ad}-${++sayac}`, tur: "text", metin: `Satın almadan Ahmet Bey sorumlu: ${HEDEF_YEREL}`, medyaId: null, metaZamani: null },
    SIMDI,
  )!;
  oturum.ctx = ctx;
  return { ctx, kullanici, numara, yonlendiren, sohbetId: s.sohbetId };
}

type Kurulum = Awaited<ReturnType<typeof kur>>;
const girdi = (k: Kurulum, d: Partial<YGirdi> = {}): YGirdi =>
  y.YonlendirmeGirdisi.parse({
    sohbetId: k.sohbetId,
    telefon: HEDEF_YEREL,
    ad: "Ahmet Bey",
    aliciTuru: "tacir_esnaf",
    izinKaynagi: "musteri_yonlendirdi",
    baglantiId: k.numara.id,
    sablonId: k.numara.sablonId,
    degiskenEslem: { "body:1": { kaynak: "sabit", deger: "Ahmet Bey" } },
    ...d,
  });
const say = (tablo: string, ctx: TenantContext) =>
  (db.$client.prepare(`select count(*) n from ${tablo} where tenant_id = ?`).get(ctx.tenantId) as { n: number }).n;
/** Rotalar saati kendisi alır: çağrı süresince saat SIMDI'ye sabitlenir (günlük sayaçlar aynı güne düşsün). */
async function saatte<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SIMDI);
  try {
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}
const istek = (govde: unknown) =>
  new Request("https://crm.ornek.test/api/yonlendirme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });

describe("numara algılama", () => {
  it.each([
    ["05321112233"],
    ["0532 111 22 33"],
    ["0532-111-22-33"],
    ["0532.111.22.33"],
    ["532 111 22 33"],
    ["+90 532 111 22 33"],
    ["+905321112233"],
    ["+90 (532) 111-22-33"],
    ["0090 532 111 2233"],
    ["90 532 111 22 33"],
    ["0 (532) 111 22 33"],
    ["(0532) 111 22 33"],
  ])("%s → 905321112233", (ham) => {
    const metin = `Numarası ${ham}, akşam arayın.`;
    const bulunan = telefonlariBul(metin);
    expect(bulunan).toHaveLength(1);
    expect(bulunan[0].normal).toBe(HEDEF);
    expect(metin.slice(bulunan[0].bas, bulunan[0].son).trim()).toBe(ham);
  });

  it("cep olmayan ve uzun rakam dizileri numara sayılmaz", () => {
    expect(telefonlariBul("Sabit hat 0212 555 00 11")).toEqual([]);
    expect(telefonlariBul("Sipariş 1205321112233 no")).toEqual([]);
    expect(telefonlariBul("Kod 053211122334")).toEqual([]);
    expect(telefonlariBul("IBAN TR33 0006 1005 1978 6457 8413 26")).toEqual([]);
  });

  it("birden çok numara; parçalar birleşince metnin kendisi", () => {
    const metin = "Ali: 0532 111 22 33, Veli: +90 544 222 33 44.";
    const p = telefonlaParcala(metin);
    expect(p.filter((x) => "telefon" in x).map((x) => ("telefon" in x ? x.telefon.normal : ""))).toEqual([HEDEF, "905442223344"]);
    expect(p.map((x) => ("metin" in x ? x.metin : x.telefon.ham)).join("")).toBe(metin);
  });
});

describe("izin seçimi kuralı", () => {
  it("bireyselde 'Müşteri yönlendirdi' seçilemez (saf kural, girdi doğrulaması, rota)", async () => {
    expect(yonlendirmeIzniSecilebilir("musteri_yonlendirdi", "bireysel")).toBe(false);
    expect(yonlendirmeIzniSecilebilir("musteri_yonlendirdi", "tacir_esnaf")).toBe(true);
    expect(yonlendirmeIzniSecilebilir("dogrudan_izin", "bireysel")).toBe(true);
    const k = await kur("IzinKurali");
    const ham = { ...girdi(k), aliciTuru: "bireysel" };
    const sonuc = y.YonlendirmeGirdisi.safeParse(ham);
    expect(sonuc.success).toBe(false);
    expect(sonuc.error?.issues[0].message).toBe(y.MUSTERI_YONLENDIRDI_BIREYSEL);
    const yanit = await rota.POST(istek(ham));
    expect(yanit.status).toBe(400);
    expect(((await yanit.json()) as { hata: string }).hata).toBe(y.MUSTERI_YONLENDIRDI_BIREYSEL);
    expect(say("kampanyalar", k.ctx)).toBe(0);
  });

  it("kayıtlı bireysel kişide pencerede tacir seçilse de kayıttaki tür geçerli: reddedilir", async () => {
    const k = await kur("KayitliBireysel");
    kisileriEkle(k.ctx, [{ kaynak: "elle", yetkiliAdi: "Ahmet", ekTelefon: HEDEF_YEREL, aliciTuru: "bireysel" }], "x");
    expect(() => y.yonlendirmeOzeti(k.ctx, girdi(k), SIMDI)).toThrow(y.MUSTERI_YONLENDIRDI_BIREYSEL);
  });

  it("alıcı kuralı: 'Müşteri yönlendirdi' izni bireysel kayıtta geçersiz (kayıt sonradan bireysele çevrilse de)", () => {
    const wa = { izin: "var" as const, izinKaynagi: "musteri_yonlendirdi" as const, iysBeyanTarihi: new Date(), whatsappYokTarihi: null, bsuid: null };
    const temel = { iletiIzni: "bekliyor" as const, eposta: null, ekTelefon: HEDEF_YEREL, placeId: null, whatsapp: wa };
    expect(aliciDegerlendir({ ...temel, aliciTuru: "bireysel" }, "whatsapp_api", () => false)).toEqual({ uygun: false, neden: "whatsapp_izni_yok" });
    expect(aliciDegerlendir({ ...temel, aliciTuru: "tacir_esnaf" }, "whatsapp_api", () => false)).toMatchObject({ uygun: true });
  });

  it("kayıt ekranı (API) yönlendirme izin kaynaklarını yeni kaynak olarak kabul etmez", async () => {
    const k = await kur("IzinRotasi");
    const [kisi] = kisileriEkle(k.ctx, [{ kaynak: "elle", yetkiliAdi: "X", ekTelefon: "0544 999 88 77", aliciTuru: "tacir_esnaf" }], "x");
    const yanit = await izinRota.PUT(
      new Request(`https://crm.ornek.test/api/kayitlar/${kisi.id}/whatsapp-izni`, { method: "PUT", body: JSON.stringify({ izin: "var", kaynak: "musteri_yonlendirdi" }) }),
      { params: Promise.resolve({ id: kisi.id }) },
    );
    expect(yanit.status).toBe(400);
    expect(whatsappKisisiGetir(k.ctx, kisi.id)).toBeNull();
  });
});

describe("gönderim: kayıt, kaynak, kampanya, sohbet", () => {
  it("kayıt yoksa 'Yönlendirme — <yönlendiren>' kaynağıyla açılır; izin, tekil kampanya, sohbet ve iç not yazılır; işçi gönderir", async () => {
    const k = await kur("YeniKayit");
    const ozet = y.yonlendirmeOzeti(k.ctx, girdi(k), SIMDI);
    expect(ozet).toMatchObject({ engel: null, yeniKayit: true, aliciTuru: "tacir_esnaf", sablonAdi: "tanitim (tr)" });
    expect(ozet.onizleme).toContain("Merhaba Ahmet Bey");
    expect(say("kampanyalar", k.ctx)).toBe(0); // ön kontrol hiçbir şey yazmaz
    expect(say("leads", k.ctx)).toBe(1);

    const sonuc = y.yonlendirmeGonder(k.ctx, girdi(k), SIMDI);
    expect(sonuc.yeniKayit).toBe(true);
    const kayit = kayitGetir(k.ctx, sonuc.leadId)!;
    expect(kayit).toMatchObject({
      kaynak: "yonlendirme",
      kaynakAyrintisi: "Yönlendirme — Ayşe Yılmaz, 0533 444 55 66",
      yonlendirenSohbetId: k.sohbetId,
      yetkiliAdi: "Ahmet Bey",
      telefonE164: HEDEF,
      aliciTuru: "tacir_esnaf",
    });
    const olaylar = olaylariListele(k.ctx, kayit.id);
    expect(olaylar.find((o) => o.tur === "eklendi")?.aciklama).toContain("Yönlendirme — Ayşe Yılmaz");
    const izin = whatsappKisisiGetir(k.ctx, kayit.id)!;
    expect(izin).toMatchObject({ izin: "var", izinKaynagi: "musteri_yonlendirdi", izinKaydedenId: k.ctx.userId });
    expect(izin.izinNotu).toContain("Yönlendirme — Ayşe Yılmaz");

    const kampanya = kampanyaRepo.kampanyaGetir(k.ctx, sonuc.kampanyaId)!;
    expect(kampanya).toMatchObject({ tekil: true, kanal: "whatsapp_api", baglantiId: k.numara.id, sandbox: false, olusturan: k.ctx.userId });
    expect(kampanya.ad).toMatch(/^Yönlendirme — /);
    expect(kampanya.sayilar.kuyrukta).toBe(1);

    const yeni = gk.sohbetGetir(k.ctx, sonuc.sohbetId)!;
    expect(yeni).toMatchObject({ leadId: kayit.id, baglantiId: k.numara.id, durum: "acik" });
    expect(gk.notlariListele(k.ctx, k.sohbetId).map((n) => n.metin)).toEqual([`→ ${HEDEF_YEREL} numarasına şablon gönderime alındı`]);
    expect(sohbetAyrintisi(k.ctx, sonuc.sohbetId, SIMDI)?.sohbet.yonlendiren).toEqual({ metin: kayit.kaynakAyrintisi, sohbetId: k.sohbetId });

    await tur();
    expect(mockWhatsapp.gonderilenler.map((g) => g.alici.deger)).toEqual([HEDEF]);
    const sonra = kampanyaRepo.kampanyaGetir(k.ctx, sonuc.kampanyaId)!;
    expect(sonra.sayilar.gonderildi).toBe(1);
    expect(gk.sohbetMesajlariGetir(k.ctx, sonuc.sohbetId).some((m) => m.yon === "giden" && m.kampanyaId === sonuc.kampanyaId)).toBe(true);
  });

  it("numara kayıtlıysa yeni kayıt açılmaz; alıcı türü kayıttan, kayda olay yazılır", async () => {
    const k = await kur("MevcutKayit");
    const [mevcut] = kisileriEkle(k.ctx, [{ kaynak: "elle", isletmeAdi: "Ahmet Ticaret", ekTelefon: HEDEF_YEREL, aliciTuru: "tacir_esnaf" }], "x");
    const bilgi = y.yonlendirmeBilgisi(k.ctx, k.sohbetId, HEDEF_YEREL, SIMDI);
    expect(bilgi.kayit).toEqual({ id: mevcut.id, ad: "Ahmet Ticaret", aliciTuru: "tacir_esnaf" });
    const sonuc = y.yonlendirmeGonder(k.ctx, girdi(k, { izinKaynagi: "dogrudan_izin" }), SIMDI);
    expect(sonuc).toMatchObject({ leadId: mevcut.id, yeniKayit: false });
    expect(say("leads", k.ctx)).toBe(2);
    expect(kayitGetir(k.ctx, mevcut.id)?.kaynak).toBe("elle");
    expect(whatsappKisisiGetir(k.ctx, mevcut.id)?.izinKaynagi).toBe("dogrudan_izin");
    expect(olaylariListele(k.ctx, mevcut.id).some((o) => o.tur === "whatsapp_api" && o.aciklama?.includes("Yönlendirme — Ayşe Yılmaz"))).toBe(true);
  });

  it("sohbetteki kişinin kendi numarası reddedilir", async () => {
    const k = await kur("KendiNumarasi");
    expect(() => y.yonlendirmeOzeti(k.ctx, girdi(k, { telefon: "0533 444 55 66" }), SIMDI)).toThrow(/kendi numarası/);
  });
});

describe("engeller: neden döner, hiçbir şey yazılmaz", () => {
  async function engelli(k: Kurulum, beklenen: string | RegExp, d: Partial<YGirdi> = {}) {
    const once = { leads: say("leads", k.ctx), kampanya: say("kampanyalar", k.ctx), izin: say("whatsapp_kisileri", k.ctx), not: say("sohbet_notlari", k.ctx) };
    const ozet = y.yonlendirmeOzeti(k.ctx, girdi(k, d), SIMDI);
    if (typeof beklenen === "string") expect(ozet.engel).toBe(beklenen);
    else expect(ozet.engel).toMatch(beklenen);
    expect(() => y.yonlendirmeGonder(k.ctx, girdi(k, d), SIMDI)).toThrow(y.YonlendirmeHatasi);
    const yanit = await saatte(() => rota.POST(istek(girdi(k, d))));
    expect(yanit.status).toBe(400);
    expect({ leads: say("leads", k.ctx), kampanya: say("kampanyalar", k.ctx), izin: say("whatsapp_kisileri", k.ctx), not: say("sohbet_notlari", k.ctx) }).toEqual(once);
  }
  const neden = (n: keyof typeof HARIC_NEDEN_ADLARI) => `Gönderilemez: ${HARIC_NEDEN_ADLARI[n]}.`;

  it("RET verdi (ileti reddi)", async () => {
    const k = await kur("Ret");
    const [kisi] = kisileriEkle(k.ctx, [{ kaynak: "elle", yetkiliAdi: "Ahmet", ekTelefon: HEDEF_YEREL, aliciTuru: "tacir_esnaf" }], "x");
    retIsle(k.ctx, { leadId: kisi.id, adresler: [], kaynak: "kayit_ret", aciklama: "x" });
    await engelli(k, neden("ret"));
    expect(whatsappKisisiGetir(k.ctx, kisi.id)?.izin).not.toBe("var");
  });

  it("engel listesi (kayıt yok): kayıt da açılmaz", async () => {
    const k = await kur("Engel");
    engelEkle(k.ctx, [{ tur: "telefon", ozet: adresOzeti(k.ctx.tenantId, "telefon", HEDEF) }], "abonelik");
    await engelli(k, neden("engel"));
  });

  it("Numarada WhatsApp yok", async () => {
    const k = await kur("WaYok");
    const [kisi] = kisileriEkle(k.ctx, [{ kaynak: "elle", yetkiliAdi: "Ahmet", ekTelefon: HEDEF_YEREL, aliciTuru: "tacir_esnaf" }], "x");
    whatsappYokIsaretle(k.ctx, kisi.id, SIMDI);
    await engelli(k, neden("whatsapp_yok"));
  });

  it("bireysel ve İYS beyanı yok; beyanla gönderilebilir", async () => {
    const k = await kur("Iys");
    await engelli(k, neden("iys_beyani_yok"), { aliciTuru: "bireysel", izinKaynagi: "dogrudan_izin" });
    expect(y.yonlendirmeOzeti(k.ctx, girdi(k, { aliciTuru: "bireysel", izinKaynagi: "dogrudan_izin", iysBeyani: true }), SIMDI).engel).toBeNull();
  });

  it("test modu: test numarası değilse engel; test numarasıysa gönderilebilir", async () => {
    const k = await kur("TestModu");
    wa.testModuDegistir(k.ctx, k.numara.id, true);
    await engelli(k, neden("test_modu"));
    wa.testNumaralariKaydet(k.ctx, k.numara.id, [HEDEF_YEREL]);
    const ozet = y.yonlendirmeOzeti(k.ctx, girdi(k), SIMDI);
    expect(ozet).toMatchObject({ engel: null, testModu: true });
  });

  it("günlük WhatsApp sınırı dolu (ertesi güne bırakılmaz)", async () => {
    const k = await kur("GunlukSinir");
    db.$client.prepare("update ileti_ayarlari set gunluk_whatsapp_api_siniri = 1 where tenant_id = ?").run(k.ctx.tenantId);
    sayacAyir(k.ctx, "whatsapp_api", gunAnahtari(SIMDI), 1);
    await engelli(k, /gönderim sınırı doldu/);
  });

  it("Meta limitinin bu uygulamaya ayrılan payı dolu", async () => {
    const k = await kur("MetaPayi");
    db.$client.prepare("update whatsapp_baglantilari set limit_katmani = 'TIER_250', uygulama_payi = 1 where id = ?").run(k.numara.id); // pay: 2
    for (let i = 0; i < 2; i++) {
      gk.gidenMesajYaz(k.ctx, { baglantiId: k.numara.id, leadId: k.yonlendiren.id, kaynak: "temsilci", tur: "template", metin: "x", wamid: `wamid.pay-${i}-${++sayac}`, teslimDurumu: "sent", ilkDurum: "acik" }, SIMDI);
    }
    await engelli(k, /payı doldu/);
  });

  it("şablon WABA eşleşmesi: başka WABA'nın şablonu bu numarayla gönderilemez", async () => {
    const k = await kur("Waba");
    const baska = await numaraEkle(k.ctx, "Şube", WABA_BASKA);
    await engelli(k, /WhatsApp hesabında yok/, { sablonId: baska.sablonId });
    expect(y.yonlendirmeOzeti(k.ctx, girdi(k, { baglantiId: baska.id, sablonId: baska.sablonId }), SIMDI).engel).toBeNull();
  });
});

describe("yetki ve kullanıcı başına günlük sınır", () => {
  it("üye de gönderebilir; toplu WhatsApp kampanyası yine yalnızca yönetici", async () => {
    const k = await kur("Uye");
    const uyeKullanici = kullaniciOlustur("UyeKisi");
    const uye = _baglamDamgala({ tenantId: k.ctx.tenantId, userId: uyeKullanici.id, rol: "uye" });
    const bilgi = y.yonlendirmeBilgisi(uye, k.sohbetId, HEDEF_YEREL, SIMDI);
    expect(bilgi.numaralar.map((n) => n.id)).toContain(k.numara.id);
    expect(bilgi.kalanHak).toBe(TEKIL_GUNLUK_SINIR);
    const sonuc = y.yonlendirmeGonder(uye, girdi(k), SIMDI);
    expect(kampanyaRepo.kampanyaGetir(k.ctx, sonuc.kampanyaId)?.olusturan).toBe(uye.userId);
    expect(whatsappKisisiGetir(k.ctx, sonuc.leadId)?.izinKaydedenId).toBe(uye.userId);
    const { kampanyaBaslat } = await import("@/server/servisler/kampanya");
    expect(() =>
      kampanyaBaslat(uye, { kanal: "whatsapp_api", ad: "Toplu", baglantiId: k.numara.id, sablonId: k.numara.sablonId, filtre: {}, testModu: false }),
    ).toThrow(/yönetici/);
  });

  it(`kullanıcı başına günde ${TEKIL_GUNLUK_SINIR}: dolunca neden döner; başka kullanıcı ve ertesi gün etkilenmez`, async () => {
    const k = await kur("KullaniciSiniri");
    const uyeKullanici = kullaniciOlustur("SinirUye");
    const uye = _baglamDamgala({ tenantId: k.ctx.tenantId, userId: uyeKullanici.id, rol: "uye" });
    const tekil = (ctx: TenantContext, t: Date) =>
      kampanyaRepo.kampanyaOlustur(ctx, { kanal: "whatsapp_api", ad: "T", konu: null, sablon: "s", bosIsimHitabi: null, filtre: {}, sandbox: true, planlananTarih: null, tekil: true }, [], t);
    for (let i = 0; i < TEKIL_GUNLUK_SINIR - 1; i++) tekil(uye, SIMDI);
    tekil(uye, new Date("2026-11-22T20:00:00Z")); // İstanbul'da dün 23:00: bugüne sayılmaz
    kampanyaRepo.kampanyaOlustur(uye, { kanal: "whatsapp_api", ad: "Toplu", konu: null, sablon: "s", bosIsimHitabi: null, filtre: {}, sandbox: true, planlananTarih: null }, [], SIMDI); // tekil değil
    expect(y.yonlendirmeBilgisi(uye, k.sohbetId, HEDEF_YEREL, SIMDI).kalanHak).toBe(1);
    y.yonlendirmeGonder(uye, girdi(k), SIMDI); // 20.
    expect(y.yonlendirmeBilgisi(uye, k.sohbetId, HEDEF_YEREL, SIMDI).kalanHak).toBe(0);

    const ikinci = girdi(k, { telefon: "0544 222 33 44" });
    const once = say("leads", k.ctx);
    expect(y.yonlendirmeOzeti(uye, ikinci, SIMDI).engel).toBe(TEKIL_SINIR_DOLDU);
    expect(() => y.yonlendirmeGonder(uye, ikinci, SIMDI)).toThrow(TEKIL_SINIR_DOLDU);
    oturum.ctx = uye;
    const yanit = await saatte(() => ozetRota.POST(istek(ikinci)));
    expect(((await yanit.json()) as { ozet: YOzet }).ozet.engel).toBe(TEKIL_SINIR_DOLDU);
    expect(say("leads", k.ctx)).toBe(once);
    // Yönetici (başka kullanıcı) aynı gün gönderebilir; üye ertesi gün yeniden gönderebilir.
    expect(y.yonlendirmeOzeti(k.ctx, ikinci, SIMDI).engel).toBeNull();
    expect(y.yonlendirmeOzeti(uye, ikinci, new Date("2026-11-24T09:00:00Z")).engel).toBeNull();
  });
});

describe("izolasyon", () => {
  it("başka çalışma alanının sohbeti 404; oradaki kayıt görünmez ve değişmez", async () => {
    const a = await kur("YonA");
    const b = await kur("YonB");
    const [bKisi] = kisileriEkle(b.ctx, [{ kaynak: "elle", yetkiliAdi: "B Kişisi", ekTelefon: HEDEF_YEREL, aliciTuru: "bireysel" }], "x");
    whatsappIzniAyarla(b.ctx, bKisi.id, { izin: "yok" });

    expect(() => y.yonlendirmeBilgisi(a.ctx, b.sohbetId, HEDEF_YEREL, SIMDI)).toThrow(expect.objectContaining({ durum: 404 }));
    expect(() => y.yonlendirmeGonder(a.ctx, girdi(a, { sohbetId: b.sohbetId }), SIMDI)).toThrow(expect.objectContaining({ durum: 404 }));
    expect(y.yonlendirmeBilgisi(a.ctx, a.sohbetId, HEDEF_YEREL, SIMDI).kayit).toBeNull();
    // B'nin numarası / şablonu A'da kullanılamaz.
    expect(y.yonlendirmeOzeti(a.ctx, girdi(a, { baglantiId: b.numara.id }), SIMDI).engel).toMatch(/bulunamadı/);

    const sonuc = y.yonlendirmeGonder(a.ctx, girdi(a), SIMDI);
    expect(kayitGetir(a.ctx, sonuc.leadId)?.tenantId).toBe(a.ctx.tenantId);
    expect(kayitGetir(b.ctx, sonuc.leadId)).toBeNull();
    expect(kayitGetir(b.ctx, bKisi.id)).toMatchObject({ aliciTuru: "bireysel", kaynak: "elle" });
    expect(whatsappKisisiGetir(b.ctx, bKisi.id)?.izin).toBe("yok");
    expect(gk.notlariListele(b.ctx, b.sohbetId)).toEqual([]);
    expect(say("kampanyalar", b.ctx)).toBe(0);
  });
});

describe("hazır cevap örneği", () => {
  it("wa.me bağlantısındaki numara gönderen numaradan dolar", () => {
    const ornek = ORNEK_HAZIR_CEVAPLAR[0];
    expect(ornek.metin).toContain("wa.me/{gonderen_numara}");
    expect(hazirCevapDoldur(ornek.metin, "+90 212 555 00 11")).toContain("wa.me/902125550011");
    expect(hazirCevapDoldur(ornek.metin, null)).toBe(ornek.metin);
  });

  it("sohbet ayrıntısı gönderen numarayı rakam olarak taşır", async () => {
    const k = await kur("GonderenNo");
    expect(sohbetAyrintisi(k.ctx, k.sohbetId, SIMDI)?.sohbet.gonderenNumara).toBe("902125550011");
  });
});
