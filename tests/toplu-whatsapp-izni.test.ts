// Kayıtlar toplu işlemi "WhatsApp iznini kaydet": yalnızca yönetici; izin kaynağı ("Diğer" ise açıklama) ve beyan
// zorunlu; her kayda izin tarihi (işlem anı), kaynak ve kaydeden kullanıcı yazılır, olay ve denetim kaydı (kaynak, beyan
// metni, kişi sayısı) eklenir. RET vermiş, engel listesinde, "WhatsApp yok" ya da ileti reddi olan kayıtlar atlanır;
// 'ret' satırı asla geri açılmaz, İYS beyanına dokunulmaz. Bir toplu işlemde en fazla 500 kayıt (filtreye uyan tümü dahil).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KayitKuraliHatasi, YetkiHatasi, type TenantContext } from "@/server/repo/baglam";
import type { TopluIslem, YeniKisi } from "@/server/repo/kayitlar";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const kayitlar = await import("@/server/repo/kayitlar");
const { engelEkle, engelSayisi, retIsle } = await import("@/server/repo/engel-listesi");
const { whatsappIzniAyarla, whatsappKisisiGetir, whatsappYokIsaretle } = await import("@/server/repo/whatsapp-kisileri");
const { olaylariListele } = await import("@/server/repo/olaylar");
const { denetimKayitlariListele } = await import("@/server/repo/denetim");
const { baglamUret } = await import("@/server/repo/sistem/uyelik");
const { adresOzeti } = await import("@/server/messaging/adres");
const { WHATSAPP_TOPLU_IZIN_BEYANI } = await import("@/lib/mesajlasma");
const { TOPLU_ISLEM_SINIRI_METNI } = await import("@/lib/sabitler");
const rota = await import("@/app/api/kayitlar/toplu/route");
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");

let sayac = 0;
const telefon = () => `90533${String(1_000_000 + ++sayac).slice(-7)}`;

beforeEach(() => {
  oturum.ctx = null;
});

function kisiler(ctx: TenantContext, etiket: string, adet: number, ek: Partial<YeniKisi> = {}) {
  return kayitlar.kisileriEkle(
    ctx,
    Array.from({ length: adet }, (_, i) => ({
      kaynak: "elle" as const,
      yetkiliAdi: `${etiket} ${i + 1}`,
      ekTelefon: telefon(),
      etiketler: [etiket],
      aliciTuru: "tacir_esnaf" as const,
      ...ek,
    })),
    "Test",
  );
}

const izin = (ek: Partial<Extract<TopluIslem, { tur: "whatsapp_izni" }>> = {}): TopluIslem => ({
  tur: "whatsapp_izni",
  kaynak: "mevcut_musteri",
  beyan: true,
  ...ek,
});

const istek = (govde: unknown) =>
  new Request("https://crm.ornek.test/api/kayitlar/toplu", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://crm.ornek.test" },
    body: JSON.stringify(govde),
  });
const idIle = (idler: string[], islem: unknown) => istek({ secim: { tur: "idler", idler }, islem });

describe("toplu WhatsApp izni: yetki", () => {
  it("üye rolü izin kaydedemez (repo YetkiHatasi, API 403); WhatsApp satırı oluşmaz", async () => {
    const { ctx } = kiraciOlustur("IzinYetki");
    const [k] = kisiler(ctx, "yetki", 1);
    const uye = kullaniciOlustur(`IzinUye${++sayac}`);
    db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(uye.id, ctx.tenantId);
    const uyeCtx = baglamUret(uye.id, ctx.tenantId)!;

    expect(() => kayitlar.kayitlariTopluGuncelle(uyeCtx, { idler: [k.id] }, izin())).toThrow(YetkiHatasi);
    oturum.ctx = uyeCtx;
    expect((await rota.POST(idIle([k.id], izin()))).status).toBe(403);
    expect(whatsappKisisiGetir(ctx, k.id)).toBeNull();
  });
});

