// Gönderim işçisi: tek işçi kilidi (süresi dolan, nabızlı), gönderimden hemen önce satır kilidi ve sahibinin
// doğrulanması, tur sırasında iptal / duraklatılan kampanyanın kalan mesajlarının gönderilmemesi.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import { kampanyaGetir, kampanyaIptal, kampanyaMesajlari } from "@/server/repo/kampanyalar";
import { kisileriEkle } from "@/server/repo/kayitlar";
import { isciKilidiAl, isciKilidiBirak, isciKilidiYenile } from "@/server/repo/sistem/isci";
import { sablonlariListele } from "@/server/repo/whatsapp-sablonlari";
import { whatsappIzniAyarla } from "@/server/repo/whatsapp-kisileri";
import { isciTuru } from "@/server/servisler/isci";
import { kampanyaBaslat } from "@/server/servisler/kampanya";
import * as wa from "@/server/servisler/whatsapp-api";
import { GraphHatasi } from "@/server/whatsapp-api";
import { mockWhatsapp, mockWhatsappSifirla } from "@/server/whatsapp-api/mock";
import { kiraciOlustur } from "./yardimci/fabrika";
import { kayitOlustur, SahteSaglayici } from "./yardimci/mesaj-fabrika";

const OGLE = new Date("2026-10-12T09:00:00Z"); // 12:00 İstanbul

function kiraci() {
  const { ctx } = kiraciOlustur(`Isci${Math.random().toString(36).slice(2, 7)}`);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  return ctx;
}

function epostaKampanyasi(n: number) {
  const ctx = kiraci();
  for (let i = 0; i < n; i++) kayitOlustur(ctx, { eposta: `k${i}-${ctx.tenantId.slice(0, 6)}@ornek.test` });
  const k = kampanyaBaslat(ctx, { kanal: "eposta", ad: "K", konu: "T", sablon: "Merhaba", filtre: {}, testModu: false }, OGLE);
  return { ctx, k };
}

const durumlar = (ctx: ReturnType<typeof kiraci>, id: string) => kampanyaMesajlari(ctx, id).mesajlar.map((m) => m.durum).sort();

beforeEach(() => {
  mockWhatsappSifirla();
  db.$client.prepare("delete from isci_kilitleri").run();
  db.$client.prepare("update message_queue set durum = 'iptal' where durum in ('kuyrukta', 'gonderiliyor')").run();
  db.$client.prepare("update kampanyalar set durum = 'iptal' where durum in ('zamanlandi', 'calisiyor', 'duraklatildi')").run();
});

