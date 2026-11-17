// Kişi içe aktarma (CSV / XLSX). Akış: dosya → oturum (satırlar geçici saklanır) → sütun eşleme → önizleme
// (hiçbir şey yazmadan rapor) → uygulama (tek transaction). Satır doğrulaması her iki adımda da aynı fonksiyonla
// yapılır; istemciden gelen hiçbir sayıya güvenilmez.
import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { epostaNormallestir, telefonNormallestir } from "@/lib/adres-normal";
import {
  basligiSadelestir,
  eslemOner,
  ICE_AKTARMA_ALANLARI,
  ICE_AKTARMA_AZAMI_BAYT,
  ICE_AKTARMA_AZAMI_MB,
  ICE_AKTARMA_AZAMI_SATIR,
  ICE_AKTARMA_OTURUM_DAKIKA,
  XLSX_AZAMI_ACIK_BAYT,
  XLSX_AZAMI_DOSYA,
  type CakismaPolitikasi,
  type IceAktarmaAlani,
  type IceAktarmaBicimi,
  type SatirSorunu,
  type SutunEslemi,
} from "@/lib/ice-aktarma";
import { RET_ONAYI_GEREKLI, type AliciTuru, type WhatsappIzinKaynagi } from "@/lib/mesajlasma";
import { adresOzeti } from "../messaging/adres";
import type { TenantContext } from "../repo/baglam";
import { engelliOzetler, retIsle } from "../repo/engel-listesi";
import {
  iceAktarmaGetir,
  iceAktarmaOlustur,
  iceAktarmaUygula,
  type IceAktarmaPlani,
  type IzinBilgisi,
} from "../repo/ice-aktarmalar";
import { telefonlaKayitlar, type YeniKisi } from "../repo/kayitlar";
import { zipDenetle } from "../zip-denetimi";
import { GOOGLE_ESLEMI, googleBicimi, googleEtiketiSadelestir, googleOnIsle } from "./google-kisiler";

const AZAMI_SUTUN = 50;
const GOOGLE_AZAMI_SUTUN = 250;
const ORNEK_SATIR = 20;
/** Google biçiminde dönüşmüş halin önizlemesi. */
const GOOGLE_ORNEK_SATIR = 50;
const RAPOR_AZAMI_SORUN = 200;

export class IceAktarmaHatasi extends Error {
  constructor(
    mesaj: string,
    readonly kod: "dosya" | "bulunamadi" | "beyan" | "ret" | "eslem" = "dosya",
  ) {
    super(mesaj);
    this.name = "IceAktarmaHatasi";
  }
}

// --- Dosya ayrıştırma ---

function metinCoz(bayt: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bayt).replace(/^﻿/, "");
  } catch {
    // Türkçe Excel'in "CSV" çıktısı çoğunlukla Windows-1254'tür.
    return new TextDecoder("windows-1254").decode(bayt);
  }
}

function hucreMetni(deger: ExcelJS.CellValue): string {
  if (deger === null || deger === undefined) return "";
  if (deger instanceof Date) return deger.toISOString().slice(0, 10);
  if (typeof deger === "object") {
    if ("text" in deger && typeof deger.text === "string") return deger.text; // köprü
    if ("richText" in deger) return deger.richText.map((p) => p.text).join("");
    if ("result" in deger) return hucreMetni(deger.result as ExcelJS.CellValue); // formül
    return "";
  }
  return String(deger);
}

/**
 * Dosyayı satırlara ayırır (ilk satır başlık). Boyut, satır ve sütun sınırları burada uygulanır. Google Kişiler
 * dışa aktarması çok sütunludur (her telefon / adres / e-posta ayrı sütun): ön işlemde 7 sütuna indiği için onun
 * sütun sınırı daha geniştir.
 */
