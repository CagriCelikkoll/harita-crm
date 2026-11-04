// npm run hazirlik ve npm run kullanim denetimleri:
// - Ortam: gerekli değişkenler, PLACES_MOCK=false, WHATSAPP_API_MOCK boş; gizli değerler hiçbir çıktıya yazılmaz.
// - Veritabanı: bekleyen migration sayısı; WhatsApp bağlantısı (var mı, test modu, hesap kilidi); işçi kilidi.
// - Places (sahte doğrulayıcı), cloudflared (sahte süreç), port (gerçek soket).
// - Kullanım raporu: birim ve dolar, kalemler; veritabanı salt okunur açıkken çalışır (hiçbir şey yazmaz).
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, describe, expect, it } from "vitest";
import {
  bekleyenMigrasyonlar,
  cloudflaredKontrolu,
  isciKilidiKontrolu,
  migrasyonKontrolu,
  ortamKontrolleri,
  placesKontrolu,
  portKontrolu,
  whatsappKontrolleri,
  type Sonuc,
} from "../scripts/hazirlik-kontrolleri";
import { kullanimRaporu } from "../scripts/kullanim-raporu";
import { saltOkunurAc } from "../scripts/salt-okunur-db";
import { kiraciOlustur } from "./yardimci/fabrika";

const { db } = await import("@/server/db");
const s = db.$client;
const DRIZZLE = path.resolve(__dirname, "../drizzle");
const metin = (sonuclar: Sonuc[]) => JSON.stringify(sonuclar);
const isaretler = (sonuclar: Sonuc[]) => sonuclar.map((x) => `${x.tamam ? "✓" : "✗"} ${x.baslik}`);

const GIZLI = {
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  ILETI_SIFRELEME_ANAHTARI: randomBytes(32).toString("base64"),
  ILETI_IMZA_ANAHTARI: randomBytes(32).toString("base64"),
  GOOGLE_PLACES_API_KEY: `AIza${randomBytes(16).toString("hex")}`,
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: `AIza${randomBytes(16).toString("hex")}`,
};
const HAZIR = {
  DATABASE_PATH: "./data/gercek-test.db",
  BETTER_AUTH_URL: "http://localhost:3000",
  PLACES_MOCK: "false",
  WHATSAPP_API_MOCK: "",
  ...GIZLI,
};

describe("ortam değişkenleri", () => {
  it("hepsi doğruysa her madde ✓; gizli değerler yazılmaz", () => {
    const sonuclar = ortamKontrolleri(HAZIR, true);
    expect(sonuclar.every((x) => x.tamam)).toBe(true);
    for (const deger of Object.values(GIZLI)) expect(metin(sonuclar)).not.toContain(deger);
    expect(isaretler(sonuclar)).toContain("✓ DATABASE_PATH dolu (./data/gercek-test.db)");
  });

  it("eksik, kısa ve yanlış değerler ✗ ve çözümlü; gizli değerler yine yazılmaz", () => {
    const kisa = { BETTER_AUTH_SECRET: "kisa-sir", ILETI_IMZA_ANAHTARI: Buffer.from("az").toString("base64") };
    const sonuclar = ortamKontrolleri(
      {
        ...HAZIR,
        ...kisa,
        DATABASE_PATH: "",
        ILETI_SIFRELEME_ANAHTARI: undefined,
        GOOGLE_PLACES_API_KEY: " ",
        PLACES_MOCK: "true",
        WHATSAPP_API_MOCK: "1",
        GENEL_ADRES: "http://ornek.trycloudflare.com",
      },
      false,
    );
    expect(sonuclar.filter((x) => !x.tamam).map((x) => x.baslik)).toEqual([
      ".env.local yok",
      "DATABASE_PATH boş",
      "BETTER_AUTH_SECRET 32 karakterden kısa",
      "ILETI_SIFRELEME_ANAHTARI boş",
      "ILETI_IMZA_ANAHTARI 32 bayttan kısa",
      "GOOGLE_PLACES_API_KEY boş",
      "PLACES_MOCK=false değil",
      "WHATSAPP_API_MOCK dolu",
      "GENEL_ADRES https ile başlamıyor",
    ]);
    expect(sonuclar.filter((x) => !x.tamam).every((x) => x.cozum)).toBe(true);
    for (const deger of [...Object.values(GIZLI), ...Object.values(kisa)]) expect(metin(sonuclar)).not.toContain(deger);
  });

  it("GENEL_ADRES boşsa ya da https ise ✓", () => {
    const genel = (g?: string) => ortamKontrolleri({ ...HAZIR, GENEL_ADRES: g }, true).at(-1)!;
    expect(genel(undefined)).toMatchObject({ tamam: true, baslik: "GENEL_ADRES boş (npm run tunel açılınca doldurulacak)" });
    expect(genel("https://dort-kelime.trycloudflare.com").tamam).toBe(true);
  });
});

