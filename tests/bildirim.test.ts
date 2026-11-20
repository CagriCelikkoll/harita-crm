// Gelen kutusu bildirimi (Web Push) ve PWA. Gerçek push isteği yoktur: fetch taklit edilir; gövde testte çözülür.
// - Şifreleme: RFC 8291 Ek A test vektörü. (1) Testteki RFC çözücüsü vektörün gövdesini çözer; (2) web-push'un kullandığı
//   şifreleme kütüphanesi aynı anahtar ve tuzla vektörün gövdesini birebir üretir; (3) web-push'un gerçek çıktısı RFC
//   yöntemiyle çözülür. VAPID: ES256 imzası, aud/sub/exp.
// - Yükte mesaj içeriği yok; kişi adı sırası; adres beyaz listesi; webhook yalnızca kuyruğa yazar; alıcılar (atanan /
//   herkes); hata kodları; anahtarsız kapalı; eski bildirim gönderilmez; API; çıkış; servis çalışanı, manifest, simgeler.
import { createECDH, createHmac, createPublicKey, hkdfSync, randomBytes, verify, createDecipheriv } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";
import { vapidCiftiUret } from "../scripts/anahtar-uret-yardimci";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const VAPID = vapidCiftiUret();
const vapidAc = () => {
  process.env.VAPID_ACIK_ANAHTAR = VAPID.acik;
  process.env.VAPID_GIZLI_ANAHTAR = VAPID.gizli;
  process.env.VAPID_ILETISIM = "mailto:destek@ornek.test";
};
const vapidKapat = () => {
  delete process.env.VAPID_ACIK_ANAHTAR;
  delete process.env.VAPID_GIZLI_ANAHTAR;
  delete process.env.VAPID_ILETISIM;
};

