// Migration yedeklerinin saklama kuralı (Alınan kararlar): son 10 yedek ve son 30 gün içindekiler kalır, diğerleri
// db:migrate sonunda ve işçinin günlük bakımında silinir. Başka veritabanlarının yedeklerine dokunulmaz.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GUNLUK_BAKIM_MS, gunlukBakim } from "@/server/servisler/isci";
import { eskiYedekleriSil } from "@/server/yedek-saklama";

const GUN = 24 * 3600 * 1000;
const SIMDI = new Date("2026-10-31T12:00:00.000Z");
const damga = (t: Date) => t.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(".", "").replace("Z", "");

let klasor: string;
let dosya: string;
let yedekler: string;

/** Verilen gün önceki zaman damgasıyla sahte yedek dosyası oluşturur; dosya adını döndürür. */
function yedekYap(gunOnce: number, ad = "app", ekMs = 0) {
  const isim = `${ad}-${damga(new Date(SIMDI.getTime() - gunOnce * GUN + ekMs))}.db`;
  fs.writeFileSync(path.join(yedekler, isim), "yedek");
  return isim;
}
const kalanlar = () => fs.readdirSync(yedekler).sort();

beforeEach(() => {
  klasor = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-yedek-"));
  dosya = path.join(klasor, "app.db");
  yedekler = path.join(klasor, "yedek");
  fs.mkdirSync(yedekler);
});
afterEach(() => fs.rmSync(klasor, { recursive: true, force: true }));

describe("eskiYedekleriSil", () => {
  it("30 günden eski yedeklerden yalnızca en son 10 tanesi kalır", () => {
    const eski = Array.from({ length: 15 }, (_, i) => yedekYap(40 + i)); // 40..54 gün önce; eski[0] en yeni
    const silinen = eskiYedekleriSil(dosya, SIMDI);
    expect(silinen.map((s) => path.basename(s)).sort()).toEqual(eski.slice(10).sort());
    expect(kalanlar()).toEqual(eski.slice(0, 10).sort());
  });

  it("son 30 gün içindekilerin hepsi kalır (10'dan fazla olsa da)", () => {
    const yeni = Array.from({ length: 14 }, (_, i) => yedekYap(i * 2)); // 0..26 gün önce
    const eski = [yedekYap(31), yedekYap(45)];
    const silinen = eskiYedekleriSil(dosya, SIMDI);
    expect(silinen.map((s) => path.basename(s)).sort()).toEqual(eski.sort());
    expect(kalanlar()).toEqual(yeni.sort());
  });

  it("karışık: 3 yeni + 12 eski → 3 yeni ve en yeni 7 eski kalır", () => {
    const yeni = [yedekYap(1), yedekYap(5), yedekYap(29)];
    const eski = Array.from({ length: 12 }, (_, i) => yedekYap(60 + i));
    eskiYedekleriSil(dosya, SIMDI);
    expect(kalanlar()).toEqual([...yeni, ...eski.slice(0, 7)].sort());
  });

  it("10 ya da daha az yedek varsa ne kadar eski olursa olsun hiçbiri silinmez", () => {
    const hepsi = Array.from({ length: 10 }, (_, i) => yedekYap(400 + i));
    expect(eskiYedekleriSil(dosya, SIMDI)).toEqual([]);
    expect(kalanlar()).toEqual(hepsi.sort());
  });

  it("başka veritabanının yedeklerine ve klasördeki başka dosyalara dokunmaz", () => {
    const app = Array.from({ length: 12 }, (_, i) => yedekYap(100 + i));
    const demo = Array.from({ length: 12 }, (_, i) => yedekYap(100 + i, "demo"));
    fs.writeFileSync(path.join(yedekler, "app-elle-alinan.db"), "x");
    fs.writeFileSync(path.join(yedekler, "notlar.txt"), "x");
    eskiYedekleriSil(dosya, SIMDI);
    expect(kalanlar()).toEqual([...app.slice(0, 10), ...demo, "app-elle-alinan.db", "notlar.txt"].sort());
  });

  it("yedek klasörü yoksa ya da veritabanı bellek içiyse bir şey yapmaz", () => {
    fs.rmSync(yedekler, { recursive: true });
    expect(eskiYedekleriSil(dosya, SIMDI)).toEqual([]);
    expect(eskiYedekleriSil(":memory:", SIMDI)).toEqual([]);
  });
});

describe("işçinin günlük bakımı", () => {
  it("ilk turda ve sonra günde bir kez eski yedekleri siler", () => {
    Array.from({ length: 12 }, (_, i) => yedekYap(40 + i));
    const ilk = gunlukBakim(null, dosya, SIMDI);
    expect(ilk).toEqual({ sonCalismaMs: SIMDI.getTime(), silinenYedek: 2 });

    // Bir gün dolmadan: çalışmaz.
    Array.from({ length: 3 }, (_, i) => yedekYap(60 + i));
    const erken = gunlukBakim(ilk.sonCalismaMs, dosya, new Date(SIMDI.getTime() + GUNLUK_BAKIM_MS - 1));
    expect(erken).toEqual({ sonCalismaMs: ilk.sonCalismaMs, silinenYedek: 0 });
    expect(kalanlar()).toHaveLength(13);

    // Bir gün sonra: çalışır.
    const sonra = new Date(SIMDI.getTime() + GUNLUK_BAKIM_MS);
    expect(gunlukBakim(ilk.sonCalismaMs, dosya, sonra)).toEqual({ sonCalismaMs: sonra.getTime(), silinenYedek: 3 });
    expect(kalanlar()).toHaveLength(10);
  });
});

describe("npm run db:migrate", () => {
  it("yedeği alır, migration'ları uygular ve sonunda saklama süresi dolan yedekleri siler", () => {
    new Database(dosya).close(); // mevcut (boş) veritabanı: yedek alınır
    const eski = Array.from({ length: 12 }, (_, i) => yedekYap(400 + i));
    const demo = yedekYap(400, "demo");
    const cikti = execFileSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_PATH: dosya },
      encoding: "utf8",
    });
    expect(cikti).toContain("Yedek alındı");
    expect(cikti).toContain("3 eski yedek silindi");
    const kalan = kalanlar();
    // Yeni yedek + en yeni 9 eski yedek (toplam 10) + dokunulmayan demo yedeği.
    expect(kalan).toHaveLength(11);
    expect(kalan).toContain(demo);
    expect(kalan.filter((a) => eski.includes(a))).toEqual(eski.slice(0, 9).sort());
  }, 60_000);
});
