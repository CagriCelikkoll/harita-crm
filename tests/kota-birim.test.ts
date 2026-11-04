// Maliyet ağırlıklı kota birimleri (1 birim = 0,001 $) ve İstanbul saatine göre kota ayı.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BIRIM_DOLAR, birimHesapla, PLACES_BIRIMLERI } from "@/lib/places-birimleri";
import { ayAnahtari, gunAnahtari, gunIciDakika } from "@/lib/zaman";
import { db } from "@/server/db";
import { cagriBirimi, placesIstemcisiOlustur } from "@/server/places/istemci";
import { KotaDolduHatasi } from "@/server/places/tipler";
import type { TenantContext } from "@/server/repo/baglam";
import { aylikPlacesBirimi, kotaAyir, kotaDurumu } from "@/server/repo/kullanim";
import { kotaKapisi } from "@/server/servisler/kota";
import { kiraciOlustur } from "./yardimci/fabrika";

function kotaliKiraci(kota: number): TenantContext {
  const { ctx } = kiraciOlustur(`Birim${Math.random().toString(36).slice(2, 7)}`);
  db.$client.prepare("update tenants set aylik_places_kotasi = ? where id = ?").run(kota, ctx.tenantId);
  return ctx;
}
const MOCK_YER = "mock_cafe_10250_7258";

afterEach(() => {
  vi.useRealTimers();
});

describe("kota birimleri", () => {
  it("1 birim = 0,001 $: istek birimi, SKU'nun 1.000 istek başına liste fiyatıdır; ücretsiz SKU 0", () => {
    expect(BIRIM_DOLAR).toBe(0.001);
    expect(PLACES_BIRIMLERI).toEqual({
      textSearchIdsOnly: 0,
      placeDetailsEssentials: 5,
      placeDetailsPro: 17,
      placeDetailsEnterprise: 20,
      textSearchPro: 32,
      dynamicMaps: 7, // Maps JavaScript API harita yüklemesi
    });
    expect(birimHesapla(0)).toBe(0);
    expect(birimHesapla(0.2)).toBe(1); // ücretli bir SKU hiçbir zaman 0 birim olmaz
  });

  it("her Places çağrısı faturalandığı SKU'nun birimini kullanır", () => {
    expect(cagriBirimi("taramaYalnizcaId")).toBe(0);
    expect(cagriBirimi("taramaKonumlu")).toBe(32);
    expect(cagriBirimi("adres")).toBe(32);
    expect(cagriBirimi("liste")).toBe(17);
    expect(cagriBirimi("detay")).toBe(20);
    expect(cagriBirimi("telefon")).toBe(20);
  });

  it("ücretsiz istek kota doluyken de yapılır ve kotadan düşmez; ücretli istek yapılmaz", async () => {
    const ctx = kotaliKiraci(0);
    const istemci = placesIstemcisiOlustur({ kota: kotaKapisi(ctx) });
    const alan = { guney: 40.98, bati: 29.02, kuzey: 41.0, dogu: 29.04 };
    const yanit = await istemci.metinAra({ sorgu: "kafe", tur: "cafe", alan, konumIste: false });
    expect(yanit.yerler.length).toBeGreaterThan(0);
    await expect(istemci.metinAra({ sorgu: "kafe", tur: "cafe", alan, konumIste: true })).rejects.toBeInstanceOf(
      KotaDolduHatasi,
    );
    expect(aylikPlacesBirimi(ctx)).toBe(0);
  });

  it("detay 20 birim düşer; kalan birim yetmeyen istek yapılmaz, yetenler yapılır", async () => {
    const ctx = kotaliKiraci(37);
    const istemci = placesIstemcisiOlustur({ kota: kotaKapisi(ctx) });
    expect(await istemci.yerDetayi(MOCK_YER, "detay")).not.toBeNull();
    expect(aylikPlacesBirimi(ctx)).toBe(20);
    await expect(istemci.yerDetayi(MOCK_YER, "detay")).rejects.toBeInstanceOf(KotaDolduHatasi);
    expect(await istemci.yerDetayi(MOCK_YER, "liste")).not.toBeNull(); // 17 birim hâlâ sığar
    expect(aylikPlacesBirimi(ctx)).toBe(37);
  });
});

describe("kota ayı (Europe/Istanbul)", () => {
  // 31 Ekim 23:30 İstanbul = 20:30 UTC; 1 Kasım 00:30 İstanbul = 31 Ekim 21:30 UTC (UTC'de hâlâ Ekim).
  const EKIM_SONU = new Date("2026-10-31T20:30:00Z");
  const KASIM_BASI = new Date("2026-10-31T21:30:00Z");

  it("ay ve gün anahtarı İstanbul takvimine göredir", () => {
    expect(ayAnahtari(EKIM_SONU)).toBe("2026-10");
    expect(ayAnahtari(KASIM_BASI)).toBe("2026-11");
    expect(gunAnahtari(EKIM_SONU)).toBe("2026-10-31");
    expect(gunAnahtari(KASIM_BASI)).toBe("2026-11-01");
    expect(gunIciDakika(EKIM_SONU)).toBe(23 * 60 + 30);
    expect(gunIciDakika(KASIM_BASI)).toBe(30);
    expect(ayAnahtari(new Date("2026-12-31T21:00:00Z"))).toBe("2027-01"); // yıl geçişi
  });

  it("31'i 23:30'da dolan kota 1'i 00:30'da yeniden kullanılabilir", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const ctx = kotaliKiraci(6);
    vi.setSystemTime(EKIM_SONU);
    expect(kotaAyir(ctx, 6)).toBe(true);
    expect(kotaAyir(ctx, 1)).toBe(false);
    expect(kotaDurumu(ctx).doldu).toBe(true);

    vi.setSystemTime(KASIM_BASI);
    expect(kotaDurumu(ctx)).toMatchObject({ kullanilan: 0, doldu: false });
    expect(kotaAyir(ctx, 6)).toBe(true);
    expect(aylikPlacesBirimi(ctx, "2026-10")).toBe(6);
    expect(aylikPlacesBirimi(ctx, "2026-11")).toBe(6);
  });

  it("ay geçişinden önce ayrılan birim, geçişten sonra iade edilse de kendi ayına iade edilir", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const ctx = kotaliKiraci(10);
    vi.setSystemTime(EKIM_SONU);
    const ayrilan = kotaKapisi(ctx).ayir(4, "iletisimBilgisi");
    expect(ayrilan).not.toBeNull();
    vi.setSystemTime(KASIM_BASI);
    kotaAyir(ctx, 2);
    ayrilan!.iade();
    expect(aylikPlacesBirimi(ctx, "2026-10")).toBe(0);
    expect(aylikPlacesBirimi(ctx, "2026-11")).toBe(2);
  });
});
