// Yeni düzen, Grup 3 — kullanım ve görünürlük altyapısı:
// - Kullanım kalemleri (işletme bilgisi / iletişim bilgisi / tarama), toplamla aynı atomik ifadede; iade kaleme de.
// - Otomatik gösterim: yalnızca adı girilmemiş Google kayıtları, yalnızca kullanım %80'in altında kalıyorsa; eşik
//   sunucuda, kota ayırmanın SQL'inde. Elle "Göster" %100'e kadar. Detay panelinin otomatik açılışı da aynı eşikle.
// - İstemcide yalnızca bellekte, en fazla 30 dakikalık önbellek; çıkışta / girişte / alan değişince temizlenir.
// - Arayüzde "birim" ve tıklama başı maliyet yok.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const kayitlar = await import("@/server/repo/kayitlar");
const { aylikPlacesBirimi, kotaAyir, kotaIadeEt, kullanimDokumu } = await import("@/server/repo/kullanim");
const { taramaOlustur } = await import("@/server/repo/taramalar");
const { CAGRI_KALEMLERI } = await import("@/server/places/istemci");
const { BellekOnbellegi, detayOnbellegi, GOOGLE_ONBELLEK_SURESI_MS, googleOnbellekleriniTemizle, listeOnbellegi } = await import(
  "@/lib/google-onbellegi"
);
const canliRotasi = await import("@/app/api/kayitlar/canli/route");
const kayitRotasi = await import("@/app/api/kayitlar/[id]/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const KOK = path.resolve(__dirname, "..");
const U = "https://crm.ornek.test";
const oku = (d: string) => fs.readFileSync(path.join(KOK, d), "utf8");
const yorumsuz = (k: string) =>
  k
    .split("\n")
    .filter((s) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(s))
    .join("\n");
const post = (url: string, govde: unknown) =>
  new Request(`${U}${url}`, { method: "POST", body: JSON.stringify(govde), headers: { "content-type": "application/json" } });

function kiraci(kota = 6000) {
  const { ctx } = kiraciOlustur(`G${Math.random().toString(36).slice(2, 7)}`);
  db.$client.prepare("update tenants set aylik_places_kotasi = ? where id = ?").run(kota, ctx.tenantId);
  oturum.ctx = ctx;
  return ctx;
}
function googleKayitlari(ctx: TenantContext, adet: number) {
  const t = taramaOlustur(ctx, { merkezLat: 41, merkezLng: 29, yaricapM: 1000, kategori: "emlak_ofisi" });
  kayitlar.kayitlariEkle(ctx, t.id, Array.from({ length: adet }, (_, i) => `mock_real_estate_agency_${10400 + i}_${7400 + i}`));
  return kayitlar.taramaKayitlari(ctx, t.id);
}
const kalemler = (ctx: TenantContext) =>
  db.$client
    .prepare("select places_istek_sayisi t, isletme_bilgisi_birim i, iletisim_bilgisi_birim l, tarama_birim r from usage_counters where tenant_id = ?")
    .get(ctx.tenantId) as { t: number; i: number; l: number; r: number } | undefined;

describe("kullanım kalemleri", () => {
  it("toplam ve kalem birlikte artar ve iade edilir; kalemsiz ayırma yalnızca toplamı artırır", () => {
    const ctx = kiraci(100);
    expect(kotaAyir(ctx, 3, { kalem: "isletmeBilgisi" })).toBe(true);
    expect(kotaAyir(ctx, 4, { kalem: "iletisimBilgisi" })).toBe(true);
    expect(kotaAyir(ctx, 6, { kalem: "tarama" })).toBe(true);
    expect(kotaAyir(ctx, 2)).toBe(true);
    expect(kalemler(ctx)).toEqual({ t: 15, i: 3, l: 4, r: 6 });
    kotaIadeEt(ctx, 4, { kalem: "iletisimBilgisi" });
    expect(kalemler(ctx)).toEqual({ t: 11, i: 3, l: 0, r: 6 });
    // Döküm: kalemin bu ayki toplam içindeki payı (kalemsiz 2 birim payda yer almaz).
    expect(kullanimDokumu(ctx)).toEqual({ isletmeBilgisi: 27, iletisimBilgisi: 0, tarama: 55 });
    // Kota yetmezse ne toplam ne kalem değişir.
    expect(kotaAyir(ctx, 90, { kalem: "tarama" })).toBe(false);
    expect(kalemler(ctx)).toEqual({ t: 11, i: 3, l: 0, r: 6 });
  });

  it("her Places çağrısının kalemi tanımlı; liste işletme bilgisi, detay ve telefon iletişim bilgisi, tarama ve adres tarama", () => {
    expect(CAGRI_KALEMLERI).toEqual({
      taramaYalnizcaId: "tarama",
      taramaKonumlu: "tarama",
      liste: "isletmeBilgisi",
      detay: "iletisimBilgisi",
      adres: "tarama",
      telefon: "iletisimBilgisi",
    });
  });

  it("eşikli ayırma: sonraki toplam kota × eşik'in ALTINDA kalmalı; eşiksiz ayırma kotaya kadar", () => {
    const ctx = kiraci(100);
    expect(kotaAyir(ctx, 77, { esik: 0.8 })).toBe(true); // 77 < 80
    expect(kotaAyir(ctx, 3, { esik: 0.8 })).toBe(false); // 80, eşiğe ulaşır
    expect(aylikPlacesBirimi(ctx)).toBe(77);
    expect(kotaAyir(ctx, 2, { esik: 0.8 })).toBe(true); // 79
    expect(kotaAyir(ctx, 21)).toBe(true); // elle: 100'e kadar
    expect(kotaAyir(ctx, 1)).toBe(false);
  });
});

describe("otomatik gösterim (/api/kayitlar/canli, otomatik: true)", () => {
  it("adı girilmemiş Google kayıtları için ad, adres ve konum döner; adı girilmiş kayıt çağrılmaz ve ücretlenmez", async () => {
    const ctx = kiraci();
    const [a, b, adli] = googleKayitlari(ctx, 3);
    kayitlar.kayitGuncelle(ctx, adli.id, { isletmeAdi: "Kendi adım" });
    const y = await (await canliRotasi.POST(post("/api/kayitlar/canli", { idler: [a.id, b.id, adli.id], otomatik: true }))).json();
    expect(Object.keys(y.sonuclar).sort()).toEqual([a.id, b.id].sort());
    expect(y.sonuclar[a.id]).toMatchObject({ ad: expect.any(String), konum: { lat: expect.any(Number), lng: expect.any(Number) } });
    expect(y.otomatikKapali).toBe(false);
    expect(kalemler(ctx)).toEqual({ t: 6, i: 6, l: 0, r: 0 }); // 2 × 3, işletme bilgisi kalemi
  });

  it("kullanım %80'e ulaşacaksa otomatik istek yapılmaz, birim düşmez; elle 'Göster' çalışmaya devam eder", async () => {
    const ctx = kiraci(100);
    const [a] = googleKayitlari(ctx, 1);
    expect(kotaAyir(ctx, 77)).toBe(true);
    const oto = await (await canliRotasi.POST(post("/api/kayitlar/canli", { idler: [a.id], otomatik: true }))).json();
    expect(oto).toEqual({ sonuclar: {}, otomatikKapali: true });
    expect(aylikPlacesBirimi(ctx)).toBe(77);
    const elle = await (await canliRotasi.POST(post("/api/kayitlar/canli", { idler: [a.id] }))).json();
    expect(elle.sonuclar[a.id]).toMatchObject({ ad: expect.any(String) });
    expect(elle.otomatikKapali).toBeUndefined();
    expect(aylikPlacesBirimi(ctx)).toBe(80);
  });

  it("kota doluyken elle 'Göster' de çalışmaz (kota mesajı), otomatik kapalı döner", async () => {
    const ctx = kiraci(3);
    const [a, b] = googleKayitlari(ctx, 2);
    expect(kotaAyir(ctx, 3)).toBe(true);
    const elle = await (await canliRotasi.POST(post("/api/kayitlar/canli", { idler: [a.id] }))).json();
    expect(elle.sonuclar[a.id]).toEqual({ hata: "İşletme bilgisi gösterilemiyor (kota doldu)" });
    const oto = await (await canliRotasi.POST(post("/api/kayitlar/canli", { idler: [b.id], otomatik: true }))).json();
    expect(oto.otomatikKapali).toBe(true);
    expect(aylikPlacesBirimi(ctx)).toBe(3);
  });

  it("detay panelinin otomatik açılışı da eşiği atomik uygular (kullanımı %80'in üstüne taşımaz)", async () => {
    const ctx = kiraci(100);
    const [a] = googleKayitlari(ctx, 1);
    expect(kotaAyir(ctx, 77)).toBe(true); // %77: ön denetim geçer, ama 77 + 4 = 81 eşiği aşar
    const y = await (await kayitRotasi.GET(new Request(`${U}/api/kayitlar/${a.id}?canli=oto`), { params: Promise.resolve({ id: a.id }) })).json();
    expect(y.canli).toBeUndefined();
    expect(y.canliAtlandi).toBe("kota");
    expect(aylikPlacesBirimi(ctx)).toBe(77);
    const elle = await (await kayitRotasi.GET(new Request(`${U}/api/kayitlar/${a.id}?canli=1`), { params: Promise.resolve({ id: a.id }) })).json();
    expect(elle.canli).toMatchObject({ durum: "tamam" });
    expect(kalemler(ctx)).toMatchObject({ t: 81, l: 4 });
  });
});

describe("istemci bellek önbelleği (en fazla 30 dakika)", () => {
  it("30 dakika dolunca kayıt silinir; okumak süreyi uzatmaz; yeniden koymak yeniler", () => {
    let simdi = 1_000_000;
    const o = new BellekOnbellegi<string>(GOOGLE_ONBELLEK_SURESI_MS, () => simdi);
    o.koy("k1", "Kafe");
    simdi += GOOGLE_ONBELLEK_SURESI_MS - 1;
    expect(o.al("k1")).toBe("Kafe");
    simdi += 1; // tam 30 dakika
    expect(o.al("k1")).toBeUndefined();
    expect(o.boyut).toBe(0); // süresi geçen kayıt atıldı
    o.koy("k2", "Fırın");
    simdi += 20 * 60_000;
    o.koy("k2", "Fırın"); // yeniden alındı: süre baştan
    simdi += 20 * 60_000;
    expect(o.al("k2")).toBe("Fırın");
    expect(GOOGLE_ONBELLEK_SURESI_MS).toBe(30 * 60_000);
  });

  it("çıkışta, girişte ve çalışma alanı değişince her iki önbellek temizlenir", () => {
    listeOnbellegi.koy("a", { ad: "X", adres: null, konum: null });
    detayOnbellegi.koy("a", { durum: "bulunamadi" });
    googleOnbellekleriniTemizle();
    expect(listeOnbellegi.boyut + detayOnbellegi.boyut).toBe(0);
    const menu = oku("src/components/menu.tsx");
    expect(menu).toContain("<form action={cikisYap} onSubmit={googleOnbellekleriniTemizle}>");
    expect(menu).toContain("action={aktifAlanSec} onSubmit={googleOnbellekleriniTemizle}");
    expect(oku("src/app/(auth)/giris/giris-formu.tsx")).toMatch(/googleOnbellekleriniTemizle\(\);\s*router\.replace\(sonra\);/);
  });

  it("önbellek yalnızca bellekte: tarayıcı depolaması ya da sunucu yok; yalnızca başarılı sonuçlar girer", () => {
    for (const d of ["src/lib/google-onbellegi.ts", "src/components/google-bilgisi.tsx", "src/app/(app)/kayitlar/detay-paneli.tsx"]) {
      expect(yorumsuz(oku(d)), d).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open|document\.cookie/);
    }
    expect(oku("src/components/google-bilgisi.tsx")).toContain('if (!("hata" in b)) listeOnbellegi.koy(id, b);');
    expect(oku("src/app/(app)/kayitlar/detay-paneli.tsx")).toContain('if (c.durum !== "tamam") return;');
  });
});

describe("arayüzde birim ve tıklama başı maliyet yok", () => {
  it("src/app ve src/components içindeki .tsx dosyalarında (yorumlar hariç) 'birim' sözcüğü geçmez", () => {
    const tara = (klasor: string): string[] =>
      fs.readdirSync(klasor, { withFileTypes: true }).flatMap((g) => {
        const tam = path.join(klasor, g.name);
        return g.isDirectory() ? tara(tam) : g.name.endsWith(".tsx") ? [tam] : [];
      });
    const ihlaller = [...tara(path.join(KOK, "src/app")), ...tara(path.join(KOK, "src/components"))].flatMap((d) =>
      yorumsuz(fs.readFileSync(d, "utf8"))
        .split("\n")
        .filter((s) => /(^|[^\p{L}\p{N}_])birim($|[^\p{L}\p{N}_])/iu.test(s))
        .map((s) => `${path.relative(KOK, d)}: ${s.trim()}`),
    );
    expect(ihlaller).toEqual([]);
    expect(fs.existsSync(path.join(KOK, "src/components/kota-cubugu.tsx"))).toBe(false);
  });
});
