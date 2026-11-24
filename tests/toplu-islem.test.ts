// Kayıtlar listesinde toplu işlem: etiket ekle / kaldır, alıcı türünü değiştir. Yalnızca yönetici (repo ve API ucu);
// yalnızca bu çalışma alanının kayıtları; alıcı türü değişirken RET vermiş ve engel listesindeki kayıtlar atlanır,
// WhatsApp izni / ret alanları hiç değişmez; "filtreye uyan tümü" süzgeci sunucuda uygular (sayfa / boyut yok sayılır)
// ve onaylanan sayı değiştiyse hiçbir şey yazmaz (409). Ayrıca liste sırası (ad A-Z, Türkçe) ve sayfa boyutu.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopluSecimDegistiHatasi, YetkiHatasi, type TenantContext } from "@/server/repo/baglam";
import type { YeniKisi } from "@/server/repo/kayitlar";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const kayitlar = await import("@/server/repo/kayitlar");
const { engelEkle, engelSayisi, retIsle } = await import("@/server/repo/engel-listesi");
const { whatsappIzniAyarla, whatsappKisisiGetir } = await import("@/server/repo/whatsapp-kisileri");
const { olaylariListele } = await import("@/server/repo/olaylar");
const { denetimKayitlariListele } = await import("@/server/repo/denetim");
const { baglamUret } = await import("@/server/repo/sistem/uyelik");
const { adresOzeti } = await import("@/server/messaging/adres");
const { kayitFiltresiCoz, kayitSorgusu } = await import("@/lib/kayit-filtresi");
const { trSiraAnahtari } = await import("@/server/db");
const rota = await import("@/app/api/kayitlar/toplu/route");
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");

let sayac = 0;
const telefon = () => `90532${String(1_000_000 + ++sayac).slice(-7)}`;

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

function uyeBaglami(yonetici: TenantContext) {
  const uye = kullaniciOlustur(`Uye${++sayac}`);
  db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(uye.id, yonetici.tenantId);
  const ctx = baglamUret(uye.id, yonetici.tenantId)!;
  expect(ctx.rol).toBe("uye");
  return ctx;
}

const istek = (govde: unknown, origin = "https://crm.ornek.test") =>
  new Request("https://crm.ornek.test/api/kayitlar/toplu", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(govde),
  });

describe("toplu işlem: yetki", () => {
  it("üye rolü toplu işlem yapamaz (repo YetkiHatasi, API 403); oturumsuz 401; hiçbir kayıt değişmez", async () => {
    const { ctx } = kiraciOlustur("TopluYetki");
    const [k] = kisiler(ctx, "yetki", 1);
    const uye = uyeBaglami(ctx);

    expect(() => kayitlar.kayitlariTopluGuncelle(uye, { idler: [k.id] }, { tur: "etiket_ekle", etiket: "x" })).toThrow(YetkiHatasi);
    expect(() =>
      kayitlar.kayitlariTopluGuncelle(uye, { filtre: { grup: "tum" } }, { tur: "alici_turu", aliciTuru: "bireysel" }),
    ).toThrow(YetkiHatasi);

    const govde = { secim: { tur: "idler", idler: [k.id] }, islem: { tur: "etiket_ekle", etiket: "x" } };
    expect((await rota.POST(istek(govde))).status).toBe(401);
    oturum.ctx = uye;
    expect((await rota.POST(istek(govde))).status).toBe(403);
    oturum.ctx = ctx;
    expect((await rota.POST(istek(govde, "https://kotu.ornek.test"))).status).toBe(403); // CSRF
    expect(kayitlar.kayitGetir(ctx, k.id)).toMatchObject({ etiketler: ["yetki"], aliciTuru: "tacir_esnaf" });

    // Yönetici: olur.
    const y = await rota.POST(istek(govde));
    expect(y.status).toBe(200);
    expect((await y.json()).sonuc).toMatchObject({ hedef: 1, degisen: 1 });
    expect(kayitlar.kayitGetir(ctx, k.id)!.etiketler).toEqual(["yetki", "x"]);
  });

  it("geçersiz istekler 400: boş seçim, boş etiket, bilinmeyen alıcı türü, fazla id", async () => {
    const { ctx } = kiraciOlustur("TopluGecersiz");
    oturum.ctx = ctx;
    const gonder = async (govde: unknown) => (await rota.POST(istek(govde))).status;
    expect(await gonder({ secim: { tur: "idler", idler: [] }, islem: { tur: "etiket_ekle", etiket: "a" } })).toBe(400);
    expect(await gonder({ secim: { tur: "idler", idler: ["x"] }, islem: { tur: "etiket_ekle", etiket: "  " } })).toBe(400);
    expect(await gonder({ secim: { tur: "idler", idler: ["x"] }, islem: { tur: "alici_turu", aliciTuru: "kurum" } })).toBe(400);
    const cok = Array.from({ length: 501 }, (_, i) => `id-${i}`);
    expect(await gonder({ secim: { tur: "idler", idler: cok }, islem: { tur: "etiket_ekle", etiket: "a" } })).toBe(400);
    // Tenant dışarıdan verilemez (strict).
    expect(await gonder({ secim: { tur: "idler", idler: ["x"] }, islem: { tur: "etiket_ekle", etiket: "a" }, tenantId: "b" })).toBe(400);
  });
});

