// WhatsApp Business Platform (Cloud API) sabitleri ve saf yardımcılar. İstemci ve sunucuda ortak;
// veritabanına bağımlılığı yoktur.

/** Portföy mesajlaşma limitinin bu uygulamaya ayrılan payı (%), varsayılan. Limit portföydeki tüm araçlarca paylaşılır. */
export const VARSAYILAN_UYGULAMA_PAYI = 10;
/** Test modunda kampanyaların gidebileceği numara sayısı (Meta test numarasının alıcı listesiyle uyumlu). */
export const TEST_NUMARASI_AZAMI = 5;
/** Bir çalışma alanına bağlanabilecek WhatsApp numarası sayısı. */
export const BAGLANTI_AZAMI = 10;

/**
 * Ekranlarda numaranın kısa gösterimi: "Merkez · …4567" (görünen numaranın son 4 hanesi; numara bilgisi henüz
 * okunmadıysa yalnızca ad). Silinmiş numaraya bağlı kampanya için "Silinmiş numara".
 */
export function numaraEtiketi(b: { ad: string; gorunenNumara: string | null } | null | undefined): string {
  if (!b) return "Silinmiş numara";
  const rakam = (b.gorunenNumara ?? "").replace(/\D/g, "");
  return rakam.length >= 4 ? `${b.ad} · …${rakam.slice(-4)}` : b.ad;
}

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
 * Hesap düzeyinde gönderimi durduran Meta hata kodları (gönderim yanıtında ya da statuses webhook'unda) → duraklatma
 * nedeni. https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
 *  - 131031 "Business Account locked": WABA politika ihlali nedeniyle kısıtlandı/kapatıldı (ya da istekteki veri, ör. iki
 *    adımlı doğrulama PIN'i, hesaptakiyle doğrulanamadı).
 *  - 368 "Temporarily blocked for policies violations": WABA politika ihlali nedeniyle kısıtlandı/kapatıldı.
 *  - 131042 "Business eligibility payment issue": ödeme yöntemi sorunu (kredi limiti, ödeme hesabı yok; WABA askıya
 *    alındı ya da silindi de bu kodla gelir).
 * Bunlardan biri gelince çalışma alanının tüm WhatsApp kampanyaları duraklar ve kilit kalkana kadar hiçbir mesaj
 * gönderilmez (kuyruktakiler beklemede kalır, tekrar denenmez).
 */
export const HESAP_KILIDI_KODLARI: Record<number, "meta_hesap_kilitli" | "meta_odeme_sorunu"> = {
  131031: "meta_hesap_kilitli",
  368: "meta_hesap_kilitli",
  131042: "meta_odeme_sorunu",
};
export const hesapKilidiNedeni = (kod: number | null | undefined) => (kod == null ? null : (HESAP_KILIDI_KODLARI[kod] ?? null));

/** Ayarlar ve Panel'de yöneticiye gösterilen uyarı. */
export function hesapKilidiMesaji(kod: number): string {
  return hesapKilidiNedeni(kod) === "meta_odeme_sorunu"
    ? `Meta WhatsApp hesabınızda ödeme sorunu var (Meta ${kod}). Meta Business Suite'te WhatsApp hesabınızın ödeme yöntemini ve faturalandırma ayarlarını kontrol edin.`
    : "Meta WhatsApp hesabınız kilitlendi. Meta Business Suite > Business Support Home'dan nedenini görüp inceleme isteyin.";
}

/**
 * Numaranın Meta'daki durumu (GET /{phone-number-id} status): CONNECTED, PENDING, OFFLINE, DISCONNECTED, FLAGGED,
 * RATE_LIMITED, RESTRICTED, BANNED, UNVERIFIED… Numara WhatsApp Manager'da doğrulanıp Cloud API'ye kaydedilmeden
 * (register + 6 haneli PIN) CONNECTED olmaz ve mesaj gönderemez. "Bağlantıyı test et" CONNECTED dışındaki her durumda
 * başarısız olur; Meta alanı döndürmezse (null) durum bilinmiyor sayılır, test bu yüzden başarısız olmaz.
 */
export const META_BAGLI = "CONNECTED";

/** Bağlantı kartındaki Meta durumu rozeti; durum hiç okunmadıysa null. */
export function metaDurumuRozeti(durum: string | null | undefined): { etiket: string; ton: "ana" | "uyari" | "tehlike" } | null {
  if (!durum) return null;
  switch (durum) {
    case META_BAGLI:
      return { etiket: "Meta: Bağlı", ton: "ana" };
    case "PENDING":
      return { etiket: "Meta: Beklemede", ton: "uyari" };
    case "OFFLINE":
    case "DISCONNECTED":
      return { etiket: "Meta: Çevrimdışı", ton: "tehlike" };
    default:
      return { etiket: `Meta: ${durum}`, ton: "tehlike" };
  }
}

/** Bağlantı testinde numara CONNECTED değil. kodDogrulama: code_verification_status (VERIFIED değilse eklenir). */
export function numaraKayitsizMesaji(durum: string, kodDogrulama?: string | null): string {
  const kod = kodDogrulama && kodDogrulama !== "VERIFIED" ? ` Numara doğrulama durumu: ${kodDogrulama}.` : "";
  return (
    `Numara Meta'da henüz kayıtlı değil (durum: ${durum}). WhatsApp Manager'da numarayı doğrulayıp Cloud API'ye ` +
    `kaydedin (register + 6 haneli PIN), sonra tekrar test edin.${kod}`
  );
}

/**
 * Gönderimde numaranın Cloud API'ye kayıtlı olmadığını bildiren Meta hata kodları (133010 "Account not registered").
 * Numara düzeyidir: yalnızca bu numaranın kampanyaları duraklar. Hesap kilidi (HESAP_KILIDI_KODLARI) DEĞİLDİR; o, aynı
 * WABA'daki bütün numaraları ve gelen kutusunu kilitler ve kaldırılması hesap durumuna bağlıdır.
 */
export const NUMARA_KAYITSIZ_KODLARI: ReadonlySet<number> = new Set([133010]);
export const numaraKayitsizKoduMu = (kod: number | null | undefined) => kod != null && NUMARA_KAYITSIZ_KODLARI.has(kod);

/** Gönderim 133010 ile reddedildi: bağlantının "Son hata" satırı. */
export const numaraKayitsizGonderimMesaji = (kod: number) =>
  `Meta gönderimi reddetti: numara Cloud API'ye kayıtlı değil (Meta ${kod}). WhatsApp Manager'da numarayı doğrulayıp ` +
  `Cloud API'ye kaydedin (register + 6 haneli PIN), sonra "Bağlantıyı test et"e basın ve duraklatılan kampanyaları devam ettirin.`;

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

/** Limit katmanı bilinmiyorsa en düşük katman varsayılır. */
export const EN_DUSUK_LIMIT = 250;

/**
 * Meta portföy limitinin bu uygulamaya ayrılan payı (kayan 24 saatte şablon sayısı). Sınırsız katmanda Infinity.
 * Kampanya işçisi ve gelen kutusu aynı payı paylaşır.
 */
export function metaLimitPayi(b: { limitKatmani: string | null; uygulamaPayi: number }): number {
  const limit = limitKatmaniSayisi(b.limitKatmani) ?? EN_DUSUK_LIMIT;
  return Number.isFinite(limit) ? Math.max(1, Math.floor((limit * b.uygulamaPayi) / 100)) : limit;
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
 * Pazarlama şablonunda abonelikten çıkma butonu. WhatsApp Manager'ın hazır "Marketing opt-out" butonu şablon API'sinde
 * QUICK_REPLY olarak döner (metni "Stop promotions" ya da dile göre karşılığı, ör. "Promosyonları durdur"); elle
 * eklenen hızlı yanıt butonları da metinden tanınır. Türünde OPT_OUT geçen bir buton (Meta ileride ayrı bir tür
 * döndürürse) metnine bakılmadan çıkış butonu sayılır.
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

const OPT_OUT_TURU = /OPT_?OUT/;

export function cikisButonuMu(buton: { type: string; text?: string }): boolean {
  const tur = buton.type.toUpperCase();
  if (OPT_OUT_TURU.test(tur)) return true;
  return tur === "QUICK_REPLY" && !!buton.text && CIKIS_BUTONU_DESENI.test(sade(buton.text));
}

/** Gelen buton yanıtı (şablon hızlı yanıtı ya da etkileşimli buton) abonelikten çıkma mı: yük, metin, kimlik ve başlık ayrı ayrı denenir. */
export function cikisYanitiMi(adaylar: (string | null | undefined)[]): boolean {
  return adaylar.some((a) => !!a && (retMetniMi(a) || cikisButonuMu({ type: "QUICK_REPLY", text: a })));
}

const DEGISKEN_DESENI = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const DEGISKEN_VAR = /\{\{\s*[A-Za-z0-9_]+\s*\}\}/;

export type SablonCozumu = {
  degiskenler: SablonDegiskeni[];
  abonelikButonu: boolean;
  /** HEADER biçimi (TEXT, IMAGE, VIDEO, DOCUMENT, LOCATION); başlık yoksa null. */
  baslikBicimi: string | null;
  /** null: kampanyada kullanılabilir; değilse nedeni. */
  destekNedeni: string | null;
};

/** Kampanyada desteklenen tek medya başlık biçimi (tek görsel). */
export const GORSEL_BASLIK = "IMAGE";

const bicimi = (b: MetaSablonBileseni) => (b.format ?? "TEXT").toUpperCase();

/** Bileşenlerden HEADER biçimi (başlık yoksa null): 0026 öncesi satırda baslik_bicimi boş kalsa da doğru gösterilir. */
export function baslikBicimiBul(bilesenler: MetaSablonBileseni[]): string | null {
  const b = bilesenler.find((x) => x.type.toUpperCase() === "HEADER");
  return b ? bicimi(b) : null;
}

/** Şablon listesindeki rozet: görselli (IMAGE), desteklenmeyen medya başlık (video, belge, konum) ya da yok. */
export function medyaBaslikRozeti(baslikBicimi: string | null | undefined): { etiket: string; ton: "ana" | "uyari" } | null {
  if (!baslikBicimi || baslikBicimi === "TEXT") return null;
  return baslikBicimi === GORSEL_BASLIK ? { etiket: "Görselli", ton: "ana" } : { etiket: "Desteklenmiyor", ton: "uyari" };
}

/**
 * Şablonu kampanya açısından çözümler. Metin başlık ve gövde değişkenleri ile tek görselli (IMAGE) başlık desteklenir
 * (görsel kampanyada yüklenir); video/belge başlık, konum, dinamik URL butonu, kopyalanabilir kod, katalog/akış gibi
 * parametre isteyen bileşenler desteklenmez. Pazarlama şablonunda abonelikten çıkma butonu zorunludur (kapatılamaz).
 */
export function sablonCozumle(s: { kategori: string; durum: string; bilesenler: MetaSablonBileseni[] }): SablonCozumu {
  const degiskenler: SablonDegiskeni[] = [];
  const nedenler: string[] = [];
  let abonelikButonu = false;
  let baslikBicimi: string | null = null;
  for (const b of s.bilesenler) {
    const tur = b.type.toUpperCase();
    if (tur === "HEADER") {
      const bicim = bicimi(b);
      baslikBicimi = bicim;
      if (bicim !== "TEXT" && bicim !== GORSEL_BASLIK) nedenler.push(`Medya başlık (${bicim}) desteklenmiyor`);
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
        if (!["QUICK_REPLY", "URL", "PHONE_NUMBER"].includes(bt) && !OPT_OUT_TURU.test(bt)) nedenler.push(`${bt} butonu desteklenmiyor`);
      }
    } else if (tur !== "FOOTER") {
      nedenler.push(`${tur} bileşeni desteklenmiyor`);
    }
  }
  if (s.kategori.toUpperCase() === "MARKETING" && !abonelikButonu) {
    nedenler.unshift("Pazarlama şablonunda abonelikten çıkma (hızlı yanıt) butonu yok");
  }
  if (s.durum.toUpperCase() !== "APPROVED") nedenler.unshift(`Şablon onaylı değil (${s.durum})`);
  return { degiskenler, abonelikButonu, baslikBicimi, destekNedeni: nedenler.length ? [...new Set(nedenler)].join("; ") : null };
}

// --- Görselli kampanya: görsel dosyası ve Meta medya kimliği ---

/** Kampanya görseli: yalnızca JPEG ve PNG, en fazla 5 MB (WhatsApp'ın görsel sınırı). */
export const KAMPANYA_GORSEL_AZAMI_BAYT = 5 * 1024 * 1024;
export const KAMPANYA_GORSEL_MIME = ["image/jpeg", "image/png"] as const;
export type KampanyaGorselMime = (typeof KAMPANYA_GORSEL_MIME)[number];

const PNG_IMZASI = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Dosyanın türü İMZASINDAN (ilk baytlar) belirlenir; dosya adı, uzantı ve tarayıcının bildirdiği tür dikkate alınmaz.
 * JPEG: FF D8 FF; PNG: 89 50 4E 47 0D 0A 1A 0A. Başka her şey null.
 */
export function gorselImzasi(b: Uint8Array): KampanyaGorselMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= PNG_IMZASI.length && PNG_IMZASI.every((x, i) => b[i] === x)) return "image/png";
  return null;
}