describe("toplu WhatsApp izni: beyan ve kaynak zorunlu", () => {
  it("beyan, kaynak ve 'Diğer' açıklaması olmadan hiçbir şey yazılmaz (API 400, repo KayitKuraliHatasi)", async () => {
    const { ctx } = kiraciOlustur("IzinBeyan");
    const [k] = kisiler(ctx, "beyan", 1);
    oturum.ctx = ctx;
    const durum = async (islem: unknown) => (await rota.POST(idIle([k.id], islem))).status;

    expect(await durum({ tur: "whatsapp_izni", kaynak: "mevcut_musteri" })).toBe(400); // beyan yok
    expect(await durum({ tur: "whatsapp_izni", kaynak: "mevcut_musteri", beyan: false })).toBe(400);
    expect(await durum({ tur: "whatsapp_izni", beyan: true })).toBe(400); // kaynak yok
    expect(await durum({ tur: "whatsapp_izni", kaynak: "reklam", beyan: true })).toBe(400); // toplu işlemde seçilemez
    expect(await durum({ tur: "whatsapp_izni", kaynak: "diger", beyan: true })).toBe(400); // açıklama yok
    expect(await durum({ tur: "whatsapp_izni", kaynak: "diger", aciklama: "   ", beyan: true })).toBe(400);

    expect(() => kayitlar.kayitlariTopluGuncelle(ctx, { idler: [k.id] }, izin({ beyan: false }))).toThrow(KayitKuraliHatasi);
    expect(() => kayitlar.kayitlariTopluGuncelle(ctx, { idler: [k.id] }, izin({ kaynak: "diger", aciklama: " " }))).toThrow(
      /açıklama/,
    );
    expect(whatsappKisisiGetir(ctx, k.id)).toBeNull();
    expect(denetimKayitlariListele(ctx)).toHaveLength(0);

    // Tamamı verilince olur: "Diğer" açıklaması izin notu olur.
    const y = await rota.POST(idIle([k.id], { tur: "whatsapp_izni", kaynak: "diger", aciklama: "Fuarda kartvizit verdi", beyan: true }));
    expect(y.status).toBe(200);
    expect(whatsappKisisiGetir(ctx, k.id)).toMatchObject({ izin: "var", izinKaynagi: "diger", izinNotu: "Fuarda kartvizit verdi" });
  });
});

