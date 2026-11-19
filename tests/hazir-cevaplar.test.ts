// Hazır cevaplar (gelen kutusu): yönetici ekler, düzenler, siler; üye yalnızca listeler ve kullanır. Aynı başlık
// (Türkçe harf duyarsız) iki kez olamaz, çalışma alanı başına sınır var. Gelen kutusundaki seçici yalnızca listeyi
// okur (GET); seçilen metin yanıt kutusuna konur, kendi başına hiçbir şey göndermez.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx, sayfaBaglami: async () => ({ ctx: oturum.ctx }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db } = await import("@/server/db");
const { KayitKuraliHatasi, YetkiHatasi } = await import("@/server/repo/baglam");
const repo = await import("@/server/repo/hazir-cevaplar");
const { baglamUret } = await import("@/server/repo/sistem/uyelik");
const { HAZIR_CEVAP_AZAMI, HAZIR_CEVAP_BASLIK_AZAMI, hazirCevapAra, yanitaEkle } = await import("@/lib/hazir-cevaplar");
const { YANIT_AZAMI } = await import("@/lib/gelen-kutusu");
const rota = await import("@/app/api/hazir-cevaplar/route");
const { hazirCevabiSil, hazirCevapKaydet } = await import("@/app/(app)/ayarlar/hazir-cevaplar/eylemler");
const { kiraciOlustur, kullaniciOlustur } = await import("./yardimci/fabrika");

function uyeEkle(ctx: TenantContext): TenantContext {
  const u = kullaniciOlustur("Uye");
  db.$client.prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')").run(u.id, ctx.tenantId);
  return baglamUret(u.id, ctx.tenantId)!;
}

const form = (d: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(d)) f.set(k, v);
  return f;
};

describe("depo", () => {
  it("yönetici ekler, düzenler, siler; liste Türkçe sıralı; metin ve başlık kırpılır", () => {
    const { ctx } = kiraciOlustur("HcDepo");
    const fiyat = repo.hazirCevapEkle(ctx, { baslik: "  Fiyat bilgisi ", metin: " Fiyatlarımız ilan sayfasında. \n" });
    repo.hazirCevapEkle(ctx, { baslik: "Çalışma saatleri", metin: "Hafta içi 09–18." });
    repo.hazirCevapEkle(ctx, { baslik: "Adres", metin: "Alsancak, İzmir." });
    expect(fiyat).toMatchObject({ baslik: "Fiyat bilgisi", metin: "Fiyatlarımız ilan sayfasında.", tenantId: ctx.tenantId, olusturan: ctx.userId });
    // Türkçe sıra: Ç, C'den sonra ve D'den önce gelir.
    expect(repo.hazirCevaplariListele(ctx).map((c) => c.baslik)).toEqual(["Adres", "Çalışma saatleri", "Fiyat bilgisi"]);

    const g = repo.hazirCevapGuncelle(ctx, fiyat.id, { baslik: "Fiyat", metin: "Güncel fiyat listesi ektedir." });
    expect(g).toMatchObject({ id: fiyat.id, baslik: "Fiyat", metin: "Güncel fiyat listesi ektedir." });
    expect(g!.guncellemeTarihi.getTime()).toBeGreaterThanOrEqual(fiyat.guncellemeTarihi.getTime());
    // Kendi başlığını korumak (yalnızca metni değiştirmek) çakışma sayılmaz.
    expect(repo.hazirCevapGuncelle(ctx, fiyat.id, { baslik: "fiyat", metin: "x" })).toMatchObject({ baslik: "fiyat" });
    expect(repo.hazirCevapGuncelle(ctx, "olmayan", { baslik: "Yok", metin: "x" })).toBeNull();

    expect(repo.hazirCevapSil(ctx, fiyat.id)).toBe(true);
    expect(repo.hazirCevapSil(ctx, fiyat.id)).toBe(false);
    expect(repo.hazirCevapGetir(ctx, fiyat.id)).toBeNull();
    expect(repo.hazirCevaplariListele(ctx)).toHaveLength(2);
  });

  it("aynı başlık (Türkçe büyük/küçük harf, fazla boşluk) iki kez olamaz; veritabanı da reddeder", () => {
    const { ctx } = kiraciOlustur("HcAyni");
    const ilan = repo.hazirCevapEkle(ctx, { baslik: "İlan linki", metin: "a" });
    const diger = repo.hazirCevapEkle(ctx, { baslik: "Randevu", metin: "b" });
    for (const baslik of ["ilan linki", "İLAN  LİNKİ", " İlan linki "]) {
      expect(() => repo.hazirCevapEkle(ctx, { baslik, metin: "c" }), baslik).toThrow("Bu başlıkta bir hazır cevap zaten var.");
    }
    // "Ilan" (noktasız I) Türkçede "ılan"dır: farklı başlık.
    expect(repo.hazirCevapEkle(ctx, { baslik: "Ilan linki", metin: "d" }).baslikAnahtari).toBe("ılan linki");
    expect(() => repo.hazirCevapGuncelle(ctx, diger.id, { baslik: "ilan LİNKİ", metin: "b" })).toThrow(KayitKuraliHatasi);
    expect(repo.hazirCevapGetir(ctx, diger.id)!.baslik).toBe("Randevu");
    expect(() =>
      db.$client
        .prepare("insert into hazir_cevaplar (id, tenant_id, baslik, baslik_anahtari, metin) values (?, ?, ?, ?, ?)")
        .run(crypto.randomUUID(), ctx.tenantId, "kopya", ilan.baslikAnahtari, "x"),
    ).toThrow(/UNIQUE/);
    // Başka çalışma alanında aynı başlık serbest.
    expect(repo.hazirCevapEkle(kiraciOlustur("HcAyni2").ctx, { baslik: "İlan linki", metin: "e" }).baslik).toBe("İlan linki");
  });

  it("üye listeler ve okur ama ekleyemez, düzenleyemez, silemez", () => {
    const { ctx } = kiraciOlustur("HcUye");
    const c = repo.hazirCevapEkle(ctx, { baslik: "Selam", metin: "Merhaba, nasıl yardımcı olabilirim?" });
    const uye = uyeEkle(ctx);
    expect(repo.hazirCevaplariListele(uye).map((x) => x.id)).toEqual([c.id]);
    expect(repo.hazirCevapGetir(uye, c.id)).toEqual(c);
    expect(() => repo.hazirCevapEkle(uye, { baslik: "Yeni", metin: "x" })).toThrow(YetkiHatasi);
    expect(() => repo.hazirCevapGuncelle(uye, c.id, { baslik: "Selam", metin: "değişti" })).toThrow(YetkiHatasi);
    expect(() => repo.hazirCevapSil(uye, c.id)).toThrow(YetkiHatasi);
    expect(repo.hazirCevapGetir(ctx, c.id)).toEqual(c);
  });

  it(`çalışma alanı başına en fazla ${HAZIR_CEVAP_AZAMI} hazır cevap`, () => {
    const { ctx } = kiraciOlustur("HcSinir");
    const ekle = db.$client.prepare("insert into hazir_cevaplar (id, tenant_id, baslik, baslik_anahtari, metin) values (?, ?, ?, ?, 'x')");
    db.$client.transaction(() => {
      for (let i = 0; i < HAZIR_CEVAP_AZAMI - 1; i++) ekle.run(crypto.randomUUID(), ctx.tenantId, `C${i}`, `c${i}`);
    })();
    repo.hazirCevapEkle(ctx, { baslik: "Son", metin: "x" });
    expect(() => repo.hazirCevapEkle(ctx, { baslik: "Fazla", metin: "x" })).toThrow(`En fazla ${HAZIR_CEVAP_AZAMI} hazır cevap kaydedilebilir.`);
    expect(repo.hazirCevaplariListele(ctx)).toHaveLength(HAZIR_CEVAP_AZAMI);
  });
});

