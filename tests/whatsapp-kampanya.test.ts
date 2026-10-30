// WhatsApp (Cloud API) kampanyaları: özet (alıcı kuralları, test modu, değişkenler, tahmini ücret, önizleme),
// yalnızca yönetici, işçi gönderimi (sahte Graph istemcisi), kampanya sonrası gelen ret, günlük sınır ve Meta
// limitinin payı, kalite ve şablon duraklatması, Meta hata kodları, BSUID'e gönderim, sandbox.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adresOzeti } from "@/server/messaging/adres";
import type { TenantContext } from "@/server/repo/baglam";
import { engelliOzetler, retIsle } from "@/server/repo/engel-listesi";
import { iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import { kampanyaGetir, kampanyaMesajlari } from "@/server/repo/kampanyalar";
import { kayitGetir, kisileriEkle } from "@/server/repo/kayitlar";
import { olaylariListele } from "@/server/repo/olaylar";
import { baglamUret } from "@/server/repo/sistem/uyelik";
import { sablonlariListele } from "@/server/repo/whatsapp-sablonlari";
import { whatsappIzniAyarla, whatsappKisisiGetir } from "@/server/repo/whatsapp-kisileri";
import { isciTuru } from "@/server/servisler/isci";
import { KampanyaHatasi, kampanyaBaslat, kampanyaOzeti, kampanyayiDevamEttir, type KampanyaGirdisi } from "@/server/servisler/kampanya";
import * as wa from "@/server/servisler/whatsapp-api";
import { GraphHatasi } from "@/server/whatsapp-api";
import { mockWhatsapp, mockWhatsappSifirla } from "@/server/whatsapp-api/mock";
import { kiraciOlustur, kullaniciOlustur } from "./yardimci/fabrika";

const SIMDI = new Date("2026-10-29T09:00:00Z"); // 12:00 İstanbul
const tur = (simdi = SIMDI) => isciTuru({ simdi: () => simdi, parti: 50, whatsappAralikMs: 0 });

let numaraSayaci = 0;
/** Yönetici + tamamlanmış ticari ileti ayarları + WhatsApp bağlantısı (test modu açık) + senkronize şablonlar. */
async function kur(ad: string) {
  const { ctx } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  await wa.whatsappBaglantisiKaydet(ctx, {
    wabaId: "200001",
    phoneNumberId: String(500000 + ++numaraSayaci),
    erisimAnahtari: "anahtar",
    appSecret: "secret",
  });
  await wa.sablonlariSenkronizeEt(ctx);
  const sablon = (adi: string) => sablonlariListele(ctx).find((s) => s.ad === adi)!;
  return { ctx, sablon };
}

/** Webhook doğrulaması ve imzalı durum bildirimi alınmış say; test modunu kapat. */
function testModunuKapat(ctx: TenantContext) {
  db.$client
    .prepare("update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ? where tenant_id = ?")
    .run(Date.now(), Date.now(), ctx.tenantId);
  wa.testModuDegistir(ctx, false);
}

/** İzinli kişiler (etiket "wa"). */
function kisiler(ctx: TenantContext, liste: { tel?: string; ad?: string; bireysel?: boolean; izin?: boolean; iys?: boolean }[]) {
  const eklenen = kisileriEkle(
    ctx,
    liste.map((k) => ({
      kaynak: "ice_aktarma" as const,
      ekTelefon: k.tel ?? null,
      isletmeAdi: k.ad ?? null,
      etiketler: ["wa"],
      aliciTuru: k.bireysel ? ("bireysel" as const) : ("tacir_esnaf" as const),
    })),
    "test",
  );
  eklenen.forEach((k, i) => {
    if (liste[i].izin !== false) whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form", iysBeyani: liste[i].iys });
  });
  return eklenen;
}

const girdi = (sablonId: string, ek: Partial<KampanyaGirdisi> = {}): KampanyaGirdisi => ({
  kanal: "whatsapp_api",
  ad: "WA kampanyası",
  filtre: { etiket: "wa" },
  testModu: false,
  sablonId,
  degiskenEslem: {
    "header:1": { kaynak: "isletme_adi", yedek: "Değerli müşterimiz" },
    "body:1": { kaynak: "isletme_adi", yedek: "Merhaba" },
    "body:2": { kaynak: "sabit", deger: "ornek.com.tr" },
  },
  ...ek,
});

const mesajlar = (ctx: TenantContext, kampanyaId: string) => kampanyaMesajlari(ctx, kampanyaId).mesajlar;

beforeEach(() => mockWhatsappSifirla());

describe("özet", () => {
  it("izin, ret, engel, İYS beyanı, test modu ve boş değişken nedenleri; tahmini ücret ve önizleme", async () => {
    const { ctx, sablon } = await kur("Ozet");
    wa.testNumaralariKaydet(ctx, ["0532 000 00 01", "0532 000 00 06"]);
    const [, , retli, engelli] = kisiler(ctx, [
      { tel: "0532 000 00 01", ad: "Ege Emlak" }, // test numarası: uygun
      { tel: "0532 000 00 02", izin: false }, // izin yok
      { tel: "0532 000 00 03" }, // ret
      { tel: "0532 000 00 04" }, // engel
      { tel: "0532 000 00 05", bireysel: true }, // İYS beyanı yok
      { tel: "0532 000 00 06", ad: "Kuzey" }, // test numarası: uygun
      { tel: "0532 000 00 07" }, // test modu: test numarası değil
    ]);
    retIsle(ctx, { leadId: retli.id, adresler: [], kaynak: "kayit_ret", aciklama: "x" });
    retIsle(ctx, { leadId: null, adresler: [{ tur: "telefon", ozet: adresOzeti(ctx.tenantId, "telefon", "905320000004") }], kaynak: "abonelik", aciklama: "x" });
    void engelli;

    const ozet = kampanyaOzeti(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI);
    expect(ozet).toMatchObject({ toplamAday: 7, gonderilecek: 2, sandbox: false, eksikAyarlar: [] });
    expect(ozet.haricler).toMatchObject({ whatsapp_izni_yok: 1, ret: 1, engel: 1, iys_beyani_yok: 1, test_modu: 1 });
    expect(ozet.whatsapp).toMatchObject({
      sablonAdi: "kampanya_tanitim",
      kategori: "MARKETING",
      testModu: true,
      baglantiVar: true,
      birimFiyatUsd: 0.0109,
      tahminiUcretUsd: 0.0218,
    });
    expect(ozet.whatsapp!.onizlemeler).toHaveLength(2);
    const ege = ozet.whatsapp!.onizlemeler.find((m) => m.includes("Ege Emlak"))!;
    expect(ege).toContain("*Merhaba Ege Emlak*");
    expect(ege).toContain("Ege Emlak, yeni portföyümüz hazır. Ayrıntılar için ornek.com.tr.");

    // Boş değişken: yedek yoksa alıcı hariç.
    const yedeksiz = girdi(sablon("kampanya_tanitim").id, {
      degiskenEslem: { "header:1": { kaynak: "yetkili_adi" }, "body:1": { kaynak: "isletme_adi" }, "body:2": { kaynak: "sabit", deger: "x" } },
    });
    expect(kampanyaOzeti(ctx, yedeksiz, SIMDI).haricler.degisken_bos).toBe(2);
  });

  it("kullanılamayan şablon (abonelikten çıkma butonu yok) reddedilir; WhatsApp kampanyasını yalnızca yönetici başlatır", async () => {
    const { ctx, sablon } = await kur("Kural");
    kisiler(ctx, [{ tel: "0532 000 00 01" }]);
    expect(() => kampanyaOzeti(ctx, girdi(sablon("butonsuz_pazarlama").id))).toThrow(/abonelikten çıkma/);
    const uye = kullaniciOlustur("KuralUye");
    db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(uye.id, ctx.tenantId);
    const uyeCtx = baglamUret(uye.id, ctx.tenantId)!;
    expect(() => kampanyaBaslat(uyeCtx, girdi(sablon("kampanya_tanitim").id, { testModu: true }), SIMDI)).toThrow(/yönetici/);
  });
});

describe("gönderim (işçi)", () => {
  it("test modunda yalnızca test numarasına; şablon, değişkenler ve wamid; kayıt iletişimde", async () => {
    const { ctx, sablon } = await kur("Gonder");
    wa.testNumaralariKaydet(ctx, ["0532 000 00 01"]);
    const [k1] = kisiler(ctx, [{ tel: "0532 000 00 01", ad: "Ege Emlak" }, { tel: "0532 000 00 02" }]);
    const kampanya = kampanyaBaslat(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI);
    expect(kampanya.sablon).toBe("kampanya_tanitim (tr)");

    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(1);
    expect(mockWhatsapp.gonderilenler[0]).toMatchObject({
      alici: { tur: "telefon", deger: "905320000001" },
      sablonAdi: "kampanya_tanitim",
      dil: "tr",
      bilesenler: [
        { type: "header", parameters: [{ type: "text", text: "Ege Emlak" }] },
        {
          type: "body",
          parameters: [
            { type: "text", text: "Ege Emlak" },
            { type: "text", text: "ornek.com.tr" },
          ],
        },
      ],
    });
    const m = mesajlar(ctx, kampanya.id);
    expect(m.find((x) => x.leadId === k1.id)).toMatchObject({ durum: "gonderildi" });
    expect(m.filter((x) => x.durum === "haric").map((x) => x.neden)).toEqual(["test_modu"]);
    expect(db.$client.prepare("select saglayici_kimligi s from message_queue where lead_id = ?").get(k1.id)).toEqual({ s: "wamid.MOCK000001" });
    expect(kayitGetir(ctx, k1.id)?.durum).toBe("iletisimde");
    expect(olaylariListele(ctx, k1.id).some((o) => o.tur === "whatsapp_api")).toBe(true);
    expect(kampanyaGetir(ctx, kampanya.id)?.durum).toBe("tamamlandi");
  });

  it("adlandırılmış parametreli şablon parameter_name ile gönderilir; test modu kapalıyken herkese", async () => {
    const { ctx, sablon } = await kur("Adli");
    testModunuKapat(ctx);
    kisiler(ctx, [{ tel: "0532 000 00 01", ad: "Ayşe" }, { tel: "0532 000 00 02", ad: "Bora" }]);
    kampanyaBaslat(
      ctx,
      girdi(sablon("randevu_hatirlatma").id, {
        degiskenEslem: { "body:ad": { kaynak: "isletme_adi" }, "body:tarih": { kaynak: "sabit", deger: "3 Kasım\n 10:00" } },
      }),
      SIMDI,
    );
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(2);
    const ayse = mockWhatsapp.gonderilenler.find((g) => g.alici.deger === "905320000001")!;
    expect(ayse.bilesenler).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Ayşe", parameter_name: "ad" },
          { type: "text", text: "3 Kasım 10:00", parameter_name: "tarih" }, // satır sonu tek boşluğa indirgenir
        ],
      },
    ]);
  });

  it("kampanya oluşturulduktan sonra gelen ret gönderimi durdurur", async () => {
    const { ctx, sablon } = await kur("SonradanRet");
    testModunuKapat(ctx);
    const [a, b] = kisiler(ctx, [{ tel: "0532 000 00 01" }, { tel: "0532 000 00 02" }]);
    const kampanya = kampanyaBaslat(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI);
    retIsle(ctx, { leadId: b.id, adresler: [], kaynak: "whatsapp_ret", aciklama: "RET yazdı" });
    await tur();
    expect(mockWhatsapp.gonderilenler.map((g) => g.alici.deger)).toEqual(["905320000001"]);
    expect(mesajlar(ctx, kampanya.id).find((x) => x.leadId === b.id)).toMatchObject({ durum: "haric", neden: "ret" });
    void a;
  });

  it("Meta limitinin payı dolunca kalanlar ertesi güne kalır; günlük sınır da uygulanır", async () => {
    const { ctx, sablon } = await kur("Limit");
    testModunuKapat(ctx);
    db.$client.prepare("update whatsapp_baglantilari set limit_katmani = 'TIER_250', son_kontrol = ?, kalite = 'GREEN' where tenant_id = ?").run(SIMDI.getTime(), ctx.tenantId);
    wa.uygulamaPayiKaydet(ctx, 1); // 250 × %1 = 2
    kisiler(ctx, [{ tel: "0532 000 00 01" }, { tel: "0532 000 00 02" }, { tel: "0532 000 00 03" }]);
    const kampanya = kampanyaBaslat(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI);
    expect(kampanyaOzeti(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI).whatsapp?.limitPayi).toBe(2);
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(2);
    const bekleyen = mesajlar(ctx, kampanya.id).find((x) => x.durum === "kuyrukta")!;
    expect(bekleyen.neden).toBe("whatsapp_limit");
    expect(bekleyen.sonrakiDeneme?.toISOString()).toBe("2026-10-30T06:00:00.000Z"); // ertesi gün 09:00 İstanbul

    // Günlük sınır (çalışma alanı): 1
    const { ctx: c2, sablon: s2 } = await kur("GunlukSinir");
    testModunuKapat(c2);
    db.$client.prepare("update ileti_ayarlari set gunluk_whatsapp_api_siniri = 1 where tenant_id = ?").run(c2.tenantId);
    kisiler(c2, [{ tel: "0532 000 00 01" }, { tel: "0532 000 00 02" }]);
    const k2 = kampanyaBaslat(c2, girdi(s2("kampanya_tanitim").id), SIMDI);
    mockWhatsapp.gonderilenler = [];
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(1);
    expect(mesajlar(c2, k2.id).find((x) => x.durum === "kuyrukta")?.neden).toBe("gunluk_sinir");
  });

  it("kalite kırmızıysa çalışma alanının WhatsApp kampanyaları duraklar; kalite düzelince yönetici devam ettirir", async () => {
    const { ctx, sablon } = await kur("Kalite");
    testModunuKapat(ctx);
    kisiler(ctx, [{ tel: "0532 000 00 01" }]);
    const kampanya = kampanyaBaslat(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI);
    mockWhatsapp.numara = { id: "1", gorunenNumara: "+90", dogrulanmisAd: "X", kalite: "RED", limitKatmani: "TIER_10K" };
    await tur(); // kalite eski (son kontrol yok) → Meta'dan RED okunur
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(kampanyaGetir(ctx, kampanya.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "kalite_dusuk" });
    expect(mesajlar(ctx, kampanya.id)[0]).toMatchObject({ durum: "kuyrukta", denemeSayisi: 0 });
    await tur(); // duraklatılmış kampanyanın mesajı alınmaz
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    await expect(kampanyayiDevamEttir(ctx, kampanya.id)).rejects.toThrow(/hâlâ düşük/);
    expect(() => kampanyaBaslat(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI)).toThrow(/kalite puanı düşük/);

    mockWhatsapp.numara = { ...mockWhatsapp.numara, kalite: "GREEN" };
    await kampanyayiDevamEttir(ctx, kampanya.id);
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(1);
  });

  it("şablon Meta'da duraklatılırsa kampanya duraklar", async () => {
    const { ctx, sablon } = await kur("SablonDurdu");
    testModunuKapat(ctx);
    kisiler(ctx, [{ tel: "0532 000 00 01" }]);
    const kampanya = kampanyaBaslat(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI);
    mockWhatsapp.sablonlar[0].status = "PAUSED";
    await wa.sablonlariSenkronizeEt(ctx);
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(kampanyaGetir(ctx, kampanya.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "sablon_kullanilamaz" });
  });

  it("Meta hata kodları: 131026 WhatsApp yok, 131050 ret, 130429 geçici, belirsiz tekrar denenmez, 131048 ve 190 duraklatır", async () => {
    const { ctx, sablon } = await kur("Hatalar");
    testModunuKapat(ctx);
    const [yok, durdurdu, hiz, belirsiz] = kisiler(ctx, [
      { tel: "0532 000 00 01" },
      { tel: "0532 000 00 02" },
      { tel: "0532 000 00 03" },
      { tel: "0532 000 00 04" },
    ]);
    mockWhatsapp.aliciHatalari.set("905320000001", new GraphHatasi("(#131026) Message undeliverable", 400, 131026));
    mockWhatsapp.aliciHatalari.set("905320000002", new GraphHatasi("(#131050) stopped marketing", 400, 131050));
    mockWhatsapp.aliciHatalari.set("905320000003", new GraphHatasi("(#130429) Rate limit hit", 400, 130429));
    mockWhatsapp.aliciHatalari.set("905320000004", new GraphHatasi("Meta'ya ulaşılamadı: zaman aşımı", 0));
    const kampanya = kampanyaBaslat(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI);
    await tur();
    const m = Object.fromEntries(mesajlar(ctx, kampanya.id).map((x) => [x.leadId, x]));
    expect(m[yok.id]).toMatchObject({ durum: "basarisiz", neden: "whatsapp_yok" });
    expect(whatsappKisisiGetir(ctx, yok.id)?.whatsappYokTarihi).toBeInstanceOf(Date);
    expect(m[durdurdu.id]).toMatchObject({ durum: "haric", neden: "ret" });
    expect(whatsappKisisiGetir(ctx, durdurdu.id)?.izin).toBe("ret");
    const ozet = adresOzeti(ctx.tenantId, "telefon", "905320000002");
    expect(engelliOzetler(ctx, [ozet]).has(ozet)).toBe(true);
    expect(m[hiz.id]).toMatchObject({ durum: "kuyrukta", neden: "gecici_hata" });
    expect(m[belirsiz.id]).toMatchObject({ durum: "basarisiz", neden: "belirsiz" });

    // Belirsiz olan bir sonraki turda yeniden denenmez; geçici olan yeniden denenir.
    mockWhatsapp.aliciHatalari.clear();
    await tur(new Date(SIMDI.getTime() + 2 * 60_000));
    expect(mockWhatsapp.gonderilenler.map((g) => g.alici.deger)).toEqual(["905320000003"]);

    // 131048 (spam) ve 190 (yetki) kampanyayı duraklatır, mesaj kuyrukta kalır.
    for (const [kod, http, neden] of [
      [131048, 400, "spam_siniri"],
      [190, 401, "yetki"],
    ] as const) {
      const { ctx: c, sablon: s } = await kur(`Durdur${kod}`);
      testModunuKapat(c);
      kisiler(c, [{ tel: "0533 000 00 09" }]);
      const k = kampanyaBaslat(c, girdi(s("kampanya_tanitim").id), SIMDI);
      mockWhatsapp.aliciHatalari.set("905330000009", new GraphHatasi("x", http, kod));
      await tur();
      expect(kampanyaGetir(c, k.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: neden });
      expect(mesajlar(c, k.id)[0].durum).toBe("kuyrukta");
      mockWhatsapp.aliciHatalari.clear();
    }
  });

  it("telefonu olmayan kişiye BSUID ile (recipient) gönderilir; test modunda BSUID'li kişi hariç", async () => {
    const { ctx, sablon } = await kur("Bsuid");
    const [k] = kisiler(ctx, [{ ad: "Reklam Kişisi" }]);
    db.$client.prepare("update whatsapp_kisileri set bsuid = 'TR.987' where lead_id = ?").run(k.id);
    expect(kampanyaOzeti(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI).haricler.test_modu).toBe(1);
    testModunuKapat(ctx);
    kampanyaBaslat(ctx, girdi(sablon("kampanya_tanitim").id), SIMDI);
    await tur();
    expect(mockWhatsapp.gonderilenler[0].alici).toEqual({ tur: "bsuid", deger: "TR.987" });
  });

  it("sandbox kampanyası Meta'ya gitmez, şablon metnini kaydeder; bağlantı olmadan gerçek kampanya başlatılamaz", async () => {
    const { ctx, sablon } = await kur("Sandbox");
    kisiler(ctx, [{ tel: "0532 000 00 01", ad: "Ege" }]);
    const kampanya = kampanyaBaslat(ctx, girdi(sablon("kampanya_tanitim").id, { testModu: true }), SIMDI);
    expect(kampanya.sandbox).toBe(true);
    await tur();
    expect(mockWhatsapp.gonderilenler).toHaveLength(0);
    expect(mesajlar(ctx, kampanya.id)[0].sandboxIcerik).toContain("Ege, yeni portföyümüz hazır.");

    const { ctx: c2, sablon: s2 } = await kur("BaglantiYok");
    kisiler(c2, [{ tel: "0532 000 00 01" }]);
    const id = s2("kampanya_tanitim").id;
    db.$client.prepare("delete from whatsapp_baglantilari where tenant_id = ?").run(c2.tenantId);
    expect(() => kampanyaBaslat(c2, girdi(id), SIMDI)).toThrow(KampanyaHatasi);
  });
});
