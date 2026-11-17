// Google Kişiler (contacts.google.com → Dışa aktar → Google CSV) ön işlemcisi ve dışa aktarma biçimi. Saf
// fonksiyonlar: veritabanına dokunmaz. İçe aktarmada dosya bu işlemden geçip bizim sütunlarımıza çevrilir; sonrası
// genel içe aktarma hattıdır (eşleme → önizleme → tamamla → sorunlu satırlar). İkinci bir hat yoktur.
//
// Biçimler (başlıklardan tanınır):
//  - yeni: First Name, Middle Name, Last Name, Nickname, Organization Name, E-mail 1 - Value,
//          Phone N - Label, Phone N - Value, Labels, Notes
//  - eski: Name, Given Name, Family Name, Group Membership, Phone N - Type, Phone N - Value, Organization 1 - Name,
//          E-mail 1 - Value, Notes
// Kurallar: bir hücrede birden çok değer " ::: " ile ayrılır. "*" ile başlayan sistem grupları (* myContacts,
// * starred) atılır. Telefon: önce Türkiye cep (etiketi Mobile olan öncelikli), sonra diğer Türkiye numaraları, en son
// tanınmayan / yurt dışı numara (satır sorunlu olur); diğer telefonlar nota "Diğer telefonlar: …" olarak eklenir.
// Aynı (normalleştirilmiş) telefonlu satırlar birleşir: etiketler birleşir, notlar eklenir, ad ilk dolu değerdir.
import { cepMi, telefonBicimle, telefonNormallestir } from "@/lib/adres-normal";
import type { IceAktarmaAlani, SutunEslemi } from "@/lib/ice-aktarma";

export type GoogleBicimi = "yeni" | "eski";

const COKLU = /\s*:::\s*/;

/** Başlıklardan Google Kişiler biçimi; değilse null. */
export function googleBicimi(basliklar: string[]): GoogleBicimi | null {
  const b = new Set(basliklar.map((x) => x.trim()));
  const telefonVar = b.has("Phone 1 - Value");
  if (telefonVar && b.has("First Name") && b.has("Last Name") && (b.has("Labels") || b.has("Organization Name"))) return "yeni";
  if (telefonVar && b.has("Given Name") && b.has("Family Name") && b.has("Group Membership")) return "eski";
  return null;
}

/** Ön işlemden sonraki sütunlar (sabit) ve hazır eşleme. "Dosya satırı" eşlenmez; sorunlu satırlar CSV'sinde görünür. */
export const GOOGLE_SUTUNLARI = ["İşletme adı", "Ad soyad", "Telefon", "E-posta", "Etiketler", "Not", "Dosya satırı"] as const;
export const GOOGLE_ESLEMI: SutunEslemi = { isletmeAdi: 0, yetkiliAdi: 1, telefon: 2, eposta: 3, etiketler: 4, not: 5 } satisfies Partial<
  Record<IceAktarmaAlani, number>
>;

type Kisi = {
  isletmeAdi: string;
  adSoyad: string;
  telefon: string; // kayda yazılacak ham değer
  anahtar: string | null; // birleştirme anahtarı (normal Türkiye numarası)
  digerTelefonlar: string[];
  eposta: string;
  etiketler: string[];
  notlar: string[];
  satirlar: number[];
};

const birlesik = (...parcalar: string[]) => parcalar.map((p) => p.trim()).filter(Boolean).join(" ");
const coklu = (hucre: string | undefined) => (hucre ?? "").split(COKLU).map((x) => x.trim()).filter(Boolean);

