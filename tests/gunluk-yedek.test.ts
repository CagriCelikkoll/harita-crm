// Günlük yedek (npm run yedek) ve geri yükleme (npm run yedek:geri-yukle): çevrimiçi yedek WAL'daki işlemleri de
// içerir, bütünlüğü denetlenmeyen yedek bırakılmaz, 14 gün saklanır (en yeni her zaman kalır); geri yükleme önce
// mevcut veritabanının yedeğini alır, eski WAL'ı siler, işçi çalışıyorsa ya da yedek bozuksa hiçbir şeyi değiştirmez.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { veritabaniAc } from "@/server/db";
import { gunlukYedekAl, veritabaniDosyasiniDenetle, yedektenGeriYukle, YedekHatasi } from "@/server/db/gunluk-yedek";
import { migrasyonlariUygula } from "@/server/db/migrasyon";
import { eskiGunlukYedekleriSil, gunlukYedekKlasoru, gunlukYedekleri } from "@/server/yedek-saklama";

const GUN = 24 * 3600 * 1000;
const SIMDI = new Date("2026-11-15T00:30:00.000Z");
const damga = (t: Date) => t.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(".", "").replace("Z", "");
const DRIZZLE = path.resolve(__dirname, "../drizzle");
const windows = process.platform === "win32";

let klasor: string;
let dbYolu: string;
let yedekler: string;
const acik: Database.Database[] = [];

/** Migration'ları uygulanmış, açık (WAL) bir uygulama veritabanı; bağlantı test sonunda kapanır. */
function uygulamaVeritabani(dosya = dbYolu) {
  const v = veritabaniAc(dosya);
  migrasyonlariUygula(v, DRIZZLE);
  acik.push(v.$client);
  return v.$client;
}
const kiraciEkle = (s: Database.Database, ad: string) =>
  s.prepare("insert into tenants (id, ad, slug) values (?, ?, ?)").run(ad, ad, ad);
const kiracilar = (dosya: string) => {
  const v = new Database(dosya, { readonly: true });
  try {
    return (v.prepare("select id from tenants order by id").all() as { id: string }[]).map((r) => r.id);
  } finally {
    v.close();
  }
};
const kapat = () => {
  while (acik.length) acik.pop()!.close();
};

beforeEach(() => {
  klasor = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-gunluk-yedek-"));
  dbYolu = path.join(klasor, "app.db");
  yedekler = path.join(klasor, "yedekler");
});
afterEach(() => {
  kapat();
  fs.rmSync(klasor, { recursive: true, force: true });
});

describe("gunlukYedekAl", () => {
  it("WAL'da bekleyen işlemler dahil tutarlı .db.gz yedek; geçici dosya kalmaz", async () => {
    const s = uygulamaVeritabani();
    s.pragma("wal_autocheckpoint = 0"); // işlemler ana dosyaya yazılmadan WAL'da kalsın
    kiraciEkle(s, "kiraci-a");
    expect(fs.statSync(`${dbYolu}-wal`).size).toBeGreaterThan(0);

    const sonuc = await gunlukYedekAl(dbYolu, yedekler, SIMDI);
    expect(path.basename(sonuc.yol)).toBe(`app-${damga(SIMDI)}.db.gz`);
    expect(fs.readdirSync(yedekler)).toEqual([path.basename(sonuc.yol)]);
    if (!windows) expect(fs.statSync(sonuc.yol).mode & 0o777).toBe(0o600);

    const acilan = path.join(klasor, "acilan.db");
    fs.writeFileSync(acilan, zlib.gunzipSync(fs.readFileSync(sonuc.yol)));
    expect(kiracilar(acilan)).toEqual(["kiraci-a"]);
    veritabaniDosyasiniDenetle(acilan);
  });

  it("veritabanı yoksa hata ve dosya oluşmaz", async () => {
    await expect(gunlukYedekAl(dbYolu, yedekler, SIMDI)).rejects.toBeInstanceOf(YedekHatasi);
    expect(fs.existsSync(dbYolu)).toBe(false);
  });

  it("bu uygulamanın veritabanı değilse (denetim geçmez) yedek bırakılmaz", async () => {
    const yabanci = new Database(dbYolu);
    yabanci.exec("create table baska (x)");
    yabanci.close();
    await expect(gunlukYedekAl(dbYolu, yedekler, SIMDI)).rejects.toThrow(/bu uygulamanın veritabanı değil/);
    expect(fs.readdirSync(yedekler)).toEqual([]);
  });

  it("klasör: YEDEK_KLASORU, yoksa veritabanı klasöründeki gunluk-yedek/", () => {
    expect(gunlukYedekKlasoru("/var/lib/harita-crm/app.db", " /var/backups/harita-crm ")).toBe(path.resolve("/var/backups/harita-crm"));
    expect(gunlukYedekKlasoru(dbYolu, undefined)).toBe(path.join(klasor, "gunluk-yedek"));
  });
});

