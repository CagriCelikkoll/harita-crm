// Çalışma alanı düzeyinde "İYS kontrolü": varsayılan açık; yalnızca yönetici değiştirir, kapatmak sorumluluk beyanı
// onayını ister, her değişiklik denetim kaydına yazılır. Kapalıyken WhatsApp kampanya ve şablon gönderiminde İYS beyanı
// aranmaz; WhatsApp izni, ret / engel listesi ve test modu aynen uygulanır; başka çalışma alanı etkilenmez.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _baglamDamgala, YetkiHatasi, type TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { iletiAyarlariGetir, iletiAyarlariGuncelle, iysKontroluDegistir } = await import("@/server/repo/ileti-ayarlari");
const { denetimKayitlariListele } = await import("@/server/repo/denetim");
const { engelEkle, retIsle } = await import("@/server/repo/engel-listesi");
const { kisileriEkle } = await import("@/server/repo/kayitlar");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const { sablonlariListele } = await import("@/server/repo/whatsapp-sablonlari");
const { whatsappIzniAyarla } = await import("@/server/repo/whatsapp-kisileri");
const gk = await import("@/server/repo/gelen-kutusu");
const { adresOzeti } = await import("@/server/messaging/adres");
const { aliciDegerlendir } = await import("@/server/messaging/alici-kurallari");
const { mesajlasmaAyarlariDto } = await import("@/server/servisler/ayarlar-dto");
const { ticariIletiEksikleri } = await import("@/server/servisler/ileti");
const { isciTuru } = await import("@/server/servisler/isci");
const { KampanyaGirdisi, kampanyaBaslat, kampanyaOzeti } = await import("@/server/servisler/kampanya");
const gelenKutusu = await import("@/server/servisler/gelen-kutusu");
const wa = await import("@/server/servisler/whatsapp-api");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const rota = await import("@/app/api/ayarlar/iys-kontrolu/route");
const { IYS_KAPALI_UYARISI, IYS_KAPATMA_ONAY_METNI } = await import("@/lib/mesajlasma");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const SIMDI = new Date("2026-11-23T09:00:00Z"); // 12:00 İstanbul
const tur = () => isciTuru({ simdi: () => SIMDI, parti: 50, whatsappAralikMs: 0 });
let sayac = 0;

beforeEach(() => {
  // İşçi turu bütün çalışma alanlarını işler: önceki testlerin kampanyaları sayımlara girmesin.
  db.$client.prepare("update kampanyalar set durum = 'iptal' where durum in ('calisiyor', 'zamanlandi', 'duraklatildi')").run();
  mockWhatsappSifirla();
  oturum.ctx = null;
});

async function alan(ad: string) {
  const { ctx } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  const waba = String(720000 + ++sayac);
  const phoneId = String(890000 + sayac);
  const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad: "Merkez", wabaId: waba, phoneNumberId: phoneId, erisimAnahtari: "anahtar", appSecret: "app-secret" });
  db.$client
    .prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ?, kalite = 'GREEN', limit_katmani = 'TIER_10K', son_kontrol = ? where id = ?")
    .run(Date.now(), Date.now(), SIMDI.getTime(), baglanti.id!);
  wa.testModuDegistir(ctx, baglanti.id!, false);
  await wa.sablonlariSenkronizeEt(ctx, baglanti.id!, SIMDI);
  oturum.ctx = ctx;
  return { ctx, n: { id: baglanti.id!, waba } };
}

/** Bireysel kişiler: hepsinin WhatsApp izni var, hiçbirinde İYS beyanı yok (aksi belirtilmedikçe). */
function bireyseller(ctx: TenantContext, etiket: string, telefonlar: string[], izin: "var" | "yok" = "var") {
  const eklenen = kisileriEkle(
    ctx,
    telefonlar.map((t, i) => ({ kaynak: "elle" as const, ekTelefon: t, isletmeAdi: `Kişi ${i + 1}`, etiketler: [etiket], aliciTuru: "bireysel" as const })),
    "test",
  );
  if (izin === "var") for (const k of eklenen) whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form" });
  return eklenen;
}

function girdi(ctx: TenantContext, n: { id: string; waba: string }, etiket: string) {
  const sablon = sablonlariListele(ctx, n.waba).find((s) => s.ad === "randevu_hatirlatma")!;
  return KampanyaGirdisi.parse({
    kanal: "whatsapp_api",
    ad: `K-${etiket}`,
    filtre: { etiket },
    testModu: false,
    baglantiId: n.id,
    sablonId: sablon.id,
    degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "Ali" }, "body:tarih": { kaynak: "sabit", deger: "yarın" } },
  });
}

