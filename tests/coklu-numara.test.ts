// Çoklu WhatsApp numarası (plan-mesajlasma-v2 A): her numaranın kendi test modu, test numaraları, kalitesi, kilidi ve
// webhook kimliği; şablonlar WABA'ya ait; Meta hesap kilidi aynı WABA'daki numaraları, kalite yalnızca o numarayı
// durdurur; portföy limiti bütün numaraların toplamıyla; ortak bildirim adresinden doğru numaraya yönlendirme; RET
// kişiye aittir (bir numaraya RET, diğerlerinden de gönderilmez); numara silinince yalnızca onun kampanyaları durur;
// migration 0019 tek bağlantılı eski veritabanını taşır.
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BAGLANTI_AZAMI, numaraEtiketi } from "@/lib/whatsapp-api";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db, veritabaniAc } = await import("@/server/db");
const { migrasyonlariUygula } = await import("@/server/db/migrasyon");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kampanyaGetir } = await import("@/server/repo/kampanyalar");
const { kayitGetir, kisileriEkle } = await import("@/server/repo/kayitlar");
const { baglantiEkle, baglantiGetir, baglantilariListele } = await import("@/server/repo/whatsapp-baglantilari");
const { sablonlariListele } = await import("@/server/repo/whatsapp-sablonlari");
const { whatsappIzniAyarla } = await import("@/server/repo/whatsapp-kisileri");
const { isciTuru } = await import("@/server/servisler/isci");
const { KampanyaHatasi, KampanyaGirdisi, kampanyaBaslat, kampanyaOzeti } = await import("@/server/servisler/kampanya");
const wa = await import("@/server/servisler/whatsapp-api");
const { GraphHatasi } = await import("@/server/whatsapp-api");
const { mockWhatsapp, mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const webhook = await import("@/app/api/whatsapp/webhook/[kimlik]/route");
const listeRotasi = await import("@/app/api/ayarlar/whatsapp-api/route");
const numaraRotasi = await import("@/app/api/ayarlar/whatsapp-api/[id]/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const U = "https://crm.ornek.test";
const SIMDI = new Date("2026-11-16T09:00:00Z"); // 12:00 İstanbul
const tur = () => isciTuru({ simdi: () => SIMDI, parti: 50, whatsappAralikMs: 0 });
let sayac = 0;

beforeEach(() => mockWhatsappSifirla());

/** Yönetici + tamamlanmış ticari ileti ayarları. */
function alan(ad: string) {
  const { ctx } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
  return ctx;
}

type Numara = { id: string; phoneId: string; waba: string; secret: string; kimlik: string };
async function numaraEkle(ctx: TenantContext, ad: string, waba: string, secret = "ortak-app-secret"): Promise<Numara> {
  const phoneId = String(810000 + ++sayac);
  const { baglanti } = await wa.whatsappBaglantisiEkle(ctx, { ad, wabaId: waba, phoneNumberId: phoneId, erisimAnahtari: "anahtar", appSecret: secret });
  const b = baglantiGetir(ctx, baglanti.id!)!;
  return { id: b.id, phoneId, waba, secret, kimlik: b.webhookKimligi };
}

/** Numaranın webhook ve imzalı durum koşulları sağlanmış say; kalite yeşil ve taze (işçi Meta'ya sormasın); test modu kapalı. */
function hazirla(ctx: TenantContext, n: Numara, ek: { limit?: string; testModu?: boolean } = {}) {
  db.$client
    .prepare(
      "update whatsapp_baglantilari set webhook_dogrulama_tarihi = ?, son_imzali_durum_tarihi = ?, kalite = 'GREEN', limit_katmani = ?, son_kontrol = ? where id = ?",
    )
    .run(Date.now(), Date.now(), ek.limit ?? "TIER_10K", SIMDI.getTime(), n.id);
  if (!ek.testModu) wa.testModuDegistir(ctx, n.id, false);
}

function kisiler(ctx: TenantContext, etiket: string, telefonlar: string[]) {
  const eklenen = kisileriEkle(
    ctx,
    telefonlar.map((t) => ({ kaynak: "elle" as const, ekTelefon: t, etiketler: [etiket], aliciTuru: "tacir_esnaf" as const })),
    "test",
  );
  for (const k of eklenen) whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form" });
  return eklenen;
}

function girdi(ctx: TenantContext, n: Numara, etiket: string): ReturnType<typeof KampanyaGirdisi.parse> {
  const sablon = sablonlariListele(ctx, n.waba).find((s) => s.ad === "randevu_hatirlatma");
  return KampanyaGirdisi.parse({
    kanal: "whatsapp_api",
    ad: `K-${etiket}`,
    filtre: { etiket },
    testModu: false,
    baglantiId: n.id,
    sablonId: sablon?.id ?? "yok",
    degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "A" }, "body:tarih": { kaynak: "sabit", deger: "B" } },
  });
}