describe("tek işçi kilidi", () => {
  it("aynı anda tek sahip; süresi dolunca başkası alır; yalnızca sahibi yeniler ve bırakır", () => {
    const t = 1_000_000;
    expect(isciKilidiAl("a", 60_000, t)).toBe(true);
    expect(isciKilidiAl("b", 60_000, t + 1)).toBe(false);
    expect(isciKilidiYenile("b", 60_000, t + 2)).toBe(false);
    expect(isciKilidiYenile("a", 60_000, t + 30_000)).toBe(true); // nabız: bitiş t + 90 sn
    expect(isciKilidiAl("b", 60_000, t + 70_000)).toBe(false);
    expect(isciKilidiAl("b", 60_000, t + 90_001)).toBe(true); // süresi doldu (çöken işçi)
    expect(isciKilidiYenile("a", 60_000, t + 90_002)).toBe(false); // a kilidi kaybettiğini anlar
    isciKilidiBirak("a"); // sahibi değil: dokunmaz
    expect(isciKilidiAl("c", 60_000, t + 90_003)).toBe(false);
    isciKilidiBirak("b");
    expect(isciKilidiAl("c", 60_000, t + 90_004)).toBe(true);
    isciKilidiBirak("c");
  });

  it("kilit başka bir işçideyse tur hiçbir şey yapmaz; bırakılınca sonraki tur gönderir", async () => {
    const { ctx, k } = epostaKampanyasi(2);
    expect(isciKilidiAl("baska-isci", 60_000)).toBe(true);
    const s = new SahteSaglayici("eposta", true);
    const sonuc = await isciTuru({ simdi: () => OGLE, saglayiciSec: () => s });
    expect(sonuc).toMatchObject({ kilitAlinamadi: true, alinan: 0 });
    expect(s.gonderilen).toHaveLength(0);
    expect(durumlar(ctx, k.id)).toEqual(["kuyrukta", "kuyrukta"]);
    isciKilidiBirak("baska-isci");
    expect((await isciTuru({ simdi: () => OGLE, saglayiciSec: () => s })).gonderilen).toBe(2);
    // Tur bitince kilit bırakılır.
    expect(db.$client.prepare("select count(*) n from isci_kilitleri").get()).toEqual({ n: 0 });
  });

  it("tur sırasında kilit kaybedilirse kalan (denenmemiş) mesajlar gönderilmez, kuyruğa döner", async () => {
    const { ctx, k } = epostaKampanyasi(3);
    const s = new SahteSaglayici("eposta", true, (_i, n) => {
      // İlk gönderimde kilidin süresi doldu ve başka bir işçi aldı.
      if (n === 1) db.$client.prepare("update isci_kilitleri set sahip = 'baska-isci'").run();
      return { durum: "gonderildi", saglayiciKimligi: "x" };
    });
    const sonuc = await isciTuru({ simdi: () => OGLE, saglayiciSec: () => s });
    expect(s.gonderilen).toHaveLength(1);
    expect(sonuc).toMatchObject({ alinan: 3, gonderilen: 1, bekletilen: 2 });
    expect(durumlar(ctx, k.id)).toEqual(["gonderildi", "kuyrukta", "kuyrukta"]);
    // Başkasının kilidi bırakılmadı.
    expect(db.$client.prepare("select sahip from isci_kilitleri").get()).toEqual({ sahip: "baska-isci" });
  });
});

describe("gönderimden hemen önce satır kilidi", () => {
  it("satır bu turda değilse (belirsiz kapatıldı ya da başka işçiye geçti) gönderilmez ve satıra dokunulmaz", async () => {
    const { ctx, k } = epostaKampanyasi(3);
    const s = new SahteSaglayici("eposta", true, (ileti, n) => {
      if (n === 1) {
        // Başka bir işçi diğer iki satırdan birini belirsiz kapattı, diğerini kendi turuna aldı.
        const digerleri = db.$client
          .prepare(
            "select q.id from message_queue q join leads l on l.id = q.lead_id where q.kampanya_id = ? and q.durum = 'gonderiliyor' and l.eposta <> ? order by q.id",
          )
          .all(k.id, ileti.alici) as { id: string }[];
        db.$client.prepare("update message_queue set durum = 'basarisiz', neden = 'belirsiz' where id = ?").run(digerleri[0].id);
        db.$client.prepare("update message_queue set kilit_sahibi = 'baska-isci' where id = ?").run(digerleri[1].id);
      }
      return { durum: "gonderildi", saglayiciKimligi: "x" };
    });
    const sonuc = await isciTuru({ simdi: () => OGLE, saglayiciSec: () => s });
    expect(s.gonderilen).toHaveLength(1);
    expect(sonuc).toMatchObject({ gonderilen: 1, atlanan: 2 });
    expect(durumlar(ctx, k.id)).toEqual(["basarisiz", "gonderildi", "gonderiliyor"]);
  });
});

