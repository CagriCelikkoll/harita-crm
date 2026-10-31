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
  ICE_AKTARMA_AZAMI_SATIR,
  ICE_AKTARMA_OTURUM_DAKIKA,
  XLSX_AZAMI_ACIK_BAYT,
  XLSX_AZAMI_DOSYA,
  type CakismaPolitikasi,
  type IceAktarmaAlani,
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

const AZAMI_SUTUN = 50;
const ORNEK_SATIR = 20;
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

/** Dosyayı satırlara ayırır (ilk satır başlık). Boyut, satır ve sütun sınırları burada uygulanır. */
export async function dosyaAyristir(dosyaAdi: string, bayt: Uint8Array): Promise<string[][]> {
  if (bayt.byteLength === 0) throw new IceAktarmaHatasi("Dosya boş.");
  if (bayt.byteLength > ICE_AKTARMA_AZAMI_BAYT) throw new IceAktarmaHatasi("Dosya en fazla 5 MB olabilir.");
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
  const genislik = Math.max(...satirlar.map((s) => s.length));
  if (genislik > AZAMI_SUTUN) throw new IceAktarmaHatasi(`En fazla ${AZAMI_SUTUN} sütun desteklenir.`);
  return satirlar.map((s) => Array.from({ length: genislik }, (_, i) => (s[i] ?? "").trim()));
}

// --- Oturum ---

export async function iceAktarmaBaslat(ctx: TenantContext, dosyaAdi: string, bayt: Uint8Array) {
  const satirlar = await dosyaAyristir(dosyaAdi, bayt);
  const oturum = iceAktarmaOlustur(ctx, { dosyaAdi: dosyaAdi.slice(0, 200), satirlar });
  return {
    id: oturum.id,
    dosyaAdi: oturum.dosyaAdi,
    basliklar: satirlar[0],
    ornek: satirlar.slice(1, 1 + ORNEK_SATIR),
    toplam: oturum.toplam,
    onerilenEslem: eslemOner(satirlar[0]),
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
};

type GecerliSatir = {
  satir: number;
  kisi: YeniKisi;
  telefon: string | null;
  eposta: string | null;
  izin: "var" | "yok" | "ret";
  izinBilgisi: IzinBilgisi | null;
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
): GecerliSatir | SatirSorunu {
  const d = (alan: IceAktarmaAlani) => (eslem[alan] === undefined ? "" : (hucreler[eslem[alan]!] ?? "").trim());
  const sorun = (neden: string): SatirSorunu => ({ satir: satirNo, neden });

  const hamTelefon = d("telefon");
  const telefon = telefonNormallestir(hamTelefon);
  if (hamTelefon && !telefon) return sorun("Telefon numarası tanınmadı");
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
        .filter(Boolean),
    ),
  ];
  if (etiketler.length > 20 || etiketler.some((e) => e.length > 40)) return sorun("En fazla 20 etiket, her biri en fazla 40 karakter");

  const hamIzin = basligiSadelestir(d("whatsappIzni"));
  const izin = IZIN_VAR.has(hamIzin) ? "var" : IZIN_RET.has(hamIzin) ? "ret" : IZIN_YOK.has(hamIzin) ? "yok" : null;
  if (!izin) return sorun("WhatsApp izni anlaşılamadı (var / yok / ret)");

  let izinBilgisi: IzinBilgisi | null = null;
  if (izin === "var") {
    const hamKaynak = basligiSadelestir(d("izinKaynagi"));
    const kaynak = hamKaynak ? IZIN_KAYNAKLARI[hamKaynak] : s.varsayilanIzinKaynagi;
    if (!kaynak) return sorun(hamKaynak ? "İzin kaynağı anlaşılamadı" : "İzin kaynağı yok");
    const tarih = tarihCoz(d("izinTarihi"), simdi);
    if (tarih === "gecersiz") return sorun("İzin tarihi geçersiz (GG.AA.YYYY ya da YYYY-AA-GG)");
    izinBilgisi = { izin: "var", kaynak, tarih: tarih ?? simdi, iysBeyani: aliciTuru === "bireysel" && s.iysBeyani };
  }

  return {
    satir: satirNo,
    telefon,
    eposta,
    izin,
    izinBilgisi,
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
  /** İzin 'var' satırı var: uygulamadan önce beyan onayı zorunlu. */
  beyanGerekli: boolean;
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

  const sorunlar: SatirSorunu[] = [];
  const gecerliler: GecerliSatir[] = [];
  const gorulen = new Map<string, number>();
  veri.forEach((hucreler, i) => {
    const sonuc = satirDogrula(hucreler, i + 2, eslem, s, simdi);
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
    if (ozetler(g).some((o) => engelli.has(o))) plan.sayilar.engelli++;
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
    beyanGerekli: izinli > 0,
  };
  return { plan, rapor, retler, sorunlar, oturum };
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

/** Sorunlu satırlar CSV (satır no, neden + dosyadaki hücreler). Oturum hazırlanırken indirilebilir. */
export function sorunluSatirlarCsv(ctx: TenantContext, id: string, eslem: SutunEslemi, s: IceAktarmaSecenekleri): string {
  const { sorunlar, oturum } = planla(ctx, id, eslem, s, new Date());
  const satirlar = oturum.satirlar!;
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
