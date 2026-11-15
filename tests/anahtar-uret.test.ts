// npm run anahtar:uret: eksik gizli anahtarları üretir, dolu olanlara dokunmaz, değerleri ekrana yazmaz, dosyayı 0600 yapar.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { anahtarlariEkle, URETILECEK_ANAHTARLAR } from "../scripts/anahtar-uret-yardimci";

let n = 0;
const sahte = () => `URETILEN${++n}`;
beforeEach(() => {
  n = 0;
});

describe("anahtarlariEkle", () => {
  it("boş değerli satırlar yerinde doldurulur, olmayanlar sona eklenir", () => {
    const s = anahtarlariEkle("# baslik\nBETTER_AUTH_SECRET=\nDIGER=1\nILETI_SIFRELEME_ANAHTARI=   # yorum\n", sahte);
    expect(s.metin).toBe(
      "# baslik\nBETTER_AUTH_SECRET=URETILEN1\nDIGER=1\nILETI_SIFRELEME_ANAHTARI=URETILEN2\nILETI_IMZA_ANAHTARI=URETILEN3\n",
    );
    expect(s.eklenen).toEqual([...URETILECEK_ANAHTARLAR]);
    expect(s.korunan).toEqual([]);
  });

  it("dolu değere (tırnaklı, export'lu, yorumlu) asla dokunulmaz", () => {
    const giris = 'export BETTER_AUTH_SECRET="var-olan"\nILETI_SIFRELEME_ANAHTARI=abc # not\nILETI_IMZA_ANAHTARI=\'imza\'\n';
    const s = anahtarlariEkle(giris, sahte);
    expect(s.metin).toBe(giris);
    expect(s.eklenen).toEqual([]);
    expect(s.korunan).toEqual([...URETILECEK_ANAHTARLAR]);
  });

  it("CRLF korunur; boş dosyaya üçü de eklenir; benzer adlı anahtar karışmaz", () => {
    expect(anahtarlariEkle("A=1\r\nILETI_IMZA_ANAHTARI=x\r\n", sahte).metin).toBe(
      "A=1\r\nILETI_IMZA_ANAHTARI=x\r\nBETTER_AUTH_SECRET=URETILEN1\r\nILETI_SIFRELEME_ANAHTARI=URETILEN2\r\n",
    );
    n = 0;
    expect(anahtarlariEkle("", sahte).eklenen).toHaveLength(3);
    n = 0;
    const s = anahtarlariEkle("ESKI_BETTER_AUTH_SECRET=dolu\n", sahte);
    expect(s.metin).toContain("\nBETTER_AUTH_SECRET=URETILEN1");
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
    if (process.platform !== "win32") expect(fs.statSync(dosya).mode & 0o777).toBe(0o600);

    const once = fs.readFileSync(dosya, "utf8");
    const ikinci = calistir(dosya);
    expect(fs.readFileSync(dosya, "utf8")).toBe(once);
    for (const ad of URETILECEK_ANAHTARLAR) expect(ikinci).toContain(`• ${ad} zaten dolu`);
  });

  it("dosya yoksa oluşturmaz, hata verir", () => {
    const dosya = path.join(klasor, "yok.env");
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/anahtar-uret.ts", dosya], { cwd: path.resolve(__dirname, ".."), stdio: "pipe" })).toThrow();
    expect(fs.existsSync(dosya)).toBe(false);
  });
});
