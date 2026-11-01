// Yeni düzen (docs/plan-yeni-duzen.md) — Grup 1: sayfa iskeleti, ana menü, kullanım göstergesi ve ortak parçalar.
// Menüde kullanım yalnızca yüzde olarak görünür; GET /api/kullanim birim, kota ya da kalan miktar döndürmez.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { kotaAyir } = await import("@/server/repo/kullanim");
const { basHarfler, kullanimOzeti, sekmeKlavye } = await import("@/lib/arayuz");
const kullanimRotasi = await import("@/app/api/kullanim/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const KOK = path.resolve(__dirname, "..");
const oku = (d: string) => fs.readFileSync(path.join(KOK, d), "utf8");

describe("kullanım göstergesi", () => {
  it("yalnızca yüzde ve seviye; %80'de uyarı, kota dolmadan %100 görünmez", () => {
    expect(kullanimOzeti({ oran: 0, uyari: false, doldu: false })).toEqual({ yuzde: 0, seviye: "normal" });
    expect(kullanimOzeti({ oran: 0.799, uyari: false, doldu: false })).toEqual({ yuzde: 79, seviye: "normal" });
    expect(kullanimOzeti({ oran: 0.8, uyari: true, doldu: false })).toEqual({ yuzde: 80, seviye: "uyari" });
    expect(kullanimOzeti({ oran: 0.9999, uyari: true, doldu: false })).toEqual({ yuzde: 99, seviye: "uyari" });
    expect(kullanimOzeti({ oran: 1, uyari: true, doldu: true })).toEqual({ yuzde: 100, seviye: "doldu" });
  });

  it("GET /api/kullanim: oturumsuz 401; yalnızca yüzde ve seviye döner, kullanım arttıkça değişir", async () => {
    oturum.ctx = null;
    expect((await kullanimRotasi.GET()).status).toBe(401);

    const { ctx } = kiraciOlustur(`K${Math.random().toString(36).slice(2, 7)}`);
    db.$client.prepare("update tenants set aylik_places_kotasi = 6000 where id = ?").run(ctx.tenantId);
    oturum.ctx = ctx;
    const ilk = await (await kullanimRotasi.GET()).json();
    expect(ilk).toEqual({ yuzde: 0, seviye: "normal" });

    expect(kotaAyir(ctx, 4800)).toBe(true);
    expect(await (await kullanimRotasi.GET()).json()).toEqual({ yuzde: 80, seviye: "uyari" });
    expect(kotaAyir(ctx, 1200)).toBe(true);
    const son = await (await kullanimRotasi.GET()).json();
    expect(son).toEqual({ yuzde: 100, seviye: "doldu" });
    expect(Object.keys(son).sort()).toEqual(["seviye", "yuzde"]); // birim / kota / kalan yok
  });
});

describe("ortak parçaların yardımcıları", () => {
  it("sekmelerde ok tuşları sarar, Home / End uçlara gider, diğer tuşlar yok sayılır", () => {
    expect(sekmeKlavye(0, "ArrowRight", 3)).toBe(1);
    expect(sekmeKlavye(2, "ArrowRight", 3)).toBe(0);
    expect(sekmeKlavye(0, "ArrowLeft", 3)).toBe(2);
    expect(sekmeKlavye(1, "Home", 3)).toBe(0);
    expect(sekmeKlavye(0, "End", 3)).toBe(2);
    expect(sekmeKlavye(1, "Enter", 3)).toBeNull();
    expect(sekmeKlavye(0, "ArrowRight", 0)).toBeNull();
  });

  it("kullanıcı kartında baş harfler (Türkçe büyük harf)", () => {
    expect(basHarfler("Demo Yönetici")).toBe("DY");
    expect(basHarfler("ilknur ışık")).toBe("İI");
    expect(basHarfler("çağrı")).toBe("ÇA");
    expect(basHarfler("Ayşe Nur Yılmaz")).toBe("AY");
    expect(basHarfler("   ")).toBe("?");
  });
});

describe("sayfa iskeleti ve menü", () => {
  it("menü adları ve simgeleri, altta kullanım göstergesi ve kullanıcı kartı", () => {
    const menu = oku("src/components/menu.tsx");
    for (const ad of ['"Panel"', '"Bölge tara"', '"Kayıtlar"', '"Kampanyalar"', '"Ayarlar"']) expect(menu).toContain(`ad: ${ad}`);
    expect(menu).not.toContain('"İletişim"');
    expect(menu).toContain("md:w-58"); // 232 px
    expect(menu).toContain("<KullanimGostergesi ilk={props.kullanim} />");
    expect(menu).toContain("basHarfler(props.kullaniciAdi)");
    const duzen = oku("src/app/(app)/layout.tsx");
    expect(duzen).toContain("kullanim={kullanimOzeti(kotaDurumu(b.ctx))}");
    expect(duzen).toMatch(/md:px-12 md:pt-10 md:pb-18/);
  });

  it("kullanım göstergesi birim göstermez; Places kullanan işlemlerden sonra yenilenir", () => {
    const gosterge = oku("src/components/kullanim-gostergesi.tsx");
    const kod = gosterge
      .split("\n")
      .filter((s) => !/^\s*(\/\/|\*|\/\*)/.test(s)) // yorumlar hariç
      .join("\n");
    expect(kod).not.toMatch(/birim/i);
    expect(gosterge).toContain('fetch("/api/kullanim"');
    for (const d of [
      "src/components/google-bilgisi.tsx",
      "src/app/(app)/kayitlar/detay-paneli.tsx",
      "src/app/(app)/tarama/tarama-paneli.tsx",
      "src/app/(app)/iletisim/whatsapp-listesi.tsx",
    ]) {
      expect(oku(d), d).toContain("kullanimDegisti();");
    }
  });

  it("her sayfa başlığında bir cümlelik açıklama zorunlu; ölçüler taslaktaki gibi", () => {
    expect(oku("src/components/sayfa-basligi.tsx")).toMatch(/aciklama: string;/);
    const css = oku("src/app/globals.css");
    expect(css).toContain("--radius-kart: 14px;");
    expect(css).toContain("--color-metin: #17201c;");
    expect(css).toMatch(/@utility dugme \{\s*@apply inline-flex min-h-11/);
    expect(css).toMatch(/@utility girdi \{\s*@apply min-h-11/);
  });
});
