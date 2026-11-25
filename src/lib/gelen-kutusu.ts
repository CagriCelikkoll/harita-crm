// Gelen kutusu (WhatsApp sohbetleri): istemci ve sunucuda ortak sabitler ve tipler. Veritabanına bağımlılığı yoktur.

export const SOHBET_DURUMLARI = ["acik", "kapali"] as const;
export type SohbetDurumu = (typeof SOHBET_DURUMLARI)[number];

export const MESAJ_YONLERI = ["gelen", "giden"] as const;
export type MesajYonu = (typeof MESAJ_YONLERI)[number];

/**
 * Mesajın kaynağı. musteri: kişinin yazdığı; temsilci: gelen kutusundan elle; bot ve telefon (Coexistence yansıması),
 * gecmis (geçmiş içe aktarma) sonraki gruplar için ayrılmıştır; kampanya: işçinin gönderdiği şablon.
 */
export const MESAJ_KAYNAKLARI = ["musteri", "temsilci", "bot", "kampanya", "telefon", "gecmis"] as const;
export type MesajKaynagi = (typeof MESAJ_KAYNAKLARI)[number];

/** Meta'nın ileti türleri (tanınmayan "unsupported" yazılır). */
export const SOHBET_MESAJ_TURLERI = [
  "text",
  "image",
  "video",
  "document",
  "audio",
  "sticker",
  "location",
  "button",
  "interactive",
  "template",
  "reaction",
  "contacts",
  "unsupported",
] as const;
export type SohbetMesajTuru = (typeof SOHBET_MESAJ_TURLERI)[number];
export const sohbetMesajTuru = (t: string | undefined): SohbetMesajTuru =>
  (SOHBET_MESAJ_TURLERI as readonly string[]).includes(t ?? "") ? (t as SohbetMesajTuru) : "unsupported";

/** Medya türleri; hepsi işçi tarafından indirilir (MEDYA_INDIRILEN_TURLER). */
export const MEDYA_TURLERI: readonly SohbetMesajTuru[] = ["image", "video", "document", "audio", "sticker"];

/** İşçinin indirdiği medya türleri ve her birinin en büyük boyutu (WhatsApp'ın kendi sınırları). */
export const MEDYA_AZAMI_BAYT = {
  image: 5 * 1024 * 1024,
  sticker: 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
} as const;
export type IndirilenMedyaTuru = keyof typeof MEDYA_AZAMI_BAYT;
export const MEDYA_INDIRILEN_TURLER = Object.keys(MEDYA_AZAMI_BAYT) as IndirilenMedyaTuru[];
export const medyaIndirilir = (t: SohbetMesajTuru): t is IndirilenMedyaTuru => (MEDYA_INDIRILEN_TURLER as string[]).includes(t);

/** Çalışma alanı başına indirilen medyanın toplam üst sınırı; dolunca yeni medya indirilmez. */
export const MEDYA_KOTA_BAYT = 5 * 1024 * 1024 * 1024;

/**
 * bekliyor: işçi indirecek (geçici hatada yeniden dener); indirildi; hata: indirilemedi (Meta'daki süre doldu, kalıcı
 * hata ya da deneme hakkı bitti); reddedildi: tür, boyut, adres ya da özet (sha256) kurala uymadı; silindi: saklama
 * süresi doldu.
 */
export const MEDYA_DURUMLARI = ["bekliyor", "indirildi", "hata", "reddedildi", "silindi"] as const;
export type MedyaDurumu = (typeof MEDYA_DURUMLARI)[number];

/** Gösterim biçimi: görseller satır içi, ses ve video oynatıcıyla (dosya olarak iner), belge indirme bağlantısıyla. */
export type MedyaGorunumu = "gorsel" | "ses" | "video" | "belge";

/**
 * MIME beyaz listesi (Content-Type bu listeden verilir, dosyanın içeriğinden değil). SVG, HTML ve betik içerebilecek
 * hiçbir tür yoktur. Görsel türleri belge olarak gönderilse de görsel olarak gösterilir.
 */
