// Dayanıklılık ve girdi güvenliği: XLSX sıkıştırma bombası (ZIP merkez dizini + sınırlı açma), oturumsuz webhook ve
// içe aktarma rotalarında akış halinde sayaçlı gövde okuma (önce kimlik, sonra 413), migration (yedek, COMMIT öncesi
// yabancı anahtar denetimi), sorunlu satırlar CSV'sinde formül kaçışı, saatlik içe aktarma temizliği ve
// "Tekrar kullan" ile kopyalanan tarama merkezinin 30 günlük süreyi koruması.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db, veritabaniAc } = await import("@/server/db");
const { migrasyonlariUygula } = await import("@/server/db/migrasyon");
const { veritabaniYedekle } = await import("@/server/db/yedek");
const { iceAktarmaGetir } = await import("@/server/repo/ice-aktarmalar");
const { temizlikYap } = await import("@/server/repo/sistem/bakim");
const { taramaGetir, taramaOlustur } = await import("@/server/repo/taramalar");
const svc = await import("@/server/servisler/ice-aktarma");
const { saatlikBakim } = await import("@/server/servisler/isci");
const { saglayiciBilgisiKaydet } = await import("@/server/servisler/saglayici");
const wa = await import("@/server/servisler/whatsapp-api");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const waRotasi = await import("@/app/api/whatsapp/webhook/[kimlik]/route");
const smsRotasi = await import("@/app/api/webhook/sms/[anahtar]/route");
const yuklemeRotasi = await import("@/app/api/ice-aktarma/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const U = "https://crm.ornek.test";
const MB = 1024 * 1024;
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-dayaniklilik-"));
afterAll(() => fs.rmSync(gecici, { recursive: true, force: true }));

// --- ZIP oluşturucu (test için; yalnızca deflate) ---
type ZipGirdisi = { ad: string; veri: Buffer; beyanAcik?: number };
function zipYap(girdiler: ZipGirdisi[]): Uint8Array {
  const yereller: Buffer[] = [];
  const merkez: Buffer[] = [];
  let ofset = 0;
  for (const g of girdiler) {
    const ad = Buffer.from(g.ad);
    const sikisik = deflateRawSync(g.veri);
    const yerel = Buffer.alloc(30);
    yerel.writeUInt32LE(0x04034b50, 0);
    yerel.writeUInt16LE(20, 4);
    yerel.writeUInt16LE(8, 8); // deflate
    yerel.writeUInt32LE(sikisik.length, 18);
    yerel.writeUInt32LE(g.beyanAcik ?? g.veri.length, 22);
    yerel.writeUInt16LE(ad.length, 26);
    yereller.push(yerel, ad, sikisik);
    const m = Buffer.alloc(46);
    m.writeUInt32LE(0x02014b50, 0);
    m.writeUInt16LE(20, 4);
    m.writeUInt16LE(20, 6);
    m.writeUInt16LE(8, 10);
    m.writeUInt32LE(sikisik.length, 20);
    m.writeUInt32LE(g.beyanAcik ?? g.veri.length, 24);
    m.writeUInt16LE(ad.length, 28);
    m.writeUInt32LE(ofset, 42);
    merkez.push(m, ad);
    ofset += 30 + ad.length + sikisik.length;
  }
  const dizin = Buffer.concat(merkez);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(girdiler.length, 8);
  eocd.writeUInt16LE(girdiler.length, 10);
  eocd.writeUInt32LE(dizin.length, 12);
  eocd.writeUInt32LE(ofset, 16);
  return new Uint8Array(Buffer.concat([...yereller, dizin, eocd]));
}

describe("XLSX sıkıştırma bombası", () => {
  it("açıldığında 50 MB'ı aşan dosya ayrıştırılmadan reddedilir (5 MB sınırının altında olsa da)", async () => {
    const bomba = zipYap([{ ad: "xl/worksheets/sheet1.xml", veri: Buffer.alloc(60 * MB) }]);
    expect(bomba.byteLength).toBeLessThan(5 * MB);
    await expect(svc.dosyaAyristir("liste.xlsx", bomba)).rejects.toThrow(/açıldığında 50 MB'ı aşıyor/);
  });

  it("merkez dizin boyutu küçük gösterse de (yalan beyan) gerçek açılmış boyut sınırlanır", async () => {
    const yalanci = zipYap([{ ad: "xl/worksheets/sheet1.xml", veri: Buffer.alloc(60 * MB), beyanAcik: 100 }]);
    await expect(svc.dosyaAyristir("liste.xlsx", yalanci)).rejects.toThrow(/açıldığında 50 MB'ı aşıyor/);
  });

  it("çok sayıda iç dosya reddedilir", async () => {
    const cok = zipYap(Array.from({ length: 1001 }, (_, i) => ({ ad: `x/${i}.xml`, veri: Buffer.from("a") })));
    await expect(svc.dosyaAyristir("liste.xlsx", cok)).rejects.toThrow(/çok fazla iç dosya/);
  });
});

// --- Akış halinde gövde: okunan baytları sayan, sonsuz parça üreten gövde ---
function sonsuzGovde() {
  const sayac = { okunan: 0 };
  const parca = new Uint8Array(64 * 1024).fill(0x61);
  const akis = new ReadableStream<Uint8Array>({
    pull(denetleyici) {
      sayac.okunan += parca.byteLength;
      denetleyici.enqueue(parca);
    },
  });
  return { akis, sayac };
}
const akisIstegi = (url: string, akis: ReadableStream<Uint8Array>, basliklar: Record<string, string> = {}) =>
  new Request(url, { method: "POST", body: akis, headers: basliklar, duplex: "half" } as RequestInit & { duplex: "half" });

describe("oturumsuz webhook'lar: önce kimlik, sonra sınırlı akış okuma", () => {
  it("WhatsApp: bilinmeyen adreste gövde hiç okunmaz (404); bilinen adreste Content-Length'siz 1 MB üstü gövde 413", async () => {
    const yok = sonsuzGovde();
    const kimlikYok = "x".repeat(32);
    const y1 = await waRotasi.POST(akisIstegi(`${U}/api/whatsapp/webhook/${kimlikYok}`, yok.akis), { params: Promise.resolve({ kimlik: kimlikYok }) });
    expect(y1.status).toBe(404);
    expect(yok.sayac.okunan).toBeLessThanOrEqual(64 * 1024); // akışın ilk parçası en fazla (hiç okunmamalı)

    const { ctx } = kiraciOlustur("GovdeWa");
    await wa.whatsappBaglantisiKaydet(ctx, { wabaId: "200001", phoneNumberId: "620001", erisimAnahtari: "a", appSecret: "s" });
    const kimlik = baglantiGetir(ctx)!.webhookKimligi;
    const buyuk = sonsuzGovde();
    const y2 = await waRotasi.POST(akisIstegi(`${U}/api/whatsapp/webhook/${kimlik}`, buyuk.akis), { params: Promise.resolve({ kimlik }) });
    expect(y2.status).toBe(413);
    expect(buyuk.sayac.okunan).toBeLessThanOrEqual(MB + 2 * 64 * 1024);
  });

  it("SMS: bilinmeyen anahtarda gövde okunmaz (404); bilinen anahtarda 1 MB üstü akış 413", async () => {
    const yok = sonsuzGovde();
    const y1 = await smsRotasi.POST(akisIstegi(`${U}/api/webhook/sms/${"y".repeat(32)}`, yok.akis), {
      params: Promise.resolve({ anahtar: "y".repeat(32) }),
    });
    expect(y1.status).toBe(404);
    expect(yok.sayac.okunan).toBeLessThanOrEqual(64 * 1024);

    const { ctx } = kiraciOlustur("GovdeSms");
    const { webhookAnahtari } = await saglayiciBilgisiKaydet(ctx, "sms", { kullanici: "u", sifre: "p", baslik: "BASLIK" });
    const buyuk = sonsuzGovde();
    const y2 = await smsRotasi.POST(akisIstegi(`${U}/api/webhook/sms/${webhookAnahtari}`, buyuk.akis, { "content-type": "application/json" }), {
      params: Promise.resolve({ anahtar: webhookAnahtari! }),
    });
    expect(y2.status).toBe(413);
    expect(buyuk.sayac.okunan).toBeLessThanOrEqual(MB + 2 * 64 * 1024);
  });

  it("içe aktarma: Content-Length'siz 5 MB üstü gövde akışta kesilir (413)", async () => {
    oturum.ctx = kiraciOlustur("GovdeIce").ctx;
    const buyuk = sonsuzGovde();
    const y = await yuklemeRotasi.POST(
      akisIstegi(`${U}/api/ice-aktarma`, buyuk.akis, { "content-type": "multipart/form-data; boundary=x", origin: U }),
    );
    expect(y.status).toBe(413);
    expect(buyuk.sayac.okunan).toBeLessThanOrEqual(5 * MB + 64 * 1024 + 2 * 64 * 1024);
  });
});

// --- Migration ---
function migrasyonKlasoru(ad: string, migrasyonlar: { tag: string; sql: string }[]) {
  const klasor = path.join(gecici, ad);
  fs.mkdirSync(path.join(klasor, "meta"), { recursive: true });
  for (const m of migrasyonlar) fs.writeFileSync(path.join(klasor, `${m.tag}.sql`), m.sql);
  fs.writeFileSync(
    path.join(klasor, "meta/_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "sqlite",
      entries: migrasyonlar.map((m, i) => ({ idx: i, version: "6", when: 1_700_000_000_000 + i, tag: m.tag, breakpoints: true })),
    }),
  );
  return klasor;
}

describe("migration", () => {
  it("yabancı anahtar denetimi COMMIT'ten önce: ihlal eden migration tamamen geri alınır", () => {
    const ilk = { tag: "0000_ana", sql: "CREATE TABLE ana (id text PRIMARY KEY);--> statement-breakpoint\nCREATE TABLE cocuk (id text PRIMARY KEY, ana_id text REFERENCES ana(id));" };
    const ikinci = { tag: "0001_bozuk", sql: "ALTER TABLE cocuk ADD not_ text;--> statement-breakpoint\nINSERT INTO cocuk (id, ana_id) VALUES ('c1', 'olmayan');" };
    const v = veritabaniAc(path.join(gecici, "fk.db"));
    migrasyonlariUygula(v, migrasyonKlasoru("fk-1", [ilk]));
    expect(() => migrasyonlariUygula(v, migrasyonKlasoru("fk-2", [ilk, ikinci]))).toThrow(/yabancı anahtar ihlali; değişiklikler geri alındı/);
    const s = v.$client;
    expect(s.prepare("select count(*) n from cocuk").get()).toEqual({ n: 0 });
    expect((s.prepare("pragma table_info(cocuk)").all() as { name: string }[]).map((c) => c.name)).toEqual(["id", "ana_id"]);
    expect(s.prepare(`select count(*) n from "__drizzle_migrations"`).get()).toEqual({ n: 1 });
    expect(s.pragma("foreign_keys", { simple: true })).toBe(1);
    s.close();
  });

  it("yedek: data/yedek/ altına zaman damgalı; WAL'da olup ana dosyaya yazılmamış işlemler de yedekte", async () => {
    const klasor = path.join(gecici, "yedek-deneme");
    fs.mkdirSync(klasor, { recursive: true });
    const dosya = path.join(klasor, "app.db");
    const v = veritabaniAc(dosya);
    v.$client.pragma("wal_autocheckpoint = 0"); // her şey WAL'da kalsın
    v.$client.exec("create table t (x integer); insert into t values (1), (2), (3);");
    expect(fs.statSync(`${dosya}-wal`).size).toBeGreaterThan(0);
    const yedek = await veritabaniYedekle(v.$client, dosya, new Date("2026-10-30T14:30:05.123Z"));
    expect(yedek).toBe(path.join(klasor, "yedek", "app-20261030-143005123.db"));
    // Yedek tek başına bir dosyadır: yanında -wal yok, salt okunur açılabilir.
    expect(fs.existsSync(`${yedek}-wal`)).toBe(false);
    const Database = (await import("better-sqlite3")).default;
    const y = new Database(yedek!, { readonly: true });
    expect(y.prepare("select count(*) n from t").get()).toEqual({ n: 3 });
    y.close();
    v.$client.close();
  });
});

describe("sorunlu satırlar CSV'si", () => {
  it("hücreler formül olarak çalışmaz (=, +, -, @ ile başlayanlara ' eklenir)", async () => {
    const { ctx } = kiraciOlustur("CsvFormul");
    const csv = "Ad;Telefon;E-posta\n=HYPERLINK(\"http://kotu.example\",\"tıkla\");12345;\n@SUM(1);+905;\n";
    const o = await svc.iceAktarmaBaslat(ctx, "liste.csv", new TextEncoder().encode(csv));
    const cikti = svc.sorunluSatirlarCsv(ctx, o.id, { yetkiliAdi: 0, telefon: 1, eposta: 2 }, {
      cakisma: "atla",
      varsayilanAliciTuru: "tacir_esnaf",
      varsayilanIzinKaynagi: null,
      iysBeyani: false,
    });
    const satirlar = cikti.split("\r\n");
    expect(satirlar[1]).toContain(`"'=HYPERLINK(""http://kotu.example"",""tıkla"")"`);
    expect(satirlar[2]).toContain("'@SUM(1)");
    expect(satirlar[2]).toContain("'+905");
  });
});

describe("saklama süreleri", () => {
  it("işçinin saatlik bakımı süresi dolan içe aktarma satırlarını siler; bir saat dolmadan tekrar çalışmaz", async () => {
    const { ctx } = kiraciOlustur("SaatlikBakim");
    const eski = await svc.iceAktarmaBaslat(ctx, "eski.csv", new TextEncoder().encode("Ad;Telefon\nAli;0532 111 22 33\n"));
    const yeni = await svc.iceAktarmaBaslat(ctx, "yeni.csv", new TextEncoder().encode("Ad;Telefon\nVeli;0532 111 22 34\n"));
    const simdi = new Date();
    db.$client.prepare("update ice_aktarmalar set olusturma_tarihi = ? where id = ?").run(simdi.getTime() - 61 * 60_000, eski.id);

    const b = saatlikBakim(null, simdi);
    expect(b.kapatilanIceAktarma).toBeGreaterThanOrEqual(1);
    expect(iceAktarmaGetir(ctx, eski.id)).toMatchObject({ durum: "iptal", satirlar: null });
    expect(iceAktarmaGetir(ctx, yeni.id)?.satirlar).not.toBeNull();

    db.$client.prepare("update ice_aktarmalar set olusturma_tarihi = ? where id = ?").run(simdi.getTime() - 61 * 60_000, yeni.id);
    expect(saatlikBakim(b.sonCalismaMs, new Date(simdi.getTime() + 30 * 60_000)).kapatilanIceAktarma).toBe(0); // saat dolmadı
    expect(iceAktarmaGetir(ctx, yeni.id)?.durum).toBe("hazirlaniyor");
    expect(saatlikBakim(b.sonCalismaMs, new Date(simdi.getTime() + 61 * 60_000)).kapatilanIceAktarma).toBeGreaterThanOrEqual(1);
    expect(iceAktarmaGetir(ctx, yeni.id)?.durum).toBe("iptal");
  });

  it("'Tekrar kullan' ile aynı merkezle açılan tarama 30 günlük süreyi en eski taramadan devralır", () => {
    const { ctx } = kiraciOlustur("TekrarKullan");
    const GUN = 86_400_000;
    const ilk = taramaOlustur(ctx, { merkezLat: 38.4237, merkezLng: 27.1428, yaricapM: 1000, kategori: "kafe", merkezKaynagi: "adres", adresMetni: "Alsancak" });
    const ilkAn = Date.now() - 25 * GUN;
    db.$client.prepare("update scans set olusturma_tarihi = ?, merkez_tarihi = ? where id = ?").run(ilkAn, ilkAn, ilk.id);

    const kopya = taramaOlustur(ctx, { merkezLat: 38.4237, merkezLng: 27.1428, yaricapM: 2000, kategori: "kafe", merkezKaynagi: "adres", adresMetni: "Alsancak" });
    const baska = taramaOlustur(ctx, { merkezLat: 38.5, merkezLng: 27.2, yaricapM: 1000, kategori: "kafe" });
    expect(kopya.merkezTarihi?.getTime()).toBe(ilkAn);
    expect(baska.merkezTarihi!.getTime()).toBeGreaterThan(Date.now() - 60_000);

    // 6 gün sonra (ilk merkez 31 günlük): ikisinin de koordinatı silinir; başka merkez kalır.
    temizlikYap(new Date(Date.now() + 6 * GUN));
    expect(taramaGetir(ctx, ilk.id)?.merkezLat).toBeNull();
    expect(taramaGetir(ctx, kopya.id)?.merkezLat).toBeNull();
    expect(taramaGetir(ctx, baska.id)?.merkezLat).toBe(38.5);
  });
});