describe("toplu işlem: izolasyon", () => {
  it("başka çalışma alanının kayıtları ne id ile ne filtreyle değişir", async () => {
    const { ctx: A } = kiraciOlustur("TopluA");
    const { ctx: B } = kiraciOlustur("TopluB");
    const aKayitlar = kisiler(A, "ortak", 2);
    const bKayitlar = kisiler(B, "ortak", 3);

    const s = kayitlar.kayitlariTopluGuncelle(A, { idler: [...aKayitlar, ...bKayitlar].map((k) => k.id) }, { tur: "etiket_ekle", etiket: "yeni" });
    expect(s).toMatchObject({ hedef: 2, degisen: 2, bulunamayan: 3 });

    const f = kayitlar.kayitlariTopluGuncelle(A, { filtre: { grup: "tum", etiket: "ortak" } }, { tur: "alici_turu", aliciTuru: "bireysel" });
    expect(f).toMatchObject({ hedef: 2, degisen: 2 });

    // API ucu da: A'nın oturumuyla B'nin filtresi / id'leri.
    oturum.ctx = A;
    const y = await rota.POST(
      istek({ secim: { tur: "filtre", sorgu: "grup=tum&etiket=ortak", beklenenToplam: 2 }, islem: { tur: "etiket_kaldir", etiket: "ortak" } }),
    );
    expect((await y.json()).sonuc).toMatchObject({ hedef: 2, degisen: 2 });

    for (const k of bKayitlar) {
      expect(kayitlar.kayitGetir(B, k.id)).toEqual(k);
      expect(olaylariListele(B, k.id).map((o) => o.aciklama)).toEqual(["Test"]);
    }
    expect(denetimKayitlariListele(B)).toHaveLength(0);
    expect(denetimKayitlariListele(A, { olay: "toplu_kayit_islemi" })).toHaveLength(3);
  });
});