export async function dosyaAyristir(dosyaAdi: string, bayt: Uint8Array): Promise<string[][]> {
  if (bayt.byteLength === 0) throw new IceAktarmaHatasi("Dosya boş.");
  if (bayt.byteLength > ICE_AKTARMA_AZAMI_BAYT) throw new IceAktarmaHatasi(`Dosya en fazla ${ICE_AKTARMA_AZAMI_MB} MB olabilir.`);
  const uzanti = dosyaAdi.toLowerCase().split(".").pop();
  let satirlar: string[][];
  if (uzanti === "csv" || uzanti === "txt") {
    const sonuc = Papa.parse<string[]>(metinCoz(bayt), { skipEmptyLines: "greedy" });
    satirlar = sonuc.data.map((s) => s.map((h) => String(h ?? "")));
  } else if (uzanti === "xlsx") {
    // Sıkıştırma bombası: ayrıştırmadan ÖNCE açılmış boyut ve dosya sayısı denetlenir.
    const zip = zipDenetle(bayt, { azamiAcikBayt: XLSX_AZAMI_ACIK_BAYT, azamiDosya: XLSX_AZAMI_DOSYA });
    if (!zip.tamam) {
      throw new IceAktarmaHatasi(
        zip.neden === "boyut"
          ? `XLSX dosyası açıldığında ${XLSX_AZAMI_ACIK_BAYT / 1024 / 1024} MB'ı aşıyor; dosyayı küçültün ya da CSV olarak kaydedin.`
          : zip.neden === "dosya_sayisi"
            ? `XLSX dosyasında çok fazla iç dosya var (en fazla ${XLSX_AZAMI_DOSYA}).`
            : "XLSX dosyası okunamadı.",
      );
    }
    const kitap = new ExcelJS.Workbook();
    try {
      await kitap.xlsx.load(bayt.buffer.slice(bayt.byteOffset, bayt.byteOffset + bayt.byteLength) as ArrayBuffer);
    } catch {
      throw new IceAktarmaHatasi("XLSX dosyası okunamadı.");
    }
    const sayfa = kitap.worksheets[0];
    if (!sayfa) throw new IceAktarmaHatasi("XLSX dosyasında sayfa yok.");
    satirlar = [];
    const sutunSayisi = Math.min(sayfa.columnCount, AZAMI_SUTUN + 1);
    sayfa.eachRow({ includeEmpty: false }, (satir) => {
      if (satirlar.length > ICE_AKTARMA_AZAMI_SATIR + 1) return;
      const hucreler: string[] = [];
      for (let i = 1; i <= sutunSayisi; i++) hucreler.push(hucreMetni(satir.getCell(i).value));
      if (hucreler.some((h) => h.trim())) satirlar.push(hucreler);
    });
  } else {
    throw new IceAktarmaHatasi("Yalnızca .csv ve .xlsx dosyaları desteklenir (eski .xls için Excel'de .xlsx olarak kaydedin).");
  }
  if (satirlar.length < 2) throw new IceAktarmaHatasi("Dosyada başlık satırından sonra veri yok.");
  if (satirlar.length - 1 > ICE_AKTARMA_AZAMI_SATIR) {
    throw new IceAktarmaHatasi(`Tek seferde en fazla ${ICE_AKTARMA_AZAMI_SATIR.toLocaleString("tr")} satır içe aktarılabilir.`);
  }
  const genislik = satirlar.reduce((a, s) => Math.max(a, s.length), 0);
  const azami = googleBicimi(satirlar[0]) ? GOOGLE_AZAMI_SUTUN : AZAMI_SUTUN;
  if (genislik > azami) throw new IceAktarmaHatasi(`En fazla ${azami} sütun desteklenir.`);
  return satirlar.map((s) => Array.from({ length: genislik }, (_, i) => (s[i] ?? "").trim()));
}

// --- Oturum ---

/**
 * Dosyayı ayrıştırır ve oturumu açar. Google Kişiler biçimi başlıklardan tanınırsa satırlar ön işlemden geçer
 * (bizim sütunlarımız, telefon seçimi, dosya içi birleştirme) ve eşleme hazır gelir.
 */
