// Giriş ve kayıt uçlarına kaba kuvvet koruması: IP başına ve e-posta başına ayrı sayaç. Better Auth'un kendi hız sınırı
// yalnızca production'da ve yalnızca IP'ye göre (10 sn'de 3) çalışır; dağıtık bir saldırı tek hesabın parolasını
// yine deneyebilir. Bu sınırlar her ortamda, yalnızca dışarıdan gelen HTTP isteklerinde uygulanır (sunucu içi
// auth.api çağrıları ve testlerdeki yardımcılar sayılmaz). Sayaçlar bellektedir (hiz-siniri.ts): uygulama tek süreç.
//
// İstemci IP'si: Caddy X-Forwarded-For'u istemcinin adresiyle yazar (istemcinin gönderdiği değeri kabul etmez),
// next start yalnızca başlık yoksa soket adresini ekler. Better Auth'un getIP'si yalnızca tek değerli başlığa
// güvenir; çözülemezse herkes için ortak "bilinmiyor" sayacı kullanılır (sınır gevşemez, daralır).
import "server-only";
import { hizSiniriOlustur, type Pencere } from "./hiz-siniri";

const DAKIKA = 60_000;
const SAAT = 60 * DAKIKA;

export const GIRIS_SINIRLARI = {
  /** Aynı IP'den giriş denemesi: dakikada 10, saatte 50 (ofiste birkaç kişi aynı IP'yi paylaşır). */
  girisIp: [
    { azami: 10, sureMs: DAKIKA },
    { azami: 50, sureMs: SAAT },
  ],
  /** Aynı hesaba (e-posta) giriş denemesi: 15 dakikada 5. */
  girisEposta: [{ azami: 5, sureMs: 15 * DAKIKA }],
  /** Aynı IP'den kayıt: saatte 5. */
  kayitIp: [{ azami: 5, sureMs: SAAT }],
  /** Aynı e-postayla kayıt: saatte 3. */
  kayitEposta: [{ azami: 3, sureMs: SAAT }],
} satisfies Record<string, Pencere[]>;

const sayaclar = {
  girisIp: hizSiniriOlustur(GIRIS_SINIRLARI.girisIp),
  girisEposta: hizSiniriOlustur(GIRIS_SINIRLARI.girisEposta),
  kayitIp: hizSiniriOlustur(GIRIS_SINIRLARI.kayitIp),
  kayitEposta: hizSiniriOlustur(GIRIS_SINIRLARI.kayitEposta),
};

export const COK_FAZLA_DENEME_MESAJI = "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.";

/** Sınırlanan uçlar (Better Auth yolları, /api/auth öneki olmadan). */
export function sinirliUc(yol: string): "giris" | "kayit" | null {
  if (yol === "/sign-in/email") return "giris";
  if (yol === "/sign-up/email") return "kayit";
  return null;
}

/**
 * Denemeyi sayar; IP ya da e-posta sınırı doluysa false döner. Önce IP sayılır: bir IP'den çok sayıda farklı
 * e-posta denenmesi IP sınırına, çok IP'den tek hesabın denenmesi e-posta sınırına takılır.
 */
export function denemeIzinli(uc: "giris" | "kayit", ip: string | null, eposta: unknown, simdi = Date.now()): boolean {
  const ipSayaci = uc === "giris" ? sayaclar.girisIp : sayaclar.kayitIp;
  const epostaSayaci = uc === "giris" ? sayaclar.girisEposta : sayaclar.kayitEposta;
  if (!ipSayaci.izinVer(ip ?? "bilinmiyor", simdi)) return false;
  if (typeof eposta === "string" && eposta.trim()) {
    if (!epostaSayaci.izinVer(eposta.trim().toLowerCase(), simdi)) return false;
  }
  return true;
}

/** Testler için. */
export function girisSinirlariniSifirla() {
  for (const s of Object.values(sayaclar)) s.sifirla();
}
