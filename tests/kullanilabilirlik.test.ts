// Grup C — kullanılabilirlik: gönderim servisinin son nabzı ve kampanya detayındaki uyarı; engelli işareti; WhatsApp
// izni değişince güncelleme tarihi; bilgi değişikliklerinin "bilgi" olay türü; Türkçe etiketli CSV'ler; şablon metni
// parçaları; biçimlendirilmiş numara ve limit katmanı; WhatsApp günlük listede "WhatsApp'ta aç"ın aynı (Enterprise)
// çağrıdan adı döndürmesi; giriş formunun hidrasyondan önce gönderilememesi; geliştirme simgesinin yeri.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { telefonBicimle } from "@/lib/adres-normal";
import { isciDurumu } from "@/lib/mesajlasma";
import { limitKatmaniAdi, sablonParcalari } from "@/lib/whatsapp-api";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { adresOzeti } = await import("@/server/messaging/adres");
const { engelEkle, engelliKayitlar } = await import("@/server/repo/engel-listesi");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kayitGetir, kayitGuncelle, kisileriEkle } = await import("@/server/repo/kayitlar");
const { aylikPlacesBirimi } = await import("@/server/repo/kullanim");
const { olaylariListele } = await import("@/server/repo/olaylar");
const { isciKilidiAl, isciKilidiBirak, isciSonNabiz } = await import("@/server/repo/sistem/isci");
const { whatsappIzniAyarla } = await import("@/server/repo/whatsapp-kisileri");
const { gunlukListe } = await import("@/server/repo/whatsapp-listesi");
const { isciTuru } = await import("@/server/servisler/isci");
const { kampanyaBaslat } = await import("@/server/servisler/kampanya");
const wa = await import("@/server/servisler/whatsapp");
const kayitRotasi = await import("@/app/api/kayitlar/[id]/route");
const disaAktarRotasi = await import("@/app/api/kayitlar/disa-aktar/route");
const kampanyaRotasi = await import("@/app/api/kampanyalar/[id]/route");
const acRotasi = await import("@/app/api/whatsapp/ac/[id]/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");
const { kayitOlustur, SahteSaglayici } = await import("./yardimci/mesaj-fabrika");

const KOK = path.resolve(__dirname, "..");
const U = "https://crm.ornek.test";
const OGLE = new Date("2026-10-12T09:00:00Z");
const oku = (d: string) => fs.readFileSync(path.join(KOK, d), "utf8");

function kiraci() {
  const { ctx } = kiraciOlustur(`C${Math.random().toString(36).slice(2, 7)}`);
  db.$client.prepare("update tenants set aylik_places_kotasi = 6000 where id = ?").run(ctx.tenantId);
  oturum.ctx = ctx;
  return ctx;
}

