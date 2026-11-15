// Günlük yedek (npm run yedek) ve yedekten geri yükleme (npm run yedek:geri-yukle). Canlıda systemd zamanlayıcısı
// (deploy/harita-yedek.timer) ve deploy/geri-yukle.sh çağırır; ayrıntı docs/SUNUCU-KURULUM.md.
//
// Yedek: çalışan veritabanından çevrimiçi yedek (yedekDosyasiYaz; sqlite3 `.backup` ile aynı API), geçici dosyada
// `PRAGMA integrity_check`, sonra gzip → <klasör>/app-<damga>.db.gz (0600). Bütünlük denetimi geçmezse hiçbir dosya
// bırakılmaz ve hata fırlatılır. Sonunda saklama kuralı (14 gün, en yeni her zaman kalır).
//
// Geri yükleme: web ve işçi DURDURULMUŞKEN çalıştırılır (geri-yukle.sh durdurur). Yedek açılır ve denetlenir; mevcut
// veritabanının bir yedeği daha alınır (migration yedek klasörüne, yani geri dönülebilir); eski -wal/-shm dosyaları
// silinir (yeni dosyaya eski WAL uygulanmasın), yedek yerine konur. Şema sürümü eskiyse `npm run db:migrate` gerekir.
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { eskiGunlukYedekleriSil } from "../yedek-saklama";
import { damga, veritabaniYedekle, yedekDosyasiYaz } from "./yedek";

export class YedekHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "YedekHatasi";
  }
}

const sil = (...yollar: string[]) => {
  for (const y of yollar) fs.rmSync(y, { force: true });
};

