// Kiracı başına aylık Places kotası.
import { spawn } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KOTA_DOLDU_MESAJI } from "@/lib/sabitler";
import { db } from "@/server/db";
import { placesIstemcisiOlustur } from "@/server/places/istemci";
import { KotaDolduHatasi } from "@/server/places/tipler";
import type { TenantContext } from "@/server/repo/baglam";
import { aylikPlacesIstegi, kotaAyir, kotaDurumu, kotaIadeEt } from "@/server/repo/kullanim";
import { kotaAyarla, varsayilanKota } from "@/server/repo/sistem/kota";
import { calismaAlaniKur } from "@/server/repo/sistem/uyelik";
import { taramaOlustur } from "@/server/repo/taramalar";
import { canliBilgiGetir } from "@/server/servisler/canli-bilgi";
import { kotaKapisi } from "@/server/servisler/kota";
import { taramaCalistir } from "@/server/servisler/tarama";
import { kiraciOlustur, kullaniciOlustur } from "./yardimci/fabrika";

function kotaliKiraci(kota: number): TenantContext {
  const { ctx } = kiraciOlustur(`Kota${Math.random().toString(36).slice(2, 7)}`);
  db.$client.prepare("update tenants set aylik_places_kotasi = ? where id = ?").run(kota, ctx.tenantId);
  return ctx;
}
const slugu = (ctx: TenantContext) =>
  (db.$client.prepare("select slug from tenants where id = ?").get(ctx.tenantId) as { slug: string }).slug;
const mockIdleri = (n: number) => Array.from({ length: n }, (_, i) => `mock_cafe_${10250 + i}_7258`);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("kota: temel kurallar", () => {
  it("yeni çalışma alanı varsayılan 2.000 kota ile başlar; PLACES_AYLIK_KOTA ile değiştirilebilir", () => {
    expect(kotaDurumu(kiraciOlustur("Varsayilan").ctx).kota).toBe(2000);
    vi.stubEnv("PLACES_AYLIK_KOTA", "750");
    expect(varsayilanKota()).toBe(750);
    const k = kullaniciOlustur("Ortam");
    expect(kotaDurumu(calismaAlaniKur(k.id, "Ortam Alanı")).kota).toBe(750);
    vi.stubEnv("PLACES_AYLIK_KOTA", "gecersiz");
    expect(varsayilanKota()).toBe(2000);
  });

  it("kotaya kadar ayırır, sonra reddeder ve sayacı aşmaz", () => {
    const ctx = kotaliKiraci(5);
    expect([1, 2, 3, 4, 5, 6, 7].map(() => kotaAyir(ctx))).toEqual([true, true, true, true, true, false, false]);
    expect(aylikPlacesIstegi(ctx)).toBe(5);
    expect(kotaAyir(ctx, 0 + 1)).toBe(false);
    kotaIadeEt(ctx);
    expect(kotaAyir(ctx)).toBe(true); // iade edilen birim yeniden kullanılabilir
    expect(kotaAyir(ctx, 3)).toBe(false); // çoklu ayırma da sınırı aşamaz
    expect(aylikPlacesIstegi(ctx)).toBe(5);
  });

  it("ilk ayırma (satır yokken) da kotaya tabidir", () => {
    const ctx = kotaliKiraci(2);
    expect(kotaAyir(ctx, 3)).toBe(false);
    expect(aylikPlacesIstegi(ctx)).toBe(0);
    expect(kotaAyir(ctx, 2)).toBe(true);
  });

  it("kota durumu: %80'de uyarı, %100'de doldu; kota düşürülürse kalan 0'ın altına inmez", () => {
    const ctx = kotaliKiraci(10);
    for (let i = 0; i < 7; i++) kotaAyir(ctx);
    expect(kotaDurumu(ctx)).toMatchObject({ kullanilan: 7, kota: 10, kalan: 3, uyari: false, doldu: false });
    kotaAyir(ctx);
    expect(kotaDurumu(ctx)).toMatchObject({ kullanilan: 8, uyari: true, doldu: false });
    kotaAyarla(slugu(ctx), 4);
    expect(kotaDurumu(ctx)).toMatchObject({ kullanilan: 8, kota: 4, kalan: 0, oran: 1, uyari: true, doldu: true });
    expect(kotaAyir(ctx)).toBe(false);
  });

  it("npm run kota: slug ile kotayı değiştirir; bilinmeyen slug ve geçersiz sayı reddedilir", () => {
    const ctx = kotaliKiraci(10);
    expect(kotaAyarla(slugu(ctx), 5000)).toMatchObject({ kota: 5000 });
    expect(kotaDurumu(ctx).kota).toBe(5000);
    expect(kotaAyarla("olmayan-slug", 10)).toBeNull();
    expect(() => kotaAyarla(slugu(ctx), -1)).toThrow();
    expect(() => kotaAyarla(slugu(ctx), 1.5)).toThrow();
  });
});