const gonderenler = (kampanyaId: string) =>
  db.$client.prepare("select durum, neden, gonderen_numara g from message_queue where kampanya_id = ? order by rowid").all(kampanyaId) as {
    durum: string;
    neden: string | null;
    g: string | null;
  }[];

async function bildirim(n: Numara, entry: { id?: string; field: string; value: Record<string, unknown> }, secret = n.secret) {
  const govde = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: entry.id ?? n.waba, changes: [{ field: entry.field, value: entry.value }] }] });
  const imza = `sha256=${createHmac("sha256", secret).update(govde).digest("hex")}`;
  const y = await webhook.POST(new Request(`${U}/api/whatsapp/webhook/${n.kimlik}`, { method: "POST", headers: { "X-Hub-Signature-256": imza }, body: govde }), {
    params: Promise.resolve({ kimlik: n.kimlik }),
  });
  return y;
}

describe("numaralar, adlar ve sınır", () => {
  it("ad zorunlu ve çalışma alanında benzersiz; aynı ad başka alanda serbest; en fazla BAGLANTI_AZAMI numara", async () => {
    const ctx = alan("AdSinir");
    await numaraEkle(ctx, "Merkez", "300001");
    await expect(numaraEkle(ctx, "Merkez", "300001")).rejects.toThrow(/Bu adla bir numara zaten var/);
    await expect(numaraEkle(ctx, "  ", "300001")).rejects.toThrow(/ad verin/);
    await numaraEkle(alan("AdSinirBaska"), "Merkez", "300009");
    for (let i = 2; i <= BAGLANTI_AZAMI; i++) {
      baglantiEkle(ctx, { ad: `Şube ${i}`, wabaId: "300001", phoneNumberId: String(890000 + ++sayac), sifreliVeri: "v1:x", numaraDogrulamaTarihi: new Date() });
    }
    expect(baglantilariListele(ctx)).toHaveLength(BAGLANTI_AZAMI);
    await expect(numaraEkle(ctx, "Fazla", "300001")).rejects.toThrow(new RegExp(`en fazla ${BAGLANTI_AZAMI} numara`));
    // Ekrandaki sıra eklenme sırası.
    expect(baglantilariListele(ctx).map((b) => b.ad).slice(0, 3)).toEqual(["Merkez", "Şube 2", "Şube 3"]);
  });

  it("etiket: ad + görünen numaranın son 4 hanesi; numara bilgisi yoksa ad; silinmişse 'Silinmiş numara'", () => {
    expect(numaraEtiketi({ ad: "Merkez", gorunenNumara: "+90 850 111 45 67" })).toBe("Merkez · …4567");
    expect(numaraEtiketi({ ad: "Şube", gorunenNumara: null })).toBe("Şube");
    expect(numaraEtiketi(null)).toBe("Silinmiş numara");
  });

  it("API: liste ve ad değiştirme; başka çalışma alanının numarası 404", async () => {
    const ctx = alan("Api");
    const a = await numaraEkle(ctx, "Merkez", "300101");
    await numaraEkle(ctx, "Şube", "300101");
    const baskaCtx = alan("ApiBaska");
    const baska = await numaraEkle(baskaCtx, "Merkez", "300102");
    oturum.ctx = ctx;
    const liste = await (await listeRotasi.GET()).json();
    expect(liste.baglantilar.map((b: { ad: string }) => b.ad)).toEqual(["Merkez", "Şube"]);
    const istek = (method: string, govde?: unknown) =>
      new Request(`${U}/api/ayarlar/whatsapp-api/x`, { method, headers: { "Content-Type": "application/json", Origin: U }, body: govde ? JSON.stringify(govde) : undefined });
    const p = (id: string) => ({ params: Promise.resolve({ id }) });
    const y = await numaraRotasi.PATCH(istek("PATCH", { ad: "Kadıköy" }), p(a.id));
    expect(y.status).toBe(200);
    expect((await y.json()).baglanti).toMatchObject({ ad: "Kadıköy", etiket: "Kadıköy" });
    for (const r of [
      await numaraRotasi.GET(istek("GET"), p(baska.id)),
      await numaraRotasi.PATCH(istek("PATCH", { ad: "Ele geçir" }), p(baska.id)),
      await numaraRotasi.DELETE(istek("DELETE"), p(baska.id)),
    ]) {
      expect(r.status).toBe(404);
    }
    expect(baglantiGetir(baskaCtx, baska.id)).toMatchObject({ ad: "Merkez" });
  });
});

