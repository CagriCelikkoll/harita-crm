// Şablonlar WABA'ya aittir: aynı çalışma alanında farklı WABA'lardaki iki numarada her numaranın "Meta'dan yenile"si
// yalnızca kendi WABA'sının şablonlarını ve kendi (ve aynı WABA'daki numaraların) son yenileme zamanını etkiler; kart,
// kampanya sihirbazı ve gelen kutusu yalnızca numaranın WABA'sının şablonlarını listeler; sunucu (kampanya oluşturma,
// işçi, gelen kutusu) başka WABA'nın şablonuyla gönderimi reddeder; Meta'da artık olmayan şablon kampanyada
// kullanılmadıysa silinir (yanlış kalan kayıt bir sonraki yenilemede temizlenir); başka çalışma alanı etkilenmez.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kampanyaGetir } = await import("@/server/repo/kampanyalar");
const { kisileriEkle } = await import("@/server/repo/kayitlar");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const { sablonlariListele } = await import("@/server/repo/whatsapp-sablonlari");
const { whatsappIzniAyarla } = await import("@/server/repo/whatsapp-kisileri");
const gk = await import("@/server/repo/gelen-kutusu");
const { isciTuru } = await import("@/server/servisler/isci");
const { KampanyaGirdisi, kampanyaBaslat } = await import("@/server/servisler/kampanya");
const gelenKutusu = await import("@/server/servisler/gelen-kutusu");
const wa = await import("@/server/servisler/whatsapp-api");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const rota = await import("@/app/api/whatsapp/sablonlar/route");
const { DURAKLATMA_NEDEN_ADLARI } = await import("@/lib/mesajlasma");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const SIMDI = new Date("2026-11-23T09:00:00Z");
const tur = () => isciTuru({ simdi: () => SIMDI, parti: 50, whatsappAralikMs: 0 });
let sayac = 0;

const WABA_ESKI = "1609185550499139";
const WABA_YENI = "1485651723697727";

const sablon = (id: string, name: string, kategori = "UTILITY") => ({
  id,
  name,
  language: "tr",
  status: "APPROVED",
  category: kategori,
  parameter_format: "POSITIONAL",
  components: [{ type: "BODY", text: "Merhaba {{1}}" }],
});

beforeEach(() => {
  db.$client.prepare("update kampanyalar set durum = 'iptal' where durum in ('calisiyor', 'zamanlandi', 'duraklatildi')").run();
  mockWhatsappSifirla();
  oturum.ctx = null;
});

/** Aynı çalışma alanında iki numara, iki ayrı WABA (Meta'da her WABA'nın kendi şablonları). */
async function ikiNumara(ad: string, eski = WABA_ESKI, yeni = WABA_YENI) {
  const { ctx } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Tisotti Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  mockWhatsapp.wabaSablonlari.set(eski, [sablon(`${eski}-1`, "hello_world")]);
  mockWhatsapp.wabaSablonlari.set(yeni, [
    sablon(`${yeni}-1`, "hello_world"),
    sablon(`${yeni}-2`, "eski_musteri_ozel_firsat"),
    sablon(`${yeni}-3`, "jaspers_market_order_confirmation"),
  ]);
  const ekle = async (adi: string, waba: string) => {
    const phone = String(1515541464970000 + ++sayac);
    const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad: adi, wabaId: waba, phoneNumberId: phone, erisimAnahtari: "anahtar", appSecret: `secret-${adi}` });
    db.$client
      .prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ?, kalite = 'GREEN', limit_katmani = 'TIER_10K', son_kontrol = ? where id = ?")
      .run(Date.now(), Date.now(), SIMDI.getTime(), baglanti.id!);
    wa.testModuDegistir(ctx, baglanti.id!, false);
    return { id: baglanti.id!, waba, phone };
  };
  const a = await ekle("Tisotti Deneme", eski);
  const b = await ekle("Yeni Tisotti No", yeni);
  oturum.ctx = ctx;
  return { ctx, a, b };
}

const adlar = (ctx: TenantContext, id: string) => wa.sablonlar(ctx, id).map((s) => s.ad).sort();
const senkron = (ctx: TenantContext, id: string) => baglantiGetir(ctx, id)!.sablonSenkronTarihi;
const yenile = (id: string) => rota.POST(new Request(`https://crm.ornek.test/api/whatsapp/sablonlar?baglanti=${id}`, { method: "POST" }));

