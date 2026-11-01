// Kampanya oluşturma sihirbazı: dört adım ve adımlar arası geçiş kuralları (saf; test edilebilir).
// Sunucu doğrulaması aynen geçerlidir (KampanyaGirdisi); bu kurallar yalnızca kullanıcıyı eksik adımla ilerletmez.
import type { KuyrukKanali } from "./mesajlasma";

export const KAMPANYA_ADIMLARI = [
  { no: 1, ad: "Kanal" },
  { no: 2, ad: "Alıcılar" },
  { no: 3, ad: "Mesaj" },
  { no: 4, ad: "Gönder" },
] as const;
export type AdimNo = (typeof KAMPANYA_ADIMLARI)[number]["no"];

export const SMS_AZAMI_KARAKTER = 900;

export type SihirbazTaslagi = {
  kanal: KuyrukKanali | null;
  ad: string;
  konu: string;
  sablon: string;
  /** WhatsApp: seçili şablon ve sabit metinli değişkenlerin değerleri. */
  sablonId: string;
  sabitDegerler: string[];
  /** Alıcılar adımındaki canlı sayım (WhatsApp'ta ve sayım gelmeden null). */
  aliciSayisi: number | null;
  /** Gönder adımının özeti alındı mı. */
  ozetVar: boolean;
};

/** Bu adımdan ilerlemeyi engelleyen eksik (yoksa null). */
export function adimEngeli(adim: AdimNo, t: SihirbazTaslagi): string | null {
  if (adim === 1) return t.kanal ? null : "Bir kanal seçin.";
  if (adim === 2) {
    if (!t.ad.trim()) return "Kampanya adı gerekli.";
    if (t.aliciSayisi === 0) return "Bu seçimle gönderilecek alıcı yok; alıcı grubunu değiştirin.";
    return null;
  }
  if (adim === 3) {
    if (t.kanal === "whatsapp_api") {
      if (!t.sablonId) return "WhatsApp şablonu seçin.";
      if (t.sabitDegerler.some((d) => !d.trim())) return "Sabit metinli değişkenlerin metnini girin.";
      return null;
    }
    if (t.kanal === "eposta" && !t.konu.trim()) return "E-posta konusu gerekli.";
    if (!t.sablon.trim()) return "Mesaj metni gerekli.";
    if (t.kanal === "sms" && t.sablon.length > SMS_AZAMI_KARAKTER) return `SMS metni en fazla ${SMS_AZAMI_KARAKTER} karakter olabilir.`;
    return null;
  }
  return null;
}

/** Gidilebilecek en ileri adım: engeli olan ilk adım; 4. adım ayrıca özetin alınmış olmasını ister. */
export function enIleriAdim(t: SihirbazTaslagi): AdimNo {
  for (const a of [1, 2, 3] as const) if (adimEngeli(a, t)) return a;
  return t.ozetVar ? 4 : 3;
}

/** Adresteki ?adim= değeri: geçersizse 1; ileri atlanamaz (en ileri izinli adıma çekilir). */
export function adimCoz(istenen: string | null | undefined, t: SihirbazTaslagi): AdimNo {
  const n = Number(istenen);
  const adim = Number.isInteger(n) && n >= 1 && n <= 4 ? (n as AdimNo) : 1;
  return Math.min(adim, enIleriAdim(t)) as AdimNo;
}