describe("şablonlar WABA'ya aittir", () => {
  it("aynı WABA'daki numaralar ortak kullanır; başka WABA ayrı senkronlanır; başka WABA'nın şablonuyla kampanya kurulamaz", async () => {
    const ctx = alan("Sablon");
    const n1 = await numaraEkle(ctx, "Merkez", "300201");
    const n2 = await numaraEkle(ctx, "Şube", "300201");
    const n3 = await numaraEkle(ctx, "Diğer Hesap", "300202");
    await wa.sablonlariSenkronizeEt(ctx, n1.id);
    expect(wa.sablonlar(ctx, n2.id).map((s) => s.ad)).toEqual(wa.sablonlar(ctx, n1.id).map((s) => s.ad));
    expect(wa.sablonlar(ctx, n2.id)).toHaveLength(3);
    expect(wa.sablonlar(ctx, n3.id)).toEqual([]);
    expect(baglantiGetir(ctx, n2.id)?.sablonSenkronTarihi).toBeInstanceOf(Date);
    expect(baglantiGetir(ctx, n3.id)?.sablonSenkronTarihi).toBeNull();

    // n3'ün WABA'sında aynı adlı şablonlar ayrı satırdır; n1'in senkronu onlara dokunmaz.
    await wa.sablonlariSenkronizeEt(ctx, n3.id);
    expect(sablonlariListele(ctx)).toHaveLength(6);
    mockWhatsapp.sablonlar = [];
    await wa.sablonlariSenkronizeEt(ctx, n1.id);
    expect(wa.sablonlar(ctx, n1.id).every((s) => s.durum === "SILINDI")).toBe(true);
    expect(wa.sablonlar(ctx, n3.id).every((s) => s.durum !== "SILINDI")).toBe(true);

    kisiler(ctx, "sab", ["0532 900 00 01"]);
    const n1Sablonu = sablonlariListele(ctx, n1.waba).find((s) => s.ad === "randevu_hatirlatma")!;
    expect(() => kampanyaOzeti(ctx, { ...girdi(ctx, n3, "sab"), sablonId: n1Sablonu.id }, SIMDI)).toThrow(/WhatsApp hesabında yok/);
  });

  it("kampanyada gönderen numara zorunlu; başka çalışma alanının numarası kullanılamaz", async () => {
    const ctx = alan("Zorunlu");
    const n = await numaraEkle(ctx, "Merkez", "300301");
    await wa.sablonlariSenkronizeEt(ctx, n.id);
    const g = girdi(ctx, n, "z");
    expect(KampanyaGirdisi.safeParse({ ...g, baglantiId: undefined }).error?.issues[0]?.message).toBe("Gönderen WhatsApp numarasını seçin.");
    const baska = await numaraEkle(alan("ZorunluBaska"), "Merkez", "300302");
    expect(() => kampanyaOzeti(ctx, { ...g, baglantiId: baska.id }, SIMDI)).toThrow(KampanyaHatasi);
    expect(() => kampanyaOzeti(ctx, { ...g, baglantiId: baska.id }, SIMDI)).toThrow(/numarası bulunamadı/);
  });
});

