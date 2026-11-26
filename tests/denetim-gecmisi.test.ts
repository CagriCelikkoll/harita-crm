// Kalan eksikler: kayıt ayrıntısındaki İYS metni çalışma alanının İYS kontrolü ayarına bağlı; İYS kontrolü ve toplu
// işlem denetim geçmişi (yalnızca yönetici, yalnızca kendi çalışma alanı); Meta teslim hata kodlarının açıklamaları.
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const kayitlar = await import("@/server/repo/kayitlar");
const { iysKontroluDegistir } = await import("@/server/repo/ileti-ayarlari");
const { baglamUret } = await import("@/server/repo/sistem/uyelik");
const { iysDurumMetni, DENETIM_IYS_KONTROLU } = await import("@/lib/mesajlasma");
const { DENETIM_TOPLU_KAYIT, iysDegeriAdi, topluDenetimOzeti } = await import("@/lib/denetim");
const { teslimHataAciklamasi, teslimHataMetni, TESLIM_HATA_ACIKLAMALARI } = await import("@/lib/whatsapp-api");
const denetimRotasi = await import("@/app/api/denetim/route");
const kayitRotasi = await import("@/app/api/kayitlar/[id]/route");
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");

const KOK = path.resolve(__dirname, "..");
const oku = (d: string) => fs.readFileSync(path.join(KOK, d), "utf8");
const U = "https://crm.ornek.test";
let sayac = 0;

beforeEach(() => {
  oturum.ctx = null;
});

function uyeEkle(ctx: TenantContext) {
  const uye = kullaniciOlustur(`DenetimUye${++sayac}`);
  db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(uye.id, ctx.tenantId);
  return baglamUret(uye.id, ctx.tenantId)!;
}
const gecmis = async (ctx: TenantContext | null, olay: string) => {
  oturum.ctx = ctx;
  return denetimRotasi.GET(new Request(`${U}/api/denetim?olay=${olay}`));
};