describe("senkron WABA bazında", () => {
  it("her numaranın yenilemesi yalnızca kendi WABA'sını okur ve yazar; son yenileme yalnızca o numarada güncellenir", async () => {
    const { ctx, a, b } = await ikiNumara("IkiWaba");
    const t1 = new Date("2026-11-23T10:00:00Z");
    await wa.sablonlariSenkronizeEt(ctx, b.id, t1);
    expect(mockWhatsapp.sablonIstekleri).toEqual([WABA_YENI]);
    expect(adlar(ctx, b.id)).toEqual(["eski_musteri_ozel_firsat", "hello_world", "jaspers_market_order_confirmation"]);
    expect(adlar(ctx, a.id)).toEqual([]); // Tisotti Deneme henüz yenilenmedi: Yeni'nin şablonları burada görünmez
    expect(senkron(ctx, b.id)).toEqual(t1);
    expect(senkron(ctx, a.id)).toBeNull();
    expect(new Set(sablonlariListele(ctx).map((s) => s.wabaId))).toEqual(new Set([WABA_YENI]));

    const t2 = new Date("2026-11-23T11:00:00Z");
    await wa.sablonlariSenkronizeEt(ctx, a.id, t2);
    expect(mockWhatsapp.sablonIstekleri).toEqual([WABA_YENI, WABA_ESKI]);
    expect(adlar(ctx, a.id)).toEqual(["hello_world"]);
    expect(adlar(ctx, b.id)).toEqual(["eski_musteri_ozel_firsat", "hello_world", "jaspers_market_order_confirmation"]);
    expect([senkron(ctx, a.id), senkron(ctx, b.id)]).toEqual([t2, t1]);
    // DTO şablonun WABA'sını taşır (kart kendi WABA'sı dışındakini göstermez).
    expect(new Set(wa.sablonlar(ctx, a.id).map((s) => s.wabaId))).toEqual(new Set([WABA_ESKI]));
  });

  it("rota: ?baglanti= ile seçilen numara yenilenir; yanıttaki liste ve bağlantı o numaranın", async () => {
    const { ctx, a, b } = await ikiNumara("Rota");
    const y = await yenile(b.id);
    expect(y.status).toBe(200);
    const v = (await y.json()) as { sablonlar: { ad: string; wabaId: string }[]; baglanti: { id: string; wabaId: string; sablonSenkronTarihi: string | null } };
    expect(v.baglanti).toMatchObject({ id: b.id, wabaId: WABA_YENI });
    expect(v.baglanti.sablonSenkronTarihi).not.toBeNull();
    expect(v.sablonlar.every((s) => s.wabaId === WABA_YENI)).toBe(true);
    expect(v.sablonlar).toHaveLength(3);
    expect(senkron(ctx, a.id)).toBeNull();
  });

  it("aynı WABA'daki iki numara ortak şablon kullanır; son yenileme ikisinde de güncellenir", async () => {
    const { ctx, a, b } = await ikiNumara("AyniWaba", WABA_YENI, WABA_YENI);
    const t = new Date("2026-11-23T12:00:00Z");
    await wa.sablonlariSenkronizeEt(ctx, a.id, t);
    expect(adlar(ctx, a.id)).toEqual(adlar(ctx, b.id));
    expect([senkron(ctx, a.id), senkron(ctx, b.id)]).toEqual([t, t]);
  });

  it("Meta'da artık olmayan şablon: kampanyada kullanılmadıysa silinir, kullanıldıysa SILINDI kalır ama listelenmez", async () => {
    const { ctx, b } = await ikiNumara("Temizlik");
    await wa.sablonlariSenkronizeEt(ctx, b.id, SIMDI);
    const kullanilan = sablonlariListele(ctx, WABA_YENI).find((s) => s.ad === "jaspers_market_order_confirmation")!;
    db.$client.prepare("insert into kampanyalar (id, tenant_id, kanal, ad, sablon, filtre, sandbox, durum, sablon_id, olusturma_tarihi) values (?, ?, 'whatsapp_api', 'Geçmiş', 'x', '{}', 1, 'tamamlandi', ?, ?)").run(crypto.randomUUID(), ctx.tenantId, kullanilan.id, Date.now());
    mockWhatsapp.wabaSablonlari.set(WABA_YENI, [sablon(`${WABA_YENI}-1`, "hello_world")]);
    const sonuc = await wa.sablonlariSenkronizeEt(ctx, b.id, SIMDI);
    expect(sonuc).toMatchObject({ guncellenen: 1, silinen: 2 });
    expect(sablonlariListele(ctx, WABA_YENI).map((s) => [s.ad, s.durum]).sort()).toEqual([
      ["hello_world", "APPROVED"],
      ["jaspers_market_order_confirmation", "SILINDI"],
    ]);
    expect(adlar(ctx, b.id)).toEqual(["hello_world"]);
  });

  it("yanlış WABA'ya yazılmış eski kayıt o WABA'nın bir sonraki yenilemesinde temizlenir", async () => {
    const { ctx, a } = await ikiNumara("YanlisKayit");
    // Hatalı kalmış veri: Yeni'nin şablonu Tisotti Deneme'nin WABA'sı altında.
    db.$client
      .prepare("insert into whatsapp_sablonlari (id, tenant_id, waba_id, meta_id, ad, dil, kategori, durum, bilesenler, degiskenler, abonelik_butonu, senkron_tarihi) values (?, ?, ?, 'x', 'eski_musteri_ozel_firsat', 'tr', 'UTILITY', 'APPROVED', '[]', '[]', 0, ?)")
      .run(crypto.randomUUID(), ctx.tenantId, WABA_ESKI, Date.now());
    expect(adlar(ctx, a.id)).toEqual(["eski_musteri_ozel_firsat"]);
    await wa.sablonlariSenkronizeEt(ctx, a.id, SIMDI);
    expect(adlar(ctx, a.id)).toEqual(["hello_world"]);
    expect(sablonlariListele(ctx, WABA_ESKI).map((s) => s.ad)).toEqual(["hello_world"]);
  });
});

