// Yeni düzen (docs/plan-yeni-duzen.md) — Grup 1: sayfa iskeleti, ana menü, kullanım göstergesi ve ortak parçalar.
// Grup 2: Ayarlar alt rotaları, role göre ayar menüsü, WhatsApp kurulum adımları, ayrı formlardan alan güncelleme.
// Grup 4: Kayıtlar sekmeleri (İlgilendiklerim / İncelenmemiş / Tümü), süzgeç adresi, CSV ve otomatik Google bilgisi.
// Grup 5: Bölge tara sonuçları (tarama_sonuclari, süzgeç, sıra, migration 0016), ekran ve eski adresin yönlendirilmesi.
// Grup 6: Kampanyalar (/iletisim → /kampanyalar), sekmeler ve 4 adımlı kampanya sihirbazının adım kuralları.
// Grup 7: Panel (sıradaki işler, bu ay gönderilen mesaj) ve kampanya ayrıntısının sekmeleri.
// Menüde kullanım yalnızca yüzde olarak görünür; GET /api/kullanim birim, kota ya da kalan miktar döndürmez.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SihirbazTaslagi } from "@/lib/kampanya-sihirbazi";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx, sayfaBaglami: async () => ({ ctx: oturum.ctx }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db, veritabaniAc } = await import("@/server/db");
const { migrasyonlariUygula } = await import("@/server/db/migrasyon");
const { kotaAyir } = await import("@/server/repo/kullanim");
const { basHarfler, kullanimOzeti, sekmeKlavye } = await import("@/lib/arayuz");
const kullanimRotasi = await import("@/app/api/kullanim/route");
const { calismaAlaniGetir } = await import("@/server/repo/calisma-alani");
const { alanGuncelle } = await import("@/app/(app)/ayarlar/eylemler");
const { AYAR_GRUPLARI, ayarBolumuAcikMi, ayarGruplari, ILK_AYAR_BOLUMU } = await import("@/lib/ayar-bolumleri");
const { kotaDonemiMetni, mesafeMetni } = await import("@/lib/arayuz");
const { kurulumAdimlari } = await import("@/lib/whatsapp-api");
const kayitlar = await import("@/server/repo/kayitlar");
const { taramaOlustur } = await import("@/server/repo/taramalar");
const { etkinSuzgecSayisi, kayitFiltresiCoz, kayitSorgusu } = await import("@/lib/kayit-filtresi");
const disaAktarRotasi = await import("@/app/api/kayitlar/disa-aktar/route");
const { adimCoz, adimEngeli, enIleriAdim } = await import("@/lib/kampanya-sihirbazi");
const kampanyalar = await import("@/server/repo/kampanyalar");
const { siradakiIsler } = await import("@/lib/panel");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const KOK = path.resolve(__dirname, "..");
const oku = (d: string) => fs.readFileSync(path.join(KOK, d), "utf8");

describe("kullanım göstergesi", () => {
  it("yalnızca yüzde ve seviye; %80'de uyarı, kota dolmadan %100 görünmez", () => {
    expect(kullanimOzeti({ oran: 0, uyari: false, doldu: false })).toEqual({ yuzde: 0, seviye: "normal" });
    expect(kullanimOzeti({ oran: 0.799, uyari: false, doldu: false })).toEqual({ yuzde: 79, seviye: "normal" });
    expect(kullanimOzeti({ oran: 0.8, uyari: true, doldu: false })).toEqual({ yuzde: 80, seviye: "uyari" });
    expect(kullanimOzeti({ oran: 0.9999, uyari: true, doldu: false })).toEqual({ yuzde: 99, seviye: "uyari" });
    expect(kullanimOzeti({ oran: 1, uyari: true, doldu: true })).toEqual({ yuzde: 100, seviye: "doldu" });
  });

  it("GET /api/kullanim: oturumsuz 401; yalnızca yüzde ve seviye döner, kullanım arttıkça değişir", async () => {
    oturum.ctx = null;
    expect((await kullanimRotasi.GET()).status).toBe(401);

    const { ctx } = kiraciOlustur(`K${Math.random().toString(36).slice(2, 7)}`);
    db.$client.prepare("update tenants set aylik_places_kotasi = 6000 where id = ?").run(ctx.tenantId);
    oturum.ctx = ctx;
    const ilk = await (await kullanimRotasi.GET()).json();
    expect(ilk).toEqual({ yuzde: 0, seviye: "normal" });

    expect(kotaAyir(ctx, 4800)).toBe(true);
    expect(await (await kullanimRotasi.GET()).json()).toEqual({ yuzde: 80, seviye: "uyari" });
    expect(kotaAyir(ctx, 1200)).toBe(true);
    const son = await (await kullanimRotasi.GET()).json();
    expect(son).toEqual({ yuzde: 100, seviye: "doldu" });
    expect(Object.keys(son).sort()).toEqual(["seviye", "yuzde"]); // birim / kota / kalan yok
  });
});