describe("toplu işlem: alıcı türü, RET ve engel listesi", () => {
  it("RET vermiş ve engel listesindeki kayıtlar atlanır; WhatsApp izni / ret alanları ve engel listesi değişmez", () => {
    const { ctx } = kiraciOlustur("TopluRet");
    const [normal, waIzinli, iletiRet, waRet, engelliTel, retEngelli] = kisiler(ctx, "grup", 6);
    const [ayni] = kisiler(ctx, "grup", 1, { aliciTuru: "bireysel" });
    const [reklam] = kisiler(ctx, "grup", 1, { kaynak: "meta_reklam", aliciTuru: "bireysel" });
    whatsappIzniAyarla(ctx, waIzinli.id, { izin: "var", kaynak: "form" });
    // Genel ileti reddi (retIsle: ileti izni + WhatsApp izni 'ret', adresler engel listesinde).
    retIsle(ctx, { leadId: iletiRet.id, adresler: [], kaynak: "abonelik", aciklama: "Abonelikten çıktı" });
    // Yalnızca WhatsApp kanalında ret görünen kayıt (eski veri / dış kaynak): ileti izni 'yok'.
    db.$client.prepare("insert into whatsapp_kisileri (tenant_id, lead_id, izin) values (?, ?, 'ret')").run(ctx.tenantId, waRet.id);
    // Kendi telefonu engel listesinde (ret vermemiş görünür, "Engelli").
    engelEkle(ctx, [{ tur: "telefon", ozet: adresOzeti(ctx.tenantId, "telefon", engelliTel.ekTelefon!) }], "sms_ret");
    retIsle(ctx, { leadId: retEngelli.id, adresler: [], kaynak: "kayit_ret", aciklama: "Ret" });

    const waOnce = new Map([waIzinli, iletiRet, waRet, retEngelli].map((k) => [k.id, whatsappKisisiGetir(ctx, k.id)]));
    const engelOnce = engelSayisi(ctx);
    const iletiIzniOnce = new Map([waIzinli, iletiRet, waRet].map((k) => [k.id, kayitlar.kayitGetir(ctx, k.id)!.iletiIzni]));
    expect(iletiIzniOnce.get(iletiRet.id)).toBe("ret");
    expect(iletiIzniOnce.get(waRet.id)).not.toBe("ret");

    const s = kayitlar.kayitlariTopluGuncelle(ctx, { filtre: { grup: "tum", etiket: "grup" } }, { tur: "alici_turu", aliciTuru: "bireysel" });
    expect(s).toEqual({
      hedef: 8,
      degisen: 2, // normal, waIzinli
      atlanan: { ayni: 2, ret: 3, engelli: 1, whatsapp_yok: 0, meta_reklam: 0, etiket_siniri: 0 },
      bulunamayan: 0,
    });
    expect(kayitlar.kayitGetir(ctx, normal.id)!.aliciTuru).toBe("bireysel");
    expect(kayitlar.kayitGetir(ctx, waIzinli.id)!.aliciTuru).toBe("bireysel");
    for (const k of [iletiRet, waRet, engelliTel, retEngelli]) expect(kayitlar.kayitGetir(ctx, k.id)!.aliciTuru, k.yetkiliAdi!).toBe("tacir_esnaf");
    for (const k of [ayni, reklam]) expect(kayitlar.kayitGetir(ctx, k.id)!.aliciTuru).toBe("bireysel");

    // İzin / ret alanları ve engel listesi aynen.
    for (const [id, once] of waOnce) expect(whatsappKisisiGetir(ctx, id)).toEqual(once);
    for (const [id, once] of iletiIzniOnce) expect(kayitlar.kayitGetir(ctx, id)!.iletiIzni).toBe(once);
    expect(engelSayisi(ctx)).toBe(engelOnce);
    // Değişen kayda olay yazılır; atlanana yazılmaz.
    expect(olaylariListele(ctx, normal.id).map((o) => o.aciklama)).toContain("Toplu işlem: alıcı türü Tacir / esnaf → Bireysel");
    expect(olaylariListele(ctx, engelliTel.id).some((o) => o.aciklama?.startsWith("Toplu işlem"))).toBe(false);

    // Geri yön (bireysel → tacir/esnaf): WhatsApp izinli kişi için İYS notu; Meta reklamı kaynaklı kişi atlanır (açıklama gerekir).
    const geri = kayitlar.kayitlariTopluGuncelle(
      ctx,
      { idler: [normal.id, waIzinli.id, reklam.id, iletiRet.id] },
      { tur: "alici_turu", aliciTuru: "tacir_esnaf" },
    );
    expect(geri).toMatchObject({ degisen: 2, atlanan: { meta_reklam: 1, ret: 1 } });
    expect(kayitlar.kayitGetir(ctx, reklam.id)!.aliciTuru).toBe("bireysel");
    expect(olaylariListele(ctx, waIzinli.id).find((o) => o.aciklama?.includes("İYS beyanı kuralı kalktı"))?.tur).toBe("izin");
    expect(whatsappKisisiGetir(ctx, waIzinli.id)).toEqual(waOnce.get(waIzinli.id));
  });

  it("etiket işlemleri: zaten olan / olmayan atlanır, etiket sınırı korunur, yalnızca etiketler alanı değişir", () => {
    const { ctx } = kiraciOlustur("TopluEtiket");
    const [a, b] = kisiler(ctx, "e", 2);
    const [dolu] = kisiler(ctx, "e", 1, { etiketler: ["e", ...Array.from({ length: 19 }, (_, i) => `t${i}`)] });
    const [retli] = kisiler(ctx, "e", 1);
    retIsle(ctx, { leadId: retli.id, adresler: [], kaynak: "abonelik", aciklama: "Ret" });
    kayitlar.kayitGuncelle(ctx, b.id, { etiketler: ["e", "vip"] });
    const retliOnce = kayitlar.kayitGetir(ctx, retli.id)!;

    const ekle = kayitlar.kayitlariTopluGuncelle(ctx, { idler: [a.id, b.id, dolu.id, retli.id] }, { tur: "etiket_ekle", etiket: "vip" });
    expect(ekle).toMatchObject({ hedef: 4, degisen: 2, atlanan: { ayni: 1, etiket_siniri: 1 } });
    expect(kayitlar.kayitGetir(ctx, a.id)!.etiketler).toEqual(["e", "vip"]);
    expect(kayitlar.kayitGetir(ctx, dolu.id)!.etiketler).toHaveLength(20);
    // Etiket RET'li kayda eklenir ama ret / izin alanlarına dokunulmaz.
    expect(kayitlar.kayitGetir(ctx, retli.id)).toMatchObject({ etiketler: ["e", "vip"], iletiIzni: "ret", aliciTuru: retliOnce.aliciTuru });

    const kaldir = kayitlar.kayitlariTopluGuncelle(ctx, { idler: [a.id, b.id, dolu.id] }, { tur: "etiket_kaldir", etiket: "vip" });
    expect(kaldir).toMatchObject({ degisen: 2, atlanan: { ayni: 1 } });
    expect(kayitlar.kayitGetir(ctx, b.id)!.etiketler).toEqual(["e"]);
  });
});

