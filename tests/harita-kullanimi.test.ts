// Birim = 0,001 $ ve harita yüklemelerinin sayılması:
// - Tarayıcıda harita her oluşturulduğunda POST /api/kullanim/harita, "harita" kalemine 7 birim (Dynamic Maps
//   7 $/1000) yazar. Kotaya sayılır ama denetlenmez: %80'de ve kota dolunca da harita engellenmez.
// - Harita kullanımı yüzdeye ve %80 otomatik gösterim sınırına girer; Places istekleri kotayı yine aşamaz.
// - Hız sınırı: kullanıcı başına dakikada 10, 24 saatte 100 sayım; aşan bildirim sayılmaz, 429 döner.
// - Migration 0018: kotalar × 5 (30 $ korunur), sayaçlar kalem kalem gerçek fiyata çevrilir.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db, veritabaniAc } = await import("@/server/db");
const { migrasyonlariUygula } = await import("@/server/db/migrasyon");
const kayitlar = await import("@/server/repo/kayitlar");
const { aylikPlacesBirimi, kotaAyir, kotaDurumu, kullanimDokumu } = await import("@/server/repo/kullanim");
const { taramaOlustur } = await import("@/server/repo/taramalar");
const { kullanimOzeti } = await import("@/lib/arayuz");
const { PLACES_BIRIMLERI } = await import("@/lib/places-birimleri");
const { _baglamDamgala } = await import("@/server/repo/baglam");
const { HARITA_SAYIM_SINIRI, haritaSayimSiniri } = await import("@/server/servisler/kota");
const haritaRotasi = await import("@/app/api/kullanim/harita/route");
const canliRotasi = await import("@/app/api/kayitlar/canli/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const KOK = path.resolve(__dirname, "..");
const U = "https://crm.ornek.test";
const haritaPost = (origin?: string) =>
  new Request(`${U}/api/kullanim/harita`, { method: "POST", headers: { host: "crm.ornek.test", ...(origin ? { origin } : {}) } });

function kiraci(kota = 30_000) {
  const { ctx } = kiraciOlustur(`H${Math.random().toString(36).slice(2, 7)}`);
  db.$client.prepare("update tenants set aylik_places_kotasi = ? where id = ?").run(kota, ctx.tenantId);
  oturum.ctx = ctx;
  return ctx;
}
const sayac = (ctx: TenantContext) =>
  db.$client
    .prepare("select places_istek_sayisi t, harita_birim h, isletme_bilgisi_birim i from usage_counters where tenant_id = ?")
    .get(ctx.tenantId) as { t: number; h: number; i: number } | undefined;

describe("harita yüklemesi (POST /api/kullanim/harita)", () => {
  it("Dynamic Maps 7 birimdir (7 $ / 1.000 yükleme)", () => {
    expect(PLACES_BIRIMLERI.dynamicMaps).toBe(7);
  });

  it("oturumsuz 401, başka kaynaktan 403; ikisinde de kullanım yazılmaz", async () => {
    const ctx = kiraci();
    oturum.ctx = null;
    expect((await haritaRotasi.POST(haritaPost())).status).toBe(401);
    oturum.ctx = ctx;
    expect((await haritaRotasi.POST(haritaPost("https://kotu.ornek.test"))).status).toBe(403);
    expect(sayac(ctx)).toBeUndefined();
  });

  it("her yükleme 'harita' kalemine ve toplama 7 birim yazar; yanıt gövdesiz (birim / kota yok)", async () => {
    const ctx = kiraci();
    const y = await haritaRotasi.POST(haritaPost(U));
    expect(y.status).toBe(204);
    expect(await y.text()).toBe("");
    await haritaRotasi.POST(haritaPost(U));
    expect(sayac(ctx)).toEqual({ t: 14, h: 14, i: 0 });
    expect(kullanimDokumu(ctx)).toEqual({ isletmeBilgisi: 0, iletisimBilgisi: 0, tarama: 0, harita: 100 });
  });

  it("%80'de ve kota dolunca harita engellenmez, yalnızca sayılır; yüzde %100'de kalır", async () => {
    const ctx = kiraci(20);
    expect(kotaAyir(ctx, 16)).toBe(true); // %80
    expect(kullanimOzeti(kotaDurumu(ctx)).seviye).toBe("uyari");
    expect((await haritaRotasi.POST(haritaPost(U))).status).toBe(204); // 23 > 20
    expect((await haritaRotasi.POST(haritaPost(U))).status).toBe(204);
    expect(aylikPlacesBirimi(ctx)).toBe(30);
    expect(kotaDurumu(ctx)).toMatchObject({ kullanilan: 30, kota: 20, kalan: 0, oran: 1, doldu: true });
    expect(kullanimOzeti(kotaDurumu(ctx))).toEqual({ yuzde: 100, seviye: "doldu" });
  });

  it("harita kullanımı kotaya sayılır: %80'e taşıyınca otomatik gösterim durur, dolunca Places isteği yapılmaz", async () => {
    const ctx = kiraci(100);
    const t = taramaOlustur(ctx, { merkezLat: 41, merkezLng: 29, yaricapM: 1000, kategori: "emlak_ofisi" });
    kayitlar.kayitlariEkle(ctx, t.id, ["mock_real_estate_agency_10400_7400"]);
    const [a] = kayitlar.taramaKayitlari(ctx, t.id);
    for (let i = 0; i < 9; i++) await haritaRotasi.POST(haritaPost(U)); // 63 birim; 63 + 17 = 80 eşiğe ulaşır
    const istek = (otomatik: boolean) =>
      new Request(`${U}/api/kayitlar/canli`, {
        method: "POST",
        body: JSON.stringify({ idler: [a.id], ...(otomatik ? { otomatik: true } : {}) }),
        headers: { "content-type": "application/json" },
      });
    expect(await (await canliRotasi.POST(istek(true))).json()).toEqual({ sonuclar: {}, otomatikKapali: true });
    expect(aylikPlacesBirimi(ctx)).toBe(63);
    haritaSayimSiniri.sifirla(); // dakikalık sınır (10) bu testin konusu değil
    for (let i = 0; i < 4; i++) await haritaRotasi.POST(haritaPost(U)); // 91 birim; 91 + 17 > 100
    const elle = await (await canliRotasi.POST(istek(false))).json();
    expect(elle.sonuclar[a.id]).toEqual({ hata: "İşletme bilgisi gösterilemiyor (kota doldu)" });
    expect(sayac(ctx)).toEqual({ t: 91, h: 91, i: 0 });
  });

  it("hız sınırı: kullanıcı başına dakikada 10 sayım; fazlası sayılmaz ve 429 döner", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const ctx = kiraci();
      const durumlar = [];
      for (let i = 0; i < 12; i++) durumlar.push((await haritaRotasi.POST(haritaPost(U))).status);
      expect(durumlar).toEqual([...Array(10).fill(204), 429, 429]);
      const asim = await haritaRotasi.POST(haritaPost(U));
      expect(asim.status).toBe(429);
      expect(asim.headers.get("retry-after")).toBe("60");
      expect(await asim.json()).toEqual({ hata: "Çok sık harita yüklemesi bildirildi; bir süre sonra tekrar deneyin." });
      expect(sayac(ctx)).toEqual({ t: 70, h: 70, i: 0 }); // 10 × 7; reddedilenler yazılmadı

      // Aynı çalışma alanındaki başka bir üye etkilenmez.
      oturum.ctx = _baglamDamgala({ tenantId: ctx.tenantId, userId: "baska-uye", rol: "uye" });
      expect((await haritaRotasi.POST(haritaPost(U))).status).toBe(204);
      expect(sayac(ctx)?.t).toBe(77);

      // Bir dakika sonra yeniden sayılır.
      oturum.ctx = ctx;
      vi.setSystemTime(Date.now() + 60_001);
      expect((await haritaRotasi.POST(haritaPost(U))).status).toBe(204);
      expect(sayac(ctx)?.t).toBe(84);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hız sınırı: son 24 saatte en fazla 100 sayım (döngüyle günde en fazla 700 birim)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const ctx = kiraci();
      const basla = Date.now();
      let kabul = 0;
      for (let dk = 0; dk < 15; dk++) {
        vi.setSystemTime(basla + dk * 61_000);
        for (let i = 0; i < 10; i++) if ((await haritaRotasi.POST(haritaPost(U))).status === 204) kabul++;
      }
      expect(kabul).toBe(HARITA_SAYIM_SINIRI.gunde);
      expect(sayac(ctx)?.h).toBe(700);
      vi.setSystemTime(basla + 24 * 60 * 60_000 + 1); // ilk dakikanın sayımları pencereden çıktı
      expect((await haritaRotasi.POST(haritaPost(U))).status).toBe(204);
    } finally {
      vi.useRealTimers();
    }
  });

  it("harita bileşeni, harita oluşturulduktan sonra yüklemeyi bir kez bildirir", () => {
    const kaynak = fs.readFileSync(path.join(KOK, "src/components/harita.tsx"), "utf8");
    const olustur = kaynak.indexOf("new google.maps.Map(");
    const bildir = kaynak.indexOf("haritaYuklemesiniBildir();");
    expect(olustur).toBeGreaterThan(0);
    expect(bildir).toBeGreaterThan(olustur);
    expect(kaynak.split("haritaYuklemesiniBildir();")).toHaveLength(2);
    expect(kaynak).toContain('fetch("/api/kullanim/harita", { method: "POST"');
  });
});

