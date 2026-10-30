// Ret ve izin doğruluğu: ret geri alınamaz (depo ve PATCH rotası); ret verilmiş kaydın gönderim anında Places'tan
// alınmış telefonu ve sonradan eklenen adresleri (kayıt güncelleme, içe aktarma, BSUID) engel listesine yazılır ve
// aynı adresli başka kayda SMS / e-posta / WhatsApp günlük liste / WhatsApp API ile gönderilmez; WhatsApp izinli ya
// da reklamdan gelen bireysel kişinin alıcı türünü tacir/esnaf yapmak yalnızca yöneticiye (reklamda açıklamayla) açık.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { adresOzeti, telefonNormallestir } = await import("@/server/messaging/adres");
const { aliciDegerlendir } = await import("@/server/messaging/alici-kurallari");
const { mockPlacesIstemcisi } = await import("@/server/places/mock");
const { KayitKuraliHatasi, _baglamDamgala } = await import("@/server/repo/baglam");
const { engelliOzetler, retIsle } = await import("@/server/repo/engel-listesi");
const { iceAktarmaOlustur, iceAktarmaUygula } = await import("@/server/repo/ice-aktarmalar");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kampanyaMesajlari } = await import("@/server/repo/kampanyalar");
const { kayitGetir, kayitGuncelle, kisileriEkle } = await import("@/server/repo/kayitlar");
const { olaylariListele } = await import("@/server/repo/olaylar");
const { bsuidAta, whatsappIzniAyarla, whatsappKisisiGetir } = await import("@/server/repo/whatsapp-kisileri");
const { engelSorgusuOlustur } = await import("@/server/servisler/ileti");
const { isciTuru } = await import("@/server/servisler/isci");
const { kampanyaBaslat } = await import("@/server/servisler/kampanya");
const rota = await import("@/app/api/kayitlar/[id]/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");
const { kayitOlustur, SahteSaglayici } = await import("./yardimci/mesaj-fabrika");

const OGLE = new Date("2026-10-12T09:00:00Z"); // 12:00 İstanbul
const U = "https://crm.ornek.test";

function kiraci() {
  const { ctx } = kiraciOlustur(`Ret${Math.random().toString(36).slice(2, 7)}`);
  db.$client.prepare("update tenants set aylik_places_kotasi = 6000 where id = ?").run(ctx.tenantId);
  iletiAyarlariGuncelle(ctx, {
    gonderenUnvani: "Ege Emlak",
    iletisimBilgisi: "İzmir",
    iysNo: "123456",
    sorumlulukOnayi: true,
    smsRetNumarasi: "0850 111 22 33",
  });
  const uye = _baglamDamgala({ tenantId: ctx.tenantId, userId: ctx.userId, rol: "uye" });
  return { ctx, uye };
}

async function cepYeri(atla = 0) {
  const istemci = mockPlacesIstemcisi();
  for (let i = 0, bulunan = 0; ; i++) {
    const id = `mock_cafe_30000_${i}`;
    const y = await istemci.yerDetayi(id, "telefon");
    if (y?.telefonUluslararasi?.startsWith("+90 5") && bulunan++ === atla) return { id, tel: y.telefonUluslararasi };
  }
}

const patch = (id: string, govde: unknown) =>
  rota.PATCH(new Request(`${U}/api/kayitlar/${id}`, { method: "PATCH", body: JSON.stringify(govde) }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  db.$client.prepare("update message_queue set durum = 'iptal' where durum in ('kuyrukta', 'gonderiliyor')").run();
  db.$client.prepare("update kampanyalar set durum = 'iptal' where durum in ('zamanlandi', 'calisiyor')").run();
});

describe("ret geri alınamaz", () => {
  it("depo katmanı ve PATCH rotası ret → başka değer geçişini reddeder (400 ve neden); diğer alanlar güncellenebilir", async () => {
    const { uye } = kiraci();
    const k = kayitOlustur(uye, { eposta: "kisi@ornek.com", aliciTuru: "tacir_esnaf", iletiIzni: "onayli" });
    retIsle(uye, { leadId: k.id, adresler: [], kaynak: "abonelik", aciklama: "abonelikten çıktı" });

    expect(() => kayitGuncelle(uye, k.id, { iletiIzni: "onayli" })).toThrow(KayitKuraliHatasi);
    expect(() => kayitGuncelle(uye, k.id, { iletiIzni: "bekliyor" })).toThrow(/geri alınamaz/);
    expect(kayitGetir(uye, k.id)?.iletiIzni).toBe("ret");

    oturum.ctx = uye;
    const y = await patch(k.id, { iletiIzni: "onayli" });
    expect(y.status).toBe(400);
    expect((await y.json()).hata).toMatch(/ret geri alınamaz/);
    expect(kayitGetir(uye, k.id)?.iletiIzni).toBe("ret");

    // Ret'i yeniden göndermek ya da başka alanı değiştirmek serbest.
    expect((await patch(k.id, { iletiIzni: "ret", notlar: "aradı" })).status).toBe(200);
    expect(kayitGetir(uye, k.id)).toMatchObject({ iletiIzni: "ret", notlar: "aradı" });
  });
});