describe("toplu işlem: filtreye uyan tümünü seçme", () => {
  it("süzgeç sunucuda uygulanır; sayfa ve sayfa boyutu yok sayılır; süzgece uymayan kayda dokunulmaz", async () => {
    const { ctx } = kiraciOlustur("TopluFiltre");
    const hedef = kisiler(ctx, "kampanya", 120);
    const disari = kisiler(ctx, "baska", 5);
    // Sayfadaki 50 değil filtrenin 120 kaydı.
    expect(kayitlar.kayitlariListele(ctx, { grup: "tum", etiket: "kampanya" })).toMatchObject({ toplam: 120, boyut: 50, sayfaSayisi: 3 });

    oturum.ctx = ctx;
    const y = await rota.POST(
      istek({
        secim: { tur: "filtre", sorgu: "grup=tum&etiket=kampanya&sayfa=2&boyut=100&sira=ad", beklenenToplam: 120 },
        islem: { tur: "etiket_ekle", etiket: "Toplu" },
      }),
    );
    expect(y.status).toBe(200);
    expect((await y.json()).sonuc).toMatchObject({ hedef: 120, degisen: 120 });
    for (const k of hedef) expect(kayitlar.kayitGetir(ctx, k.id)!.etiketler).toEqual(["kampanya", "toplu"]);
    for (const k of disari) expect(kayitlar.kayitGetir(ctx, k.id)!.etiketler).toEqual(["baska"]);
  });

  it("onaylanan sayı işlem anında değiştiyse hiçbir şey yazılmaz (409, güncel sayı)", async () => {
    const { ctx } = kiraciOlustur("TopluSayi");
    const ilk = kisiler(ctx, "degisen", 3);
    kisiler(ctx, "degisen", 1); // onaydan sonra eklenmiş gibi: filtre artık 4

    expect(() =>
      kayitlar.kayitlariTopluGuncelle(ctx, { filtre: { grup: "tum", etiket: "degisen" }, beklenenToplam: 3 }, { tur: "etiket_ekle", etiket: "x" }),
    ).toThrow(TopluSecimDegistiHatasi);
    oturum.ctx = ctx;
    const y = await rota.POST(
      istek({ secim: { tur: "filtre", sorgu: "grup=tum&etiket=degisen", beklenenToplam: 3 }, islem: { tur: "etiket_ekle", etiket: "x" } }),
    );
    expect(y.status).toBe(409);
    expect(await y.json()).toMatchObject({ guncelToplam: 4 });
    for (const k of ilk) expect(kayitlar.kayitGetir(ctx, k.id)!.etiketler).toEqual(["degisen"]);
    expect(denetimKayitlariListele(ctx, { olay: "toplu_kayit_islemi" })).toHaveLength(0);
  });

  it("sorgu verilmezse sayfanın varsayılan sekmesi (İlgilendiklerim) uygulanır; incelenmemiş tarama kayıtlarına dokunulmaz", async () => {
    const { ctx } = kiraciOlustur("TopluSekme");
    const ilgi = kisiler(ctx, "sekme", 2);
    db.$client.prepare("update leads set inceleme = 'incelenmedi' where id = ?").run(ilgi[1].id);
    const beklenen = kayitlar.kayitlariListele(ctx, kayitFiltresiCoz(() => undefined, "ilgi")).toplam;
    oturum.ctx = ctx;
    const y = await rota.POST(istek({ secim: { tur: "filtre", sorgu: "", beklenenToplam: beklenen }, islem: { tur: "etiket_ekle", etiket: "s" } }));
    expect(y.status).toBe(200);
    expect(kayitlar.kayitGetir(ctx, ilgi[0].id)!.etiketler).toContain("s");
    expect(kayitlar.kayitGetir(ctx, ilgi[1].id)!.etiketler).toEqual(["sekme"]);
  });
});