describe("gönderim numara başına", () => {
  it("test modu ve test numaraları numaraya ait; kampanya seçilen numaradan gider", async () => {
    const ctx = alan("TestModu");
    const n1 = await numaraEkle(ctx, "Merkez", "300401");
    const n2 = await numaraEkle(ctx, "Şube", "300401");
    await wa.sablonlariSenkronizeEt(ctx, n1.id);
    hazirla(ctx, n1, { testModu: true }); // n1 test modunda
    hazirla(ctx, n2); // n2 test modu kapalı
    wa.testNumaralariKaydet(ctx, n1.id, ["0532 900 01 01"]);
    kisiler(ctx, "tm", ["0532 900 01 01", "0532 900 01 02", "0532 900 01 03"]);

    const o1 = kampanyaOzeti(ctx, girdi(ctx, n1, "tm"), SIMDI);
    expect(o1).toMatchObject({ gonderilecek: 1, haricler: { test_modu: 2 } });
    expect(o1.whatsapp).toMatchObject({ testModu: true, numara: { id: n1.id, etiket: "Merkez" } });
    const o2 = kampanyaOzeti(ctx, girdi(ctx, n2, "tm"), SIMDI);
    expect(o2).toMatchObject({ gonderilecek: 3 });
    expect(o2.whatsapp).toMatchObject({ testModu: false, numara: { id: n2.id } });

    const k1 = kampanyaBaslat(ctx, girdi(ctx, n1, "tm"), SIMDI);
    const k2 = kampanyaBaslat(ctx, girdi(ctx, n2, "tm"), SIMDI);
    expect(k1.baglantiId).toBe(n1.id);
    await tur();
    expect(gonderenler(k1.id).filter((m) => m.durum === "gonderildi").map((m) => m.g)).toEqual([n1.phoneId]);
    expect(gonderenler(k2.id).map((m) => [m.durum, m.g])).toEqual([
      ["gonderildi", n2.phoneId],
      ["gonderildi", n2.phoneId],
      ["gonderildi", n2.phoneId],
    ]);
    expect(wa.kampanyaNumarasi(ctx, kampanyaGetir(ctx, k2.id)!)).toBe("Şube");
  });

  it("Meta hesap kilidi (gönderimde 131031): aynı WABA'daki numaralar kilitlenir; başka WABA'nın kampanyası sürer", async () => {
    const ctx = alan("Kilit");
    const n1 = await numaraEkle(ctx, "Merkez", "300501");
    const n2 = await numaraEkle(ctx, "Şube", "300501");
    const n3 = await numaraEkle(ctx, "Diğer Hesap", "300502");
    await wa.sablonlariSenkronizeEt(ctx, n1.id);
    await wa.sablonlariSenkronizeEt(ctx, n3.id);
    for (const n of [n1, n2, n3]) hazirla(ctx, n);
    kisiler(ctx, "k1", ["0532 900 02 01"]);
    kisiler(ctx, "k3", ["0532 900 02 03"]);
    mockWhatsapp.aliciHatalari.set("905329000201", new GraphHatasi("Business account is restricted", 400, 131031));

    const k1 = kampanyaBaslat(ctx, girdi(ctx, n1, "k1"), SIMDI);
    const k3 = kampanyaBaslat(ctx, girdi(ctx, n3, "k3"), SIMDI);
    await tur();
    expect(kampanyaGetir(ctx, k1.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "meta_hesap_kilitli" });
    expect(baglantiGetir(ctx, n1.id)?.hesapKilidiKodu).toBe(131031);
    expect(baglantiGetir(ctx, n2.id)?.hesapKilidiKodu).toBe(131031);
    expect(baglantiGetir(ctx, n3.id)?.hesapKilidiKodu).toBeNull();
    expect(kampanyaGetir(ctx, k3.id)?.durum).not.toBe("duraklatildi");
    expect(gonderenler(k3.id).map((m) => m.durum)).toEqual(["gonderildi"]);

    // Kilitli WABA'daki diğer numara da gönderemez; kampanyası duraklar.
    kisiler(ctx, "k2", ["0532 900 02 02"]);
    expect(() => kampanyaBaslat(ctx, girdi(ctx, n2, "k2"), SIMDI)).toThrow(/Kilit kalkana kadar/);
  });

  it("webhook'tan gelen hesap kilidi (statuses failed 131031) aynı WABA'daki numaraların kampanyalarını duraklatır, diğerininkini değil", async () => {
    const ctx = alan("KilitWebhook");
    const n1 = await numaraEkle(ctx, "Merkez", "300601");
    const n2 = await numaraEkle(ctx, "Şube", "300601");
    const n3 = await numaraEkle(ctx, "Diğer Hesap", "300602");
    const calisan = (id: string, baglantiId: string) =>
      db.$client
        .prepare(
          "insert into kampanyalar (id, tenant_id, kanal, ad, sablon, filtre, sandbox, durum, baglanti_id) values (?, ?, 'whatsapp_api', 'K', 'S', '{}', 0, 'calisiyor', ?)",
        )
        .run(id, ctx.tenantId, baglantiId);
    calisan("kw-1", n1.id);
    calisan("kw-2", n2.id);
    calisan("kw-3", n3.id);
    const y = await bildirim(n1, {
      field: "messages",
      value: { metadata: { phone_number_id: n1.phoneId }, statuses: [{ id: "wamid.yok", status: "failed", errors: [{ code: 131031 }] }] },
    });
    expect(y.status).toBe(200);
    expect(kampanyaGetir(ctx, "kw-1")?.durum).toBe("duraklatildi");
    expect(kampanyaGetir(ctx, "kw-2")?.durum).toBe("duraklatildi");
    expect(kampanyaGetir(ctx, "kw-3")?.durum).toBe("calisiyor");
    expect(baglantiGetir(ctx, n3.id)?.hesapKilidiKodu).toBeNull();
    // Bağlantı testi başarılı olunca kilit aynı WABA'daki numaralardan kalkar.
    await wa.baglantiyiTestEt(ctx, n2.id);
    expect(baglantiGetir(ctx, n1.id)?.hesapKilidiKodu).toBeNull();
    expect(baglantiGetir(ctx, n2.id)?.hesapKilidiKodu).toBeNull();
  });

  it("kalite kırmızı yalnızca o numaranın kampanyasını duraklatır", async () => {
    const ctx = alan("Kalite");
    const n1 = await numaraEkle(ctx, "Merkez", "300701");
    const n2 = await numaraEkle(ctx, "Şube", "300701");
    await wa.sablonlariSenkronizeEt(ctx, n1.id);
    hazirla(ctx, n1);
    hazirla(ctx, n2);
    kisiler(ctx, "q1", ["0532 900 03 01"]);
    kisiler(ctx, "q2", ["0532 900 03 02"]);
    const k1 = kampanyaBaslat(ctx, girdi(ctx, n1, "q1"), SIMDI);
    const k2 = kampanyaBaslat(ctx, girdi(ctx, n2, "q2"), SIMDI);
    db.$client.prepare("update whatsapp_baglantilari set kalite = 'RED' where id = ?").run(n1.id);
    await tur();
    expect(kampanyaGetir(ctx, k1.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "kalite_dusuk" });
    expect(gonderenler(k1.id).map((m) => m.durum)).toEqual(["kuyrukta"]);
    expect(gonderenler(k2.id).map((m) => [m.durum, m.g])).toEqual([["gonderildi", n2.phoneId]]);
  });

  it("Meta limitinin payı (portföy) bütün numaraların son 24 saatteki gönderimleriyle sayılır", async () => {
    const ctx = alan("Portfoy");
    const n1 = await numaraEkle(ctx, "Merkez", "300801");
    const n2 = await numaraEkle(ctx, "Şube", "300801");
    await wa.sablonlariSenkronizeEt(ctx, n1.id);
    hazirla(ctx, n1, { limit: "TIER_250" });
    hazirla(ctx, n2);
    wa.uygulamaPayiKaydet(ctx, n1.id, 1); // 250 × %1 = 2
    kisiler(ctx, "p2", ["0532 900 04 01", "0532 900 04 02"]);
    const k2 = kampanyaBaslat(ctx, girdi(ctx, n2, "p2"), SIMDI);
    await tur();
    expect(gonderenler(k2.id).map((m) => m.durum)).toEqual(["gonderildi", "gonderildi"]);

    kisiler(ctx, "p1", ["0532 900 04 03"]);
    const k1 = kampanyaBaslat(ctx, girdi(ctx, n1, "p1"), SIMDI);
    await tur();
    expect(gonderenler(k1.id)).toEqual([{ durum: "kuyrukta", neden: "whatsapp_limit", g: null }]);
  });

  it("RET kişiye aittir: bir numaraya RET yazan diğer numaradan da mesaj almaz", async () => {
    const ctx = alan("Ret");
    const n1 = await numaraEkle(ctx, "Merkez", "300901");
    const n2 = await numaraEkle(ctx, "Şube", "300901");
    await wa.sablonlariSenkronizeEt(ctx, n1.id);
    hazirla(ctx, n2);
    const [kisi] = kisiler(ctx, "r", ["0532 900 05 01"]);
    const y = await bildirim(n1, {
      field: "messages",
      value: {
        metadata: { phone_number_id: n1.phoneId },
        contacts: [{ wa_id: "905329000501" }],
        messages: [{ id: "wamid.RET.1", from: "905329000501", type: "text", text: { body: "RET" } }],
      },
    });
    expect(y.status).toBe(200);
    expect(kayitGetir(ctx, kisi.id)?.iletiIzni).toBe("ret");
    const o = kampanyaOzeti(ctx, girdi(ctx, n2, "r"), SIMDI);
    expect(o).toMatchObject({ gonderilecek: 0, haricler: { ret: 1 } });
  });

  it("numara kaldırılınca yalnızca onun çalışan kampanyaları duraklar; geçmişte 'Silinmiş numara' görünür", async () => {
    const ctx = alan("Kaldir");
    const n1 = await numaraEkle(ctx, "Merkez", "301001");
    const n2 = await numaraEkle(ctx, "Şube", "301001");
    await wa.sablonlariSenkronizeEt(ctx, n1.id);
    hazirla(ctx, n1);
    hazirla(ctx, n2);
    kisiler(ctx, "d1", ["0532 900 06 01"]);
    kisiler(ctx, "d2", ["0532 900 06 02"]);
    const k1 = kampanyaBaslat(ctx, girdi(ctx, n1, "d1"), SIMDI);
    const k2 = kampanyaBaslat(ctx, girdi(ctx, n2, "d2"), SIMDI);
    wa.whatsappBaglantisiKaldir(ctx, n1.id);
    expect(kampanyaGetir(ctx, k1.id)).toMatchObject({ durum: "duraklatildi", duraklatmaNedeni: "baglanti_yok" });
    expect(kampanyaGetir(ctx, k2.id)?.durum).toBe("calisiyor");
    await tur();
    expect(gonderenler(k1.id).map((m) => m.durum)).toEqual(["kuyrukta"]);
    expect(gonderenler(k2.id).map((m) => m.durum)).toEqual(["gonderildi"]);
    expect(wa.kampanyaNumarasi(ctx, kampanyaGetir(ctx, k1.id)!)).toBe("Silinmiş numara");
    expect(wa.numaraEtiketleri(ctx).has(n1.id)).toBe(false);
  });
});