export async function iceAktarmaBaslat(ctx: TenantContext, dosyaAdi: string, bayt: Uint8Array) {
  const ham = await dosyaAyristir(dosyaAdi, bayt);
  const google = googleBicimi(ham[0]);
  const on = google ? googleOnIsle(ham) : null;
  const satirlar = on?.satirlar ?? ham;
  const oturum = iceAktarmaOlustur(ctx, {
    dosyaAdi: dosyaAdi.slice(0, 200),
    satirlar,
    bicim: google ? "google" : "genel",
    birlesen: on?.birlesen ?? 0,
  });
  return {
    id: oturum.id,
    dosyaAdi: oturum.dosyaAdi,
    bicim: oturum.bicim,
    /** Google biçiminin türü (yeni / eski); genel dosyada null. */
    googleBicimi: google,
    basliklar: satirlar[0],
    ornek: satirlar.slice(1, 1 + (google ? GOOGLE_ORNEK_SATIR : ORNEK_SATIR)),
    /** Dosyadaki veri satırı; Google biçiminde birleşmeden önce. */
    dosyaSatiri: ham.length - 1,
    toplam: oturum.toplam,
    birlesen: oturum.birlesen,
    /** Google etiketleri (sistem grupları hariç): etiket eşleme ekranı için. */
    googleEtiketleri: on?.etiketler ?? [],
    onerilenEslem: google ? GOOGLE_ESLEMI : eslemOner(satirlar[0]),
  };
}

// --- Satır doğrulama ---

export type IceAktarmaSecenekleri = {
  cakisma: CakismaPolitikasi;
  /**
   * Alıcı türü sütunu eşlenmemişse ya da hücre boşsa kullanılacak tür. Varsayılan yoktur: sütun eşlenmemişse
   * kullanıcı tüm dosya için seçmek zorundadır (null ise içe aktarma reddedilir); sütun eşliyse boş hücre hatalı satırdır.
   */
  varsayilanAliciTuru: AliciTuru | null;
  /** İzin sütununda 'var' olup kaynak sütunu boş/eşlenmemiş satırlar için. */
  varsayilanIzinKaynagi: WhatsappIzinKaynagi | null;
  /** Bireysel kişilerin izinleri İYS'ye kaydedildi beyanı. */
  iysBeyani: boolean;
  /** WhatsApp izni sütunu eşlenmemişse tüm dosya için izin (toplu seçim; Google biçimi). Varsayılan "yok". */
  varsayilanIzin?: "yok" | "var";
  /**
   * Etiket eşleme: dosyadaki etiket (küçük harf) → yeni ad; null ya da boş: yok sayılır. Eşlenmeyen etiket aynen
   * alınır.
   */
  etiketEslemi?: Record<string, string | null>;
};

type Baglam = { bicim: IceAktarmaBicimi };

type GecerliSatir = {
  satir: number;
  kisi: YeniKisi;
  telefon: string | null;
  eposta: string | null;
  izin: "var" | "yok" | "ret";
  izinBilgisi: IzinBilgisi | null;
  /** Satır alınır ama izin yazılmaz (ör. bireysel + İYS beyanı yok, Google biçimi). */
  uyari: string | null;
};

const IZIN_VAR = new Set(["var", "evet", "e", "yes", "y", "1", "true", "x", "onayli", "onay", "izinli", "✓"]);
const IZIN_YOK = new Set(["", "yok", "hayir", "h", "no", "n", "0", "false", "izinsiz", "bilinmiyor"]);
const IZIN_RET = new Set(["ret", "red", "reddetti", "istemiyor", "iptal", "abonelikten cikti"]);

const IZIN_KAYNAKLARI: Record<string, WhatsappIzinKaynagi> = {
  form: "form",
  "web formu": "form",
  sozlesme: "sozlesme",
  sozlu: "sozlu",
  telefon: "sozlu",
  "kendisi yazdi": "kendisi_yazdi",
  whatsapp: "kendisi_yazdi",
  reklam: "reklam",
};

function aliciTuruCoz(metin: string, varsayilan: AliciTuru | null): AliciTuru | null {
  const s = basligiSadelestir(metin);
  if (!s) return varsayilan;
  if (/bireysel|sahis|kisi|birey|tuketici|musteri/.test(s)) return "bireysel";
  if (/kurumsal|sirket|tacir|esnaf|firma|isletme|tuzel/.test(s)) return "tacir_esnaf";
  return null;
}

