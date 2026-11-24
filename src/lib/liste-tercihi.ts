// Liste tercihleri (sekme, sıralama, sayfa boyutu, süzgeçler): kullanıcı + çalışma alanı başına tarayıcı depolamasında
// (localStorage). Kural: adreste (URL) izlenen parametrelerden biri varsa adres önceliklidir ve tercih olarak kaydedilir;
// hiçbiri yoksa (ör. menüden gelindi) kayıtlı tercih uygulanır ve adrese yazılır. Sayfa numarası kaydedilmez ve
// tercih uygulanırken adresten de atılır (her dönüş 1. sayfadan). Depolamaya erişilemezse (gizli pencere, kapalı
// depolama, bozuk değer) sessizce varsayılanlar kullanılır.

export type ListeAdi = "kayitlar" | "kampanyalar" | "gelen-kutusu";
export type Tercih = Record<string, string>;
export type TercihDeposu = Pick<Storage, "getItem" | "setItem">;

const DEGER_AZAMI = 200;

export const tercihAnahtari = (liste: ListeAdi, tenantId: string, kullaniciId: string) =>
  `harita-crm:liste-tercihi:v1:${liste}:${tenantId}:${kullaniciId}`;

/** Tarayıcının localStorage'ı; erişim bile hata verebilir (ör. çerezler engelli). */
export function tarayiciDeposu(): TercihDeposu | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Kayıtlı tercihi okur; yalnızca `alanlar`daki kısa metin değerleri alınır. Okunamazsa / bozuksa null. */
export function tercihOku(depo: TercihDeposu | null, anahtar: string, alanlar: readonly string[]): Tercih | null {
  try {
    const ham = depo?.getItem(anahtar);
    if (!ham) return null;
    const veri: unknown = JSON.parse(ham);
    if (!veri || typeof veri !== "object" || Array.isArray(veri)) return null;
    const t: Tercih = {};
    for (const a of alanlar) {
      const d = (veri as Record<string, unknown>)[a];
      if (typeof d === "string" && d && d.length <= DEGER_AZAMI) t[a] = d;
    }
    return Object.keys(t).length ? t : null;
  } catch {
    return null;
  }
}

/** Tercihi yazar; yazılamazsa (kota, erişim) false. */
export function tercihYaz(depo: TercihDeposu | null, anahtar: string, tercih: Tercih): boolean {
  try {
    if (!depo) return false;
    depo.setItem(anahtar, JSON.stringify(tercih));
    return true;
  } catch {
    return false;
  }
}

export type TercihKarari = { tur: "kaydet"; tercih: Tercih } | { tur: "uygula"; arama: string } | { tur: "yok" };

/**
 * Adres sorgusu ve kayıtlı tercihe göre ne yapılacağı. `arama`: "?" olmadan sorgu metni.
 * - Adreste izlenen parametre var → "kaydet" (adresteki dolu değerler; boş değer = varsayılan).
 * - Yok ve kayıtlı tercih var → "uygula" (diğer parametreler, ör. ?secili= korunur; sayfa atılır).
 * - İkisi de yok → "yok" (varsayılanlar).
 */
export function tercihKarari(arama: string, alanlar: readonly string[], kayitli: Tercih | null): TercihKarari {
  const p = new URLSearchParams(arama);
  if (alanlar.some((a) => p.has(a))) {
    const tercih: Tercih = {};
    for (const a of alanlar) {
      const d = p.get(a);
      if (d && d.length <= DEGER_AZAMI) tercih[a] = d;
    }
    return { tur: "kaydet", tercih };
  }
  if (!kayitli || !Object.keys(kayitli).length) return { tur: "yok" };
  p.delete("sayfa");
  for (const a of alanlar) if (kayitli[a]) p.set(a, kayitli[a]);
  return { tur: "uygula", arama: p.toString() };
}

/** Kayıtlar listesinde izlenen parametreler (lib/kayit-filtresi biçimi; arama "q" ve sayfa hariç). */
export const KAYIT_TERCIH_ALANLARI = ["grup", "sira", "boyut", "durum", "izin", "kaynak", "wa_izin", "etiket", "ad", "inceleme"] as const;
/** Kampanyalar: görünüm sekmesi. */
export const KAMPANYA_TERCIH_ALANLARI = ["sekme"] as const;
/** Gelen kutusu: numara sekmesi, Açık / Kapalı / Tümü, Herkes / Bana atanan / Atanmamış (arama hariç). */
export const GELEN_KUTUSU_TERCIH_ALANLARI = ["numara", "durum", "atanan"] as const;
