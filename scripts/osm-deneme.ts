// OpenStreetMap kapsam ölçümü (deneme; uygulamaya entegre DEĞİLDİR).
// Bursa il sınırı içindeki emlak ofislerini Overpass API'den TEK sorguyla çeker, ham sonucu ve ölçüm raporunu
// data/osm/ altına yazar. Rapora telefon ve e-posta değerleri yazılmaz; yalnızca doluluk oranları ve örnek adlar.
// Kullanım: npm run osm:deneme            (ham veriyi yeniden indirmeden ölçmek için: npm run osm:deneme -- --yerel)
// Veri © OpenStreetMap katkıcıları, ODbL 1.0.
import "./ortam";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const OVERPASS_URL = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
// HTTP başlıkları yalnızca ASCII taşıyabilir.
const USER_AGENT =
  "HaritaCRM-osm-deneme/0.1 (one-off coverage measurement; " +
  (process.env.OSM_ILETISIM ? `contact: ${process.env.OSM_ILETISIM}` : "Harita CRM development") +
  ")";
const SORGU_ZAMAN_ASIMI_SN = 180;
const TEKRAR_BEKLEME_MS = 60_000;
const KLASOR = path.join(process.cwd(), "data", "osm");
const HAM_DOSYA = path.join(KLASOR, "bursa-emlak-ham.json");
const RAPOR_DOSYA = path.join(KLASOR, "rapor.md");

// Büyük/küçük harf: Overpass'in ",i" bayrağı yalnızca ASCII harfleri eşler; Türkçe İ/ı için ayrıca sınıf verilir.
const AD_DESENI = "emlak|gayr[iİIı]menkul|real estate";

// Tek sorgu, üç bölüm. Bölümler arasına "make ayrac" öğesi konur; çıktı sırası korunduğu için öğeler bölümlerine
// buradan ayrılır:
//   1. etiket: office=estate_agent veya shop=estate_agent (out center tags)
//   2. ad: adı desene uyan ama emlak etiketi OLMAYAN office=* / shop=* noktaları (out center tags)
//   3. ilçe: her ilçe (admin_level=6) için ilçe öğesi (out tags) ve ardından o ilçe alanına düşen 1. ve 2. bölüm
//      öğelerinin kimlikleri (out ids). Böylece ilçe geometrisi indirilmeden koordinat → ilçe eşlemesi yapılır.
const SORGU = `[out:json][timeout:${SORGU_ZAMAN_ASIMI_SN}];
area["boundary"="administrative"]["admin_level"="4"]["name"="Bursa"]->.il;
(
  nwr["office"="estate_agent"](area.il);
  nwr["shop"="estate_agent"](area.il);
)->.etiket;
(
  nwr["office"]["name"~"${AD_DESENI}",i](area.il);
  nwr["shop"]["name"~"${AD_DESENI}",i](area.il);
)->.adla;
(.adla; - .etiket;)->.yalnizAd;
(.etiket; .yalnizAd;)->.tum;
make ayrac bolum="etiket";
out;
.etiket out center tags;
make ayrac bolum="ad";
out;
.yalnizAd out center tags;
make ayrac bolum="ilce";
out;
rel["boundary"="administrative"]["admin_level"="6"](area.il)->.ilceler;
foreach.ilceler->.ilce(
  .ilce out tags;
  .ilce map_to_area->.ilceAlani;
  nwr.tum(area.ilceAlani);
  out ids;
);`;

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

async function overpassSorgula(): Promise<OverpassYaniti> {
  for (let deneme = 1; deneme <= 2; deneme++) {
    try {
      const yanit = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: SORGU }),
        signal: AbortSignal.timeout((SORGU_ZAMAN_ASIMI_SN + 30) * 1000),
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
  bolum: "etiket" | "ad";
  etiketler: Record<string, string>;
  konum: { lat: number; lon: number } | null;
}

