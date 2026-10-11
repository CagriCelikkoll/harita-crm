// Abonelikten çıkma: imzalı belirteç (sahtelenemez, kiracılar arası çalışmaz), ret akışı, e-posta başlıkları
// (List-Unsubscribe / List-Unsubscribe-Post) ve altbilgi; sayfa yalnızca gönderen unvanını gösterir.
import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { abonelikBelirteciCoz, abonelikBelirteciUret } from "@/server/messaging/abonelik-belirteci";
import { adresOzeti } from "@/server/messaging/adres";
import { smtpSaglayici } from "@/server/messaging/smtp";
import { engelliOzetler, engelSayisi } from "@/server/repo/engel-listesi";
import { iletiAyarlariGetir, iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import { kayitGetir, kayitSil } from "@/server/repo/kayitlar";
import { olaylariListele } from "@/server/repo/olaylar";
import { abonelikSayfaBilgisi, aboneliktenCik } from "@/server/servisler/abonelik";
import { iletiOlustur } from "@/server/servisler/mesaj";
import { POST } from "@/app/api/abonelik/[belirtec]/route";
import { kiraciOlustur } from "./yardimci/fabrika";
import { kayitOlustur } from "./yardimci/mesaj-fabrika";

function hazirla(eposta = "alici@ornek.test") {
  const { ctx } = kiraciOlustur(`Abn${Math.random().toString(36).slice(2, 7)}`);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "Alsancak, İzmir · 0232 000 00 00", iysNo: "IYS-778899" });
  const kayit = kayitOlustur(ctx, { eposta, isletmeAdi: "Gizli İşletme Adı", notlar: "gizli not" });
  const belirtec = abonelikBelirteciUret({
    tenantId: ctx.tenantId,
    leadId: kayit.id,
    kanal: "eposta",
    adresOzeti: adresOzeti(ctx.tenantId, "eposta", eposta),
  });
  return { ctx, kayit, belirtec };
}

describe("abonelik belirteci", () => {
  it("kiracı, kayıt, kanal ve adres özetini taşır; kişisel veri içermez", () => {
    const { ctx, kayit, belirtec } = hazirla();
    expect(abonelikBelirteciCoz(belirtec)).toEqual({
      tenantId: ctx.tenantId,
      leadId: kayit.id,
      kanal: "eposta",
      adresOzeti: adresOzeti(ctx.tenantId, "eposta", "alici@ornek.test"),
    });
    expect(Buffer.from(belirtec, "base64url").toString("latin1")).not.toContain("alici");
    expect(belirtec).toMatch(/^[A-Za-z0-9_-]{110}$/);
  });

  it("tek bir bayt değiştirilmiş, kısaltılmış ya da uydurma belirteç reddedilir", () => {
    const { belirtec } = hazirla();
    const bayt = Buffer.from(belirtec, "base64url");
    for (let i = 0; i < bayt.length; i++) {
      const bozuk = Buffer.from(bayt);
      bozuk[i] ^= 0x01;
      expect(abonelikBelirteciCoz(bozuk.toString("base64url")), `bayt ${i}`).toBeNull();
    }
    expect(abonelikBelirteciCoz(belirtec.slice(0, -2))).toBeNull();
    expect(abonelikBelirteciCoz("A".repeat(110))).toBeNull();
    expect(abonelikBelirteciCoz("../../etc/passwd")).toBeNull();
    expect(aboneliktenCik(belirtec.slice(0, -1) + (belirtec.endsWith("A") ? "B" : "A"))).toBe(false);
  });

  it("kiracı alanı başka kiracıyla değiştirilirse imza tutmaz", () => {
    const a = hazirla();
    const b = hazirla();
    const bayt = Buffer.from(a.belirtec, "base64url");
    Buffer.from(b.ctx.tenantId.replace(/-/g, ""), "hex").copy(bayt, 1); // kiracı UUID'sini B ile değiştir
    Buffer.from(b.kayit.id.replace(/-/g, ""), "hex").copy(bayt, 17); // kayıt UUID'sini B'ninki yap
    expect(abonelikBelirteciCoz(bayt.toString("base64url"))).toBeNull();
    expect(aboneliktenCik(bayt.toString("base64url"))).toBe(false);
    expect(kayitGetir(b.ctx, b.kayit.id)!.iletiIzni).toBe("bekliyor");
  });

  it("A kiracısının (geçerli imzalı) belirteci B'nin kaydını ve engel listesini etkilemez", () => {
    const a = hazirla();
    const b = hazirla("b-alici@ornek.test");
    // A adına, B'nin kayıt kimliğiyle üretilmiş (imzası geçerli) belirteç.
    const capraz = abonelikBelirteciUret({
      tenantId: a.ctx.tenantId,
      leadId: b.kayit.id,
      kanal: "eposta",
      adresOzeti: adresOzeti(a.ctx.tenantId, "eposta", "b-alici@ornek.test"),
    });
    expect(aboneliktenCik(capraz)).toBe(true); // yalnızca A'nın engel listesine yazar
    expect(kayitGetir(b.ctx, b.kayit.id)!.iletiIzni).toBe("bekliyor");
    expect(olaylariListele(b.ctx, b.kayit.id).some((o) => o.tur === "ret")).toBe(false);
    expect(engelSayisi(b.ctx)).toBe(0);
    // Adres özetleri kiracıya bağlı: aynı adres B'de engelli görünmez.
    expect(engelliOzetler(b.ctx, [adresOzeti(b.ctx.tenantId, "eposta", "b-alici@ornek.test")]).size).toBe(0);
  });
});

