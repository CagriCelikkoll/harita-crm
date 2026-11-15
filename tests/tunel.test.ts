// Tünel koruması (src/proxy.ts + src/lib/tunel.ts): Host'u *.trycloudflare.com ya da GENEL_ADRES'in alanı olan istek
// yalnızca /api/whatsapp/webhook/<kimlik>'e ulaşır, diğer her yol 404; localhost'tan arayüz ve oturum yönlendirmesi
// eskisi gibi. next.config yönlendirmeleri (proxy'den önce çalışır) tünel isteğine uygulanmaz.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { alanAdi, izinsizHostMu, tunelHostDeseni, tunelIstegiMi, tuneldenIzinliMi, uygulamaAlanlari } from "@/lib/tunel";
import { oturumYoluMu, proxy } from "@/proxy";

const TUNEL = "rastgele-dort-kelime.trycloudflare.com";
const KIMLIK = "Abc_def-123ABCdef456GHIjkl789MNOpq";
const istek = (url: string, basliklar: Record<string, string> = {}) => new NextRequest(url, { headers: basliklar });
const tuneldenIstek = (yol: string, ek: Record<string, string> = {}) => istek(`http://localhost:3000${yol}`, { host: TUNEL, ...ek });
const gecti = (y: Response) => y.headers.get("x-middleware-next") === "1";

afterEach(() => {
  delete process.env.GENEL_ADRES;
});

describe("alan adı ve tünel tespiti", () => {
  it("alan adı küçük harfe çevrilir; port ve sondaki nokta atılır; IPv6 korunur", () => {
    expect(alanAdi("ABC.TryCloudflare.com.:443")).toBe("abc.trycloudflare.com");
    expect(alanAdi("localhost:3000")).toBe("localhost");
    expect(alanAdi("[::1]:3000")).toBe("[::1]");
    expect(alanAdi(" ")).toBeNull();
    expect(alanAdi(null)).toBeNull();
  });

  it("*.trycloudflare.com her zaman, GENEL_ADRES'in alanı yalnızca https ve uygulamanın kendi alanı değilse tünel sayılır", () => {
    const h = (host: string, xfh?: string) => new Headers(xfh ? { host, "x-forwarded-host": xfh } : { host });
    const yerel = { uygulamaAdresi: "http://localhost:3000" };
    expect(tunelIstegiMi(h(TUNEL), yerel)).toBe(true);
    expect(tunelIstegiMi(h("localhost:3000"), yerel)).toBe(false);
    expect(tunelIstegiMi(h("127.0.0.1:3000"), yerel)).toBe(false);
    expect(tunelIstegiMi(h("trycloudflare.com.ornek.test"), yerel)).toBe(false); // sonek değil
    // X-Forwarded-Host (virgüllü liste) da denetlenir.
    expect(tunelIstegiMi(h("localhost:3000", `ornek.test, ${TUNEL}`), yerel)).toBe(true);
    // GENEL_ADRES: kendi tünel alanınız.
    const genel = { genelAdres: "https://tunel.ornek.test/yol", uygulamaAdresi: "http://localhost:3000" };
    expect(tunelIstegiMi(h("TUNEL.ornek.test:443"), genel)).toBe(true);
    expect(tunelIstegiMi(h("baska.ornek.test"), genel)).toBe(false);
    // https değilse ya da uygulamanın kendi alanıysa (canlıda tek alan adı) koruma o alana uygulanmaz.
    expect(tunelIstegiMi(h("tunel.ornek.test"), { genelAdres: "http://tunel.ornek.test" })).toBe(false);
    expect(tunelIstegiMi(h("crm.ornek.test"), { genelAdres: "https://crm.ornek.test", uygulamaAdresi: "https://crm.ornek.test" })).toBe(false);
    // Varsayılan: ortam değişkenleri.
    process.env.GENEL_ADRES = "https://tunel.ornek.test";
    expect(tunelIstegiMi(h("tunel.ornek.test"))).toBe(true);
  });

  it("tünelden yalnızca webhook yolu izinli", () => {
    expect(tuneldenIzinliMi(`/api/whatsapp/webhook/${KIMLIK}`)).toBe(true);
    expect(tuneldenIzinliMi(`/api/whatsapp/webhook/${KIMLIK}/`)).toBe(true);
    for (const yol of ["/api/whatsapp/webhook", "/api/whatsapp/webhook/", `/api/whatsapp/webhook/${KIMLIK}/x`, "/api/whatsapp/webhook/a.b", "/api/whatsapp/liste"]) {
      expect(tuneldenIzinliMi(yol), yol).toBe(false);
    }
  });
});

