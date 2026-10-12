// WhatsApp günlük liste: wa.me bağlantısı, liste hazırlama (alıcı kuralları, sınır), ekranın Places'a gitmemesi,
// "WhatsApp'ta aç" yönlendirmesi (numara çözümü, otomatik atlama, kota), sonuçlar (gönderdim / atla / ret), kayıt
// detayı akışı ve kullanıcı başına günlük sayaç (İstanbul günü).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waMeBaglantisi } from "@/lib/mesajlasma";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { adresOzeti } = await import("@/server/messaging/adres");
const { mockPlacesIstemcisi } = await import("@/server/places/mock");
const { engelliOzetler } = await import("@/server/repo/engel-listesi");
const { sayacDegeri } = await import("@/server/repo/gonderim-sayaci");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kayitGetir } = await import("@/server/repo/kayitlar");
const { aylikPlacesBirimi } = await import("@/server/repo/kullanim");
const { olaylariListele } = await import("@/server/repo/olaylar");
const { baglamUret } = await import("@/server/repo/sistem/uyelik");
const { gunlukListe } = await import("@/server/repo/whatsapp-listesi");
const wa = await import("@/server/servisler/whatsapp");
const acRotasi = await import("@/app/api/whatsapp/ac/[id]/route");
const acKayitRotasi = await import("@/app/api/whatsapp/ac-kayit/[leadId]/route");
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");
const { kayitOlustur } = await import("./yardimci/mesaj-fabrika");

const SIMDI = new Date("2026-10-12T09:00:00Z"); // 12:00 İstanbul
const SABLON = "Merhaba {isletme}, yeni ilanlarımız var.";

function kiraci(kota = 6000, sinir: number | null = null) {
  const { ctx } = kiraciOlustur(`Wa${Math.random().toString(36).slice(2, 7)}`);
  db.$client.prepare("update tenants set aylik_places_kotasi = ? where id = ?").run(kota, ctx.tenantId);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak", whatsappSablonu: SABLON, whatsappGunlukSinir: sinir });
  return ctx;
}

async function mockYerler() {
  const istemci = mockPlacesIstemcisi();
  const cep: { id: string; tel: string }[] = [];
  const sabit: string[] = [];
  for (let i = 0; cep.length < 3 || sabit.length < 2; i++) {
    const id = `mock_cafe_30000_${i}`;
    const y = await istemci.yerDetayi(id, "telefon");
    if (y?.telefonUluslararasi?.startsWith("+90 5")) cep.push({ id, tel: y.telefonUluslararasi.replace(/\D/g, "") });
    else sabit.push(id);
  }
  return { cep, sabit };
}

const istek = (url: string, basliklar: Record<string, string> = {}) => new Request(`https://crm.ornek.test${url}`, { headers: basliklar });

beforeEach(() => {
  oturum.ctx = null;
});

describe("wa.me bağlantısı", () => {
  it("numara yalnızca rakam ve 90 ile başlar; metin encodeURIComponent ile", () => {
    expect(waMeBaglantisi("905321112233", "Merhaba Ege & Co, %50 indirim?\nRET")).toBe(
      "https://wa.me/905321112233?text=Merhaba%20Ege%20%26%20Co%2C%20%2550%20indirim%3F%0ARET",
    );
    expect(() => waMeBaglantisi("+905321112233", "x")).toThrow();
    expect(() => waMeBaglantisi("05321112233", "x")).toThrow();
    expect(() => waMeBaglantisi("90532111223", "x")).toThrow();
  });

  it("mesaj: {isletme} yalnızca kullanıcının girdiği addan; sonunda gönderen ve RET notu", () => {
    const ctx = kiraci();
    const k = kayitOlustur(ctx, { ekTelefon: "0532 111 22 33", isletmeAdi: "Kordon Emlak" });
    wa.listeHazirla(ctx, {}, SIMDI);
    expect(wa.listeDurumu(ctx, SIMDI).siradaki).toMatchObject({
      leadId: k.id,
      mesaj: "Merhaba Kordon Emlak, yeni ilanlarımız var.\n\nEge Emlak. Bu mesajları almak istemiyorsanız RET yazmanız yeterli.",
      telefon: "+90 532 111 22 33",
    });
  });
});

