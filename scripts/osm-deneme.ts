// OpenStreetMap kapsam ölçümü (deneme; uygulamaya entegre DEĞİLDİR).
// Bir ilin sınırı içindeki işletmeleri sektör bazında Overpass API'den TEK sorguyla çeker; ham sonucu ve ölçüm
// raporunu data/osm/ altına yazar. Rapora telefon ve e-posta değerleri yazılmaz; yalnızca sayılar ve oranlar.
// Kategoriler: scripts/osm-kategoriler.ts
//
// Kullanım:
//   npm run osm:deneme -- --il Bursa --tum                 tüm kategoriler
//   npm run osm:deneme -- --il Bursa --kategori eczane     tek kategori
//   ... --yerel                                            Overpass'e gitmeden son ham veriden rapor üretir
//
// Overpass kuralları: çalıştırma başına tek sorgu; hata olursa 60 sn bekleyip en fazla bir kez tekrar (en fazla 2
// istek). ASCII User-Agent, sunucu tarafı zaman aşımı.
// Veri © OpenStreetMap katkıcıları, ODbL 1.0.
import "./ortam";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { OSM_KATEGORILERI, type OsmKategori } from "./osm-kategoriler";

const OVERPASS_URL = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
// HTTP başlıkları yalnızca ASCII taşıyabilir.
const USER_AGENT =
  "HaritaCRM-osm-deneme/0.2 (one-off coverage measurement; " +
  (process.env.OSM_ILETISIM ? `contact: ${process.env.OSM_ILETISIM}` : "Harita CRM development") +
  ")";
const SORGU_ZAMAN_ASIMI_SN = 600;
const TEKRAR_BEKLEME_MS = 60_000;
const KLASOR = path.join(process.cwd(), "data", "osm");
const ANA_ILCE_SAYISI = 3;

// --- Komut satırı ---

function argumanlar() {
  const a = process.argv.slice(2);
  const deger = (ad: string) => {
    const i = a.indexOf(ad);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const il = deger("--il") ?? "Bursa";
  const kategoriAnahtari = deger("--kategori");
  const tum = a.includes("--tum");
  if (tum === !!kategoriAnahtari) {
    console.error(
      "Kullanım: npm run osm:deneme -- --il <İl> (--tum | --kategori <anahtar>) [--yerel]\n" +
        "Kategoriler: " +
        OSM_KATEGORILERI.map((k) => k.anahtar).join(", "),
    );
    process.exit(1);
  }
  let kategoriler: readonly OsmKategori[] = OSM_KATEGORILERI;
  if (kategoriAnahtari) {
    const k = OSM_KATEGORILERI.find((x) => x.anahtar === kategoriAnahtari);
    if (!k) {
      console.error(`Bilinmeyen kategori: ${kategoriAnahtari}. Kategoriler: ${OSM_KATEGORILERI.map((x) => x.anahtar).join(", ")}`);
      process.exit(1);
    }
    kategoriler = [k];
  }
  const ek = tum ? "tum" : kategoriAnahtari!;
  const ilDosya = il.toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşü]+/g, "-");
  return {
    il,
    kategoriler,
    yerel: a.includes("--yerel"),
    hamDosya: path.join(KLASOR, `${ilDosya}-${ek}-ham.json`),
    raporDosya: path.join(KLASOR, tum ? "sektor-raporu.md" : `sektor-raporu-${ek}.md`),
  };
}

// --- Sorgu ---