function tarihCoz(metin: string, simdi: Date): Date | null | "gecersiz" {
  const s = metin.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  let [y, a, g] = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  if (!m) {
    m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
    if (!m) return "gecersiz";
    [g, a, y] = [+m[1], +m[2], +m[3]];
  }
  const tarih = new Date(Date.UTC(y, a - 1, g, 9)); // İstanbul günü içinde
  if (tarih.getUTCMonth() !== a - 1 || tarih.getUTCDate() !== g || y < 2000) return "gecersiz";
  if (tarih.getTime() > simdi.getTime() + 24 * 3600 * 1000) return "gecersiz";
  return tarih;
}

function satirDogrula(
  hucreler: string[],
  satirNo: number,
  eslem: SutunEslemi,
  s: IceAktarmaSecenekleri,
  simdi: Date,
  b: Baglam,
): GecerliSatir | SatirSorunu {
  const d = (alan: IceAktarmaAlani) => (eslem[alan] === undefined ? "" : (hucreler[eslem[alan]!] ?? "").trim());
  const sorun = (neden: string): SatirSorunu => ({ satir: satirNo, neden });

  const hamTelefon = d("telefon");
  const telefon = telefonNormallestir(hamTelefon);
  if (hamTelefon && !telefon) {
    // +49 …, 0049 …: Türkiye dışı numaralar desteklenmez (WhatsApp ve SMS kuralları Türkiye numarasına göre).
    const yurtDisi = /^\s*(\+|00)(?!90)\d/.test(hamTelefon);
    return sorun(yurtDisi ? "Yurt dışı numara (yalnızca Türkiye numaraları)" : "Telefon numarası tanınmadı");
  }
  const hamEposta = d("eposta");
  const eposta = epostaNormallestir(hamEposta);
  if (hamEposta && !eposta) return sorun("E-posta adresi geçersiz");
  if (!telefon && !eposta) return sorun("Telefon veya e-posta yok");

  const isletmeAdi = d("isletmeAdi");
  const yetkiliAdi = d("yetkiliAdi");
  const not = d("not");
  if (isletmeAdi.length > 160) return sorun("İşletme adı çok uzun (en fazla 160)");
  if (yetkiliAdi.length > 120) return sorun("Ad çok uzun (en fazla 120)");
  if (not.length > 5000) return sorun("Not çok uzun (en fazla 5000)");

  const aliciTuru = aliciTuruCoz(d("aliciTuru"), s.varsayilanAliciTuru);
  if (!aliciTuru) {
    return sorun(d("aliciTuru") ? "Alıcı türü anlaşılamadı (bireysel / kurumsal)" : "Alıcı türü boş (bireysel / kurumsal)");
  }

  const etiketler = [
    ...new Set(
      d("etiketler")
        .split(/[,;]/)
        .map((e) => e.trim().toLocaleLowerCase("tr"))
        .filter(Boolean)
        .flatMap((e) => {
          if (!s.etiketEslemi || !(e in s.etiketEslemi)) return [e];
          const yeni = googleEtiketiSadelestir(s.etiketEslemi[e] ?? "");
          return yeni ? [yeni] : [];
        }),
    ),
  ];
  if (etiketler.length > 20 || etiketler.some((e) => e.length > 40)) return sorun("En fazla 20 etiket, her biri en fazla 40 karakter");

  // İzin sütunu eşlenmemişse tüm dosya için toplu seçim (varsayılan "yok").
  const hamIzin = eslem.whatsappIzni === undefined ? (s.varsayilanIzin ?? "yok") : basligiSadelestir(d("whatsappIzni"));
  const izin = IZIN_VAR.has(hamIzin) ? "var" : IZIN_RET.has(hamIzin) ? "ret" : IZIN_YOK.has(hamIzin) ? "yok" : null;
  if (!izin) return sorun("WhatsApp izni anlaşılamadı (var / yok / ret)");

  let izinBilgisi: IzinBilgisi | null = null;
  let uyari: string | null = null;
  if (izin === "var") {
    const hamKaynak = basligiSadelestir(d("izinKaynagi"));
    const kaynak = hamKaynak ? IZIN_KAYNAKLARI[hamKaynak] : s.varsayilanIzinKaynagi;
    if (!kaynak) return sorun(hamKaynak ? "İzin kaynağı anlaşılamadı" : "İzin kaynağı yok");
    const tarih = tarihCoz(d("izinTarihi"), simdi);
    if (tarih === "gecersiz") return sorun("İzin tarihi geçersiz (GG.AA.YYYY ya da YYYY-AA-GG)");
    if (b.bicim === "google" && aliciTuru === "bireysel" && !s.iysBeyani) {
      // Google Kişiler (plan D2): bireysel kişide İYS beyanı yoksa izin hiç yazılmaz; kişi izinsiz eklenir.
      uyari = "İYS beyanı gerekli: kişi eklendi, WhatsApp izni yazılmadı";
    } else {
      izinBilgisi = { izin: "var", kaynak, tarih: tarih ?? simdi, iysBeyani: aliciTuru === "bireysel" && s.iysBeyani };
    }
  }

  return {
    satir: satirNo,
    telefon,
    eposta,
    izin,
    izinBilgisi,
    uyari,
    kisi: {
      kaynak: "ice_aktarma",
      isletmeAdi: isletmeAdi || null,
      yetkiliAdi: yetkiliAdi || null,
      eposta,
      ekTelefon: hamTelefon || null,
      notlar: not || null,
      etiketler,
      aliciTuru,
    },
  };
}