describe("kayıt ayrıntısı: İYS metni İYS kontrolü ayarına bağlı", () => {
  it("kontrol açıkken beyan durumu (yoksa uyarı); kapalıyken yalnızca nötr 'İYS kontrolü kapalı'", () => {
    expect(iysDurumMetni(true, true)).toBe(" · İYS beyanı var");
    expect(iysDurumMetni(true, false)).toMatch(/İYS beyanı yok \(kampanyaya yalnızca test modunda/);
    expect(iysDurumMetni(false, false)).toBe(" · İYS kontrolü kapalı");
    expect(iysDurumMetni(false, true)).toBe(" · İYS kontrolü kapalı");
    const panel = oku("src/app/(app)/kayitlar/detay-paneli.tsx");
    expect(panel).toContain("iysDurumMetni(props.iysKontrolu, w.iysBeyani)");
    expect(panel).not.toContain("İYS beyanı yok (kampanyaya");
  });

  it("ayrıntı API'si çalışma alanının İYS kontrolünü döndürür", async () => {
    const { ctx } = kiraciOlustur(`IysAyrinti${++sayac}`);
    const [k] = kayitlar.kisileriEkle(ctx, [{ kaynak: "elle", yetkiliAdi: "Ayşe", aliciTuru: "bireysel" }], "t");
    const al = async () => {
      oturum.ctx = ctx;
      return (await (await kayitRotasi.GET(new Request(`${U}/api/kayitlar/${k.id}`), { params: Promise.resolve({ id: k.id }) })).json()).iysKontrolu;
    };
    expect(await al()).toBe(true);
    iysKontroluDegistir(ctx, { acik: false, onay: true });
    expect(await al()).toBe(false);
  });
});

describe("denetim geçmişi (/api/denetim)", () => {
  it("İYS kontrolü: bütün açma / kapama kayıtları yeniden eskiye (tarih, kişi, yeni değer, açıklama); yalnızca yönetici", async () => {
    const { ctx, kullanici } = kiraciOlustur(`IysGecmis${++sayac}`);
    iysKontroluDegistir(ctx, { acik: false, onay: true }, new Date("2026-11-01T09:00:00Z"));
    iysKontroluDegistir(ctx, { acik: true }, new Date("2026-11-02T09:00:00Z"));
    iysKontroluDegistir(ctx, { acik: false, onay: true }, new Date("2026-11-03T09:00:00Z"));

    const y = await gecmis(ctx, DENETIM_IYS_KONTROLU);
    expect(y.status).toBe(200);
    const { kayitlar: satirlar } = await y.json();
    expect(satirlar.map((s: { deger: string }) => iysDegeriAdi(s.deger))).toEqual(["Kapatıldı", "Açıldı", "Kapatıldı"]);
    expect(satirlar[0]).toMatchObject({ tarih: "2026-11-03T09:00:00.000Z", kullanici: kullanici.name, aciklama: expect.stringContaining("İYS kontrolü kapatıldı") });

    expect((await gecmis(uyeEkle(ctx), DENETIM_IYS_KONTROLU)).status).toBe(403);
    expect((await gecmis(null, DENETIM_IYS_KONTROLU)).status).toBe(401);
    expect((await gecmis(ctx, "baska_olay")).status).toBe(400);
    // Başka çalışma alanı bu kayıtları görmez.
    const { ctx: baska } = kiraciOlustur(`IysGecmisB${++sayac}`);
    expect((await (await gecmis(baska, DENETIM_IYS_KONTROLU)).json()).kayitlar).toEqual([]);
  });

  it("toplu işlem: kayıtlar listelenir ve işlem, kayıt sayısı, izin kaynağı, beyan ayrıştırılır", async () => {
    const { ctx, kullanici } = kiraciOlustur(`TopluGecmis${++sayac}`);
    const kisiler = kayitlar.kisileriEkle(
      ctx,
      [1, 2, 3].map((i) => ({ kaynak: "elle" as const, yetkiliAdi: `K${i}`, ekTelefon: `90533${String(5_000_000 + sayac * 10 + i)}`, aliciTuru: "tacir_esnaf" as const })),
      "t",
    );
    kayitlar.kayitlariTopluGuncelle(ctx, { idler: kisiler.map((k) => k.id) }, { tur: "etiket_ekle", etiket: "sicak" });
    kayitlar.kayitlariTopluGuncelle(ctx, { idler: kisiler.map((k) => k.id) }, { tur: "whatsapp_izni", kaynak: "siparis", aciklama: "Form", beyan: true });

    const { kayitlar: satirlar } = await (await gecmis(ctx, DENETIM_TOPLU_KAYIT)).json();
    expect(satirlar).toHaveLength(2);
    const [izin, etiket] = satirlar.map((s: { deger: string; aciklama: string }) => topluDenetimOzeti(s.deger, s.aciklama));
    expect(izin).toMatchObject({ islem: "WhatsApp iznini kaydet", secim: "seçilen kayıtlar", hedef: 3, degisen: 3, beyan: true });
    expect(izin.izinKaynagi).toMatch(/^Sipariş sırasında numara verdi \(Form\)$/);
    expect(etiket).toMatchObject({ islem: "Etiket ekle", ayrinti: '"sicak" etiketi ekleme', hedef: 3, degisen: 3, izinKaynagi: null, beyan: null });
    expect(satirlar[0].kullanici).toBe(kullanici.name);
    expect((await gecmis(uyeEkle(ctx), DENETIM_TOPLU_KAYIT)).status).toBe(403);
  });

  it("tanınmayan açıklama biçiminde sayılar boş kalır (açıklama yine gösterilir)", () => {
    expect(topluDenetimOzeti("alici_turu", "eski biçim")).toMatchObject({ islem: "Alıcı türünü değiştir", hedef: null, degisen: null, beyan: null });
  });

  it("arayüz: Ayarlar'da 'Geçmişi göster' yalnızca yöneticiye; Kayıtlar'da 'Toplu işlem geçmişi' yalnızca yöneticiye", () => {
    const ayar = oku("src/app/(app)/ayarlar/mesajlasma-ayarlari.tsx");
    expect(ayar).toContain("{props.yonetici && <DenetimGecmisi olay={DENETIM_IYS_KONTROLU} degerAdi={iysDegeriAdi}");
    expect(oku("src/components/denetim-gecmisi.tsx")).toContain("Geçmişi göster");
    const sayfa = oku("src/app/(app)/kayitlar/page.tsx");
    expect(sayfa).toMatch(/\{ctx\.rol === "yonetici" && \(\s*<Link href="\/kayitlar\/toplu-gecmisi" className="dugme">\s*Toplu işlem geçmişi/);
    const gecmisSayfasi = oku("src/app/(app)/kayitlar/toplu-gecmisi/page.tsx");
    expect(gecmisSayfasi).toContain("const kayitlar = yonetici ? denetimKayitlariListele(ctx, { olay: DENETIM_TOPLU_KAYIT, limit: 200 }) : [];");
    for (const b of ["Tarih", "Kişi", "İşlem", "Kayıt sayısı", "İzin kaynağı / beyan"]) expect(gecmisSayfasi).toContain(`font-semibold">${b}</th>`);
  });
});

describe("Meta teslim hata kodları", () => {
  it("130472 ve bilinen diğer kodlar Türkçe açıklamalı; bilinmeyen kod 'Meta hata kodu X'", () => {
    expect(teslimHataAciklamasi(130472)).toBe("Meta'nın pazarlama deneyi — Meta bu kişiye bilerek teslim etmedi, ücret alınmaz");
    for (const kod of [131047, 131050, 131051, 131021, 131026, 131049, 131053]) expect(teslimHataAciklamasi(kod), String(kod)).toBeTruthy();
    expect(teslimHataMetni(131050)).toBe("131050: kişi pazarlama iletilerini durdurdu");
    expect(teslimHataMetni(999999)).toBe("Meta hata kodu 999999");
    expect(teslimHataAciklamasi(null)).toBeNull();
    // Açıklamalar kısa ve Türkçe (büyük harfle başlayan İngilizce Meta başlığı değil).
    for (const [kod, metin] of Object.entries(TESLIM_HATA_ACIKLAMALARI)) {
      expect(metin.length, kod).toBeLessThan(100);
      expect(metin, kod).not.toMatch(/^(Message|User|Re-engagement|Unsupported|Recipient)/);
    }
    expect(oku("src/app/(app)/kampanyalar/[id]/kampanya-detayi.tsx")).toContain("`Meta hata kodu ${x.kod}`");
  });
});