/**
 * Meta'ya /media ile yüklenen dosyanın kimliği yaklaşık 30 gün geçerlidir. Bu süreden eski kimlik kullanılmaz, görsel
 * yeniden yüklenir (uzun süren kampanyada süre dolmadan önce pay bırakılır).
 */
export const META_GORSEL_YENILEME_MS = 25 * 24 * 3600_000;

/**
 * Medya kaynaklı Meta hata kodları (gönderim yanıtında ya da teslim bildiriminde):
 *  - 131053 "Media upload error": iletideki medya yüklenemedi / işlenemedi (tür, boyut ya da süresi dolmuş kimlik).
 *  - 131052 "Media download error": medya indirilemedi.
 * Kampanyanın görselinden kaynaklanır: yalnızca o kampanya duraklar (sonraki alıcılar da aynı hatayla düşerdi), Meta
 * medya kimliği silinir; devam ettirilince görsel yeniden yüklenir.
 */
export const MEDYA_HATA_KODLARI: ReadonlySet<number> = new Set([131052, 131053]);
export const medyaHataKoduMu = (kod: number | null | undefined) => kod != null && MEDYA_HATA_KODLARI.has(kod);

/** Görselin Meta'ya yüklenmesi (/media) ya da gönderimde işlenmesi başarısız: bağlantının "Son hata" satırı. */
export function gorselHataMesaji(kod: number | null, ayrinti?: string | null): string {
  const neden =
    kod === 131052
      ? "Meta kampanya görselini indiremedi"
      : kod === 131053
        ? "Meta kampanya görselini işleyemedi"
        : "Kampanya görseli Meta'ya yüklenemedi";
  const meta = kod != null ? ` (Meta ${kod})` : "";
  const ek = ayrinti ? `: ${ayrinti.slice(0, 160)}` : "";
  return `${neden}${meta}${ek}. Görselin JPEG ya da PNG ve en fazla 5 MB olduğunu kontrol edin; kampanyayı devam ettirince görsel yeniden yüklenir.`;
}

