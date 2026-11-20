// npm run anahtar:uret: eksik gizli anahtarları üretir, dolu olanlara dokunmaz, değerleri ekrana yazmaz, dosyayı 0600 yapar.
// VAPID (gelen kutusu bildirimi) anahtarları çift olarak üretilir; yalnızca biri doluysa hiçbir şey yazılmaz.
import { execFileSync } from "node:child_process";
import { createECDH } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { anahtarlariEkle, URETILECEK_ANAHTARLAR, VAPID_ANAHTARLARI, VapidCiftiHatasi, vapidCiftiUret } from "../scripts/anahtar-uret-yardimci";

let n = 0;
const sahte = () => `URETILEN${++n}`;
const sahteVapid = () => ({ acik: "ACIK", gizli: "GIZLI" });
beforeEach(() => {
  n = 0;
});

describe("anahtarlariEkle", () => {
  it("boş değerli satırlar yerinde doldurulur, olmayanlar sona eklenir", () => {
    const s = anahtarlariEkle("# baslik\nBETTER_AUTH_SECRET=\nDIGER=1\nILETI_SIFRELEME_ANAHTARI=   # yorum\nVAPID_GIZLI_ANAHTAR=\n", sahte, sahteVapid);
    expect(s.metin).toBe(
      "# baslik\nBETTER_AUTH_SECRET=URETILEN1\nDIGER=1\nILETI_SIFRELEME_ANAHTARI=URETILEN2\nVAPID_GIZLI_ANAHTAR=GIZLI\nILETI_IMZA_ANAHTARI=URETILEN3\nVAPID_ACIK_ANAHTAR=ACIK\n",
    );
    expect(s.eklenen).toEqual([...URETILECEK_ANAHTARLAR, ...VAPID_ANAHTARLARI]);
    expect(s.korunan).toEqual([]);
  });

  it("dolu değere (tırnaklı, export'lu, yorumlu) asla dokunulmaz", () => {
    const giris =
      'export BETTER_AUTH_SECRET="var-olan"\nILETI_SIFRELEME_ANAHTARI=abc # not\nILETI_IMZA_ANAHTARI=\'imza\'\nVAPID_ACIK_ANAHTAR=acik\nVAPID_GIZLI_ANAHTAR="gizli"\n';
    const s = anahtarlariEkle(giris, sahte, sahteVapid);
    expect(s.metin).toBe(giris);
    expect(s.eklenen).toEqual([]);
    expect(s.korunan).toEqual([...URETILECEK_ANAHTARLAR, ...VAPID_ANAHTARLARI]);
  });

  it("CRLF korunur; boş dosyaya üçü de eklenir; benzer adlı anahtar karışmaz", () => {
    expect(anahtarlariEkle("A=1\r\nILETI_IMZA_ANAHTARI=x\r\n", sahte, sahteVapid).metin).toBe(
      "A=1\r\nILETI_IMZA_ANAHTARI=x\r\nBETTER_AUTH_SECRET=URETILEN1\r\nILETI_SIFRELEME_ANAHTARI=URETILEN2\r\nVAPID_ACIK_ANAHTAR=ACIK\r\nVAPID_GIZLI_ANAHTAR=GIZLI\r\n",
    );
    n = 0;
    expect(anahtarlariEkle("", sahte, sahteVapid).eklenen).toHaveLength(5);
    n = 0;
    const s = anahtarlariEkle("ESKI_BETTER_AUTH_SECRET=dolu\n", sahte, sahteVapid);
    expect(s.metin).toContain("\nBETTER_AUTH_SECRET=URETILEN1");
  });

  it("VAPID çiftinin yalnızca biri doluysa hata: hiçbir şey üretilmez (çift bozulmaz)", () => {
    for (const giris of ["VAPID_ACIK_ANAHTAR=dolu\n", "VAPID_GIZLI_ANAHTAR=dolu\nVAPID_ACIK_ANAHTAR=\n"]) {
      expect(() => anahtarlariEkle(giris, sahte, sahteVapid)).toThrow(VapidCiftiHatasi);
    }
  });

  it("VAPID çifti: P-256, açık anahtar 65 bayt (0x04), gizli 32 bayt; gizliden türetilen açık anahtar aynı", () => {
    for (let i = 0; i < 20; i++) {
      const c = vapidCiftiUret();
      const acik = Buffer.from(c.acik, "base64url");
      const gizli = Buffer.from(c.gizli, "base64url");
      expect(acik).toHaveLength(65);
      expect(acik[0]).toBe(4);
      expect(gizli).toHaveLength(32);
      const ec = createECDH("prime256v1");
      ec.setPrivateKey(gizli);
      expect(ec.getPublicKey().toString("base64url")).toBe(c.acik);
    }
  });
});

