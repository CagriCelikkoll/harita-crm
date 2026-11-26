// Liste tercihleri (lib/liste-tercihi) ve açılır menülerin dışarı tıklama / Esc ile kapanması (lib/disari-tiklama).
// Ortam "node": DOM yok; dinleyici EventTarget ile, depolama sahte nesneyle sınanır.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { disariTiklamaDinle, kapanmaNedeni, noktaDisindaMi, type KapanmaNedeni } from "@/lib/disari-tiklama";
import { gelenKutusuFiltresiCoz, gelenKutusuTercihi, VARSAYILAN_GELEN_KUTUSU_FILTRESI } from "@/lib/gelen-kutusu";
import { etkinSuzgecEtiketleri, kayitFiltresiCoz } from "@/lib/kayit-filtresi";
import {
  GELEN_KUTUSU_TERCIH_ALANLARI,
  KAMPANYA_TERCIH_ALANLARI,
  KAYIT_TERCIH_ALANLARI,
  tercihAnahtari,
  tercihKarari,
  tercihOku,
  tercihYaz,
  type TercihDeposu,
} from "@/lib/liste-tercihi";

const KOK = path.resolve(__dirname, "..");
const oku = (d: string) => fs.readFileSync(path.join(KOK, d), "utf8");
const sozluk = (o: Record<string, string>) => (a: string): string | undefined => o[a];