const { db } = await import("@/server/db");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kisileriEkle } = await import("@/server/repo/kayitlar");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const gk = await import("@/server/repo/gelen-kutusu");
const repo = await import("@/server/repo/push-abonelikleri");
const sistem = await import("@/server/repo/sistem/bildirim");
const { baglamUret } = await import("@/server/repo/sistem/uyelik");
const servis = await import("@/server/servisler/bildirim");
const { isciTuru } = await import("@/server/servisler/isci");
const wa = await import("@/server/servisler/whatsapp-api");
const { mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const webhook = await import("@/app/api/whatsapp/webhook/[kimlik]/route");
const rota = await import("@/app/api/bildirim/abonelik/route");
const lib = await import("@/lib/bildirim");
const { oturumYoluMu } = await import("@/proxy");
const manifest = (await import("@/app/manifest")).default;
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");

const KOK = path.resolve(__dirname, "..");
const oku = (d: string) => fs.readFileSync(path.join(KOK, d), "utf8");
const U = "https://crm.ornek.test";

// ---------------------------------------------------------------- RFC 8291 çözücüsü (testin kendi uygulaması)
/** RFC 8291 §3.3–3.4 + RFC 8188: tek kayıtlı aes128gcm gövdesini tarayıcının (UA) gizli anahtarıyla çözer. */
function rfc8291Coz(govde: Buffer, uaGizli: Buffer, auth: Buffer): Buffer {
  const tuz = govde.subarray(0, 16);
  const kayitBoyu = govde.readUInt32BE(16);
  const idUzunlugu = govde[20];
  const asAcik = govde.subarray(21, 21 + idUzunlugu); // keyid = sunucunun geçici açık anahtarı
  const sifreli = govde.subarray(21 + idUzunlugu);
  expect(sifreli.length).toBeLessThanOrEqual(kayitBoyu);
  const ec = createECDH("prime256v1");
  ec.setPrivateKey(uaGizli);
  const ortak = ec.computeSecret(asAcik);
  const anahtarBilgisi = Buffer.concat([Buffer.from("WebPush: info\0"), ec.getPublicKey(), asAcik]);
  const ikm = Buffer.from(hkdfSync("sha256", ortak, auth, anahtarBilgisi, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, tuz, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, tuz, Buffer.from("Content-Encoding: nonce\0"), 12));
  const c = createDecipheriv("aes-128-gcm", cek, nonce);
  c.setAuthTag(sifreli.subarray(sifreli.length - 16));
  const acik = Buffer.concat([c.update(sifreli.subarray(0, sifreli.length - 16)), c.final()]);
  let son = acik.length - 1;
  while (son >= 0 && acik[son] === 0) son--; // dolgu
  expect(acik[son]).toBe(2); // son kaydın ayracı
  return acik.subarray(0, son);
}

const b64 = (s: string) => Buffer.from(s, "base64url");

// RFC 8291 Ek A.
const RFC = {
  metin: "When I grow up, I want to be a watermelon",
  asGizli: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asAcik: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaGizli: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaAcik: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  tuz: "DGv6ra1nlYgDCS1FRnbzlw",
  govde:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("şifreleme ve VAPID (RFC 8291, RFC 8292)", () => {
  it("RFC 8291 Ek A: anahtarlar tutarlı; testin çözücüsü vektörün gövdesini çözer", () => {
    for (const [gizli, acik] of [
      [RFC.asGizli, RFC.asAcik],
      [RFC.uaGizli, RFC.uaAcik],
    ]) {
      const ec = createECDH("prime256v1");
      ec.setPrivateKey(b64(gizli));
      expect(ec.getPublicKey().toString("base64url")).toBe(acik);
    }
    expect(rfc8291Coz(b64(RFC.govde), b64(RFC.uaGizli), b64(RFC.auth)).toString()).toBe(RFC.metin);
  });

  it("web-push'un şifreleme kütüphanesi aynı anahtar ve tuzla vektörün gövdesini birebir üretir", () => {
    // web-push'un bağımlılığı (http_ece); web-push şifrelemeyi bununla yapar (rastgele anahtar ve tuzla).
    const ece = createRequire(path.join(KOK, "node_modules/web-push/package.json"))("http_ece") as {
      encrypt: (b: Buffer, o: Record<string, unknown>) => Buffer;
    };
    const as = createECDH("prime256v1");
    as.setPrivateKey(b64(RFC.asGizli));
    const govde = ece.encrypt(Buffer.from(RFC.metin), {
      version: "aes128gcm",
      dh: RFC.uaAcik,
      privateKey: as,
      salt: RFC.tuz,
      authSecret: RFC.auth,
      rs: 4096,
    });
    expect(govde.toString("base64url")).toBe(RFC.govde);
  });

  it("web-push'un ürettiği istek: RFC yöntemiyle çözülür, yük yalnızca başlık+adres+etiket; VAPID imzası geçerli", async () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = randomBytes(16);
    const { generateRequestDetails } = await import("web-push");
    const yuk = lib.bildirimYuku("sohbet-1", "Ege Emlak");
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";
    const d = generateRequestDetails(
      { endpoint, keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } },
      JSON.stringify(yuk),
      { vapidDetails: { subject: "mailto:destek@ornek.test", publicKey: VAPID.acik, privateKey: VAPID.gizli }, contentEncoding: "aes128gcm", TTL: 3600 },
    );
    expect(d.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(JSON.parse(rfc8291Coz(d.body!, ua.getPrivateKey(), auth).toString())).toEqual(yuk);

    const m = /^vapid t=([^,]+), k=(.+)$/.exec(String(d.headers.Authorization));
    expect(m?.[2]).toBe(VAPID.acik);
    const [baslik, govde, imza] = m![1].split(".");
    expect(JSON.parse(b64(baslik).toString())).toMatchObject({ alg: "ES256", typ: "JWT" });
    const iddia = JSON.parse(b64(govde).toString());
    expect(iddia.aud).toBe("https://fcm.googleapis.com");
    expect(iddia.sub).toBe("mailto:destek@ornek.test");
    const simdi = Date.now() / 1000;
    expect(iddia.exp).toBeGreaterThan(simdi);
    expect(iddia.exp).toBeLessThanOrEqual(simdi + 24 * 3600);
    const acik = b64(VAPID.acik);
    const anahtar = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: acik.subarray(1, 33).toString("base64url"), y: acik.subarray(33).toString("base64url") },
      format: "jwk",
    });
    expect(verify("sha256", Buffer.from(`${baslik}.${govde}`), { key: anahtar, dsaEncoding: "ieee-p1363" }, b64(imza))).toBe(true);
  });
});