describe("npm run anahtar:uret (script)", () => {
  let klasor: string;
  beforeEach(() => {
    klasor = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-anahtar-"));
  });
  afterEach(() => fs.rmSync(klasor, { recursive: true, force: true }));

  const calistir = (dosya: string) =>
    execFileSync(process.execPath, ["--import", "tsx", "scripts/anahtar-uret.ts", dosya], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  const degerler = (metin: string) =>
    Object.fromEntries(metin.split("\n").filter((s) => s.includes("=")).map((s) => [s.split("=")[0], s.slice(s.indexOf("=") + 1)]));

  it("değerleri üretir ama çıktıya yazmaz; ikinci çalıştırma hiçbir şeyi değiştirmez", () => {
    const dosya = path.join(klasor, ".env.production.local");
    fs.copyFileSync(path.resolve(__dirname, "../.env.production.example"), dosya);
    const cikti = calistir(dosya);
    const d = degerler(fs.readFileSync(dosya, "utf8"));
    for (const ad of URETILECEK_ANAHTARLAR) {
      expect(Buffer.from(d[ad], "base64")).toHaveLength(32);
      expect(cikti).not.toContain(d[ad]);
      expect(cikti).toContain(`✓ ${ad}`);
    }
    // VAPID çifti (bildirim): web-push biçiminde; değerler çıktıda yok.
    expect(Buffer.from(d.VAPID_ACIK_ANAHTAR, "base64url")).toHaveLength(65);
    expect(Buffer.from(d.VAPID_GIZLI_ANAHTAR, "base64url")).toHaveLength(32);
    for (const ad of VAPID_ANAHTARLARI) {
      expect(cikti).not.toContain(d[ad]);
      expect(cikti).toContain(`✓ ${ad}`);
    }
    if (process.platform !== "win32") expect(fs.statSync(dosya).mode & 0o777).toBe(0o600);

    const once = fs.readFileSync(dosya, "utf8");
    const ikinci = calistir(dosya);
    expect(fs.readFileSync(dosya, "utf8")).toBe(once);
    for (const ad of [...URETILECEK_ANAHTARLAR, ...VAPID_ANAHTARLARI]) expect(ikinci).toContain(`• ${ad} zaten dolu`);
  });

  it("VAPID çiftinin yalnızca biri doluysa çıkış kodu 1, dosya değişmez, değer çıktıya yazılmaz", () => {
    const dosya = path.join(klasor, ".env.production.local");
    const giris = "BETTER_AUTH_SECRET=\nVAPID_ACIK_ANAHTAR=yalniz-bu-dolu\nVAPID_GIZLI_ANAHTAR=\n";
    fs.writeFileSync(dosya, giris);
    let hata: { status?: number; stdout?: unknown; stderr?: unknown } = {};
    try {
      execFileSync(process.execPath, ["--import", "tsx", "scripts/anahtar-uret.ts", dosya], { cwd: path.resolve(__dirname, ".."), stdio: "pipe", encoding: "utf8" });
    } catch (h) {
      hata = h as typeof hata;
    }
    expect(hata.status).toBe(1);
    expect(String(hata.stderr)).toContain("VAPID_GIZLI_ANAHTAR boş");
    expect(String(hata.stderr) + String(hata.stdout)).not.toContain("yalniz-bu-dolu");
    expect(fs.readFileSync(dosya, "utf8")).toBe(giris);
  });

  it("dosya yoksa oluşturmaz, hata verir", () => {
    const dosya = path.join(klasor, "yok.env");
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/anahtar-uret.ts", dosya], { cwd: path.resolve(__dirname, ".."), stdio: "pipe" })).toThrow();
    expect(fs.existsSync(dosya)).toBe(false);
  });
});