const regexKacir = (s: string) => s.replace(/[\\"]/g, "\\$&");

/**
 * Tek sorgu. Kategorilerin etiketleri anahtar başına tek bir regex filtresinde birleştirilir
 * (ör. amenity~"^(pharmacy|dentist|…)$"); öğeler kategorilere istemcide etiketten ayrılır.
 * Ardından her ilçe (admin_level=6) için ilçe öğesi (out tags) ve o ilçe alanına düşen öğelerin kimlikleri
 * (out ids) gelir: ilçe geometrisi indirilmeden konum → ilçe eşlemesi yapılır.
 */
function sorguOlustur(il: string, kategoriler: readonly OsmKategori[]): string {
  const anahtarDegerleri = new Map<string, Set<string>>();
  for (const k of kategoriler) {
    for (const e of k.etiketler) {
      const [anahtar, deger] = e.split("=");
      if (!anahtarDegerleri.has(anahtar)) anahtarDegerleri.set(anahtar, new Set());
      anahtarDegerleri.get(anahtar)!.add(deger);
    }
  }
  const filtreler = [...anahtarDegerleri].map(
    ([anahtar, degerler]) => `  nwr["${anahtar}"~"^(${[...degerler].join("|")})$"](area.il);`,
  );
  for (const k of kategoriler) {
    if (!k.adDeseni) continue;
    for (const ust of ["office", "shop"]) filtreler.push(`  nwr["${ust}"]["name"~"${regexKacir(k.adDeseni)}",i](area.il);`);
  }
  return `[out:json][timeout:${SORGU_ZAMAN_ASIMI_SN}][maxsize:536870912];
area["boundary"="administrative"]["admin_level"="4"]["name"="${regexKacir(il)}"]->.il;
(
${filtreler.join("\n")}
)->.tum;
make ayrac bolum="isletme";
out;
.tum out center tags;
make ayrac bolum="ilce";
out;
rel["boundary"="administrative"]["admin_level"="6"](area.il)->.ilceler;
foreach.ilceler->.ilce(
  .ilce out tags;
  .ilce map_to_area->.ilceAlani;
  nwr.tum(area.ilceAlani);
  out ids;
);`;
}

type OsmTur = "node" | "way" | "relation";
interface OsmOge {
  type: OsmTur | "ayrac";
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
}
interface OverpassYaniti {
  osm3s?: { timestamp_osm_base?: string };
  remark?: string;
  elements: OsmOge[];
}

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpassSorgula(sorgu: string): Promise<OverpassYaniti> {
  for (let deneme = 1; deneme <= 2; deneme++) {
    try {
      const yanit = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: sorgu }),
        signal: AbortSignal.timeout((SORGU_ZAMAN_ASIMI_SN + 60) * 1000),
      });
      if (!yanit.ok) throw new Error(`Overpass HTTP ${yanit.status}`);
      const govde = (await yanit.json()) as OverpassYaniti;
      // Sunucu zaman aşımı/bellek hatasını 200 + "remark" ile bildirir; eksik sonuçla ölçüm yapılmaz.
      if (govde.remark && /error|timed out|runtime/i.test(govde.remark)) {
        throw new Error(`Overpass sorgu hatası: ${govde.remark}`);
      }
      return govde;
    } catch (hata) {
      if (deneme === 2) throw hata;
      console.warn(`${(hata as Error).message}. ${TEKRAR_BEKLEME_MS / 1000} sn sonra bir kez tekrar denenecek.`);
      await bekle(TEKRAR_BEKLEME_MS);
    }
  }
  throw new Error("ulaşılamaz");
}

// --- Ölçüm ---

interface Isletme {
  anahtar: string; // "node/123"
  etiketler: Record<string, string>;
}

function ayristir(yanit: OverpassYaniti) {
  const isletmeler = new Map<string, Isletme>();
  const ilceUyelik = new Map<string, string>(); // işletme anahtarı → ilçe adı (ilk eşleşen)
  const ilceAdlari: string[] = [];
  let bolum: string | null = null;
  let ilce: string | null = null;
  for (const o of yanit.elements) {
    if (o.type === "ayrac") {
      bolum = o.tags?.bolum ?? null;
      continue;
    }
    const anahtar = `${o.type}/${o.id}`;
    if (bolum === "isletme") {
      isletmeler.set(anahtar, { anahtar, etiketler: o.tags ?? {} });
    } else if (bolum === "ilce") {
      if (o.type === "relation" && o.tags?.admin_level === "6") {
        ilce = o.tags.name ?? `relation/${o.id}`;
        ilceAdlari.push(ilce);
      } else if (ilce && !ilceUyelik.has(anahtar)) {
        ilceUyelik.set(anahtar, ilce);
      }
    }
  }
  return { isletmeler: [...isletmeler.values()], ilceUyelik, ilceAdlari };
}