describe("tur sırasında iptal / duraklatma", () => {
  it("e-posta: iptal edilen kampanyanın aynı partideki kalan mesajları gönderilmez (iptal)", async () => {
    const { ctx, k } = epostaKampanyasi(4);
    const s = new SahteSaglayici("eposta", true, (_i, n) => {
      if (n === 1) expect(kampanyaIptal(ctx, k.id)).toBe(true);
      return { durum: "gonderildi", saglayiciKimligi: "x" };
    });
    await isciTuru({ simdi: () => OGLE, saglayiciSec: () => s });
    expect(s.gonderilen).toHaveLength(1);
    expect(durumlar(ctx, k.id)).toEqual(["gonderildi", "iptal", "iptal", "iptal"]);
  });

  it("WhatsApp: kalite yenilenirken numara sahipliği reddedilirse gönderilmez, kampanya duraklar", async () => {
    const ctx = kiraci();
    await wa.whatsappBaglantisiKaydet(ctx, { wabaId: "200001", phoneNumberId: "510002", erisimAnahtari: "a", appSecret: "s" });
    await wa.sablonlariSenkronizeEt(ctx);
    db.$client
      .prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ? where tenant_id = ?")
      .run(Date.now(), Date.now(), ctx.tenantId);
    wa.testModuDegistir(ctx, false);
    const [kisi] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: "0532 700 00 09", etiketler: ["wa"] }], "x");
    whatsappIzniAyarla(ctx, kisi.id, { izin: "var", kaynak: "form" });
    const sablon = sablonlariListele(ctx).find((x) => x.ad === "randevu_hatirlatma")!;
    const k = kampanyaBaslat(
      ctx,
      {
        kanal: "whatsapp_api",
        ad: "W",
        filtre: { etiket: "wa" },
        testModu: false,
        sablonId: sablon.id,
        degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "A" }, "body:tarih": { kaynak: "sabit", deger: "B" } },
      },
      OGLE,
    );
    mockWhatsapp.wabaNumaralari = ["599999"]; // numara artık bu WABA'da değil
    await isciTuru({ simdi: () => OGLE, parti: 50, whatsappAralikMs: 0 });
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(kampanyaGetir(ctx, k.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "baglanti_yok" });
    expect(durumlar(ctx, k.id)).toEqual(["kuyrukta"]);
  });

  it("WhatsApp: 131048 kampanyayı duraklatınca aynı partideki kalan mesajlar Meta'ya gitmez, kuyrukta kalır", async () => {
    const ctx = kiraci();
    await wa.whatsappBaglantisiKaydet(ctx, { wabaId: "200001", phoneNumberId: "510001", erisimAnahtari: "a", appSecret: "s" });
    await wa.sablonlariSenkronizeEt(ctx);
    db.$client
      .prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ? where tenant_id = ?")
      .run(Date.now(), Date.now(), ctx.tenantId);
    wa.testModuDegistir(ctx, false);
    const kisiler = kisileriEkle(
      ctx,
      ["0532 700 00 01", "0532 700 00 02", "0532 700 00 03"].map((t) => ({ kaynak: "elle" as const, ekTelefon: t, etiketler: ["wa"] })),
      "x",
    );
    for (const x of kisiler) whatsappIzniAyarla(ctx, x.id, { izin: "var", kaynak: "form" });
    // Kalite taze (işçi Meta'ya kalite sormaz): hangi mesaj önce alınırsa alınsın ilk Graph çağrısı (gönderim) spam
    // kısıtlamasına takılır.
    db.$client
      .prepare("update whatsapp_baglantilari set kalite = 'GREEN', limit_katmani = 'TIER_10K', son_kontrol = ? where tenant_id = ?")
      .run(OGLE.getTime(), ctx.tenantId);
    mockWhatsapp.hata = new GraphHatasi("(#131048) Spam rate limit hit", 400, 131048);
    const sablon = sablonlariListele(ctx).find((x) => x.ad === "randevu_hatirlatma")!;
    const k = kampanyaBaslat(
      ctx,
      {
        kanal: "whatsapp_api",
        ad: "W",
        filtre: { etiket: "wa" },
        testModu: false,
        sablonId: sablon.id,
        degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "A" }, "body:tarih": { kaynak: "sabit", deger: "B" } },
      },
      OGLE,
    );
    await isciTuru({ simdi: () => OGLE, parti: 50, whatsappAralikMs: 0 });
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(kampanyaGetir(ctx, k.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "spam_siniri" });
    expect(durumlar(ctx, k.id)).toEqual(["kuyrukta", "kuyrukta", "kuyrukta"]);
  });
});