export type IceAktarmaRaporu = {
  toplam: number;
  gecerli: number;
  yeni: number;
  cakisan: number;
  engelli: number;
  izinli: number;
  retli: number;
  hatali: number;
  /** İlk 200 sorunlu satır. */
  sorunlar: SatirSorunu[];
  /** Alınan ama izni yazılmayan satırlar (engel listesi, İYS beyanı gerekli): sayı ve ilk 200. */
  uyari: number;
  uyarilar: SatirSorunu[];
  /** İzin 'var' satırı var: uygulamadan önce beyan onayı zorunlu. */
  beyanGerekli: boolean;
  bicim: IceAktarmaBicimi;
  /** Google biçiminde dosya içinde telefona göre birleşen satır. */
  birlesen: number;
};

function eslemDogrula(eslem: SutunEslemi, genislik: number, s: IceAktarmaSecenekleri) {
  const kullanilan = new Set<number>();
  for (const [alan, sutun] of Object.entries(eslem)) {
    if (!ICE_AKTARMA_ALANLARI.includes(alan as IceAktarmaAlani)) throw new IceAktarmaHatasi("Bilinmeyen alan.", "eslem");
    if (!Number.isInteger(sutun) || sutun! < 0 || sutun! >= genislik) throw new IceAktarmaHatasi("Geçersiz sütun.", "eslem");
    if (kullanilan.has(sutun!)) throw new IceAktarmaHatasi("Bir sütun yalnızca bir alana eşlenebilir.", "eslem");
    kullanilan.add(sutun!);
  }
  if (eslem.telefon === undefined && eslem.eposta === undefined) {
    throw new IceAktarmaHatasi("Telefon ya da e-posta sütunu eşlenmeli.", "eslem");
  }
  if (eslem.aliciTuru === undefined && !s.varsayilanAliciTuru) {
    throw new IceAktarmaHatasi(
      "Dosyada alıcı türü sütunu yok: tüm kişiler için Tacir/esnaf (işletme) ya da Bireysel (kişi) seçin.",
      "eslem",
    );
  }
  if (eslem.whatsappIzni === undefined && s.varsayilanIzin === "var" && eslem.izinKaynagi === undefined && !s.varsayilanIzinKaynagi) {
    throw new IceAktarmaHatasi("Tüm kişilere WhatsApp izni verilecekse izin kaynağını seçin.", "eslem");
  }
}