describe("eskiGunlukYedekleriSil", () => {
  const yedekYap = (gunOnce: number, ad = "app") => {
    fs.mkdirSync(yedekler, { recursive: true });
    const isim = `${ad}-${damga(new Date(SIMDI.getTime() - gunOnce * GUN))}.db.gz`;
    fs.writeFileSync(path.join(yedekler, isim), "x");
    return isim;
  };

  it("14 günden eskiler silinir; başka veritabanının ve tanınmayan dosyalar kalır", () => {
    const kalan = [0, 1, 13, 14].map((g) => yedekYap(g));
    const giden = [15, 20, 40].map((g) => yedekYap(g));
    const baska = yedekYap(40, "demo");
    fs.writeFileSync(path.join(yedekler, "not.txt"), "x");
    const silinen = eskiGunlukYedekleriSil(yedekler, dbYolu, SIMDI).map((s) => path.basename(s));
    expect(silinen.sort()).toEqual(giden.sort());
    expect(fs.readdirSync(yedekler).sort()).toEqual([...kalan, baska, "not.txt"].sort());
  });

  it("hepsi eski olsa da en yeni yedek kalır", () => {
    const [enYeni, ...eskiler] = [30, 31, 32].map((g) => yedekYap(g));
    const silinen = eskiGunlukYedekleriSil(yedekler, dbYolu, SIMDI).map((s) => path.basename(s));
    expect(silinen.sort()).toEqual(eskiler.sort());
    expect(gunlukYedekleri(yedekler, dbYolu).map((y) => path.basename(y.yol))).toEqual([enYeni]);
  });

  it("gunlukYedekAl sonunda saklama kuralı uygulanır", async () => {
    uygulamaVeritabani();
    const eski = yedekYap(20);
    const s = await gunlukYedekAl(dbYolu, yedekler, SIMDI);
    expect(s.silinen.map((x) => path.basename(x))).toEqual([eski]);
  });
});

