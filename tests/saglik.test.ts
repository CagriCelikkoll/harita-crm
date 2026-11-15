// Sağlık ucu (GET /api/saglik): veritabanı, işçi nabzı, son günlük yedek ve disk. Dışarıya yalnızca { durum } (200/503);
// ayrıntı yalnızca sunucunun kendisinden gelen isteğe (Host yerel ve X-Forwarded-For yok).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isciKilidiAl, isciKilidiBirak } from "@/server/repo/sistem/isci";
import { saglikDegerlendir, yerelIstekMi, type SaglikGirdisi } from "@/server/servisler/saglik";
import { GET } from "@/app/api/saglik/route";

const SIMDI = new Date("2026-11-15T10:00:00.000Z");
const DAKIKA = 60_000;
const GB = 1024 ** 3;
const iyi: SaglikGirdisi = {
  veritabani: true,
  isciSonNabiz: new Date(SIMDI.getTime() - DAKIKA),
  sonYedek: new Date(SIMDI.getTime() - 3 * 3600_000),
  disk: { bos: 20 * GB, toplam: 40 * GB },
};
const durumu = (g: Partial<SaglikGirdisi>, ad: string) =>
  saglikDegerlendir({ ...iyi, ...g }, SIMDI).kontroller.find((k) => k.ad === ad)!.durum;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("saglikDegerlendir", () => {
  it("hepsi iyiyse ok", () => {
    expect(saglikDegerlendir(iyi, SIMDI)).toMatchObject({ durum: "ok" });
  });

  it("veritabanı cevap vermiyor → sorunlu", () => {
    expect(saglikDegerlendir({ ...iyi, veritabani: false }, SIMDI).durum).toBe("sorunlu");
  });

  it("işçi: hiç çalışmamış ya da son nabız 5 dakikadan eski → sorunlu", () => {
    expect(durumu({ isciSonNabiz: null }, "isci")).toBe("sorunlu");
    expect(durumu({ isciSonNabiz: new Date(SIMDI.getTime() - 5 * DAKIKA) }, "isci")).toBe("ok");
    expect(durumu({ isciSonNabiz: new Date(SIMDI.getTime() - 5 * DAKIKA - 1) }, "isci")).toBe("sorunlu");
  });

  it("yedek: klasör tanımlı değilse atlanır; hiç yoksa ya da 26 saatten eskiyse sorunlu", () => {
    expect(durumu({ sonYedek: undefined }, "yedek")).toBe("atlandi");
    expect(saglikDegerlendir({ ...iyi, sonYedek: undefined }, SIMDI).durum).toBe("ok");
    expect(durumu({ sonYedek: null }, "yedek")).toBe("sorunlu");
    expect(durumu({ sonYedek: new Date(SIMDI.getTime() - 26 * 3600_000) }, "yedek")).toBe("ok");
    expect(durumu({ sonYedek: new Date(SIMDI.getTime() - 26 * 3600_000 - 1) }, "yedek")).toBe("sorunlu");
  });

  it("disk: %5'ten az ya da 1 GB'tan az boş yer → sorunlu; ölçülemezse atlanır", () => {
    expect(durumu({ disk: { bos: 1.9 * GB, toplam: 40 * GB } }, "disk")).toBe("sorunlu"); // %4,75
    expect(durumu({ disk: { bos: 0.9 * GB, toplam: 4 * GB } }, "disk")).toBe("sorunlu"); // %22 ama < 1 GB
    expect(durumu({ disk: { bos: 2 * GB, toplam: 40 * GB } }, "disk")).toBe("ok");
    expect(durumu({ disk: null }, "disk")).toBe("atlandi");
  });
});