describe("kota: eşzamanlılık (atomiklik)", () => {
  it("aynı süreçte eşzamanlı canlı bilgi istekleri kotayı aşmaz", async () => {
    const ctx = kotaliKiraci(25);
    // 4 paralel liste yüklemesi × 10 yer = 40 istek denemesi, kota 25.
    const sonuclar = await Promise.all(
      [0, 1, 2, 3].map((i) => canliBilgiGetir(ctx, mockIdleri(40).slice(i * 10, i * 10 + 10), "liste")),
    );
    const hepsi = sonuclar.flatMap((m) => [...m.values()]);
    expect(hepsi.filter((s) => s.durum === "tamam")).toHaveLength(25);
    expect(hepsi.filter((s) => s.durum === "kota")).toHaveLength(15);
    expect(aylikPlacesIstegi(ctx)).toBe(25);
  });

  it("ayrı süreçler aynı veritabanında aynı anda ayırsa da toplam tam olarak kota kadardır", async () => {
    const KOTA = 500;
    const ISCI = 4;
    const DENEME = 300; // toplam 1.200 deneme, kota 500
    const ctx = kotaliKiraci(KOTA);
    const tsx = path.resolve(__dirname, "../node_modules/tsx/dist/cli.mjs");
    const isci = path.resolve(__dirname, "yardimci/kota-isci.ts");
    const baslangic = Date.now() + 2500; // süreçlerin açılması için pay; sonra hepsi birlikte başlar

    const ciktilar = await Promise.all(
      Array.from(
        { length: ISCI },
        () =>
          new Promise<number>((coz, reddet) => {
            const s = spawn(process.execPath, [tsx, isci, ctx.tenantId, String(DENEME), String(baslangic)], {
              env: { ...process.env },
              cwd: path.resolve(__dirname, ".."),
            });
            let cikti = "";
            let hata = "";
            s.stdout.on("data", (d) => (cikti += d));
            s.stderr.on("data", (d) => (hata += d));
            s.on("close", (kod) => (kod === 0 ? coz(Number(cikti.trim())) : reddet(new Error(hata))));
          }),
      ),
    );

    expect(ciktilar.reduce((a, b) => a + b, 0)).toBe(KOTA); // başarılı ayırmaların toplamı
    expect(ciktilar.filter((n) => n > 0).length).toBeGreaterThan(1); // gerçekten birden fazla süreç ayırdı
    expect(aylikPlacesIstegi(ctx)).toBe(KOTA); // sayaç kotayı aşmadı
  }, 60_000);
});

describe("kota: Places çağrıları", () => {
  it("tarama sırasında kota dolarsa tarama kısmi olarak tamamlanır ve Places'a fazladan gidilmez", async () => {
    const ctx = kotaliKiraci(3);
    const t = taramaOlustur(ctx, { merkezLat: 40.99, merkezLng: 29.03, yaricapM: 8000, kategori: "emlak_ofisi" });
    const sonuc = await taramaCalistir(ctx, t.id);
    expect(sonuc).toMatchObject({ durum: "tamamlandi", kapsamTamam: false, istekSayisi: 3 });
    expect(sonuc?.hataMesaji).toContain(KOTA_DOLDU_MESAJI);
    expect(sonuc!.bulunanSayisi).toBeGreaterThan(0); // o ana kadar bulunanlar kaydedildi
    expect(aylikPlacesIstegi(ctx)).toBe(3);
  });

  it("kota doluyken liste/detay çağrısı yapılmaz, sonuç 'kota' olur", async () => {
    const ctx = kotaliKiraci(0);
    const sonuc = await canliBilgiGetir(ctx, mockIdleri(3), "detay");
    expect([...sonuc.values()]).toEqual([{ durum: "kota" }, { durum: "kota" }, { durum: "kota" }]);
    expect(aylikPlacesIstegi(ctx)).toBe(0);
  });

  it("gerçek istemci: kota doluyken HTTP isteği hiç gönderilmez", async () => {
    vi.stubEnv("PLACES_MOCK", "false");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-anahtari");
    const fetchSahte = vi.fn();
    vi.stubGlobal("fetch", fetchSahte);
    const ctx = kotaliKiraci(0);
    await expect(placesIstemcisiOlustur({ kota: kotaKapisi(ctx) }).yerDetayi("ChIJabc", "liste")).rejects.toBeInstanceOf(
      KotaDolduHatasi,
    );
    expect(fetchSahte).not.toHaveBeenCalled();
  });

  it("gerçek istemci: Google isteği reddederse ayrılan kota iade edilir, başarılıysa sayılır", async () => {
    vi.stubEnv("PLACES_MOCK", "false");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-anahtari");
    const ctx = kotaliKiraci(10);
    const istemci = placesIstemcisiOlustur({ kota: kotaKapisi(ctx) });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("hata", { status: 500 })));
    await expect(istemci.yerDetayi("ChIJabc", "liste")).rejects.toThrow(/500/);
    expect(aylikPlacesIstegi(ctx)).toBe(0);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("ağ yok"); }));
    await expect(istemci.yerDetayi("ChIJabc", "liste")).rejects.toThrow(/ulaşılamadı/);
    expect(aylikPlacesIstegi(ctx)).toBe(0);

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "ChIJabc", displayName: { text: "Deneme" } })));
    expect((await istemci.yerDetayi("ChIJabc", "liste"))?.ad).toBe("Deneme");
    expect(aylikPlacesIstegi(ctx)).toBe(1);
  });
});