describe("kurallar (src/lib/bildirim.ts)", () => {
  it("abonelik adresi yalnızca bilinen push sunucuları, https, varsayılan port, kullanıcı bilgisi yok", () => {
    for (const a of [
      "https://fcm.googleapis.com/fcm/send/x",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://web.push.apple.com/QGx",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ]) {
      expect(lib.pushAdresiGecerli(a), a).toBe(true);
    }
    for (const a of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com:8443/x",
      "https://kullanici:parola@fcm.googleapis.com/x",
      "https://fcm.googleapis.com.saldirgan.test/x",
      "https://push.apple.com/x", // son ek, alt alan adı olmadan
      "https://saldirganpush.apple.com.evil.test/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://169.254.169.254/latest",
      "javascript:alert(1)",
      `https://fcm.googleapis.com/${"a".repeat(2100)}`,
    ]) {
      expect(lib.pushAdresiGecerli(a), a).toBe(false);
    }
  });

  it("abonelik anahtarları: p256dh 65 bayt sıkıştırılmamış nokta, auth 16 bayt", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const iyi = { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
    expect(lib.PushAboneligiGirdisi.safeParse(iyi).success).toBe(true);
    const bozuk = [
      { ...iyi, keys: { ...iyi.keys, p256dh: ua.getPublicKey("base64url", "compressed") } },
      { ...iyi, keys: { ...iyi.keys, auth: randomBytes(8).toString("base64url") } },
      { ...iyi, keys: { ...iyi.keys, p256dh: "<script>" } },
      { ...iyi, endpoint: "https://ornek.test/push" },
    ];
    for (const b of bozuk) expect(lib.PushAboneligiGirdisi.safeParse(b).success).toBe(false);
  });

  it("kişi adı: kayıttaki ad (işletme, yetkili) → profil adı → numaranın son 4 hanesi", () => {
    const k = { isletmeAdi: null, yetkiliAdi: null, profilAdi: null, telefon: null };
    expect(lib.bildirimKisiAdi({ ...k, isletmeAdi: "Ege Emlak", yetkiliAdi: "Ali", profilAdi: "Profil" })).toBe("Ege Emlak");
    expect(lib.bildirimKisiAdi({ ...k, yetkiliAdi: "Ali Veli", profilAdi: "Profil" })).toBe("Ali Veli");
    expect(lib.bildirimKisiAdi({ ...k, isletmeAdi: "  ", profilAdi: "Profil Ad", telefon: "+905321234567" })).toBe("Profil Ad");
    expect(lib.bildirimKisiAdi({ ...k, telefon: "+90 532 123 45 67" })).toBe("…4567");
    expect(lib.bildirimKisiAdi(k)).toBe("Bilinmeyen kişi");
    expect(lib.bildirimKisiAdi({ ...k, profilAdi: "A‮B\nC" })).toBe("A B C"); // kontrol ve yön karakterleri
    expect(lib.bildirimKisiAdi({ ...k, isletmeAdi: "x".repeat(100) })).toHaveLength(60);
    expect(lib.bildirimYuku("s1", "Ege")).toEqual({ baslik: "Yeni WhatsApp mesajı – Ege", url: "/gelen-kutusu?sohbet=s1", etiket: "sohbet-s1" });
  });

  it("cihaz açıklaması kısa; tarayıcı bilgisinin kendisi saklanmaz", () => {
    expect(lib.cihazAciklamasi("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(lib.cihazAciklamasi("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Windows · Edge");
    expect(lib.cihazAciklamasi("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(lib.cihazAciklamasi(null)).toBeNull();
  });

  it("VAPID ayarları: anahtar uzunlukları denetlenir; iletişim mailto ya da https, boşsa https site adresi", () => {
    const env = { VAPID_ACIK_ANAHTAR: VAPID.acik, VAPID_GIZLI_ANAHTAR: VAPID.gizli, BETTER_AUTH_URL: "https://crm.ornek.test" };
    expect(servis.vapidAyarlari(env)).toEqual({ acikAnahtar: VAPID.acik, gizliAnahtar: VAPID.gizli, konu: "https://crm.ornek.test" });
    expect(servis.vapidAyarlari({ ...env, VAPID_ILETISIM: "mailto:a@b.test" })?.konu).toBe("mailto:a@b.test");
    expect(servis.vapidAyarlari({ ...env, BETTER_AUTH_URL: "http://localhost:3000" })).toBeNull();
    expect(servis.vapidAyarlari({ ...env, VAPID_ILETISIM: "a@b.test" })).toBeNull();
    expect(servis.vapidAyarlari({ ...env, VAPID_GIZLI_ANAHTAR: "" })).toBeNull();
    expect(servis.vapidAyarlari({ ...env, VAPID_ACIK_ANAHTAR: VAPID.gizli })).toBeNull();
    expect(servis.vapidAyarlari({ ...env, VAPID_GIZLI_ANAHTAR: "a+b/" })).toBeNull();
  });
});

// ---------------------------------------------------------------- akış: webhook → kuyruk → işçi → push
type Cihaz = { endpoint: string; ua: ReturnType<typeof createECDH>; auth: Buffer };
type Istek = { url: string; init: RequestInit };

let sayac = 0;
let istekler: Istek[] = [];
let yanitDurumu: (url: string) => number | Error = () => 201;

beforeEach(() => {
  mockWhatsappSifirla();
  oturum.ctx = null;
  istekler = [];
  yanitDurumu = () => 201;
  vapidAc();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      istekler.push({ url: String(url), init });
      const d = yanitDurumu(String(url));
      if (d instanceof Error) throw d;
      return new Response(null, { status: d });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vapidKapat();
});

function cihazUret(sunucu = "https://fcm.googleapis.com/fcm/send/"): Cihaz {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  return { endpoint: `${sunucu}${randomBytes(12).toString("hex")}`, ua, auth: randomBytes(16) };
}
const aboneligi = (c: Cihaz) => ({ endpoint: c.endpoint, keys: { p256dh: c.ua.getPublicKey().toString("base64url"), auth: c.auth.toString("base64url") } });

function istek(yontem: "POST" | "DELETE", govde: unknown, basliklar: Record<string, string> = {}) {
  return new Request(`${U}/api/bildirim/abonelik`, {
    method: yontem,
    headers: { "Content-Type": "application/json", Origin: U, "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/604.1", ...basliklar },
    body: typeof govde === "string" ? govde : JSON.stringify(govde),
  });
}

async function cihazKaydet(ctx: TenantContext, c: Cihaz) {
  oturum.ctx = ctx;
  const y = await rota.POST(istek("POST", aboneligi(c)));
  expect(y.status).toBe(200);
  oturum.ctx = null;
}

function uyeEkle(ctx: TenantContext, ad: string): TenantContext {
  const u = kullaniciOlustur(ad);
  db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(u.id, ctx.tenantId);
  return baglamUret(u.id, ctx.tenantId)!;
}

/** Çalışma alanı + WhatsApp numarası (sahte Meta istemcisi). */
async function alan(ad: string) {
  const { ctx } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  const waba = String(600000 + ++sayac);
  const phoneId = String(840000 + sayac);
  const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad: "Merkez", wabaId: waba, phoneNumberId: phoneId, erisimAnahtari: "anahtar", appSecret: "app-secret" });
  const b = baglantiGetir(ctx, baglanti.id!)!;
  return { ctx, n: { id: b.id, phoneId, waba, kimlik: b.webhookKimligi } };
}
type Numara = Awaited<ReturnType<typeof alan>>["n"];

function kisi(ctx: TenantContext, ad: { isletmeAdi?: string }) {
  const tel = `90533${String(7000000 + ++sayac).padStart(7, "0")}`;
  const [k] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: `+${tel}`, aliciTuru: "tacir_esnaf", etiketler: [], ...ad }], "test");
  return { tel, leadId: k.id };
}

