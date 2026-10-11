// Sağlayıcı kimlik bilgileri ve SMTP güvenliği:
// - Kimlik bilgileri veritabanında şifreli; başka kiracının satırına taşınırsa / anahtar değişirse çözülemez.
// - Hiçbir API yanıtında kimlik bilgisi dönmez.
// - SMTP SSRF koruması: iç ağ / metadata adresleri ve izinsiz portlar reddedilir; bağlantı doğrulanan IP'ye
//   yapılır ve her gönderimde yeniden doğrulanır (DNS yeniden bağlama).
// - Test gönderimi: yalnızca kayıtlı gönderen adresine, kiracı başına saatte en fazla 5.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));
const dns = vi.hoisted(() => ({ adresler: [{ address: "93.184.216.34", family: 4 }] as { address: string; family: number }[] }));
vi.mock("node:dns/promises", () => ({ lookup: async () => dns.adresler }));
const posta = vi.hoisted(() => ({ gonderilen: [] as Record<string, unknown>[], secenekler: [] as Record<string, unknown>[] }));
vi.mock("nodemailer", () => {
  const createTransport = (secenek: Record<string, unknown>) => {
    posta.secenekler.push(secenek);
    return {
      sendMail: async (m: Record<string, unknown>) => {
        posta.gonderilen.push(m);
        return { messageId: "<test@ornek>" };
      },
      close: () => {},
    };
  };
  return { default: { createTransport }, createTransport };
});

const { db } = await import("@/server/db");
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");
const { baglamUret } = await import("@/server/repo/sistem/uyelik");
const { coz, sifrele, SifreCozmeHatasi } = await import("@/server/messaging/sifreleme");
const { genelIpMi, smtpHedefiDogrula } = await import("@/server/messaging/ag-guvenligi");
const { smtpSaglayici } = await import("@/server/messaging/smtp");
const { saglayiciSifreliGetir } = await import("@/server/repo/saglayicilar");
const saglayiciRotasi = await import("@/app/api/ayarlar/saglayicilar/[kanal]/route");
const testRotasi = await import("@/app/api/ayarlar/saglayicilar/[kanal]/test/route");
const iletiRotasi = await import("@/app/api/ayarlar/ileti/route");
const kampanyaRotasi = await import("@/app/api/kampanyalar/route");
const kampanyaDetayRotasi = await import("@/app/api/kampanyalar/[id]/route");
const ozetRotasi = await import("@/app/api/kampanyalar/ozet/route");
const { kayitOlustur } = await import("./yardimci/mesaj-fabrika");

const SMTP = {
  sunucu: "smtp.gizli-sunucu.test",
  port: 587,
  kullanici: "kullanici-GIZLI-adi",
  sifre: "SIFRE-gizli-123!",
  gonderen: "Bilgi@Ornek-Alan.test",
};
const GIZLILER = [SMTP.sunucu, SMTP.kullanici, SMTP.sifre];

const istek = (url: string, method: string, govde?: unknown) =>
  new Request(`https://crm.ornek.test${url}`, {
    method,
    headers: { "content-type": "application/json", origin: "https://crm.ornek.test" },
    body: govde === undefined ? undefined : JSON.stringify(govde),
  });
const baglam = <P extends object>(p: P) => ({ params: Promise.resolve(p) });

async function govdeMetni(yanit: Response) {
  return yanit.status === 204 ? "" : await yanit.text();
}
function gizliIcermez(metin: string) {
  for (const g of GIZLILER) expect(metin).not.toContain(g);
}

beforeEach(() => {
  dns.adresler = [{ address: "93.184.216.34", family: 4 }];
  posta.gonderilen.length = 0;
  posta.secenekler.length = 0;
});

describe("kimlik bilgileri: şifreli saklama", () => {
  it("veritabanında düz metin yok; AAD (kiracı|kanal) ve anahtar olmadan çözülemez", async () => {
    const { ctx } = kiraciOlustur("Sifre");
    oturum.ctx = ctx;
    const y = await saglayiciRotasi.PUT(istek("/api/ayarlar/saglayicilar/eposta", "PUT", SMTP), baglam({ kanal: "eposta" }));
    expect(y.status).toBe(200);

    const ham = db.$client.prepare("select * from saglayici_ayarlari where tenant_id = ?").get(ctx.tenantId);
    gizliIcermez(JSON.stringify(ham));
    expect(JSON.stringify(ham)).not.toContain("bilgi@ornek-alan.test");

    const kayit = saglayiciSifreliGetir(ctx, "eposta")!;
    expect(coz<typeof SMTP>(kayit.sifreliVeri, ctx.tenantId, "eposta")).toMatchObject({ sifre: SMTP.sifre });
    const baska = kiraciOlustur("Baska").ctx;
    expect(() => coz(kayit.sifreliVeri, baska.tenantId, "eposta")).toThrow(SifreCozmeHatasi);
    expect(() => coz(kayit.sifreliVeri, ctx.tenantId, "sms")).toThrow(SifreCozmeHatasi);

    // Başka kiracının satırına kopyalanan şifreli değer o kiracının sağlayıcısı olarak kullanılamaz.
    db.$client
      .prepare("insert into saglayici_ayarlari (tenant_id, kanal, saglayici, sifreli_veri) values (?, 'eposta', 'smtp', ?)")
      .run(baska.tenantId, kayit.sifreliVeri);
    const { gercekSaglayici } = await import("@/server/servisler/saglayici");
    expect(() => gercekSaglayici(baska, "eposta")).toThrow(SifreCozmeHatasi);

    const eskiAnahtar = process.env.ILETI_SIFRELEME_ANAHTARI;
    vi.stubEnv("ILETI_SIFRELEME_ANAHTARI", Buffer.alloc(32, 7).toString("base64"));
    expect(() => coz(kayit.sifreliVeri, ctx.tenantId, "eposta")).toThrow(SifreCozmeHatasi);
    vi.unstubAllEnvs();
    expect(process.env.ILETI_SIFRELEME_ANAHTARI).toBe(eskiAnahtar);
  });

  it("aynı değer her şifrelemede farklı metin üretir (rastgele IV)", () => {
    expect(sifrele({ a: 1 }, "t", "eposta")).not.toBe(sifrele({ a: 1 }, "t", "eposta"));
  });
});