describe("liste sırası ve sayfa boyutu", () => {
  it("ad / işletme adına göre A-Z (Türkçe alfabe, büyük/küçük harf duyarsız); adsızlar sonda", () => {
    const { ctx } = kiraciOlustur("TopluSira");
    const adlar = ["Zeytin", "çarşı", "Cami", "İnci", "ılgaz", "Şahin", "Su", "Öz", "Ozan", "ğ", "Ahmet"];
    kayitlar.kisileriEkle(
      ctx,
      adlar.map((ad) => ({ kaynak: "elle" as const, isletmeAdi: ad, ekTelefon: telefon(), etiketler: ["sira"], aliciTuru: "tacir_esnaf" as const })),
      "Test",
    );
    kayitlar.kisileriEkle(ctx, [{ kaynak: "elle", yetkiliAdi: "Bora (kişi)", ekTelefon: telefon(), etiketler: ["sira"] }], "Test");
    db.$client
      .prepare("insert into leads (id, tenant_id, kaynak, place_id, etiketler) values (?, ?, 'google', 'pl-adsiz', '[\"sira\"]')")
      .run(crypto.randomUUID(), ctx.tenantId);
    const liste = kayitlar.kayitlariListele(ctx, { grup: "tum", etiket: "sira", sira: "ad" });
    expect(liste.kayitlar.map((k) => k.isletmeAdi ?? k.yetkiliAdi)).toEqual([
      "Ahmet",
      "Bora (kişi)",
      "Cami",
      "çarşı",
      "ğ",
      "ılgaz",
      "İnci",
      "Ozan",
      "Öz",
      "Su",
      "Şahin",
      "Zeytin",
      null, // adı girilmemiş Google kaydı
    ]);
    expect(trSiraAnahtari("IŞIK") < trSiraAnahtari("ister")).toBe(true);
  });

  it("sayfa boyutu 50 / 100 / 200; geçersiz değer varsayılana (50) döner; adres biçimi korunur", () => {
    const { ctx } = kiraciOlustur("TopluBoyut");
    kisiler(ctx, "boyut", 210);
    const f = { grup: "tum" as const, etiket: "boyut" };
    expect(kayitlar.kayitlariListele(ctx, f)).toMatchObject({ boyut: 50, sayfaSayisi: 5 });
    expect(kayitlar.kayitlariListele(ctx, { ...f, boyut: 100, sayfa: 3 }).kayitlar).toHaveLength(10);
    expect(kayitlar.kayitlariListele(ctx, { ...f, boyut: 200 }).kayitlar).toHaveLength(200);

    const coz = (q: string) => {
      const p = new URLSearchParams(q);
      return kayitFiltresiCoz((ad) => p.get(ad) ?? undefined, "ilgi");
    };
    expect(coz("boyut=200&sira=ad")).toMatchObject({ boyut: 200, sira: "ad" });
    expect(coz("boyut=73&sira=xyz")).toMatchObject({ boyut: undefined, sira: undefined });
    expect(kayitSorgusu(coz("boyut=100&sira=ad&etiket=a")).toString()).toBe("grup=ilgi&etiket=a&sira=ad&boyut=100");
    expect(kayitSorgusu(coz("boyut=50&sira=son")).toString()).toBe("grup=ilgi");
  });
});
