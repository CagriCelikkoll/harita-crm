// Renk belirteçlerinin (globals.css @theme) CSS sınıfı kullanılamayan yerler için karşılığı: Google Haritalar
// işaretleri ve daire, manifest / tema rengi, uygulama simgesi çizimi. Değerler globals.css ile aynıdır (testte
// karşılaştırılır); yeni renk burada uydurulmaz, önce globals.css'e belirteç olarak eklenir.
import type { KayitDurumu } from "./sabitler";

export const RENK = {
  ana: "#0e6655",
  zemin: "#f5f6f4",
  beyaz: "#ffffff",
  bilgi: "#1d4f91",
  uyariDolgu: "#b45309",
  mor: "#5b3a99",
  pasif: "#9aa59f",
} as const;

/** Haritadaki kayıt işaretleri: rozetlerdeki durum tonlarıyla aynı (rozet.tsx DURUM_TONU / TON_DOLGUSU). */
export const DURUM_ISARET_RENGI: Record<KayitDurumu, string> = {
  yeni: RENK.bilgi,
  iletisimde: RENK.uyariDolgu,
  gorusme: RENK.mor,
  kazanildi: RENK.ana,
  ilgilenmiyor: RENK.pasif,
};