/** Google etiketi → bizim etiket adı (virgül/noktalı virgül etiket ayırıcıdır, boşluğa çevrilir). */
export const googleEtiketiSadelestir = (e: string) => e.replace(/[,;]/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr");

type Aday = { ham: string; normal: string | null; mobil: boolean };

function telefonSec(adaylar: Aday[]): { secilen: Aday | null; digerleri: Aday[] } {
  const puan = (a: Aday) => (cepMi(a.normal) ? (a.mobil ? 0 : 1) : a.normal ? 2 : 3);
  const sirali = adaylar.map((a, i) => ({ a, i })).sort((x, y) => puan(x.a) - puan(y.a) || x.i - y.i).map((x) => x.a);
  // Aynı numara iki kez yazılmış olabilir.
  const benzersiz: Aday[] = [];
  for (const a of sirali) if (!benzersiz.some((b) => (a.normal ? b.normal === a.normal : b.ham === a.ham))) benzersiz.push(a);
  return { secilen: benzersiz[0] ?? null, digerleri: benzersiz.slice(1) };
}

const okunur = (a: Aday) => (a.normal ? telefonBicimle(a.normal) : a.ham);

/**
 * Google CSV satırlarını (ilk satır başlık) bizim sütunlarımıza çevirir ve aynı telefonlu kişileri birleştirir.
 * etiketler: dosyadaki Google etiketleri (sistem grupları hariç, sadeleştirilmiş, sıralı) — etiket eşleme ekranı için.
 */
export function googleOnIsle(satirlar: string[][]): { satirlar: string[][]; birlesen: number; etiketler: string[] } {
  const [baslik, ...veri] = satirlar;
  const sutun = new Map(baslik.map((b, i) => [b.trim(), i]));
  const h = (s: string[], ad: string) => {
    const i = sutun.get(ad);
    return i === undefined ? "" : (s[i] ?? "").trim();
  };
  const telefonSutunlari: { deger: number; etiket: number | undefined }[] = [];
  for (let n = 1; sutun.has(`Phone ${n} - Value`); n++) {
    telefonSutunlari.push({ deger: sutun.get(`Phone ${n} - Value`)!, etiket: sutun.get(`Phone ${n} - Label`) ?? sutun.get(`Phone ${n} - Type`) });
  }

  const kisiler: Kisi[] = [];
  const anahtarla = new Map<string, Kisi>();
  let birlesen = 0;
  const tumEtiketler = new Set<string>();
  veri.forEach((s, i) => {
    const satirNo = i + 2;
    const adSoyad =
      birlesik(h(s, "First Name"), h(s, "Middle Name"), h(s, "Last Name")) ||
      h(s, "Name") ||
      birlesik(h(s, "Given Name"), h(s, "Additional Name"), h(s, "Family Name")) ||
      h(s, "Nickname");
    const sirket = coklu(h(s, "Organization Name") || h(s, "Organization 1 - Name"))[0] ?? "";
    const adaylar: Aday[] = telefonSutunlari.flatMap(({ deger, etiket }) => {
      const mobil = /mobile|cep/i.test(etiket === undefined ? "" : (s[etiket] ?? ""));
      return coklu(s[deger]).map((ham) => ({ ham, normal: telefonNormallestir(ham), mobil }));
    });
    const { secilen, digerleri } = telefonSec(adaylar);
    const etiketler = coklu(h(s, "Labels") || h(s, "Group Membership"))
      .filter((e) => !e.startsWith("*"))
      .map(googleEtiketiSadelestir)
      .filter(Boolean);
    for (const e of etiketler) tumEtiketler.add(e);
    const not = h(s, "Notes");
    const kisi: Kisi = {
      isletmeAdi: sirket || adSoyad,
      adSoyad,
      telefon: secilen ? (secilen.normal ? telefonBicimle(secilen.normal) : secilen.ham) : "",
      anahtar: secilen?.normal ?? null,
      digerTelefonlar: digerleri.map(okunur),
      eposta: coklu(h(s, "E-mail 1 - Value"))[0] ?? "",
      etiketler,
      notlar: not ? [not] : [],
      satirlar: [satirNo],
    };
    const onceki = kisi.anahtar ? anahtarla.get(kisi.anahtar) : undefined;
    if (!onceki) {
      kisiler.push(kisi);
      if (kisi.anahtar) anahtarla.set(kisi.anahtar, kisi);
      return;
    }
    birlesen++;
    onceki.isletmeAdi ||= kisi.isletmeAdi;
    onceki.adSoyad ||= kisi.adSoyad;
    onceki.eposta ||= kisi.eposta;
    for (const e of kisi.etiketler) if (!onceki.etiketler.includes(e)) onceki.etiketler.push(e);
    for (const n of kisi.notlar) if (!onceki.notlar.includes(n)) onceki.notlar.push(n);
    for (const t of kisi.digerTelefonlar) if (!onceki.digerTelefonlar.includes(t) && t !== onceki.telefon) onceki.digerTelefonlar.push(t);
    onceki.satirlar.push(satirNo);
  });

  return {
    satirlar: [
      [...GOOGLE_SUTUNLARI],
      ...kisiler.map((k) => [
        k.isletmeAdi,
        k.adSoyad,
        k.telefon,
        k.eposta,
        k.etiketler.join(", "),
        [...k.notlar, ...(k.digerTelefonlar.length ? [`Diğer telefonlar: ${k.digerTelefonlar.join(", ")}`] : [])].join("\n"),
        k.satirlar.join(", "),
      ]),
    ],
    birlesen,
    etiketler: [...tumEtiketler].sort((a, b) => a.localeCompare(b, "tr")),
  };
}

// --- Dışa aktarma (yeni Google biçimi) ---

export const GOOGLE_DISA_SUTUNLARI = [
  "First Name",
  "Last Name",
  "Organization Name",
  "Phone 1 - Label",
  "Phone 1 - Value",
  "E-mail 1 - Value",
  "Labels",
  "Notes",
] as const;

/** Formül enjeksiyonuna karşı: =, +, -, @, sekme, CR ile başlayan kullanıcı hücresinin başına ' eklenir. */
const guvenli = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const csvHucre = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export type DisaKisi = {
  isletmeAdi: string | null;
  yetkiliAdi: string | null;
  ekTelefon: string | null;
  eposta: string | null;
  etiketler: string[];
  notlar: string | null;
};

/** Bir kaydın Google CSV satırı (hücreler); dışa aktarılacak kullanıcı verisi yoksa null. */
export function googleSatiri(k: DisaKisi): string[] | null {
  const ad = k.yetkiliAdi?.trim() ?? "";
  const parca = ad.split(/\s+/).filter(Boolean);
  const [ilk, son] = parca.length > 1 ? [parca.slice(0, -1).join(" "), parca.at(-1)!] : [ad, ""];
  const normal = telefonNormallestir(k.ekTelefon);
  // Telefon bizim ürettiğimiz biçimde (+90 …): Google tanısın diye formül kaçışı uygulanmaz (yalnızca rakam ve boşluk).
  const telefon = normal ? telefonBicimle(normal) : "";
  const hamTelefon = !normal && k.ekTelefon?.trim() ? guvenli(k.ekTelefon.trim()) : "";
  const sirket = k.isletmeAdi?.trim() ?? "";
  const eposta = k.eposta?.trim() ?? "";
  if (!ad && !sirket && !telefon && !hamTelefon && !eposta) return null;
  const etiketler = k.etiketler.map((e) => e.replace(/:::/g, " ").trim()).filter(Boolean);
  return [
    guvenli(ilk),
    guvenli(son),
    guvenli(sirket),
    telefon || hamTelefon ? (cepMi(normal) ? "Mobile" : "Work") : "",
    telefon || hamTelefon,
    guvenli(eposta),
    ["* myContacts", ...etiketler.map(guvenli)].join(" ::: "),
    guvenli(k.notlar?.trim() ?? ""),
  ];
}

/** Google'ın içe aktarabildiği CSV: UTF-8 BOM, virgül ayırıcı, CRLF. */
export function googleCsv(kayitlar: DisaKisi[]): { csv: string; satir: number } {
  const satirlar = kayitlar.flatMap((k) => {
    const s = googleSatiri(k);
    return s ? [s] : [];
  });
  const csv = "﻿" + [GOOGLE_DISA_SUTUNLARI.join(","), ...satirlar.map((s) => s.map(csvHucre).join(","))].join("\r\n") + "\r\n";
  return { csv, satir: satirlar.length };
}
