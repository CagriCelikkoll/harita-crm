// Gelen medya (fotoğraf, video, belge, ses): işçinin indirmesi ve gösterim. Webhook yalnızca "bekliyor" satırı ekler.
//
// İndirme (her işçi turunda, sırası gelenler):
//  1. Meta'daki ömrü (7 gün) dolduysa "hata". Kota (MEDYA_KOTA_BAYT) doluysa satır bekler, saatte bir yeniden bakılır.
//  2. GET /{media-id} → kısa ömürlü adres, tür, boyut, özet. Tür MIME beyaz listesinde olmalı (SVG, HTML yok); bildirilen
//     boyut türün sınırını aşmamalı; adres Meta'nın medya alanında olmalı (metaMedyaAdresiGecerli). Aksi "reddedildi".
//  3. Adrese erişim anahtarıyla GET (yönlendirme izlenmez); gövde parça parça ".part" dosyasına yazılır, sınır aşılırsa
//     indirme kesilir ve dosya silinir. Yazılan baytların sha256 özeti Meta'nınkiyle karşılaştırılır (hex ya da base64).
//  4. Dosya son adına taşınır, satır "indirildi" olur (mesaj ve sohbet sürümü artar: açık sohbet canlı yenilenir).
// Geçici hata (ağ, 5xx, hız sınırı, disk) yeniden denenir (en fazla MEDYA_AZAMI_DENEME, artan aralıkla); kalıcı hata
// (404, yetki, numara kaldırılmış) "hata".
import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MEDYA_AZAMI_BAYT, MEDYA_KOTA_BAYT, MEDYA_MIME_TURLERI, medyaIndirilir, medyaMimeSadelestir, type MedyaDto, type MedyaGorunumu } from "@/lib/gelen-kutusu";
import type { TenantContext } from "../repo/baglam";
import { medyaGetir, type SohbetMedyasi } from "../repo/gelen-kutusu";
import { indirilecekMedyalar, medyaGuncelle, medyaKotaKullanimi, type IndirilecekMedya } from "../repo/sistem/medya";
import { GraphHatasi, whatsappApiIstemcisi } from "../whatsapp-api";
import { metaMedyaAdresiGecerli } from "../whatsapp-api/medya-adresi";
import { medyaTamYolu, yeniMedyaYolu } from "./medya-dosyalari";
import { whatsappBaglantisiCoz } from "./whatsapp-api";

export const MEDYA_AZAMI_DENEME = 5;
/** Meta'nın webhook'ta verdiği medya kimliği bu süre geçerlidir. */
const META_MEDYA_OMRU_MS = 7 * 24 * 3600_000;
const KOTA_BEKLEME_MS = 3600_000;
/** Bir işçi turunda en fazla bu kadar medya indirilir (tur kısa kalsın). */
const TUR_BASINA_MEDYA = 10;

const MB = (b: number) => `${Math.ceil(b / (1024 * 1024))} MB`;

export type MedyaTurSonucu = { indirilen: number; reddedilen: number; hata: number; bekletilen: number };

class Ret extends Error {}

/** Yazılan dosyanın özeti Meta'nın bildirdiğiyle uyuşuyor mu (Meta özeti vermediyse geçer). */
function ozetUyusuyor(hex: string, meta: string | null): boolean {
  if (!meta) return true;
  const m = meta.trim();
  return m.toLowerCase() === hex || m === Buffer.from(hex, "hex").toString("base64");
}