describe("gönderim servisinin durumu", () => {
  it("son nabız kilit alınca, yenilenince ve bırakılınca yazılır; bırakılınca satır kalır", () => {
    db.$client.prepare("delete from isci_kilitleri").run();
    expect(isciSonNabiz()).toBeNull();
    expect(isciKilidiAl("x", 60_000, 1_000_000)).toBe(true);
    expect(isciSonNabiz()?.getTime()).toBe(1_000_000);
    isciKilidiBirak("x", 2_000_000);
    expect(isciSonNabiz()?.getTime()).toBe(2_000_000);
    expect(isciKilidiAl("y", 60_000, 2_000_001)).toBe(true); // bırakılan kilit hemen alınabilir
    isciKilidiBirak("y");
  });

  it("işçi turu nabzı günceller; kampanya API'si son nabzı döndürür", async () => {
    const ctx = kiraci();
    iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege" });
    kayitOlustur(ctx, { eposta: "a@ornek.test", aliciTuru: "tacir_esnaf" });
    const k = kampanyaBaslat(ctx, { kanal: "eposta", ad: "E", konu: "K", sablon: "M", filtre: {}, testModu: true }, OGLE);
    const once = Date.now();
    await isciTuru({ simdi: () => OGLE, saglayiciSec: () => new SahteSaglayici("eposta", true) });
    expect(isciSonNabiz()!.getTime()).toBeGreaterThanOrEqual(once);
    const y = await kampanyaRotasi.GET(new Request(`${U}/api/kampanyalar/${k.id}`), { params: Promise.resolve({ id: k.id }) });
    expect((await y.json()).isciSonNabiz).toBe(isciSonNabiz()!.toISOString());
  });

  it("metin ve uyarı: hiç çalışmadıysa ve 5 dakikadan uzunsa uyarı", () => {
    const simdi = new Date("2026-10-12T09:10:00Z");
    expect(isciDurumu(null, simdi)).toMatchObject({ metin: "Gönderim kuyrukta — gönderim servisi henüz hiç çalışmadı.", uyari: true });
    expect(isciDurumu(new Date("2026-10-12T09:09:40Z"), simdi)).toEqual({
      metin: "Gönderim kuyrukta — gönderim servisi az önce çalıştı.",
      uyari: false,
      yoneticiUyarisi: null,
    });
    expect(isciDurumu(new Date("2026-10-12T09:07:00Z"), simdi)).toMatchObject({ metin: expect.stringContaining("en son 3 dakika önce"), uyari: false });
    expect(isciDurumu(new Date("2026-10-12T09:04:00Z"), simdi)).toMatchObject({ uyari: true });
    const ekran = oku("src/app/(app)/iletisim/kampanya/[id]/kampanya-detayi.tsx");
    expect(ekran).toContain("<IsciDurumu");
  });
});

describe("engelli işareti ve kayıt geçmişi", () => {
  it("engel listesindeki adresle eklenen kişi engelli; detay API'si engelli: true döner", async () => {
    const ctx = kiraci();
    engelEkle(ctx, [{ tur: "eposta", ozet: adresOzeti(ctx.tenantId, "eposta", "ret@ornek.test") }], "kayit_ret");
    const [engelli, temiz] = kisileriEkle(
      ctx,
      [
        { kaynak: "ice_aktarma", isletmeAdi: "E", eposta: "ret@ornek.test" },
        { kaynak: "ice_aktarma", isletmeAdi: "T", eposta: "temiz@ornek.test" },
      ],
      "t",
    );
    expect([...engelliKayitlar(ctx, [engelli, temiz])]).toEqual([engelli.id]);
    const y = await kayitRotasi.GET(new Request(`${U}/api/kayitlar/${engelli.id}`), { params: Promise.resolve({ id: engelli.id }) });
    expect((await y.json()).engelli).toBe(true);
    for (const d of ["src/app/(app)/kayitlar/kayit-tablosu.tsx", "src/app/(app)/kayitlar/detay-paneli.tsx"]) expect(oku(d)).toContain("Engelli");
  });

  it("WhatsApp izni değişince kaydın güncelleme tarihi de değişir", async () => {
    const ctx = kiraci();
    const k = kayitOlustur(ctx, { ekTelefon: "0532 222 00 01", aliciTuru: "tacir_esnaf" });
    db.$client.prepare("update leads set guncelleme_tarihi = 1000 where id = ?").run(k.id);
    whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form" });
    expect(kayitGetir(ctx, k.id)!.guncellemeTarihi.getTime()).toBeGreaterThan(1000);
  });

  it("bilgi değişiklikleri 'bilgi', ileti izni 'izin' türüyle; detay panelinde tek not yapısı", () => {
    const ctx = kiraci();
    const k = kayitOlustur(ctx, { aliciTuru: "tacir_esnaf" });
    kayitGuncelle(ctx, k.id, { yetkiliAdi: "Ali", notlar: "kayıt notu", iletiIzni: "onayli" });
    const turler = olaylariListele(ctx, k.id).map((o) => `${o.tur}:${o.aciklama}`);
    expect(turler).toEqual(
      expect.arrayContaining(["bilgi:Bilgiler güncellendi: yetkili adı", "bilgi:Kayıt notu güncellendi", "izin:İleti izni: Onaylı"]),
    );
    const panel = oku("src/app/(app)/kayitlar/detay-paneli.tsx");
    expect(panel).not.toMatch(/name="notlar"[^>]*rows=\{3\}[^>]*className="girdi" \/>\s*<\/label>\s*<MesajGoster mesaj=\{mesaj\} alan="bilgi"/);
    expect(panel).toContain("function KayitNotu");
    expect(panel).toContain("Notlar ve geçmiş");
    // Ret: izin kaynağı yerine "Ret · tarih · nasıl".
    expect(panel).toContain('w.izin === "ret" ? props.retMetni');
  });
});