describe("ortak parçaların yardımcıları", () => {
  it("sekmelerde ok tuşları sarar, Home / End uçlara gider, diğer tuşlar yok sayılır", () => {
    expect(sekmeKlavye(0, "ArrowRight", 3)).toBe(1);
    expect(sekmeKlavye(2, "ArrowRight", 3)).toBe(0);
    expect(sekmeKlavye(0, "ArrowLeft", 3)).toBe(2);
    expect(sekmeKlavye(1, "Home", 3)).toBe(0);
    expect(sekmeKlavye(0, "End", 3)).toBe(2);
    expect(sekmeKlavye(1, "Enter", 3)).toBeNull();
    expect(sekmeKlavye(0, "ArrowRight", 0)).toBeNull();
  });

  it("kullanıcı kartında baş harfler (Türkçe büyük harf)", () => {
    expect(basHarfler("Demo Yönetici")).toBe("DY");
    expect(basHarfler("ilknur ışık")).toBe("İI");
    expect(basHarfler("çağrı")).toBe("ÇA");
    expect(basHarfler("Ayşe Nur Yılmaz")).toBe("AY");
    expect(basHarfler("   ")).toBe("?");
  });
});

describe("sayfa iskeleti ve menü", () => {
  it("menü adları ve simgeleri, altta kullanım göstergesi ve kullanıcı kartı", () => {
    const menu = oku("src/components/menu.tsx");
    for (const ad of ['"Panel"', '"Bölge tara"', '"Kayıtlar"', '"Kampanyalar"', '"Ayarlar"']) expect(menu).toContain(`ad: ${ad}`);
    expect(menu).not.toContain('"İletişim"');
    expect(menu).toContain("md:w-58"); // 232 px
    expect(menu).toContain("<KullanimGostergesi ilk={props.kullanim} />");
    expect(menu).toContain("basHarfler(props.kullaniciAdi)");
    const duzen = oku("src/app/(app)/layout.tsx");
    expect(duzen).toContain("kullanim={kullanimOzeti(kotaDurumu(b.ctx))}");
    expect(duzen).toMatch(/md:px-12 md:pt-10 md:pb-18/);
  });

  it("kullanım göstergesi birim göstermez; Places kullanan işlemlerden sonra yenilenir", () => {
    const gosterge = oku("src/components/kullanim-gostergesi.tsx");
    const kod = gosterge
      .split("\n")
      .filter((s) => !/^\s*(\/\/|\*|\/\*)/.test(s)) // yorumlar hariç
      .join("\n");
    expect(kod).not.toMatch(/birim/i);
    expect(gosterge).toContain('fetch("/api/kullanim"');
    for (const d of [
      "src/components/google-bilgisi.tsx",
      "src/app/(app)/kayitlar/detay-paneli.tsx",
      "src/app/(app)/tarama/tarama-paneli.tsx",
      "src/app/(app)/kampanyalar/whatsapp-listesi.tsx",
    ]) {
      expect(oku(d), d).toContain("kullanimDegisti();");
    }
  });

  it("her sayfa başlığında bir cümlelik açıklama zorunlu; ölçüler taslaktaki gibi", () => {
    expect(oku("src/components/sayfa-basligi.tsx")).toMatch(/aciklama: string;/);
    const css = oku("src/app/globals.css");
    expect(css).toContain("--radius-kart: 14px;");
    expect(css).toContain("--color-metin: #17201c;");
    expect(css).toMatch(/@utility dugme \{\s*@apply inline-flex min-h-11/);
    expect(css).toMatch(/@utility girdi \{\s*@apply min-h-11/);
  });
});

describe("Ayarlar: bölümler ve erişim (Grup 2)", () => {
  const yollar = (rol: "yonetici" | "uye") => ayarGruplari(rol).flatMap((g) => g.bolumler.map((b) => b.yol));

  it("yönetici bütün bölümleri, üye yalnızca kendini ilgilendirenleri görür", () => {
    expect(yollar("yonetici")).toEqual([
      "calisma-alani", "ekip", "kullanim", "gonderen", "saatler", "whatsapp-listesi", "whatsapp", "sms", "eposta", "veri",
    ]);
    expect(yollar("uye")).toEqual(["calisma-alani", "ekip", "kullanim", "saatler", "whatsapp-listesi"]);
    expect(ayarGruplari("uye").map((g) => g.ad)).toEqual(["Genel", "Gönderim"]); // Kanallar ve Veri grupları gizli
    for (const yol of ["gonderen", "whatsapp", "sms", "eposta", "veri"]) {
      expect(ayarBolumuAcikMi(yol, "uye"), yol).toBe(false);
      expect(ayarBolumuAcikMi(yol, "yonetici"), yol).toBe(true);
    }
    expect(ayarBolumuAcikMi("olmayan", "yonetici")).toBe(false);
  });

  it("her bölümün kendi sayfası var ve rol erişimini kendi yoluyla denetler; /ayarlar ilk bölüme yönlendirir", () => {
    for (const b of AYAR_GRUPLARI.flatMap((g) => g.bolumler)) {
      const sayfa = oku(`src/app/(app)/ayarlar/${b.yol}/page.tsx`);
      expect(sayfa, b.yol).toContain(`ayarBolumuBaglami("${b.yol}")`);
    }
    expect(ILK_AYAR_BOLUMU).toBe("/ayarlar/calisma-alani");
    expect(oku("src/app/(app)/ayarlar/page.tsx")).toContain("redirect(ILK_AYAR_BOLUMU)");
    expect(oku("src/app/(app)/ayarlar/erisim.ts")).toContain("if (!ayarBolumuAcikMi(yol, b.ctx.rol)) redirect(ILK_AYAR_BOLUMU);");
    expect(oku("src/app/(app)/kampanyalar/whatsapp-listesi.tsx")).toContain('href="/ayarlar/whatsapp-listesi"');
  });

  it("çalışma alanı adı ve veri saklama süresi ayrı formlardan güncellenir; formda olmayan alan değişmez", async () => {
    const { ctx } = kiraciOlustur(`A${Math.random().toString(36).slice(2, 7)}`);
    oturum.ctx = ctx;
    const form = (d: Record<string, string>) => {
      const f = new FormData();
      for (const [a, v] of Object.entries(d)) f.set(a, v);
      return f;
    };
    expect(await alanGuncelle({}, form({ veriSaklamaGun: "365" }))).toEqual({ tamam: "Kaydedildi." });
    expect(await alanGuncelle({}, form({ ad: "Yeni Ad" }))).toEqual({ tamam: "Kaydedildi." });
    expect(calismaAlaniGetir(ctx)).toMatchObject({ ad: "Yeni Ad", veriSaklamaGun: 365 });
    expect(await alanGuncelle({}, form({ veriSaklamaGun: "" }))).toEqual({ tamam: "Kaydedildi." });
    expect(calismaAlaniGetir(ctx)).toMatchObject({ ad: "Yeni Ad", veriSaklamaGun: null });
    expect((await alanGuncelle({}, form({}))).hata).toBe("Değiştirilecek bir alan yok.");
    expect((await alanGuncelle({}, form({ veriSaklamaGun: "10" }))).hata).toMatch(/30–3650/);
  });

  it("kullanım dönemi metni Türkçe ek uyumuyla", () => {
    expect(kotaDonemiMetni("2026-11")).toBe("Kasım ayı · 1 Aralık'ta sıfırlanır");
    expect(kotaDonemiMetni("2026-12")).toBe("Aralık ayı · 1 Ocak'ta sıfırlanır");
    expect(kotaDonemiMetni("2026-03")).toBe("Mart ayı · 1 Nisan'da sıfırlanır");
    expect(kotaDonemiMetni("2026-06")).toBe("Haziran ayı · 1 Temmuz'da sıfırlanır");
    expect(kotaDonemiMetni("2026-08")).toBe("Ağustos ayı · 1 Eylül'de sıfırlanır");
    expect(kotaDonemiMetni("2026-09")).toBe("Eylül ayı · 1 Ekim'de sıfırlanır");
    expect(kotaDonemiMetni("2026-10")).toBe("Ekim ayı · 1 Kasım'da sıfırlanır");
  });
});

describe("WhatsApp (Meta) kurulum adımları", () => {
  const temel = { tanimli: true, numaraDogrulandi: false, webhookDogrulandi: false, imzaliDurumAlindi: false, testModu: true, testModuKapatilabilir: false };

  it("adımlar mevcut bağlantı ve test modu kilidinden türetilir", () => {
    expect(kurulumAdimlari({ ...temel, tanimli: false })).toEqual(["etkin", "bekliyor", "bekliyor", "kilitli"]);
    expect(kurulumAdimlari(temel)).toEqual(["etkin", "bekliyor", "bekliyor", "kilitli"]);
    expect(kurulumAdimlari({ ...temel, numaraDogrulandi: true })).toEqual(["tamam", "etkin", "bekliyor", "kilitli"]);
    expect(kurulumAdimlari({ ...temel, numaraDogrulandi: true, webhookDogrulandi: true })).toEqual(["tamam", "tamam", "etkin", "kilitli"]);
    const hazir = { ...temel, numaraDogrulandi: true, webhookDogrulandi: true, imzaliDurumAlindi: true, testModuKapatilabilir: true };
    expect(kurulumAdimlari(hazir)).toEqual(["tamam", "tamam", "tamam", "etkin"]);
    expect(kurulumAdimlari({ ...hazir, testModu: false })).toEqual(["tamam", "tamam", "tamam", "tamam"]);
  });

  it("4. adım yalnızca sunucunun kilit kararına göre açılır", () => {
    // İmzalı bildirim var ama sunucu kapatılabilir demiyorsa (ör. webhook doğrulaması sıfırlandı) kilitli kalır.
    const a = kurulumAdimlari({ ...temel, numaraDogrulandi: true, imzaliDurumAlindi: true, testModuKapatilabilir: false });
    expect(a[3]).toBe("kilitli");
    const ekran = oku("src/app/(app)/ayarlar/whatsapp-api-ayarlari.tsx");
    expect(ekran).toContain("kurulumAdimlari(b)");
    expect(ekran).toContain('{ testModu: false }, "Test modu kapatıldı."');
    expect(ekran).not.toMatch(/type="checkbox"[^>]*testModu/); // eski pasif onay kutusu kalktı
  });
});

describe("Kayıtlar: sekmeler ve süzgeç (Grup 4)", () => {
  /** Taramadan 4 Google kaydı (incelenmedi) + elle eklenen 2 kişi (ilgileniyor). */
  function kurulum() {
    const { ctx } = kiraciOlustur(`K4${Math.random().toString(36).slice(2, 7)}`);
    oturum.ctx = ctx;
    const t = taramaOlustur(ctx, { merkezLat: 41, merkezLng: 29, yaricapM: 1000, kategori: "emlak_ofisi" });
    kayitlar.kayitlariEkle(ctx, t.id, ["mock_cafe_40100_1", "mock_cafe_40100_2", "mock_cafe_40100_3", "mock_cafe_40100_4"]);
    const [ilgili, gecilen, bekleyen, bekleyen2] = kayitlar.taramaKayitlari(ctx, t.id);
    kayitlar.incelemeAyarla(ctx, [ilgili.id], "ilgileniyor");
    kayitlar.incelemeAyarla(ctx, [gecilen.id], "ilgilenmiyor");
    const [elle, elleIlgisiz] = kayitlar.kisileriEkle(
      ctx,
      [
        { kaynak: "elle", isletmeAdi: "Elle", ekTelefon: "0532 000 00 41" },
        { kaynak: "elle", isletmeAdi: "Elle 2", ekTelefon: "0532 000 00 42" },
      ],
      "t",
    );
    kayitlar.kayitGuncelle(ctx, elleIlgisiz.id, { durum: "ilgilenmiyor" });
    return { ctx, ilgili, gecilen, bekleyen, bekleyen2, elle, elleIlgisiz };
  }
  const idler = (ctx: TenantContext, f: Parameters<typeof kayitlar.kayitlariListele>[1]) =>
    kayitlar
      .kayitlariListele(ctx, f)
      .kayitlar.map((x) => x.id)
      .sort();

  it("İlgilendiklerim: inceleme 'ilgileniyor' ve durum İlgilenmiyor değil; İncelenmemiş; Tümü; sayılar", () => {
    const { ctx, ilgili, gecilen, bekleyen, bekleyen2, elle, elleIlgisiz } = kurulum();
    expect(idler(ctx, { grup: "ilgi" })).toEqual([ilgili.id, elle.id].sort());
    expect(idler(ctx, { grup: "incelenmemis" })).toEqual([bekleyen.id, bekleyen2.id].sort());
    expect(idler(ctx, { grup: "tum" })).toEqual([ilgili.id, gecilen.id, bekleyen.id, bekleyen2.id, elle.id, elleIlgisiz.id].sort());
    expect(kayitlar.grupSayilari(ctx)).toEqual({ ilgi: 2, incelenmemis: 2, tum: 6 });
    // Diğer süzgeçler sayılara da uygulanır.
    expect(kayitlar.grupSayilari(ctx, { kaynak: "elle" })).toEqual({ ilgi: 1, incelenmemis: 0, tum: 2 });
  });

  it("süzgeç adresi: Kayıtlar'da varsayılan sekme İlgilendiklerim; eski 'inceleme' bağlantısı sekme koymaz; gidiş-dönüş", () => {
    const al = (s: string) => (ad: string) => new URLSearchParams(s).get(ad) ?? undefined;
    expect(kayitFiltresiCoz(al(""), "ilgi")).toMatchObject({ grup: "ilgi", inceleme: undefined, sayfa: 1 });
    expect(kayitFiltresiCoz(al(""))).toMatchObject({ grup: undefined, inceleme: undefined });
    expect(kayitFiltresiCoz(al("inceleme=hepsi"), "ilgi")).toMatchObject({ grup: undefined, inceleme: "hepsi" });
    const f = kayitFiltresiCoz(al("grup=incelenmemis&durum=yeni&izin=ret&ad=bos&q=+fırın+&sayfa=3"), "ilgi");
    expect(f).toMatchObject({ grup: "incelenmemis", durum: "yeni", iletiIzni: "ret", adsizGoogle: true, arama: "fırın", sayfa: 3 });
    expect(kayitSorgusu(f).toString()).toBe("grup=incelenmemis&durum=yeni&izin=ret&q=f%C4%B1r%C4%B1n&ad=bos");
    expect(kayitSorgusu(f, { grup: "tum" }).get("grup")).toBe("tum");
    expect(etkinSuzgecSayisi(f)).toBe(3); // durum, izin, ad (sekme ve arama sayılmaz)
    expect(kayitFiltresiCoz(al("grup=olmayan&durum=uydurma"), "ilgi")).toMatchObject({ grup: "ilgi", durum: undefined });
  });

  it("CSV: sekmesiz çağrı eski davranış (ilgilenilmeyenler hariç, incelenmemişler dahil); sekmeyle o sekme", async () => {
    kurulum();
    const satirSayisi = async (sorgu: string) => {
      const y = await disaAktarRotasi.GET(new Request(`https://crm.ornek.test/api/kayitlar/disa-aktar${sorgu}`));
      return (await y.text()).trim().split("\n").length - 1;
    };
    expect(await satirSayisi("")).toBe(5); // 6 kayıttan yalnızca inceleme "ilgilenmiyor" olan hariç
    expect(await satirSayisi("?grup=ilgi")).toBe(2);
    expect(await satirSayisi("?grup=incelenmemis")).toBe(2);
    expect(await satirSayisi("?grup=tum&kaynak=elle")).toBe(2);
  });

  it("Kayıtlar ekranı adı girilmemiş Google kayıtlarını otomatik ister (yalnızca kullanım eşiğin altındayken, bir kez)", () => {
    const sayfa = oku("src/app/(app)/kayitlar/page.tsx");
    expect(sayfa).toContain("otomatik={!kota.uyari && !kota.doldu}");
    expect(sayfa).toContain('kayitFiltresiCoz((ad) => tek(p[ad]), "ilgi")');
    const ekran = oku("src/app/(app)/kayitlar/kayitlar-ekrani.tsx");
    expect(ekran).toContain('otomatikIdler: props.otomatik ? props.satirlar.filter((s) => s.kaynak === "google" && !s.isletmeAdi)');
    expect(ekran).toContain('{google.otomatikKapali && <BilgiNotu ton="uyari">{OTOMATIK_GOSTERIM_SINIRI_METNI}</BilgiNotu>}');
    const kanca = oku("src/components/google-bilgisi.tsx");
    expect(kanca).toMatch(/if \(otomatikIstendi\.current \|\| !ilkOtomatik\.length\) return;\s*otomatikIstendi\.current = true;/);
    expect(kanca).toContain("govde: { idler: ilkOtomatik.slice(0, 20), otomatik: true }");
    const tablo = oku("src/app/(app)/kayitlar/kayit-tablosu.tsx");
    expect(tablo).toContain("<GoogleEtiketi />");
    for (const b of ["İşletme", "Durum", "İzin", "Son işlem", "Etiket"]) expect(tablo).toContain(`font-semibold">${b}</th>`);
  });

  it("ayrıntı paneli: Ara / E-posta / WhatsApp ve Genel / İletişim izni / Geçmiş sekmeleri; ad alanı boş gelir", () => {
    const panel = oku("src/app/(app)/kayitlar/detay-paneli.tsx");
    for (const s of ['{ deger: "genel", ad: "Genel" }', '{ deger: "izin", ad: "İletişim izni" }', '{ deger: "gecmis", ad: "Geçmiş" }']) {
      expect(panel).toContain(s);
    }
    expect(panel).toContain("<WhatsappButonu");
    expect(panel).toMatch(/>\s*Ara\s*</);
    expect(panel).toMatch(/>\s*E-posta\s*</);
    expect(panel).toContain('aria-label="Ayrıntıları kapat"');
    // Listedeki Google adı yalnızca başlıkta; ad girme alanı kullanıcının kaydıyla gelir.
    expect(panel.match(/listeGoogle\?\.ad\b/g)).toHaveLength(1);
    expect(panel).toMatch(/name="isletmeAdi"\s+defaultValue=\{kayit\.isletmeAdi \?\? ""\}/);
    // Durum seçimi tek dokunuşla (çipler).
    expect(panel).toContain("<SecimCipi");
  });

  it("sekmesiz eski bağlantılar Tümü sekmesine gider (ör. Panel'deki 'İlgilenmiyor' durumu)", () => {
    expect(oku("src/app/(app)/panel/page.tsx")).toContain("href={`/kayitlar?grup=tum&durum=${d}`}");
    expect(oku("src/app/(app)/kampanyalar/yeni/kampanya-sihirbazi.tsx")).toContain('href="/kayitlar?grup=tum&ad=bos"');
    expect(oku("src/app/(app)/kayitlar/ice-aktar/sihirbaz.tsx")).toContain('href="/kayitlar?grup=tum&kaynak=ice_aktarma"');
  });
});

describe("Bölge tara: sonuçlar (Grup 5)", () => {
  function tarama(ctx: TenantContext, idler: string[]) {
    const t = taramaOlustur(ctx, { merkezLat: 41, merkezLng: 29, yaricapM: 1000, kategori: "kafe" });
    kayitlar.kayitlariEkle(ctx, t.id, idler);
    return t;
  }

  it("bir tarama, daha önce başka taramayla eklenmiş işletmeyi de kendi sonuçlarında gösterir (yalnızca kimlik eşleşmesi)", () => {
    const { ctx } = kiraciOlustur(`T5${Math.random().toString(36).slice(2, 7)}`);
    const t1 = tarama(ctx, ["mock_cafe_40200_1", "mock_cafe_40200_2"]);
    const t2 = tarama(ctx, ["mock_cafe_40200_2", "mock_cafe_40200_3"]);
    const id = (pid: string) => kayitlar.kayitlariListele(ctx, { grup: "tum" }).kayitlar.find((k) => k.placeId === pid)!.id;
    const ikinci = kayitlar.taramaSonuclariListele(ctx, t2.id);
    expect(ikinci.kayitlar.map((k) => k.id).sort()).toEqual([id("mock_cafe_40200_2"), id("mock_cafe_40200_3")].sort());
    expect(ikinci.sayilar).toEqual({ bulunan: 2, incelenmedi: 2, ilgilenilen: 0, gecilen: 0 });
    expect(kayitlar.taramaSonuclariListele(ctx, t1.id).toplam).toBe(2);
    // Kaydı ilk bulan tarama değişmez.
    expect(kayitlar.kayitGetir(ctx, id("mock_cafe_40200_2"))!.scanId).toBe(t1.id);
    // Aynı tarama aynı kaydı iki kez eklemez.
    kayitlar.kayitlariEkle(ctx, t2.id, ["mock_cafe_40200_3"]);
    expect(kayitlar.taramaSonuclariListele(ctx, t2.id).toplam).toBe(2);
  });

  it("İlgilenilen / Geçilen süzgeci, sayılar ve sabit sıra (karar verilince kayıt sayfadan kaymaz)", () => {
    const { ctx } = kiraciOlustur(`T5${Math.random().toString(36).slice(2, 7)}`);
    const pidler = Array.from({ length: 23 }, (_, i) => `mock_cafe_40300_${i + 1}`);
    const t = tarama(ctx, pidler);
    const ilk = kayitlar.taramaSonuclariListele(ctx, t.id);
    expect(ilk).toMatchObject({ toplam: 23, sayfaSayisi: 2 });
    expect(ilk.kayitlar).toHaveLength(20);
    kayitlar.incelemeAyarla(ctx, [ilk.kayitlar[0].id], "ilgileniyor");
    kayitlar.incelemeAyarla(ctx, [ilk.kayitlar[1].id, ilk.kayitlar[2].id], "ilgilenmiyor");
    const sonra = kayitlar.taramaSonuclariListele(ctx, t.id);
    expect(sonra.kayitlar.map((k) => k.id)).toEqual(ilk.kayitlar.map((k) => k.id));
    expect(sonra.sayilar).toEqual({ bulunan: 23, incelenmedi: 20, ilgilenilen: 1, gecilen: 2 });
    expect(kayitlar.taramaSonuclariListele(ctx, t.id, { karar: "ilgi" }).kayitlar.map((k) => k.id)).toEqual([ilk.kayitlar[0].id]);
    expect(kayitlar.taramaSonuclariListele(ctx, t.id, { karar: "gec" }).toplam).toBe(2);
    expect(kayitlar.taramaSonuclariListele(ctx, t.id, { sayfa: 2 }).kayitlar).toHaveLength(3);
  });

  it("migration 0016: mevcut taramaların ilk bulma eşleşmesi tarama_sonuclari'na taşınır", () => {
    const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-0016-"));
    let v: ReturnType<typeof veritabaniAc> | null = null;
    try {
      const gercek = path.join(KOK, "drizzle");
      const gunluk = JSON.parse(fs.readFileSync(path.join(gercek, "meta/_journal.json"), "utf8"));
      const once = path.join(gecici, "once");
      fs.mkdirSync(path.join(once, "meta"), { recursive: true });
      const onceki = gunluk.entries.filter((e: { tag: string }) => e.tag < "0016_");
      for (const e of onceki) fs.copyFileSync(path.join(gercek, `${e.tag}.sql`), path.join(once, `${e.tag}.sql`));
      fs.writeFileSync(path.join(once, "meta/_journal.json"), JSON.stringify({ ...gunluk, entries: onceki }));
      v = veritabaniAc(path.join(gecici, "v.db"));
      migrasyonlariUygula(v, once);
      v.$client.prepare("insert into tenants (id, ad, slug) values ('t1', 'T', 't')").run();
      v.$client.prepare("insert into scans (id, tenant_id, yaricap_m, kategori) values ('s1', 't1', 1000, 'kafe')").run();
      v.$client.prepare("insert into leads (id, tenant_id, kaynak, place_id, scan_id) values ('l1', 't1', 'google', 'mock_x_1_1', 's1')").run();
      v.$client.prepare("insert into leads (id, tenant_id, kaynak) values ('l2', 't1', 'elle')").run();
      migrasyonlariUygula(v, gercek);
      expect(v.$client.prepare("select tenant_id, scan_id, lead_id from tarama_sonuclari").all()).toEqual([
        { tenant_id: "t1", scan_id: "s1", lead_id: "l1" },
      ]);
    } finally {
      v?.$client.close();
      fs.rmSync(gecici, { recursive: true, force: true });
    }
  });

  it("ekran: form + harita, kategori çipleri, süre bilgisi; kartlarda İlgilen / Geç / Geri al; otomatik ad; eski adres yönlenir", () => {
    const panel = oku("src/app/(app)/tarama/tarama-paneli.tsx");
    expect(panel).toContain("<SecimCipi");
    expect(panel).toContain("Tarama birkaç dakika sürebilir");
    expect(panel).not.toMatch(/Tahmini sonuç/);
    expect(panel).toContain("Önceki taramalar");
    expect(panel).toContain("router.push(`/tarama?tarama=${t.id}`, { scroll: false })");
    const izgara = oku("src/app/(app)/tarama/sonuc-izgarasi.tsx");
    for (const m of [">\n                      İlgilen", ">\n                      Geç", "Geri al", "Bu sayfadakileri geç", "Sonraki sayfa"]) expect(izgara).toContain(m);
    expect(izgara).toContain("otomatikIdler: props.otomatik ? props.satirlar.filter((s) => !s.isletmeAdi)");
    expect(izgara).toContain("mesafeMetni(props.merkez, yer.konum)");
    // İlgilen ad girme alanı açmaz (Google adı ad alanının yanında görünmez).
    expect(izgara).not.toMatch(/name="isletmeAdi"|AD_GIRME_IPUCU/);
    const sayfa = oku("src/app/(app)/tarama/page.tsx");
    expect(sayfa).not.toMatch(/canliBilgiGetir|servisler\/canli-bilgi/);
    expect(sayfa).toContain("otomatik={!kota.uyari && !kota.doldu}");
    expect(oku("src/app/(app)/tarama/inceleme/page.tsx")).toContain(
      'redirect(tarama ? `/tarama?tarama=${encodeURIComponent(tarama)}` : "/kayitlar?grup=incelenmemis")',
    );
    expect(fs.existsSync(path.join(KOK, "src/app/(app)/tarama/inceleme/inceleme-ekrani.tsx"))).toBe(false);
  });

  it("mesafe metni Türkçe biçimde", () => {
    expect(mesafeMetni({ lat: 41, lng: 29 }, { lat: 41, lng: 29 })).toBe("0,0 km");
    expect(mesafeMetni({ lat: 41, lng: 29 }, { lat: 41.0036, lng: 29 })).toBe("0,4 km");
    expect(mesafeMetni({ lat: 41, lng: 29 }, { lat: 41.1, lng: 29 })).toBe("11 km");
  });
});

describe("Kampanyalar ve sihirbaz (Grup 6)", () => {
  const bos: SihirbazTaslagi = { kanal: null, ad: "", konu: "", sablon: "", sablonId: "", sabitDegerler: [], aliciSayisi: null, ozetVar: false };

  it("adım kuralları: kanal yokken, adsız ya da 0 alıcıyla, eksik mesajla ilerlenmez; 4. adım özet ister", () => {
    expect(adimEngeli(1, bos)).toBe("Bir kanal seçin.");
    const e = { ...bos, kanal: "eposta" as const };
    expect(adimEngeli(1, e)).toBeNull();
    expect(adimEngeli(2, e)).toBe("Kampanya adı gerekli.");
    expect(adimEngeli(2, { ...e, ad: "Kasım", aliciSayisi: 0 })).toMatch(/alıcı yok/);
    expect(adimEngeli(2, { ...e, ad: "Kasım", aliciSayisi: null })).toBeNull(); // WhatsApp / sayım gelmeden
    expect(adimEngeli(3, { ...e, ad: "K", sablon: "Merhaba" })).toBe("E-posta konusu gerekli.");
    expect(adimEngeli(3, { ...e, ad: "K", konu: "Konu", sablon: "  " })).toBe("Mesaj metni gerekli.");
    const sms = { ...bos, kanal: "sms" as const, ad: "K" };
    expect(adimEngeli(3, { ...sms, sablon: "x".repeat(901) })).toMatch(/900/);
    expect(adimEngeli(3, { ...sms, sablon: "x".repeat(900) })).toBeNull();
    const wa = { ...bos, kanal: "whatsapp_api" as const, ad: "K" };
    expect(adimEngeli(3, wa)).toBe("WhatsApp şablonu seçin.");
    expect(adimEngeli(3, { ...wa, sablonId: "s1", sabitDegerler: [" "] })).toMatch(/Sabit/);
    expect(adimEngeli(3, { ...wa, sablonId: "s1", sabitDegerler: ["Kasım"] })).toBeNull();

    const hazir = { ...e, ad: "K", konu: "Konu", sablon: "Merhaba", aliciSayisi: 5 };
    expect(enIleriAdim(bos)).toBe(1);
    expect(enIleriAdim({ ...e })).toBe(2);
    expect(enIleriAdim(hazir)).toBe(3);
    expect(enIleriAdim({ ...hazir, ozetVar: true })).toBe(4);
    // Adresten ileri atlanamaz; geçersiz değer 1.
    expect(adimCoz("4", { ...e })).toBe(2);
    expect(adimCoz("3", { ...hazir, ozetVar: true })).toBe(3);
    expect(adimCoz("9", hazir)).toBe(1);
    expect(adimCoz(null, hazir)).toBe(1);
  });

  it("eski /iletisim adresleri /kampanyalar'a geçici yönlenir; oturum yönlendirmesi yeni adresi de kapsar", async () => {
    const yapilandirma = (await import("../next.config")).default;
    expect(await yapilandirma.redirects!()).toEqual([
      { source: "/iletisim", destination: "/kampanyalar", permanent: false },
      { source: "/iletisim/kampanya/:id", destination: "/kampanyalar/:id", permanent: false },
    ]);
    expect(oku("src/proxy.ts")).toContain('"/kampanyalar/:path*"');
    expect(oku("src/components/menu.tsx")).toContain('{ href: "/kampanyalar", ad: "Kampanyalar", simge: "kampanyalar" }');
    expect(oku("src/app/(app)/ayarlar/whatsapp-api-ayarlari.tsx")).toContain('href="/kampanyalar/yeni?kanal=whatsapp_api"');
    // Uygulama kodunda eski adres kalmadı (yönlendirme tanımı hariç).
    const tara = (klasor: string): string[] =>
      fs.readdirSync(klasor, { withFileTypes: true }).flatMap((g) => {
        const tam = path.join(klasor, g.name);
        return g.isDirectory() ? tara(tam) : /\.tsx?$/.test(g.name) ? [tam] : [];
      });
    const eski = tara(path.join(KOK, "src"))
      .filter((d) => !d.endsWith("proxy.ts"))
      .filter((d) => /["'`]\/iletisim/.test(fs.readFileSync(d, "utf8")));
    expect(eski).toEqual([]);
  });

  it("sihirbaz: dört adım, adım adreste; son adım bugünkü API'ye aynı gövdeyi gönderir; WhatsApp yalnızca yöneticiye", () => {
    const s = oku("src/app/(app)/kampanyalar/yeni/kampanya-sihirbazi.tsx");
    expect(s).toContain("router.push(`/kampanyalar/yeni?adim=${n}`, { scroll: false })");
    expect(s).toContain('apiIstek<{ id: string }>("/api/kampanyalar", { method: "POST", govde: girdi() })');
    expect(s).toContain("router.push(`/kampanyalar/${s.veri.id}`)");
    expect(s).toContain('props.whatsapp.yonetici ? ["eposta", "sms", "whatsapp_api"] : ["eposta", "sms"]');
    expect(s).toContain("const adim = adimCoz(props.adim, taslak);");
    const sayfa = oku("src/app/(app)/kampanyalar/yeni/page.tsx");
    expect(sayfa).toContain('istenenKanal && (istenenKanal !== "whatsapp_api" || yonetici)');
    const liste = oku("src/app/(app)/kampanyalar/page.tsx");
    expect(liste).toContain('href: "/kampanyalar?sekme=whatsapp"');
    expect(liste).toContain('<Link href="/kampanyalar/yeni" className="dugme-ana">');
  });
});

describe("Panel ve kampanya ayrıntısı (Grup 7)", () => {
  const bos = { yonetici: true, incelenmemis: 0, waBekleyen: 0, gonderimdekiKampanya: 0, isciUyari: false, eksikAyarlar: [], waTestModu: false };

  it("Sıradaki işler: yalnızca yapılacak iş varsa; önce engelleyici uyarılar; yönetici uyarıları üyeye gösterilmez", () => {
    expect(siradakiIsler(bos)).toEqual([]);
    const hepsi = siradakiIsler({
      ...bos,
      incelenmemis: 17,
      waBekleyen: 3,
      gonderimdekiKampanya: 2,
      isciUyari: true,
      eksikAyarlar: ["İYS numarası"],
      waTestModu: true,
    });
    expect(hepsi.map((i) => i.href)).toEqual([
      "/kampanyalar",
      "/ayarlar/gonderen",
      "/kayitlar?grup=incelenmemis",
      "/kampanyalar?sekme=whatsapp",
      "/kampanyalar",
      "/ayarlar/whatsapp",
    ]);
    expect(hepsi[0]).toMatchObject({ ton: "tehlike", metin: "Gönderim servisi çalışmıyor" });
    expect(hepsi[2].metin).toBe("17 incelenmemiş tarama sonucu");
    expect(hepsi[1].aciklama).toContain("İYS numarası");
    const uye = siradakiIsler({ ...bos, yonetici: false, isciUyari: true, eksikAyarlar: ["x"], waTestModu: true, waBekleyen: 1 });
    expect(uye.map((i) => i.href)).toEqual(["/kampanyalar?sekme=whatsapp"]);
  });

  it("bu ay gönderilen mesaj: yalnızca bu ayın (İstanbul takvimi) gönderilmiş mesajları sayılır", () => {
    const { ctx } = kiraciOlustur(`P7${Math.random().toString(36).slice(2, 7)}`);
    const kisiler = kayitlar.kisileriEkle(
      ctx,
      [1, 2, 3, 4].map((i) => ({ kaynak: "elle" as const, isletmeAdi: `K${i}`, eposta: `k${i}@ornek.test` })),
      "t",
    );
    const k = kampanyalar.kampanyaOlustur(
      ctx,
      { kanal: "eposta", ad: "Panel", konu: "K", sablon: "S", bosIsimHitabi: null, filtre: {}, sandbox: true, planlananTarih: null },
      kisiler.map((x) => ({ leadId: x.id })),
    );
    const mesajlar = kampanyalar.kampanyaMesajlari(ctx, k.id).mesajlar;
    const ayarla = (i: number, durum: string, tarih: string) =>
      db.$client.prepare("update message_queue set durum = ?, gonderim_tarihi = ? where id = ?").run(durum, Date.parse(tarih), mesajlar[i].id);
    ayarla(0, "gonderildi", "2026-11-10T09:00:00Z"); // Kasım: sayılır
    ayarla(1, "gonderildi", "2026-10-31T21:30:00Z"); // 1 Kasım 00:30 İstanbul: sayılır
    ayarla(2, "gonderildi", "2026-10-31T20:30:00Z"); // 31 Ekim 23:30 İstanbul: sayılmaz
    ayarla(3, "basarisiz", "2026-11-10T09:00:00Z"); // gönderilmedi: sayılmaz
    expect(kampanyalar.buAyGonderilenMesaj(ctx, new Date("2026-11-15T09:00:00Z"))).toBe(2);
    expect(kampanyalar.buAyGonderilenMesaj(ctx, new Date("2026-10-31T20:59:00Z"))).toBe(3); // hâlâ Ekim (İstanbul): üçü de ≥ 1 Ekim
  });

  it("Panel: dört özet, sıradaki işler, durum renkli huni, son taramalar ve kampanyalar; kullanım gösterilmez", () => {
    const panel = oku("src/app/(app)/panel/page.tsx");
    for (const b of ["Toplam kayıt", "İletişimde + görüşme", "Kazanıldı", "Bu ay gönderilen mesaj"]) expect(panel).toContain(`baslik: "${b}"`);
    expect(panel).toContain("siradakiIsler({");
    expect(panel).toContain("TON_DOLGUSU[DURUM_TONU[d]]");
    expect(panel).toContain('baslik="Son kampanyalar"');
    expect(panel).not.toMatch(/kotaDurumu|KullanimGostergesi|kullanimOzeti/);
    expect(panel).not.toMatch(/canliBilgiGetir|servisler\/canli-bilgi/);
  });

  it("kampanya ayrıntısı: durum kartı ve Alıcılar / Mesaj / Geçmiş sekmeleri; işlemler aynı uç noktada", () => {
    const d = oku("src/app/(app)/kampanyalar/[id]/kampanya-detayi.tsx");
    for (const s of ['{ deger: "alicilar", ad: "Alıcılar" }', '{ deger: "mesaj", ad: "Mesaj" }', '{ deger: "gecmis", ad: "Geçmiş" }']) {
      expect(d).toContain(s);
    }
    expect(d).toContain('<IlerlemeCubugu yuzde={yuzde} etiket="Kampanya ilerlemesi" kalin />');
    expect(d).toContain("apiIstek(`/api/kampanyalar/${k.id}?islem=${yol}`, { method: \"POST\" })");
    expect(d).toContain('void islem("devam")');
    expect(d).toContain('void islem("iptal", "Kampanya iptal edilsin mi? Gönderilmemiş mesajlar gönderilmeyecek.")');
    expect(d).toContain("<IsciDurumu");
  });
});
