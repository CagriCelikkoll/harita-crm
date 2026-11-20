// Gelen kutusu bildirimleri (Web Push): istemci ve sunucunun ortak kuralları.
//
// - Abonelik adresi (endpoint) yalnızca bilinen push sunucularından biri olabilir (https, varsayılan port, kullanıcı
//   bilgisi yok). Sunucu bu adrese istek attığı için başka bir adres kabul edilmez (SSRF).
// - Bildirimde mesaj içeriği YOK: yalnızca "Yeni WhatsApp mesajı – <kişi adı>". Gövde uçtan uca şifreli (aes128gcm);
//   push sunucusu adı okuyamaz.
// - Kişi adı: kayıttaki ad (işletme adı, yoksa yetkili adı), yoksa WhatsApp profil adı, yoksa numaranın son 4 hanesi.
import { z } from "zod";

/** İzinli push sunucuları: tam ad ya da "." ile başlayan son ek (alt alan adları). */
export const PUSH_SUNUCULARI = [
  "fcm.googleapis.com", // Chrome, Android, Opera, Samsung
  "updates.push.services.mozilla.com", // Firefox
  ".push.apple.com", // Safari (macOS, iPhone ana ekran uygulaması)
  ".notify.windows.com", // Edge
] as const;

export const PUSH_ADRES_AZAMI = 2048;

export function pushAdresiGecerli(adres: string): boolean {
  if (adres.length > PUSH_ADRES_AZAMI) return false;
  let u: URL;
  try {
    u = new URL(adres);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_SUNUCULARI.some((s) => (s.startsWith(".") ? host.endsWith(s) && host.length > s.length : host === s));
}

const base64url = /^[A-Za-z0-9_-]+={0,2}$/;
/** base64url metnin çözülmüş bayt sayısı (Buffer'sız: dosya tarayıcıda da kullanılır). */
const baytUzunlugu = (s: string) => Math.floor((s.replace(/=+$/, "").length * 3) / 4);
/** Sıkıştırılmamış P-256 noktası 0x04 ile başlar: base64url'de ilk karakter "B", ikincinin üst iki biti 0 (A–P). */
const sikistirilmamisNokta = (s: string) => s[0] === "B" && /[A-P]/.test(s[1] ?? "");

/** Tarayıcının PushSubscription.toJSON() çıktısı (yalnızca kullanılan alanlar). */
export const PushAboneligiGirdisi = z.object({
  endpoint: z.string().refine(pushAdresiGecerli, "Desteklenmeyen bildirim adresi."),
  keys: z.object({
    // Tarayıcının P-256 açık anahtarı (sıkıştırılmamış, 65 bayt) ve 16 baytlık kimlik doğrulama sırrı.
    p256dh: z
      .string()
      .max(200)
      .refine((s) => base64url.test(s) && baytUzunlugu(s) === 65 && sikistirilmamisNokta(s), "Geçersiz abonelik anahtarı."),
    auth: z
      .string()
      .max(100)
      .refine((s) => base64url.test(s) && baytUzunlugu(s) === 16, "Geçersiz abonelik anahtarı."),
  }),
});
export type PushAboneligiGirdisi = z.infer<typeof PushAboneligiGirdisi>;

export const PushAdresiGirdisi = z.object({ endpoint: z.string().max(PUSH_ADRES_AZAMI) });

/** Ayarlar'daki cihaz listesi için kısa açıklama (ör. "iPhone · Safari"); tarayıcı bilgisinin kendisi saklanmaz. */
export function cihazAciklamasi(ua: string | null): string | null {
  if (!ua) return null;
  const sistem = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  const tarayici = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;
  return [sistem, tarayici].filter(Boolean).join(" · ") || null;
}

const KISI_ADI_AZAMI = 60;

/** Bildirimdeki kişi adı (kontrol karakterleri atılır, kısaltılır). */
export function bildirimKisiAdi(k: { isletmeAdi: string | null; yetkiliAdi: string | null; profilAdi: string | null; telefon: string | null }): string {
  const temiz = (s: string | null) => (s ?? "").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  const ad = temiz(k.isletmeAdi) || temiz(k.yetkiliAdi) || temiz(k.profilAdi);
  if (ad) return ad.length > KISI_ADI_AZAMI ? `${ad.slice(0, KISI_ADI_AZAMI - 1)}…` : ad;
  const rakam = (k.telefon ?? "").replace(/\D/g, "");
  return rakam.length >= 4 ? `…${rakam.slice(-4)}` : "Bilinmeyen kişi";
}

export const bildirimBasligi = (kisiAdi: string) => `Yeni WhatsApp mesajı – ${kisiAdi}`;

/** Servis çalışanına giden (şifreli) yük. Mesaj metni, medya ya da telefon numarası içermez. */
export type BildirimYuku = { baslik: string; url: string; etiket: string };

export function bildirimYuku(sohbetId: string, kisiAdi: string): BildirimYuku {
  return { baslik: bildirimBasligi(kisiAdi), url: `/gelen-kutusu?sohbet=${encodeURIComponent(sohbetId)}`, etiket: `sohbet-${sohbetId}` };
}