describe("webhook: ortak bildirim adresi", () => {
  /** n'in numarasından gönderilmiş (sandbox olmayan) bir kuyruk satırı. */
  function gonderilmis(ctx: TenantContext, n: Numara, wamid: string) {
    const [kisi] = kisiler(ctx, `w-${wamid}`, [`0532 91${String(++sayac).padStart(5, "0")}`]);
    db.$client
      .prepare(
        "insert into kampanyalar (id, tenant_id, kanal, ad, sablon, filtre, sandbox, durum, baglanti_id) values (?, ?, 'whatsapp_api', 'K', 'S', '{}', 0, 'tamamlandi', ?)",
      )
      .run(`k-${wamid}`, ctx.tenantId, n.id);
    db.$client
      .prepare(
        "insert into message_queue (id, tenant_id, kampanya_id, lead_id, kanal, durum, saglayici_kimligi, gonderen_numara) values (?, ?, ?, ?, 'whatsapp_api', 'gonderildi', ?, ?)",
      )
      .run(`m-${wamid}`, ctx.tenantId, `k-${wamid}`, kisi.id, wamid, n.phoneId);
  }
  const teslim = (wamid: string) =>
    (db.$client.prepare("select teslim_durumu t from message_queue where saglayici_kimligi = ?").get(wamid) as { t: string | null }).t;

  it("aynı Meta uygulamasındaki numaranın bildirimi ilk numaranın adresine gelse de o numaraya işlenir; test modu koşulları o numarada sağlanır", async () => {
    const ctx = alan("Ortak");
    const n1 = await numaraEkle(ctx, "Merkez", "302001");
    const n2 = await numaraEkle(ctx, "Şube", "302001");
    gonderilmis(ctx, n2, "wamid.ORTAK.2");
    const y = await bildirim(n1, {
      field: "messages",
      value: { metadata: { phone_number_id: n2.phoneId }, statuses: [{ id: "wamid.ORTAK.2", status: "delivered", timestamp: "1794826800" }] },
    });
    expect(y.status).toBe(200);
    expect(teslim("wamid.ORTAK.2")).toBe("delivered");
    expect(baglantiGetir(ctx, n2.id)?.sonImzaliDurumTarihi).toBeInstanceOf(Date);
    // Meta'nın GET doğrulaması yalnızca uygulamanın tek adresine (n1) yapılır: n2'nin 2. adımı imzalı bildirimle tamamlanır.
    expect(baglantiGetir(ctx, n2.id)?.webhookDogrulamaTarihi).toBeInstanceOf(Date);
    expect(baglantiGetir(ctx, n1.id)?.sonImzaliDurumTarihi).toBeNull();
    expect(baglantiGetir(ctx, n1.id)?.webhookDogrulamaTarihi).toBeNull();
    // n2'nin test modu artık kapatılabilir (gönderen bilgileri tam).
    expect(() => wa.testModuDegistir(ctx, n2.id, false)).not.toThrow();
  });

  it("başka App Secret'lı (başka uygulama) numaraya ve başka çalışma alanının numarasına yönlendirilmez", async () => {
    const ctx = alan("Yonlendirme");
    const n1 = await numaraEkle(ctx, "Merkez", "302101");
    const n3 = await numaraEkle(ctx, "Başka Uygulama", "302101", "baska-app-secret");
    const baskaCtx = alan("YonlendirmeBaska");
    const baska = await numaraEkle(baskaCtx, "Merkez", "302102");
    gonderilmis(ctx, n3, "wamid.YON.3");
    gonderilmis(baskaCtx, baska, "wamid.YON.B");
    for (const [hedef, wamid] of [
      [n3, "wamid.YON.3"],
      [baska, "wamid.YON.B"],
    ] as const) {
      const y = await bildirim(n1, {
        field: "messages",
        value: { metadata: { phone_number_id: hedef.phoneId }, statuses: [{ id: wamid, status: "read" }] },
      });
      expect(y.status).toBe(200);
      expect(teslim(wamid)).toBeNull();
    }
    expect(baglantiGetir(ctx, n3.id)?.sonImzaliDurumTarihi).toBeNull();
    expect(baglantiGetir(baskaCtx, baska.id)?.sonImzaliDurumTarihi).toBeNull();
    // n3 kendi adresine kendi secret'ıyla gelirse işlenir.
    const y = await bildirim(n3, { field: "messages", value: { metadata: { phone_number_id: n3.phoneId }, statuses: [{ id: "wamid.YON.3", status: "read" }] } });
    expect(y.status).toBe(200);
    expect(teslim("wamid.YON.3")).toBe("read");
  });

  it("şablon durumu ve limit bildirimi (numarasız, WABA düzeyi) yalnızca o WABA'nın numaralarına yazılır", async () => {
    const ctx = alan("WabaBildirim");
    const n1 = await numaraEkle(ctx, "Merkez", "302201");
    const n2 = await numaraEkle(ctx, "Şube", "302201");
    const n3 = await numaraEkle(ctx, "Diğer Hesap", "302202");
    await wa.sablonlariSenkronizeEt(ctx, n1.id);
    await wa.sablonlariSenkronizeEt(ctx, n3.id);
    await bildirim(n1, {
      id: "302201",
      field: "message_template_status_update",
      value: { event: "PAUSED", message_template_id: 1003, message_template_name: "randevu_hatirlatma", message_template_language: "tr" },
    });
    const durum = (waba: string) => sablonlariListele(ctx, waba).find((s) => s.ad === "randevu_hatirlatma")!.durum;
    expect(durum("302201")).toBe("PAUSED");
    expect(durum("302202")).toBe("APPROVED");

    await bildirim(n1, { id: "302201", field: "business_capability_update", value: { max_daily_conversations_per_business: 2000 } });
    expect(baglantiGetir(ctx, n1.id)?.limitKatmani).toBe("TIER_2000");
    expect(baglantiGetir(ctx, n2.id)?.limitKatmani).toBe("TIER_2000");
    expect(baglantiGetir(ctx, n3.id)?.limitKatmani).toBeNull();
  });
});