describe("abonelikten çıkma akışı", () => {
  it("ileti_izni = ret, adres engel listesine, lead_events'e 'ret'; tekrar tıklamak çift olay yazmaz", async () => {
    const { ctx, kayit, belirtec } = hazirla();
    const y = await POST(new Request("https://crm.ornek.test/x", { method: "POST", body: "List-Unsubscribe=One-Click" }), {
      params: Promise.resolve({ belirtec }),
    });
    expect(y.status).toBe(200);
    expect(kayitGetir(ctx, kayit.id)!.iletiIzni).toBe("ret");
    expect(engelliOzetler(ctx, [adresOzeti(ctx.tenantId, "eposta", "alici@ornek.test")]).size).toBe(1);
    expect(olaylariListele(ctx, kayit.id).filter((o) => o.tur === "ret")).toHaveLength(1);
    expect(aboneliktenCik(belirtec)).toBe(true);
    expect(olaylariListele(ctx, kayit.id).filter((o) => o.tur === "ret")).toHaveLength(1);
  });

  it("kayıt silinmiş olsa da adres engel listesine yazılır", () => {
    const { ctx, kayit, belirtec } = hazirla("silinen@ornek.test");
    kayitSil(ctx, kayit.id);
    expect(aboneliktenCik(belirtec)).toBe(true);
    expect(engelliOzetler(ctx, [adresOzeti(ctx.tenantId, "eposta", "silinen@ornek.test")]).size).toBe(1);
  });

  it("geçersiz belirteçte uç nokta 404 döner, hiçbir şey yazmaz", async () => {
    const once = (db.$client.prepare("select count(*) n from engel_listesi").get() as { n: number }).n;
    const y = await POST(new Request("https://crm.ornek.test/x", { method: "POST" }), { params: Promise.resolve({ belirtec: "gecersiz" }) });
    expect(y.status).toBe(404);
    expect((db.$client.prepare("select count(*) n from engel_listesi").get() as { n: number }).n).toBe(once);
  });

  it("sayfa yalnızca gönderen unvanını döndürür (kayıt / kiracı bilgisi yok)", () => {
    const { belirtec } = hazirla();
    const bilgi = abonelikSayfaBilgisi(belirtec);
    expect(bilgi).toEqual({ gonderenUnvani: "Ege Emlak Ltd." });
    expect(JSON.stringify(bilgi)).not.toMatch(/Gizli|gizli|alici|IYS|İzmir/);
    expect(abonelikSayfaBilgisi("gecersiz")).toBeNull();
  });
});