describe("gönderim WABA denetimi", { timeout: 30_000 }, () => {
  async function hazir(ad: string) {
    const r = await ikiNumara(ad);
    await wa.sablonlariSenkronizeEt(r.ctx, r.a.id, SIMDI);
    await wa.sablonlariSenkronizeEt(r.ctx, r.b.id, SIMDI);
    const kisiler = kisileriEkle(r.ctx, [{ kaynak: "elle", ekTelefon: "0532 500 00 01", isletmeAdi: "Esnaf", etiketler: [ad.toLowerCase()], aliciTuru: "tacir_esnaf" }], "test");
    for (const k of kisiler) whatsappIzniAyarla(r.ctx, k.id, { izin: "var", kaynak: "form" });
    const yeniSablonu = sablonlariListele(r.ctx, WABA_YENI).find((s) => s.ad === "eski_musteri_ozel_firsat")!;
    const girdi = (baglantiId: string, sablonId = yeniSablonu.id) =>
      KampanyaGirdisi.parse({
        kanal: "whatsapp_api",
        ad: `K-${ad}`,
        filtre: { etiket: ad.toLowerCase() },
        testModu: false,
        baglantiId,
        sablonId,
        degiskenEslem: { "body:1": { kaynak: "isletme_adi" } },
      });
    return { ...r, kisi: kisiler[0], yeniSablonu, girdi };
  }

  it("sihirbaz verisi: her numara yalnızca kendi WABA'sının şablonlarını listeler", async () => {
    const { ctx, a, b } = await hazir("Sihirbaz");
    // kampanyalar/yeni/page.tsx: numaraOzetleri × sablonlar(ctx, n.id).filter(kullanilabilir)
    const liste = Object.fromEntries(wa.numaraOzetleri(ctx).map((n) => [n.id, wa.sablonlar(ctx, n.id).filter((x) => x.kullanilabilir).map((x) => x.ad)]));
    expect(liste[a.id]).toEqual(["hello_world"]);
    expect(liste[b.id]?.sort()).toEqual(["eski_musteri_ozel_firsat", "hello_world", "jaspers_market_order_confirmation"]);
    expect(wa.numaraOzetleri(ctx).map((n) => [n.id, n.wabaId])).toEqual([
      [a.id, WABA_ESKI],
      [b.id, WABA_YENI],
    ]);
  });

  it("kampanya oluşturma başka WABA'nın şablonunu reddeder", async () => {
    const { ctx, a, b, girdi } = await hazir("Olusturma");
    expect(() => kampanyaBaslat(ctx, girdi(a.id), SIMDI)).toThrow(/Bu şablon Tisotti Deneme.*WhatsApp hesabında yok/);
    expect(() => kampanyaBaslat(ctx, girdi(b.id), SIMDI)).not.toThrow();
  });

  it("işçi: gönderen numaranın WABA'sı şablonunkiyle uyuşmazsa göndermez, kampanya duraklar", async () => {
    const { ctx, a, b, kisi, girdi } = await hazir("Isci");
    const k = kampanyaBaslat(ctx, girdi(b.id), SIMDI);
    // Kampanya oluşturulduktan sonra gönderen numara başka WABA'daki numaraya çevrildi (ya da numaranın WABA'sı değişti).
    db.$client.prepare("update kampanyalar set baglanti_id = ? where id = ?").run(a.id, k.id);
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(kampanyaGetir(ctx, k.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "sablon_baska_waba" });
    expect(DURAKLATMA_NEDEN_ADLARI.sablon_baska_waba).toMatch(/WABA/);
    const m = db.$client.prepare("select durum from message_queue where kampanya_id = ? and lead_id = ?").get(k.id, kisi.id) as { durum: string };
    expect(m.durum).toBe("kuyrukta");
  });

  it("gelen kutusu: başka WABA'nın şablonu gönderilemez", async () => {
    const { ctx, a, kisi, yeniSablonu } = await hazir("GelenKutusu");
    const sohbetId = gk.gelenMesajYaz(ctx, { baglantiId: a.id, leadId: kisi.id, wamid: `wamid.W${++sayac}`, tur: "text", metin: "Merhaba", medyaId: null, metaZamani: null }, SIMDI)!.sohbetId;
    expect(gelenKutusu.sohbetAyrintisi(ctx, sohbetId, SIMDI)!.sablonlar.map((s) => s.ad)).toEqual(["hello_world"]);
    await expect(
      gelenKutusu.sohbetMesajiGonder(ctx, sohbetId, { tur: "sablon", sablonId: yeniSablonu.id, degiskenler: { "body:1": "A" }, istemciKimligi: `waba-${++sayac}-istemci` }, SIMDI),
    ).rejects.toThrow(/bu numaranın WhatsApp hesabında yok/);
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
  });
});