describe("migration 0019", () => {
  const DRIZZLE = path.resolve(__dirname, "../drizzle");
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-0019-"));
  afterAll(() => fs.rmSync(gecici, { recursive: true, force: true }));

  function ilkMigrasyonlar(n: number) {
    const hedef = path.join(gecici, `ilk-${n}`);
    fs.mkdirSync(path.join(hedef, "meta"), { recursive: true });
    const gunluk = JSON.parse(fs.readFileSync(path.join(DRIZZLE, "meta/_journal.json"), "utf8"));
    gunluk.entries = gunluk.entries.slice(0, n);
    fs.writeFileSync(path.join(hedef, "meta/_journal.json"), JSON.stringify(gunluk));
    for (const g of gunluk.entries) fs.copyFileSync(path.join(DRIZZLE, `${g.tag}.sql`), path.join(hedef, `${g.tag}.sql`));
    return hedef;
  }

  it("tek bağlantılı eski veritabanı: bağlantıya kimlik ve 'Numara 1' adı; şablonlar WABA'ya, WhatsApp kampanyaları numaraya bağlanır", () => {
    const v = veritabaniAc(path.join(gecici, "eski.db"));
    const s = v.$client;
    migrasyonlariUygula(v, ilkMigrasyonlar(19)); // 0000–0018
    s.prepare("insert into tenants (id, ad, slug) values ('t1', 'T', 't1'), ('t2', 'Bağlantısız', 't2')").run();
    s.prepare(
      "insert into whatsapp_baglantilari (tenant_id, webhook_kimligi, waba_id, phone_number_id, sifreli_veri, test_modu, son_imzali_durum_tarihi) values ('t1', 'eski-kimlik-0123456789abcdef', '400001', '400002', 'v1:x', 0, 1)",
    ).run();
    for (const [id, t] of [
      ["s1", "t1"],
      ["s2", "t2"],
    ]) {
      s.prepare(
        "insert into whatsapp_sablonlari (id, tenant_id, meta_id, ad, dil, kategori, durum, bilesenler, degiskenler, abonelik_butonu) values (?, ?, 'm', 'a', 'tr', 'UTILITY', 'APPROVED', '[]', '[]', 0)",
      ).run(id, t);
    }
    s.prepare("insert into kampanyalar (id, tenant_id, kanal, ad, sablon, filtre, sandbox, durum) values ('kw', 't1', 'whatsapp_api', 'W', 'S', '{}', 0, 'calisiyor')").run();
    s.prepare("insert into kampanyalar (id, tenant_id, kanal, ad, sablon, filtre, sandbox, durum) values ('ke', 't1', 'eposta', 'E', 'S', '{}', 0, 'tamamlandi')").run();

    migrasyonlariUygula(v, DRIZZLE);

    const b = s.prepare("select id, ad, sira, webhook_kimligi, test_modu, son_imzali_durum_tarihi from whatsapp_baglantilari").all() as Record<string, unknown>[];
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ ad: "Numara 1", sira: 0, webhook_kimligi: "eski-kimlik-0123456789abcdef", test_modu: 0, son_imzali_durum_tarihi: 1 });
    expect(b[0].id).toMatch(/^[0-9a-f]{32}$/);
    expect(s.prepare("select id, waba_id from whatsapp_sablonlari order by id").all()).toEqual([
      { id: "s1", waba_id: "400001" },
      { id: "s2", waba_id: "" },
    ]);
    expect(s.prepare("select id, baglanti_id from kampanyalar order by id").all()).toEqual([
      { id: "ke", baglanti_id: null },
      { id: "kw", baglanti_id: b[0].id },
    ]);
    expect(s.pragma("foreign_key_check")).toEqual([]);
    // Aynı numara ikinci kez eklenemez; aynı alanda aynı ad olamaz.
    expect(() =>
      s
        .prepare("insert into whatsapp_baglantilari (id, ad, tenant_id, webhook_kimligi, waba_id, phone_number_id, sifreli_veri) values ('x', 'Numara 2', 't1', 'k2', '1', '400002', 'v')")
        .run(),
    ).toThrow(/UNIQUE/);
    expect(() =>
      s
        .prepare("insert into whatsapp_baglantilari (id, ad, tenant_id, webhook_kimligi, waba_id, phone_number_id, sifreli_veri) values ('y', 'Numara 1', 't1', 'k3', '1', '400003', 'v')")
        .run(),
    ).toThrow(/UNIQUE/);
    s.close();
  });
});