export const MEDYA_MIME_TURLERI: Record<string, { gorunum: MedyaGorunumu; uzanti: string }> = {
  "image/jpeg": { gorunum: "gorsel", uzanti: "jpg" },
  "image/png": { gorunum: "gorsel", uzanti: "png" },
  "image/webp": { gorunum: "gorsel", uzanti: "webp" },
  "audio/ogg": { gorunum: "ses", uzanti: "ogg" },
  "audio/mpeg": { gorunum: "ses", uzanti: "mp3" },
  "audio/mp4": { gorunum: "ses", uzanti: "m4a" },
  "audio/aac": { gorunum: "ses", uzanti: "aac" },
  "audio/amr": { gorunum: "ses", uzanti: "amr" },
  "video/mp4": { gorunum: "video", uzanti: "mp4" },
  "video/3gpp": { gorunum: "video", uzanti: "3gp" },
  "application/pdf": { gorunum: "belge", uzanti: "pdf" },
  "text/plain": { gorunum: "belge", uzanti: "txt" },
  "application/msword": { gorunum: "belge", uzanti: "doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { gorunum: "belge", uzanti: "docx" },
  "application/vnd.ms-excel": { gorunum: "belge", uzanti: "xls" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { gorunum: "belge", uzanti: "xlsx" },
  "application/vnd.ms-powerpoint": { gorunum: "belge", uzanti: "ppt" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { gorunum: "belge", uzanti: "pptx" },
};

/** "audio/ogg; codecs=opus" → "audio/ogg"; listede yoksa null. */
export function medyaMimeSadelestir(mime: string | null | undefined): string | null {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  return Object.hasOwn(MEDYA_MIME_TURLERI, m) ? m : null;
}

// --- Giden medya (gelen kutusundan dosya gönderme) ---

/** Gelen kutusundan gönderilebilen medya türleri (Meta ileti türü). */
export type GidenMedyaTuru = "image" | "video" | "document";

const MB_ = 1024 * 1024;
/**
 * WhatsApp Cloud API kuralları: görsel JPEG/PNG ≤ 5 MB; video MP4 / 3GP (H.264 + AAC) ≤ 16 MB; belge ≤ 20 MB (Meta 100 MB
 * kabul eder; sunucunun gövde sınırı 25 MB olduğu için 20 MB). Uzantı → MIME; tür dosyanın içeriğinden ayrıca doğrulanır.
 */
export const GIDEN_MEDYA_KURALLARI: Record<GidenMedyaTuru, { azami: number; ad: string; uzantilar: Record<string, string> }> = {
  image: { azami: 5 * MB_, ad: "Görsel", uzantilar: { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" } },
  video: { azami: 16 * MB_, ad: "Video", uzantilar: { mp4: "video/mp4", "3gp": "video/3gpp" } },
  document: {
    azami: 20 * MB_,
    ad: "Belge",
    uzantilar: {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain",
    },
  },
};
/** Bir gönderimde en fazla dosya; açıklamanın (caption) en fazla uzunluğu (Meta: 1024). */
export const EK_AZAMI = 10;
export const ACIKLAMA_AZAMI = 1024;
/** Dosya seçicilerin accept değerleri: telefonda görsel/video seçicisi kamera ve galeriyi önerir. */
export const GORSEL_VIDEO_ACCEPT = "image/jpeg,image/png,video/mp4,video/3gpp,.jpg,.jpeg,.png,.mp4,.3gp";
export const BELGE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";

export const dosyaUzantisi = (ad: string) => (/\.([A-Za-z0-9]{1,5})$/.exec(ad.trim())?.[1] ?? "").toLowerCase();

/** Uzantının gösterdiği tür ve MIME; desteklenmiyorsa null. */
export function uzantiTuru(ad: string): { tur: GidenMedyaTuru; mime: string } | null {
  const u = dosyaUzantisi(ad);
  for (const tur of Object.keys(GIDEN_MEDYA_KURALLARI) as GidenMedyaTuru[]) {
    const mime = GIDEN_MEDYA_KURALLARI[tur].uzantilar[u];
    if (mime) return { tur, mime };
  }
  return null;
}

export const DESTEKLENMEYEN_DOSYA_METNI =
  "Bu dosya türü gönderilemez. Görsel: JPEG, PNG · Video: MP4, 3GP · Belge: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT.";

/** Yüklemeden önce (tarayıcıda; sunucu da aynısını uygular): uzantı ve boyut. Hata metni kullanıcıya gösterilir. */
export function gidenMedyaOnKontrol(ad: string, boyut: number): { tamam: true; tur: GidenMedyaTuru; mime: string } | { tamam: false; hata: string } {
  const t = uzantiTuru(ad);
  if (!t) return { tamam: false, hata: DESTEKLENMEYEN_DOSYA_METNI };
  if (boyut <= 0) return { tamam: false, hata: "Dosya boş." };
  const k = GIDEN_MEDYA_KURALLARI[t.tur];
  if (boyut > k.azami) return { tamam: false, hata: `${k.ad} en fazla ${k.azami / MB_} MB olabilir (bu dosya ${(boyut / MB_).toFixed(1)} MB).` };
  return { tamam: true, ...t };
}

/** Meta'nın medya hatalarının kullanıcı metni (gönderim yanıtında ya da teslim bildiriminde). */
export function medyaGonderimHataMetni(kod: number | null | undefined): string | null {
  switch (kod) {
    case 131053:
      return "Meta dosyayı işleyemedi (tür, boyut ya da kodlama WhatsApp'a uygun değil). Dosyayı kontrol edip tekrar deneyin.";
    case 131052:
      return "Meta dosyayı indiremedi. Tekrar deneyin.";
    case 131047:
      return "Meta: 24 saatlik pencere kapanmış. Onaylı bir şablon gönderin.";
    case 131026:
      return "Bu kişide WhatsApp yok ya da ileti teslim edilemiyor.";
    default:
      return null;
  }
}

export type MedyaDto = {
  id: string;
  durum: MedyaDurumu;
  gorunum: MedyaGorunumu | null;
  dosyaAdi: string | null;
  boyut: number | null;
  /** Gösterilemiyorsa nedeni (kullanıcıya). */
  neden: string | null;
};

export const MESAJ_TUR_ADLARI: Record<SohbetMesajTuru, string> = {
  text: "Metin",
  image: "Fotoğraf",
  video: "Video",
  document: "Belge",
  audio: "Ses kaydı",
  sticker: "Çıkartma",
  location: "Konum",
  button: "Buton yanıtı",
  interactive: "Seçim yanıtı",
  template: "Şablon",
  reaction: "Tepki",
  contacts: "Kişi kartı",
  unsupported: "Desteklenmeyen ileti",
};

/**
 * Teslim durumu. sent/delivered/read/failed Meta'nın bildirimleridir (yalnızca ileri gider); gonderildi: Meta kabul
 * etti, henüz bildirim yok; belirsiz: istek gitti ama sonucu bilinmiyor (tekrar denenmez).
 */
export const TESLIM_ADLARI: Record<string, string> = {
  gonderildi: "Gönderildi",
  sent: "Gönderildi",
  delivered: "İletildi",
  read: "Okundu",
  failed: "İletilemedi",
  belirsiz: "Gönderilemedi, durum belirsiz",
};

/** Müşteri hizmeti penceresi: kişinin son mesajından itibaren 24 saat (numara başına). */
export const PENCERE_SAAT = 24;
export const PENCERE_MS = PENCERE_SAAT * 3_600_000;

export function pencereBitisi(sonGelen: Date | null | undefined): Date | null {
  return sonGelen ? new Date(sonGelen.getTime() + PENCERE_MS) : null;
}
export function pencereAcik(sonGelen: Date | null | undefined, simdi = new Date()): boolean {
  return Boolean(sonGelen && simdi.getTime() < sonGelen.getTime() + PENCERE_MS);
}

/** Metin yanıtının en fazla uzunluğu (Meta: 4096). */
export const YANIT_AZAMI = 4096;
export const SOHBET_SAYFA_BOYUTU = 50;
export const MESAJ_SAYFA_BOYUTU = 100;
export const NOT_AZAMI = 2000;

export const VARSAYILAN_MESAJ_SAKLAMA_GUN = 365;
export const VARSAYILAN_MEDYA_SAKLAMA_GUN = 90;

export const RET_UYARISI = "RET verdi: yalnızca sorusuna yanıt verin, pazarlama içeriği göndermeyin";

// --- API yanıt tipleri (istemci bileşenleri kullanır) ---

export type SohbetOzetiDto = {
  id: string;
  baglantiId: string;
  numara: string;
  leadId: string;
  ad: string;
  telefon: string | null;
  durum: SohbetDurumu;
  atananKullanici: string | null;
  atananAd: string | null;
  sonMesaj: string | null;
  sonMesajTarihi: string | null;
  sonGelenTarihi: string | null;
  okunmamis: number;
  surum: number;
};

export type SohbetMesajiDto = {
  id: string;
  yon: MesajYonu;
  kaynak: MesajKaynagi;
  tur: SohbetMesajTuru;
  metin: string | null;
  /** Metin saklama süresi dolduğu için boşaltıldı. */
  icerikSilindi: boolean;
  /** Fotoğraf, video, belge, ses: indirme durumu. Medyasız iletide null. */
  medya: MedyaDto | null;
  gonderen: string | null;
  kampanyaId: string | null;
  /** Görselli şablonla gönderilen kampanya iletisinde başlık görselinin adresi (balonda küçük resim). */
  sablonGorseli?: string | null;
  teslimDurumu: string | null;
  teslimHataKodu: number | null;
  /** Gönderilemeyen mesajın nedeni (kullanıcıya; ör. Meta medya hatası). */
  hataMetni: string | null;
  /** Gönderilemeyen medya mesajı dosyası duruyor: "Tekrar dene" gösterilir. */
  tekrarDenenebilir: boolean;
  /** Yanıtlanan mesaj (context.message_id): alıntı kutusu. Mesaj bulunamadıysa id null. */
  yanit: { id: string | null; yon: MesajYonu | null; ozet: string } | null;
  tarih: string;
  surum: number;
};

export type SohbetNotuDto = { id: string; kullanici: string | null; metin: string; tarih: string };

export type SohbetAyrintiDto = SohbetOzetiDto & {
  /** Kişinin izin durumu: var | yok | ret (WhatsApp) ya da kaydın ileti reddi. */
  izin: "var" | "yok" | "ret";
  /** İzin 'var' ise kaynağının adı (ör. "WhatsApp sohbeti"). */
  izinKaynagi: string | null;
  bireysel: boolean;
  /** Bireysel alıcıda izin İYS'ye kaydedildi beyanı. */
  iysBeyani: boolean;
  /** Çalışma alanının İYS kontrolü; kapalıysa İYS beyanı aranmaz ve panelde uyarı gösterilir. */
  iysKontrolu: boolean;
  /** Kayıt Click-to-WhatsApp reklamından açıldı ("Reklamdan yazdı"). */
  reklamdan: boolean;
  retVerdi: boolean;
  pencereBitis: string | null;
  testModu: boolean;
  numaraKilitli: string | null;
};

/** Mesajın kısa hali (liste satırı). */
/** Şablon iletisinin sohbet balonundaki parçaları (lib/whatsapp-api sablonMetni çıktısından). */
export type SablonBalonu = {
  /** Başlıkta görsel / video / belge var ("[Görsel]" …). */
  baslikMedyasi: "Görsel" | "Video" | "Belge" | null;
  /** Metin başlığı (sablonMetni *…* ile yazar; yıldızlar atılmış). */
  baslik: string | null;
  govde: string;
  /** Alt bilgi (sablonMetni _…_ ile yazar; alt çizgiler atılmış). */
  altbilgi: string | null;
  butonlar: string[];
};

const BUTON_SATIRI = /^(\[[^\]\n]+\]\s*)+$/;

/**
 * sablonMetni çıktısını ("[Görsel]\n\n*Başlık*\n\nGövde\n\n_Alt bilgi_\n\n[Buton 1] [Buton 2]") balon parçalarına
 * ayırır. Tanınmayan biçimde metnin tamamı gövde olur (eski / elle yazılmış metinler bozulmaz).
 */
export function sablonParcala(metin: string): SablonBalonu {
  const bloklar = metin.split(/\n{2,}/);
  const sonuc: SablonBalonu = { baslikMedyasi: null, baslik: null, govde: "", altbilgi: null, butonlar: [] };
  const ilk = bloklar[0]?.trim();
  const medya = ilk?.match(/^\[(Görsel|Video|Belge)\]$/);
  if (medya) {
    sonuc.baslikMedyasi = medya[1] as SablonBalonu["baslikMedyasi"];
    bloklar.shift();
  }
  const son = bloklar.at(-1)?.trim();
  if (bloklar.length > 1 && son && BUTON_SATIRI.test(son)) {
    sonuc.butonlar = [...son.matchAll(/\[([^\]\n]+)\]/g)].map((m) => m[1].trim());
    bloklar.pop();
  }
  const altbilgi = bloklar.at(-1)?.trim();
  if (bloklar.length > 1 && altbilgi && /^_[^\n]+_$/.test(altbilgi)) {
    sonuc.altbilgi = altbilgi.slice(1, -1);
    bloklar.pop();
  }
  const baslik = bloklar[0]?.trim();
  if (bloklar.length > 1 && baslik && /^\*[^\n*]+\*$/.test(baslik)) {
    sonuc.baslik = baslik.slice(1, -1);
    bloklar.shift();
  }
  sonuc.govde = bloklar.join("\n\n");
  return sonuc;
}

/** WhatsApp biçim işaretlerini (*kalın*, _italik_, ~üstü çizili~, ```kod```) düz metinden kaldırır (önizleme). */
export const bicimIsaretleriniKaldir = (metin: string) =>
  metin.replace(/```([\s\S]+?)```/g, "$1").replace(/([*_~])(?=\S)([^*_~\n]*?\S)\1/g, "$2");

const kisalt = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}…` : s);

/**
 * Sohbet listesi ve alıntı kutusu için okunur özet: "🖼 Fotoğraf: açıklama", "📎 Belge: dosya.pdf", "🎤 Ses kaydı";
 * şablon iletisinde ham "[Görsel]" / buton satırı yerine gövde ("🖼 " önekiyle, görselliyse).
 */
export function mesajOzeti(m: { tur: SohbetMesajTuru; metin: string | null; icerikSilindi?: boolean; dosyaAdi?: string | null }): string {
  if (m.icerikSilindi) return "(içerik saklama süresi doldu)";
  const aciklama = m.metin?.trim() ? `: ${m.metin.trim()}` : "";
  switch (m.tur) {
    case "image":
      return kisalt(`🖼 Fotoğraf${aciklama}`);
    case "video":
      return kisalt(`🎬 Video${aciklama}`);
    case "document":
      return kisalt(`📎 Belge: ${m.dosyaAdi?.trim() || m.metin?.trim() || "dosya"}`);
    case "audio":
      return "🎤 Ses kaydı";
    case "sticker":
      return "Çıkartma";
    case "location":
      return kisalt(`📍 Konum${aciklama}`);
    case "template": {
      if (!m.metin) return "Şablon";
      const p = sablonParcala(m.metin);
      const govde = bicimIsaretleriniKaldir([p.baslik, p.govde].filter(Boolean).join(" · ")).replace(/\s+/g, " ").trim();
      return kisalt(`${p.baslikMedyasi === "Görsel" ? "🖼 " : p.baslikMedyasi ? "📎 " : ""}${govde || "Şablon"}`);
    }
    default:
      return m.metin ? kisalt(m.metin) : `[${MESAJ_TUR_ADLARI[m.tur]}]`;
  }
}

/** Gelen kutusu liste süzgeci (arama hariç adreste ve liste tercihinde tutulur; lib/liste-tercihi). */
export type GelenKutusuFiltresi = { numara: string; durum: "acik" | "kapali" | ""; atanan: "" | "ben" | "yok"; q: string };
export const VARSAYILAN_GELEN_KUTUSU_FILTRESI: GelenKutusuFiltresi = { numara: "", durum: "acik", atanan: "", q: "" };

/**
 * Adres / tercih biçiminden süzgeç: durum=acik|kapali|tum, atanan=ben|yok, numara=<bağlantı>. Numara yalnızca
 * çalışma alanında hâlâ varsa ve birden çok numara varsa (sekmeler yalnızca o zaman görünür) uygulanır: görünmeyen bir
 * süzgeç listeyi sessizce daraltmasın.
 */
export function gelenKutusuFiltresiCoz(al: (ad: string) => string | null | undefined, numaralar: readonly string[]): GelenKutusuFiltresi {
  const numara = al("numara") ?? "";
  const durum = al("durum");
  const atanan = al("atanan");
  return {
    numara: numaralar.length > 1 && numaralar.includes(numara) ? numara : "",
    durum: durum === "kapali" ? "kapali" : durum === "tum" ? "" : "acik",
    atanan: atanan === "ben" || atanan === "yok" ? atanan : "",
    q: "",
  };
}

/** Süzgecin adres / tercih biçimi (arama hariç). Durum her zaman yazılır: adres hiçbir zaman "tercihsiz" görünmez. */
export function gelenKutusuTercihi(f: GelenKutusuFiltresi): Record<string, string> {
  return { ...(f.numara ? { numara: f.numara } : {}), durum: f.durum || "tum", ...(f.atanan ? { atanan: f.atanan } : {}) };
}