const durumlar = (kampanyaId: string, leadId: string) =>
  db.$client.prepare("select durum, neden from message_queue where kampanya_id = ? and lead_id = ?").get(kampanyaId, leadId) as { durum: string; neden: string | null };

const istek = (govde: unknown) =>
  rota.POST(new Request("https://crm.ornek.test/api/ayarlar/iys-kontrolu", { method: "POST", body: JSON.stringify(govde) }));

describe("ayar ve denetim kaydı", () => {
  it("varsayılan açık; ayar satırı yokken de açık; son değişiklik yok", () => {
    const { ctx } = kiraciOlustur("Varsayilan");
    expect(iletiAyarlariGetir(ctx).iysKontrolu).toBe(true);
    expect(mesajlasmaAyarlariDto(ctx)).toMatchObject({ iysKontrolu: true, iysKontroluSonDegisiklik: null });
    iletiAyarlariGuncelle(ctx, { gonderenUnvani: "X" }); // satır oluşunca da açık
    expect(iletiAyarlariGetir(ctx).iysKontrolu).toBe(true);
  });

  it("yönetici dışı rol değiştiremez (repo ve rota); ayar ve denetim kaydı değişmez", async () => {
    const { ctx } = kiraciOlustur("Uye");
    const uye = _baglamDamgala({ tenantId: ctx.tenantId, userId: ctx.userId, rol: "uye" });
    expect(() => iysKontroluDegistir(uye, { acik: false, onay: true })).toThrow(YetkiHatasi);
    oturum.ctx = uye;
    const y = await istek({ acik: false, onay: true });
    expect(y.status).toBe(403);
    expect((await y.json()).hata).toMatch(/yalnızca yönetici/);
    expect(iletiAyarlariGetir(ctx).iysKontrolu).toBe(true);
    expect(denetimKayitlariListele(ctx)).toEqual([]);
  });

  it("kapatmak onay ister; kim / ne zaman / ne denetim kaydına yazılır; aynı değer tekrar yazılmaz", async () => {
    const { ctx, kullanici } = kiraciOlustur("Denetim");
    oturum.ctx = ctx;
    // Onaysız kapatma reddedilir (rota 400, repo hata).
    let y = await istek({ acik: false });
    expect(y.status).toBe(400);
    expect((await y.json()).hata).toContain(IYS_KAPATMA_ONAY_METNI);
    expect(() => iysKontroluDegistir(ctx, { acik: false })).toThrow(/sorumluluk beyanı/);
    expect(iletiAyarlariGetir(ctx).iysKontrolu).toBe(true);

    y = await istek({ acik: false, onay: true });
    expect(y.status).toBe(200);
    expect((await y.json()).ayarlar).toMatchObject({ iysKontrolu: false, iysKontroluSonDegisiklik: { acik: false, kullanici: kullanici.name } });
    expect(iysKontroluDegistir(ctx, { acik: false, onay: true }, SIMDI)).toBe(false); // zaten kapalı: kayıt yok
    const ac = new Date(Date.now() + 60_000);
    expect(iysKontroluDegistir(ctx, { acik: true }, ac)).toBe(true);
    const kayitlar = denetimKayitlariListele(ctx, { olay: "iys_kontrolu" });
    expect(kayitlar.map((d) => [d.deger, d.kullaniciId, d.kullaniciAdi])).toEqual([
      ["acik", ctx.userId, kullanici.name],
      ["kapali", ctx.userId, kullanici.name],
    ]);
    expect(kayitlar[0].tarih).toEqual(ac);
    expect(kayitlar[1].aciklama).toContain(IYS_KAPATMA_ONAY_METNI);
    expect(mesajlasmaAyarlariDto(ctx).iysKontroluSonDegisiklik).toMatchObject({ acik: true, tarih: ac.toISOString() });
  });
});

