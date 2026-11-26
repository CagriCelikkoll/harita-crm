// Arayüz toparlama (görsel denetim sonrası). Faz 0: tarama sonuçları da Kayıtlar gibi Google'dan kendiliğinden veri
// çekmez; adı girilmemiş kayıtta yer tutucu ve kullanıcı isteyince tek kayıt için "Google'dan getir".
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (asil) => ({
  ...(await asil<typeof import("next/navigation")>()),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
}));

const KOK = path.resolve(__dirname, "..");
const oku = (d: string) => fs.readFileSync(path.join(KOK, d), "utf8");
const tsxDosyalari = (k: string): string[] =>
  fs.readdirSync(path.join(KOK, k), { withFileTypes: true }).flatMap((g) => {
    const yol = path.join(k, g.name);
    return g.isDirectory() ? tsxDosyalari(yol) : g.name.endsWith(".tsx") ? [yol] : [];
  });

describe("Faz 0: listeler Google'dan kendiliğinden veri çekmez", () => {
  it("hiçbir ekran otomatik Google isteği açmaz (useGoogleBilgisi otomatikIdler verilmez)", () => {
    const kullanan = tsxDosyalari("src")
      .filter((d) => !d.replaceAll("\\", "/").endsWith("components/google-bilgisi.tsx"))
      .filter((d) => /otomatikIdler|otomatik=\{/.test(oku(d)));
    expect(kullanan).toEqual([]);
    // Kanca yalnızca otomatik liste doluysa istek atar.
    expect(oku("src/components/google-bilgisi.tsx")).toMatch(/if \(otomatikIstendi\.current \|\| !ilkOtomatik\.length\) return;/);
  });

  it("tarama sonucu kartı: adı girilmemişse sade yer tutucu + 'Google'dan getir' ve 'aylık kullanımdan düşer'", async () => {
    const { SonucIzgarasi } = await import("@/app/(app)/tarama/sonuc-izgarasi");
    const h = renderToStaticMarkup(
      createElement(SonucIzgarasi, {
        taramaId: "t",
        baslik: "Kadıköy",
        merkez: { lat: 41, lng: 29 },
        satirlar: [
          { id: "a", isletmeAdi: null, inceleme: "incelenmedi" },
          { id: "b", isletmeAdi: "Ege Emlak", inceleme: "incelenmedi" },
        ],
        sayilar: { bulunan: 2, incelenmedi: 2, ilgilenilen: 0, gecilen: 0 },
        karar: "tum",
        kararBaglantisi: { tum: "/tarama", ilgi: "/tarama", gec: "/tarama" },
        sayfalama: { sayfa: 1, sayfaSayisi: 1, toplam: 2, boyut: 50, taban: "/tarama" },
      }),
    );
    expect(h).toContain('<span class="text-soluk">Google kaydı · ad girilmemiş</span>');
    expect(h.match(/Google&#x27;dan getir|Google'dan getir/g)).toHaveLength(1); // yalnızca adı girilmemiş kayıtta
    expect(h).toContain("aylık kullanımdan düşer");
    expect(h).not.toMatch(/Yükleniyor|>Göster</);
    expect(h).toContain("Ege Emlak");
  });
});

// ——— Faz 1: belirteçler ve etkileşim durumları ———

const css = () => oku("src/app/globals.css");
const belirtec = (ad: string) => {
  const m = css().match(new RegExp(`--color-${ad}:\\s*(#[0-9a-fA-F]{6});`));
  if (!m) throw new Error(`belirteç yok: ${ad}`);
  return m[1];
};
const parlaklik = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const kontrast = (a: string, b: string) => {
  const [x, y] = [parlaklik(a), parlaklik(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("Faz 1: belirteçler (WCAG)", () => {
  it("form alanı kenarı beyaz ve zeminde ≥ 3:1; okundu giden balonda ≥ 4,5:1; odak ≥ 3:1", () => {
    expect(kontrast(belirtec("kenar-alan"), "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(kontrast(belirtec("kenar-alan"), belirtec("zemin"))).toBeGreaterThanOrEqual(3);
    expect(kontrast(belirtec("okundu"), belirtec("ana-acik"))).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(belirtec("odak"), "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(kontrast(belirtec("odak"), belirtec("zemin"))).toBeGreaterThanOrEqual(3);
    expect(kontrast(belirtec("menu-vurgu"), belirtec("menu"))).toBeGreaterThanOrEqual(3); // koyu menüde odak
  });

  it("üzerine gelme beyazdan ≥ 1,15:1 ayrışır; seçili satır daha koyu ve soluk metin onda ≥ 4,5:1", () => {
    expect(kontrast(belirtec("uzerine-gelme"), "#ffffff")).toBeGreaterThanOrEqual(1.15);
    expect(kontrast(belirtec("secili-satir"), "#ffffff")).toBeGreaterThan(kontrast(belirtec("uzerine-gelme"), "#ffffff"));
    expect(kontrast(belirtec("soluk"), belirtec("secili-satir"))).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(belirtec("ana"), belirtec("uzerine-gelme"))).toBeGreaterThanOrEqual(4.5);
    for (const [on, arka] of [["bilgi", "bilgi-acik"], ["mor", "mor-acik"], ["uyari", "uyari-acik"], ["tehlike", "tehlike-acik"]]) {
      expect(kontrast(belirtec(on), belirtec(arka)), on).toBeGreaterThanOrEqual(4.5);
    }
    expect(belirtec("ilerleme-zemin")).toBe("#eef0ec");
  });
});

describe("Faz 1: etkileşim durumları", () => {
  it("odak tek biçim: :focus-visible 2 px odak rengi + 2 px boşluk; fare tıklamasında halka yok; koyu menüde açık ton", () => {
    expect(css()).toMatch(/:focus:not\(:focus-visible\)\s*\{\s*outline: none;/);
    expect(css()).toMatch(/:focus-visible\s*\{\s*outline: 2px solid var\(--odak-rengi, var\(--color-odak\)\);\s*outline-offset: 2px;/);
    expect(oku("src/components/menu.tsx")).toContain("[--odak-rengi:var(--color-menu-vurgu)]");
    // Ortak düğmede ayrı (tutarsız) odak sınıfı kalmadı.
    expect(css()).not.toContain("focus-visible:outline-ana");
  });

  it("hover / basılı / devre dışı: düğme türlerinde not-disabled:hover ve active; 120 ms geçiş, hareket azaltmada yok", () => {
    const c = css();
    for (const s of ["not-disabled:hover:bg-uzerine-gelme not-disabled:active:bg-basili", "not-disabled:hover:bg-ana-uzerine not-disabled:active:bg-ana-koyu", "not-disabled:active:bg-tehlike-basili"]) {
      expect(c).toContain(s);
    }
    expect(c).toMatch(/transition-duration: 120ms;/);
    expect(c).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none;/);
    expect(c).toMatch(/:where\(button, select, input, textarea\):disabled \{\s*opacity: 0\.5;\s*cursor: not-allowed;/);
  });

  it("tablo satırı: üzerine gelme zemini + 3 px ana şerit; seçili satırda kalıcı; eski kart-alt hover'ı kalmadı", () => {
    expect(css()).toMatch(/@utility satir \{\s*@apply hover:bg-uzerine-gelme;\s*&:hover > :first-child \{\s*box-shadow: inset 3px 0 0 var\(--color-ana\);/);
    expect(css()).toMatch(/@utility satir-secili \{\s*@apply bg-secili-satir/);
    expect(oku("src/app/(app)/kayitlar/kayit-tablosu.tsx")).toContain('secili ? "satir-secili" : "satir"');
    expect(oku("src/app/(app)/kampanyalar/page.tsx")).toContain('className="satir border-b border-cizgi"');
    const kullanan = tsxDosyalari("src").filter((d) => /hover:bg-kart-alt|text-\[#1d6fd1\]|bg-\[#f1f7f5\]/.test(oku(d)));
    expect(kullanan).toEqual([]);
  });

  it("dokunma hedefi (≤ 640 px): bağlantı / düğme / sekme / summary / onay kutulu etiket ::after ile ≥ 44 px; select ve girdiler 44 px", () => {
    const c = css();
    expect(c).toMatch(/@media \(max-width: 640px\)[\s\S]*?width: max\(100%, 44px\);\s*height: max\(100%, 44px\);/);
    expect(c).toContain('label:has(input[type="checkbox"], input[type="radio"])');
    expect(c).toMatch(/:where\(select, input:not\(\[type="checkbox"\], \[type="radio"\], \[type="hidden"\], \[type="file"\]\)\) \{\s*min-height: 44px;/);
  });

  it("OnayKutusu: etiket sarmalayıcı (dokunma alanı), yazısızken aria-label; 18 px tek görünüm", async () => {
    const { OnayKutusu } = await import("@/components/arayuz/onay-kutusu");
    const h = renderToStaticMarkup(createElement(OnayKutusu, { etiket: "Seç: Ege", checked: true, onChange: () => {} }));
    expect(h).toMatch(/^<label class="inline-flex cursor-pointer items-center gap-2[^"]*"><input type="checkbox" aria-label="Seç: Ege" title="Seç: Ege" checked=""\/><\/label>$/);
    expect(css()).toMatch(/input\[type="checkbox"\],\s*input\[type="radio"\] \{\s*appearance: none;[\s\S]*?width: 18px;\s*height: 18px;/);
  });
});

// ——— Faz 2: ortak bileşenler ———

describe("Faz 2: ortak bileşenler", () => {
  it("Dugme: türler / boyutlar; yükleniyor → devre dışı + aria-busy + döner gösterge, metin korunur", async () => {
    const { Dugme, dugmeSinifi } = await import("@/components/arayuz/dugme");
    expect(dugmeSinifi("ana")).toBe("dugme-ana");
    expect(dugmeSinifi("ikincil", "kucuk")).toBe("dugme dugme-kucuk");
    expect(dugmeSinifi("tehlike")).toBe("dugme-tehlike");
    expect(dugmeSinifi("metin", "kucuk")).toBe("dugme-metin");
    expect(dugmeSinifi("ikon")).toBe("dugme-ikon");
    const h = renderToStaticMarkup(createElement(Dugme, { tur: "ana", yukleniyor: true }, "Uygula"));
    expect(h).toMatch(/^<button type="button" disabled="" aria-busy="true" class="dugme-ana"><svg aria-hidden="true"[^>]*animate-spin motion-reduce:animate-none[\s\S]*<\/svg>Uygula<\/button>$/);
    const n = renderToStaticMarkup(createElement(Dugme, null, "Vazgeç"));
    expect(n).toBe('<button type="button" class="dugme">Vazgeç</button>');
  });

  it("DonerGosterge etiketliyse role=status ve görünür metin; Secim ortak sınıf", async () => {
    const { DonerGosterge } = await import("@/components/arayuz/doner-gosterge");
    expect(renderToStaticMarkup(createElement(DonerGosterge, { etiket: "Sayılıyor…" }))).toMatch(/^<span role="status"[^>]*><svg[\s\S]*<\/svg>Sayılıyor…<\/span>$/);
    const { Secim } = await import("@/components/arayuz/secim");
    expect(renderToStaticMarkup(createElement(Secim, { defaultValue: "a" }, createElement("option", { value: "a" }, "A")))).toContain('class="girdi cursor-pointer"');
  });

  it("Diyalog: tek bileşen; aria-modal, showModal (Esc), arka plan tıklaması, odak tuzağı, odak geri döner", async () => {
    const d = oku("src/components/arayuz/diyalog.tsx");
    for (const s of ['aria-modal="true"', "d.showModal()", "onClick={pencereDisinaTiklaninca}", "tuzakHedefi(", ".focus?.()"]) expect(d).toContain(s);
    const { tuzakHedefi } = await import("@/components/arayuz/diyalog");
    expect(tuzakHedefi(["a", "b", "c"], "c", false)).toBe("a");
    expect(tuzakHedefi(["a", "b", "c"], "a", true)).toBe("c");
    expect(tuzakHedefi(["a", "b", "c"], "b", false)).toBeNull();
    expect(tuzakHedefi(["a", "b"], "dışarı", false)).toBe("a");
    // Elle yazılmış <dialog> kalmadı.
    expect(tsxDosyalari("src").filter((f) => !f.endsWith("diyalog.tsx") && oku(f).includes("<dialog"))).toEqual([]);
  });
});

// ——— Faz 2: ortak bileşenler ———

describe("Faz 2: ortak bileşenler", () => {
  it("Dugme: türler / boyutlar; yükleniyor → devre dışı + aria-busy + döner gösterge, metin korunur", async () => {
    const { Dugme, dugmeSinifi } = await import("@/components/arayuz/dugme");
    expect(dugmeSinifi("ana")).toBe("dugme-ana");
    expect(dugmeSinifi("ikincil", "kucuk")).toBe("dugme dugme-kucuk");
    expect(dugmeSinifi("tehlike")).toBe("dugme-tehlike");
    expect(dugmeSinifi("metin", "kucuk")).toBe("dugme-metin");
    expect(dugmeSinifi("ikon")).toBe("dugme-ikon");
    const h = renderToStaticMarkup(createElement(Dugme, { tur: "ana", yukleniyor: true }, "Uygula"));
    expect(h).toMatch(/^<button type="button" disabled="" aria-busy="true" class="dugme-ana"><svg aria-hidden="true"[^>]*animate-spin motion-reduce:animate-none[\s\S]*<\/svg>Uygula<\/button>$/);
    expect(renderToStaticMarkup(createElement(Dugme, null, "Vazgeç"))).toBe('<button type="button" class="dugme">Vazgeç</button>');
  });

  it("DonerGosterge etiketliyse role=status ve görünür metin; Secim ortak sınıf", async () => {
    const { DonerGosterge } = await import("@/components/arayuz/doner-gosterge");
    expect(renderToStaticMarkup(createElement(DonerGosterge, { etiket: "Sayılıyor…" }))).toMatch(/^<span role="status"[^>]*><svg[\s\S]*<\/svg>Sayılıyor…<\/span>$/);
    const { Secim } = await import("@/components/arayuz/secim");
    expect(renderToStaticMarkup(createElement(Secim, { defaultValue: "a" }, createElement("option", { value: "a" }, "A")))).toContain('class="girdi cursor-pointer"');
  });

  it("Diyalog: tek bileşen; aria-modal, showModal (Esc), arka plan tıklaması, odak tuzağı, odak geri döner", async () => {
    const d = oku("src/components/arayuz/diyalog.tsx");
    for (const s of ['aria-modal="true"', "d.showModal()", "onClick={pencereDisinaTiklaninca}", "tuzakHedefi(", ".focus?.()"]) expect(d).toContain(s);
    const { tuzakHedefi } = await import("@/components/arayuz/diyalog");
    expect(tuzakHedefi(["a", "b", "c"], "c", false)).toBe("a");
    expect(tuzakHedefi(["a", "b", "c"], "a", true)).toBe("c");
    expect(tuzakHedefi(["a", "b", "c"], "b", false)).toBeNull();
    expect(tuzakHedefi(["a", "b"], "dışarı", false)).toBe("a");
    expect(tsxDosyalari("src").filter((f) => !f.endsWith("diyalog.tsx") && oku(f).includes("<dialog"))).toEqual([]);
  });
});

// ——— Faz 3: ölçekler ve renk belirteçleri ———

describe("Faz 3: ölçekler ve renk belirteçleri", () => {
  // WhatsApp önizlemesi marka renklerini / telefon çerçevesini taklit eder; Google atfı Google'ın rengini kullanır.
  const ISTISNA = ["mesaj-onizlemesi.tsx", "google-atfi.tsx"];
  const kaynaklar = () => tsxDosyalari("src").filter((f) => !ISTISNA.some((i) => f.endsWith(i)));
  const bul = (re: RegExp) => kaynaklar().flatMap((f) => (oku(f).match(re) ?? []).map((m) => `${f}: ${m}`));

  it("yazı ölçeği 12/13/14/16/20/28 (xs/ufak/sm/base/xl/baslik); ağırlık en fazla 600", () => {
    expect(css()).toMatch(/--text-ufak: 13px;/);
    expect(css()).toMatch(/--text-baslik: 28px;/);
    expect(bul(/\btext-\[\d+px\]|\btext-(lg|2xl|3xl|4xl)\b/g)).toEqual([]);
    expect(bul(/\bfont-(bold|extrabold|black|light|thin)\b/g)).toEqual([]);
    expect(css()).not.toMatch(/font-bold|font-weight: 700/);
  });

  it("köşe ölçeği 6/8/10/14/tam; 7 ve 9 px yok; iki gölge düzeyi (yok / yükselti)", () => {
    expect(css()).toMatch(/--radius-xl: 10px;\s*--radius-kart: 14px;/);
    expect(bul(/\brounded-\[\d+px\]|\brounded-(sm|2xl|3xl)\b|\brounded(?=["'`\s])/g)).toEqual([]);
    expect(bul(/\bshadow(-sm|-md|-lg|-xl|-2xl|-\[[^\]]*\])?(?=["'`\s])/g)).toEqual([]);
    expect(oku("src/components/arayuz/diyalog.tsx")).toContain("shadow-yukselti");
  });

  it("simge ölçeği 14/16/20 (boş durumlar 24+); varsayılan 16", () => {
    const simge = oku("src/components/arayuz/simge.tsx");
    expect(simge).toContain("boyut = 16,");
    expect(simge).toContain("boyut?: 14 | 16 | 20 | 24 | 32 | 48;");
  });

  it("sabit hex / amber / red sınıfı yok; rozet tonları belirteç", async () => {
    expect(bul(/\b(bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g)).toEqual([]);
    expect(bul(/\b(bg|text|border|ring)-(amber|red|orange|yellow|green|blue|gray|slate)-\d+\b/g)).toEqual([]);
    const { DURUM_TONU, TON_DOLGUSU } = await import("@/components/arayuz/rozet");
    expect(TON_DOLGUSU).toEqual({ ana: "bg-ana", notr: "bg-pasif", uyari: "bg-uyari-dolgu", tehlike: "bg-tehlike", mavi: "bg-bilgi", mor: "bg-mor" });
    // Haritadaki işaretler rozetteki durum tonuyla aynı renk.
    const { DURUM_ISARET_RENGI, RENK } = await import("@/lib/renk-belirtecleri");
    const tonRengi = { ana: RENK.ana, notr: RENK.pasif, uyari: RENK.uyariDolgu, mavi: RENK.bilgi, mor: RENK.mor } as Record<string, string>;
    for (const [durum, ton] of Object.entries(DURUM_TONU)) expect(DURUM_ISARET_RENGI[durum as keyof typeof DURUM_TONU], durum).toBe(tonRengi[ton]);
  });

  it("CSS dışı renkler (harita, manifest, simge) globals.css belirteçleriyle aynı; dosyalarda çıplak hex yok", async () => {
    const { RENK } = await import("@/lib/renk-belirtecleri");
    const ad: Record<keyof typeof RENK, string | null> = { ana: "ana", zemin: "zemin", beyaz: null, bilgi: "bilgi", uyariDolgu: "uyari-dolgu", mor: "mor", pasif: "pasif" };
    for (const [k, v] of Object.entries(ad)) if (v) expect(RENK[k as keyof typeof RENK], k).toBe(belirtec(v));
    for (const f of ["src/components/harita.tsx", "src/app/manifest.ts", "src/app/layout.tsx", "src/app/simge-cizimi.tsx"]) {
      expect(oku(f).match(/["']#[0-9a-fA-F]{6}["']/g), f).toBeNull();
    }
  });

  it("kampanya alıcıları: adı girilmemiş Google kaydı sade soluk metin (italik değil) + yanında 'Göster' metin düğmesi", () => {
    const d = oku("src/app/(app)/kampanyalar/[id]/kampanya-detayi.tsx");
    expect(d).toContain('"text-soluk underline-offset-2 hover:text-metin hover:underline"');
    expect(d).not.toContain("italic");
    expect(oku("src/components/google-bilgisi.tsx")).toMatch(/<Dugme\s+tur="metin"[\s\S]*?Göster\s*<\/Dugme>/);
  });
});