describe("liste hazırlama", () => {
  it("ret, engel listesi ve izinsiz bireysel kayıtlar listeye alınmaz; şablon yoksa hazırlanmaz", () => {
    const ctx = kiraci();
    kayitOlustur(ctx, { ekTelefon: "0532 000 00 01" });
    kayitOlustur(ctx, { ekTelefon: "0532 000 00 02", iletiIzni: "ret" });
    kayitOlustur(ctx, { ekTelefon: "0532 000 00 03", aliciTuru: "bireysel" });
    kayitOlustur(ctx, { ekTelefon: "0532 000 00 04" });
    db.$client
      .prepare("insert into engel_listesi (id, tenant_id, tur, ozet, kaynak) values (?, ?, 'telefon', ?, 'sms_ret')")
      .run(crypto.randomUUID(), ctx.tenantId, adresOzeti(ctx.tenantId, "telefon", "905320000004"));
    const sonuc = wa.listeHazirla(ctx, {}, SIMDI);
    expect(sonuc).toMatchObject({ eklenen: 1, haricler: { ret: 1, bireysel_izinsiz: 1, engel: 1 } });

    iletiAyarlariGuncelle(ctx, { whatsappSablonu: null });
    expect(() => wa.listeHazirla(ctx, {}, SIMDI)).toThrow(/şablon/);
  });

  it("kullanıcının kalan günlük sınırı kadar kayıt alınır (varsayılan 30; çalışma alanı en fazla 50)", () => {
    const ctx = kiraci(6000, 3);
    for (let i = 0; i < 5; i++) kayitOlustur(ctx, { ekTelefon: `0532 100 00 0${i}` });
    expect(wa.listeHazirla(ctx, {}, SIMDI)).toMatchObject({ eklenen: 3, kapasite: 3 });
    expect(wa.listeHazirla(ctx, {}, SIMDI)).toMatchObject({ eklenen: 0, kapasite: 0 }); // sırada bekleyenler de sayılır
    expect(wa.whatsappSiniri({ whatsappGunlukSinir: null } as never)).toBe(30);
    expect(wa.whatsappSiniri({ whatsappGunlukSinir: 80 } as never)).toBe(50);
  });

  it("aynı kayıt aynı gün iki kullanıcının listesine girmez; liste kullanıcıya özeldir", () => {
    const ctx = kiraci();
    kayitOlustur(ctx, { ekTelefon: "0532 200 00 01" });
    const ikinci = kullaniciOlustur("WaIkinci");
    db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(ikinci.id, ctx.tenantId);
    const ctx2 = baglamUret(ikinci.id, ctx.tenantId)!;
    expect(wa.listeHazirla(ctx, {}, SIMDI).eklenen).toBe(1);
    expect(wa.listeHazirla(ctx2, {}, SIMDI).eklenen).toBe(0);
    expect(wa.listeDurumu(ctx2, SIMDI).ogeler).toEqual([]);
    const oge = gunlukListe(ctx, "2026-10-12")[0];
    expect(() => wa.sonucBildir(ctx2, oge.id, { sonuc: "atla" })).toThrow(/Bulunamadı/);
  });
});