describe("alıcı kuralı", () => {
  const kayit = { iletiIzni: "bekliyor" as const, aliciTuru: "bireysel" as const, eposta: null, ekTelefon: "0532 111 22 33", placeId: null };
  const izinli = { izin: "var" as const, iysBeyanTarihi: null, whatsappYokTarihi: null, bsuid: null };
  const engelYok = () => false;

  it("yalnızca İYS beyanı adımı atlanır; izin, ret ve engel aynen", () => {
    expect(aliciDegerlendir({ ...kayit, whatsapp: izinli }, "whatsapp_api", engelYok)).toEqual({ uygun: false, neden: "iys_beyani_yok" });
    expect(aliciDegerlendir({ ...kayit, whatsapp: izinli }, "whatsapp_api", engelYok, { iysKontrolu: false })).toMatchObject({ uygun: true });
    expect(aliciDegerlendir({ ...kayit, whatsapp: { ...izinli, izin: "yok" } }, "whatsapp_api", engelYok, { iysKontrolu: false })).toEqual({
      uygun: false,
      neden: "whatsapp_izni_yok",
    });
    expect(aliciDegerlendir({ ...kayit, whatsapp: { ...izinli, izin: "ret" } }, "whatsapp_api", engelYok, { iysKontrolu: false })).toEqual({ uygun: false, neden: "ret" });
    expect(aliciDegerlendir({ ...kayit, iletiIzni: "ret", whatsapp: izinli }, "whatsapp_api", engelYok, { iysKontrolu: false })).toEqual({ uygun: false, neden: "ret" });
    expect(aliciDegerlendir({ ...kayit, whatsapp: izinli }, "whatsapp_api", () => true, { iysKontrolu: false })).toEqual({ uygun: false, neden: "engel" });
    // E-posta / SMS'te bireysel onay şartı (ileti izni) bu ayardan etkilenmez.
    expect(aliciDegerlendir({ ...kayit, eposta: "a@ornek.test" }, "eposta", engelYok)).toEqual({ uygun: false, neden: "bireysel_izinsiz" });
  });
});