describe("ret verilmiş kaydın tüm adresleri engellenir", () => {
  it("gönderim anında Places'tan alınan telefon: ret sonrası aynı numaralı başka kayda SMS, WhatsApp günlük liste ve WhatsApp API gitmez", async () => {
    const { ctx } = kiraci();
    const yer = await cepYeri();
    const google = kayitOlustur(ctx, { aliciTuru: "tacir_esnaf" }, yer.id);
    kampanyaBaslat(ctx, { kanal: "sms", ad: "İlk", sablon: "Merhaba", filtre: {}, testModu: false }, OGLE);
    const s = new SahteSaglayici("sms", true);
    await isciTuru({ simdi: () => OGLE, parti: 50, saglayiciSec: () => s });
    expect(s.gonderilen).toHaveLength(1); // numara Places'tan gönderim anında alındı

    // Kişi e-posta kampanyasından çıktı: ret.
    retIsle(ctx, { leadId: google.id, adresler: [], kaynak: "abonelik", aciklama: "abonelikten çıktı" });
    const tel = telefonNormallestir(yer.tel)!;
    const ozet = adresOzeti(ctx.tenantId, "telefon", tel);
    expect(engelliOzetler(ctx, [ozet]).has(ozet)).toBe(true);

    // Aynı numara başka bir kayıtta (ör. içe aktarma) — hiçbir yoldan gönderilmez.
    const [baska] = kisileriEkle(ctx, [{ kaynak: "ice_aktarma", ekTelefon: yer.tel, aliciTuru: "tacir_esnaf", etiketler: ["ikinci"] }], "x");
    whatsappIzniAyarla(ctx, baska.id, { izin: "var", kaynak: "form" });
    const kayit = kayitGetir(ctx, baska.id)!;
    const engel = engelSorgusuOlustur(ctx, [kayit]);
    expect(aliciDegerlendir(kayit, "sms", engel)).toEqual({ uygun: false, neden: "engel" });
    expect(aliciDegerlendir(kayit, "whatsapp", engel)).toEqual({ uygun: false, neden: "engel" });
    const wa = whatsappKisisiGetir(ctx, baska.id);
    expect(aliciDegerlendir({ ...kayit, whatsapp: wa }, "whatsapp_api", engel)).toEqual({ uygun: false, neden: "engel" });

    // Uçtan uca SMS kampanyası: kayıt hariç (engel), ret verilmiş Google kaydı hariç (ret), ilgisiz kişi gönderilir.
    kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: "0532 999 00 01", aliciTuru: "tacir_esnaf" }], "x");
    const k2 = kampanyaBaslat(ctx, { kanal: "sms", ad: "İkinci", sablon: "Merhaba", filtre: {}, testModu: false }, OGLE);
    const s2 = new SahteSaglayici("sms", true);
    await isciTuru({ simdi: () => OGLE, parti: 50, saglayiciSec: () => s2 });
    expect(s2.gonderilen.map((i) => i.alici)).toEqual(["905329990001"]);
    const m = kampanyaMesajlari(ctx, k2.id).mesajlar;
    expect(m.find((x) => x.leadId === baska.id)).toMatchObject({ durum: "haric", neden: "engel" });
    expect(m.find((x) => x.leadId === google.id)).toMatchObject({ durum: "haric", neden: "ret" });
  });

  it("ret verilmiş kayda sonradan eklenen e-posta (kayıt güncelleme ve içe aktarma), ek telefon ve BSUID engellenir", () => {
    const { ctx, uye } = kiraci();
    const [a, b] = kisileriEkle(
      ctx,
      [
        { kaynak: "elle", ekTelefon: "0532 222 00 01" },
        { kaynak: "elle", ekTelefon: "0532 222 00 02" },
      ],
      "x",
    );
    for (const k of [a, b]) retIsle(ctx, { leadId: k.id, adresler: [], kaynak: "kayit_ret", aciklama: "ret" });
    const engelli = (tur: "eposta" | "telefon" | "wa_kimlik", deger: string) => {
      const o = adresOzeti(ctx.tenantId, tur, deger);
      return engelliOzetler(ctx, [o]).has(o);
    };

    // Kayıt güncelleme (üye): e-posta ve ek telefon.
    kayitGuncelle(uye, a.id, { eposta: "yeni@ornek.com", ekTelefon: "0532 222 00 09" });
    expect(engelli("eposta", "yeni@ornek.com")).toBe(true);
    expect(engelli("telefon", "905322220009")).toBe(true);

    // İçe aktarma: çakışan kayıtta boş e-posta doldurulur.
    const oturumu = iceAktarmaOlustur(ctx, { dosyaAdi: "liste.csv", satirlar: [["telefon", "eposta"]] });
    iceAktarmaUygula(ctx, oturumu.id, {
      eslem: {} as never,
      yeniler: [],
      doldurmalar: [{ leadId: b.id, alanlar: { eposta: "aktarilan@ornek.com" }, izin: null }],
      sayilar: { hatali: 0, cakisan: 1, engelli: 0 },
      beyanOnaylandi: false,
    });
    expect(kayitGetir(ctx, b.id)?.eposta).toBe("aktarilan@ornek.com");
    expect(engelli("eposta", "aktarilan@ornek.com")).toBe(true);

    // WhatsApp BSUID'i sonradan bağlanır.
    bsuidAta(ctx, b.id, "TR.RET.1");
    expect(engelli("wa_kimlik", "TR.RET.1")).toBe(true);

    // Aynı e-postalı başka kayda e-posta gitmez.
    const [c] = kisileriEkle(ctx, [{ kaynak: "elle", eposta: "aktarilan@ornek.com", aliciTuru: "tacir_esnaf" }], "x");
    const kayitC = kayitGetir(ctx, c.id)!;
    expect(aliciDegerlendir(kayitC, "eposta", engelSorgusuOlustur(ctx, [kayitC]))).toEqual({ uygun: false, neden: "engel" });
  });
});