describe("toplu WhatsApp izni: kayda yazılanlar, atlananlar, denetim", () => {
  it("RET, ileti reddi, engel listesi ve 'WhatsApp yok' atlanır; ret geri açılmaz; İYS beyanı ve engel listesi değişmez", () => {
    const { ctx, kullanici } = kiraciOlustur("IzinAtla");
    const [normal, iysli, iletiRet, yalnizIletiRet, waRet, engelliTel, waYok, waYokEski, zatenVar] = kisiler(ctx, "izin", 9);
    // Satırı var, izni 'yok' ama İYS beyan tarihi dolu (eski veri): beyan alanına dokunulmamalı.
    const iysTarihi = new Date("2026-01-05T10:00:00Z");
    db.$client
      .prepare("insert into whatsapp_kisileri (tenant_id, lead_id, izin, iys_beyan_tarihi) values (?, ?, 'yok', ?)")
      .run(ctx.tenantId, iysli.id, iysTarihi.getTime());
    retIsle(ctx, { leadId: iletiRet.id, adresler: [], kaynak: "abonelik", aciklama: "Abonelikten çıktı" });
    // Yalnızca genel ileti reddi (WhatsApp satırı yok) ve yalnızca WhatsApp reddi (ileti izni ret değil).
    db.$client.prepare("update leads set ileti_izni = 'ret' where id = ?").run(yalnizIletiRet.id);
    db.$client.prepare("insert into whatsapp_kisileri (tenant_id, lead_id, izin) values (?, ?, 'ret')").run(ctx.tenantId, waRet.id);
    engelEkle(ctx, [{ tur: "telefon", ozet: adresOzeti(ctx.tenantId, "telefon", engelliTel.ekTelefon!) }], "sms_ret");
    whatsappYokIsaretle(ctx, waYok.id);
    whatsappYokIsaretle(ctx, waYokEski.id, new Date(Date.now() - 100 * 86_400_000)); // 90 günden eski: engel değil
    whatsappIzniAyarla(ctx, zatenVar.id, { izin: "var", kaynak: "form", not: "Web formu" });

    const once = new Map([iletiRet, yalnizIletiRet, waRet, zatenVar].map((k) => [k.id, whatsappKisisiGetir(ctx, k.id)]));
    const engelOnce = engelSayisi(ctx);
    const baslangic = Date.now();

    const s = kayitlar.kayitlariTopluGuncelle(
      ctx,
      { filtre: { grup: "tum", etiket: "izin" }, beklenenToplam: 9 },
      izin({ kaynak: "siparis", aciklama: "Sipariş formu" }),
    );
    expect(s).toEqual({
      hedef: 9,
      degisen: 3, // normal, iysli, waYokEski
      atlanan: { ayni: 1, ret: 3, engelli: 1, whatsapp_yok: 1, meta_reklam: 0, etiket_siniri: 0 },
      bulunamayan: 0,
    });

    for (const k of [normal, iysli, waYokEski]) {
      const w = whatsappKisisiGetir(ctx, k.id)!;
      expect(w, k.yetkiliAdi!).toMatchObject({ izin: "var", izinKaynagi: "siparis", izinNotu: "Sipariş formu", izinKaydedenId: kullanici.id });
      expect(w.izinTarihi!.getTime()).toBeGreaterThanOrEqual(baslangic - 5);
      expect(w.izinTarihi!.getTime()).toBeLessThanOrEqual(Date.now());
      expect(olaylariListele(ctx, k.id).find((o) => o.tur === "izin")).toMatchObject({
        aciklama: "Toplu işlem: WhatsApp izni kaydedildi (Sipariş sırasında numara verdi: Sipariş formu)",
        kullaniciId: kullanici.id,
      });
    }
    expect(whatsappKisisiGetir(ctx, normal.id)!.iysBeyanTarihi).toBeNull();
    expect(whatsappKisisiGetir(ctx, iysli.id)!.iysBeyanTarihi).toEqual(iysTarihi);

    // Atlananlar: aynen.
    for (const [id, w] of once) expect(whatsappKisisiGetir(ctx, id)).toEqual(w);
    expect(whatsappKisisiGetir(ctx, yalnizIletiRet.id)).toBeNull();
    expect(whatsappKisisiGetir(ctx, engelliTel.id)).toBeNull();
    expect(whatsappKisisiGetir(ctx, waYok.id)!.izin).toBe("yok");
    expect(whatsappKisisiGetir(ctx, waRet.id)!.izin).toBe("ret");
    expect(kayitlar.kayitGetir(ctx, yalnizIletiRet.id)!.iletiIzni).toBe("ret");
    expect(engelSayisi(ctx)).toBe(engelOnce);
    for (const k of [iletiRet, waRet, engelliTel, waYok, zatenVar]) {
      expect(olaylariListele(ctx, k.id).some((o) => o.aciklama?.startsWith("Toplu işlem")), k.yetkiliAdi!).toBe(false);
    }

    // Denetim kaydı: kaynak, açıklama, beyan metni, kişi sayısı, kim.
    const [d] = denetimKayitlariListele(ctx, { olay: "toplu_kayit_islemi" });
    expect(d).toMatchObject({ deger: "whatsapp_izni", kullaniciId: kullanici.id, kullaniciAdi: kullanici.name });
    expect(d.aciklama).toContain("filtreye uyan tümü");
    expect(d.aciklama).toContain("kaynak: Sipariş sırasında numara verdi (Sipariş formu)");
    expect(d.aciklama).toContain("İzin kaydedilen kişi sayısı: 3");
    expect(d.aciklama).toContain(`Onaylanan beyan: "${WHATSAPP_TOPLU_IZIN_BEYANI}"`);
    expect(d.aciklama).toContain("9 kayıt");

    // Tekrar: RET'li kayıtlar yine açılmaz, yeni izinler ezilmez.
    const ikinci = kayitlar.kayitlariTopluGuncelle(ctx, { idler: [iletiRet.id, waRet.id, normal.id] }, izin({ kaynak: "form" }));
    expect(ikinci).toMatchObject({ degisen: 0, atlanan: { ret: 2, ayni: 1 } });
    expect(whatsappKisisiGetir(ctx, normal.id)!.izinKaynagi).toBe("siparis");
  });

});