describe("kampanya ve şablon gönderimi", { timeout: 30_000 }, () => {
  it("açıkken İYS beyanı olmayan bireysel kişi hariç; kapalıyken izinliye gider, izinsiz / ret / engel listesindekine gitmez", async () => {
    const { ctx, n } = await alan("Kampanya");
    const [izinli, izinsiz, retli, engelli] = [
      ...bireyseller(ctx, "iys", ["0532 300 00 01"]),
      ...bireyseller(ctx, "iys", ["0532 300 00 02"], "yok"),
      ...bireyseller(ctx, "iys", ["0532 300 00 03", "0532 300 00 04"]),
    ];
    retIsle(ctx, { leadId: retli.id, adresler: [{ tur: "telefon", ozet: adresOzeti(ctx.tenantId, "telefon", "905323000003") }], kaynak: "whatsapp_ret", aciklama: "Test reddi" });
    engelEkle(ctx, [{ tur: "telefon", ozet: adresOzeti(ctx.tenantId, "telefon", "905323000004") }], "abonelik");

    // Açık (varsayılan): İYS beyanı olmayan izinli bireysel kişi hariç; kurala uyan alıcı yok (engel listesindeki kişi
    // de önce bu adımda elenir: kural sırası izin → İYS → engel).
    expect(kampanyaOzeti(ctx, girdi(ctx, n, "iys"), SIMDI)).toMatchObject({
      gonderilecek: 0,
      iysKontrolu: true,
      haricler: { iys_beyani_yok: 2, whatsapp_izni_yok: 1, ret: 1 },
    });

    iysKontroluDegistir(ctx, { acik: false, onay: true });
    const ozet = kampanyaOzeti(ctx, girdi(ctx, n, "iys"), SIMDI);
    expect(ozet).toMatchObject({ gonderilecek: 1, iysKontrolu: false, haricler: { iys_beyani_yok: 0, whatsapp_izni_yok: 1, ret: 1, engel: 1 } });
    const k = kampanyaBaslat(ctx, girdi(ctx, n, "iys"), SIMDI);
    expect(durumlar(k.id, izinli.id)).toEqual({ durum: "kuyrukta", neden: null });
    expect(durumlar(k.id, izinsiz.id)).toEqual({ durum: "haric", neden: "whatsapp_izni_yok" });
    expect(durumlar(k.id, retli.id)).toEqual({ durum: "haric", neden: "ret" });
    expect(durumlar(k.id, engelli.id)).toEqual({ durum: "haric", neden: "engel" });

    // İşçi de aynı ayarla yeniden değerlendirir: izinliye gider.
    await tur();
    expect(mockWhatsapp.gonderilenler.map((g) => g.alici.deger)).toEqual(["905323000001"]);
    expect(durumlar(k.id, izinli.id).durum).toBe("gonderildi");
  });

  it("kampanyadan sonra İYS kontrolü yeniden açılırsa işçi beyansız bireysel kişiye göndermez", async () => {
    const { ctx, n } = await alan("YenidenAc");
    const [kisi] = bireyseller(ctx, "acik", ["0532 310 00 01"]);
    iysKontroluDegistir(ctx, { acik: false, onay: true });
    const k = kampanyaBaslat(ctx, girdi(ctx, n, "acik"), SIMDI);
    iysKontroluDegistir(ctx, { acik: true });
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(durumlar(k.id, kisi.id)).toEqual({ durum: "haric", neden: "iys_beyani_yok" });
  });

  it("kapalıyken test modu aynen: test numarası olmayan kişi hariç", async () => {
    const { ctx, n } = await alan("TestModu");
    const [test, diger] = bireyseller(ctx, "tm", ["0532 320 00 01", "0532 320 00 02"]);
    iysKontroluDegistir(ctx, { acik: false, onay: true });
    wa.testModuDegistir(ctx, n.id, true);
    wa.testNumaralariKaydet(ctx, n.id, ["0532 320 00 01"]);
    const k = kampanyaBaslat(ctx, girdi(ctx, n, "tm"), SIMDI);
    expect(durumlar(k.id, test.id).durum).toBe("kuyrukta");
    expect(durumlar(k.id, diger.id)).toEqual({ durum: "haric", neden: "test_modu" });
  });

  it("gelen kutusundan şablon: kapalıyken beyansız izinli bireysel kişiye gider, izinsize gitmez; panelde uyarı bilgisi", async () => {
    const { ctx, n } = await alan("GelenKutusu");
    const [izinli] = bireyseller(ctx, "gk", ["0532 330 00 01"]);
    const [izinsiz] = bireyseller(ctx, "gk", ["0532 330 00 02"], "yok");
    const sohbet = (leadId: string) =>
      gk.gelenMesajYaz(ctx, { baglantiId: n.id, leadId, wamid: `wamid.IYS${++sayac}`, tur: "text", metin: "Merhaba", medyaId: null, metaZamani: null }, SIMDI)!.sohbetId;
    const sablonId = sablonlariListele(ctx, n.waba).find((s) => s.ad === "randevu_hatirlatma")!.id;
    const gonder = (sohbetId: string) =>
      gelenKutusu.sohbetMesajiGonder(ctx, sohbetId, { tur: "sablon", sablonId, degiskenler: { "body:ad": "Ali", "body:tarih": "yarın" }, istemciKimligi: `iys-${++sayac}-istemci` }, SIMDI);
    const s1 = sohbet(izinli.id);
    await expect(gonder(s1)).rejects.toThrow(/İYS/);
    expect(gelenKutusu.sohbetAyrintisi(ctx, s1, SIMDI)!.sohbet.iysKontrolu).toBe(true);

    iysKontroluDegistir(ctx, { acik: false, onay: true });
    expect(gelenKutusu.sohbetAyrintisi(ctx, s1, SIMDI)!.sohbet.iysKontrolu).toBe(false);
    await gonder(s1);
    expect(mockWhatsapp.gonderilenler.map((g) => g.alici.deger)).toEqual(["905323300001"]);
    await expect(gonder(sohbet(izinsiz.id))).rejects.toThrow(/izni/i);
    expect(mockWhatsapp.gonderilenler).toHaveLength(1);
    expect(IYS_KAPALI_UYARISI).toBe("İYS kontrolü kapalı; yasal sorumluluk işletmenizdedir.");
  });

  it("başka çalışma alanını etkilemez: A kapalıyken B'de beyansız bireysel kişi hariç kalır", async () => {
    const a = await alan("IzoA");
    const b = await alan("IzoB");
    iysKontroluDegistir(a.ctx, { acik: false, onay: true });
    bireyseller(b.ctx, "izo", ["0532 340 00 01"]);
    expect(iletiAyarlariGetir(b.ctx).iysKontrolu).toBe(true);
    expect(kampanyaOzeti(b.ctx, girdi(b.ctx, b.n, "izo"), SIMDI)).toMatchObject({ gonderilecek: 0, iysKontrolu: true, haricler: { iys_beyani_yok: 1 } });
    expect(denetimKayitlariListele(b.ctx)).toEqual([]);
    expect(denetimKayitlariListele(a.ctx)).toHaveLength(1);
    expect(baglantiGetir(b.ctx, a.n.id)).toBeNull();
  });
});

