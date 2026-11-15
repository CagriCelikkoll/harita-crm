// Sağlık denetimi (GET /api/saglik). Canlıda güncelleme scripti ve isteğe bağlı dış izleme kullanır.
// Denetlenenler: veritabanı cevap veriyor, gönderim işçisinin son nabzı 5 dakikadan yeni, son günlük yedek 26 saatten
// yeni (yalnızca YEDEK_KLASORU tanımlıysa; geliştirmede atlanır), veritabanı diskinde en az %5 ve 1 GB boş yer.
// Yanıtta gizli değer, kayıt sayısı ya da kiracı bilgisi YOKTUR.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { isciSonNabiz } from "../repo/sistem/isci";
import { veritabaniCevapVeriyor, veritabaniYolu } from "../repo/sistem/saglik";
import { gunlukYedekleri } from "../yedek-saklama";

export const ISCI_NABIZ_SINIRI_MS = 5 * 60_000;
export const YEDEK_YAS_SINIRI_MS = 26 * 3600_000;
export const DISK_EN_AZ_ORAN = 0.05;
export const DISK_EN_AZ_BAYT = 1024 ** 3;

export type KontrolDurumu = "ok" | "sorunlu" | "atlandi";
export type Kontrol = { ad: "veritabani" | "isci" | "yedek" | "disk"; durum: KontrolDurumu; ayrinti: string };
export type SaglikSonucu = { durum: "ok" | "sorunlu"; kontroller: Kontrol[] };

export type SaglikGirdisi = {
  veritabani: boolean;
  isciSonNabiz: Date | null;
  /** undefined: yedek denetlenmiyor (YEDEK_KLASORU yok). null: hiç yedek yok. */
  sonYedek: Date | null | undefined;
  disk: { bos: number; toplam: number } | null;
};

const dakika = (ms: number) => `${Math.round(ms / 60_000)} dk`;

export function saglikDegerlendir(g: SaglikGirdisi, simdi = new Date()): SaglikSonucu {
  const k: Kontrol[] = [];
  k.push({ ad: "veritabani", durum: g.veritabani ? "ok" : "sorunlu", ayrinti: g.veritabani ? "cevap veriyor" : "cevap vermiyor" });

  if (!g.isciSonNabiz) k.push({ ad: "isci", durum: "sorunlu", ayrinti: "hiç çalışmamış" });
  else {
    const yas = simdi.getTime() - g.isciSonNabiz.getTime();
    k.push({ ad: "isci", durum: yas <= ISCI_NABIZ_SINIRI_MS ? "ok" : "sorunlu", ayrinti: `son nabız ${dakika(Math.max(0, yas))} önce` });
  }

  if (g.sonYedek === undefined) k.push({ ad: "yedek", durum: "atlandi", ayrinti: "YEDEK_KLASORU tanımlı değil" });
  else if (g.sonYedek === null) k.push({ ad: "yedek", durum: "sorunlu", ayrinti: "hiç günlük yedek yok" });
  else {
    const yas = simdi.getTime() - g.sonYedek.getTime();
    k.push({ ad: "yedek", durum: yas <= YEDEK_YAS_SINIRI_MS ? "ok" : "sorunlu", ayrinti: `son yedek ${Math.round(yas / 3600_000)} sa önce` });
  }

  if (!g.disk || g.disk.toplam <= 0) k.push({ ad: "disk", durum: "atlandi", ayrinti: "ölçülemedi" });
  else {
    const oran = g.disk.bos / g.disk.toplam;
    const yeterli = oran >= DISK_EN_AZ_ORAN && g.disk.bos >= DISK_EN_AZ_BAYT;
    k.push({ ad: "disk", durum: yeterli ? "ok" : "sorunlu", ayrinti: `%${Math.round(oran * 100)} boş (${(g.disk.bos / 1024 ** 3).toFixed(1)} GB)` });
  }

  return { durum: k.some((x) => x.durum === "sorunlu") ? "sorunlu" : "ok", kontroller: k };
}

/** Gerçek değerleri toplar. */
export function saglikGirdisiTopla(ortam = process.env): SaglikGirdisi {
  const veritabani = veritabaniCevapVeriyor();
  let nabiz: Date | null = null;
  try {
    nabiz = veritabani ? isciSonNabiz() : null;
  } catch {
    nabiz = null;
  }
  const dbYolu = veritabaniYolu();
  const klasor = ortam.YEDEK_KLASORU?.trim();
  const sonYedek = klasor && dbYolu ? (gunlukYedekleri(path.resolve(klasor), dbYolu)[0]?.an ?? null) : undefined;
  let disk: SaglikGirdisi["disk"] = null;
  if (dbYolu) {
    try {
      const s = fs.statfsSync(path.dirname(dbYolu));
      disk = { bos: s.bavail * s.bsize, toplam: s.blocks * s.bsize };
    } catch {
      disk = null;
    }
  }
  return { veritabani, isciSonNabiz: nabiz, sonYedek, disk };
}

const YEREL = new Set(["localhost", "127.0.0.1", "[::1]"]);

const loopback = (ip: string) => {
  const a = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return a === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a) || /^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a);
};

/**
 * Ayrıntı yalnızca sunucunun kendisinden (curl http://127.0.0.1:3000/api/saglik) gelen isteğe verilir: Host yerel ve
 * X-Forwarded-For'daki her adres loopback. `next start` her isteğe bağlantının adresini X-Forwarded-For olarak ekler
 * (yerel istekte 127.0.0.1 / ::1). Caddy'den gelen istekte Host alan adıdır ve Caddy, güvenilmeyen istemcinin
 * gönderdiği X-Forwarded-For'u istemcinin gerçek adresiyle değiştirir; uygulama yalnızca 127.0.0.1'i dinler.
 */
export function yerelIstekMi(basliklar: Headers): boolean {
  if (basliklar.get("forwarded")) return false;
  const host = basliklar.get("host")?.trim().toLowerCase() ?? "";
  const alan = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  if (!YEREL.has(alan)) return false;
  const iletilen = basliklar.get("x-forwarded-for");
  return iletilen === null || iletilen.split(",").every(loopback);
}