describe("ekran Places'a gitmez; numara yalnızca 'WhatsApp'ta aç'ta çözülür", () => {
  it("listeyi açmak ve yenilemek kota birimi düşmez; Places numarası ekranda gösterilmez", async () => {
    const ctx = kiraci();
    const { cep } = await mockYerler();
    kayitOlustur(ctx, {}, cep[0].id);
    kayitOlustur(ctx, {}, cep[1].id);
    wa.listeHazirla(ctx, {}, SIMDI);
    for (let i = 0; i < 5; i++) {
      const d = wa.listeDurumu(ctx, SIMDI);
      expect(d.siradaki).toMatchObject({ telefon: null, baglanti: `/api/whatsapp/ac/${d.siradaki!.ogeId}` });
    }
    expect(aylikPlacesBirimi(ctx)).toBe(0);
    expect(JSON.stringify(wa.listeDurumu(ctx, SIMDI))).not.toContain(cep[0].tel.slice(2));
  });

  it("ek_telefon cep değilse ekranda (Places'sız) otomatik atlanır ve sonraki kayda geçilir", () => {
    const ctx = kiraci();
    const sabit = kayitOlustur(ctx, { ekTelefon: "0532 444 55 60" });
    const cep = kayitOlustur(ctx, { ekTelefon: "0532 444 55 66" });
    wa.listeHazirla(ctx, {}, SIMDI);
    // Liste hazırlandıktan sonra numara sabit hatla değiştirilmiş.
    db.$client.prepare("update leads set ek_telefon = '0232 444 55 66' where id = ?").run(sabit.id);
    const d = wa.listeDurumu(ctx, SIMDI);
    expect(d.siradaki?.leadId).toBe(cep.id);
    expect(d.ogeler.find((o) => o.leadId === sabit.id)).toMatchObject({ durum: "otomatik_atlandi", neden: "cep_degil" });
    expect(aylikPlacesBirimi(ctx)).toBe(0);
  });

  it("ek_telefon varsa açış Places çağrısı yapmadan wa.me'ye yönlendirir", async () => {
    const ctx = kiraci();
    kayitOlustur(ctx, { ekTelefon: "0532 333 44 55", isletmeAdi: "Moda" });
    wa.listeHazirla(ctx, {}, SIMDI);
    const ogeId = wa.listeDurumu(ctx, SIMDI).siradaki!.ogeId;
    const s = await wa.whatsappAc(ctx, ogeId, SIMDI);
    expect(s).toEqual({
      tur: "yonlendir",
      url: waMeBaglantisi("905323334455", "Merhaba Moda, yeni ilanlarımız var.\n\nEge Emlak. Bu mesajları almak istemiyorsanız RET yazmanız yeterli."),
    });
    expect(aylikPlacesBirimi(ctx)).toBe(0);
  });

  it("ek_telefon yoksa açış Places'tan alır (4 birim), numarayı yazmaz; yalnızca özet tutulur", async () => {
    const ctx = kiraci();
    const { cep } = await mockYerler();
    const k = kayitOlustur(ctx, {}, cep[2].id);
    wa.listeHazirla(ctx, {}, SIMDI);
    const ogeId = wa.listeDurumu(ctx, SIMDI).siradaki!.ogeId;
    const s = await wa.whatsappAc(ctx, ogeId, SIMDI);
    expect(s.tur === "yonlendir" && s.url.startsWith(`https://wa.me/${cep[2].tel}?text=`)).toBe(true);
    expect(aylikPlacesBirimi(ctx)).toBe(4);
    for (const tablo of ["leads", "lead_events", "whatsapp_listesi", "engel_listesi"]) {
      const dokum = JSON.stringify(db.$client.prepare(`select * from ${tablo} where tenant_id = ?`).all(ctx.tenantId));
      expect(dokum, tablo).not.toContain(cep[2].tel.slice(2));
    }
    expect(gunlukListe(ctx, "2026-10-12")[0]).toMatchObject({ durum: "bekliyor" });
    expect(kayitGetir(ctx, k.id)!.ekTelefon).toBeNull();
  });

  it("Places numarası cep değilse öğe otomatik atlanır ve nedeniyle geri dönülür", async () => {
    const ctx = kiraci();
    const { sabit } = await mockYerler();
    kayitOlustur(ctx, {}, sabit[0]);
    wa.listeHazirla(ctx, {}, SIMDI);
    const ogeId = wa.listeDurumu(ctx, SIMDI).siradaki!.ogeId;
    expect(await wa.whatsappAc(ctx, ogeId, SIMDI)).toEqual({ tur: "geri", kod: "atlandi", neden: "cep_degil" });
    expect(gunlukListe(ctx, "2026-10-12")[0]).toMatchObject({ durum: "otomatik_atlandi", neden: "cep_degil" });
  });

  it("kota doluysa numara alınmaz, öğe atlanmaz (bekler)", async () => {
    const ctx = kiraci(0);
    const { cep } = await mockYerler();
    kayitOlustur(ctx, {}, cep[0].id);
    wa.listeHazirla(ctx, {}, SIMDI);
    const ogeId = wa.listeDurumu(ctx, SIMDI).siradaki!.ogeId;
    expect(await wa.whatsappAc(ctx, ogeId, SIMDI)).toEqual({ tur: "geri", kod: "kota" });
    expect(gunlukListe(ctx, "2026-10-12")[0].durum).toBe("bekliyor");
  });
});

