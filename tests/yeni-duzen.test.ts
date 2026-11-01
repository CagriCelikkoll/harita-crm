// Yeni düzen (docs/plan-yeni-duzen.md) — Grup 1: sayfa iskeleti, ana menü, kullanım göstergesi ve ortak parçalar.
// Grup 2: Ayarlar alt rotaları, role göre ayar menüsü, WhatsApp kurulum adımları, ayrı formlardan alan güncelleme.
// Menüde kullanım yalnızca yüzde olarak görünür; GET /api/kullanim birim, kota ya da kalan miktar döndürmez.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx, sayfaBaglami: async () => ({ ctx: oturum.ctx }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db } = await import("@/server/db");
const { kotaAyir } = await import("@/server/repo/kullanim");
const { basHarfler, kullanimOzeti, sekmeKlavye } = await import("@/lib/arayuz");
const kullanimRotasi = await import("@/app/api/kullanim/route");
const { calismaAlaniGetir } = await import("@/server/repo/calisma-alani");
const { alanGuncelle } = await import("@/app/(app)/ayarlar/eylemler");
const { AYAR_GRUPLARI, ayarBolumuAcikMi, ayarGruplari, ILK_AYAR_BOLUMU } = await import("@/lib/ayar-bolumleri");
const { kotaDonemiMetni } = await import("@/lib/arayuz");
const { kurulumAdimlari } = await import("@/lib/whatsapp-api");
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

describe("Ayarlar: bölümler ve erişim (Grup 2)", () => {
  const yollar = (rol: "yonetici" | "uye") => ayarGruplari(rol).flatMap((g) => g.bolumler.map((b) => b.yol));

  it("yönetici bütün bölümleri, üye yalnızca kendini ilgilendirenleri görür", () => {
    expect(yollar("yonetici")).toEqual([
      "calisma-alani", "ekip", "kullanim", "gonderen", "saatler", "whatsapp-listesi", "whatsapp", "sms", "eposta", "veri",
    ]);
    expect(yollar("uye")).toEqual(["calisma-alani", "ekip", "kullanim", "saatler", "whatsapp-listesi"]);
    expect(ayarGruplari("uye").map((g) => g.ad)).toEqual(["Genel", "Gönderim"]); // Kanallar ve Veri grupları gizli
    for (const yol of ["gonderen", "whatsapp", "sms", "eposta", "veri"]) {
      expect(ayarBolumuAcikMi(yol, "uye"), yol).toBe(false);
      expect(ayarBolumuAcikMi(yol, "yonetici"), yol).toBe(true);
    }
    expect(ayarBolumuAcikMi("olmayan", "yonetici")).toBe(false);
  });

  it("her bölümün kendi sayfası var ve rol erişimini kendi yoluyla denetler; /ayarlar ilk bölüme yönlendirir", () => {
    for (const b of AYAR_GRUPLARI.flatMap((g) => g.bolumler)) {
      const sayfa = oku(`src/app/(app)/ayarlar/${b.yol}/page.tsx`);
      expect(sayfa, b.yol).toContain(`ayarBolumuBaglami("${b.yol}")`);
    }
    expect(ILK_AYAR_BOLUMU).toBe("/ayarlar/calisma-alani");
    expect(oku("src/app/(app)/ayarlar/page.tsx")).toContain("redirect(ILK_AYAR_BOLUMU)");
    expect(oku("src/app/(app)/ayarlar/erisim.ts")).toContain("if (!ayarBolumuAcikMi(yol, b.ctx.rol)) redirect(ILK_AYAR_BOLUMU);");
    expect(oku("src/app/(app)/iletisim/whatsapp-listesi.tsx")).toContain('href="/ayarlar/whatsapp-listesi"');
  });

  it("çalışma alanı adı ve veri saklama süresi ayrı formlardan güncellenir; formda olmayan alan değişmez", async () => {
    const { ctx } = kiraciOlustur(`A${Math.random().toString(36).slice(2, 7)}`);
    oturum.ctx = ctx;
    const form = (d: Record<string, string>) => {
      const f = new FormData();
      for (const [a, v] of Object.entries(d)) f.set(a, v);
      return f;
    };
    expect(await alanGuncelle({}, form({ veriSaklamaGun: "365" }))).toEqual({ tamam: "Kaydedildi." });
    expect(await alanGuncelle({}, form({ ad: "Yeni Ad" }))).toEqual({ tamam: "Kaydedildi." });
    expect(calismaAlaniGetir(ctx)).toMatchObject({ ad: "Yeni Ad", veriSaklamaGun: 365 });
    expect(await alanGuncelle({}, form({ veriSaklamaGun: "" }))).toEqual({ tamam: "Kaydedildi." });
    expect(calismaAlaniGetir(ctx)).toMatchObject({ ad: "Yeni Ad", veriSaklamaGun: null });
    expect((await alanGuncelle({}, form({}))).hata).toBe("Değiştirilecek bir alan yok.");
    expect((await alanGuncelle({}, form({ veriSaklamaGun: "10" }))).hata).toMatch(/30–3650/);
  });

  it("kullanım dönemi metni Türkçe ek uyumuyla", () => {
    expect(kotaDonemiMetni("2026-11")).toBe("Kasım ayı · 1 Aralık'ta sıfırlanır");
    expect(kotaDonemiMetni("2026-12")).toBe("Aralık ayı · 1 Ocak'ta sıfırlanır");
    expect(kotaDonemiMetni("2026-03")).toBe("Mart ayı · 1 Nisan'da sıfırlanır");
    expect(kotaDonemiMetni("2026-06")).toBe("Haziran ayı · 1 Temmuz'da sıfırlanır");
    expect(kotaDonemiMetni("2026-08")).toBe("Ağustos ayı · 1 Eylül'de sıfırlanır");
    expect(kotaDonemiMetni("2026-09")).toBe("Eylül ayı · 1 Ekim'de sıfırlanır");
    expect(kotaDonemiMetni("2026-10")).toBe("Ekim ayı · 1 Kasım'da sıfırlanır");
  });
});