describe("yerelIstekMi", () => {
  const b = (o: Record<string, string>) => new Headers(o);
  it("yalnızca Host'u yerel ve X-Forwarded-For'u yalnızca loopback olan istek yereldir", () => {
    expect(yerelIstekMi(b({ host: "127.0.0.1:3000" }))).toBe(true);
    expect(yerelIstekMi(b({ host: "localhost:3000" }))).toBe(true);
    expect(yerelIstekMi(b({ host: "[::1]:3000" }))).toBe(true);
    // next start bağlantının adresini ekler.
    expect(yerelIstekMi(b({ host: "127.0.0.1:3000", "x-forwarded-for": "127.0.0.1" }))).toBe(true);
    expect(yerelIstekMi(b({ host: "127.0.0.1:3000", "x-forwarded-for": "::ffff:127.0.0.1, ::1" }))).toBe(true);
    expect(yerelIstekMi(b({ host: "127.0.0.1:3000", "x-forwarded-for": "203.0.113.7" }))).toBe(false);
    expect(yerelIstekMi(b({ host: "127.0.0.1:3000", "x-forwarded-for": "203.0.113.7, 127.0.0.1" }))).toBe(false);
    expect(yerelIstekMi(b({ host: "127.0.0.1:3000", "x-forwarded-for": "127.0.0.1.saldirgan.test" }))).toBe(false);
    // Caddy'den gelen istek: Host alan adı (X-Forwarded-For'a 127.0.0.1 yazılsa bile).
    expect(yerelIstekMi(b({ host: "deneme.bursalidagitim.com", "x-forwarded-for": "127.0.0.1" }))).toBe(false);
    expect(yerelIstekMi(b({ host: "localhost", forwarded: "for=203.0.113.7" }))).toBe(false);
    expect(yerelIstekMi(b({ host: "deneme.bursalidagitim.com" }))).toBe(false);
    expect(yerelIstekMi(b({}))).toBe(false);
  });
});

describe("GET /api/saglik", () => {
  const disaridan = () =>
    new Request("https://deneme.bursalidagitim.com/api/saglik", { headers: { host: "deneme.bursalidagitim.com", "x-forwarded-for": "203.0.113.7" } });
  const yerelden = () => new Request("http://127.0.0.1:3000/api/saglik", { headers: { host: "127.0.0.1:3000" } });

  it("işçi hiç çalışmamışsa 503; dışarıya yalnızca durum, sunucuya ayrıntı", async () => {
    const d = GET(disaridan());
    expect(d.status).toBe(503);
    expect(d.headers.get("cache-control")).toBe("no-store");
    expect(await d.json()).toEqual({ durum: "sorunlu" });

    const y = GET(yerelden());
    expect(y.status).toBe(503);
    const govde = (await y.json()) as { kontroller: { ad: string; durum: string }[] };
    expect(govde.kontroller.find((k) => k.ad === "veritabani")?.durum).toBe("ok");
    expect(govde.kontroller.find((k) => k.ad === "isci")?.durum).toBe("sorunlu");
  });

  it("işçi nabzı yeniyse ve yedek klasöründe güncel yedek varsa 200", async () => {
    expect(isciKilidiAl("saglik-testi", 60_000)).toBe(true);
    isciKilidiBirak("saglik-testi");
    const klasor = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-saglik-"));
    try {
      vi.stubEnv("YEDEK_KLASORU", klasor);
      // Yedek yok → sorunlu.
      expect(GET(yerelden()).status).toBe(503);
      const damga = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").replace(".", "").replace("Z", "");
      fs.writeFileSync(path.join(klasor, `test-${damga}.db.gz`), "x");
      const y = GET(yerelden());
      const govde = (await y.json()) as { durum: string; kontroller: { ad: string; durum: string }[] };
      // Disk test makinesinde dolu olabilir: yalnızca o kontrol sorunluysa 503 kabul edilir.
      const sorunlu = govde.kontroller.filter((k) => k.durum === "sorunlu").map((k) => k.ad);
      expect(sorunlu.filter((a) => a !== "disk")).toEqual([]);
      expect(y.status).toBe(sorunlu.length ? 503 : 200);
      expect(govde.kontroller.find((k) => k.ad === "yedek")?.durum).toBe("ok");
      // Yanıtta gizli değer ya da yol yok.
      expect(JSON.stringify(govde)).not.toContain(klasor);
      expect(JSON.stringify(govde)).not.toContain(process.env.DATABASE_PATH!);
    } finally {
      fs.rmSync(klasor, { recursive: true, force: true });
    }
  });
});