describe("CSV'ler Türkçe Excel'e uygun", () => {
  it("dışa aktarma: BOM, noktalı virgül, Türkçe başlık ve etiketler (kod değeri yok)", async () => {
    const ctx = kiraci();
    kayitOlustur(ctx, { aliciTuru: "tacir_esnaf", isletmeAdi: "A" });
    const bayt = new Uint8Array(await (await disaAktarRotasi.GET(new Request(`${U}/api/kayitlar/disa-aktar`))).arrayBuffer());
    expect([...bayt.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM (Response.text() bunu siler)
    const metin = new TextDecoder().decode(bayt);
    expect(metin.startsWith("Google yer kimliği (place_id);Kaynak;Durum;İleti izni;Alıcı türü;İnceleme;İşletme adı")).toBe(true);
    const satir = metin.split("\r\n")[1];
    expect(satir).toContain(";Google tarama;Yeni;Bekliyor;Tacir / esnaf;İncelenmedi;A;");
    expect(metin).not.toMatch(/tacir_esnaf|;bekliyor;|;yeni;|incelenmedi/);
  });
});

describe("saf yardımcılar", () => {
  it("numara biçimi, limit katmanı ve şablon parçaları", () => {
    expect(telefonBicimle("905000000001")).toBe("+90 500 000 00 01");
    expect(telefonBicimle("abc")).toBe("abc");
    expect(limitKatmaniAdi("TIER_10K")).toBe("Günde 10.000 kişi");
    expect(limitKatmaniAdi("TIER_250")).toBe("Günde 250 kişi");
    expect(limitKatmaniAdi("TIER_UNLIMITED")).toBe("Sınırsız");
    expect(limitKatmaniAdi(null)).toBe("—");
    expect(
      sablonParcalari([
        { type: "HEADER", format: "TEXT", text: "Merhaba {{1}}" },
        { type: "BODY", text: "{{1}}, portföy hazır. Ayrıntı: {{2}}." },
        { type: "FOOTER", text: "Çıkmak için butona dokunun." },
      ]),
    ).toEqual([
      { tur: "baslik", parcalar: [{ metin: "Merhaba " }, { degisken: { bilesen: "header", ad: "1" } }] },
      {
        tur: "govde",
        parcalar: [
          { degisken: { bilesen: "body", ad: "1" } },
          { metin: ", portföy hazır. Ayrıntı: " },
          { degisken: { bilesen: "body", ad: "2" } },
          { metin: "." },
        ],
      },
      { tur: "altbilgi", parcalar: [{ metin: "Çıkmak için butona dokunun." }] },
    ]);
    expect(oku("src/app/(app)/ayarlar/whatsapp-api-ayarlari.tsx")).toContain("b.testNumaralari.map(telefonBicimle)");
  });
});

describe("WhatsApp günlük liste: Google adı", () => {
  it("'WhatsApp'ta aç' tek Enterprise çağrısıyla numarayı ve (kendi adı yoksa) adı döndürür; ek birim yok", async () => {
    const ctx = kiraci();
    iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege", whatsappSablonu: "Merhaba {isletme}" });
    const adsiz = kayitOlustur(ctx, { aliciTuru: "tacir_esnaf" }, "mock_cafe_41000_1");
    const adli = kayitOlustur(ctx, { aliciTuru: "tacir_esnaf", isletmeAdi: "Kendi Adım" }, "mock_cafe_41000_2");
    wa.listeHazirla(ctx, {}, new Date());
    const durum = wa.listeDurumu(ctx);
    expect(durum.siradaki).toMatchObject({ google: true });
    const ogeler = gunlukListe(ctx, durum.gun);
    const ac = async (leadId: string) => {
      const id = ogeler.find((o) => o.leadId === leadId)!.id;
      return (await acRotasi.POST(new Request(`${U}/api/whatsapp/ac/${id}`, { method: "POST" }), { params: Promise.resolve({ id }) })).json();
    };
    const a = await ac(adsiz.id);
    expect(a.url).toMatch(/^https:\/\/wa\.me\/90500000/);
    expect(a.googleAd).toEqual(expect.stringContaining("Kafe"));
    expect(aylikPlacesBirimi(ctx)).toBe(4); // tek Enterprise çağrısı; ad için ayrı Pro çağrısı yok
    const b = await ac(adli.id);
    expect(b.googleAd).toBeUndefined(); // kaydın kendi adı varken Google adı dönmez
    expect(JSON.stringify(db.$client.prepare("select * from leads where tenant_id = ?").all(ctx.tenantId))).not.toContain(a.googleAd);
    expect(oku("src/app/(app)/iletisim/whatsapp-listesi.tsx")).toContain("GoogleBilgisiHucresi");
  });
});

describe("giriş formu ve geliştirme simgesi", () => {
  it("form hidrasyondan önce gönderilemez ve şifre URL'e düşmez (method=post); simge sağ altta", () => {
    const form = oku("src/app/(auth)/giris/giris-formu.tsx");
    expect(form).toContain('<form method="post" onSubmit={gonder}');
    expect(form).toContain("disabled={bekliyor || !hazir}");
    expect(oku("next.config.ts")).toMatch(/devIndicators: \{ position: "bottom-right" \}/);
    expect(oku("src/app/(app)/tarama/tarama-paneli.tsx")).toContain("veri.toplam && haritaAnahtariVar");
    expect(oku("src/app/(app)/layout.tsx")).toContain("<BildirimAlani />");
  });
});

describe("tarayıcı turu düzeltmeleri (Grup D)", () => {
  it("aynı bildirim 1 saniye içinde tekrar gösterilmez; farklı metin ya da süre sonrası gösterilir", async () => {
    const { tekrarMi, TEKRAR_SURESI_MS } = await import("@/components/bildirim");
    expect(tekrarMi(null, "Kaydedildi.", 1000)).toBe(false);
    expect(tekrarMi({ metin: "Kaydedildi.", zaman: 1000 }, "Kaydedildi.", 1001)).toBe(true); // StrictMode çift efekt
    expect(tekrarMi({ metin: "Kaydedildi.", zaman: 1000 }, "Not eklendi.", 1001)).toBe(false);
    expect(tekrarMi({ metin: "Kaydedildi.", zaman: 1000 }, "Kaydedildi.", 1000 + TEKRAR_SURESI_MS)).toBe(false);
    // Sonuç mesajı bildirimi bileşen başına bir kez gönderir (geliştirmede efekt iki kez çalışsa da).
    expect(oku("src/components/bildirim.tsx")).toMatch(/if \(tur === "tamam" && !bildirildi\.current\) \{\s*bildirildi\.current = true;/);
  });

  it("inceleme ekranında 'İlgilenilmiyor' etiketi 'İlgilenilen'den ayırt edilir (gri, üstü çizili)", () => {
    expect(oku("src/app/(app)/tarama/inceleme/inceleme-ekrani.tsx")).toContain(
      'karar === "ilgilenmiyor" ? "bg-zemin text-soluk line-through" : "bg-ana-acik"',
    );
  });

  it("içe aktarma önizlemesi açılınca görünür alana kaydırılır", () => {
    const sihirbaz = oku("src/app/(app)/kayitlar/ice-aktar/sihirbaz.tsx");
    expect(sihirbaz).toMatch(/if \(rapor\) onizlemeRef\.current\?\.scrollIntoView/);
    expect(sihirbaz).toContain("<section ref={onizlemeRef}");
  });

  it("ret onay penceresi portalda, kendi formu yok; düğmeler dıştaki formu göndermez", () => {
    const ret = oku("src/components/ret-onayi.tsx");
    expect(ret).toContain("createPortal(");
    expect(ret).toContain("document.body");
    expect(ret).not.toMatch(/<form/);
    // Her düğme type="button": WhatsApp izni formunun içinde "Ret ver" dıştaki formu göndermemeli.
    const dugmeler = ret.match(/<button\b[^>]*>/g) ?? [];
    expect(dugmeler).toHaveLength(3);
    for (const d of dugmeler) expect(d).toContain('type="button"');
  });

  it("WhatsApp izni kaydedilince bildirim gösterilir (ret için ayrı metin)", () => {
    const panel = oku("src/app/(app)/kayitlar/detay-paneli.tsx");
    expect(panel).toContain('bildir(govde.izin === "ret" ? "İleti reddi kaydedildi." : "WhatsApp izni kaydedildi.")');
  });

  it("gönderim servisi hiç çalışmadıysa yönetici uyarısı '5 dakikadan uzun süredir' demez", () => {
    const simdi = new Date("2026-10-12T09:10:00Z");
    const hic = isciDurumu(null, simdi);
    expect(hic.yoneticiUyarisi).toMatch(/^Gönderim servisi çalışmıyor; mesajlar gönderilmeyecek\./);
    expect(hic.yoneticiUyarisi).not.toContain("dakika");
    expect(isciDurumu(new Date("2026-10-12T09:04:00Z"), simdi).yoneticiUyarisi).toMatch(/^Gönderim servisi 5 dakikadan uzun süredir çalışmıyor/);
    expect(isciDurumu(new Date("2026-10-12T09:09:00Z"), simdi).yoneticiUyarisi).toBeNull();
    expect(oku("src/app/(app)/iletisim/kampanya/[id]/kampanya-detayi.tsx")).toContain("{d.yoneticiUyarisi}");
  });

  it("gönderim penceresi gün sonuna (24:00) kadarsa bitiş girdisi boş kalmaz ve form kaydedilebilir", async () => {
    const { pencereSaati, pencereDakikasi } = (await import("@/lib/mesajlasma")) as Record<string, unknown> as {
      pencereSaati: (dk: number, alan: "baslangic" | "bitis") => string;
      pencereDakikasi: (s: string, alan: "baslangic" | "bitis") => number;
    };
    // Demo penceresi 0–1440: saat girdisi "24:00"ü kabul etmez (boş kalır, zorunlu alan formu durdurur).
    expect(pencereSaati(24 * 60, "bitis")).toBe("00:00");
    expect(pencereDakikasi("00:00", "bitis")).toBe(24 * 60);
    expect(pencereSaati(0, "baslangic")).toBe("00:00");
    expect(pencereDakikasi("00:00", "baslangic")).toBe(0);
    expect(pencereSaati(20 * 60, "bitis")).toBe("20:00");
    expect(pencereDakikasi("09:30", "baslangic")).toBe(570);
    const form = oku("src/app/(app)/ayarlar/mesajlasma-ayarlari.tsx");
    expect(form).toContain('defaultValue={pencereSaati(a.gonderimBitisDk, "bitis")}');
    expect(form).toContain('pencereDakikasi(String(f.get("bitis")), "bitis")');
  });
});
