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

/** Limit katmanının sade adı: TIER_10K → "Günde 10.000 kişi" (24 saatte farklı alıcı), TIER_UNLIMITED → "Sınırsız". */
export function limitKatmaniAdi(katman: string | null | undefined): string {
  const n = limitKatmaniSayisi(katman);
  if (n === null) return katman ? "Bilinmiyor" : "—";
  return n === Number.POSITIVE_INFINITY ? "Sınırsız" : `Günde ${n.toLocaleString("tr")} kişi`;
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

// --- Kampanya: şablon değişkenlerinin değerleri ---

export const DEGISKEN_KAYNAKLARI = ["isletme_adi", "yetkili_adi", "sabit"] as const;
export type DegiskenKaynagi = (typeof DEGISKEN_KAYNAKLARI)[number];
export const DEGISKEN_KAYNAK_ADLARI: Record<DegiskenKaynagi, string> = {
  isletme_adi: "Kaydın işletme adı",
  yetkili_adi: "Kaydın ad soyad / yetkili adı",
  sabit: "Sabit metin",
};
/** yedek: kayıtta değer boşsa kullanılır; o da yoksa alıcı "değişken boş" nedeniyle hariç tutulur. */
export type DegiskenAyari = { kaynak: DegiskenKaynagi; deger?: string; yedek?: string };
/** Anahtar: `${bilesen}:${ad}` (ör. "body:1", "header:ad"). */
export type DegiskenEslemi = Record<string, DegiskenAyari>;

export const degiskenAnahtari = (d: SablonDegiskeni) => `${d.bilesen}:${d.ad}`;

/** Meta parametre metni: satır sonu / sekme / art arda boşluk kabul etmez; tek boşluğa indirgenir. */
const parametreTemizle = (s: string) => s.replace(/\s+/g, " ").trim();

/** Kayıt için değişken değerleri; herhangi biri boş kalırsa null (alıcı hariç: degisken_bos). */
export function degiskenDegerleri(
  degiskenler: SablonDegiskeni[],
  eslem: DegiskenEslemi,
  kayit: { isletmeAdi: string | null; yetkiliAdi: string | null },
): Record<string, string> | null {
  const sonuc: Record<string, string> = {};
  for (const d of degiskenler) {
    const ayar = eslem[degiskenAnahtari(d)];
    if (!ayar) return null;
    const ham =
      ayar.kaynak === "sabit" ? ayar.deger : ayar.kaynak === "isletme_adi" ? kayit.isletmeAdi : kayit.yetkiliAdi;
    const deger = parametreTemizle(ham ?? "") || parametreTemizle(ayar.yedek ?? "");
    if (!deger) return null;
    sonuc[degiskenAnahtari(d)] = deger;
  }
  return sonuc;
}

/** Önizleme ve sandbox kaydı için şablonun düz metni (başlık, gövde, altbilgi, butonlar). */
export function sablonMetni(bilesenler: MetaSablonBileseni[], degerler: Record<string, string>): string {
  const doldur = (bilesen: "header" | "body", metin: string) =>
    metin.replace(DEGISKEN_DESENI, (_, ad: string) => degerler[`${bilesen}:${ad}`] ?? `{{${ad}}}`);
  const parcalar: string[] = [];
  for (const b of bilesenler) {
    const tur = b.type.toUpperCase();
    if (tur === "HEADER" && b.text) parcalar.push(`*${doldur("header", b.text)}*`);
    else if (tur === "BODY" && b.text) parcalar.push(doldur("body", b.text));
    else if (tur === "FOOTER" && b.text) parcalar.push(`_${b.text}_`);
    else if (tur === "BUTTONS") parcalar.push((b.buttons ?? []).map((x) => `[${x.text ?? x.type}]`).join(" "));
  }
  return parcalar.join("\n\n");
}

/** Cloud API template.components (yalnızca metin parametreleri; konumsal ya da adlandırılmış). */
export function sablonParametreleri(
  degiskenler: SablonDegiskeni[],
  degerler: Record<string, string>,
  adlandirilmis: boolean,
): { type: "header" | "body"; parameters: { type: "text"; text: string; parameter_name?: string }[] }[] {
  const sonuc = [];
  for (const bilesen of ["header", "body"] as const) {
    const liste = degiskenler.filter((d) => d.bilesen === bilesen);
    if (!liste.length) continue;
    const sirali = adlandirilmis ? liste : [...liste].sort((a, b) => Number(a.ad) - Number(b.ad));
    sonuc.push({
      type: bilesen,
      parameters: sirali.map((d) => ({
        type: "text" as const,
        text: degerler[degiskenAnahtari(d)],
        ...(adlandirilmis ? { parameter_name: d.ad } : {}),
      })),
    });
  }
  return sonuc;
}

// --- Webhook: ret kelimeleri ve reklam penceresi ---

/**
 * Gelen metin bunlardan biriyle TAM eşleşirse ret (K4): Türkçe büyük/küçük harf, baştaki/sondaki boşluk, art arda
 * boşluk ve sondaki noktalama yok sayılır. "iptal etmek istemiyorum" ret DEĞİLDİR.
 */
export const RET_KELIMELERI = ["RET", "DUR", "İPTAL", "STOP", "ABONELİKTEN ÇIK", "ÇIK"] as const;
const RET_SADE = new Set(RET_KELIMELERI.map((k) => sade(k)));

export function retMetniMi(metin: string | null | undefined): boolean {
  if (!metin) return false;
  const s = sade(metin.normalize("NFC")).replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").trim();
  return RET_SADE.has(s);
}

/**
 * Reklamdan (Click-to-WhatsApp) gelen kişinin ücretsiz giriş penceresi (FEP), saat. Meta'nın fiyat sayfası
 * "3 gün (72 saat)" der; geliştirici changelog'u (28.09.2026) koşullu olarak 7 güne kadar uzayabileceğini belirtir.
 * Rozet en az süreyi gösterir (K6).
 */
export const UCRETSIZ_PENCERE_SAAT = 72;

/** Teslim bildirimi sırası: durum yalnızca ileri gider. failed, teslim edilmiş/okunmuş iletinin üzerine yazılmaz. */
export const WHATSAPP_TESLIM_SIRASI: Record<string, number> = { sent: 1, failed: 2, delivered: 3, read: 4 };

/** Reklamdan gelen kişinin ücretsiz penceresi şu an açık mı. */
export const pencereAcikMi = (bitis: Date | null | undefined, simdi = new Date()) =>
  Boolean(bitis && bitis.getTime() > simdi.getTime());

/** Şablon metninin parçaları (değişkenler ayrı): kampanya formunda tam metni, değişkenleri vurgulayarak göstermek için. */
export type SablonParcasi = { metin: string } | { degisken: SablonDegiskeni };
export type SablonBolumu = { tur: "baslik" | "govde" | "altbilgi" | "butonlar"; parcalar: SablonParcasi[] };

export function sablonParcalari(bilesenler: MetaSablonBileseni[]): SablonBolumu[] {
  const bol = (bilesen: "header" | "body", metin: string): SablonParcasi[] => {
    const parcalar: SablonParcasi[] = [];
    let son = 0;
    for (const m of metin.matchAll(DEGISKEN_DESENI)) {
      if (m.index! > son) parcalar.push({ metin: metin.slice(son, m.index) });
      parcalar.push({ degisken: { bilesen, ad: m[1] } });
      son = m.index! + m[0].length;
    }
    if (son < metin.length) parcalar.push({ metin: metin.slice(son) });
    return parcalar;
  };
  const sonuc: SablonBolumu[] = [];
  for (const b of bilesenler) {
    const tur = b.type.toUpperCase();
    if (tur === "HEADER" && b.text) sonuc.push({ tur: "baslik", parcalar: bol("header", b.text) });
    else if (tur === "BODY" && b.text) sonuc.push({ tur: "govde", parcalar: bol("body", b.text) });
    else if (tur === "FOOTER" && b.text) sonuc.push({ tur: "altbilgi", parcalar: [{ metin: b.text }] });
    else if (tur === "BUTTONS") {
      sonuc.push({ tur: "butonlar", parcalar: [{ metin: (b.buttons ?? []).map((x) => `[${x.text ?? x.type}]`).join(" ") }] });
    }
  }
  return sonuc;
}
