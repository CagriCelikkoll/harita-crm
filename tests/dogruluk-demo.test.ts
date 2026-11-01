// Tarayıcı testi bulguları, Grup A: ret onaysız gönderilemez (kayıt, WhatsApp izni, günlük liste, içe aktarma);
// sahte Places yalnızca 0500 000 xx xx üretir; arayüzde npm komutu gösterilmez; alıcı türünün varsayılanı yoktur.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RET_ONAY_METNI } from "@/lib/mesajlasma";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { adresOzeti } = await import("@/server/messaging/adres");
const { mockPlaces, mockPlacesIstemcisi } = await import("@/server/places/mock");
const { engelliOzetler } = await import("@/server/repo/engel-listesi");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kayitGetir, kayitlariListele } = await import("@/server/repo/kayitlar");
const { gunlukListe } = await import("@/server/repo/whatsapp-listesi");
const { whatsappKisisiGetir } = await import("@/server/repo/whatsapp-kisileri");
const svc = await import("@/server/servisler/ice-aktarma");
const wa = await import("@/server/servisler/whatsapp");
const kayitRotasi = await import("@/app/api/kayitlar/[id]/route");
const yeniKayitRotasi = await import("@/app/api/kayitlar/route");
const waIzniRotasi = await import("@/app/api/kayitlar/[id]/whatsapp-izni/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");
const { kayitOlustur } = await import("./yardimci/mesaj-fabrika");

const KOK = path.resolve(__dirname, "..");
const U = "https://crm.ornek.test";
const SIMDI = new Date("2026-10-12T09:00:00Z");

const istek = (yontem: string, url: string, govde: unknown) =>
  new Request(`${U}${url}`, { method: yontem, body: JSON.stringify(govde), headers: { "content-type": "application/json" } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function kiraci() {
  const { ctx } = kiraciOlustur(`A${Math.random().toString(36).slice(2, 7)}`);
  oturum.ctx = ctx;
  return ctx;
}
const engelli = (ctx: TenantContext, telefon: string) =>
  engelliOzetler(ctx, [adresOzeti(ctx.tenantId, "telefon", telefon)]).size > 0;

describe("ret onaysız gönderilemez", () => {
  it("kayıt güncelleme (İleti reddi işaretle): retOnayi olmadan 400, kayıt ve engel listesi değişmez", async () => {
    const ctx = kiraci();
    const k = kayitOlustur(ctx, { ekTelefon: "0532 111 00 01", aliciTuru: "tacir_esnaf" });
    const y = await kayitRotasi.PATCH(istek("PATCH", `/api/kayitlar/${k.id}`, { iletiIzni: "ret" }), params(k.id));
    expect(y.status).toBe(400);
    expect((await y.json()).hata).toMatch(/geri alınamaz/);
    expect(kayitGetir(ctx, k.id)?.iletiIzni).toBe("bekliyor");
    expect(engelli(ctx, "905321110001")).toBe(false);

    const t = await kayitRotasi.PATCH(istek("PATCH", `/api/kayitlar/${k.id}`, { iletiIzni: "ret", retOnayi: true }), params(k.id));
    expect(t.status).toBe(200);
    expect(kayitGetir(ctx, k.id)?.iletiIzni).toBe("ret");
    expect(engelli(ctx, "905321110001")).toBe(true);
  });

  it("WhatsApp izni (Ret istedi): retOnayi olmadan 400, izin değişmez", async () => {
    const ctx = kiraci();
    const k = kayitOlustur(ctx, { ekTelefon: "0532 111 00 02", aliciTuru: "tacir_esnaf" });
    const url = `/api/kayitlar/${k.id}/whatsapp-izni`;
    const y = await waIzniRotasi.PUT(istek("PUT", url, { izin: "ret" }), params(k.id));
    expect(y.status).toBe(400);
    expect(whatsappKisisiGetir(ctx, k.id)?.izin ?? "yok").toBe("yok");
    expect(kayitGetir(ctx, k.id)?.iletiIzni).toBe("bekliyor");

    expect((await waIzniRotasi.PUT(istek("PUT", url, { izin: "ret", retOnayi: true }), params(k.id))).status).toBe(200);
    expect(whatsappKisisiGetir(ctx, k.id)?.izin).toBe("ret");
    expect(kayitGetir(ctx, k.id)?.iletiIzni).toBe("ret");
  });

  it("WhatsApp günlük liste (Ret istedi): retOnayi olmadan 400, öğe beklemede kalır", () => {
    const ctx = kiraci();
    iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak", whatsappSablonu: "Merhaba {isletme}" });
    const k = kayitOlustur(ctx, { ekTelefon: "0532 111 00 03", aliciTuru: "tacir_esnaf" });
    wa.listeHazirla(ctx, {}, SIMDI);
    const oge = gunlukListe(ctx, "2026-10-12").find((o) => o.leadId === k.id)!;

    expect(() => wa.sonucBildir(ctx, oge.id, { sonuc: "ret" })).toThrow(/geri alınamaz/);
    expect(gunlukListe(ctx, "2026-10-12").find((o) => o.id === oge.id)?.durum).toBe("bekliyor");
    expect(kayitGetir(ctx, k.id)?.iletiIzni).toBe("bekliyor");

    wa.sonucBildir(ctx, oge.id, { sonuc: "ret", retOnayi: true });
    expect(kayitGetir(ctx, k.id)?.iletiIzni).toBe("ret");
  });

  it("arayüz: ret gönderen her istek onay penceresinden (RetDugmesi) geçer ve retOnayi taşır", () => {
    const dosyalar = [
      "src/app/(app)/kayitlar/detay-paneli.tsx",
      "src/app/(app)/kampanyalar/whatsapp-listesi.tsx",
    ].map((d) => fs.readFileSync(path.join(KOK, d), "utf8"));
    for (const metin of dosyalar) {
      const retIstekleri = metin.match(/(iletiIzni|izin|sonuc): "ret"[^}]*}/g) ?? [];
      expect(retIstekleri.length).toBeGreaterThan(0);
      for (const r of retIstekleri) expect(r).toContain("retOnayi: true");
      expect(metin).toContain("<RetDugmesi");
      expect(metin).not.toMatch(/confirm\([^)]*(ret|geri alınamaz)/i); // eski tarayıcı onayı kaldırıldı
    }
    const pencere = fs.readFileSync(path.join(KOK, "src/components/ret-onayi.tsx"), "utf8");
    expect(pencere).toContain("RET_ONAY_METNI");
    expect(pencere).toContain("{props.ad}");
    expect(RET_ONAY_METNI).toBe("Bu kişiye hiçbir kanaldan ileti gönderilmeyecek ve bu işlem geri alınamaz.");
  });
});

