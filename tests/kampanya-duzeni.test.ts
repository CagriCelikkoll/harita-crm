// Kampanya sihirbazı ve kampanya ayrıntısının düzeni: görünüm hesapları (lib/kampanya-gorunumu) ve bileşenlerin
// sunucuda üretilen HTML'i üzerinde metin / rol denetimleri (iki sütun + yapışkan önizleme, yapışkan düğme çubuğu,
// dar ekranda açılır önizleme, telefon görünümü, şablon ayrıntıları, Meta teslim kartları).
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { KampanyaDto } from "@/server/servisler/kampanya-dto";
import type { SablonDto } from "@/server/servisler/whatsapp-api";

vi.mock("next/navigation", async (asil) => ({
  ...(await asil<typeof import("next/navigation")>()),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
}));

const { haricSatirlari, kanalNedeni, kisiTeslimDurumu, metaPayiKalani, teslimKartlari } = await import("@/lib/kampanya-gorunumu");
const { ALICI_SUZGECLERI, HARIC_NEDENLERI, aliciSuzgeciAdi, aliciSuzgeciCoz } = await import("@/lib/mesajlasma");
const { db } = await import("@/server/db");
const kampanyalar = await import("@/server/repo/kampanyalar");
const kayitlar = await import("@/server/repo/kayitlar");
const { mesajDto } = await import("@/server/servisler/kampanya-dto");
const { kiraciOlustur } = await import("./yardimci/fabrika");
const { KampanyaSihirbazi } = await import("@/app/(app)/kampanyalar/yeni/kampanya-sihirbazi");
const { SablonAyrintilari, WhatsappOnizlemesi, MetinOnizlemesi } = await import("@/app/(app)/kampanyalar/yeni/mesaj-onizlemesi");
const { KampanyaDetayi } = await import("@/app/(app)/kampanyalar/[id]/kampanya-detayi");

const sifirlar = () => Object.fromEntries(HARIC_NEDENLERI.map((n) => [n, 0])) as Record<(typeof HARIC_NEDENLERI)[number], number>;