describe("toplu WhatsApp izni: izolasyon", () => {
  it("başka çalışma alanının kayıtlarına id ile ya da filtreyle izin yazılmaz", async () => {
    const { ctx: A } = kiraciOlustur("IzinA");
    const { ctx: B } = kiraciOlustur("IzinB");
    const a = kisiler(A, "ortak-izin", 2);
    const b = kisiler(B, "ortak-izin", 2);

    expect(kayitlar.kayitlariTopluGuncelle(A, { idler: [...a, ...b].map((k) => k.id) }, izin())).toMatchObject({
      hedef: 2,
      degisen: 2,
      bulunamayan: 2,
    });
    oturum.ctx = A;
    const y = await rota.POST(
      istek({ secim: { tur: "filtre", sorgu: "grup=tum&etiket=ortak-izin", beklenenToplam: 2 }, islem: izin({ kaynak: "form" }) }),
    );
    expect((await y.json()).sonuc).toMatchObject({ hedef: 2, degisen: 0, atlanan: { ayni: 2 } });
    for (const k of b) {
      expect(whatsappKisisiGetir(B, k.id)).toBeNull();
      expect(olaylariListele(B, k.id).map((o) => o.aciklama)).toEqual(["Test"]);
    }
    expect(denetimKayitlariListele(B)).toHaveLength(0);
  });
});

describe("toplu işlem: en fazla 500 kayıt", () => {
  it("filtreye uyan tümü 500'ü aşarsa hiçbir şey yazılmaz (400, uyarı metni); 500 olur", async () => {
    const { ctx } = kiraciOlustur("IzinSinir");
    const hepsi = kisiler(ctx, "sinir", 501);
    oturum.ctx = ctx;
    for (const islem of [izin(), { tur: "etiket_ekle", etiket: "x" }]) {
      const y = await rota.POST(istek({ secim: { tur: "filtre", sorgu: "grup=tum&etiket=sinir", beklenenToplam: 501 }, islem }));
      expect(y.status).toBe(400);
      expect((await y.json()).hata).toBe(TOPLU_ISLEM_SINIRI_METNI);
    }
    expect(() => kayitlar.kayitlariTopluGuncelle(ctx, { filtre: { grup: "tum", etiket: "sinir" } }, izin())).toThrow(KayitKuraliHatasi);
    expect(() => kayitlar.kayitlariTopluGuncelle(ctx, { idler: hepsi.map((k) => k.id) }, izin())).toThrow(KayitKuraliHatasi);
    expect((await rota.POST(idIle(hepsi.map((k) => k.id), izin()))).status).toBe(400);
    expect(hepsi.some((k) => whatsappKisisiGetir(ctx, k.id))).toBe(false);
    expect(denetimKayitlariListele(ctx)).toHaveLength(0);

    // Tam 500: olur.
    const y = await rota.POST(idIle(hepsi.slice(0, 500).map((k) => k.id), izin()));
    expect(y.status).toBe(200);
    expect((await y.json()).sonuc).toMatchObject({ hedef: 500, degisen: 500 });
  });
});