describe("WhatsApp (Meta) kurulum adımları", () => {
  const temel = { tanimli: true, numaraDogrulandi: false, webhookDogrulandi: false, imzaliDurumAlindi: false, testModu: true, testModuKapatilabilir: false };

  it("adımlar mevcut bağlantı ve test modu kilidinden türetilir", () => {
    expect(kurulumAdimlari({ ...temel, tanimli: false })).toEqual(["etkin", "bekliyor", "bekliyor", "kilitli"]);
    expect(kurulumAdimlari(temel)).toEqual(["etkin", "bekliyor", "bekliyor", "kilitli"]);
    expect(kurulumAdimlari({ ...temel, numaraDogrulandi: true })).toEqual(["tamam", "etkin", "bekliyor", "kilitli"]);
    expect(kurulumAdimlari({ ...temel, numaraDogrulandi: true, webhookDogrulandi: true })).toEqual(["tamam", "tamam", "etkin", "kilitli"]);
    const hazir = { ...temel, numaraDogrulandi: true, webhookDogrulandi: true, imzaliDurumAlindi: true, testModuKapatilabilir: true };
    expect(kurulumAdimlari(hazir)).toEqual(["tamam", "tamam", "tamam", "etkin"]);
    expect(kurulumAdimlari({ ...hazir, testModu: false })).toEqual(["tamam", "tamam", "tamam", "tamam"]);
  });

  it("4. adım yalnızca sunucunun kilit kararına göre açılır", () => {
    // İmzalı bildirim var ama sunucu kapatılabilir demiyorsa (ör. webhook doğrulaması sıfırlandı) kilitli kalır.
    const a = kurulumAdimlari({ ...temel, numaraDogrulandi: true, imzaliDurumAlindi: true, testModuKapatilabilir: false });
    expect(a[3]).toBe("kilitli");
    const ekran = oku("src/app/(app)/ayarlar/whatsapp-api-ayarlari.tsx");
    expect(ekran).toContain("kurulumAdimlari(b)");
    expect(ekran).toContain('{ testModu: false }, "Test modu kapatıldı."');
    expect(ekran).not.toMatch(/type="checkbox"[^>]*testModu/); // eski pasif onay kutusu kalktı
  });
});