function bellekDeposu(): TercihDeposu & { veri: Map<string, string> } {
  const veri = new Map<string, string>();
  return { veri, getItem: (k) => veri.get(k) ?? null, setItem: (k, v) => void veri.set(k, String(v)) };
}
const bozukDepo: TercihDeposu = {
  getItem: () => {
    throw new DOMException("erişim yok", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("kota", "QuotaExceededError");
  },
};

/** Olayın hedefini (dispatch'te belgeye dönüşür) sınama için sabitler. */
function olay(tur: string, hedef: object, ek: Record<string, unknown> = {}) {
  const e = new Event(tur, { cancelable: true });
  Object.defineProperty(e, "target", { value: hedef });
  for (const [k, v] of Object.entries(ek)) Object.defineProperty(e, k, { value: v });
  return e;
}

describe("açılır menü: dışarı tıklama ve Esc ile kapanma", () => {
  const panel = { ad: "panel" };
  const dugme = { ad: "düğme" };
  const disari = { ad: "sayfa" };
  const icindeMi = (h: EventTarget | null) => h === (panel as unknown) || h === (dugme as unknown);

  it("kapanmaNedeni: dışarı pointerdown → disari; içeride (panel ya da açan düğme) → kapanmaz; Esc → esc", () => {
    expect(kapanmaNedeni({ type: "pointerdown", target: disari as unknown as EventTarget }, icindeMi)).toBe("disari");
    expect(kapanmaNedeni({ type: "pointerdown", target: panel as unknown as EventTarget }, icindeMi)).toBeNull();
    expect(kapanmaNedeni({ type: "pointerdown", target: dugme as unknown as EventTarget }, icindeMi)).toBeNull();
    expect(kapanmaNedeni({ type: "keydown", key: "Escape", target: panel as unknown as EventTarget }, icindeMi)).toBe("esc");
    expect(kapanmaNedeni({ type: "keydown", key: "Enter", target: disari as unknown as EventTarget }, icindeMi)).toBeNull();
    // Esc'yi iç öğe zaten işlediyse (ör. hazır cevap arama kutusu) ikinci kez kapatılmaz.
    expect(kapanmaNedeni({ type: "keydown", key: "Escape", target: panel as unknown as EventTarget, defaultPrevented: true }, icindeMi)).toBeNull();
  });

  it("disariTiklamaDinle: belgedeki olaylar kapatır, Esc olayı durdurulur; kaldırınca dinlemez", () => {
    const belge = new EventTarget();
    const nedenler: KapanmaNedeni[] = [];
    const kaldir = disariTiklamaDinle(belge, icindeMi, (n) => nedenler.push(n));

    belge.dispatchEvent(olay("pointerdown", panel));
    expect(nedenler).toEqual([]);
    belge.dispatchEvent(olay("pointerdown", disari));
    expect(nedenler).toEqual(["disari"]);
    const esc = olay("keydown", panel, { key: "Escape" });
    belge.dispatchEvent(esc);
    expect(nedenler).toEqual(["disari", "esc"]);
    expect(esc.defaultPrevented).toBe(true);

    kaldir();
    belge.dispatchEvent(olay("pointerdown", disari));
    belge.dispatchEvent(olay("keydown", disari, { key: "Escape" }));
    expect(nedenler).toEqual(["disari", "esc"]);
  });

  it("modal pencere: yalnızca pencerenin dışındaki (arka plan) nokta kapatır", () => {
    const r = { left: 100, right: 500, top: 100, bottom: 400 };
    expect(noktaDisindaMi(r, 50, 200)).toBe(true);
    expect(noktaDisindaMi(r, 300, 450)).toBe(true);
    expect(noktaDisindaMi(r, 300, 200)).toBe(false);
    expect(noktaDisindaMi(r, 100, 100)).toBe(false);
  });

  it("uygulamadaki açılır menü ve pencereler ortak yardımcıyı kullanır; Filtreler artık <details> değil", () => {
    const kayitlar = oku("src/app/(app)/kayitlar/page.tsx");
    expect(kayitlar).not.toContain("<details");
    expect(kayitlar).toContain("<AcilirPanel");
    for (const d of ["src/components/arayuz/acilir-panel.tsx", "src/app/(app)/gelen-kutusu/ekler.tsx", "src/app/(app)/gelen-kutusu/gelen-kutusu.tsx", "src/components/menu.tsx"]) {
      expect(oku(d), d).toMatch(/useDisariTiklama\(/);
    }
    for (const d of ["src/app/(app)/kayitlar/toplu-islem.tsx", "src/components/ret-onayi.tsx", "src/app/(app)/ayarlar/mesajlasma-ayarlari.tsx"]) {
      expect(oku(d), d).toContain("<Diyalog");
    }
    expect(oku("src/components/arayuz/diyalog.tsx")).toContain("onClick={pencereDisinaTiklaninca}");
    // Kapanan Filtreler panelinin içeriği DOM'da kalır (uygulanmamış seçim kaybolmaz, uygulanmaz).
    const panel = oku("src/components/arayuz/acilir-panel.tsx");
    expect(panel).toContain("hidden={!acik}");
    expect(panel).toContain("Geri al");
  });
});

describe("liste tercihleri: kayıt, geri yükleme, adres önceliği", () => {
  it("adreste izlenen parametre varsa adres önceliklidir ve kaydedilir (boş değerler varsayılan sayılır)", () => {
    const kayitli = { grup: "tum", sira: "ad", etiket: "parti-1" };
    const k = tercihKarari("grup=ilgi&boyut=100&durum=&q=kafe&sayfa=3", KAYIT_TERCIH_ALANLARI, kayitli);
    expect(k).toEqual({ tur: "kaydet", tercih: { grup: "ilgi", boyut: "100" } });
  });

  it("adreste yoksa kayıtlı tercih adrese yazılır; diğer parametreler korunur, sayfa numarası atılır", () => {
    const k = tercihKarari("secili=abc&sayfa=4", KAYIT_TERCIH_ALANLARI, { grup: "tum", sira: "ad", boyut: "200", etiket: "parti-1" });
    expect(k.tur).toBe("uygula");
    const p = new URLSearchParams(k.tur === "uygula" ? k.arama : "");
    expect(Object.fromEntries(p)).toEqual({ secili: "abc", grup: "tum", sira: "ad", boyut: "200", etiket: "parti-1" });
    expect(p.has("sayfa")).toBe(false);
    // Kayıtlı tercih de yoksa varsayılanlar.
    expect(tercihKarari("", KAYIT_TERCIH_ALANLARI, null)).toEqual({ tur: "yok" });
  });

  it("kaydet → oku gidiş-dönüşü; yabancı / uzun / metin olmayan değerler alınmaz", () => {
    const depo = bellekDeposu();
    const a = tercihAnahtari("kayitlar", "t1", "u1");
    expect(tercihYaz(depo, a, { grup: "tum", sira: "ad" })).toBe(true);
    expect(tercihOku(depo, a, KAYIT_TERCIH_ALANLARI)).toEqual({ grup: "tum", sira: "ad" });
    depo.setItem(a, JSON.stringify({ grup: "tum", sayfa: "9", kotu: "x", etiket: 5, durum: "y".repeat(500) }));
    expect(tercihOku(depo, a, KAYIT_TERCIH_ALANLARI)).toEqual({ grup: "tum" });
  });

  it("localStorage erişilemezse ya da değer bozuksa varsayılanlar (hata fırlatılmaz)", () => {
    const a = tercihAnahtari("kayitlar", "t1", "u1");
    expect(tercihOku(bozukDepo, a, KAYIT_TERCIH_ALANLARI)).toBeNull();
    expect(tercihYaz(bozukDepo, a, { grup: "tum" })).toBe(false);
    expect(tercihOku(null, a, KAYIT_TERCIH_ALANLARI)).toBeNull();
    expect(tercihYaz(null, a, { grup: "tum" })).toBe(false);
    const depo = bellekDeposu();
    for (const ham of ["{bozuk", "[1,2]", "null", '"metin"']) {
      depo.setItem(a, ham);
      expect(tercihOku(depo, a, KAYIT_TERCIH_ALANLARI), ham).toBeNull();
    }
    // Okunamayan tercih = kayıtlı tercih yok: adres boşsa varsayılan liste.
    expect(tercihKarari("", KAYIT_TERCIH_ALANLARI, tercihOku(bozukDepo, a, KAYIT_TERCIH_ALANLARI))).toEqual({ tur: "yok" });
  });

  it("farklı çalışma alanı ve kullanıcının tercihleri karışmaz", () => {
    const depo = bellekDeposu();
    tercihYaz(depo, tercihAnahtari("kayitlar", "alanA", "u1"), { etiket: "a-etiketi" });
    tercihYaz(depo, tercihAnahtari("kayitlar", "alanB", "u1"), { etiket: "b-etiketi" });
    expect(tercihOku(depo, tercihAnahtari("kayitlar", "alanA", "u1"), KAYIT_TERCIH_ALANLARI)).toEqual({ etiket: "a-etiketi" });
    expect(tercihOku(depo, tercihAnahtari("kayitlar", "alanB", "u1"), KAYIT_TERCIH_ALANLARI)).toEqual({ etiket: "b-etiketi" });
    expect(tercihOku(depo, tercihAnahtari("kayitlar", "alanA", "u2"), KAYIT_TERCIH_ALANLARI)).toBeNull();
    expect(tercihOku(depo, tercihAnahtari("kampanyalar", "alanA", "u1"), KAMPANYA_TERCIH_ALANLARI)).toBeNull();
    expect(new Set(["kayitlar", "kampanyalar", "gelen-kutusu"].map((l) => tercihAnahtari(l as "kayitlar", "t", "u"))).size).toBe(3);
  });

  it("Kayıtlar: süzgeç aktifse okunur şerit metni; sayfa izlenen alanlarda yok", () => {
    const f = kayitFiltresiCoz(sozluk({ grup: "tum", etiket: "parti-1", durum: "yeni", ad: "bos", sayfa: "2" }), "ilgi");
    const etiketler = etkinSuzgecEtiketleri(f);
    expect(etiketler).toContain("Etiket = parti-1");
    expect(etiketler).toHaveLength(3);
    expect(etkinSuzgecEtiketleri(kayitFiltresiCoz(() => undefined, "ilgi"))).toEqual([]);
    expect(KAYIT_TERCIH_ALANLARI).not.toContain("sayfa");
    const sayfa = oku("src/app/(app)/kayitlar/page.tsx");
    expect(sayfa).toContain("Filtre aktif:");
    expect(sayfa).toContain("<ListeTercihi");
  });

  it("Kampanyalar: sekme bağlantıları ?sekme= taşır (parametresiz adres = kayıtlı sekme)", () => {
    const liste = oku("src/app/(app)/kampanyalar/page.tsx");
    expect(liste).toContain('href: "/kampanyalar?sekme=kampanyalar"');
    expect(liste).toContain('href: "/kampanyalar?sekme=whatsapp"');
    expect(tercihKarari("", KAMPANYA_TERCIH_ALANLARI, { sekme: "whatsapp" })).toEqual({ tur: "uygula", arama: "sekme=whatsapp" });
    expect(tercihKarari("sekme=kampanyalar", KAMPANYA_TERCIH_ALANLARI, { sekme: "whatsapp" })).toEqual({ tur: "kaydet", tercih: { sekme: "kampanyalar" } });
  });

  it("Gelen kutusu: tercih biçimi gidiş-dönüş; olmayan / tek numara ve bozuk değer varsayılana düşer", () => {
    const numaralar = ["n1", "n2"];
    const f = { numara: "n2", durum: "" as const, atanan: "ben" as const, q: "ali" };
    const t = gelenKutusuTercihi(f);
    expect(t).toEqual({ numara: "n2", durum: "tum", atanan: "ben" });
    expect(gelenKutusuFiltresiCoz((a) => t[a], numaralar)).toEqual({ ...f, q: "" });
    // Varsayılanın adresi de "tercihsiz" değildir (durum her zaman yazılır).
    expect(Object.keys(gelenKutusuTercihi(VARSAYILAN_GELEN_KUTUSU_FILTRESI)).some((a) => (GELEN_KUTUSU_TERCIH_ALANLARI as readonly string[]).includes(a))).toBe(true);
    expect(gelenKutusuFiltresiCoz(sozluk({ numara: "silinmis", durum: "x", atanan: "baskasi" }), numaralar)).toEqual(VARSAYILAN_GELEN_KUTUSU_FILTRESI);
    // Tek numarada sekme görünmez: kayıtlı numara listeyi gizlice daraltmaz.
    expect(gelenKutusuFiltresiCoz(sozluk({ numara: "n1" }), ["n1"]).numara).toBe("");
    // Başka çalışma alanından kalan tercih (numara bu alanda yok) uygulanmaz.
    const depo = bellekDeposu();
    tercihYaz(depo, tercihAnahtari("gelen-kutusu", "alanA", "u1"), { numara: "n1", durum: "kapali" });
    expect(tercihOku(depo, tercihAnahtari("gelen-kutusu", "alanB", "u1"), GELEN_KUTUSU_TERCIH_ALANLARI)).toBeNull();
    const a = tercihOku(depo, tercihAnahtari("gelen-kutusu", "alanA", "u1"), GELEN_KUTUSU_TERCIH_ALANLARI)!;
    expect(gelenKutusuFiltresiCoz((x) => a[x], ["m1", "m2"])).toEqual({ ...VARSAYILAN_GELEN_KUTUSU_FILTRESI, durum: "kapali" });
  });
});