/** Kampanya ayrıntısında teslim hata kodunun kısa açıklaması (bilinmiyorsa null). */
export function teslimHataAciklamasi(kod: number | null | undefined): string | null {
  if (kod === 131053) return "görsel işlenemedi";
  if (kod === 131052) return "görsel indirilemedi";
  if (kod === 133010) return "numara Cloud API'ye kayıtlı değil";
  return null;
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
    if (tur === "HEADER" && bicimi(b) === GORSEL_BASLIK) parcalar.push("[Görsel]");
    else if (tur === "HEADER" && b.text) parcalar.push(`*${doldur("header", b.text)}*`);
    else if (tur === "BODY" && b.text) parcalar.push(doldur("body", b.text));
    else if (tur === "FOOTER" && b.text) parcalar.push(`_${b.text}_`);
    else if (tur === "BUTTONS") parcalar.push((b.buttons ?? []).map((x) => `[${x.text ?? x.type}]`).join(" "));
  }
  return parcalar.join("\n\n");
}

export type MetinParametresi = { type: "text"; text: string; parameter_name?: string };
export type GorselParametresi = { type: "image"; image: { id: string } };
export type SablonBileseniParametreleri = { type: "header" | "body"; parameters: (MetinParametresi | GorselParametresi)[] };

/**
 * Cloud API template.components: metin parametreleri (konumsal ya da adlandırılmış). Görselli şablonda başlık
 * parametresi Meta'ya yüklenmiş görselin kimliğidir: { type: "header", parameters: [{ type: "image", image: { id } }] }.
 */