describe("kimlik bilgileri: hiçbir API yanıtında dönmez", () => {
  it("ayarlar, sağlayıcı, test gönderimi ve kampanya uç noktalarının yanıtları gizli bilgi içermez", async () => {
    const { ctx } = kiraciOlustur("Yanit");
    oturum.ctx = ctx;
    const yanitlar: Response[] = [];
    yanitlar.push(await saglayiciRotasi.PUT(istek("/x", "PUT", SMTP), baglam({ kanal: "eposta" })));
    yanitlar.push(await iletiRotasi.GET());
    yanitlar.push(await iletiRotasi.PUT(istek("/x", "PUT", { gonderenUnvani: "Yanıt Ltd." })));
    yanitlar.push(await testRotasi.POST(istek("/x", "POST"), baglam({ kanal: "eposta" })));
    kayitOlustur(ctx, { eposta: "alici@ornek.test" });
    const kampanya = { kanal: "eposta", ad: "K", konu: "K", sablon: "Merhaba", filtre: {}, testModu: false };
    yanitlar.push(await ozetRotasi.POST(istek("/x", "POST", kampanya)));
    const olustur = await kampanyaRotasi.POST(istek("/x", "POST", { ...kampanya, testModu: true }));
    yanitlar.push(olustur.clone());
    const { id } = (await olustur.json()) as { id: string };
    yanitlar.push(await kampanyaDetayRotasi.GET(istek(`/api/kampanyalar/${id}`, "GET"), baglam({ id })));
    yanitlar.push(await saglayiciRotasi.DELETE(istek("/x", "DELETE"), baglam({ kanal: "eposta" })));

    for (const y of yanitlar) {
      expect(y.status, await y.clone().text()).toBeLessThan(400);
      gizliIcermez(await govdeMetni(y));
    }
    const ayar = (await (await iletiRotasi.GET()).json()) as { ayarlar: { saglayicilar: { eposta: { tanimli: boolean } } } };
    expect(ayar.ayarlar.saglayicilar.eposta).toEqual({ tanimli: false, saglayici: null, guncellemeTarihi: null });
  });

  it("yönetici olmayan üye sağlayıcı bilgisi kaydedemez ve test gönderemez", async () => {
    const { ctx } = kiraciOlustur("Rol");
    const uye = kullaniciOlustur("RolUye");
    db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(uye.id, ctx.tenantId);
    oturum.ctx = baglamUret(uye.id, ctx.tenantId);
    expect((await saglayiciRotasi.PUT(istek("/x", "PUT", SMTP), baglam({ kanal: "eposta" }))).status).toBe(403);
    expect((await testRotasi.POST(istek("/x", "POST"), baglam({ kanal: "eposta" }))).status).toBe(403);
    expect(saglayiciSifreliGetir(ctx, "eposta")).toBeNull();
  });
});

describe("test gönderimi", () => {
  it("yalnızca kayıtlı gönderen adresine gider; istemcinin verdiği alıcı yok sayılır; saatte en fazla 5", async () => {
    const { ctx } = kiraciOlustur("Test");
    oturum.ctx = ctx;
    await saglayiciRotasi.PUT(istek("/x", "PUT", SMTP), baglam({ kanal: "eposta" }));
    const durumlar: number[] = [];
    for (let i = 0; i < 6; i++) {
      durumlar.push((await testRotasi.POST(istek("/x", "POST", { alici: "baska@kotu.test", kime: "baska@kotu.test" }), baglam({ kanal: "eposta" }))).status);
    }
    expect(durumlar).toEqual([200, 200, 200, 200, 200, 429]);
    expect(posta.gonderilen).toHaveLength(5);
    expect(new Set(posta.gonderilen.map((m) => m.to))).toEqual(new Set(["bilgi@ornek-alan.test"]));
    // Sınır kiracı başına: başka kiracı etkilenmez.
    const diger = kiraciOlustur("Test2").ctx;
    oturum.ctx = diger;
    await saglayiciRotasi.PUT(istek("/x", "PUT", SMTP), baglam({ kanal: "eposta" }));
    expect((await testRotasi.POST(istek("/x", "POST"), baglam({ kanal: "eposta" }))).status).toBe(200);
  });
});