describe("yedektenGeriYukle", () => {
  it("yedeği yerine koyar; önce mevcut veritabanının (WAL'daki işlemler dahil) yedeği alınır", async () => {
    const s = uygulamaVeritabani();
    kiraciEkle(s, "yedekteki");
    const y = await gunlukYedekAl(dbYolu, yedekler, SIMDI);
    s.pragma("wal_autocheckpoint = 0");
    kiraciEkle(s, "sonradan-eklenen");
    // Kapanmadan kalmış servisin dosyaları: ana dosya + işlemleri taşıyan WAL.
    const kopya = path.join(klasor, "kopya.db");
    for (const ek of ["", "-wal", "-shm"]) fs.copyFileSync(dbYolu + ek, kopya + ek);
    kapat();

    const sonuc = await yedektenGeriYukle(y.yol, kopya, { simdi: new Date(SIMDI.getTime() + 1000) });
    expect(kiracilar(kopya)).toEqual(["yedekteki"]);
    expect(sonuc.oncekiYedek).not.toBeNull();
    expect(kiracilar(sonuc.oncekiYedek!)).toEqual(["sonradan-eklenen", "yedekteki"]);
    expect(sonuc.bozukTasinan).toBeNull();
    expect(fs.readdirSync(klasor).filter((a) => a.includes("geri-yukleme"))).toEqual([]);
  });

  it("sıkıştırılmamış .db yedeği de (migration yedeği) geri yüklenir", async () => {
    const s = uygulamaVeritabani();
    kiraciEkle(s, "migration-oncesi");
    const y = await gunlukYedekAl(dbYolu, yedekler, SIMDI);
    const duz = path.join(klasor, "duz.db");
    fs.writeFileSync(duz, zlib.gunzipSync(fs.readFileSync(y.yol)));
    kiraciEkle(s, "sonra");
    kapat();
    await yedektenGeriYukle(duz, dbYolu, { simdi: SIMDI });
    expect(kiracilar(dbYolu)).toEqual(["migration-oncesi"]);
  });

  it("bozuk ya da yabancı yedek: hata, veritabanı değişmez, geçici dosya kalmaz", async () => {
    const s = uygulamaVeritabani();
    kiraciEkle(s, "mevcut");
    kapat();
    const once = fs.readFileSync(dbYolu);
    const cop = path.join(klasor, "cop.db.gz");
    fs.writeFileSync(cop, zlib.gzipSync(Buffer.from("bu bir veritabanı değil")));
    await expect(yedektenGeriYukle(cop, dbYolu, { simdi: SIMDI })).rejects.toBeInstanceOf(YedekHatasi);
    const yariGz = path.join(klasor, "yari.db.gz");
    fs.writeFileSync(yariGz, Buffer.from([0x1f, 0x8b, 0x08, 0x00]));
    await expect(yedektenGeriYukle(yariGz, dbYolu, { simdi: SIMDI })).rejects.toBeInstanceOf(YedekHatasi);
    await expect(yedektenGeriYukle(path.join(klasor, "yok.db.gz"), dbYolu, { simdi: SIMDI })).rejects.toThrow(/bulunamadı/);
    expect(fs.readFileSync(dbYolu).equals(once)).toBe(true);
    expect(fs.readdirSync(klasor).filter((a) => a.includes("geri-yukleme"))).toEqual([]);
  });

  it("işçi kilidi süresi dolmamışsa (servis çalışıyor) durur ve hiçbir şeyi değiştirmez", async () => {
    const s = uygulamaVeritabani();
    kiraciEkle(s, "mevcut");
    const y = await gunlukYedekAl(dbYolu, yedekler, SIMDI);
    kiraciEkle(s, "yeni");
    s.prepare("insert into isci_kilitleri (ad, sahip, bitis) values ('gonderim', 'isci-1', ?)").run(SIMDI.getTime() + 60_000);
    kapat();
    await expect(yedektenGeriYukle(y.yol, dbYolu, { simdi: SIMDI })).rejects.toThrow(/işçisi çalışıyor/);
    expect(kiracilar(dbYolu)).toEqual(["mevcut", "yeni"]);
  });

  it("mevcut veritabanı bozuksa --zorla olmadan durur; --zorla ile bozuk dosya kenara taşınır", async () => {
    const s = uygulamaVeritabani();
    kiraciEkle(s, "yedekteki");
    const y = await gunlukYedekAl(dbYolu, yedekler, SIMDI);
    kapat();
    fs.writeFileSync(dbYolu, "bozuk içerik");
    await expect(yedektenGeriYukle(y.yol, dbYolu, { simdi: SIMDI })).rejects.toThrow(/--zorla/);
    expect(fs.readFileSync(dbYolu, "utf8")).toBe("bozuk içerik");

    const sonuc = await yedektenGeriYukle(y.yol, dbYolu, { simdi: SIMDI, zorla: true });
    expect(kiracilar(dbYolu)).toEqual(["yedekteki"]);
    expect(fs.readFileSync(sonuc.bozukTasinan!, "utf8")).toBe("bozuk içerik");
  });
});
