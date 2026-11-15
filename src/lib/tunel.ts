// Tünel koruması (src/proxy.ts): geçici tünelden (Cloudflare quick tunnel, *.trycloudflare.com ya da GENEL_ADRES'in alan
// adı) gelen istekler yalnızca Meta'nın WhatsApp webhook'una ulaşır; giriş, kayıt, sayfalar, diğer API'ler ve statik
// dosyalar 404 döner. Arayüz localhost'tan (BETTER_AUTH_URL) kullanılır ve etkilenmez.
//
// Host başlığına güvenmek: tarayıcıdan bağımsız bir istemci Host'u istediği gibi yazabilir, bu yüzden bu kontrol bir
// kimlik doğrulaması DEĞİLDİR; yalnızca tünel adresini bilen birinin uygulamanın geri kalanını görmesini engeller.
// - Cloudflare, tünel isteğini Host'a göre yönlendirir; cloudflared Host'u değiştirmeden iletir. `--http-host-header`
//   ile Host localhost'a çevrilirse bu koruma çalışmaz (npm run tunel bu seçeneği kullanmaz).
// - X-Forwarded-Host da (virgüllü liste olabilir) aynı kuralla denetlenir: biri tünel alanıysa istek tünelden sayılır.
// - Alan adları küçük harfe çevrilir; port ve sondaki nokta atılır (`ABC.trycloudflare.com.:443` de yakalanır).
// - GENEL_ADRES uygulamanın kendi adresiyle (BETTER_AUTH_URL) aynı alandaysa (canlıda tek alan adı) koruma bu alana
//   uygulanmaz; yoksa arayüzün tamamı 404 olurdu. *.trycloudflare.com her zaman korunur.
// - Asıl güvenlik yine her rotadadır: oturum, yetki ve webhook'ta Meta imzası (App Secret).

/** Meta'nın çağırdığı tek izinli yol: /api/whatsapp/webhook/<kimlik> (kimlik base64url). */
const WEBHOOK_YOLU = /^\/api\/whatsapp\/webhook\/[A-Za-z0-9_-]{1,64}\/?$/;
const QUICK_TUNNEL = /(^|\.)trycloudflare\.com$/;

/** "Host" değerinden alan adı: küçük harf, port ve sondaki nokta atılır; IPv6 köşeli parantezli kalır. */
export function alanAdi(deger: string | null | undefined): string | null {
  const d = deger?.trim().toLowerCase();
  if (!d) return null;
  const alan = d.startsWith("[") ? d.slice(0, d.indexOf("]") + 1) : d.split(":")[0];
  return alan.replace(/\.+$/, "") || null;
}

function adresAlani(adres: string | undefined, yalnizcaHttps: boolean): string | null {
  const a = adres?.trim();
  if (!a) return null;
  try {
    const url = new URL(a);
    return yalnizcaHttps && url.protocol !== "https:" ? null : alanAdi(url.host);
  } catch {
    return null;
  }
}

/** Bu alan adı tünel mi: *.trycloudflare.com ya da GENEL_ADRES'in alanı (uygulamanın kendi alanı değilse). */
export function tunelAlaniMi(alan: string, ortam: { genelAdres?: string; uygulamaAdresi?: string }): boolean {
  if (QUICK_TUNNEL.test(alan)) return true;
  const genel = adresAlani(ortam.genelAdres, true);
  return genel !== null && genel === alan && genel !== adresAlani(ortam.uygulamaAdresi, false);
}

/** İstek tünelden mi geliyor (Host ya da X-Forwarded-Host'taki herhangi bir değer tünel alanı). */
export function tunelIstegiMi(
  basliklar: Headers,
  ortam: { genelAdres?: string; uygulamaAdresi?: string } = {
    genelAdres: process.env.GENEL_ADRES,
    uygulamaAdresi: process.env.BETTER_AUTH_URL,
  },
): boolean {
  const degerler = [basliklar.get("host"), ...(basliklar.get("x-forwarded-host")?.split(",") ?? [])];
  return degerler.some((h) => {
    const alan = alanAdi(h);
    return alan !== null && tunelAlaniMi(alan, ortam);
  });
}

/**
 * next.config yönlendirmeleri proxy'den ÖNCE çalışır: tünel isteği /iletisim'de 307 almasın diye yönlendirmelere
 * `missing: [{ type: "host", value }]` olarak verilen desen (tam eşleşme; port Next tarafından atılır).
 */
export function tunelHostDeseni(ortam: { genelAdres?: string; uygulamaAdresi?: string }): string {
  const desenler = ["(?:.+\\.)?trycloudflare\\.com"];
  const genel = adresAlani(ortam.genelAdres, true);
  if (genel && !QUICK_TUNNEL.test(genel) && tunelAlaniMi(genel, ortam)) desenler.push(genel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return desenler.length === 1 ? desenler[0] : `(?:${desenler.join("|")})`;
}

/** Tünelden gelen istek bu yola ulaşabilir mi (yalnızca WhatsApp webhook'u). */
export const tuneldenIzinliMi = (yol: string) => WEBHOOK_YOLU.test(yol);

const YEREL_ALANLAR = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type UretimOrtami = { uretim: boolean; uygulamaAlanlari?: string; uygulamaAdresi?: string };

/** Üretimde izinli alanlar: UYGULAMA_ALANLARI (virgüllü), boşsa BETTER_AUTH_URL'in alanı. Yerel adresler her zaman. */
export function uygulamaAlanlari(ortam: UretimOrtami): Set<string> {
  const liste = (ortam.uygulamaAlanlari ?? "")
    .split(",")
    .map((a) => alanAdi(a))
    .filter((a): a is string => a !== null);
  if (!liste.length) {
    const uygulama = adresAlani(ortam.uygulamaAdresi, false);
    if (uygulama) liste.push(uygulama);
  }
  return new Set([...YEREL_ALANLAR, ...liste]);
}

/**
 * Canlı sunucu koruması (yalnızca NODE_ENV=production): Host ya da X-Forwarded-Host'taki değerlerden biri izinli
 * alanlar dışındaysa (ör. sunucunun IP adresi, başka bir alan adı) true → proxy 404 döner. Caddy zaten yalnızca alan
 * adına hizmet verir; bu, yanlış ters vekil ayarına karşı ikinci kattır. Geliştirmede (uretim=false) hiçbir şey engellenmez.
 * Tünel koruması bundan önce çalışır; *.trycloudflare.com üretimde de yalnızca webhook'a ulaşır.
 */
export function izinsizHostMu(
  basliklar: Headers,
  ortam: UretimOrtami = {
    uretim: process.env.NODE_ENV === "production",
    uygulamaAlanlari: process.env.UYGULAMA_ALANLARI,
    uygulamaAdresi: process.env.BETTER_AUTH_URL,
  },
): boolean {
  if (!ortam.uretim) return false;
  const izinli = uygulamaAlanlari(ortam);
  const degerler = [basliklar.get("host"), ...(basliklar.get("x-forwarded-host")?.split(",") ?? [])]
    .map((h) => alanAdi(h))
    .filter((a): a is string => a !== null);
  // Host'suz istek (HTTP/1.0) üretimde kabul edilmez.
  if (!degerler.length) return true;
  return degerler.some((a) => !izinli.has(a));
}