async function indir(m: IndirilecekMedya, simdi: Date): Promise<keyof MedyaTurSonucu> {
  if (simdi.getTime() - m.mesajTarihi.getTime() > META_MEDYA_OMRU_MS) {
    medyaGuncelle(m, { durum: "hata", neden: "Meta'daki süresi doldu (7 gün); telefondan bakın" });
    return "hata";
  }
  if (!medyaIndirilir(m.tur)) {
    medyaGuncelle(m, { durum: "reddedildi", neden: "Bu tür indirilmiyor; telefondan bakın" });
    return "reddedilen";
  }
  const sinir = MEDYA_AZAMI_BAYT[m.tur];
  const kullanim = medyaKotaKullanimi(m.tenantId);
  if (kullanim >= MEDYA_KOTA_BAYT) {
    medyaGuncelle(m, { neden: "Medya için ayrılan disk alanı doldu", sonrakiDeneme: new Date(simdi.getTime() + KOTA_BEKLEME_MS) });
    return "bekletilen";
  }
  const c = whatsappBaglantisiCoz(m.ctx, m.baglantiId);
  if (!c) {
    medyaGuncelle(m, { durum: "hata", neden: "Numara kaldırılmış ya da doğrulanmamış; telefondan bakın" });
    return "hata";
  }
  const istemci = whatsappApiIstemcisi({ wabaId: c.baglanti.wabaId, phoneNumberId: c.baglanti.phoneNumberId, erisimAnahtari: c.gizli.erisimAnahtari });

  let gecici: string | null = null;
  let parcaYolu: string | null = null;
  try {
    const bilgi = await istemci.medyaBilgisi(m.metaMedyaId);
    const mime = medyaMimeSadelestir(bilgi.mime ?? m.mime);
    if (!mime) throw new Ret(`Desteklenmeyen dosya türü (${(bilgi.mime ?? m.mime ?? "bilinmiyor").slice(0, 60)}); telefondan bakın`);
    if (bilgi.boyut !== null && bilgi.boyut > sinir) throw new Ret(`Dosya çok büyük (${MB(bilgi.boyut)}; sınır ${MB(sinir)}); telefondan bakın`);
    if (kullanim + (bilgi.boyut ?? 0) > MEDYA_KOTA_BAYT) {
      medyaGuncelle(m, { neden: "Medya için ayrılan disk alanı doldu", sonrakiDeneme: new Date(simdi.getTime() + KOTA_BEKLEME_MS) });
      return "bekletilen";
    }
    if (!metaMedyaAdresiGecerli(bilgi.url)) throw new Ret("İndirme adresi Meta'nın alanında değil; indirilmedi");

    const yol = yeniMedyaYolu(m.tenantId, simdi);
    const tam = medyaTamYolu(yol);
    fs.mkdirSync(path.dirname(tam), { recursive: true });
    parcaYolu = `${tam}.part`;
    const akis = await istemci.medyaAkisi(bilgi.url);
    if (akis.boyut !== null && akis.boyut > sinir) {
      akis.iptal();
      throw new Ret(`Dosya çok büyük (${MB(akis.boyut)}; sınır ${MB(sinir)}); telefondan bakın`);
    }
    const ozet = createHash("sha256");
    let toplam = 0;
    const fd = fs.openSync(parcaYolu, "w", 0o600);
    try {
      for await (const parca of akis.parcalar) {
        toplam += parca.byteLength;
        if (toplam > sinir) {
          akis.iptal();
          throw new Ret(`Dosya çok büyük (sınır ${MB(sinir)}); indirme kesildi, telefondan bakın`);
        }
        ozet.update(parca);
        fs.writeSync(fd, parca);
      }
    } finally {
      fs.closeSync(fd);
    }
    const hex = ozet.digest("hex");
    if (!ozetUyusuyor(hex, bilgi.sha256 ?? m.metaSha256)) throw new Ret("Dosya doğrulanamadı (özet uyuşmuyor); indirilmedi");
    fs.renameSync(parcaYolu, tam);
    parcaYolu = null;
    const yazildi = medyaGuncelle(m, { durum: "indirildi", neden: null, yol, mime, boyut: toplam, sha256: hex, indirmeTarihi: simdi });
    if (!yazildi) fs.rmSync(tam, { force: true });
    return "indirilen";
  } catch (hata) {
    if (hata instanceof Ret) {
      medyaGuncelle(m, { durum: "reddedildi", neden: hata.message });
      return "reddedilen";
    }
    if (hata instanceof GraphHatasi && !hata.gecici) {
      medyaGuncelle(m, { durum: "hata", neden: `Meta medyayı vermedi (HTTP ${hata.http}); telefondan bakın` });
      return "hata";
    }
    gecici = hata instanceof GraphHatasi ? hata.message : "Dosya yazılamadı";
  } finally {
    if (parcaYolu) fs.rmSync(parcaYolu, { force: true });
  }
  const deneme = m.deneme + 1;
  if (deneme >= MEDYA_AZAMI_DENEME) {
    medyaGuncelle(m, { durum: "hata", deneme, neden: `İndirilemedi (${deneme} deneme: ${gecici}); telefondan bakın` });
    return "hata";
  }
  medyaGuncelle(m, { deneme, neden: "Yükleniyor (yeniden denenecek)", sonrakiDeneme: new Date(simdi.getTime() + 2 ** deneme * 60_000) });
  return "bekletilen";
}

/** İşçi turu: sırası gelen medyaları sırayla indirir. */
export async function medyalariIndir(s: { simdi?: () => Date; adet?: number } = {}): Promise<MedyaTurSonucu> {
  const simdi = s.simdi ?? (() => new Date());
  const sonuc: MedyaTurSonucu = { indirilen: 0, reddedilen: 0, hata: 0, bekletilen: 0 };
  for (const m of indirilecekMedyalar(simdi(), s.adet ?? TUR_BASINA_MEDYA)) {
    sonuc[await indir(m, simdi())]++;
  }
  return sonuc;
}

/** Sohbette gösterilecek medya bilgisi. */
export function medyaDto(m: SohbetMedyasi): MedyaDto {
  const mime = medyaMimeSadelestir(m.mime);
  const neden =
    m.durum === "silindi"
      ? "Medya saklama süresi doldu"
      : m.durum === "bekliyor"
        ? (m.neden ?? "Yükleniyor…")
        : m.durum === "indirildi"
          ? null
          : (m.neden ?? "Görüntülenemiyor; telefondan bakın");
  return {
    id: m.id,
    durum: m.durum,
    gorunum: mime ? MEDYA_MIME_TURLERI[mime].gorunum : null,
    dosyaAdi: m.dosyaAdi,
    boyut: m.boyut,
    neden,
  };
}

/** Sunulacak dosya: yalnızca bu çalışma alanının indirilmiş medyası; tür beyaz listeden. Yoksa null (404). */
export function medyaDosyasi(
  ctx: TenantContext,
  id: string,
): { tam: string; mime: string; boyut: number; gorunum: MedyaGorunumu; dosyaAdi: string } | null {
  const m = medyaGetir(ctx, id);
  if (!m || m.durum !== "indirildi" || !m.yol) return null;
  const mime = medyaMimeSadelestir(m.mime);
  if (!mime) return null;
  let tam: string;
  try {
    tam = medyaTamYolu(m.yol);
  } catch {
    return null;
  }
  let boyut: number;
  try {
    boyut = fs.statSync(tam).size;
  } catch {
    return null;
  }
  const { gorunum, uzanti } = MEDYA_MIME_TURLERI[mime];
  const ad = (m.dosyaAdi?.trim() || `whatsapp-${m.id.slice(0, 8)}`).replace(/[\u0000-\u001f\u007f"\\/]/g, "_").slice(0, 200);
  const dosyaAdi = ad.toLowerCase().endsWith(`.${uzanti}`) ? ad : `${ad}.${uzanti}`;
  return { tam, mime, boyut, gorunum, dosyaAdi };
}