describe("proxy", () => {
  it("tünelden: webhook geçer; giriş, kayıt, sayfalar, diğer API'ler ve statik dosyalar 404", async () => {
    expect(gecti(proxy(tuneldenIstek(`/api/whatsapp/webhook/${KIMLIK}`)))).toBe(true);
    const engellenen = [
      "/",
      "/giris",
      "/kurulum",
      "/panel",
      "/ayarlar/whatsapp",
      "/api/auth/sign-up/email",
      "/api/auth/sign-in/email",
      "/api/kayitlar",
      "/api/ayarlar/whatsapp-api",
      "/api/whatsapp/liste",
      "/abonelik/belirtec",
      "/_next/static/chunks/main.js",
      "/favicon.ico",
      `/api/whatsapp/webhook/${KIMLIK}/../../auth`,
    ];
    for (const yol of engellenen) {
      // Oturum çereziyle de: tünelden oturumlu istek de geçmez.
      const y = proxy(tuneldenIstek(yol, { cookie: "better-auth.session_token=x" }));
      expect(y.status, yol).toBe(404);
      expect(gecti(y), yol).toBe(false);
      expect(await y.text()).toBe("Bulunamadı.");
    }
    // Host localhost ama X-Forwarded-Host tünel: yine 404.
    expect(proxy(istek("http://localhost:3000/giris", { host: "localhost:3000", "x-forwarded-host": TUNEL })).status).toBe(404);
  });

  it("GENEL_ADRES'in alanından gelen istek de aynı kurala tabi", () => {
    process.env.GENEL_ADRES = "https://tunel.ornek.test";
    expect(proxy(istek("https://tunel.ornek.test/giris", { host: "tunel.ornek.test" })).status).toBe(404);
    expect(gecti(proxy(istek(`https://tunel.ornek.test/api/whatsapp/webhook/${KIMLIK}`, { host: "tunel.ornek.test" })))).toBe(true);
  });

  it("localhost'tan arayüz etkilenmez: oturumsuz sayfa girişe, giriş ve API'ler olduğu gibi", () => {
    process.env.GENEL_ADRES = `https://${TUNEL}`;
    const yerel = (yol: string, ek: Record<string, string> = {}) => proxy(istek(`http://localhost:3000${yol}`, { host: "localhost:3000", ...ek }));
    const y = yerel("/panel?x=1");
    expect(y.status).toBe(307);
    expect(y.headers.get("location")).toBe("http://localhost:3000/giris?sonra=%2Fpanel%3Fx%3D1");
    expect(gecti(yerel("/panel", { cookie: "better-auth.session_token=x" }))).toBe(true);
    for (const yol of ["/giris", "/api/kayitlar", "/api/auth/sign-in/email", "/_next/static/chunks/main.js", `/api/whatsapp/webhook/${KIMLIK}`]) {
      expect(gecti(yerel(yol)), yol).toBe(true);
    }
  });

  it("oturum yolları eski matcher listesiyle aynı", () => {
    for (const yol of ["/", "/panel", "/panel/x", "/kampanyalar", "/kampanyalar/yeni", "/iletisim", "/ayarlar/ekip", "/kurulum", "/tarama", "/kayitlar"]) {
      expect(oturumYoluMu(yol), yol).toBe(true);
    }
    for (const yol of ["/giris", "/davet/x", "/abonelik/x", "/api/kayitlar", "/panelx", "/kurulum/x"]) {
      expect(oturumYoluMu(yol), yol).toBe(false);
    }
  });
});

describe("next.config yönlendirmeleri", () => {
  it("tünel host deseni: trycloudflare ve GENEL_ADRES alanı tam eşleşir, localhost eşleşmez", () => {
    const tam = (desen: string, host: string) => new RegExp(`^${desen}$`).test(host);
    const yalniz = tunelHostDeseni({ uygulamaAdresi: "http://localhost:3000" });
    expect(tam(yalniz, TUNEL)).toBe(true);
    expect(tam(yalniz, "localhost")).toBe(false);
    const genelli = tunelHostDeseni({ genelAdres: "https://tunel.ornek.test", uygulamaAdresi: "http://localhost:3000" });
    expect(tam(genelli, "tunel.ornek.test")).toBe(true);
    expect(tam(genelli, "tunelXornek.test")).toBe(false); // nokta kaçışlı
    expect(tam(genelli, TUNEL)).toBe(true);
    // Uygulamanın kendi alanı tünel sayılmaz.
    expect(tam(tunelHostDeseni({ genelAdres: "https://crm.ornek.test", uygulamaAdresi: "https://crm.ornek.test" }), "crm.ornek.test")).toBe(false);
  });

  it("eski /iletisim yönlendirmeleri tünel host'unda uygulanmaz", async () => {
    const yapilandirma = (await import("../next.config")).default;
    const y = await yapilandirma.redirects!();
    expect(y).toHaveLength(2);
    for (const r of y) expect(r.missing).toEqual([{ type: "host", value: tunelHostDeseni({ uygulamaAdresi: process.env.BETTER_AUTH_URL }) }]);
  });
});