function kategoriyeUyarMi(k: OsmKategori, e: Record<string, string>): boolean {
  if (k.etiketler.some((t) => {
    const [anahtar, deger] = t.split("=");
    return e[anahtar] === deger;
  })) {
    return true;
  }
  return !!k.adDeseni && !!(e.office || e.shop) && !!e.name && new RegExp(k.adDeseni, "iu").test(e.name);
}

const ilk = (e: Record<string, string>, ...anahtarlar: string[]) =>
  anahtarlar.map((a) => e[a]).find((d) => d !== undefined && d.trim() !== "");

const TELEFON_ALANLARI = ["phone", "contact:phone", "mobile", "contact:mobile"];
const telefonVar = (e: Record<string, string>) => !!ilk(e, ...TELEFON_ALANLARI);
const epostaVar = (e: Record<string, string>) => !!ilk(e, "email", "contact:email");
const webVar = (e: Record<string, string>) => !!ilk(e, "website", "contact:website", "url");

/** Etiketteki numaralar (";" ile birden fazla olabilir) arasında Türkiye cep numarası (5XX XXX XX XX) var mı. */
function cepVar(e: Record<string, string>): boolean {
  const degerler = TELEFON_ALANLARI.flatMap((a) => (e[a] ?? "").split(/[;,/]/));
  return degerler.some((d) => {
    let r = d.replace(/\D/g, "");
    if (r.startsWith("0090")) r = r.slice(4);
    else if (r.startsWith("90") && r.length === 12) r = r.slice(2);
    else if (r.startsWith("0") && r.length === 11) r = r.slice(1);
    return r.length === 10 && r.startsWith("5");
  });
}

interface KategoriSonucu {
  kategori: OsmKategori;
  kayit: number;
  ad: number;
  telefon: number;
  cep: number;
  web: number;
  eposta: number;
  ulasilabilir: number;
  ilceler: Array<[string, number]>;
}

const yuzde = (n: number, t: number) => (t === 0 ? "-" : `%${Math.round((100 * n) / t)}`);

function olc(yanit: OverpassYaniti, kategoriler: readonly OsmKategori[]) {
  const { isletmeler, ilceUyelik, ilceAdlari } = ayristir(yanit);
  const ilceAdi = (i: Isletme) => ilceUyelik.get(i.anahtar) ?? i.etiketler["addr:district"] ?? "(belirsiz)";
  const sonuclar: KategoriSonucu[] = kategoriler.map((kategori) => {
    const liste = isletmeler.filter((i) => kategoriyeUyarMi(kategori, i.etiketler));
    const say = (f: (e: Record<string, string>) => boolean) => liste.filter((i) => f(i.etiketler)).length;
    const ilceler = new Map<string, number>();
    for (const i of liste) ilceler.set(ilceAdi(i), (ilceler.get(ilceAdi(i)) ?? 0) + 1);
    return {
      kategori,
      kayit: liste.length,
      ad: say((e) => !!ilk(e, "name")),
      telefon: say(telefonVar),
      cep: say(cepVar),
      web: say(webVar),
      eposta: say(epostaVar),
      ulasilabilir: say((e) => telefonVar(e) || epostaVar(e)),
      ilceler: [...ilceler].sort((a, b) => b[1] - a[1]).slice(0, ANA_ILCE_SAYISI),
    };
  });
  sonuclar.sort((a, b) => b.ulasilabilir - a.ulasilabilir || b.kayit - a.kayit);
  const kategorisiz = isletmeler.filter((i) => !kategoriler.some((k) => kategoriyeUyarMi(k, i.etiketler))).length;
  return { sonuclar, toplamOge: isletmeler.length, kategorisiz, ilceSayisi: ilceAdlari.length };
}