describe("alıcı türü: bireysel → tacir/esnaf", () => {
  it("WhatsApp izni 'var' olan kişide yalnızca yönetici; izinsiz kişide üye de değiştirebilir", async () => {
    const { ctx, uye } = kiraci();
    const [izinli, izinsiz] = kisileriEkle(
      ctx,
      [
        { kaynak: "elle", ekTelefon: "0532 333 00 01", aliciTuru: "bireysel" },
        { kaynak: "elle", ekTelefon: "0532 333 00 02", aliciTuru: "bireysel" },
      ],
      "x",
    );
    whatsappIzniAyarla(ctx, izinli.id, { izin: "var", kaynak: "form" });

    expect(() => kayitGuncelle(uye, izinli.id, { aliciTuru: "tacir_esnaf" })).toThrow(KayitKuraliHatasi);
    oturum.ctx = uye;
    expect((await patch(izinli.id, { aliciTuru: "tacir_esnaf" })).status).toBe(403);
    expect(kayitGetir(ctx, izinli.id)?.aliciTuru).toBe("bireysel");
    expect(kayitGuncelle(uye, izinsiz.id, { aliciTuru: "tacir_esnaf" })?.aliciTuru).toBe("tacir_esnaf");

    expect(kayitGuncelle(ctx, izinli.id, { aliciTuru: "tacir_esnaf" }, { aliciTuruAciklamasi: "Vergi levhası görüldü" })?.aliciTuru).toBe(
      "tacir_esnaf",
    );
    expect(olaylariListele(ctx, izinli.id).some((o) => o.tur === "izin" && o.aciklama?.includes("Vergi levhası görüldü"))).toBe(true);
  });

  it("Meta reklamından gelen kişide yönetici de açıklama yazmalı; değişiklik olay olarak loglanır", async () => {
    const { ctx, uye } = kiraci();
    const [reklam] = kisileriEkle(ctx, [{ kaynak: "meta_reklam", ekTelefon: "0532 444 00 01", aliciTuru: "bireysel" }], "reklam");
    whatsappIzniAyarla(ctx, reklam.id, { izin: "var", kaynak: "kendisi_yazdi" });

    expect(() => kayitGuncelle(uye, reklam.id, { aliciTuru: "tacir_esnaf" }, { aliciTuruAciklamasi: "x" })).toThrow(KayitKuraliHatasi);
    expect(() => kayitGuncelle(ctx, reklam.id, { aliciTuru: "tacir_esnaf" })).toThrow(/açıklama/);
    oturum.ctx = ctx;
    const y = await patch(reklam.id, { aliciTuru: "tacir_esnaf", aliciTuruAciklamasi: "  " });
    expect(y.status).toBe(400);
    expect(kayitGetir(ctx, reklam.id)?.aliciTuru).toBe("bireysel");

    expect((await patch(reklam.id, { aliciTuru: "tacir_esnaf", aliciTuruAciklamasi: "Kendi işletmesi için yazdı" })).status).toBe(200);
    expect(kayitGetir(ctx, reklam.id)?.aliciTuru).toBe("tacir_esnaf");
    const olay = olaylariListele(ctx, reklam.id).find((o) => o.tur === "izin" && o.aciklama?.startsWith("Alıcı türü"));
    expect(olay?.aciklama).toContain("Kendi işletmesi için yazdı");
  });
});