export function sablonParametreleri(
  degiskenler: SablonDegiskeni[],
  degerler: Record<string, string>,
  adlandirilmis: boolean,
  gorsel?: { metaId: string } | null,
): SablonBileseniParametreleri[] {
  const sonuc: SablonBileseniParametreleri[] = [];
  if (gorsel) sonuc.push({ type: "header", parameters: [{ type: "image", image: { id: gorsel.metaId } }] });
  for (const bilesen of ["header", "body"] as const) {
    const liste = degiskenler.filter((d) => d.bilesen === bilesen);
    // Görsel başlıkta metin değişkeni olmaz (Meta IMAGE başlığa metin koymaz).
    if (!liste.length || (bilesen === "header" && gorsel)) continue;
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
export type SablonBolumu = { tur: "gorsel" | "baslik" | "govde" | "altbilgi" | "butonlar"; parcalar: SablonParcasi[] };

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
    if (tur === "HEADER" && bicimi(b) === GORSEL_BASLIK) sonuc.push({ tur: "gorsel", parcalar: [{ metin: "[Görsel]" }] });
    else if (tur === "HEADER" && b.text) sonuc.push({ tur: "baslik", parcalar: bol("header", b.text) });
    else if (tur === "BODY" && b.text) sonuc.push({ tur: "govde", parcalar: bol("body", b.text) });
    else if (tur === "FOOTER" && b.text) sonuc.push({ tur: "altbilgi", parcalar: [{ metin: b.text }] });
    else if (tur === "BUTTONS") {
      sonuc.push({ tur: "butonlar", parcalar: [{ metin: (b.buttons ?? []).map((x) => `[${x.text ?? x.type}]`).join(" ") }] });
    }
  }
  return sonuc;
}