describe("Ayarlar eylemleri", () => {
  it("doğrulama: boş ya da uzun başlık ve metin reddedilir; ekleme, düzenleme, silme; üyeye yetki mesajı", async () => {
    const { ctx } = kiraciOlustur("HcEylem");
    oturum.ctx = ctx;
    expect(await hazirCevapKaydet({}, form({ baslik: "  ", metin: "x" }))).toEqual({ hata: "Başlık girin." });
    expect(await hazirCevapKaydet({}, form({ baslik: "a".repeat(HAZIR_CEVAP_BASLIK_AZAMI + 1), metin: "x" }))).toEqual({
      hata: `Başlık en fazla ${HAZIR_CEVAP_BASLIK_AZAMI} karakter olabilir.`,
    });
    expect(await hazirCevapKaydet({}, form({ baslik: "B", metin: " \n " }))).toEqual({ hata: "Metin girin." });
    expect(await hazirCevapKaydet({}, form({ baslik: "B", metin: "x".repeat(YANIT_AZAMI + 1) }))).toEqual({
      hata: `Metin en fazla ${YANIT_AZAMI} karakter olabilir.`,
    });
    expect(repo.hazirCevaplariListele(ctx)).toEqual([]);

    expect(await hazirCevapKaydet({}, form({ baslik: "Teşekkür", metin: "Teşekkür ederiz." }))).toEqual({ tamam: "Eklendi." });
    expect(await hazirCevapKaydet({}, form({ baslik: "teşekkür", metin: "y" }))).toEqual({ hata: "Bu başlıkta bir hazır cevap zaten var." });
    const [c] = repo.hazirCevaplariListele(ctx);
    expect(await hazirCevapKaydet({}, form({ id: c.id, baslik: "Teşekkür", metin: "Çok teşekkürler." }))).toEqual({ tamam: "Kaydedildi." });
    expect(repo.hazirCevapGetir(ctx, c.id)!.metin).toBe("Çok teşekkürler.");

    // Başka çalışma alanının kimliğiyle düzenleme ve silme: bulunamadı, kayıt değişmez.
    oturum.ctx = kiraciOlustur("HcEylemYabanci").ctx;
    expect(await hazirCevapKaydet({}, form({ id: c.id, baslik: "Ele geçir", metin: "x" }))).toEqual({ hata: "Hazır cevap bulunamadı; sayfayı yenileyin." });
    expect(await hazirCevabiSil({}, form({ id: c.id }))).toEqual({ hata: "Hazır cevap bulunamadı; sayfayı yenileyin." });
    expect(repo.hazirCevapGetir(ctx, c.id)!.metin).toBe("Çok teşekkürler.");

    oturum.ctx = uyeEkle(ctx);
    expect(await hazirCevapKaydet({}, form({ baslik: "Üyeden", metin: "x" }))).toEqual({ hata: "Bu işlem için yönetici yetkisi gerekir." });
    expect(await hazirCevabiSil({}, form({ id: c.id }))).toEqual({ hata: "Bu işlem için yönetici yetkisi gerekir." });

    oturum.ctx = ctx;
    expect(await hazirCevabiSil({}, form({ id: c.id }))).toEqual({ tamam: "Silindi." });
    expect(repo.hazirCevaplariListele(ctx)).toEqual([]);
  });
});