function raporUret(il: string, yanit: OverpassYaniti, kategoriler: readonly OsmKategori[]): string {
  const { sonuclar, toplamOge, kategorisiz, ilceSayisi } = olc(yanit, kategoriler);
  const s: string[] = [];
  s.push(`# OSM sektör kapsamı — ${il}`);
  s.push("");
  s.push(`- OSM veri zamanı: ${yanit.osm3s?.timestamp_osm_base ?? "bilinmiyor"}`);
  s.push(`- Rapor zamanı: ${new Date().toISOString()}`);
  s.push(`- Kaynak: Overpass API (${new URL(OVERPASS_URL).host}), tek sorgu; ${kategoriler.length} kategori`);
  s.push(`- Farklı OSM öğesi: ${toplamOge} (ilçe sınırı: ${ilceSayisi})`);
  if (kategorisiz > 0) s.push(`- Hiçbir kategoriye düşmeyen öğe: ${kategorisiz}`);
  s.push("- Veri © OpenStreetMap katkıcıları, ODbL 1.0");
  s.push("");
  s.push(
    "Ulaşılabilir: telefonu (phone / contact:phone / mobile / contact:mobile) veya e-postası olan kayıt. " +
      "Cep: 5 ile başlayan 10 haneli numara. Bir öğe birden fazla kategoriye uyuyorsa her birinde sayılır. " +
      "Tablo ulaşılabilir kayıt sayısına göre sıralıdır.",
  );
  s.push("");
  s.push("| Kategori | Kayıt | Ulaşılabilir | Ad | Telefon | Cep | Web | E-posta | En çok kayıt olan ilçeler |");
  s.push("|---|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const r of sonuclar) {
    s.push(
      `| ${r.kategori.ad} | ${r.kayit} | ${r.ulasilabilir} | ${yuzde(r.ad, r.kayit)} | ${yuzde(r.telefon, r.kayit)} | ` +
        `${yuzde(r.cep, r.kayit)} | ${yuzde(r.web, r.kayit)} | ${yuzde(r.eposta, r.kayit)} | ` +
        `${r.ilceler.map(([a, n]) => `${a} ${n}`).join(", ") || "-"} |`,
    );
  }
  const t = sonuclar.reduce(
    (a, r) => ({ kayit: a.kayit + r.kayit, ulasilabilir: a.ulasilabilir + r.ulasilabilir, telefon: a.telefon + r.telefon, cep: a.cep + r.cep }),
    { kayit: 0, ulasilabilir: 0, telefon: 0, cep: 0 },
  );
  if (sonuclar.length > 1) {
    s.push(
      `| **Toplam (kategori bazında)** | ${t.kayit} | ${t.ulasilabilir} | | ${yuzde(t.telefon, t.kayit)} | ` +
        `${yuzde(t.cep, t.kayit)} | | | |`,
    );
  }
  s.push("");
  return s.join("\n");
}

async function main() {
  const { il, kategoriler, yerel, hamDosya, raporDosya } = argumanlar();
  mkdirSync(KLASOR, { recursive: true });
  let yanit: OverpassYaniti;
  if (yerel) {
    if (!existsSync(hamDosya)) throw new Error(`${path.relative(process.cwd(), hamDosya)} yok; önce --yerel olmadan çalıştırın.`);
    yanit = JSON.parse(readFileSync(hamDosya, "utf8")) as OverpassYaniti;
  } else {
    console.log(
      `Overpass sorgusu gönderiliyor (${new URL(OVERPASS_URL).host}, ${il}, ${kategoriler.length} kategori, ` +
        `zaman aşımı ${SORGU_ZAMAN_ASIMI_SN} sn)…`,
    );
    const baslangic = Date.now();
    yanit = await overpassSorgula(sorguOlustur(il, kategoriler));
    console.log(`Yanıt alındı: ${yanit.elements.length} öğe, ${((Date.now() - baslangic) / 1000).toFixed(1)} sn.`);
    writeFileSync(hamDosya, JSON.stringify(yanit));
    console.log(`Ham sonuç: ${path.relative(process.cwd(), hamDosya)}`);
  }
  const rapor = raporUret(il, yanit, kategoriler);
  writeFileSync(raporDosya, rapor + "\n");
  console.log();
  console.log(rapor);
  console.log(`Rapor: ${path.relative(process.cwd(), raporDosya)}`);
}

main().catch((hata: unknown) => {
  console.error((hata as Error).message);
  process.exit(1);
});