// --- Ayarlar > WhatsApp (Meta): kurulum adımları ---
export type KurulumAdimDurumu = "tamam" | "etkin" | "bekliyor" | "kilitli";

/**
 * Dört kurulum adımının durumu; mevcut bağlantı ve test modu kilidi verisinden türetilir (yeni durum saklanmaz):
 * 1. Hesabı bağla: bilgiler kayıtlı ve numara bu WhatsApp hesabına ait.
 * 2. Bildirim adresini doğrula: Meta webhook doğrulaması (kilidin 1. koşulu).
 * 3. Test numarasına kampanya gönder: imzası doğrulanmış bir durum bildirimi alındı (kilidin 2. koşulu).
 * 4. Test modunu kapat: 2. ve 3. adım tamamsa "etkin"; kapalıysa tamam. Gönderen bilgileri eksikse adım etkin kalır ama
 *    düğme pasiftir ve nedeni gösterilir (BaglantiDto.gonderenEksikleri; sunucu ayrıca reddeder).
 * Önceki adım bitmeden sonraki "bekliyor" görünür; 4. adım 2. ve 3. adım bitene kadar "kilitli".
 */
export function kurulumAdimlari(b: {
  tanimli: boolean;
  numaraDogrulandi: boolean;
  webhookDogrulandi: boolean;
  imzaliDurumAlindi: boolean;
  testModu: boolean;
}): [KurulumAdimDurumu, KurulumAdimDurumu, KurulumAdimDurumu, KurulumAdimDurumu] {
  const bir = b.tanimli && b.numaraDogrulandi;
  const iki = b.tanimli && b.webhookDogrulandi;
  const uc = b.tanimli && b.imzaliDurumAlindi;
  return [
    bir ? "tamam" : "etkin",
    iki ? "tamam" : bir ? "etkin" : "bekliyor",
    uc ? "tamam" : bir && iki ? "etkin" : "bekliyor",
    b.tanimli && !b.testModu ? "tamam" : iki && uc ? "etkin" : "kilitli",
  ];
}