/** Planı ve raporu üretir; hiçbir şey yazmaz. */
function planla(ctx: TenantContext, id: string, eslem: SutunEslemi, s: IceAktarmaSecenekleri, simdi: Date) {
  const oturum = iceAktarmaGetir(ctx, id);
  const suresiDoldu = oturum && simdi.getTime() - oturum.olusturmaTarihi.getTime() > ICE_AKTARMA_OTURUM_DAKIKA * 60_000;
  if (!oturum || oturum.durum !== "hazirlaniyor" || !oturum.satirlar || suresiDoldu) {
    throw new IceAktarmaHatasi("İçe aktarma oturumu bulunamadı ya da süresi doldu; dosyayı yeniden yükleyin.", "bulunamadi");
  }
  const [baslik, ...veri] = oturum.satirlar;
  eslemDogrula(eslem, baslik.length, s);
  const b: Baglam = { bicim: oturum.bicim };

  const sorunlar: SatirSorunu[] = [];
  const uyarilar: SatirSorunu[] = [];
  const gecerliler: GecerliSatir[] = [];
  const gorulen = new Map<string, number>();
  veri.forEach((hucreler, i) => {
    const sonuc = satirDogrula(hucreler, i + 2, eslem, s, simdi, b);
    if ("neden" in sonuc) return void sorunlar.push(sonuc);
    const anahtar = sonuc.telefon ? `t:${sonuc.telefon}` : `e:${sonuc.eposta}`;
    const onceki = gorulen.get(anahtar);
    if (onceki) return void sorunlar.push({ satir: sonuc.satir, neden: `Dosyada tekrar (satır ${onceki})` });
    gorulen.set(anahtar, sonuc.satir);
    gecerliler.push(sonuc);
  });

  const mevcut = new Map<string, string>();
  for (const k of telefonlaKayitlar(ctx, gecerliler.flatMap((g) => (g.telefon ? [g.telefon] : [])))) {
    if (!mevcut.has(k.telefonE164)) mevcut.set(k.telefonE164, k.id);
  }
  const ozetler = (g: GecerliSatir) => [
    ...(g.telefon ? [adresOzeti(ctx.tenantId, "telefon", g.telefon)] : []),
    ...(g.eposta ? [adresOzeti(ctx.tenantId, "eposta", g.eposta)] : []),
  ];
  const engelli = engelliOzetler(ctx, gecerliler.flatMap(ozetler));

  const plan: IceAktarmaPlani = {
    eslem,
    yeniler: [],
    doldurmalar: [],
    sayilar: { hatali: sorunlar.length, cakisan: 0, engelli: 0 },
    beyanOnaylandi: false,
  };
  const retler: { satirIndeksi: number; leadId: string | null }[] = [];
  let izinli = 0;
  for (const g of gecerliler) {
    if (ozetler(g).some((o) => engelli.has(o))) {
      plan.sayilar.engelli++;
      // Engel listesindeki (RET'li / abonelikten çıkmış) adrese izin yazılmaz; kişi yine eklenir / eşleşir.
      if (g.izinBilgisi) {
        g.izinBilgisi = null;
        g.uyari = "Engel listesinde: WhatsApp izni yazılmadı";
      }
    }
    if (g.uyari) uyarilar.push({ satir: g.satir, neden: g.uyari });
    if (g.izinBilgisi) izinli++;
    const mevcutId = g.telefon ? mevcut.get(g.telefon) : undefined;
    if (mevcutId) {
      plan.sayilar.cakisan++;
      if (g.izin === "ret") retler.push({ satirIndeksi: -1, leadId: mevcutId });
      if (s.cakisma === "bos_doldur") {
        plan.doldurmalar.push({
          leadId: mevcutId,
          alanlar: { isletmeAdi: g.kisi.isletmeAdi, yetkiliAdi: g.kisi.yetkiliAdi, eposta: g.kisi.eposta },
          izin: g.izinBilgisi,
        });
      }
      continue;
    }
    if (g.izin === "ret") retler.push({ satirIndeksi: plan.yeniler.length, leadId: null });
    plan.yeniler.push({ kisi: g.kisi, izin: g.izinBilgisi });
  }
  const rapor: IceAktarmaRaporu = {
    toplam: veri.length,
    gecerli: gecerliler.length,
    yeni: plan.yeniler.length,
    cakisan: plan.sayilar.cakisan,
    engelli: plan.sayilar.engelli,
    izinli,
    retli: retler.length,
    hatali: sorunlar.length,
    sorunlar: sorunlar.slice(0, RAPOR_AZAMI_SORUN),
    uyari: uyarilar.length,
    uyarilar: uyarilar.slice(0, RAPOR_AZAMI_SORUN),
    beyanGerekli: izinli > 0,
    bicim: oturum.bicim,
    birlesen: oturum.birlesen,
  };
  return { plan, rapor, retler, sorunlar, uyarilar, oturum };
}

