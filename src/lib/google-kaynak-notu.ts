// Kayıt ayrıntı panelindeki Google kaynak notu. Kayıtlar listesi Google'a gitmez; Google bilgisi yalnızca ayrıntı
// panelinde, o kayıt için getirilir. Not sayı ya da birim göstermez (arayüzde kullanım birimi gösterilmez:
// tests/gorunurluk.test.ts); yalnızca kullanımı etkileyip etkilemediğini söyler.

/** Google bilgisinin nereden geldiği: bu açılışta Google'dan ya da bellek önbelleğinden. */
export type GoogleKaynagi = { tur: "google" } | { tur: "onbellek" };

export const googleKaynakNotu = (k: GoogleKaynagi) =>
  k.tur === "google" ? "Google'dan getirildi · aylık kullanımdan düşer" : "Önbellekten getirildi";