describe("SMTP SSRF koruması", () => {
  it("iç ağ, loopback, link-local, metadata ve ayrılmış adresler genel IP sayılmaz", () => {
    for (const ip of [
      "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0",
      "100.64.0.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fd00:ec2::254", "fc00::1",
      "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe", "0:0:0:0:0:ffff:7f00:1",
    ]) {
      expect(genelIpMi(ip), ip).toBe(false);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(genelIpMi(ip), ip).toBe(true);
    }
  });

  it("port yalnızca 25, 465, 587, 2525; sunucu adı iç adrese çözülüyorsa (tek bir adres bile) reddedilir", async () => {
    const genel = async () => [{ address: "93.184.216.34", family: 4 }];
    await expect(smtpHedefiDogrula("smtp.ornek.test", 587, genel)).resolves.toEqual({
      sunucuAdi: "smtp.ornek.test",
      ip: "93.184.216.34",
      port: 587,
    });
    for (const port of [22, 80, 443, 3306, 6379, 8080]) {
      await expect(smtpHedefiDogrula("smtp.ornek.test", port, genel)).rejects.toThrow(/port/i);
    }
    for (const kotu of [
      [{ address: "127.0.0.1", family: 4 }],
      [{ address: "169.254.169.254", family: 4 }],
      [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }],
      [{ address: "::1", family: 6 }],
    ]) {
      await expect(smtpHedefiDogrula("metadata.google.internal.test", 587, async () => kotu)).rejects.toThrow(/iç ağ/);
    }
    for (const ip of ["127.0.0.1", "[::1]", "169.254.169.254", "0.0.0.0"]) {
      await expect(smtpHedefiDogrula(ip, 25, genel)).rejects.toThrow(/iç ağ/);
    }
    await expect(smtpHedefiDogrula("localhost", 25, genel)).rejects.toThrow();
    await expect(smtpHedefiDogrula("smtp.ornek.test", 587, async () => [])).rejects.toThrow(/çözülemedi/);
  });

  it("kaydederken iç adrese çözülen sunucu reddedilir (API 400, hiçbir şey kaydedilmez)", async () => {
    const { ctx } = kiraciOlustur("Ssrf");
    oturum.ctx = ctx;
    dns.adresler = [{ address: "192.168.0.10", family: 4 }];
    const y = await saglayiciRotasi.PUT(istek("/x", "PUT", SMTP), baglam({ kanal: "eposta" }));
    expect(y.status).toBe(400);
    expect(saglayiciSifreliGetir(ctx, "eposta")).toBeNull();
    const port = await saglayiciRotasi.PUT(istek("/x", "PUT", { ...SMTP, port: 6379 }), baglam({ kanal: "eposta" }));
    expect(port.status).toBe(400);
  });

  it("bağlantı doğrulanan IP'ye yapılır; her gönderimde yeniden çözülür (DNS yeniden bağlama reddedilir)", async () => {
    let cagri = 0;
    const cozucu = async () => (++cagri === 1 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]);
    const hedefler: { ip: string; sunucuAdi: string }[] = [];
    const saglayici = smtpSaglayici(SMTP, {
      cozucu,
      tasiyiciOlustur: (hedef) => {
        hedefler.push(hedef);
        return { sendMail: async () => ({ messageId: "m" }), close: () => {} } as never;
      },
    });
    const ileti = { kanal: "eposta" as const, alici: "a@ornek.test", metin: "x", aboneliktenCikmaBaglantisi: "https://x", aliciTuru: "tacir_esnaf" as const };
    expect((await saglayici.gonder(ileti)).durum).toBe("gonderildi");
    expect(hedefler).toEqual([{ sunucuAdi: "smtp.gizli-sunucu.test", ip: "93.184.216.34", port: 587 }]);
    expect(await saglayici.gonder(ileti)).toMatchObject({ durum: "kalici_hata" });
    expect(hedefler).toHaveLength(1); // ikinci gönderimde bağlantı kurulmadı
  });

  it("varsayılan taşıyıcı IP'ye bağlanır, TLS sunucu adını doğrular", async () => {
    const saglayici = smtpSaglayici(SMTP, { cozucu: async () => [{ address: "93.184.216.34", family: 4 }] });
    await saglayici.gonder({ kanal: "eposta", alici: "a@ornek.test", metin: "x", aboneliktenCikmaBaglantisi: "https://x", aliciTuru: "tacir_esnaf" });
    expect(posta.secenekler[0]).toMatchObject({ host: "93.184.216.34", port: 587, tls: { servername: "smtp.gizli-sunucu.test" } });
  });
});