export function iceAktarmaOnizle(ctx: TenantContext, id: string, eslem: SutunEslemi, s: IceAktarmaSecenekleri) {
  return planla(ctx, id, eslem, s, new Date()).rapor;
}

/**
 * Uygular. İzinli satır varsa beyan onayı zorunludur (sunucu tarafında; istemci atlayamaz).
 * Dosyada 'ret' işaretli kişiler eklenir/eşleşir ve ret akışından geçer (engel listesi, ileti izni 'ret'); ret geri
 * alınamaz, bu yüzden böyle satır varsa retOnayi zorunludur.
 */
export function iceAktarmaTamamla(
  ctx: TenantContext,
  id: string,
  eslem: SutunEslemi,
  s: IceAktarmaSecenekleri,
  beyanOnayi: boolean,
  retOnayi = false,
) {
  const { plan, rapor, retler } = planla(ctx, id, eslem, s, new Date());
  if (rapor.beyanGerekli && !beyanOnayi) {
    throw new IceAktarmaHatasi("İzinli kişileri içe aktarmak için beyanı onaylamalısınız.", "beyan");
  }
  if (retler.length && !retOnayi) throw new IceAktarmaHatasi(RET_ONAYI_GEREKLI, "ret");
  plan.beyanOnaylandi = rapor.beyanGerekli && beyanOnayi;
  const sonuc = iceAktarmaUygula(ctx, id, plan);
  if (!sonuc) throw new IceAktarmaHatasi("Bu içe aktarma zaten tamamlanmış ya da iptal edilmiş.", "bulunamadi");
  for (const r of retler) {
    const leadId = r.leadId ?? sonuc.eklenen[r.satirIndeksi];
    if (leadId) retIsle(ctx, { leadId, adresler: [], kaynak: "kayit_ret", aciklama: "İçe aktarılan listede ret işaretli" });
  }
  return { ...rapor, eklenen: sonuc.eklenen.length, guncellenen: sonuc.guncellenen.length };
}

/**
 * Sorunlu satırlar CSV (satır no, neden + dosyadaki hücreler). Oturum hazırlanırken indirilebilir. Alınan ama izni
 * yazılmayan satırlar "Uyarı:" önekiyle eklenir. Google biçiminde hücreler dönüşmüş haldir; "Dosya satırı" sütunu
 * özgün dosyadaki satır numaralarını (birleşenler dahil) gösterir.
 */
export function sorunluSatirlarCsv(ctx: TenantContext, id: string, eslem: SutunEslemi, s: IceAktarmaSecenekleri): string {
  const p = planla(ctx, id, eslem, s, new Date());
  const satirlar = p.oturum.satirlar!;
  const sorunlar = [...p.sorunlar, ...p.uyarilar.map((u) => ({ satir: u.satir, neden: `Uyarı: ${u.neden}` }))].sort((a, b) => a.satir - b.satir);
  // Dışa aktarmayla aynı biçim: UTF-8 BOM + noktalı virgül (Türkçe Excel'de doğrudan sütunlara ayrılır).
  return (
    "\uFEFF" +
    Papa.unparse(
      [["Satır", "Sorun", ...satirlar[0]], ...sorunlar.map((x) => [String(x.satir), x.neden, ...satirlar[x.satir - 1]])],
      // Hücreler kullanıcının dosyasından gelir: =, +, -, @, sekme ya da CR ile başlayanlar Excel'de formül olarak
      // çalışmasın diye başına ' eklenir.
      { delimiter: ";", newline: "\r\n", escapeFormulae: true },
    )
  );
}