describe("sonuçlar ve günlük sayaç", () => {
  it("'Gönderdim': olay + yeni → iletisimde + kullanıcının sayacı; sınırda 429; ertesi gün sıfırlanır", () => {
    const ctx = kiraci(6000, 2);
    const k1 = kayitOlustur(ctx, { ekTelefon: "0532 500 00 01" });
    kayitOlustur(ctx, { ekTelefon: "0532 500 00 02" });
    wa.listeHazirla(ctx, {}, SIMDI);
    const [o1, o2] = gunlukListe(ctx, "2026-10-12");
    wa.sonucBildir(ctx, o1.id, { sonuc: "gonderdim" });
    expect(kayitGetir(ctx, k1.id)!.durum).toBe("iletisimde");
    expect(olaylariListele(ctx, k1.id).map((o) => o.tur)).toEqual(expect.arrayContaining(["whatsapp", "durum"]));
    expect(sayacDegeri(ctx, "whatsapp", "2026-10-12", ctx.userId)).toBe(1);
    expect(() => wa.sonucBildir(ctx, o1.id, { sonuc: "gonderdim" })).toThrow(/zaten/);

    // Detay panelinden gönderim de aynı sayaca işlenir ve sınırı doldurur.
    const tek = kayitOlustur(ctx, { ekTelefon: "0532 500 00 09" });
    wa.kayitWhatsappGonderildi(ctx, tek.id, SIMDI);
    expect(sayacDegeri(ctx, "whatsapp", "2026-10-12", ctx.userId)).toBe(2);
    expect(() => wa.sonucBildir(ctx, o2.id, { sonuc: "gonderdim" })).toThrow(expect.objectContaining({ durumKodu: 429 }));
    expect(wa.listeDurumu(ctx, SIMDI)).toMatchObject({ kalan: 0, siradaki: null });
    expect(wa.kayitWhatsapp(ctx, tek.id, SIMDI)).toMatchObject({ durum: "sinir_doldu", baglanti: null });

    // Ertesi gün (İstanbul) sayaç sıfır.
    const yarin = new Date("2026-10-12T21:30:00Z"); // 13 Ekim 00:30 İstanbul
    expect(wa.listeDurumu(ctx, yarin)).toMatchObject({ gun: "2026-10-13", gonderilen: 0, kalan: 2 });
  });

  it("'Ret istedi': kayıt ret, açılışta çözülen (Places) numaranın özeti engel listesine; 'Atla' yalnızca atlar", async () => {
    const ctx = kiraci();
    const { cep } = await mockYerler();
    const k = kayitOlustur(ctx, {}, cep[1].id);
    const atlanan = kayitOlustur(ctx, { ekTelefon: "0532 600 00 01" });
    wa.listeHazirla(ctx, {}, SIMDI);
    const ogeler = gunlukListe(ctx, "2026-10-12");
    const ogeK = ogeler.find((o) => o.leadId === k.id)!;
    await wa.whatsappAc(ctx, ogeK.id, SIMDI);
    wa.sonucBildir(ctx, ogeK.id, { sonuc: "ret" });
    expect(kayitGetir(ctx, k.id)!.iletiIzni).toBe("ret");
    expect(engelliOzetler(ctx, [adresOzeti(ctx.tenantId, "telefon", cep[1].tel)]).size).toBe(1);
    wa.sonucBildir(ctx, ogeler.find((o) => o.leadId === atlanan.id)!.id, { sonuc: "atla" });
    expect(kayitGetir(ctx, atlanan.id)!.iletiIzni).toBe("bekliyor");
    expect(gunlukListe(ctx, "2026-10-12").map((o) => o.durum).sort()).toEqual(["atlandi", "ret"]);
  });

  it("kayıt detayı: ret / engel / izinsiz bireysel / şablon yok durumlarında buton pasif (bağlantı yok)", () => {
    const ctx = kiraci();
    const ret = kayitOlustur(ctx, { ekTelefon: "0532 700 00 01", iletiIzni: "ret" });
    const birey = kayitOlustur(ctx, { ekTelefon: "0532 700 00 02", aliciTuru: "bireysel" });
    const uygun = kayitOlustur(ctx, { ekTelefon: "0532 700 00 03" });
    expect(wa.kayitWhatsapp(ctx, ret.id, SIMDI)).toMatchObject({ durum: "ret", baglanti: null });
    expect(wa.kayitWhatsapp(ctx, birey.id, SIMDI)).toMatchObject({ durum: "bireysel_izinsiz", baglanti: null });
    expect(wa.kayitWhatsapp(ctx, uygun.id, SIMDI)).toMatchObject({ durum: "hazir", baglanti: `/api/whatsapp/ac-kayit/${uygun.id}` });
    expect(() => wa.kayitWhatsappGonderildi(ctx, ret.id, SIMDI)).toThrow(/ileti reddi/);
    iletiAyarlariGuncelle(ctx, { whatsappSablonu: null });
    expect(wa.kayitWhatsapp(ctx, uygun.id, SIMDI)).toMatchObject({ durum: "sablon_yok", baglanti: null });
  });
});

