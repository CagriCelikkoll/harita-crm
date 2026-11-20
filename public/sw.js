// Harita CRM servis çalışanı: yalnızca gelen kutusu bildirimleri ve çevrimdışı sayfası.
// Sayfalar ve API ÖNBELLEĞE ALINMAZ (müşteri verisi cihazda kalmasın); yalnızca küçük "bağlantı yok" sayfası saklanır.
// Bildirim yükü: { baslik, url, etiket } (mesaj içeriği yok). Aynı sohbetin bildirimleri aynı etiketle birleşir.
const SURUM = "1";
const ONBELLEK = `harita-crm-${SURUM}`;
const CEVRIMDISI = "/cevrimdisi.html";
const ABONELIK_API = "/api/bildirim/abonelik";

self.addEventListener("install", (olay) => {
  olay.waitUntil(
    caches
      .open(ONBELLEK)
      .then((o) => o.add(new Request(CEVRIMDISI, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (olay) => {
  olay.waitUntil(
    caches
      .keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== ONBELLEK).map((a) => caches.delete(a))))
      .then(() => self.clients.claim()),
  );
});

// Yalnızca sayfa açılışları (GET): ağ yoksa çevrimdışı sayfası. Diğer istekler hiç ele alınmaz.
self.addEventListener("fetch", (olay) => {
  const istek = olay.request;
  if (istek.mode !== "navigate" || istek.method !== "GET") return;
  olay.respondWith(fetch(istek).catch(() => caches.match(CEVRIMDISI).then((y) => y || Response.error())));
});

self.addEventListener("push", (olay) => {
  let veri = {};
  try {
    veri = olay.data ? olay.data.json() : {};
  } catch {
    veri = {};
  }
  const baslik = typeof veri.baslik === "string" && veri.baslik ? veri.baslik.slice(0, 120) : "Yeni WhatsApp mesajı";
  const url = typeof veri.url === "string" && veri.url.startsWith("/gelen-kutusu") ? veri.url : "/gelen-kutusu";
  const etiket = typeof veri.etiket === "string" && veri.etiket ? veri.etiket.slice(0, 80) : "gelen-kutusu";
  olay.waitUntil(
    self.registration.showNotification(baslik, { tag: etiket, renotify: true, icon: "/icon/192", badge: "/icon/192", data: { url } }),
  );
});

self.addEventListener("notificationclick", (olay) => {
  olay.notification.close();
  const hedef = new URL((olay.notification.data && olay.notification.data.url) || "/gelen-kutusu", self.location.origin);
  if (hedef.origin !== self.location.origin) return;
  olay.waitUntil(
    (async () => {
      const pencereler = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const p of pencereler) {
        if (new URL(p.url).origin !== self.location.origin) continue;
        await p.focus();
        if ("navigate" in p) {
          try {
            await p.navigate(hedef.href);
            return;
          } catch {
            // Denetlenmeyen pencere: yeni pencere açılır.
          }
        } else return;
      }
      await self.clients.openWindow(hedef.href);
    })(),
  );
});

// Tarayıcı aboneliği yenilediyse (anahtar süresi vb.) yenisi sunucuya kaydedilir, eskisi silinir.
self.addEventListener("pushsubscriptionchange", (olay) => {
  olay.waitUntil(
    (async () => {
      const eski = olay.oldSubscription;
      const yeni = olay.newSubscription || (eski && eski.options ? await self.registration.pushManager.subscribe(eski.options) : null);
      const gonder = (yontem, govde) =>
        fetch(ABONELIK_API, { method: yontem, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });
      if (yeni) await gonder("POST", yeni.toJSON());
      if (eski && (!yeni || eski.endpoint !== yeni.endpoint)) await gonder("DELETE", { endpoint: eski.endpoint });
    })().catch(() => {}),
  );
});