describe("sahte Places yalnızca gerçek olamayan 0500 000 xx xx numaraları üretir", () => {
  it("120 yer için yerel ve uluslararası biçim; demo'nun elle girilen 0500 000 00 xx aralığıyla çakışmaz", async () => {
    const istemci = mockPlacesIstemcisi();
    for (let i = 0; i < 120; i++) {
      const id = `mock_${["cafe", "real_estate_agency", "car_repair"][i % 3]}_${10240 + i}_${7250 + (i % 17)}`;
      const y = await istemci.yerDetayi(id, "detay");
      expect(y?.telefon).toMatch(/^0 \(500\) 000 [1-9]\d \d\d$/);
      expect(y?.telefonUluslararasi).toMatch(/^\+90 500 000 [1-9]\d \d\d$/);
    }
  }, 30_000);

  it("sabit hat yalnızca testin açıkça istediği yerde (0 (212) 000 …, gerçek abone olamaz)", async () => {
    const id = "mock_cafe_1_1";
    mockPlaces.sabitHatlar.add(id);
    expect((await mockPlacesIstemcisi().yerDetayi(id, "telefon"))?.telefon).toMatch(/^0 \(212\) 000 /);
    mockPlaces.sabitHatlar.delete(id);
  });
});

describe("arayüzde npm komutu gösterilmez", () => {
  it("src/app ve src/components içindeki görünen metinlerde (yorumlar hariç) npm komutu yok", () => {
    const tara = (klasor: string): string[] =>
      fs.readdirSync(klasor, { withFileTypes: true }).flatMap((g) => {
        const tam = path.join(klasor, g.name);
        return g.isDirectory() ? tara(tam) : /\.tsx?$/.test(g.name) ? [tam] : [];
      });
    const ihlaller = [...tara(path.join(KOK, "src/app")), ...tara(path.join(KOK, "src/components"))].flatMap((dosya) =>
      fs
        .readFileSync(dosya, "utf8")
        .split("\n")
        .filter((s) => !/^\s*(\/\/|\*|\/\*)/.test(s) && /npm (run|test)/.test(s))
        .map((s) => `${path.relative(KOK, dosya)}: ${s.trim()}`),
    );
    expect(ihlaller).toEqual([]);
    const ayarlar = fs.readFileSync(path.join(KOK, "src/app/(app)/ayarlar/kullanim/page.tsx"), "utf8");
    expect(ayarlar).toContain("SINIR_ARTIRMA_METNI");
  });
});

