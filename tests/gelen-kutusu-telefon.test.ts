// Gelen kutusu telefonda (PWA): yatay taşma, iOS odak yakınlaştırması, klavye açıkken Gönder. Tarayıcıda 390 / 360 px
// ölçüldü (scrollWidth === clientWidth); burada düzenin geri dönmemesi için kaynak denetimi.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const KOK = path.resolve(__dirname, "..");
const oku = (d: string) => fs.readFileSync(path.join(KOK, d), "utf8");
const gelen = oku("src/app/(app)/gelen-kutusu/gelen-kutusu.tsx");

describe("gelen kutusu telefonda", () => {
  it("ızgaralar telefonda minmax(0,1fr) tek sütun: uzun bölünmez metin sütunu genişletmez", () => {
    expect(gelen).toContain('className="grid min-h-[70dvh] grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]');
    expect(gelen).toContain('className="grid min-h-[70dvh] grid-cols-[minmax(0,1fr)] content-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]"');
    expect(gelen).toMatch(/kart min-w-0 flex-col gap-3 !p-0/);
  });

  it("balon, alıntı ve not metni her yerden bölünür (overflow-wrap: anywhere)", () => {
    expect(gelen).not.toContain("break-words");
    expect(gelen).toContain('<p className="wrap-anywhere whitespace-pre-wrap">{giden ? metin');
    expect(gelen).toContain('<span className="line-clamp-2 wrap-anywhere">{yanit.ozet}</span>');
    expect(gelen).toContain('<p className="wrap-anywhere whitespace-pre-wrap">{n.metin}</p>');
  });

  it("yükseklikler dvh; telefonda yazma alanına odaklanınca Gönder görünür alana kaydırılır", () => {
    expect(gelen).not.toMatch(/\d+vh\b/);
    expect(gelen).toContain("max-h-[60dvh]");
    expect(gelen).toContain("onFocus={(e) => gonderGorunsun(e.currentTarget.form)}");
    expect(gelen).toContain("window.visualViewport");
    expect(oku("src/app/(app)/layout.tsx")).toContain('className="min-h-dvh md:flex"');
  });

  it("iOS odak yakınlaştırması: ≤ 640 px'te yazı alanları en az 16 px, katmansız kural", () => {
    const css = oku("src/app/globals.css");
    const i = css.indexOf("font-size: max(16px, 1em)");
    expect(i).toBeGreaterThan(0);
    const blok = css.slice(css.lastIndexOf("@media (max-width: 640px)", i), i);
    expect(blok).toContain("textarea");
    expect(blok).toContain("select");
    // Katmansız (satır başında @media): @layer içinde olsaydı text-sm gibi yardımcı sınıflar ezerdi.
    expect(css.slice(0, i)).toMatch(/\n@media \(max-width: 640px\) \{\n[^@]*$/);
  });

  it("viewport: device-width, initial-scale 1; yakınlaştırma engellenmez", () => {
    const l = oku("src/app/layout.tsx");
    expect(l).toContain('width: "device-width", initialScale: 1, interactiveWidget: "resizes-content"');
    expect(l).not.toMatch(/maximumScale|userScalable/);
  });
});
