// Gelen kutusu bildirimi (Web Push) gönderimi: işçi turunda, kuyruktaki her sohbet için alıcıların cihazlarına.
//
// - Webhook ağ isteği yapmaz; yalnızca kuyruğa yazar (repo/gelen-kutusu.ts gelenMesajYaz). Gönderim burada.
// - İstek web-push ile hazırlanır (aes128gcm şifreleme + VAPID imzası) ve fetch ile gönderilir (yönlendirme izlenmez,
//   zaman aşımı var). Adres yeniden doğrulanır: yalnızca izinli push sunucuları (src/lib/bildirim.ts).
// - Yük: yalnızca başlık ("Yeni WhatsApp mesajı – <kişi adı>"), sohbet adresi ve etiket. Mesaj içeriği yok.
// - Aynı sohbetin bildirimleri tek bildirimde birleşir: cihazda aynı etiket (tag), push sunucusunda aynı Topic.
// - 404/410 (abonelik bitti), 400/401/403/413 (kullanılamaz; ör. VAPID anahtarı değişti): abonelik silinir.
//   429, 5xx, ağ hatası: geçici; üst üste PUSH_AZAMI_ARDISIK_HATA kez olursa silinir. Bildirim yeniden denenmez.
// - VAPID anahtarları yoksa özellik kapalıdır: kuyruk boşaltılır, hiçbir istek atılmaz.
import "server-only";
import { generateRequestDetails } from "web-push";
import { bildirimKisiAdi, bildirimYuku, pushAdresiGecerli, type BildirimYuku } from "@/lib/bildirim";
import { bildirimAlicilari, bildirimKuyrugunuBosalt, bildirimleriAl, pushSonucuYaz, type PushSonucu } from "../repo/sistem/bildirim";

export type VapidAyarlari = { acikAnahtar: string; gizliAnahtar: string; konu: string };

const base64urlBayt = (s: string) => (/^[A-Za-z0-9_-]+$/.test(s) ? Buffer.from(s, "base64url").length : -1);

/**
 * VAPID_ACIK_ANAHTAR (65 bayt) + VAPID_GIZLI_ANAHTAR (32 bayt), base64url (npm run anahtar:uret üretir) ve
 * VAPID_ILETISIM (mailto: ya da https:; boşsa https ise BETTER_AUTH_URL). Eksik ya da geçersizse null (özellik kapalı).
 */
export function vapidAyarlari(env: Record<string, string | undefined> = process.env): VapidAyarlari | null {
  const acikAnahtar = env.VAPID_ACIK_ANAHTAR?.trim() ?? "";
  const gizliAnahtar = env.VAPID_GIZLI_ANAHTAR?.trim() ?? "";
  if (base64urlBayt(acikAnahtar) !== 65 || base64urlBayt(gizliAnahtar) !== 32) return null;
  let konu = env.VAPID_ILETISIM?.trim() ?? "";
  if (!konu && env.BETTER_AUTH_URL?.startsWith("https://")) konu = new URL(env.BETTER_AUTH_URL).origin;
  if (!/^mailto:[^\s@]+@[^\s@]+$/.test(konu) && !/^https:\/\/[^\s]+$/.test(konu)) return null;
  return { acikAnahtar, gizliAnahtar, konu };
}

/** Tarayıcının abone olurken kullandığı açık anahtar (gizli değil); özellik kapalıysa null. */
export const vapidAcikAnahtari = () => vapidAyarlari()?.acikAnahtar ?? null;

export type BildirimTurSonucu = { gonderilen: number; silinen: number; hata: number; eskiyen: number };

const KALICI_DURUMLAR = new Set([400, 401, 403, 404, 410, 413]);
/** Bir turda en fazla bu kadar sohbetin bildirimi gönderilir. */
const TUR_BASINA_BILDIRIM = 50;

/** Tek cihaza gönderim. Hiçbir durumda hata fırlatmaz. */
export async function pushGonder(a: { endpoint: string; p256dh: string; auth: string }, yuk: BildirimYuku, ayar: VapidAyarlari, konu: string, zamanAsimiMs = 10_000): Promise<PushSonucu> {
  if (!pushAdresiGecerli(a.endpoint)) return "kalici";
  let istek: ReturnType<typeof generateRequestDetails>;
  try {
    istek = generateRequestDetails({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(yuk), {
      vapidDetails: { subject: ayar.konu, publicKey: ayar.acikAnahtar, privateKey: ayar.gizliAnahtar },
      TTL: 3600,
      urgency: "high",
      topic: konu,
      contentEncoding: "aes128gcm",
    });
  } catch {
    return "kalici"; // abonelik anahtarları bozuk
  }
  // Content-Length'i fetch kendisi koyar.
  const basliklar = Object.fromEntries(Object.entries(istek.headers).filter(([k]) => k.toLowerCase() !== "content-length").map(([k, v]) => [k, String(v)]));
  try {
    const y = await fetch(istek.endpoint, {
      method: "POST",
      headers: basliklar,
      body: istek.body ? new Uint8Array(istek.body) : null,
      redirect: "manual",
      signal: AbortSignal.timeout(zamanAsimiMs),
    });
    await y.body?.cancel().catch(() => {});
    if (y.status >= 200 && y.status < 300) return "basarili";
    return KALICI_DURUMLAR.has(y.status) ? "kalici" : "gecici";
  } catch {
    return "gecici";
  }
}

/** İşçi turu: kuyruktaki bildirimleri gönderir (bkz. dosya başı). */
export async function bildirimleriGonder(s: { simdi?: Date; zamanAsimiMs?: number } = {}): Promise<BildirimTurSonucu> {
  const sonuc: BildirimTurSonucu = { gonderilen: 0, silinen: 0, hata: 0, eskiyen: 0 };
  const ayar = vapidAyarlari();
  if (!ayar) {
    bildirimKuyrugunuBosalt();
    return sonuc;
  }
  const simdi = s.simdi ?? new Date();
  const { bildirimler, eskiyen } = bildirimleriAl(simdi, TUR_BASINA_BILDIRIM);
  sonuc.eskiyen = eskiyen;
  for (const b of bildirimler) {
    const yuk = bildirimYuku(b.sohbetId, bildirimKisiAdi(b));
    // Push sunucusunda aynı sohbetin bekleyen bildirimi yenisiyle değişir (Topic: en çok 32 base64url karakter;
    // UUID tiresiz tam 32 onaltılık karakter).
    const konu = b.sohbetId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
    for (const a of bildirimAlicilari(b.tenantId, b.atanan)) {
      const r = await pushGonder(a, yuk, ayar, konu, s.zamanAsimiMs);
      if (r === "basarili") sonuc.gonderilen++;
      else sonuc.hata++;
      if (pushSonucuYaz(a.id, r, simdi) === "silindi") sonuc.silinen++;
    }
  }
  return sonuc;
}
