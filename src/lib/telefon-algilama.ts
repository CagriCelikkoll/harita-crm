// Gelen mesaj metnindeki Türkiye cep telefonu numaralarını bulur (gelen kutusunda tıklanabilir yapılır). Saf; istemci ve
// sunucu ortak. Tanınan biçimler: 05xx xxx xx xx, 5xx xxx xx xx, +90 5xx …, 0090 5xx …, 90 5xx …, 0 (5xx) …, (05xx) …;
// gruplar arasında boşluk, tire, nokta olabilir. Önünde ya da arkasında başka rakam olan dizi (sipariş no, IBAN, tutar)
// numara sayılmaz. Yalnızca cep numaraları: şablon yalnızca cep telefonuna gönderilir (alıcı kuralları "cep_degil").
import { telefonBicimle, telefonNormallestir } from "./adres-normal";

const AYIRAC = "[\\s.\\-]*";
const TELEFON_DESENI = new RegExp(
  `(?<![\\d+])(?:(?:\\+|00)?90${AYIRAC}|0${AYIRAC})?\\(?0?(5\\d{2})\\)?${AYIRAC}(\\d{3})${AYIRAC}(\\d{2})${AYIRAC}(\\d{2})(?![\\d])`,
  "g",
);

export type BulunanTelefon = { bas: number; son: number; ham: string; normal: string };

/** Metindeki cep numaraları (sırayla; normal: 905XXXXXXXXX). */
export function telefonlariBul(metin: string): BulunanTelefon[] {
  const sonuc: BulunanTelefon[] = [];
  for (const m of metin.matchAll(TELEFON_DESENI)) {
    const normal = telefonNormallestir(`0${m[1]}${m[2]}${m[3]}${m[4]}`);
    if (!normal) continue;
    sonuc.push({ bas: m.index, son: m.index + m[0].length, ham: m[0], normal });
  }
  return sonuc;
}

export type MetinParcasi = { metin: string } | { telefon: BulunanTelefon };

/** Metni düz metin ve numara parçalarına böler (sıra korunur; parçalar birleşince metnin kendisi). */
export function telefonlaParcala(metin: string): MetinParcasi[] {
  const parcalar: MetinParcasi[] = [];
  let i = 0;
  for (const t of telefonlariBul(metin)) {
    if (t.bas > i) parcalar.push({ metin: metin.slice(i, t.bas) });
    parcalar.push({ telefon: t });
    i = t.son;
  }
  if (i < metin.length) parcalar.push({ metin: metin.slice(i) });
  return parcalar;
}

/** Ekranda gösterilen yerel biçim: "0532 123 45 67" (normal 905XXXXXXXXX değilse aynen). */
export function yerelTelefon(normal: string): string {
  return /^90\d{10}$/.test(normal) ? `0${normal.slice(2, 5)} ${normal.slice(5, 8)} ${normal.slice(8, 10)} ${normal.slice(10)}` : normal;
}

/** Kayıtlar → Kişi ekle formunun ön dolumu (gelen kutusu "Kişi olarak ekle"; numara adreste taşınmaz, sekme deposunda). */
export const YENI_KISI_ON_DOLUM = "harita-crm:yeni-kisi-on-dolum";

export { telefonBicimle };