/** Dosya bir SQLite veritabanı mı, bütün mü ve bu uygulamanın şemasını taşıyor mu? Değilse YedekHatasi. */
export function veritabaniDosyasiniDenetle(dosya: string): void {
  let v: Database.Database;
  try {
    v = new Database(dosya, { readonly: true, fileMustExist: true });
  } catch (hata) {
    throw new YedekHatasi(`Dosya açılamadı: ${(hata as Error).message}`);
  }
  try {
    let sonuc: string;
    try {
      sonuc = String(v.pragma("integrity_check", { simple: true }));
    } catch (hata) {
      throw new YedekHatasi(`Dosya bir SQLite veritabanı değil ya da bozuk: ${(hata as Error).message}`);
    }
    if (sonuc !== "ok") throw new YedekHatasi(`Bütünlük denetimi başarısız: ${sonuc.slice(0, 200)}`);
    const tablolar = new Set(
      (v.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((t) => t.name),
    );
    if (!tablolar.has("tenants") || !tablolar.has("__drizzle_migrations")) {
      throw new YedekHatasi("Dosya bu uygulamanın veritabanı değil (tenants / __drizzle_migrations tablosu yok).");
    }
  } finally {
    v.close();
  }
}

export type GunlukYedekSonucu = { yol: string; boyut: number; silinen: string[] };

/** Günlük yedeği alır. Veritabanı yoksa YedekHatasi. */
export async function gunlukYedekAl(dosyaYolu: string, klasor: string, simdi = new Date()): Promise<GunlukYedekSonucu> {
  const tam = path.resolve(dosyaYolu);
  if (!fs.existsSync(tam)) throw new YedekHatasi(`Veritabanı bulunamadı: ${tam}`);
  fs.mkdirSync(klasor, { recursive: true, mode: 0o700 });
  const uzanti = path.extname(tam) || ".db";
  const ad = `${path.basename(tam, path.extname(tam))}-${damga(simdi)}${uzanti}`;
  const gecici = path.join(klasor, `.${ad}.gecici`);
  const hedef = path.join(klasor, `${ad}.gz`);

  try {
    const kaynak = new Database(tam, { readonly: true, fileMustExist: true });
    try {
      await yedekDosyasiYaz(kaynak, gecici);
    } finally {
      kaynak.close();
    }
    veritabaniDosyasiniDenetle(gecici);
    await pipeline(fs.createReadStream(gecici), zlib.createGzip({ level: 6 }), fs.createWriteStream(hedef, { mode: 0o600 }));
  } catch (hata) {
    sil(gecici, hedef);
    throw hata;
  }
  sil(gecici);
  return { yol: hedef, boyut: fs.statSync(hedef).size, silinen: eskiGunlukYedekleriSil(klasor, tam, simdi) };
}

export type GeriYuklemeSonucu = { oncekiYedek: string | null; bozukTasinan: string | null };

/**
 * `yedek` dosyasını (.db.gz ya da .db) `dosyaYolu`na geri yükler. Web ve işçi durdurulmuş olmalı: işçi kilidi
 * süresi dolmamışsa (işçi çalışıyor) YedekHatasi. Mevcut veritabanının yedeği alınamazsa (bozuk) `zorla` olmadan
 * durur; `zorla` ile mevcut dosya `<ad>.bozuk-<damga>` olarak kenara taşınır (silinmez).
 */
export async function yedektenGeriYukle(
  yedek: string,
  dosyaYolu: string,
  secenek: { simdi?: Date; zorla?: boolean } = {},
): Promise<GeriYuklemeSonucu> {
  const simdi = secenek.simdi ?? new Date();
  const kaynak = path.resolve(yedek);
  const tam = path.resolve(dosyaYolu);
  if (!fs.existsSync(kaynak)) throw new YedekHatasi(`Yedek dosyası bulunamadı: ${kaynak}`);
  if (kaynak === tam) throw new YedekHatasi("Yedek dosyası veritabanının kendisi olamaz.");
  fs.mkdirSync(path.dirname(tam), { recursive: true });
  const gecici = `${tam}.geri-yukleme-${damga(simdi)}`;

  try {
    if (kaynak.endsWith(".gz")) {
      await pipeline(fs.createReadStream(kaynak), zlib.createGunzip(), fs.createWriteStream(gecici, { mode: 0o600 }));
    } else {
      fs.copyFileSync(kaynak, gecici);
    }
    veritabaniDosyasiniDenetle(gecici);
  } catch (hata) {
    sil(gecici);
    if (hata instanceof YedekHatasi) throw hata;
    throw new YedekHatasi(`Yedek açılamadı: ${(hata as Error).message}`);
  }

  let oncekiYedek: string | null = null;
  let bozukTasinan: string | null = null;
  if (fs.existsSync(tam)) {
    try {
      const mevcut = new Database(tam, { fileMustExist: true });
      try {
        const kilit = (() => {
          try {
            return mevcut.prepare("select bitis from isci_kilitleri where bitis > ?").get(simdi.getTime()) as { bitis: number } | undefined;
          } catch {
            return undefined; // tablo yok (çok eski şema)
          }
        })();
        if (kilit) throw new YedekHatasi("Gönderim işçisi çalışıyor görünüyor (kilit süresi dolmadı). Önce web ve işçi servislerini durdurun.");
        oncekiYedek = await veritabaniYedekle(mevcut, tam, simdi);
      } finally {
        mevcut.close();
      }
    } catch (hata) {
      if (hata instanceof YedekHatasi || !secenek.zorla) {
        sil(gecici);
        if (hata instanceof YedekHatasi) throw hata;
        throw new YedekHatasi(`Mevcut veritabanının yedeği alınamadı (${(hata as Error).message}). Bozuksa --zorla ile kenara taşınabilir.`);
      }
      bozukTasinan = `${tam}.bozuk-${damga(simdi)}`;
      fs.renameSync(tam, bozukTasinan);
      for (const ek of ["-wal", "-shm"]) if (fs.existsSync(tam + ek)) fs.renameSync(tam + ek, bozukTasinan + ek);
    }
  }
  // Eski WAL yeni dosyaya uygulanmasın.
  sil(`${tam}-wal`, `${tam}-shm`);
  fs.renameSync(gecici, tam);
  return { oncekiYedek, bozukTasinan };
}
