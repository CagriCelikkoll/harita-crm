// Kampanyalar ve gönderim işçisi: alıcı kuralları (oluşturmada VE gönderim anında), günlük sınır, gönderim
// saati, idempotans, yeniden deneme, belirsiz sonuç, ticari ileti ön koşulları.
import { spawn } from "node:child_process";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adresOzeti } from "@/server/messaging/adres";
import type { TenantContext } from "@/server/repo/baglam";
import { engelEkle } from "@/server/repo/engel-listesi";
import { sayacDegeri } from "@/server/repo/gonderim-sayaci";
import { iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import { kampanyaGetir, kampanyaIptal, kampanyaMesajlari } from "@/server/repo/kampanyalar";
import { kayitGetir, kayitGuncelle, kayitSil } from "@/server/repo/kayitlar";
import { olaylariListele } from "@/server/repo/olaylar";
import { saglayiciKaydet } from "@/server/repo/saglayicilar";
import { gunlukSinirAyarla } from "@/server/repo/sistem/sinir";
import { isciTuru } from "@/server/servisler/isci";
import { KampanyaHatasi, kampanyaBaslat, kampanyaOzeti, type KampanyaGirdisi } from "@/server/servisler/kampanya";
import { kiraciOlustur } from "./yardimci/fabrika";
import { kayitOlustur, SahteSaglayici } from "./yardimci/mesaj-fabrika";

// 12 Ekim 2026 12:00 İstanbul (gönderim penceresi 09:00–20:00 içinde).
const OGLE = new Date("2026-10-12T09:00:00Z");
const sabit = (t: Date) => () => t;

function yeniKiraci() {
  const k = kiraciOlustur(`Kmp${Math.random().toString(36).slice(2, 7)}`);
  const slug = (db.$client.prepare("select slug from tenants where id = ?").get(k.ctx.tenantId) as { slug: string }).slug;
  return { ...k, slug };
}

const girdi = (g: Partial<KampanyaGirdisi> = {}): KampanyaGirdisi => ({
  kanal: "eposta",
  ad: "Ekim kampanyası",
  konu: "Teklif",
  sablon: "Merhaba {isletme},\nYeni portföyümüz hazır.",
  filtre: {},
  testModu: false,
  ...g,
});

/** Sahte sağlayıcıyla işçi turu. */
const tur = (saglayici: SahteSaglayici, simdi = OGLE, parti = 50) =>
  isciTuru({ simdi: sabit(simdi), parti, saglayiciSec: () => saglayici });

// İşçi kiracılar arası çalışır: her test yalnızca kendi kampanyasını görsün diye öncekiler kapatılır.
beforeEach(() => {
  db.$client.prepare("update message_queue set durum = 'iptal' where durum in ('kuyrukta', 'gonderiliyor')").run();
  db.$client.prepare("update kampanyalar set durum = 'iptal' where durum in ('zamanlandi', 'calisiyor')").run();
});

function ticariIletiTamamla(ctx: TenantContext) {
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Emlak Ltd.", iletisimBilgisi: "İzmir", iysNo: "123456", sorumlulukOnayi: true });
}

describe("kampanya oluşturma: alıcı kuralları", () => {
  it("ret, engel listesi, bireysel+izinsiz ve iletişim bilgisi olmayan kayıtlar hariç; özet nedenleri sayar", () => {
    const { ctx } = yeniKiraci();
    kayitOlustur(ctx, { eposta: "uygun1@ornek.test", isletmeAdi: "Bir" });
    kayitOlustur(ctx, { eposta: "uygun2@ornek.test" }); // işletme adı yok
    kayitOlustur(ctx, { eposta: "ret@ornek.test", iletiIzni: "ret" });
    kayitOlustur(ctx, { eposta: "birey@ornek.test", aliciTuru: "bireysel" });
    kayitOlustur(ctx, { eposta: "birey-onayli@ornek.test", aliciTuru: "bireysel", iletiIzni: "onayli" });
    kayitOlustur(ctx, {}); // e-posta yok
    kayitOlustur(ctx, { eposta: "Engelli@Ornek.test" });
    engelEkle(ctx, [{ tur: "eposta", ozet: adresOzeti(ctx.tenantId, "eposta", "engelli@ornek.test") }], "abonelik");
    // Adaylar oluşturma zamanına göre sıralanır; aynı milisaniyede oluşan kayıtlarda sıra rastgele id'ye kalır.
    // Önizleme ilk uygun kayıttan geldiği için "Bir" açıkça en önce oluşturulmuş sayılır.
    db.$client
      .prepare("update leads set olusturma_tarihi = olusturma_tarihi - 60000 where tenant_id = ? and eposta = 'uygun1@ornek.test'")
      .run(ctx.tenantId);

    const ozet = kampanyaOzeti(ctx, girdi(), OGLE);
    expect(ozet).toMatchObject({
      toplamAday: 7,
      gonderilecek: 3,
      haricler: { ret: 1, engel: 1, iletisim_yok: 1, bireysel_izinsiz: 1, cep_degil: 0 },
      isletmeAdiEksik: 2,
      sandbox: true, // SMTP tanımlı değil
      sonrakiGunlereKalacak: 0,
    });
    expect(ozet.onizleme).toBe("Merhaba Bir,\nYeni portföyümüz hazır.");

    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    const g = kampanyaGetir(ctx, k.id)!;
    expect(g.sayilar).toMatchObject({ kuyrukta: 3, haric: 4 });
  });

  it("ret elle işaretlenince kaydın adresi engel listesine de yazılır; kayıt silinip aynı adresle yeniden eklense de gönderilmez", () => {
    const { ctx } = yeniKiraci();
    const k = kayitOlustur(ctx, { eposta: "eski@ornek.test" });
    kayitGuncelle(ctx, k.id, { iletiIzni: "ret" });
    kayitSil(ctx, k.id);
    kayitOlustur(ctx, { eposta: "ESKI@ornek.test" }); // yeni taramada tekrar bulunmuş gibi
    expect(kampanyaOzeti(ctx, girdi(), OGLE)).toMatchObject({ gonderilecek: 0, haricler: { engel: 1 } });
  });

  it("filtre: durum, etiket ve alıcı türü", () => {
    const { ctx } = yeniKiraci();
    kayitOlustur(ctx, { eposta: "a@ornek.test", etiketler: ["sıcak"] });
    kayitOlustur(ctx, { eposta: "b@ornek.test", durum: "gorusme" });
    kayitOlustur(ctx, { eposta: "c@ornek.test", aliciTuru: "bireysel", iletiIzni: "onayli" });
    expect(kampanyaOzeti(ctx, girdi({ filtre: { etiket: "sıcak" } }), OGLE).toplamAday).toBe(1);
    expect(kampanyaOzeti(ctx, girdi({ filtre: { durum: "gorusme" } }), OGLE).toplamAday).toBe(1);
    expect(kampanyaOzeti(ctx, girdi({ filtre: { aliciTuru: "bireysel" } }), OGLE).toplamAday).toBe(1);
  });

  it("sağlayıcı tanımlıyken ticari ileti bilgileri ve onay olmadan sandbox dışı kampanya başlatılamaz", () => {
    const { ctx } = yeniKiraci();
    kayitOlustur(ctx, { eposta: "a@ornek.test" });
    saglayiciKaydet(ctx, "eposta", "smtp", "v1:yok"); // yalnızca "tanımlı" olması yeterli
    expect(() => kampanyaBaslat(ctx, girdi(), OGLE)).toThrow(KampanyaHatasi);
    expect(kampanyaBaslat(ctx, girdi({ testModu: true }), OGLE).sandbox).toBe(true); // test modu serbest
    ticariIletiTamamla(ctx);
    expect(kampanyaBaslat(ctx, girdi(), OGLE).sandbox).toBe(false);
  });

  it("kurallara uyan alıcı yoksa kampanya oluşturulmaz", () => {
    const { ctx } = yeniKiraci();
    kayitOlustur(ctx, { eposta: "a@ornek.test", iletiIzni: "ret" });
    expect(() => kampanyaBaslat(ctx, girdi(), OGLE)).toThrow(/alıcı yok/);
  });
});

describe("işçi: gönderim anında yeniden kontrol", () => {
  it("kampanya oluşturulduktan sonra ret / engel / bireysele çevirme gelen kayıtlara gönderilmez", async () => {
    const { ctx } = yeniKiraci();
    const r = kayitOlustur(ctx, { eposta: "sonra-ret@ornek.test" });
    const e = kayitOlustur(ctx, { eposta: "sonra-engel@ornek.test" });
    const b = kayitOlustur(ctx, { eposta: "sonra-birey@ornek.test" });
    const u = kayitOlustur(ctx, { eposta: "uygun@ornek.test" });
    const k = kampanyaBaslat(ctx, girdi(), OGLE);

    kayitGuncelle(ctx, r.id, { iletiIzni: "ret" });
    engelEkle(ctx, [{ tur: "eposta", ozet: adresOzeti(ctx.tenantId, "eposta", "sonra-engel@ornek.test") }], "abonelik");
    kayitGuncelle(ctx, b.id, { aliciTuru: "bireysel" });

    const s = new SahteSaglayici("eposta", true);
    await tur(s);
    expect(s.gonderilen.map((i) => i.alici)).toEqual(["uygun@ornek.test"]);
    const mesajlar = kampanyaMesajlari(ctx, k.id).mesajlar;
    const neden = (id: string) => mesajlar.find((m) => m.leadId === id);
    expect(neden(r.id)).toMatchObject({ durum: "haric", neden: "ret" });
    expect(neden(e.id)).toMatchObject({ durum: "haric", neden: "engel" });
    expect(neden(b.id)).toMatchObject({ durum: "haric", neden: "bireysel_izinsiz" });
    expect(neden(u.id)).toMatchObject({ durum: "gonderildi" });
    expect(kampanyaGetir(ctx, k.id)!.durum).toBe("tamamlandi");
  });

  it("gerçek gönderimde lead_events yazılır ve 'yeni' → 'iletisimde'; sandbox kaydın durumunu değiştirmez", async () => {
    const { ctx } = yeniKiraci();
    ticariIletiTamamla(ctx);
    saglayiciKaydet(ctx, "eposta", "smtp", "v1:yok");
    const a = kayitOlustur(ctx, { eposta: "a@ornek.test", isletmeAdi: "Ada" });
    kampanyaBaslat(ctx, girdi(), OGLE);
    const gercek = new SahteSaglayici("eposta", false);
    await tur(gercek);
    expect(kayitGetir(ctx, a.id)!.durum).toBe("iletisimde");
    const olaylar = olaylariListele(ctx, a.id);
    expect(olaylar.find((o) => o.tur === "eposta")?.aciklama).toBe("Kampanya: Ekim kampanyası");
    expect(olaylar.find((o) => o.tur === "durum")?.aciklama).toBe("Yeni → İletişimde");
    expect(gercek.gonderilen[0].metin).toContain("Merhaba Ada,");

    const b = kayitOlustur(ctx, { eposta: "b@ornek.test" });
    const k2 = kampanyaBaslat(ctx, girdi({ testModu: true, filtre: { durum: "yeni" } }), OGLE);
    await tur(new SahteSaglayici("eposta", true));
    expect(kayitGetir(ctx, b.id)!.durum).toBe("yeni");
    expect(olaylariListele(ctx, b.id).find((o) => o.tur === "eposta")?.aciklama).toMatch(/^\(test\) /);
    expect(kampanyaMesajlari(ctx, k2.id).mesajlar[0].sandboxIcerik).toContain("Merhaba,");
  });

  it("iptal edilen kampanyanın bekleyen mesajları gönderilmez", async () => {
    const { ctx } = yeniKiraci();
    kayitOlustur(ctx, { eposta: "a@ornek.test" });
    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    expect(kampanyaIptal(ctx, k.id)).toBe(true);
    const s = new SahteSaglayici("eposta", true);
    await tur(s);
    expect(s.gonderilen).toHaveLength(0);
    expect(kampanyaGetir(ctx, k.id)!.sayilar.iptal).toBe(1);
  });
});

describe("işçi: günlük sınır ve gönderim saati (İstanbul)", () => {
  it("günlük sınır atomik uygulanır; sınıra takılanlar ertesi günün başlangıcına kalır", async () => {
    const { ctx, slug } = yeniKiraci();
    gunlukSinirAyarla(slug, "eposta", 3);
    for (let i = 0; i < 5; i++) kayitOlustur(ctx, { eposta: `k${i}@ornek.test` });
    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    expect(kampanyaOzeti(ctx, girdi(), OGLE)).toMatchObject({ gonderilecek: 5, bugunKalan: 3, sonrakiGunlereKalacak: 2 });

    const s = new SahteSaglayici("eposta", true);
    await tur(s);
    expect(s.gonderilen).toHaveLength(3);
    expect(sayacDegeri(ctx, "eposta", "2026-10-12")).toBe(3);
    const bekleyen = kampanyaMesajlari(ctx, k.id, { durum: "kuyrukta" }).mesajlar;
    expect(bekleyen).toHaveLength(2);
    expect(bekleyen[0]).toMatchObject({ neden: "gunluk_sinir", denemeSayisi: 0 });
    expect(bekleyen[0].sonrakiDeneme).toEqual(new Date("2026-10-13T06:00:00Z")); // 13 Ekim 09:00 İstanbul

    await tur(s, new Date("2026-10-12T16:00:00Z")); // aynı gün 19:00: hâlâ bekler
    expect(s.gonderilen).toHaveLength(3);
    await tur(s, new Date("2026-10-13T06:00:00Z")); // ertesi gün 09:00
    expect(s.gonderilen).toHaveLength(5);
    expect(kampanyaGetir(ctx, k.id)!.durum).toBe("tamamlandi");
  });

  it("gönderim saati dışında mesajlar bekler (20:00 sonrası → ertesi 09:00; 09:00 öncesi → aynı gün 09:00)", async () => {
    const { ctx } = yeniKiraci();
    kayitOlustur(ctx, { eposta: "a@ornek.test" });
    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    const s = new SahteSaglayici("eposta", true);

    await tur(s, new Date("2026-10-12T18:30:00Z")); // 21:30 İstanbul
    expect(s.gonderilen).toHaveLength(0);
    let m = kampanyaMesajlari(ctx, k.id).mesajlar[0];
    expect(m).toMatchObject({ durum: "kuyrukta", neden: "gonderim_saati", denemeSayisi: 0 });
    expect(m.sonrakiDeneme).toEqual(new Date("2026-10-13T06:00:00Z"));

    // Sonraki deneme zamanı gelmeden işçi alamaz; ardından ayarlar değişip 08:00 → 09:00 kuralı:
    iletiAyarlariGuncelle(ctx, { gonderimBaslangicDk: 10 * 60, gonderimBitisDk: 18 * 60 });
    await tur(s, new Date("2026-10-13T06:30:00Z")); // 09:30 İstanbul, pencere 10:00'da açılır
    m = kampanyaMesajlari(ctx, k.id).mesajlar[0];
    expect(m.sonrakiDeneme).toEqual(new Date("2026-10-13T07:00:00Z"));
    await tur(s, new Date("2026-10-13T07:00:00Z"));
    expect(s.gonderilen).toHaveLength(1);
  });
});

describe("işçi: idempotans ve hatalar", () => {
  it("tur tekrar çalıştırılsa da aynı mesaj iki kez gönderilmez", async () => {
    const { ctx } = yeniKiraci();
    for (let i = 0; i < 4; i++) kayitOlustur(ctx, { eposta: `t${i}@ornek.test` });
    kampanyaBaslat(ctx, girdi(), OGLE);
    const s = new SahteSaglayici("eposta", true);
    await tur(s);
    await tur(s);
    await tur(s);
    expect(s.gonderilen).toHaveLength(4);
  });

  it("aynı süreçte eşzamanlı iki tur aynı mesajı almaz", async () => {
    const { ctx } = yeniKiraci();
    for (let i = 0; i < 12; i++) kayitOlustur(ctx, { eposta: `es${i}@ornek.test` });
    kampanyaBaslat(ctx, girdi(), OGLE);
    const s = new SahteSaglayici("eposta", true, undefined, 5);
    await Promise.all([tur(s, OGLE, 5), tur(s, OGLE, 5), tur(s, OGLE, 5)]);
    await tur(s);
    const adresler = s.gonderilen.map((i) => i.alici);
    expect(adresler).toHaveLength(12);
    expect(new Set(adresler).size).toBe(12);
  });

  it("ayrı süreçlerde çalışan işçiler tek işçi kilidiyle sırayla çalışır, aynı mesajı iki kez göndermez", async () => {
    const { ctx } = yeniKiraci();
    for (let i = 0; i < 40; i++) kayitOlustur(ctx, { eposta: `sr${i}@ornek.test` });
    kampanyaBaslat(ctx, girdi(), OGLE);
    const isci = path.resolve(__dirname, "yardimci/isci-sureci.ts");
    const baslangic = Date.now() + 2500;
    const ciktilar = await Promise.all(
      Array.from(
        { length: 3 },
        () =>
          new Promise<string[]>((coz, reddet) => {
            const s = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", isci, String(OGLE.getTime()), String(baslangic)], {
              env: { ...process.env },
              cwd: path.resolve(__dirname, ".."),
            });
            let cikti = "";
            let hata = "";
            s.stdout.on("data", (d) => (cikti += d));
            s.stderr.on("data", (d) => (hata += d));
            s.on("close", (kod) => (kod === 0 ? coz(JSON.parse(cikti.trim().split("\n").pop()!)) : reddet(new Error(hata))));
          }),
      ),
    );
    const hepsi = ciktilar.flat();
    expect(hepsi).toHaveLength(40);
    expect(new Set(hepsi).size).toBe(40);
    expect(ciktilar.filter((c) => c.length > 0).length).toBeGreaterThan(1); // gerçekten paylaştılar
  }, 60_000);

  it("geçici hata: en fazla 3 deneme, aralarda bekler; başarısızlıkta günlük sınır iade edilir", async () => {
    const { ctx } = yeniKiraci();
    kayitOlustur(ctx, { eposta: "gecici@ornek.test" });
    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    const s = new SahteSaglayici("eposta", true, () => ({ durum: "gecici_hata", hata: "SMTP geçici hata (451)." }));
    let t = OGLE;
    for (let i = 0; i < 5; i++) {
      await tur(s, t);
      t = new Date(t.getTime() + 60 * 60_000);
    }
    expect(s.gonderilen).toHaveLength(3);
    expect(kampanyaMesajlari(ctx, k.id).mesajlar[0]).toMatchObject({ durum: "basarisiz", neden: "gecici_hata", denemeSayisi: 3 });
    expect(sayacDegeri(ctx, "eposta", "2026-10-12")).toBe(0);
  });

  it("geçici hatadan sonra ikinci denemede gönderilir", async () => {
    const { ctx } = yeniKiraci();
    kayitOlustur(ctx, { eposta: "ikinci@ornek.test" });
    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    const s = new SahteSaglayici("eposta", true, (_i, n) =>
      n === 1 ? { durum: "gecici_hata", hata: "bağlantı yok" } : { durum: "gonderildi", saglayiciKimligi: "ok" },
    );
    await tur(s);
    await tur(s, new Date(OGLE.getTime() + 30_000)); // 1 dk bekleme dolmadı
    expect(s.gonderilen).toHaveLength(1);
    await tur(s, new Date(OGLE.getTime() + 61_000));
    expect(kampanyaMesajlari(ctx, k.id).mesajlar[0]).toMatchObject({ durum: "gonderildi", denemeSayisi: 2 });
  });

  it("gönderim ortasında çöken işçinin mesajı 'belirsiz' kapanır ve yeniden denenmez", async () => {
    const { ctx } = yeniKiraci();
    kayitOlustur(ctx, { eposta: "cokme@ornek.test" });
    const k = kampanyaBaslat(ctx, girdi(), OGLE);
    // Çökmeyi taklit: satır "gonderiliyor" durumunda, kilit 11 dk önce.
    db.$client
      .prepare("update message_queue set durum = 'gonderiliyor', kilit_zamani = ?, deneme_sayisi = 1 where kampanya_id = ?")
      .run(OGLE.getTime() - 11 * 60_000, k.id);
    const s = new SahteSaglayici("eposta", true);
    const sonuc = await tur(s);
    expect(sonuc.belirsiz).toBe(1);
    expect(s.gonderilen).toHaveLength(0);
    expect(kampanyaMesajlari(ctx, k.id).mesajlar[0]).toMatchObject({ durum: "basarisiz", neden: "belirsiz" });
    expect(kampanyaGetir(ctx, k.id)!.durum).toBe("tamamlandi");
  });

  it("İYS reddi (kalıcı, ret) gelen alıcı ret akışına girer: ileti_izni ret + engel listesi + olay", async () => {
    const { ctx } = yeniKiraci();
    const a = kayitOlustur(ctx, { eposta: "iys@ornek.test" });
    kampanyaBaslat(ctx, girdi(), OGLE);
    await tur(new SahteSaglayici("eposta", true, () => ({ durum: "kalici_hata", hata: "İYS ret", ret: true })));
    expect(kayitGetir(ctx, a.id)!.iletiIzni).toBe("ret");
    expect(olaylariListele(ctx, a.id).some((o) => o.tur === "ret")).toBe(true);
    kayitOlustur(ctx, { eposta: "iys@ornek.test" });
    expect(kampanyaOzeti(ctx, girdi(), OGLE).haricler.engel).toBe(1);
  });

  it("zamanlanmış kampanya planlanan zamandan önce gönderilmez", async () => {
    const { ctx } = yeniKiraci();
    kayitOlustur(ctx, { eposta: "plan@ornek.test" });
    const plan = new Date(OGLE.getTime() + 2 * 3_600_000);
    const k = kampanyaBaslat(ctx, girdi({ planlananTarih: plan.toISOString() }), OGLE);
    expect(k.durum).toBe("zamanlandi");
    const s = new SahteSaglayici("eposta", true);
    await tur(s, OGLE);
    expect(s.gonderilen).toHaveLength(0);
    await tur(s, plan);
    expect(s.gonderilen).toHaveLength(1);
  });
});