// Canlı sunucu (deneme.bursalidagitim.com): GENEL_ADRES ve BETTER_AUTH_URL aynı alan → arayüz açık; bunun dışındaki
// Host'lar (sunucunun IP'si, başka alan) üretimde 404. Tünel koruması üretimde de geçerli.
describe("canlı alan adı koruması", () => {
  const CANLI = "https://deneme.bursalidagitim.com";
  const canli = (yol: string, basliklar: Record<string, string>) => proxy(istek(`https://deneme.bursalidagitim.com${yol}`, basliklar));
  const uretim = { uretim: true, uygulamaAdresi: CANLI };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("izinli alanlar: UYGULAMA_ALANLARI ya da BETTER_AUTH_URL'in alanı ve yerel adresler", () => {
    expect([...uygulamaAlanlari(uretim)].sort()).toEqual(["127.0.0.1", "[::1]", "deneme.bursalidagitim.com", "localhost"]);
    expect(uygulamaAlanlari({ uretim: true, uygulamaAlanlari: " A.ornek.test , b.ornek.test:443 ", uygulamaAdresi: CANLI }).has("deneme.bursalidagitim.com")).toBe(false);
    expect(uygulamaAlanlari({ uretim: true, uygulamaAlanlari: " A.ornek.test , b.ornek.test:443 " }).has("b.ornek.test")).toBe(true);
  });

  it("üretimde alan adı ve yerel adres geçer; IP, başka alan, sahte X-Forwarded-Host ve Host'suz istek engellenir", () => {
    const h = (host: string | null, xfh?: string) => {
      const b = new Headers();
      if (host !== null) b.set("host", host);
      if (xfh) b.set("x-forwarded-host", xfh);
      return b;
    };
    expect(izinsizHostMu(h("deneme.bursalidagitim.com"), uretim)).toBe(false);
    expect(izinsizHostMu(h("DENEME.bursalidagitim.com.:443"), uretim)).toBe(false);
    expect(izinsizHostMu(h("127.0.0.1:3000"), uretim)).toBe(false);
    expect(izinsizHostMu(h("localhost:3000"), uretim)).toBe(false);
    expect(izinsizHostMu(h("203.0.113.7"), uretim)).toBe(true);
    expect(izinsizHostMu(h("baska.ornek.test"), uretim)).toBe(true);
    expect(izinsizHostMu(h("deneme.bursalidagitim.com.saldirgan.test"), uretim)).toBe(true);
    expect(izinsizHostMu(h("deneme.bursalidagitim.com", "saldirgan.test"), uretim)).toBe(true);
    expect(izinsizHostMu(h(null), uretim)).toBe(true);
    // Geliştirmede hiçbir şey engellenmez.
    expect(izinsizHostMu(h("203.0.113.7"), { ...uretim, uretim: false })).toBe(false);
  });

  it("proxy: üretimde canlı alan adından arayüz ve webhook açık, IP'den 404; trycloudflare yalnızca webhook", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", CANLI);
    vi.stubEnv("GENEL_ADRES", CANLI);
    const y = canli("/panel", { host: "deneme.bursalidagitim.com" });
    expect(y.status).toBe(307); // oturumsuz → giriş
    expect(gecti(canli("/giris", { host: "deneme.bursalidagitim.com" }))).toBe(true);
    expect(gecti(canli("/api/auth/sign-in/email", { host: "deneme.bursalidagitim.com" }))).toBe(true);
    expect(gecti(canli(`/api/whatsapp/webhook/${KIMLIK}`, { host: "deneme.bursalidagitim.com" }))).toBe(true);
    expect(gecti(canli("/api/saglik", { host: "127.0.0.1:3000" }))).toBe(true);

    for (const yol of ["/giris", "/api/saglik", `/api/whatsapp/webhook/${KIMLIK}`, "/_next/static/chunks/main.js"]) {
      const ip = proxy(istek(`http://203.0.113.7${yol}`, { host: "203.0.113.7" }));
      expect(ip.status, yol).toBe(404);
      expect(await ip.text()).toBe("Bulunamadı.");
    }
    expect(gecti(proxy(tuneldenIstek(`/api/whatsapp/webhook/${KIMLIK}`)))).toBe(true);
    expect(proxy(tuneldenIstek("/giris")).status).toBe(404);
  });

  it("geliştirmede (NODE_ENV production değil) IP ile erişim eskisi gibi", () => {
    vi.stubEnv("BETTER_AUTH_URL", CANLI);
    expect(gecti(proxy(istek("http://192.168.1.20:3000/giris", { host: "192.168.1.20:3000" })))).toBe(true);
  });
});
