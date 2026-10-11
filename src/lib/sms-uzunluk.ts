// SMS karakter sayacı ve parça sayısı (istemci ve sunucu). Tahminidir; faturalamada sağlayıcının hesabı esastır.
//
// - Yalnızca GSM 03.38 temel alfabesi: tek SMS 160, çok parçalı 153 karakter/parça. Genişletilmiş karakterler
//   (^ { } \ [ ~ ] | €) 2 karakter sayılır.
// - Türkçe karakterler (ç ğ ı İ ş Ş Ğ): GSM 03.38 Türkçe tek kaydırma tablosu, her biri 2 karakter; ulusal dil
//   başlığı nedeniyle tek SMS 155, çok parçalı 149 karakter/parça. (Ö ö Ü ü Ç temel alfabededir.)
// - Bunların dışındaki karakterler (emoji vb.): UCS-2, tek SMS 70, çok parçalı 67 karakter/parça.

const GSM_TEMEL =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_GENIS = "^{}\\[~]|€";
const TURKCE_KAYDIRMA = "çğıİşŞĞ";

export type SmsKodlama = "gsm7" | "gsm7-turkce" | "ucs2";
export type SmsUzunlugu = { kodlama: SmsKodlama; karakter: number; parca: number; parcaBasina: number; kalan: number };

export function smsUzunlugu(metin: string): SmsUzunlugu {
  let birim = 0;
  let turkce = false;
  let ucs2 = false;
  for (const k of metin) {
    if (GSM_TEMEL.includes(k)) birim += 1;
    else if (GSM_GENIS.includes(k)) birim += 2;
    else if (TURKCE_KAYDIRMA.includes(k)) {
      birim += 2;
      turkce = true;
    } else {
      ucs2 = true;
      break;
    }
  }
  if (ucs2) {
    const karakter = [...metin].reduce((t, k) => t + (k.codePointAt(0)! > 0xffff ? 2 : 1), 0); // UTF-16 birimi
    return hesapla("ucs2", karakter, 70, 67);
  }
  return turkce ? hesapla("gsm7-turkce", birim, 155, 149) : hesapla("gsm7", birim, 160, 153);
}

function hesapla(kodlama: SmsKodlama, karakter: number, tek: number, coklu: number): SmsUzunlugu {
  const parca = karakter === 0 ? 0 : karakter <= tek ? 1 : Math.ceil(karakter / coklu);
  const parcaBasina = parca <= 1 ? tek : coklu;
  return { kodlama, karakter, parca, parcaBasina, kalan: parca === 0 ? tek : parca * parcaBasina - karakter };
}

/** Netgsm "encoding": yalnızca Türkçe karakter (ya da UCS-2) varsa "tr". */
export const turkceKodlamaGerekli = (metin: string) => smsUzunlugu(metin).kodlama !== "gsm7";