describe("veritabanı", () => {
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-hazirlik-"));
  afterAll(() => fs.rmSync(gecici, { recursive: true, force: true }));

  it("migration'lar: güncel ✓; boş ya da eski veritabanında bekleyen sayı ✗", () => {
    expect(migrasyonKontrolu(s, DRIZZLE)).toEqual({ tamam: true, baslik: "Migration'lar güncel" });
    const toplam = readMigrationFiles({ migrationsFolder: DRIZZLE }).length;
    const bos = new Database(":memory:");
    expect(bekleyenMigrasyonlar(bos, DRIZZLE)).toBe(toplam);
    const son = s.prepare(`select created_at from "__drizzle_migrations" order by created_at desc limit 1 offset 1`).get() as { created_at: number };
    bos.exec(`create table "__drizzle_migrations" (id integer primary key, hash text, created_at numeric)`);
    bos.prepare(`insert into "__drizzle_migrations" (hash, created_at) values ('x', ?)`).run(son.created_at);
    expect(migrasyonKontrolu(bos, DRIZZLE)).toMatchObject({ tamam: false, baslik: "1 migration uygulanmamış" });
    bos.close();
  });

  it("WhatsApp: bağlantı yok ✗; varsa test modu ve hesap kilidi ayrı ayrı denetlenir", () => {
    const { ctx } = kiraciOlustur("Hazirlik");
    const slug = (s.prepare("select slug from tenants where id = ?").get(ctx.tenantId) as { slug: string }).slug;
    expect(isaretler(whatsappKontrolleri(s, slug))).toEqual(["✗ WhatsApp bağlantısı yok"]);

    s.prepare(
      `insert into whatsapp_baglantilari (tenant_id, webhook_kimligi, waba_id, phone_number_id, sifreli_veri, numara_dogrulama_tarihi)
       values (?, 'wh-hazirlik', '1', '2', 'gizli-sifreli-veri', ?)`,
    ).run(ctx.tenantId, Date.now());
    expect(isaretler(whatsappKontrolleri(s, slug))).toEqual([
      "✓ WhatsApp bağlantısı var (numara doğrulandı, webhook henüz doğrulanmadı)",
      "✓ Test modu açık (yalnızca test numaralarına gönderilir)",
      "✓ Meta hesap kilidi yok",
    ]);

    s.prepare("update whatsapp_baglantilari set test_modu = 0, hesap_kilidi_kodu = 131031, webhook_dogrulama_tarihi = ? where tenant_id = ?").run(
      Date.now(),
      ctx.tenantId,
    );
    const sonuclar = whatsappKontrolleri(s, slug);
    expect(isaretler(sonuclar)).toEqual([
      "✓ WhatsApp bağlantısı var (numara doğrulandı, webhook doğrulandı)",
      "✗ Test modu KAPALI",
      "✗ Meta hesap kilidi var (kod 131031); WhatsApp gönderimi durdu",
    ]);
    expect(sonuclar[1].cozum).toContain("Test modunu yeniden aç");
    expect(sonuclar[2].cozum).toContain("Business Support Home");
    expect(metin(sonuclar)).not.toContain("gizli-sifreli-veri");
  });

  it("WhatsApp: birden çok çalışma alanında satırlar adıyla; bilinmeyen slug ✗", () => {
    kiraciOlustur("Ikinci");
    const sonuclar = whatsappKontrolleri(s);
    expect(sonuclar.length).toBeGreaterThan(1);
    expect(sonuclar.every((x) => /^.+ \(.+\): /.test(x.baslik))).toBe(true);
    expect(isaretler(whatsappKontrolleri(s, "olmayan-alan"))).toEqual(['✗ "olmayan-alan" slug\'ına sahip çalışma alanı yok']);
  });

  it("işçi kilidi: yok / süresi dolmuş ✓, çalışan işçi ✓, süresinden fazla ileride ✗ (takılı)", () => {
    const simdi = Date.now();
    const kilit = (bitis: number) =>
      s
        .prepare("insert into isci_kilitleri (ad, sahip, bitis, son_nabiz) values ('gonderim', 'x', ?, ?) on conflict (ad) do update set bitis = excluded.bitis, son_nabiz = excluded.son_nabiz")
        .run(bitis, simdi - 10_000);
    expect(isciKilidiKontrolu(s, 120_000, simdi).baslik).toBe("İşçi kilidi boşta");
    kilit(simdi - 1);
    expect(isciKilidiKontrolu(s, 120_000, simdi)).toEqual({ tamam: true, baslik: "İşçi kilidi boşta" });
    kilit(simdi + 110_000);
    expect(isciKilidiKontrolu(s, 120_000, simdi)).toEqual({
      tamam: true,
      baslik: "İşçi kilidi dolu: bir npm run worker çalışıyor, son nabız 10 sn önce (kapandıysa 110 sn içinde düşer)",
    });
    kilit(simdi + 3_600_000);
    expect(isciKilidiKontrolu(s, 120_000, simdi)).toMatchObject({
      tamam: false,
      baslik: "İşçi kilidi takılı (3600 sn sonra düşecek; normalde en fazla 120 sn)",
    });
    s.prepare("delete from isci_kilitleri").run();
  });
});