describe("alıcı türünün varsayılanı yok", () => {
  it("Kişi ekle: alıcı türü gönderilmezse 400 ve açıklayıcı mesaj; seçilirse kaydedilir", async () => {
    const ctx = kiraci();
    const govde = { yetkiliAdi: "Ayşe", ekTelefon: "0532 111 00 04" };
    const y = await yeniKayitRotasi.POST(istek("POST", "/api/kayitlar", govde));
    expect(y.status).toBe(400);
    expect((await y.json()).hata).toMatch(/Alıcı türünü seçin/);
    expect(kayitlariListele(ctx).kayitlar).toHaveLength(0);

    const t = await yeniKayitRotasi.POST(istek("POST", "/api/kayitlar", { ...govde, aliciTuru: "bireysel" }));
    expect(t.status).toBe(201);
    expect(kayitlariListele(ctx).kayitlar[0].aliciTuru).toBe("bireysel");

    const form = fs.readFileSync(path.join(KOK, "src/app/(app)/kayitlar/yeni/yeni-kisi-formu.tsx"), "utf8");
    expect(form).toMatch(/name="aliciTuru"[^>]*defaultValue=""[^>]*required/);
  });

  const SECENEK = { cakisma: "atla", varsayilanIzinKaynagi: null, iysBeyani: false } as const;
  const metin = (s: string) => new TextEncoder().encode(s);

  it("içe aktarma: alıcı türü sütunu yoksa tüm dosya için seçim yapılmadan önizlenemez", async () => {
    const ctx = kiraci();
    const o = await svc.iceAktarmaBaslat(ctx, "l.csv", metin("Ad;Telefon\nAli;0532 111 00 05\n"));
    const eslem = { yetkiliAdi: 0, telefon: 1 };
    expect(() => svc.iceAktarmaOnizle(ctx, o.id, eslem, { ...SECENEK, varsayilanAliciTuru: null })).toThrow(
      /alıcı türü sütunu yok/,
    );
    const rapor = svc.iceAktarmaOnizle(ctx, o.id, eslem, { ...SECENEK, varsayilanAliciTuru: "tacir_esnaf" });
    expect(rapor).toMatchObject({ yeni: 1, hatali: 0 });
  });

  it("içe aktarma: sütun eşliyse ve seçim yoksa boş hücreli satır hatalıdır (sessizce bireysel olmaz)", async () => {
    const ctx = kiraci();
    const o = await svc.iceAktarmaBaslat(ctx, "l.csv", metin("Ad;Telefon;Tür\nAli;0532 111 00 06;kurumsal\nVeli;0532 111 00 07;\n"));
    const eslem = { yetkiliAdi: 0, telefon: 1, aliciTuru: 2 };
    const rapor = svc.iceAktarmaOnizle(ctx, o.id, eslem, { ...SECENEK, varsayilanAliciTuru: null });
    expect(rapor).toMatchObject({ yeni: 1, hatali: 1, sorunlar: [{ satir: 3, neden: "Alıcı türü boş (bireysel / kurumsal)" }] });
    const ikinci = svc.iceAktarmaOnizle(ctx, o.id, eslem, { ...SECENEK, varsayilanAliciTuru: "bireysel" });
    expect(ikinci).toMatchObject({ yeni: 2, hatali: 0 });
  });

  it("içe aktarma arayüzünün başlangıç seçeneğinde alıcı türü yok", () => {
    const sihirbaz = fs.readFileSync(path.join(KOK, "src/app/(app)/kayitlar/ice-aktar/sihirbaz.tsx"), "utf8");
    expect(sihirbaz).toContain("varsayilanAliciTuru: null,");
    expect(sihirbaz).not.toMatch(/varsayilanAliciTuru: "bireysel"/);
  });
});
