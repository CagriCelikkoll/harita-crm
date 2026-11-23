// Görselli (IMAGE başlıklı) WhatsApp şablonuyla kampanya: görselin yüklenmesi ve Meta'ya aktarılması.
//
// Yükleme (kampanya sihirbazı, Mesaj adımı; yalnızca yönetici):
//  1. Boyut 0 < n ≤ 5 MB; tür dosyanın İMZASINDAN (JPEG / PNG), dosya adı ve tarayıcının bildirdiği tür dikkate alınmaz.
//  2. Çalışma alanının medya kotası (MEDYA_KOTA_BAYT, gelen medyayla ortak) aşılmamalı.
//  3. Dosya gelen medyanın klasörüne ("<tenant>/<yyyy-mm>/<uuid>") yazılır, sha256 alınır; sohbet_medyalari satırı
//     (mesaj_id boş) eklenir. Kampanyaya bağlanmayan görsel 24 saat sonra günlük bakımda silinir.
// Meta'ya aktarma (işçi, kampanyanın ilk gerçek gönderiminden hemen önce): kampanyadaki kimlik aynı numarayla
// yüklenmiş ve META_GORSEL_YENILEME_MS'den yeniyse yeniden kullanılır; değilse dosya diskten okunur, özeti yeniden
// doğrulanır ve POST /{phone-number-id}/media ile yüklenip kimlik kampanyaya yazılır. Görsel her alıcı için yüklenmez.
import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MEDYA_KOTA_BAYT } from "@/lib/gelen-kutusu";
import { gorselImzasi, KAMPANYA_GORSEL_AZAMI_BAYT, META_GORSEL_YENILEME_MS, type KampanyaGorselMime } from "@/lib/whatsapp-api";
import { yoneticiOlmali, type TenantContext } from "../repo/baglam";
import { kampanyaGorseliEkle, kampanyaGorseliGetir, kampanyaMetaGorselYaz } from "../repo/kampanya-gorselleri";
import type { Kampanya } from "../repo/kampanyalar";
import { medyaKotaKullanimi } from "../repo/sistem/medya";
import type { WhatsappApiIstemcisi } from "../whatsapp-api";
import { medyaTamYolu, yeniMedyaYolu } from "./medya-dosyalari";

export class KampanyaGorselHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "KampanyaGorselHatasi";
  }
}

/** Kampanyanın görsel dosyası diskte yok ya da özeti kayıttakiyle uyuşmuyor (kampanya "gorsel_yok" ile duraklar). */
export class GorselDosyasiHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "GorselDosyasiHatasi";
  }
}

export type KampanyaGorselDto = { id: string; mime: string; boyut: number; dosyaAdi: string; adres: string };

export const kampanyaGorselDto = (g: { id: string; mime: string | null; boyut: number | null; dosyaAdi: string | null }): KampanyaGorselDto => ({
  id: g.id,
  mime: g.mime ?? "",
  boyut: g.boyut ?? 0,
  dosyaAdi: g.dosyaAdi ?? "",
  adres: `/api/medya/${g.id}`,
});

/** Boyut ve imza denetimi; türü (imzadan) döner. */
export function gorselDogrula(bayt: Uint8Array): KampanyaGorselMime {
  if (bayt.byteLength === 0) throw new KampanyaGorselHatasi("Dosya boş.");
  if (bayt.byteLength > KAMPANYA_GORSEL_AZAMI_BAYT) throw new KampanyaGorselHatasi("Görsel en fazla 5 MB olabilir.");
  const mime = gorselImzasi(bayt);
  if (!mime) {
    throw new KampanyaGorselHatasi(
      "Yalnızca JPEG ya da PNG görsel yüklenebilir. Dosyanın içeriği bu türlerden biri değil (uzantısını değiştirmek yetmez).",
    );
  }
  return mime;
}

const sadeAd = (ad: string, mime: KampanyaGorselMime) => {
  const kok = ad.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").replace(/\.[^.]*$/, "").trim().slice(0, 120) || "kampanya-gorseli";
  return `${kok}.${mime === "image/png" ? "png" : "jpg"}`;
};

/** Görseli doğrular, medya klasörüne yazar ve satırını ekler. */
export function kampanyaGorseliYukle(ctx: TenantContext, dosyaAdi: string, bayt: Uint8Array, simdi = new Date()): KampanyaGorselDto {
  yoneticiOlmali(ctx);
  const mime = gorselDogrula(bayt);
  if (medyaKotaKullanimi(ctx.tenantId) + bayt.byteLength > MEDYA_KOTA_BAYT) {
    throw new KampanyaGorselHatasi("Medya için ayrılan disk alanı doldu; görsel yüklenemedi.");
  }
  const sha256 = createHash("sha256").update(bayt).digest("hex");
  const yol = yeniMedyaYolu(ctx.tenantId, simdi);
  const tam = medyaTamYolu(yol);
  fs.mkdirSync(path.dirname(tam), { recursive: true });
  fs.writeFileSync(tam, bayt, { mode: 0o600, flag: "wx" });
  try {
    return kampanyaGorselDto(kampanyaGorseliEkle(ctx, { yol, mime, boyut: bayt.byteLength, sha256, dosyaAdi: sadeAd(dosyaAdi, mime) }, simdi));
  } catch (hata) {
    fs.rmSync(tam, { force: true });
    throw hata;
  }
}

/**
 * Kampanyanın görselinin Meta kimliği: geçerliyse kampanyadakini, değilse görseli bu numarayla yükleyip yazar.
 * GraphHatasi (yükleme reddi, ağ) ve GorselDosyasiHatasi çağırana (işçi) geçer.
 */
export async function metaGorselHazirla(
  ctx: TenantContext,
  kampanya: Pick<Kampanya, "id" | "gorselMedyaId" | "metaGorselId" | "metaGorselNumarasi" | "metaGorselTarihi">,
  phoneNumberId: string,
  istemci: WhatsappApiIstemcisi,
  simdi: Date,
): Promise<string> {
  if (
    kampanya.metaGorselId &&
    kampanya.metaGorselNumarasi === phoneNumberId &&
    kampanya.metaGorselTarihi &&
    simdi.getTime() - kampanya.metaGorselTarihi.getTime() < META_GORSEL_YENILEME_MS
  ) {
    return kampanya.metaGorselId;
  }
  const g = kampanya.gorselMedyaId ? kampanyaGorseliGetir(ctx, kampanya.gorselMedyaId) : null;
  if (!g?.yol || !g.mime) throw new GorselDosyasiHatasi("Kampanya görseli bulunamadı.");
  let icerik: Uint8Array;
  try {
    icerik = fs.readFileSync(medyaTamYolu(g.yol));
  } catch {
    throw new GorselDosyasiHatasi("Kampanya görselinin dosyası okunamadı.");
  }
  if (createHash("sha256").update(icerik).digest("hex") !== g.sha256 || gorselImzasi(icerik) !== g.mime) {
    throw new GorselDosyasiHatasi("Kampanya görselinin dosyası değişmiş (özet uyuşmuyor).");
  }
  const metaId = await istemci.medyaYukle({ icerik, mime: g.mime, dosyaAdi: g.dosyaAdi ?? "kampanya-gorseli" });
  kampanyaMetaGorselYaz(ctx, kampanya.id, { metaId, numara: phoneNumberId, tarih: simdi });
  return metaId;
}
