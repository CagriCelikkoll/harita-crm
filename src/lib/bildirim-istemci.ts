// Tarayıcı tarafı: servis çalışanı, bildirim izni ve push aboneliği (yalnızca istemci bileşenlerinden çağrılır).
//
// - İzin yalnızca kullanıcı "Bildirimleri aç"a basınca istenir (iPhone bunu şart koşar; sayfa açılınca istenmez).
// - iPhone/iPad: Web Push yalnızca iOS 16.4+ ve Safari'den "Ana Ekrana Ekle" ile eklenmiş uygulamada çalışır.
// - Uygulama her açılışta (izin verilmiş ve abonelik varsa) aboneliği sunucuya yeniden gönderir: ortak cihazda abonelik
//   oturumdaki kişiye geçer, çıkıştan sonra yeniden girişte kendiliğinden açılır.
import { useEffect, useState } from "react";
import { apiIstek } from "./api-istemci";

export const SERVIS_CALISANI = "/sw.js";
const ABONELIK_API = "/api/bildirim/abonelik";

export type BildirimDestegi = "var" | "ios-ana-ekran" | "yok";

function iosMu(): boolean {
  const ua = navigator.userAgent;
  // iPadOS masaüstü kipinde kendini Mac olarak tanıtır; dokunmatik ekranla ayırt edilir.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function anaEkranUygulamasiMi(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function bildirimDestegi(): BildirimDestegi {
  const var_ = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (iosMu() && !anaEkranUygulamasiMi()) return "ios-ana-ekran";
  return var_ ? "var" : "yok";
}

function base64urlBaytlar(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const ikili = atob(b64);
  const sonuc = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) sonuc[i] = ikili.charCodeAt(i);
  return sonuc;
}

function ayniAnahtar(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

async function kayit(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration("/");
}

export async function mevcutAbonelik(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  return (await (await kayit())?.pushManager.getSubscription()) ?? null;
}

/** Kullanıcı düğmeye bastığında: izin ister, abone olur, sunucuya kaydeder. Hata metni ya da null döner. */
export async function bildirimiAc(acikAnahtar: string): Promise<string | null> {
  const izin = await Notification.requestPermission();
  if (izin !== "granted") {
    return izin === "denied"
      ? "Bildirim izni reddedildi. Tarayıcının site ayarlarından bu site için bildirimlere izin verip yeniden deneyin."
      : "Bildirim izni verilmedi.";
  }
  await navigator.serviceWorker.register(SERVIS_CALISANI, { scope: "/", updateViaCache: "none" });
  const hazir = await navigator.serviceWorker.ready;
  const anahtar = base64urlBaytlar(acikAnahtar);
  let abonelik = await hazir.pushManager.getSubscription();
  // Sunucunun anahtarı değiştiyse eski abonelik kullanılamaz: bırakılıp yenisi alınır.
  if (abonelik && !ayniAnahtar(abonelik.options.applicationServerKey, anahtar)) {
    await abonelik.unsubscribe().catch(() => {});
    abonelik = null;
  }
  abonelik ??= await hazir.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtar });
  const y = await apiIstek(ABONELIK_API, { method: "POST", govde: abonelik.toJSON() });
  return y.ok ? null : y.hata;
}

/** Bu cihazda bildirimi kapatır: sunucudaki kayıt silinir, tarayıcı aboneliği bırakılır. */
export async function bildirimiKapat(): Promise<string | null> {
  const abonelik = await mevcutAbonelik();
  if (!abonelik) return null;
  const y = await apiIstek(ABONELIK_API, { method: "DELETE", govde: { endpoint: abonelik.endpoint } });
  await abonelik.unsubscribe().catch(() => {});
  return y.ok ? null : y.hata;
}

/**
 * Uygulama açılışında: izin verilmiş ve abonelik varsa sunucuya yeniden gönderir (oturumdaki kullanıcıya bağlanır).
 * Bu cihazın adresini döner (çıkış formu, aboneliği silmek için gönderir); yoksa null.
 */
export async function aboneligiYenile(): Promise<string | null> {
  if (bildirimDestegi() !== "var" || Notification.permission !== "granted") return null;
  const abonelik = await mevcutAbonelik();
  if (!abonelik) return null;
  await apiIstek(ABONELIK_API, { method: "POST", govde: abonelik.toJSON() });
  return abonelik.endpoint;
}

/** Menüdeki çıkış formu için: açılışta aboneliği yeniler ve bu cihazın bildirim adresini verir. */
export function useBildirimAdresi(): string {
  const [adres, setAdres] = useState("");
  useEffect(() => {
    aboneligiYenile()
      .then((a) => setAdres(a ?? ""))
      .catch(() => {});
  }, []);
  return adres;
}