describe("migration 0018: birim = 0,001 $", () => {
  const DRIZZLE = path.join(KOK, "drizzle");
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-0018-"));
  afterAll(() => fs.rmSync(gecici, { recursive: true, force: true }));

  // Tüm migration'ları iki kez uygular; testler paralel çalışırken 5 saniyeyi aşabilir.
  it("kotalar 5 ile çarpılır (dolar karşılığı korunur), sayaçlar kalem kalem gerçek fiyata çevrilir", { timeout: 30_000 }, () => {
    const hedef = path.join(gecici, "ilk-18");
    fs.mkdirSync(path.join(hedef, "meta"), { recursive: true });
    const gunluk = JSON.parse(fs.readFileSync(path.join(DRIZZLE, "meta/_journal.json"), "utf8"));
    gunluk.entries = gunluk.entries.slice(0, 18); // 0000–0017
    fs.writeFileSync(path.join(hedef, "meta/_journal.json"), JSON.stringify(gunluk));
    for (const g of gunluk.entries) fs.copyFileSync(path.join(DRIZZLE, `${g.tag}.sql`), path.join(hedef, `${g.tag}.sql`));

    const eski = veritabaniAc(path.join(gecici, "eski.db"));
    const s = eski.$client;
    migrasyonlariUygula(eski, hedef);
    s.prepare("insert into tenants (id, ad, slug, aylik_places_kotasi) values ('t1', 'T1', 't1', 6000), ('t2', 'T2', 't2', 15000)").run();
    // Gerçek denemedeki tarama: 5 Text Search Pro (eski 6) + 20 liste satırı (eski 3) + 3 detay (eski 4) = 102; 2 kalemsiz.
    s.prepare(
      "insert into usage_counters (tenant_id, ay, places_istek_sayisi, tarama_birim, isletme_bilgisi_birim, iletisim_bilgisi_birim) values ('t1', '2026-11', 104, 30, 60, 12), ('t2', '2026-10', 0, 0, 0, 0)",
    ).run();
    s.prepare("insert into leads (id, tenant_id, place_id) values ('l1', 't1', 'p1')").run();

    migrasyonlariUygula(eski, DRIZZLE);

    expect(s.prepare("select id, aylik_places_kotasi k from tenants order by id").all()).toEqual([
      { id: "t1", k: 30_000 },
      { id: "t2", k: 75_000 },
    ]);
    expect(
      s
        .prepare(
          "select tenant_id, places_istek_sayisi t, tarama_birim r, isletme_bilgisi_birim i, iletisim_bilgisi_birim l, harita_birim h from usage_counters order by tenant_id",
        )
        .all(),
    ).toEqual([
      // 5 × 32 + 20 × 17 + 3 × 20 = 160 + 340 + 60; kalemsiz 2 eski birim × 5 = 10
      { tenant_id: "t1", t: 570, r: 160, i: 340, l: 60, h: 0 },
      { tenant_id: "t2", t: 0, r: 0, i: 0, l: 0, h: 0 },
    ]);
    expect(s.prepare("select count(*) n from leads where tenant_id = 't1'").get()).toEqual({ n: 1 }); // tenants yeniden oluşturuldu, bağlı satırlar kaldı
    s.prepare("insert into tenants (id, ad, slug) values ('t3', 'T3', 't3')").run();
    expect(s.prepare("select aylik_places_kotasi k from tenants where id = 't3'").get()).toEqual({ k: 30_000 });
    expect(s.pragma("foreign_key_check")).toEqual([]);
    s.close();
  });
});
