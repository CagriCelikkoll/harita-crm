// Denetim kaydı (denetim_kayitlari) görünümü: "Geçmişi göster" listeleri (Ayarlar > Gönderen bilgileri > İYS kontrolü,
// Kayıtlar > Toplu işlem geçmişi). Saf işlevler; kayıtlar repo/denetim.ts'ten, yalnızca yöneticiye gösterilir.
import { DENETIM_IYS_KONTROLU } from "./mesajlasma";

/** Toplu kayıt işleminin denetim olayı (repo/kayitlar.ts kayitlariTopluGuncelle yazar). */
export const DENETIM_TOPLU_KAYIT = "toplu_kayit_islemi";

/** Listelenebilen denetim olayları (/api/denetim?olay=). */
export const GECMIS_OLAYLARI = [DENETIM_IYS_KONTROLU, DENETIM_TOPLU_KAYIT] as const;
export type GecmisOlayi = (typeof GECMIS_OLAYLARI)[number];

/** İstemciye giden denetim satırı. */
export type DenetimSatiri = { id: string; tarih: string; kullanici: string | null; deger: string | null; aciklama: string | null };

/** İYS kontrolü kaydının yeni değeri. */
export const iysDegeriAdi = (deger: string | null) => (deger === "acik" ? "Açıldı" : deger === "kapali" ? "Kapatıldı" : (deger ?? "—"));

const TOPLU_ISLEM_ADLARI: Record<string, string> = {
  etiket_ekle: "Etiket ekle",
  etiket_kaldir: "Etiket kaldır",
  alici_turu: "Alıcı türünü değiştir",
  whatsapp_izni: "WhatsApp iznini kaydet",
};

export type TopluDenetimOzeti = {
  islem: string;
  /** "seçilen kayıtlar" / "filtreye uyan tümü". */
  secim: string | null;
  /** İşlemin ayrıntısı (ör. '"sicak" etiketi ekleme', 'alıcı türü → Tacir / esnaf'). */
  ayrinti: string | null;
  hedef: number | null;
  degisen: number | null;
  /** WhatsApp izninde izin kaynağı (açıklamasıyla). */
  izinKaynagi: string | null;
  /** WhatsApp izninde zorunlu beyan onaylandı mı (diğer işlemlerde null). */
  beyan: boolean | null;
};

/**
 * Toplu işlemin denetim açıklamasını ayrıştırır. Biçim kayitlariTopluGuncelle'nin yazdığıdır:
 * 'Toplu işlem (seçilen kayıtlar): WhatsApp izni kaydı; kaynak: X (açıklama). 9 kayıt, 3 değişti; atlanan …. … Onaylanan beyan: "…"'.
 * Tanınmayan biçimde sayılar null kalır (açıklama yine gösterilir).
 */
export function topluDenetimOzeti(deger: string | null, aciklama: string | null): TopluDenetimOzeti {
  const m = aciklama?.match(/^Toplu işlem \((.+?)\): (.+?)\. (\d+) kayıt, (\d+) değişti/);
  const ayrinti = m?.[2] ?? null;
  const whatsapp = deger === "whatsapp_izni";
  return {
    islem: TOPLU_ISLEM_ADLARI[deger ?? ""] ?? deger ?? "—",
    secim: m?.[1] ?? null,
    ayrinti,
    hedef: m ? Number(m[3]) : null,
    degisen: m ? Number(m[4]) : null,
    izinKaynagi: whatsapp ? (ayrinti?.match(/kaynak: (.+)$/)?.[1] ?? null) : null,
    beyan: whatsapp ? Boolean(aciklama?.includes("Onaylanan beyan:")) : null,
  };
}