describe("e-posta içeriği", () => {
  it("altbilgide unvan, iletişim, İYS no ve abonelik bağlantısı; List-Unsubscribe ve -Post başlıkları; ham iletide de var", async () => {
    const { ctx, kayit } = hazirla();
    const ileti = iletiOlustur({
      ctx,
      kanal: "eposta",
      kampanya: { sablon: "Merhaba {isletme},\nTeklifimiz var.", konu: "Teklif", bosIsimHitabi: null },
      kayit,
      adres: "alici@ornek.test",
      ayar: iletiAyarlariGetir(ctx),
    });
    expect(ileti.metin).toContain("Merhaba Gizli İşletme Adı,");
    expect(ileti.metin).toContain("Ege Emlak Ltd.");
    expect(ileti.metin).toContain("Alsancak, İzmir");
    expect(ileti.metin).toContain("İYS No: IYS-778899");
    expect(ileti.aboneliktenCikmaBaglantisi).toMatch(/^https:\/\/crm\.ornek\.test\/abonelik\/[A-Za-z0-9_-]+$/);
    expect(ileti.metin).toContain(ileti.aboneliktenCikmaBaglantisi);
    expect(ileti.html).toContain(`href="${ileti.aboneliktenCikmaBaglantisi}"`);
    expect(ileti.basliklar).toEqual({
      "List-Unsubscribe": `<${ileti.aboneliktenCikmaBaglantisi.replace("/abonelik/", "/api/abonelik/")}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(abonelikBelirteciCoz(ileti.aboneliktenCikmaBaglantisi.split("/").pop()!)).toMatchObject({ leadId: kayit.id });

    // Gerçek SMTP adaptörüyle üretilen ham ileti (gönderilmeden, bellekte).
    let ham = "";
    const saglayici = smtpSaglayici(
      { sunucu: "smtp.ornek.test", port: 587, kullanici: "k", sifre: "s", gonderen: "bilgi@ege.test" },
      {
        cozucu: async () => [{ address: "93.184.216.34", family: 4 }],
        tasiyiciOlustur: () => {
          const t = nodemailer.createTransport({ streamTransport: true, buffer: true });
          const gonder = t.sendMail.bind(t);
          t.sendMail = (async (m: Parameters<typeof gonder>[0]) => {
            const bilgi = await gonder(m);
            ham = (bilgi as unknown as { message: Buffer }).message.toString();
            return bilgi;
          }) as typeof t.sendMail;
          return t;
        },
      },
    );
    expect((await saglayici.gonder(ileti)).durum).toBe("gonderildi");
    expect(ham).toMatch(/^List-Unsubscribe:\s+<https:\/\/crm\.ornek\.test\/api\/abonelik\/[A-Za-z0-9_-]+>/m); // uzun başlık katlanabilir
    expect(ham).toMatch(/^List-Unsubscribe-Post: List-Unsubscribe=One-Click/m);
    expect(ham).toMatch(/^From: .*bilgi@ege\.test/m);
    expect(ham).toMatch(/^To: alici@ornek\.test/m);
  });

  it("işletme adı boşsa {isletme} kaldırılır ya da kampanyanın hitabı kullanılır; Places adı hiçbir zaman kullanılmaz", () => {
    const { ctx } = hazirla();
    const adsiz = kayitOlustur(ctx, { eposta: "adsiz@ornek.test" });
    const yap = (bosIsimHitabi: string | null) =>
      iletiOlustur({
        ctx,
        kanal: "eposta",
        kampanya: { sablon: "Merhaba {isletme},", konu: "K", bosIsimHitabi },
        kayit: adsiz,
        adres: "adsiz@ornek.test",
        ayar: iletiAyarlariGetir(ctx),
      }).metin;
    expect(yap(null).startsWith("Merhaba,\n")).toBe(true);
    expect(yap("Değerli yetkili").startsWith("Merhaba Değerli yetkili,\n")).toBe(true);
  });
});