/** Tacir / esnaf kişiler (İYS beyanı aranmaz): yalnızca gönderen bilgilerinin etkisi görülsün. */
function tacirler(ctx: TenantContext, etiket: string, telefonlar: string[]) {
  const eklenen = kisileriEkle(
    ctx,
    telefonlar.map((t) => ({ kaynak: "elle" as const, ekTelefon: t, isletmeAdi: "Esnaf", etiketler: [etiket], aliciTuru: "tacir_esnaf" as const })),
    "test",
  );
  for (const k of eklenen) whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form" });
  return eklenen;
}

describe("İYS numarası: gerçek gönderimde yalnızca İYS kontrolü açıkken zorunlu", { timeout: 30_000 }, () => {
  it("açık: İYS numarası boşsa eksik (Ayarlar, özet), kampanya başlatılamaz, işçi göndermez", async () => {
    const { ctx, n } = await alan("IysNoAcik");
    const [kisi] = tacirler(ctx, "noacik", ["0532 400 00 01"]);
    // Önce numarayla kampanya kurulur, sonra numara silinir: işçi gönderimden hemen önce yeniden bakar.
    const k = kampanyaBaslat(ctx, girdi(ctx, n, "noacik"), SIMDI);
    iletiAyarlariGuncelle(ctx, { iysNo: null });
    expect(mesajlasmaAyarlariDto(ctx).eksikAyarlar).toEqual(["İYS kayıt numarası"]);
    expect(kampanyaOzeti(ctx, girdi(ctx, n, "noacik"), SIMDI).eksikAyarlar).toEqual(["İYS kayıt numarası"]);
    expect(() => kampanyaBaslat(ctx, girdi(ctx, n, "noacik"), SIMDI)).toThrow(/Ticari ileti bölümünü tamamlayın: İYS kayıt numarası/);
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(durumlar(k.id, kisi.id)).toEqual({ durum: "basarisiz", neden: "ayar_eksik" });
  });

  it("kapalı: İYS numarası boş kalabilir (eksik sayılmaz, kampanya başlar, işçi gönderir); unvan, iletişim ve sorumluluk onayı zorunlu kalır", async () => {
    const { ctx, n } = await alan("IysNoKapali");
    const [kisi] = tacirler(ctx, "nokapali", ["0532 410 00 01"]);
    iysKontroluDegistir(ctx, { acik: false, onay: true });
    iletiAyarlariGuncelle(ctx, { iysNo: null });
    expect(mesajlasmaAyarlariDto(ctx).eksikAyarlar).toEqual([]);
    expect(kampanyaOzeti(ctx, girdi(ctx, n, "nokapali"), SIMDI).eksikAyarlar).toEqual([]);
    const k = kampanyaBaslat(ctx, girdi(ctx, n, "nokapali"), SIMDI);
    await tur();
    expect(durumlar(k.id, kisi.id).durum).toBe("gonderildi");

    iletiAyarlariGuncelle(ctx, { gonderenUnvani: null, iletisimBilgisi: null, sorumlulukOnayi: false });
    expect(mesajlasmaAyarlariDto(ctx).eksikAyarlar).toEqual(["gönderen unvanı", "iletişim bilgisi", "İYS / 6563 sorumluluk onayı"]);
    expect(() => kampanyaBaslat(ctx, girdi(ctx, n, "nokapali"), SIMDI)).toThrow("Ticari ileti bölümünü tamamlayın: gönderen unvanı, iletişim bilgisi, İYS / 6563 sorumluluk onayı.");
  });

  it("aynı kural e-posta / SMS için de (işçinin genel kontrolü aynı fonksiyonu kullanır); SMS ret numarası yine zorunlu", () => {
    const { ctx } = kiraciOlustur("IysNoKanal");
    iletiAyarlariGuncelle(ctx, { gonderenUnvani: "U", iletisimBilgisi: "I", sorumlulukOnayi: true });
    expect(ticariIletiEksikleri(iletiAyarlariGetir(ctx), "sms")).toEqual(["İYS kayıt numarası", "SMS ret numarası"]);
    iysKontroluDegistir(ctx, { acik: false, onay: true });
    expect(ticariIletiEksikleri(iletiAyarlariGetir(ctx), "sms")).toEqual(["SMS ret numarası"]);
    expect(ticariIletiEksikleri(iletiAyarlariGetir(ctx), "eposta")).toEqual([]);
  });
});