async function mesajGelir(n: Numara, tel: string, metin: string, profil: string | null = "Müşteri Profil") {
  const govde = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: n.waba,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: n.phoneId },
              contacts: [{ ...(profil ? { profile: { name: profil } } : {}), wa_id: tel }],
              messages: [{ from: tel, id: `wamid.BILDIRIM${++sayac}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: metin } }],
            },
          },
        ],
      },
    ],
  });
  const imza = `sha256=${createHmac("sha256", "app-secret").update(govde).digest("hex")}`;
  const y = await webhook.POST(new Request(`${U}/api/whatsapp/webhook/${n.kimlik}`, { method: "POST", headers: { "X-Hub-Signature-256": imza }, body: govde }), {
    params: Promise.resolve({ kimlik: n.kimlik }),
  });
  expect(y.status).toBe(200);
}

const kuyruk = (tenantId: string) =>
  db.$client.prepare("select sohbet_id, profil_adi from bildirim_kuyrugu where tenant_id = ?").all(tenantId) as { sohbet_id: string; profil_adi: string | null }[];
const abonelikler = (tenantId: string) =>
  db.$client.prepare("select user_id, endpoint, ardisik_hata, son_basari_tarihi from push_abonelikleri where tenant_id = ?").all(tenantId) as {
    user_id: string;
    endpoint: string;
    ardisik_hata: number;
    son_basari_tarihi: number | null;
  }[];

function coz(i: Istek, c: Cihaz) {
  return JSON.parse(rfc8291Coz(Buffer.from(i.init.body as Uint8Array), c.ua.getPrivateKey(), c.auth).toString());
}

describe("akış: webhook kuyruğa yazar, işçi gönderir", () => {
  it("webhook ağ isteği yapmaz; art arda mesajlar tek bildirimde birleşir; yükte mesaj içeriği yok", async () => {
    const { ctx, n } = await alan("Akis");
    const yon = cihazUret();
    await cihazKaydet(ctx, yon);
    const { tel, leadId } = kisi(ctx, { isletmeAdi: "Ege Emlak" });

    await mesajGelir(n, tel, "GİZLİ içerik: daire 3+1 fiyatı 4.500.000");
    await mesajGelir(n, tel, "ikinci mesaj");
    expect(istekler).toEqual([]); // webhook hiçbir push isteği yapmadı
    expect(kuyruk(ctx.tenantId)).toHaveLength(1);

    const s = await servis.bildirimleriGonder();
    expect(s).toMatchObject({ gonderilen: 1, hata: 0, silinen: 0 });
    expect(kuyruk(ctx.tenantId)).toEqual([]);
    expect(istekler).toHaveLength(1);
    const i = istekler[0];
    expect(i.url).toBe(yon.endpoint);
    expect(i.init.redirect).toBe("manual");
    expect(i.init.signal).toBeInstanceOf(AbortSignal);
    const sohbetId = gk.sohbetBul(ctx, n.id, leadId)!.id;
    expect(coz(i, yon)).toEqual({ baslik: "Yeni WhatsApp mesajı – Ege Emlak", url: `/gelen-kutusu?sohbet=${sohbetId}`, etiket: `sohbet-${sohbetId}` });
    const basliklar = i.init.headers as Record<string, string>;
    expect(basliklar).toMatchObject({ "Content-Encoding": "aes128gcm", TTL: "3600", Urgency: "high", Topic: sohbetId.replace(/-/g, "") });
    expect(JSON.stringify(basliklar)).not.toMatch(/GİZLİ|daire|ikinci/);
    expect(Buffer.from(i.init.body as Uint8Array).toString("latin1")).not.toMatch(/GİZLİ|daire|Ege/); // şifreli
    expect(abonelikler(ctx.tenantId)[0].son_basari_tarihi).not.toBeNull();

    // Kuyruk boş: ikinci tur bir şey göndermez.
    expect(await servis.bildirimleriGonder()).toMatchObject({ gonderilen: 0 });
    expect(istekler).toHaveLength(1);
  });

  it("alıcılar: atanmamışsa herkes; atanmışsa yalnızca atanan; atanan üyelikten çıkarılınca yine herkes", async () => {
    const { ctx, n } = await alan("Alici");
    const uye = uyeEkle(ctx, "UyeAli");
    const [yon, uyeTel, uyePc] = [cihazUret(), cihazUret("https://web.push.apple.com/"), cihazUret("https://updates.push.services.mozilla.com/wpush/v2/")];
    await cihazKaydet(ctx, yon);
    await cihazKaydet(uye, uyeTel);
    await cihazKaydet(uye, uyePc);
    const { tel, leadId } = kisi(ctx, { isletmeAdi: "Kırtasiye" });

    await mesajGelir(n, tel, "merhaba");
    await servis.bildirimleriGonder();
    expect(istekler.map((i) => i.url).sort()).toEqual([yon.endpoint, uyeTel.endpoint, uyePc.endpoint].sort());

    istekler = [];
    const s = gk.sohbetBul(ctx, n.id, leadId)!;
    gk.sohbetGuncelle(ctx, s.id, { atananKullanici: uye.userId });
    await mesajGelir(n, tel, "atandıktan sonra");
    await servis.bildirimleriGonder();
    expect(istekler.map((i) => i.url).sort()).toEqual([uyeTel.endpoint, uyePc.endpoint].sort());
    expect(coz(istekler[0], istekler[0].url === uyeTel.endpoint ? uyeTel : uyePc).baslik).toBe("Yeni WhatsApp mesajı – Kırtasiye");

    // Üyelik silinince cihazları da silinir (yabancı anahtar); atama kalsa da bildirim herkese (yöneticiye) gider.
    istekler = [];
    db.$client.prepare("delete from memberships where user_id = ? and tenant_id = ?").run(uye.userId, ctx.tenantId);
    expect(abonelikler(ctx.tenantId).map((a) => a.endpoint)).toEqual([yon.endpoint]);
    await mesajGelir(n, tel, "üye çıktı");
    await servis.bildirimleriGonder();
    expect(istekler.map((i) => i.url)).toEqual([yon.endpoint]);
  });

  it("kişi adı: kayıtta ad yoksa WhatsApp profil adı, o da yoksa numaranın son 4 hanesi", async () => {
    const { ctx, n } = await alan("Ad");
    const yon = cihazUret();
    await cihazKaydet(ctx, yon);
    const a = kisi(ctx, {});
    await mesajGelir(n, a.tel, "x", "Ayşe Profil");
    const b = kisi(ctx, {});
    await mesajGelir(n, b.tel, "y", null);
    await servis.bildirimleriGonder();
    const basliklar = istekler.map((i) => coz(i, yon).baslik).sort();
    expect(basliklar).toEqual([`Yeni WhatsApp mesajı – …${b.tel.slice(-4)}`, "Yeni WhatsApp mesajı – Ayşe Profil"].sort());
  });

  it("işçi turu gönderir (kilit altında, sonucu raporlar)", { timeout: 30_000 }, async () => {
    const { ctx, n } = await alan("Isci");
    const yon = cihazUret();
    await cihazKaydet(ctx, yon);
    const { tel } = kisi(ctx, { isletmeAdi: "İşçi Testi" });
    await mesajGelir(n, tel, "selam");
    const tur = await isciTuru({ parti: 10, whatsappAralikMs: 0 });
    expect(tur.bildirim).toMatchObject({ gonderilen: 1, hata: 0 });
    expect(istekler.filter((i) => i.url === yon.endpoint)).toHaveLength(1);
  });

  it("hata kodları: 404/410/403 aboneliği siler; 500 ve ağ hatası sayar, sınırda siler; başarı sayacı sıfırlar", async () => {
    const { ctx, n } = await alan("Hata");
    const c = { gone: cihazUret(), yok: cihazUret(), yasak: cihazUret(), bes: cihazUret(), ag: cihazUret() };
    for (const x of Object.values(c)) await cihazKaydet(ctx, x);
    yanitDurumu = (url) =>
      url === c.gone.endpoint ? 410 : url === c.yok.endpoint ? 404 : url === c.yasak.endpoint ? 403 : url === c.bes.endpoint ? 503 : new TypeError("ağ yok");
    const { tel } = kisi(ctx, { isletmeAdi: "Hata Kişisi" });
    await mesajGelir(n, tel, "1");
    const s = await servis.bildirimleriGonder();
    expect(s).toMatchObject({ gonderilen: 0, hata: 5, silinen: 3 });
    const kalan = abonelikler(ctx.tenantId);
    expect(kalan.map((a) => a.endpoint).sort()).toEqual([c.bes.endpoint, c.ag.endpoint].sort());
    expect(kalan.every((a) => a.ardisik_hata === 1)).toBe(true);

    // Üst üste geçici hata sınırı: silinir.
    for (let i = 1; i < sistem.PUSH_AZAMI_ARDISIK_HATA; i++) {
      await mesajGelir(n, tel, `tekrar ${i}`);
      await servis.bildirimleriGonder();
    }
    expect(abonelikler(ctx.tenantId)).toEqual([]);

    // Başarı sayacı sıfırlar.
    const d = cihazUret();
    await cihazKaydet(ctx, d);
    yanitDurumu = () => 500;
    await mesajGelir(n, tel, "a");
    await servis.bildirimleriGonder();
    expect(abonelikler(ctx.tenantId)[0].ardisik_hata).toBe(1);
    yanitDurumu = () => 201;
    await mesajGelir(n, tel, "b");
    await servis.bildirimleriGonder();
    expect(abonelikler(ctx.tenantId)[0].ardisik_hata).toBe(0);
  });

  it("izinli olmayan adres (veritabanına bir yolla girmiş) istek atılmadan silinir", async () => {
    const { ctx, n } = await alan("Ssrf");
    const iyi = cihazUret();
    await cihazKaydet(ctx, iyi);
    db.$client
      .prepare("insert into push_abonelikleri (id, tenant_id, user_id, endpoint, p256dh, auth) values (?, ?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), ctx.tenantId, ctx.userId, "http://169.254.169.254/latest/meta-data", aboneligi(iyi).keys.p256dh, aboneligi(iyi).keys.auth);
    const { tel } = kisi(ctx, { isletmeAdi: "S" });
    await mesajGelir(n, tel, "x");
    const s = await servis.bildirimleriGonder();
    expect(istekler.map((i) => i.url)).toEqual([iyi.endpoint]);
    expect(s.silinen).toBe(1);
    expect(abonelikler(ctx.tenantId).map((a) => a.endpoint)).toEqual([iyi.endpoint]);
  });

  it("anahtar yoksa özellik kapalı: istek yok, kuyruk boşalır, abonelik kaydı 409", async () => {
    const { ctx, n } = await alan("Kapali");
    const yon = cihazUret();
    await cihazKaydet(ctx, yon);
    const { tel } = kisi(ctx, { isletmeAdi: "K" });
    await mesajGelir(n, tel, "x");
    vapidKapat();
    expect(await servis.bildirimleriGonder()).toEqual({ gonderilen: 0, silinen: 0, hata: 0, eskiyen: 0 });
    expect(istekler).toEqual([]);
    expect(kuyruk(ctx.tenantId)).toEqual([]);
    oturum.ctx = ctx;
    expect((await rota.POST(istek("POST", aboneligi(cihazUret())))).status).toBe(409);
    expect(servis.vapidAcikAnahtari()).toBeNull();
  });

  it("bir saatten eski bildirim gönderilmez (işçi uzun süre durduysa)", async () => {
    const { ctx, n } = await alan("Eski");
    await cihazKaydet(ctx, cihazUret());
    const { tel } = kisi(ctx, { isletmeAdi: "E" });
    await mesajGelir(n, tel, "x");
    const s = await servis.bildirimleriGonder({ simdi: new Date(Date.now() + sistem.BILDIRIM_OMRU_MS + 60_000) });
    expect(s).toMatchObject({ gonderilen: 0, eskiyen: 1 });
    expect(istekler).toEqual([]);
    expect(kuyruk(ctx.tenantId)).toEqual([]);
  });
});

describe("API: /api/bildirim/abonelik", () => {
  it("oturum, kaynak, gövde ve doğrulama", async () => {
    const { ctx } = kiraciOlustur("Api");
    const c = cihazUret();
    expect((await rota.POST(istek("POST", aboneligi(c)))).status).toBe(401);
    oturum.ctx = ctx;
    expect((await rota.POST(istek("POST", aboneligi(c), { Origin: "https://saldirgan.test" }))).status).toBe(403);
    expect((await rota.POST(istek("POST", { ...aboneligi(c), endpoint: "https://saldirgan.test/push" }))).status).toBe(400);
    expect((await rota.POST(istek("POST", { ...aboneligi(c), endpoint: "http://fcm.googleapis.com/x" }))).status).toBe(400);
    expect((await rota.POST(istek("POST", { endpoint: c.endpoint }))).status).toBe(400);
    expect((await rota.POST(istek("POST", "{bozuk"))).status).toBe(400);
    expect((await rota.POST(istek("POST", "x".repeat(9000)))).status).toBe(413);
    const y = await rota.POST(istek("POST", aboneligi(c)));
    expect(y.status).toBe(200);
    expect(y.headers.get("cache-control")).toBe("no-store");
    expect(repo.pushCihazlariListele(ctx)).toEqual([expect.objectContaining({ cihaz: "iPhone · Safari" })]);
    // Aynı cihaz yeniden: tek satır.
    await rota.POST(istek("POST", aboneligi(c)));
    expect(abonelikler(ctx.tenantId)).toHaveLength(1);
    expect(Object.keys(rota).sort()).toEqual(["DELETE", "POST"]);
  });

  it("her kullanıcı yalnızca kendi aboneliğini siler; ortak cihazda abonelik oturum açan kişiye geçer", async () => {
    const { ctx: a } = kiraciOlustur("Ortak");
    const b = uyeEkle(a, "OrtakUye");
    const { ctx: yabanci } = kiraciOlustur("Yabanci");
    const c = cihazUret();
    await cihazKaydet(a, c);

    // B silmeye çalışır: A'nınki kalır.
    oturum.ctx = b;
    expect(await (await rota.DELETE(istek("DELETE", { endpoint: c.endpoint }))).json()).toEqual({ silindi: false });
    expect(abonelikler(a.tenantId).map((x) => x.user_id)).toEqual([a.userId]);

    // Aynı tarayıcıda B oturum açtı (uygulama aboneliği yeniden gönderir): abonelik B'ye geçer.
    await cihazKaydet(b, c);
    expect(abonelikler(a.tenantId).map((x) => x.user_id)).toEqual([b.userId]);
    // Başka çalışma alanından biri aynı tarayıcıda: A'daki B satırı silinir, yenisi yabancının alanında.
    await cihazKaydet(yabanci, c);
    expect(abonelikler(a.tenantId)).toEqual([]);
    expect(abonelikler(yabanci.tenantId).map((x) => x.user_id)).toEqual([yabanci.userId]);

    oturum.ctx = yabanci;
    expect(await (await rota.DELETE(istek("DELETE", { endpoint: c.endpoint }))).json()).toEqual({ silindi: true });
    expect(abonelikler(yabanci.tenantId)).toEqual([]);
  });

  it("çıkış: bu cihazdaki abonelik (kullanıcının tüm çalışma alanlarında) silinir, başkalarınınki kalır", async () => {
    const { ctx: a, kullanici } = kiraciOlustur("Cikis");
    const { ctx: diger } = kiraciOlustur("CikisDiger");
    db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(kullanici.id, diger.tenantId);
    const aIkinci = baglamUret(kullanici.id, diger.tenantId)!;
    const c = cihazUret();
    const baska = cihazUret();
    await cihazKaydet(a, c);
    await cihazKaydet(aIkinci, c);
    await cihazKaydet(diger, baska);
    expect(sistem.pushAdresiniBirak(c.endpoint, kullanici.id)).toBe(2);
    expect(abonelikler(a.tenantId)).toEqual([]);
    expect(abonelikler(diger.tenantId).map((x) => x.endpoint)).toEqual([baska.endpoint]);

    // Çıkış eylemi adresi oturum kapanmadan önce bırakır; menüdeki form adresi gönderir.
    const eylem = oku("src/app/eylemler/oturum.ts");
    expect(eylem.indexOf("pushAdresiniBirak(")).toBeGreaterThan(-1);
    expect(eylem.indexOf("pushAdresiniBirak(")).toBeLessThan(eylem.indexOf("auth.api.signOut"));
    expect(oku("src/components/menu.tsx")).toMatch(/<input type="hidden" name="pushAdresi" value=\{pushAdresi\} \/>/);
  });

  it("Ayarlar → Bildirimler: cihaz listesi ve kaldırma yalnızca kendi cihazları", async () => {
    const { ctx: a } = kiraciOlustur("Liste");
    const b = uyeEkle(a, "ListeUye");
    await cihazKaydet(a, cihazUret());
    await cihazKaydet(b, cihazUret());
    const [aCihaz] = repo.pushCihazlariListele(a);
    expect(repo.pushCihazlariListele(b)).toHaveLength(1);
    expect(Object.keys(aCihaz).sort()).toEqual(["cihaz", "id", "olusturmaTarihi", "sonBasariTarihi"]); // adres ve anahtar yok
    expect(repo.pushCihaziKaldir(b, aCihaz.id)).toBe(false);
    expect(repo.pushCihaziKaldir(a, aCihaz.id)).toBe(true);
    expect(repo.pushCihazlariListele(a)).toEqual([]);
    expect(repo.pushCihazlariListele(b)).toHaveLength(1);
  });

  it("aynı kullanıcı iki çalışma alanında: her alanın listesi, silmesi ve bildirimi ayrı", async () => {
    const { ctx: a, kullanici } = kiraciOlustur("IkiAlan");
    const { ctx: diger } = kiraciOlustur("IkiAlanDiger");
    db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(kullanici.id, diger.tenantId);
    const a2 = baglamUret(kullanici.id, diger.tenantId)!;
    const c1 = cihazUret();
    const c2 = cihazUret();
    await cihazKaydet(a, c1);
    await cihazKaydet(a2, c2);
    const [l1, l2] = [repo.pushCihazlariListele(a), repo.pushCihazlariListele(a2)];
    expect(l1).toHaveLength(1);
    expect(l2).toHaveLength(1);
    expect(repo.pushCihaziKaldir(a, l2[0].id)).toBe(false);
    expect(repo.pushAboneligiSil(a, c2.endpoint)).toBe(false);
    expect(repo.pushCihazlariListele(a2)).toEqual(l2);
    expect(sistem.bildirimAlicilari(a.tenantId, null).map((x) => x.endpoint)).toEqual([c1.endpoint]);
  });
});

describe("PWA: servis çalışanı, manifest, simgeler", () => {
  it("manifest: ana ekrandan gelen kutusu açılır; simgeler ve maskelenebilir simge", () => {
    const m = manifest();
    expect(m).toMatchObject({ name: "Harita CRM", start_url: "/gelen-kutusu", scope: "/", display: "standalone", lang: "tr" });
    expect(m.icons?.map((i) => [i.src, i.sizes, i.purpose])).toEqual([
      ["/icon/192", "192x192", "any"],
      ["/icon/512", "512x512", "any"],
      ["/icon/maskable", "512x512", "maskable"],
    ]);
  });

  it("servis çalışanı: sayfa ve API önbelleğe alınmaz; bildirimde yalnızca başlık; tıklayınca yalnızca gelen kutusu", () => {
    const sw = oku("public/sw.js");
    // Önbelleğe yalnızca çevrimdışı sayfası girer; fetch yalnızca GET sayfa açılışını ele alır.
    expect(sw.match(/\.add\(|\.put\(|\.addAll\(/g)).toEqual([".add("]);
    expect(sw).toContain('istek.mode !== "navigate" || istek.method !== "GET"');
    // Bildirim gövdesi (body) yok; adres yalnızca /gelen-kutusu ve aynı köken.
    const secenekler = /showNotification\(baslik, (\{.*\})\)/.exec(sw)?.[1];
    expect(secenekler).toBe('{ tag: etiket, renotify: true, icon: "/icon/192", badge: "/icon/192", data: { url } }');
    expect(sw).toContain('veri.url.startsWith("/gelen-kutusu")');
    expect(sw).toContain("hedef.origin !== self.location.origin");
    expect(fs.existsSync(path.join(KOK, "public/cevrimdisi.html"))).toBe(true);
    const ayar = oku("next.config.ts");
    expect(ayar).toMatch(/source: "\/sw\.js"[\s\S]*no-cache, no-store, must-revalidate/);
  });

  it("PWA dosyaları oturum yönlendirmesine takılmaz", () => {
    for (const y of ["/sw.js", "/manifest.webmanifest", "/icon/192", "/apple-icon", "/cevrimdisi.html"]) expect(oturumYoluMu(y), y).toBe(false);
  });

  it("izin yalnızca kullanıcı düğmeye basınca istenir (sayfa açılışında istenmez)", () => {
    const istemci = oku("src/lib/bildirim-istemci.ts");
    const yenile = istemci.slice(istemci.indexOf("export async function aboneligiYenile"));
    expect(yenile.slice(0, yenile.indexOf("\n}\n"))).not.toContain("requestPermission");
    expect(istemci.match(/requestPermission/g)).toHaveLength(1);
    expect(istemci.slice(istemci.indexOf("export async function bildirimiAc"))).toMatch(/^export async function bildirimiAc[\s\S]*?requestPermission/);
  });
});

