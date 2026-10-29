// WhatsApp Business Platform (Cloud API) sabitleri ve saf yardımcılar. İstemci ve sunucuda ortak;
// veritabanına bağımlılığı yoktur.

/** Portföy mesajlaşma limitinin bu uygulamaya ayrılan payı (%), varsayılan. Limit portföydeki tüm araçlarca paylaşılır. */
export const VARSAYILAN_UYGULAMA_PAYI = 10;
/** Test modunda kampanyaların gidebileceği numara sayısı (Meta test numarasının alıcı listesiyle uyumlu). */
export const TEST_NUMARASI_AZAMI = 5;

/** Numaranın kalite puanı (GET /{phone-number-id} quality_rating). */
export const KALITE_DEGERLERI = ["GREEN", "YELLOW", "RED", "NA"] as const;
export type Kalite = (typeof KALITE_DEGERLERI)[number];
export const KALITE_ADLARI: Record<Kalite, string> = {
  GREEN: "Yüksek (yeşil)",
  YELLOW: "Orta (sarı)",
  RED: "Düşük (kırmızı)",
  NA: "Henüz belirlenmedi",
};

/**
 * whatsapp_business_manager_messaging_limit değeri → 24 saatte benzersiz alıcı sayısı. Meta belgesindeki örnek
 * "TIER_250"; diğer katmanlar aynı kalıpla (TIER_2K, TIER_10K, TIER_100K, TIER_UNLIMITED) okunur. Tanınmayan değerde
 * null döner; çağıran en düşük katmanı (250) varsayar.
 */
export function limitKatmaniSayisi(katman: string | null | undefined): number | null {
  if (!katman) return null;
  if (/^TIER_UNLIMITED$/i.test(katman)) return Number.POSITIVE_INFINITY;
  const m = /^TIER_(\d+)(K?)$/i.exec(katman);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}

export const SABLON_KATEGORILERI = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type SablonKategorisi = (typeof SABLON_KATEGORILERI)[number];
export const SABLON_KATEGORI_ADLARI: Record<string, string> = {
  MARKETING: "Pazarlama",
  UTILITY: "Hizmet",
  AUTHENTICATION: "Doğrulama",
};

/** Meta şablon bileşeni (GET /{waba-id}/message_templates → components). Yalnızca kullandığımız alanlar. */
export type MetaSablonBileseni = {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text?: string; url?: string; example?: unknown }[];
};

/** Şablondaki değişken: kampanyada bir değerle eşlenir. Konumsal ise ad "1", "2" …; adlandırılmışsa parametre adı. */
export type SablonDegiskeni = { bilesen: "header" | "body"; ad: string };

/**
 * Pazarlama şablonunda abonelikten çıkma butonu: Meta API'de ayrı bir tür yok; metni serbest bir QUICK_REPLY
 * butonudur (ör. WhatsApp Manager'daki "Stop promotions"). Metin bu desenle tanınır.
 */
const CIKIS_BUTONU_DESENI =
  /stop|unsubscribe|opt.?out|abonelik|aboneligi|durdur|\bdur\b|cik|iptal|istemiyorum|\bret\b|almak istemiyorum/;

const sade = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");

export function cikisButonuMu(buton: { type: string; text?: string }): boolean {
  return buton.type.toUpperCase() === "QUICK_REPLY" && !!buton.text && CIKIS_BUTONU_DESENI.test(sade(buton.text));
}

const DEGISKEN_DESENI = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const DEGISKEN_VAR = /\{\{\s*[A-Za-z0-9_]+\s*\}\}/;

export type SablonCozumu = {
  degiskenler: SablonDegiskeni[];
  abonelikButonu: boolean;
  /** null: kampanyada kullanılabilir; değilse nedeni. */
  destekNedeni: string | null;
};

/**
 * Şablonu kampanya açısından çözümler. İlk sürümde (K11) yalnızca metin başlık ve gövde değişkenleri desteklenir;
 * medya başlık, konum, dinamik URL butonu, kopyalanabilir kod, katalog/akış gibi parametre isteyen bileşenler
 * desteklenmez. Pazarlama şablonunda abonelikten çıkma butonu zorunludur (kapatılamaz).
 */
export function sablonCozumle(s: { kategori: string; durum: string; bilesenler: MetaSablonBileseni[] }): SablonCozumu {
  const degiskenler: SablonDegiskeni[] = [];
  const nedenler: string[] = [];
  let abonelikButonu = false;
  for (const b of s.bilesenler) {
    const tur = b.type.toUpperCase();
    if (tur === "HEADER") {
      const bicim = (b.format ?? "TEXT").toUpperCase();
      if (bicim !== "TEXT") nedenler.push(`Medya başlık (${bicim}) desteklenmiyor`);
      for (const m of (b.text ?? "").matchAll(DEGISKEN_DESENI)) degiskenler.push({ bilesen: "header", ad: m[1] });
    } else if (tur === "BODY") {
      for (const m of (b.text ?? "").matchAll(DEGISKEN_DESENI)) {
        if (!degiskenler.some((d) => d.bilesen === "body" && d.ad === m[1])) degiskenler.push({ bilesen: "body", ad: m[1] });
      }
    } else if (tur === "BUTTONS") {
      for (const buton of b.buttons ?? []) {
        const bt = buton.type.toUpperCase();
        if (cikisButonuMu(buton)) abonelikButonu = true;
        if (bt === "URL" && buton.url && DEGISKEN_VAR.test(buton.url)) nedenler.push("Dinamik URL butonu desteklenmiyor");
        if (!["QUICK_REPLY", "URL", "PHONE_NUMBER"].includes(bt)) nedenler.push(`${bt} butonu desteklenmiyor`);
      }
    } else if (tur !== "FOOTER") {
      nedenler.push(`${tur} bileşeni desteklenmiyor`);
    }
  }
  if (s.kategori.toUpperCase() === "MARKETING" && !abonelikButonu) {
    nedenler.unshift("Pazarlama şablonunda abonelikten çıkma (hızlı yanıt) butonu yok");
  }
  if (s.durum.toUpperCase() !== "APPROVED") nedenler.unshift(`Şablon onaylı değil (${s.durum})`);
  return { degiskenler, abonelikButonu, destekNedeni: nedenler.length ? [...new Set(nedenler)].join("; ") : null };
}