const ANA_ILCELER = ["Nilüfer", "Osmangazi", "Yıldırım", "Mudanya", "Gemlik", "İnegöl"];

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
    if (bolum === "etiket" || bolum === "ad") {
      isletmeler.set(anahtar, {
        anahtar,
        bolum,
        etiketler: o.tags ?? {},
        konum: o.center ?? (o.lat !== undefined && o.lon !== undefined ? { lat: o.lat, lon: o.lon } : null),
      });
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

const ilk = (e: Record<string, string>, ...anahtarlar: string[]) =>
  anahtarlar.map((a) => e[a]).find((d) => d !== undefined && d.trim() !== "");

/** Etiketteki numaralar (";" ile birden fazla olabilir) arasında Türkiye cep numarası (5XX XXX XX XX) var mı. */
function cepVarMi(e: Record<string, string>): boolean {
  const degerler = ["phone", "contact:phone", "mobile", "contact:mobile"].flatMap((a) => (e[a] ?? "").split(/[;,]/));
  return degerler.some((d) => {
    let r = d.replace(/\D/g, "");
    if (r.startsWith("0090")) r = r.slice(4);
    else if (r.startsWith("90") && r.length === 12) r = r.slice(2);
    else if (r.startsWith("0") && r.length === 11) r = r.slice(1);
    return r.length === 10 && r.startsWith("5");
  });
}

/** İlçe adını karşılaştırma için sadeleştirir ("NİLÜFER", "Nilüfer İlçesi" → "nilüfer"). */
const ilceSadelestir = (s: string) =>
  s.toLocaleLowerCase("tr").replace(/\s+(ilçesi|merkez)$/u, "").trim();

const ALANLAR: Array<[string, (e: Record<string, string>) => boolean]> = [
  ["name", (e) => !!ilk(e, "name")],
  ["phone / contact:phone", (e) => !!ilk(e, "phone", "contact:phone")],
  ["mobile / contact:mobile", (e) => !!ilk(e, "mobile", "contact:mobile")],
  ["herhangi bir telefon", (e) => !!ilk(e, "phone", "contact:phone", "mobile", "contact:mobile")],
  ["website / contact:website", (e) => !!ilk(e, "website", "contact:website", "url")],
  ["email / contact:email", (e) => !!ilk(e, "email", "contact:email")],
  ["addr:street (sokak)", (e) => !!ilk(e, "addr:street")],
  ["addr:housenumber (kapı no)", (e) => !!ilk(e, "addr:housenumber")],
  ["mahalle (addr:neighbourhood/suburb/quarter)", (e) => !!ilk(e, "addr:neighbourhood", "addr:suburb", "addr:quarter")],
  ["ilçe (addr:district)", (e) => !!ilk(e, "addr:district")],
  ["addr:city", (e) => !!ilk(e, "addr:city")],
  ["addr:postcode", (e) => !!ilk(e, "addr:postcode")],
  ["opening_hours", (e) => !!ilk(e, "opening_hours")],
  ["sosyal medya (contact:facebook/instagram)", (e) => !!ilk(e, "contact:facebook", "contact:instagram", "facebook", "instagram")],
];

const yuzde = (n: number, t: number) => (t === 0 ? "-" : `%${((100 * n) / t).toFixed(1)}`);

function raporUret(yanit: OverpassYaniti): string {
  const { isletmeler, ilceUyelik, ilceAdlari } = ayristir(yanit);
  const etiketli = isletmeler.filter((i) => i.bolum === "etiket");
  const adla = isletmeler.filter((i) => i.bolum === "ad");
  const satirlar: string[] = [];
  const yaz = (s = "") => satirlar.push(s);

  yaz("# OSM kapsam ölçümü — Bursa emlak ofisleri");
  yaz();
  yaz(`- OSM veri zamanı: ${yanit.osm3s?.timestamp_osm_base ?? "bilinmiyor"}`);
  yaz(`- Rapor zamanı: ${new Date().toISOString()}`);
  yaz(`- Kaynak: Overpass API (${new URL(OVERPASS_URL).host}), tek sorgu`);
  yaz("- Veri © OpenStreetMap katkıcıları, ODbL 1.0");
  yaz();
  yaz("## Kayıt sayıları");
  yaz();
  yaz("| Grup | Toplam | node | way | relation |");
  yaz("|---|---|---|---|---|");
  for (const [ad, liste] of [
    ["Etiketle (office/shop=estate_agent)", etiketli],
    ["Yalnızca adla (emlak/gayrimenkul/real estate, başka office/shop etiketi)", adla],
    ["Toplam", isletmeler],
  ] as const) {
    const say = (t: string) => liste.filter((i) => i.anahtar.startsWith(t + "/")).length;
    yaz(`| ${ad} | ${liste.length} | ${say("node")} | ${say("way")} | ${say("relation")} |`);
  }
  yaz();
  const adlaEtiketler = new Map<string, number>();
  for (const i of adla) {
    const t = i.etiketler.office ? `office=${i.etiketler.office}` : `shop=${i.etiketler.shop}`;
    adlaEtiketler.set(t, (adlaEtiketler.get(t) ?? 0) + 1);
  }
  if (adlaEtiketler.size > 0) {
    yaz(
      "Adla bulunanların etiketleri: " +
        [...adlaEtiketler.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => `${t} (${n})`)
          .join(", "),
    );
    yaz();
  }

  yaz("## Alan doluluk oranları");
  yaz();
  yaz("| Alan | Etiketle | Adla | Toplam |");
  yaz("|---|---|---|---|");
  for (const [ad, kosul] of ALANLAR) {
    const n = (l: Isletme[]) => l.filter((i) => kosul(i.etiketler)).length;
    yaz(
      `| ${ad} | ${yuzde(n(etiketli), etiketli.length)} | ${yuzde(n(adla), adla.length)} | ` +
        `${yuzde(n(isletmeler), isletmeler.length)} (${n(isletmeler)}) |`,
    );
  }
  const cep = isletmeler.filter((i) => cepVarMi(i.etiketler)).length;
  const telefonlu = isletmeler.filter((i) => !!ilk(i.etiketler, "phone", "contact:phone", "mobile", "contact:mobile")).length;
  yaz();
  yaz(
    `Cep telefonu (5 ile başlayan 10 hane) olan: **${cep}** kayıt — tümünün ${yuzde(cep, isletmeler.length)}'i, ` +
      `telefonu olanların ${yuzde(cep, telefonlu)}'i.`,
  );
  yaz();

  yaz("## İlçelere göre dağılım");
  yaz();
  yaz(
    "İlçe önce `addr:district` etiketinden alınır; etiket yoksa ya da Bursa ilçesiyle eşleşmezse noktanın düştüğü " +
      "ilçe sınırından (admin_level=6) hesaplanır.",
  );
  yaz();
  const sade = new Map(ilceAdlari.map((a) => [ilceSadelestir(a), a]));
  const dagilim = new Map<string, number>();
  let etiketten = 0;
  let sinirdan = 0;
  for (const i of isletmeler) {
    const etiket = i.etiketler["addr:district"];
    let ilce = etiket ? sade.get(ilceSadelestir(etiket)) : undefined;
    if (ilce) etiketten++;
    else {
      ilce = ilceUyelik.get(i.anahtar);
      if (ilce) sinirdan++;
    }
    const k = ilce ?? "(belirlenemedi)";
    dagilim.set(k, (dagilim.get(k) ?? 0) + 1);
  }
  yaz("| İlçe | Kayıt | Oran |");
  yaz("|---|---|---|");
  for (const a of ANA_ILCELER) {
    const gercek = sade.get(ilceSadelestir(a)) ?? a;
    yaz(`| ${gercek} | ${dagilim.get(gercek) ?? 0} | ${yuzde(dagilim.get(gercek) ?? 0, isletmeler.length)} |`);
  }
  const anaSet = new Set(ANA_ILCELER.map((a) => sade.get(ilceSadelestir(a)) ?? a));
  const digerleri = [...dagilim.entries()].filter(([a]) => !anaSet.has(a) && a !== "(belirlenemedi)");
  const digerToplam = digerleri.reduce((t, [, n]) => t + n, 0);
  yaz(`| Diğer ilçeler | ${digerToplam} | ${yuzde(digerToplam, isletmeler.length)} |`);
  const belirsiz = dagilim.get("(belirlenemedi)") ?? 0;
  if (belirsiz > 0) yaz(`| (belirlenemedi) | ${belirsiz} | ${yuzde(belirsiz, isletmeler.length)} |`);
  yaz();
  if (digerleri.length > 0) {
    yaz(
      "Diğer ilçeler: " +
        digerleri
          .sort((a, b) => b[1] - a[1])
          .map(([a, n]) => `${a} ${n}`)
          .join(", "),
    );
    yaz();
  }
  yaz(
    `İlçe kaynağı: etiketten ${etiketten}, sınırdan ${sinirdan}. Sorgudaki ilçe sınırı sayısı: ${ilceAdlari.length}.`,
  );
  yaz();

  yaz("## Örnek işletme adları (10)");
  yaz();
  const adlar = isletmeler
    .map((i) => i.etiketler.name)
    .filter((a): a is string => !!a)
    .sort((a, b) => a.localeCompare(b, "tr"));
  // Alfabetik listeden eşit aralıklı örnek: tek bir harfe/zincire yığılmasın.
  const adim = Math.max(1, Math.floor(adlar.length / 10));
  for (let i = 0; i < adlar.length && i / adim < 10; i += adim) yaz(`- ${adlar[i]}`);
  yaz();
  return satirlar.join("\n");
}

async function main() {
  mkdirSync(KLASOR, { recursive: true });
  let yanit: OverpassYaniti;
  if (process.argv.includes("--yerel")) {
    if (!existsSync(HAM_DOSYA)) throw new Error(`${HAM_DOSYA} yok; önce --yerel olmadan çalıştırın.`);
    yanit = JSON.parse(readFileSync(HAM_DOSYA, "utf8")) as OverpassYaniti;
  } else {
    console.log(`Overpass sorgusu gönderiliyor (${new URL(OVERPASS_URL).host}, zaman aşımı ${SORGU_ZAMAN_ASIMI_SN} sn)…`);
    const baslangic = Date.now();
    yanit = await overpassSorgula();
    console.log(`Yanıt alındı: ${yanit.elements.length} öğe, ${((Date.now() - baslangic) / 1000).toFixed(1)} sn.`);
    writeFileSync(HAM_DOSYA, JSON.stringify(yanit));
    console.log(`Ham sonuç: ${path.relative(process.cwd(), HAM_DOSYA)}`);
  }
  const rapor = raporUret(yanit);
  writeFileSync(RAPOR_DOSYA, rapor + "\n");
  console.log();
  console.log(rapor);
  console.log(`\nRapor: ${path.relative(process.cwd(), RAPOR_DOSYA)}`);
}

main().catch((hata: unknown) => {
  console.error((hata as Error).message);
  process.exit(1);
});