describe("dış denetimler", () => {
  it("Places: anahtar yoksa istek atılmaz; sonuç doğrulayıcının yanıtına göre", async () => {
    let cagri = 0;
    const dogrula = async () => (cagri++, { tamam: true as const, kimlikSayisi: 1 });
    expect((await placesKontrolu(false, dogrula)).tamam).toBe(false);
    expect(cagri).toBe(0);
    expect(await placesKontrolu(true, dogrula)).toEqual({
      tamam: true,
      baslik: "Places anahtarı çalışıyor (ücretsiz istek, 1 yer kimliği; kotadan düşmez)",
    });
    expect(await placesKontrolu(true, async () => ({ tamam: false, neden: "Anahtar geçersiz." }))).toEqual({
      tamam: false,
      baslik: "Places anahtarı çalışmıyor",
      cozum: "Anahtar geçersiz.",
    });
  });

  it("cloudflared: PATH'te ✓; kurulu ama PATH'te değil ✗ (terminali yeniden aç); hiç yok ✗ (kur)", () => {
    const calisir = (() => ({ status: 0, stdout: "cloudflared version 2026.10.7\n" })) as unknown as typeof import("node:child_process").spawnSync;
    const yok = (() => ({ status: null, error: new Error("ENOENT"), stdout: "" })) as unknown as typeof import("node:child_process").spawnSync;
    expect(cloudflaredKontrolu(calisir)).toEqual({ tamam: true, baslik: "cloudflared kurulu (cloudflared version 2026.10.7)" });
    expect(cloudflaredKontrolu(yok, () => true, ["C:\\cloudflared.exe"]).baslik).toBe("cloudflared kurulu ama bu terminal onu bulamıyor (PATH)");
    expect(cloudflaredKontrolu(yok, () => false, ["C:\\cloudflared.exe"])).toMatchObject({
      tamam: false,
      baslik: "cloudflared kurulu değil",
      cozum: expect.stringContaining("winget install --id Cloudflare.cloudflared"),
    });
  });

  it("port: dinleyen süreç varsa ✗, yoksa ✓", async () => {
    const sunucu = net.createServer();
    await new Promise<void>((coz) => sunucu.listen(0, "127.0.0.1", coz));
    const port = (sunucu.address() as net.AddressInfo).port;
    expect(await portKontrolu(port)).toMatchObject({ tamam: false, baslik: `${port} portu dolu` });
    await new Promise((coz) => sunucu.close(coz));
    expect(await portKontrolu(port)).toEqual({ tamam: true, baslik: `${port} portu boş` });
  });
});

describe("kullanım raporu (npm run kullanim)", () => {
  it("toplamı ve kalemleri birim ve dolar olarak yazar; veritabanı salt okunur açıkken çalışır", () => {
    const { ctx } = kiraciOlustur("Rapor");
    const { slug } = s.prepare("select slug from tenants where id = ?").get(ctx.tenantId) as { slug: string };
    s.prepare("update tenants set aylik_places_kotasi = 30000 where id = ?").run(ctx.tenantId);
    s.prepare(
      `insert into usage_counters (tenant_id, ay, places_istek_sayisi, tarama_birim, isletme_bilgisi_birim, iletisim_bilgisi_birim, harita_birim)
       values (?, '2026-11', 1372, 160, 935, 260, 7)`,
    ).run(ctx.tenantId);

    const salt = saltOkunurAc(process.env.DATABASE_PATH);
    const satirlar = kullanimRaporu(salt, slug, "2026-11")!;
    expect(() => salt.prepare("update tenants set aylik_places_kotasi = 1").run()).toThrow(/readonly/);
    salt.close();

    expect(satirlar[0]).toContain(`(${slug}) · 2026-11 kullanımı (1 birim = 0,001 $`);
    const sade = satirlar.slice(1).map((x) => x.trim().replace(/\s+/g, " "));
    expect(sade).toEqual([
      "Toplam 1.372 birim 1,372 $",
      "Tarama 160 birim 0,160 $",
      "İşletme bilgisi 935 birim 0,935 $",
      "İletişim bilgisi 260 birim 0,260 $",
      "Harita 7 birim 0,007 $",
      "Kalemsiz (eski) 10 birim 0,010 $",
      "Aylık kota 30.000 birim 30,000 $",
      "Arayüzdeki yüzde: %4",
    ]);
    // Kaydı olmayan ay sıfır; bilinmeyen slug null.
    expect(kullanimRaporu(s, slug, "2026-10")![1].replace(/\s+/g, " ").trim()).toBe("Toplam 0 birim 0,000 $");
    expect(kullanimRaporu(s, "olmayan-alan", "2026-11")).toBeNull();
  });
});