const SABLON = {
  id: "s1",
  wabaId: "w1",
  ad: "gorselli_tanitim",
  dil: "tr",
  kategori: "MARKETING",
  durum: "APPROVED",
  degiskenler: [{ bilesen: "body", ad: "1" }],
  abonelikButonu: null,
  destekNedeni: null,
  kalite: null,
  kullanilabilir: true,
  baslikBicimi: "IMAGE",
  bilesenler: [
    { type: "HEADER", format: "IMAGE" },
    { type: "BODY", text: "Merhaba {{1}}, yeni portföyümüz hazır." },
    { type: "FOOTER", text: "Harita CRM" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Promosyonları durdur" }, { type: "URL", text: "İncele", url: "https://ornek.test" }] },
  ],
} as unknown as SablonDto;

const NUMARA = {
  id: "b1",
  ad: "Merkez",
  etiket: "Merkez · …4567",
  wabaId: "w1",
  gorunenNumara: "+90 532 000 45 67",
  numaraDogrulandi: true,
  testModu: false,
  kalite: "GREEN" as const,
  hesapKilidi: false,
  kurulumTamam: true,
  sablonlar: [SABLON],
};

const sihirbaz = (p: Partial<Parameters<typeof KampanyaSihirbazi>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(KampanyaSihirbazi, {
      adim: "2",
      ilkKanal: "eposta",
      etiketler: ["Sıcak"],
      saglayicilar: { eposta: { tanimli: true }, sms: { tanimli: false } } as Parameters<typeof KampanyaSihirbazi>[0]["saglayicilar"],
      eksikAyarlar: [],
      smsAltbilgisi: "Örnek Ltd · RET yazıp 4567'ye gönderin",
      whatsapp: { yonetici: true, numaralar: [NUMARA] },
      ...p,
    }),
  );

describe("görünüm hesapları", () => {
  it("hariç nedenleri: kanala göre süzülür; sıfırlar yalnızca 'tümü' listesinde", () => {
    const h = { ...sifirlar(), ret: 2, cep_degil: 5, whatsapp_yok: 3, iletisim_yok: 1 };
    const e = haricSatirlari("eposta", h);
    expect(e.tumu.map((s) => s.neden)).not.toContain("cep_degil");
    expect(e.tumu.map((s) => s.neden)).not.toContain("whatsapp_yok");
    expect(e.sifirdanBuyuk.map((s) => [s.neden, s.n])).toEqual([
      ["ret", 2],
      ["iletisim_yok", 1],
    ]);
    expect(e.tumu.length).toBeGreaterThan(e.sifirdanBuyuk.length);
    const w = haricSatirlari("whatsapp_api", h);
    expect(w.sifirdanBuyuk.map((s) => s.ad)).toContain("Numarada WhatsApp yok");
    expect(w.tumu.map((s) => s.neden)).not.toContain("bireysel_izinsiz");
    expect(kanalNedeni("sms", "cep_degil")).toBe(true);
    expect(kanalNedeni("sms", "test_modu")).toBe(false);
  });

  it("Meta payından kalan: sınırsızsa null, eksiye düşmez", () => {
    expect(metaPayiKalani(null, 10)).toBeNull();
    expect(metaPayiKalani(250, 40)).toBe(210);
    expect(metaPayiKalani(250, 300)).toBe(0);
  });

  it("teslim kartları: teslim / okundu / teslim edilemedi her zaman; hata kodları birleşir ve çoktan aza sıralanır", () => {
    expect(teslimKartlari([]).map((k) => [k.ad, k.n])).toEqual([
      ["Teslim edildi", 0],
      ["Okundu", 0],
      ["Teslim edilemedi", 0],
    ]);
    const k = teslimKartlari([
      { durum: "sent", kod: null, n: 2 },
      { durum: "delivered", kod: null, n: 5 },
      { durum: "read", kod: null, n: 7 },
      { durum: "failed", kod: 131049, n: 1 },
      { durum: "failed", kod: 131026, n: 3 },
      { durum: "failed", kod: null, n: 1 },
    ]);
    expect(k.map((x) => [x.durum, x.n])).toEqual([
      ["sent", 2],
      ["delivered", 5],
      ["read", 7],
      ["failed", 5],
    ]);
    expect(k[3].kodlar).toEqual([
      { kod: 131026, n: 3, aciklama: "numarada WhatsApp yok" },
      { kod: 131049, n: 1, aciklama: "Meta teslim etmedi (pazarlama sınırı)" },
    ]);
  });
});

describe("sihirbaz düzeni", () => {
  it("Alıcılar adımı: kompakt adım çubuğu, iki sütun + yapışkan önizleme, yapışkan düğme çubuğu, canlı sayı rozeti", () => {
    const h = sihirbaz();
    expect(h).toContain('aria-label="Adımlar"');
    expect(h).toMatch(/<li[^>]*aria-current="step"[^>]*>.*?Alıcılar/);
    expect(h).toContain("Kimlere gidecek?");
    expect(h).toContain("lg:grid-cols-[minmax(0,1fr)_340px]");
    expect(h).toMatch(/<aside aria-label="Mesaj önizlemesi" class="[^"]*lg:sticky/);
    // Dar ekranda kapalı başlar, düğmeyle açılır; geniş ekranda her zaman görünür.
    expect(h).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="sihirbaz-onizleme"[^>]*>Önizlemeyi göster<\/button>/);
    expect(h).toMatch(/id="sihirbaz-onizleme" class="hidden [^"]*lg:flex"/);
    expect(h).toContain('aria-label="E-posta önizlemesi"');
    expect(h).toContain("Merhaba Örnek İşletme,");
    expect(h).toMatch(/<div role="region" aria-label="Sihirbaz düğmeleri" class="sticky bottom-0/);
    expect(h).toContain(">Geri</button>");
    expect(h).toContain(">İleri</button>");
    expect(h).toMatch(/role="status"[^>]*>.*Hesaplanıyor…/);
    // Durum ve Alıcı türü yan yana iki grup; Kampanya adı ve Etiket aynı satırda.
    expect(h).toMatch(/md:grid-cols-2"><div[^>]*role="group" aria-labelledby="sihirbaz-durum".*aria-labelledby="sihirbaz-alici-turu"/);
    expect(h).toMatch(/Kampanya adı<input.*Etiket<select/);
    expect(h).not.toContain("Şablonun tam metni");
  });

  it("Kanal adımında önizleme yok; WhatsApp'ta önizleme telefon görünümünde, şablon seçilmeden yer tutucu", () => {
    const bir = sihirbaz({ adim: "1", ilkKanal: null });
    expect(bir).not.toContain('aria-label="Mesaj önizlemesi"');
    expect(bir).toContain(">Vazgeç</a>");
    const wa = sihirbaz({ ilkKanal: "whatsapp_api" });
    expect(wa).toContain('aria-label="WhatsApp önizlemesi"');
    expect(wa).toContain("Merkez · …4567");
    expect(wa).toContain("Mesaj adımında şablon seçince önizleme burada görünür.");
    expect(wa).toContain("son adımda kesinleşir");
  });

  it("WhatsApp önizlemesi: görsel (yoksa yer tutucu), örnek değerli gövde, alt bilgi ve ayrı buton satırları", () => {
    const yerTutucu = renderToStaticMarkup(createElement(WhatsappOnizlemesi, { numara: "Merkez", sablon: SABLON, eslem: {}, gorselAdresi: null }));
    expect(yerTutucu).toContain("Görsel yüklenince burada görünür");
    expect(yerTutucu).toMatch(/Merhaba <\/span><mark[^>]*>Örnek İşletme<\/mark>/);
    expect(yerTutucu).toContain("Harita CRM");
    expect(yerTutucu).toMatch(/<ul aria-label="Şablon butonları"[^>]*><li[^>]*>Promosyonları durdur<\/li><li[^>]*>İncele<\/li><\/ul>/);
    const gorselli = renderToStaticMarkup(
      createElement(WhatsappOnizlemesi, { numara: "Merkez", sablon: SABLON, eslem: { "body:1": { kaynak: "sabit", deger: "Ege" } }, gorselAdresi: "/api/g/1" }),
    );
    expect(gorselli).toContain('src="/api/g/1"');
    expect(gorselli).toMatch(/<mark[^>]*>Ege<\/mark>/);
    expect(gorselli).not.toContain("Görsel yüklenince");
  });

  it("Şablon ayrıntıları: açılır kutuda kategori, dil, değişkenler, butonlar ve ham metin", () => {
    const h = renderToStaticMarkup(createElement(SablonAyrintilari, { sablon: SABLON, eslem: { "body:1": { kaynak: "sabit", deger: "Ege" } } }));
    expect(h).toMatch(/^<details[^>]*><summary[^>]*>Şablon ayrıntıları<\/summary>/);
    expect(h).toContain("Pazarlama");
    expect(h).toMatch(/<dt[^>]*>Dil<\/dt><dd>tr<\/dd>/);
    expect(h).toContain("Gövde {{1}} → Sabit metin: &quot;Ege&quot;");
    expect(h).toContain("İncele <span");
    expect(h).toContain("Merhaba {{1}}, yeni portföyümüz hazır.");
  });

  it("SMS önizlemesi: işletme adı girilmiş ve girilmemiş kayıt", () => {
    const h = renderToStaticMarkup(
      createElement(MetinOnizlemesi, { kanal: "sms", konu: "", baslik: "Önizleme", adli: "Merhaba Örnek İşletme,", adsiz: "Merhaba," }),
    );
    expect(h).toContain('aria-label="SMS önizlemesi"');
    expect(h).toContain("İşletme adı girilmemiş kayıtta");
  });
});

describe("kampanya ayrıntısı düzeni", () => {
  const kampanya = (p: Partial<KampanyaDto> = {}): KampanyaDto => ({
    id: "k1",
    ad: "Kasım",
    kanal: "whatsapp_api",
    konu: null,
    sablon: "gorselli_tanitim (tr)",
    bosIsimHitabi: null,
    filtre: {},
    sandbox: false,
    durum: "tamamlandi",
    planlananTarih: null,
    olusturmaTarihi: "2026-11-20T09:00:00.000Z",
    baslamaTarihi: null,
    tamamlanmaTarihi: null,
    sayilar: { kuyrukta: 0, gonderiliyor: 0, gonderildi: 9, basarisiz: 1, haric: 2, iptal: 0 },
    nedenler: [],
    duraklatmaNedeni: null,
    teslim: [
      { durum: "delivered", kod: null, n: 4 },
      { durum: "read", kod: null, n: 3 },
      { durum: "failed", kod: 131026, n: 2 },
    ],
    ucretli: [],
    numara: "Merkez · …4567",
    ...p,
  });
  const detay = (k: KampanyaDto) =>
    renderToStaticMarkup(
      createElement(KampanyaDetayi, {
        ilk: { kampanya: k, mesajlar: [], toplam: 0, sayfa: 1, sayfaSayisi: 1, boyut: 50 },
        durum: "",
        isci: { sonNabiz: null, simdi: "2026-11-20T09:00:00.000Z", yonetici: true },
      }),
    );

  it("üstte yan yana sayı kartları; WhatsApp'ta Meta teslim bildirimleri aynı satırda kartlar (hata kodlarıyla)", () => {
    const h = detay(kampanya());
    expect(h).toMatch(/role="group" aria-label="Gönderim sayıları" class="grid grid-cols-2 gap-3 md:grid-cols-4"/);
    const teslim = h.slice(h.indexOf('aria-label="Meta teslim bildirimleri"'));
    expect(teslim).toMatch(/Teslim edildi<\/p><p[^>]*>4<\/p>/);
    expect(teslim).toMatch(/Okundu<\/p><p[^>]*>3<\/p>/);
    expect(teslim).toMatch(/Teslim edilemedi<\/p><p[^>]*>2<\/p>/);
    expect(teslim).toContain("131026 (numarada WhatsApp yok): ");
    // Teslim bildirimleri Geçmiş sekmesinden taşındı; durum kartında, sekmelerden önce.
    expect(h.indexOf("Meta teslim bildirimleri")).toBeLessThan(h.indexOf('aria-label="Kampanya ayrıntıları"'));
  });

  it("test modundaki ve e-posta kampanyasında teslim kartları yok", () => {
    expect(detay(kampanya({ sandbox: true }))).not.toContain("Meta teslim bildirimleri");
    expect(detay(kampanya({ kanal: "eposta", teslim: [], numara: null }))).not.toContain("Meta teslim bildirimleri");
  });
});

describe("alıcı bazında Meta teslim durumu", () => {
  /** Dört alıcılı kampanya; satırların durumu ve Meta teslim durumu SQL ile verilir. */
  function kurulum() {
    const { ctx } = kiraciOlustur(`T${Math.random().toString(36).slice(2, 7)}`);
    const kisiler = kayitlar.kisileriEkle(
      ctx,
      ["Okuyan", "Teslim", "Yok", "Bekleyen", "Iletilen"].map((ad, i) => ({ kaynak: "elle" as const, isletmeAdi: ad, eposta: `t${i}@ornek.test` })),
      "t",
    );
    const k = kampanyalar.kampanyaOlustur(
      ctx,
      { kanal: "eposta", ad: "Teslim", konu: "K", sablon: "S", bosIsimHitabi: null, filtre: {}, sandbox: false, planlananTarih: null },
      kisiler.map((x) => ({ leadId: x.id })),
    );
    const satir = (leadId: string) => kampanyalar.kampanyaMesajlari(ctx, k.id).mesajlar.find((m) => m.leadId === leadId)!;
    const ayarla = (i: number, durum: string, teslim: string | null, kod: number | null = null) =>
      db.$client
        .prepare("update message_queue set durum = ?, teslim_durumu = ?, teslim_hata_kodu = ? where id = ?")
        .run(durum, teslim, kod, satir(kisiler[i].id).id);
    ayarla(0, "gonderildi", "read");
    ayarla(1, "gonderildi", "delivered");
    ayarla(2, "gonderildi", "failed", 131026);
    ayarla(3, "kuyrukta", null);
    ayarla(4, "gonderildi", "sent");
    return { ctx, k, kisiler };
  }
  const adlar = (r: { mesajlar: { isletmeAdi: string | null }[] }) => r.mesajlar.map((m) => m.isletmeAdi).sort();

  it("kampanyaMesajlari teslim durumunu ve hata kodunu döndürür; DTO'ya geçer", () => {
    const { ctx, k } = kurulum();
    const m = kampanyalar.kampanyaMesajlari(ctx, k.id).mesajlar;
    expect(m.find((x) => x.isletmeAdi === "Yok")).toMatchObject({ durum: "gonderildi", teslimDurumu: "failed", teslimHataKodu: 131026 });
    expect(m.find((x) => x.isletmeAdi === "Bekleyen")).toMatchObject({ teslimDurumu: null, teslimHataKodu: null });
    expect(mesajDto(m.find((x) => x.isletmeAdi === "Okuyan")!)).toMatchObject({ teslimDurumu: "read" });
  });

  it("süzgeç: Okundu / Teslim edildi (okunmadı) / Teslim edilemedi Meta durumuna göre; mesaj durumu süzgeci aynı kalır", () => {
    const { ctx, k } = kurulum();
    expect(adlar(kampanyalar.kampanyaMesajlari(ctx, k.id, { durum: "okundu" }))).toEqual(["Okuyan"]);
    expect(adlar(kampanyalar.kampanyaMesajlari(ctx, k.id, { durum: "teslim_edildi" }))).toEqual(["Teslim"]);
    expect(adlar(kampanyalar.kampanyaMesajlari(ctx, k.id, { durum: "teslim_edilemedi" }))).toEqual(["Yok"]);
    expect(kampanyalar.kampanyaMesajlari(ctx, k.id, { durum: "teslim_edilemedi" })).toMatchObject({ toplam: 1, sayfaSayisi: 1 });
    expect(adlar(kampanyalar.kampanyaMesajlari(ctx, k.id, { durum: "gonderildi" }))).toEqual(["Iletilen", "Okuyan", "Teslim", "Yok"]);
    expect(adlar(kampanyalar.kampanyaMesajlari(ctx, k.id, { durum: "kuyrukta" }))).toEqual(["Bekleyen"]);
    // Başka çalışma alanı: aynı kampanya kimliğiyle hiçbir satır görünmez.
    const { ctx: baska } = kiraciOlustur(`U${Math.random().toString(36).slice(2, 7)}`);
    expect(kampanyalar.kampanyaMesajlari(baska, k.id, { durum: "okundu" })).toMatchObject({ toplam: 0, mesajlar: [] });
  });

  it("adresteki süzgeç: tanınan değerler; bilinmeyen süzgeçsiz; sayfa ve API aynı çözümleyiciyi kullanır", () => {
    expect(aliciSuzgeciCoz("okundu")).toBe("okundu");
    expect(aliciSuzgeciCoz("teslim_edildi")).toBe("teslim_edildi");
    expect(aliciSuzgeciCoz("haric")).toBe("haric");
    expect(aliciSuzgeciCoz("read")).toBeUndefined();
    expect(aliciSuzgeciCoz(null)).toBeUndefined();
    expect(ALICI_SUZGECLERI.slice(-3).map(aliciSuzgeciAdi)).toEqual(["Okundu", "Teslim edildi (okunmadı)", "Teslim edilemedi"]);
    for (const d of ["src/app/(app)/kampanyalar/[id]/page.tsx", "src/app/api/kampanyalar/[id]/route.ts"]) {
      expect(fs.readFileSync(d, "utf8")).toContain("aliciSuzgeciCoz(");
    }
  });

  it("Durum sütunu: Meta'nın son durumu (kodlu kısa açıklama) varsa o, yoksa mesaj durumu", () => {
    expect(kisiTeslimDurumu("read", null)).toEqual({ durum: "read", ad: "Okundu", kod: null });
    expect(kisiTeslimDurumu("failed", 131026)).toEqual({ durum: "failed", ad: "Teslim edilemedi", kod: "131026: numarada WhatsApp yok" });
    expect(kisiTeslimDurumu("failed", 999)).toMatchObject({ kod: "999" });
    expect(kisiTeslimDurumu("sent", null)).toBeNull();
    expect(kisiTeslimDurumu(null, null)).toBeNull();

    const { ctx, k } = kurulum();
    const sayfa = kampanyalar.kampanyaMesajlari(ctx, k.id);
    const h = renderToStaticMarkup(
      createElement(KampanyaDetayi, {
        ilk: {
          kampanya: { ...kampanyaDto(), id: k.id },
          ...sayfa,
          mesajlar: sayfa.mesajlar.map(mesajDto),
        },
        durum: "okundu",
        isci: { sonNabiz: null, simdi: "2026-11-20T09:00:00.000Z", yonetici: true },
      }),
    );
    const satir = (ad: string) => h.slice(h.indexOf(`>${ad}</a>`)).split("</tr>")[0];
    expect(satir("Okuyan")).toMatch(/<span[^>]*>Okundu<\/span>/);
    expect(satir("Teslim")).toMatch(/<span[^>]*>Teslim edildi<\/span>/);
    expect(satir("Yok")).toMatch(/Teslim edilemedi<\/span>.*131026: numarada WhatsApp yok/);
    expect(satir("Bekleyen")).toMatch(/<span[^>]*>Kuyrukta<\/span>/);
    expect(satir("Iletilen")).toMatch(/<span[^>]*>Gönderildi<\/span>/);
    // Süzgeç: Meta teslim seçenekleri (WhatsApp kampanyası) ve adresteki seçim.
    expect(h).toMatch(/<optgroup label="Meta teslim durumu"><option value="okundu" selected="">Okundu<\/option><option value="teslim_edildi">Teslim edildi \(okunmadı\)<\/option><option value="teslim_edilemedi">Teslim edilemedi<\/option><\/optgroup>/);
    const eposta = renderToStaticMarkup(
      createElement(KampanyaDetayi, {
        ilk: { kampanya: { ...kampanyaDto(), kanal: "eposta", numara: null }, mesajlar: [], toplam: 0, sayfa: 1, sayfaSayisi: 1, boyut: 50 },
        durum: "",
        isci: { sonNabiz: null, simdi: "2026-11-20T09:00:00.000Z", yonetici: true },
      }),
    );
    expect(eposta).not.toContain("Meta teslim durumu");
    expect(eposta).toContain('<optgroup label="Gönderim durumu">');
  });
});

/** Ayrıntı ekranı için en küçük WhatsApp kampanyası. */
function kampanyaDto(): KampanyaDto {
  return {
    id: "k1",
    ad: "Kasım",
    kanal: "whatsapp_api",
    konu: null,
    sablon: "s (tr)",
    bosIsimHitabi: null,
    filtre: {},
    sandbox: false,
    durum: "tamamlandi",
    planlananTarih: null,
    olusturmaTarihi: "2026-11-20T09:00:00.000Z",
    baslamaTarihi: null,
    tamamlanmaTarihi: null,
    sayilar: { kuyrukta: 1, gonderiliyor: 0, gonderildi: 4, basarisiz: 0, haric: 0, iptal: 0 },
    nedenler: [],
    duraklatmaNedeni: null,
    teslim: [],
    ucretli: [],
    numara: "Merkez · …4567",
  };
}