describe("izolasyon", () => {
  it("aynı WABA kimliği başka çalışma alanında da olsa senkron yalnızca kendi çalışma alanına yazar ve onu listeler", async () => {
    const x = await ikiNumara("IzoX");
    const yAlan = kiraciOlustur("IzoY").ctx;
    // Y çalışma alanının şablon satırı aynı WABA kimliğiyle (test verisi; numara kendisi tekil olduğundan doğrudan satır).
    db.$client
      .prepare("insert into whatsapp_sablonlari (id, tenant_id, waba_id, meta_id, ad, dil, kategori, durum, bilesenler, degiskenler, abonelik_butonu, senkron_tarihi) values (?, ?, ?, 'y', 'y_ozel', 'tr', 'UTILITY', 'APPROVED', '[]', '[]', 0, ?)")
      .run(crypto.randomUUID(), yAlan.tenantId, WABA_YENI, Date.now());
    await wa.sablonlariSenkronizeEt(x.ctx, x.b.id, SIMDI);
    expect(adlar(x.ctx, x.b.id)).not.toContain("y_ozel");
    expect(sablonlariListele(yAlan).map((s) => s.ad)).toEqual(["y_ozel"]);
    // Rota başka çalışma alanının numarasıyla çağrılırsa liste boş / 404.
    oturum.ctx = yAlan;
    expect((await yenile(x.b.id)).status).toBe(404);
    const g = await rota.GET(new Request(`https://crm.ornek.test/api/whatsapp/sablonlar?baglanti=${x.b.id}`));
    expect((await g.json()).sablonlar).toEqual([]);
  });
});

describe("migration 0028 (veri temizliği)", () => {
  it("numarası olmayan WABA'nın ve SILINDI şablonların kampanyada kullanılmamış satırlarını siler; kullanılanlara dokunmaz", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { ctx, a } = await ikiNumara("Migration");
    await wa.sablonlariSenkronizeEt(ctx, a.id, SIMDI);
    const ekle = (waba: string, ad: string, durum = "APPROVED") => {
      const id = crypto.randomUUID();
      db.$client
        .prepare("insert into whatsapp_sablonlari (id, tenant_id, waba_id, meta_id, ad, dil, kategori, durum, bilesenler, degiskenler, abonelik_butonu, senkron_tarihi) values (?, ?, ?, 'm', ?, 'tr', 'UTILITY', ?, '[]', '[]', 0, ?)")
        .run(id, ctx.tenantId, waba, ad, durum, Date.now());
      return id;
    };
    const sahipsiz = ekle("999999999999", "sahipsiz");
    const sahipsizKullanilan = ekle("999999999999", "sahipsiz_kullanilan");
    const silinmis = ekle(WABA_ESKI, "silinmis", "SILINDI");
    db.$client
      .prepare("insert into kampanyalar (id, tenant_id, kanal, ad, sablon, filtre, sandbox, durum, sablon_id, olusturma_tarihi) values (?, ?, 'whatsapp_api', 'Geçmiş', 'x', '{}', 1, 'tamamlandi', ?, ?)")
      .run(crypto.randomUUID(), ctx.tenantId, sahipsizKullanilan, Date.now());
    const sql = fs.readFileSync(path.resolve(__dirname, "../drizzle/0028_sablon_waba_temizligi.sql"), "utf8");
    for (const ifade of sql.split("--> statement-breakpoint")) db.$client.exec(ifade);
    const kalan = (id: string) => Boolean(db.$client.prepare("select 1 from whatsapp_sablonlari where id = ?").get(id));
    expect([kalan(sahipsiz), kalan(sahipsizKullanilan), kalan(silinmis)]).toEqual([false, true, false]);
    expect(adlar(ctx, a.id)).toEqual(["hello_world"]); // bağlı WABA'nın geçerli şablonu kalır
  });
});