describe("gelen kutusundaki seçici", () => {
  it("GET /api/hazir-cevaplar: oturumsuz 401; yalnızca kendi çalışma alanının listesi (üye de görür), önbelleğe alınmaz; yalnızca okuma", async () => {
    const { ctx } = kiraciOlustur("HcApi");
    const yabanci = kiraciOlustur("HcApiYabanci").ctx;
    const c = repo.hazirCevapEkle(ctx, { baslik: "Konum", metin: "Ofisimiz Alsancak'ta." });
    repo.hazirCevapEkle(yabanci, { baslik: "Gizli", metin: "Başka ofis" });

    oturum.ctx = null;
    expect((await rota.GET()).status).toBe(401);
    oturum.ctx = uyeEkle(ctx);
    const y = await rota.GET();
    expect(y.status).toBe(200);
    expect(y.headers.get("cache-control")).toBe("no-store");
    expect(await y.json()).toEqual({ cevaplar: [{ id: c.id, baslik: "Konum", metin: "Ofisimiz Alsancak'ta." }] });
    // Rota yalnızca okur: değişiklik ve gönderim buradan yapılamaz.
    expect(Object.keys(rota)).toEqual(["GET"]);
  });

  it("arama başlıkta ve metinde (Türkçe harf duyarsız, başlıktakiler önce); seçilen metin yanıt kutusuna konur", () => {
    const liste = [
      { id: "1", baslik: "Adres", metin: "İzmir'deki ofisimiz" },
      { id: "2", baslik: "İzmir şubesi", metin: "Şube bilgisi" },
      { id: "3", baslik: "Fiyat", metin: "Fiyat listesi" },
    ];
    expect(hazirCevapAra(liste, "izmir").map((c) => c.id)).toEqual(["2", "1"]);
    expect(hazirCevapAra(liste, "  ŞUBE ").map((c) => c.id)).toEqual(["2"]);
    expect(hazirCevapAra(liste, "")).toEqual(liste);
    expect(hazirCevapAra(liste, "yok")).toEqual([]);

    expect(yanitaEkle("", "Merhaba")).toBe("Merhaba");
    expect(yanitaEkle("  \n", "Merhaba")).toBe("Merhaba");
    expect(yanitaEkle("Ahmet Bey,  \n", "Fiyat listesi")).toBe("Ahmet Bey,\nFiyat listesi");
    expect(yanitaEkle("a".repeat(YANIT_AZAMI - 2), "uzun metin")).toHaveLength(YANIT_AZAMI);
  });
});

// Arayüz (DOM test ortamı yok; kaynak denetimi). Tarayıcıda bulunan iki hata:
// 1) React form eylemi bitince denetimsiz alanları sıfırlar; "aynı başlık" hatasında yazılan başlık siliniyordu.
// 2) Seçici yüklenirken kapanınca (ve geliştirmede çift çalıştırmada) iptal edilen istek yakalanmamış AbortError atıyordu.
describe("hazır cevap arayüzü", () => {
  const oku = (d: string) =>
    fs
      .readFileSync(path.resolve(__dirname, "..", d), "utf8")
      .split("\n")
      .filter((s) => !/^\s*(\/\/|\*|\/\*)/.test(s))
      .join("\n");

  it("formdaki başlık ve metin alanları denetimli (hata sonrası yazılan kaybolmaz)", () => {
    const k = oku("src/app/(app)/ayarlar/hazir-cevaplar/formlar.tsx");
    expect(k).not.toMatch(/defaultValue/);
    expect(k).toMatch(/name="baslik"[\s\S]{0,200}value=\{baslik\}/);
    expect(k).toMatch(/name="metin"[\s\S]{0,200}value=\{metin\}/);
  });

  it("seçicinin liste isteği iptal edilince hata yutulur", () => {
    const k = oku("src/app/(app)/gelen-kutusu/hazir-cevap-secici.tsx");
    expect(k).toMatch(/apiIstek<[^>]*>\("\/api\/hazir-cevaplar"[\s\S]*?\)\s*\.then\([\s\S]*?\)\s*\.catch\(/);
  });
});