describe("yönlendirme rotaları", () => {
  it("/api/whatsapp/ac/[id]: oturum yoksa girişe; başka siteden gelirse işlem yapmadan geri; uygunsa 302 wa.me", async () => {
    const ctx = kiraci();
    kayitOlustur(ctx, { ekTelefon: "0532 800 00 01" });
    wa.listeHazirla(ctx, {});
    const ogeId = wa.listeDurumu(ctx).siradaki!.ogeId;
    const baglam = { params: Promise.resolve({ id: ogeId }) };

    let y = await acRotasi.GET(istek(`/api/whatsapp/ac/${ogeId}`), baglam);
    expect([y.status, y.headers.get("location")]).toEqual([302, "https://crm.ornek.test/giris"]);

    oturum.ctx = ctx;
    y = await acRotasi.GET(istek(`/api/whatsapp/ac/${ogeId}`, { "sec-fetch-site": "cross-site" }), baglam);
    expect(y.headers.get("location")).toBe("https://crm.ornek.test/iletisim?wa=capraz#whatsapp");

    y = await acRotasi.GET(istek(`/api/whatsapp/ac/${ogeId}`, { "sec-fetch-site": "same-origin" }), baglam);
    expect(y.status).toBe(302);
    expect(y.headers.get("location")).toMatch(/^https:\/\/wa\.me\/905328000001\?text=/);
    expect(y.headers.get("cache-control")).toBe("no-store");

    // Başka kiracının kullanıcısı aynı öğeyi açamaz.
    oturum.ctx = kiraci();
    y = await acRotasi.GET(istek(`/api/whatsapp/ac/${ogeId}`), baglam);
    expect(y.headers.get("location")).toBe("https://crm.ornek.test/iletisim?wa=bulunamadi#whatsapp");
  });

  it("cep olmayan numarada öğe otomatik atlanır ve liste nedeniyle açılır", async () => {
    const ctx = kiraci();
    const { sabit } = await mockYerler();
    kayitOlustur(ctx, {}, sabit[1]);
    wa.listeHazirla(ctx, {});
    const ogeId = wa.listeDurumu(ctx).siradaki!.ogeId;
    oturum.ctx = ctx;
    const y = await acRotasi.GET(istek(`/api/whatsapp/ac/${ogeId}`), { params: Promise.resolve({ id: ogeId }) });
    expect(y.headers.get("location")).toBe("https://crm.ornek.test/iletisim?wa=atlandi&neden=cep_degil#whatsapp");
  });

  it("/api/whatsapp/ac-kayit/[leadId]: uygunsa wa.me, ret ise kayda nedeniyle döner, başka kiracı için bulunamadı", async () => {
    const ctx = kiraci();
    const uygun = kayitOlustur(ctx, { ekTelefon: "0532 900 00 01" });
    const ret = kayitOlustur(ctx, { ekTelefon: "0532 900 00 02", iletiIzni: "ret" });
    oturum.ctx = ctx;
    let y = await acKayitRotasi.GET(istek("/x"), { params: Promise.resolve({ leadId: uygun.id }) });
    expect(y.headers.get("location")).toMatch(/^https:\/\/wa\.me\/905329000001\?text=/);
    y = await acKayitRotasi.GET(istek("/x"), { params: Promise.resolve({ leadId: ret.id }) });
    expect(y.headers.get("location")).toBe(`https://crm.ornek.test/kayitlar?secili=${ret.id}&wa=kural&neden=ret`);
    oturum.ctx = kiraci();
    y = await acKayitRotasi.GET(istek("/x"), { params: Promise.resolve({ leadId: uygun.id }) });
    expect(y.headers.get("location")).toBe("https://crm.ornek.test/kayitlar?wa=bulunamadi");
  });
});
