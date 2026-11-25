// Ortak sayfalama (lib/sayfalama + sayfalı listeler) ve Kayıtlar'ın "Kampanya durumu" / "Etiket yok" süzgeçleri.
// - Sayfa düğmeleri ve kısaltma, "Sayfaya git" girdisi (0, harf, toplamdan büyük), bilgi satırı, tek sayfa.
// - Adres: sayfa parametresi 1. sayfada yazılmaz, diğer parametreler korunur; aralık dışı ?sayfa= en yakın geçerli
//   sayfaya yönlendirilir; sayfa numarası liste tercihine yazılmaz.
// - Süzgeçler: Meta'nın kabul ettiği WhatsApp kampanya iletisi "almış" sayılır (teslim hatası da); "filtre aktif" şeridi ve
//   toplu işlemdeki "filtreye uyan tümü" aynı süzgeci uygular; başka çalışma alanının kuyruğu sonucu etkilemez.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";
import type { Kayit, YeniKisi } from "@/server/repo/kayitlar";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx, sayfaBaglami: async () => ({ ctx: oturum.ctx }) }));
class Yonlendirme extends Error {
  constructor(readonly adres: string) {
    super(`yönlendirme: ${adres}`);
  }
}
vi.mock("next/navigation", async (asil) => ({
  ...(await asil<typeof import("next/navigation")>()),
  redirect: (adres: string) => {
    throw new Yonlendirme(adres);
  },
  notFound: () => {
    throw new Error("404");
  },
}));

const { db } = await import("@/server/db");
const kayitlar = await import("@/server/repo/kayitlar");
const kampanyalar = await import("@/server/repo/kampanyalar");
const { SAYFA_BOYUTU } = await import("@/lib/sabitler");
const s = await import("@/lib/sayfalama");
const { etkinSuzgecEtiketleri, etkinSuzgecSayisi, kayitFiltresiCoz, kayitSorgusu, topluSuzgec } = await import("@/lib/kayit-filtresi");
const { KAYIT_TERCIH_ALANLARI, tercihKarari } = await import("@/lib/liste-tercihi");
const rota = await import("@/app/api/kayitlar/toplu/route");
const KayitlarSayfasi = (await import("@/app/(app)/kayitlar/page")).default;
const KampanyalarSayfasi = (await import("@/app/(app)/kampanyalar/page")).default;
const KampanyaSayfasi = (await import("@/app/(app)/kampanyalar/[id]/page")).default;
const { kiraciOlustur } = await import("./yardimci/fabrika");

let sayac = 0;
const telefon = () => `90533${String(1_000_000 + ++sayac).slice(-7)}`;

function kisiler(ctx: TenantContext, ad: string, adet: number, ek: Partial<YeniKisi> = {}): Kayit[] {
  return kayitlar.kisileriEkle(
    ctx,
    Array.from({ length: adet }, (_, i) => ({
      kaynak: "elle" as const,
      yetkiliAdi: `${ad} ${i + 1}`,
      ekTelefon: telefon(),
      etiketler: [],
      aliciTuru: "tacir_esnaf" as const,
      ...ek,
    })),
    "Test",
  );
}

type Satir = { lead: Kayit; durum: string; sandbox?: boolean; teslim?: string | null; kod?: number; neden?: string; haric?: boolean };
/** Kampanya + kuyruk satırları; satır durumları doğrudan yazılır (gönderim işçisi çalıştırılmaz). */
function kampanya(ctx: TenantContext, kanal: "whatsapp_api" | "eposta", satirlar: Satir[]) {
  const k = kampanyalar.kampanyaOlustur(
    ctx,
    { kanal, ad: `K${++sayac}`, konu: kanal === "eposta" ? "K" : null, sablon: "S", bosIsimHitabi: null, filtre: {}, sandbox: false, planlananTarih: null },
    satirlar.map((x) => ({ leadId: x.lead.id, ...(x.haric ? { haric: "whatsapp_izni_yok" as const } : {}) })),
  );
  const yaz = db.$client.prepare(
    "update message_queue set durum = ?, sandbox_icerik = ?, teslim_durumu = ?, teslim_hata_kodu = ?, neden = coalesce(?, neden), gonderim_tarihi = ? where kampanya_id = ? and lead_id = ?",
  );
  for (const x of satirlar) {
    yaz.run(x.durum, x.sandbox ? "Test modu metni" : null, x.teslim ?? null, x.kod ?? null, x.neden ?? null, x.durum === "gonderildi" ? Date.now() : null, k.id, x.lead.id);
  }
  return k;
}

const istek = (govde: unknown) =>
  new Request("https://crm.ornek.test/api/kayitlar/toplu", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "https://crm.ornek.test" },
    body: JSON.stringify(govde),
  });

const idler = (liste: { id: string }[]) => liste.map((k) => k.id).sort();

beforeEach(() => {
  oturum.ctx = null;
});

describe("sayfalama: düğmeler ve kısaltma", () => {
  it("çok sayfada ilk, son, geçerli ve komşuları; aradaki boşluklar kısaltılır", () => {
    expect(s.sayfaNumaralari(5, 11)).toEqual([1, "bosluk", 4, 5, 6, "bosluk", 11]);
    expect(s.sayfaNumaralari(1, 11)).toEqual([1, 2, "bosluk", 11]);
    expect(s.sayfaNumaralari(11, 11)).toEqual([1, "bosluk", 10, 11]);
    // Tek sayfalık boşluk "…" yerine sayının kendisi: 1 2 3 4 … 11.
    expect(s.sayfaNumaralari(3, 11)).toEqual([1, 2, 3, 4, "bosluk", 11]);
    expect(s.sayfaNumaralari(9, 11)).toEqual([1, "bosluk", 8, 9, 10, 11]);
  });

  it("az sayfada hepsi, tek sayfada yalnızca 1; aralık dışı geçerli sayfa sınıra çekilir", () => {
    expect(s.sayfaNumaralari(2, 4)).toEqual([1, 2, 3, 4]);
    expect(s.sayfaNumaralari(1, 1)).toEqual([1]);
    expect(s.sayfaNumaralari(99, 3)).toEqual([1, 2, 3]);
    expect(s.sayfaNumaralari(-4, 0)).toEqual([1]);
  });

  it("sayfa sınırlama: 0, eksi, ondalık, NaN, sonsuz ve toplamdan büyük", () => {
    expect(s.sayfaSinirla(0, 11)).toBe(1);
    expect(s.sayfaSinirla(-3, 11)).toBe(1);
    expect(s.sayfaSinirla(2.7, 11)).toBe(2);
    expect(s.sayfaSinirla(Number.NaN, 11)).toBe(1);
    expect(s.sayfaSinirla(Infinity, 11)).toBe(11);
    expect(s.sayfaSinirla(12, 11)).toBe(11);
    expect(s.sayfaSinirla(5, 0)).toBe(1);
    expect(s.sayfaSayisiHesapla(0, 50)).toBe(1);
    expect(s.sayfaSayisiHesapla(1045, 100)).toBe(11);
    expect(s.sayfaSayisiHesapla(100, 100)).toBe(1);
  });
});

describe("sayfalama: 'Sayfaya git' girdisi", () => {
  it("geçerli numara olduğu gibi; boşluk kırpılır", () => {
    expect(s.sayfaGirdisiCoz("7", 11)).toEqual({ tur: "git", sayfa: 7, uyari: null });
    expect(s.sayfaGirdisiCoz(" 11 ", 11)).toEqual({ tur: "git", sayfa: 11, uyari: null });
    expect(s.sayfaGirdisiCoz("1", 1)).toEqual({ tur: "git", sayfa: 1, uyari: null });
  });

  it("aralık dışı: en yakın geçerli sayfaya gider ve kısa not verir", () => {
    expect(s.sayfaGirdisiCoz("0", 11)).toEqual({ tur: "git", sayfa: 1, uyari: "İlk sayfaya gidildi." });
    expect(s.sayfaGirdisiCoz("-5", 11)).toEqual({ tur: "git", sayfa: 1, uyari: "İlk sayfaya gidildi." });
    expect(s.sayfaGirdisiCoz("12", 11)).toEqual({ tur: "git", sayfa: 11, uyari: "Son sayfa 11; oraya gidildi." });
    expect(s.sayfaGirdisiCoz("99999", 1200)).toMatchObject({ tur: "git", sayfa: 1200, uyari: "Son sayfa 1.200; oraya gidildi." });
  });

  it("sayı değil (harf, boş, ondalık): gidilmez, uyarı verilir", () => {
    for (const g of ["abc", "", "   ", "3a", "2.5", "1e3"]) {
      expect(s.sayfaGirdisiCoz(g, 11)).toEqual({ tur: "gecersiz", uyari: "1 ile 11 arasında bir sayfa numarası yazın." });
    }
  });
});

describe("sayfalama: bilgi satırı ve adres", () => {
  it("'Sayfa 3 / 11 · 201–300 / 1.045 kayıt'; son sayfa kısa; boş liste", () => {
    expect(s.sayfaBilgisi(3, 11, 100, 1045)).toBe("Sayfa 3 / 11 · 201–300 / 1.045 kayıt");
    expect(s.sayfaBilgisi(11, 11, 100, 1045)).toBe("Sayfa 11 / 11 · 1.001–1.045 / 1.045 kayıt");
    expect(s.sayfaBilgisi(1, 1, 50, 12, "alıcı")).toBe("Sayfa 1 / 1 · 1–12 / 12 alıcı");
    expect(s.sayfaBilgisi(1, 1, 50, 0)).toBe("0 kayıt");
    expect(s.sayfaAraligi(2, 20, 20)).toEqual({ ilk: 1, son: 20 }); // aralık dışı sayfa: son sayfanın aralığı
  });

  it("sayfa parametresi 1. sayfada yazılmaz, diğer parametreler korunur; özel parametre adı", () => {
    expect(s.sayfaAdresi("/kayitlar?grup=tum&etiket=a%20b", 3)).toBe("/kayitlar?grup=tum&etiket=a+b&sayfa=3");
    expect(s.sayfaAdresi("/kayitlar?grup=tum&sayfa=4", 1)).toBe("/kayitlar?grup=tum");
    expect(s.sayfaAdresi("/kampanyalar/k1", 2)).toBe("/kampanyalar/k1?sayfa=2");
    expect(s.sayfaAdresi("/tarama?tarama=t1&karar=ilgi", 2, "sonuc")).toBe("/tarama?tarama=t1&karar=ilgi&sonuc=2");
    expect(s.adrestekiSayfa("abc")).toBe(1);
    expect(s.adrestekiSayfa("0")).toBe(1);
    expect(s.adrestekiSayfa("4")).toBe(4);
    expect(s.adrestekiSayfa(undefined)).toBe(1);
  });

  it("sayfa numarası liste tercihine yazılmaz; yeni süzgeçler yazılır ve geri yüklenir", () => {
    const k = tercihKarari("grup=tum&wa_kampanya=almamis&etiketsiz=1&sayfa=4", KAYIT_TERCIH_ALANLARI, null);
    expect(k).toEqual({ tur: "kaydet", tercih: { grup: "tum", wa_kampanya: "almamis", etiketsiz: "1" } });
    const u = tercihKarari("sayfa=4", KAYIT_TERCIH_ALANLARI, { grup: "tum", wa_kampanya: "almamis", etiketsiz: "1" });
    expect(u.tur === "uygula" && new URLSearchParams(u.arama).has("sayfa")).toBe(false);
  });
});

describe("sayfalı listeler: aralık dışı sayfa", () => {
  it("kayitlariListele / kampanyaSayfasi / kampanyaMesajlari / taramaSonuclariListele sayfayı sınırlar", () => {
    const { ctx } = kiraciOlustur("SayfaSinir");
    const liste = kisiler(ctx, "Sınır", 55);
    const tum = kayitlar.kayitlariListele(ctx, { grup: "tum", sayfa: 99 });
    expect(tum).toMatchObject({ sayfa: 2, sayfaSayisi: 2, toplam: 55, boyut: 50 });
    expect(tum.kayitlar).toHaveLength(5);
    expect(kayitlar.kayitlariListele(ctx, { grup: "tum", sayfa: 0 }).sayfa).toBe(1);
    expect(kayitlar.kayitlariListele(ctx, { grup: "tum", etiket: "yok-boyle" , sayfa: 3 })).toMatchObject({ sayfa: 1, sayfaSayisi: 1, toplam: 0 });

    for (let i = 0; i < SAYFA_BOYUTU + 1; i++) kampanya(ctx, "eposta", [{ lead: liste[i], durum: "kuyrukta" }]);
    expect(kampanyalar.kampanyaSayfasi(ctx, { sayfa: 50 })).toMatchObject({ sayfa: 2, sayfaSayisi: 2, toplam: SAYFA_BOYUTU + 1 });
    expect(kampanyalar.kampanyaSayfasi(ctx, { sayfa: 2 }).kampanyalar).toHaveLength(1);
    // Yeniden eskiye, sayfalar çakışmaz.
    const ilk = kampanyalar.kampanyaSayfasi(ctx, { sayfa: 1 }).kampanyalar;
    expect(ilk).toHaveLength(SAYFA_BOYUTU);
    expect(ilk.map((k) => k.id)).not.toContain(kampanyalar.kampanyaSayfasi(ctx, { sayfa: 2 }).kampanyalar[0].id);

    const cok = kampanya(ctx, "eposta", liste.slice(0, 25).map((lead) => ({ lead, durum: "kuyrukta" })));
    expect(kampanyalar.kampanyaMesajlari(ctx, cok.id, { sayfa: 7 })).toMatchObject({ sayfa: 2, sayfaSayisi: 2, toplam: 25, boyut: SAYFA_BOYUTU });
    expect(kampanyalar.kampanyaMesajlari(ctx, cok.id, { sayfa: 7 }).mesajlar).toHaveLength(5);
  });
});

describe("sayfalı sayfalar: adres", () => {
  it("Kayıtlar: ?sayfa= toplamdan büyük → son sayfa, harf → parametresiz; süzgeç ve ?secili= korunur; geçerli sayfa yönlendirmez", async () => {
    const { ctx } = kiraciOlustur("SayfaAdres");
    const liste = kisiler(ctx, "Adres", 120, { etiketler: ["parti"] });
    oturum.ctx = ctx;
    const ac = (p: Record<string, string>) => KayitlarSayfasi({ searchParams: Promise.resolve(p) } as never);
    await expect(ac({ grup: "tum", etiket: "parti", sayfa: "9" })).rejects.toMatchObject({ adres: "/kayitlar?grup=tum&etiket=parti&sayfa=3" });
    await expect(ac({ grup: "tum", sayfa: "abc" })).rejects.toMatchObject({ adres: "/kayitlar?grup=tum" });
    await expect(ac({ grup: "tum", sayfa: "0", secili: liste[0].id })).rejects.toMatchObject({
      adres: `/kayitlar?grup=tum&secili=${liste[0].id}`,
    });
    await expect(ac({ grup: "tum", sayfa: "2" })).resolves.toBeTruthy();
    await expect(ac({ grup: "tum" })).resolves.toBeTruthy();
  });

  it("Kampanyalar ve kampanya alıcıları: aralık dışı sayfa yönlendirilir; sekme ve durum süzgeci korunur", async () => {
    const { ctx } = kiraciOlustur("SayfaAdresK");
    const [l] = kisiler(ctx, "K", 1);
    const k = kampanya(ctx, "eposta", [{ lead: l, durum: "gonderildi" }]);
    oturum.ctx = ctx;
    await expect(KampanyalarSayfasi({ searchParams: Promise.resolve({ sekme: "kampanyalar", sayfa: "5" }) } as never)).rejects.toMatchObject({
      adres: "/kampanyalar?sekme=kampanyalar",
    });
    await expect(
      KampanyaSayfasi({ params: Promise.resolve({ id: k.id }), searchParams: Promise.resolve({ durum: "gonderildi", sayfa: "3" }) } as never),
    ).rejects.toMatchObject({ adres: `/kampanyalar/${k.id}?durum=gonderildi` });
    await expect(KampanyaSayfasi({ params: Promise.resolve({ id: k.id }), searchParams: Promise.resolve({}) } as never)).resolves.toBeTruthy();
  });
});

describe("Kayıtlar süzgeci: Kampanya durumu ve Etiket yok", () => {
  function kurulum(ad: string) {
    const { ctx } = kiraciOlustur(ad);
    const [gonderildi, haric, testModu, teslim131026, teslim131049, metaReddetti, iptal, kuyrukta, eposta, hic] = kisiler(ctx, ad, 10);
    const etiketli = kisiler(ctx, `${ad}E`, 2, { etiketler: ["parti-1"] });
    kampanya(ctx, "whatsapp_api", [
      { lead: gonderildi, durum: "gonderildi", teslim: "delivered" },
      { lead: haric, durum: "haric", haric: true },
      { lead: testModu, durum: "gonderildi", sandbox: true },
      // Meta kabul etti, sonra teslim edemedi (webhook): yine "almış".
      { lead: teslim131026, durum: "gonderildi", teslim: "failed", kod: 131026 },
      { lead: teslim131049, durum: "gonderildi", teslim: "failed", kod: 131049 },
      // Gönderim anında Meta reddetti (ör. eşzamanlı 131026): "almamış".
      { lead: metaReddetti, durum: "basarisiz", neden: "whatsapp_yok" },
      { lead: iptal, durum: "iptal", neden: "iptal" },
      { lead: kuyrukta, durum: "kuyrukta" },
      { lead: etiketli[0], durum: "gonderildi", teslim: "read" },
    ]);
    // E-posta kampanyası WhatsApp kampanyası sayılmaz.
    kampanya(ctx, "eposta", [{ lead: eposta, durum: "gonderildi" }]);
    // Aynı kayıt ikinci bir WhatsApp kampanyasında hariç: önceki gerçek gönderim yine "almış".
    kampanya(ctx, "whatsapp_api", [{ lead: gonderildi, durum: "haric", haric: true }]);
    return {
      ctx,
      gonderildi,
      hic,
      etiketli,
      /** Kampanya almış sayılanlar (etiketli[0] dahil). */
      almis: [gonderildi, teslim131026, teslim131049, etiketli[0]],
      /** Etiketi olmayan ve kampanya almamış sayılanlar. */
      almamisEtiketsiz: [haric, testModu, metaReddetti, iptal, kuyrukta, eposta, hic],
    };
  }

  it("almış: Meta'nın kabul ettiği WhatsApp kampanya iletisi (teslim hatası 131026 / 131049 dahil); hariç / test / Meta'nın reddettiği / iptal / bekleyen almamış", () => {
    const k = kurulum("KampDurum");
    const almis = kayitlar.kayitlariListele(k.ctx, { grup: "tum", kampanyaDurumu: "almis" });
    expect(idler(almis.kayitlar)).toEqual(idler(k.almis));
    const almamis = kayitlar.kayitlariListele(k.ctx, { grup: "tum", kampanyaDurumu: "almamis" });
    expect(idler(almamis.kayitlar)).toEqual(idler([...k.almamisEtiketsiz, k.etiketli[1]]));
    expect(almis.toplam + almamis.toplam).toBe(kayitlar.kayitlariListele(k.ctx, { grup: "tum" }).toplam);
  });

  it("Etiket yok: hiç etiketi olmayanlar; etiket kaldırılınca listeye girer; Kampanya durumu ile birlikte çalışır", () => {
    const k = kurulum("EtiketYok");
    const yok = kayitlar.kayitlariListele(k.ctx, { grup: "tum", etiketsiz: true });
    expect(yok.toplam).toBe(10);
    expect(idler(yok.kayitlar)).not.toContain(k.etiketli[0].id);
    kayitlar.kayitGuncelle(k.ctx, k.etiketli[1].id, { etiketler: [] });
    expect(kayitlar.kayitlariListele(k.ctx, { grup: "tum", etiketsiz: true }).toplam).toBe(11);
    // Parti: hiç WhatsApp kampanyası almamış ve etiketi olmayanlar.
    const parti = kayitlar.kayitlariListele(k.ctx, { grup: "tum", etiketsiz: true, kampanyaDurumu: "almamis" });
    expect(idler(parti.kayitlar)).toEqual(idler([...k.almamisEtiketsiz, k.etiketli[1]]));
  });

  it("adres biçimi, rozet sayısı ve 'Filtre aktif' şeridi; 'Etiket yok' etiket adını geçersiz kılar", () => {
    const f = kayitFiltresiCoz((ad) => new URLSearchParams("grup=tum&wa_kampanya=almamis&etiketsiz=1&etiket=x&sayfa=2").get(ad) ?? undefined);
    expect(f).toMatchObject({ kampanyaDurumu: "almamis", etiketsiz: true, etiket: undefined, sayfa: 2 });
    expect(kayitSorgusu(f).toString()).toBe("grup=tum&etiketsiz=1&wa_kampanya=almamis");
    expect(etkinSuzgecSayisi(f)).toBe(2);
    expect(etkinSuzgecEtiketleri(f)).toEqual(["Etiket yok", "Kampanya durumu = Hiç WhatsApp kampanyası almamış"]);
    expect(topluSuzgec(f)).not.toHaveProperty("sayfa");
    const g = kayitFiltresiCoz((ad) => new URLSearchParams("wa_kampanya=bilinmeyen&etiketsiz=0").get(ad) ?? undefined);
    expect(g).toMatchObject({ kampanyaDurumu: undefined, etiketsiz: undefined });
    expect(etkinSuzgecEtiketleri(kayitFiltresiCoz((ad) => (ad === "wa_kampanya" ? "almis" : undefined)))).toEqual([
      "Kampanya durumu = WhatsApp kampanyası almış",
    ]);
  });

  it("toplu işlem 'filtreye uyan tümü' yeni süzgeçleri uygular (sayfa numarasından bağımsız)", async () => {
    const k = kurulum("TopluParti");
    const ek = kisiler(k.ctx, "TopluEk", 60); // etiketsiz, kampanya almamış: süzgece uyan 7 + 60 = 67 kayıt, 2 sayfa
    oturum.ctx = k.ctx;
    const sorgu = "grup=tum&etiketsiz=1&wa_kampanya=almamis&sayfa=2";
    const beklenen = kayitlar.kayitlariListele(k.ctx, kayitFiltresiCoz((ad) => new URLSearchParams(sorgu).get(ad) ?? undefined));
    expect(beklenen).toMatchObject({ toplam: 67, sayfa: 2 });
    const y = await rota.POST(istek({ secim: { tur: "filtre", sorgu, beklenenToplam: 67 }, islem: { tur: "etiket_ekle", etiket: "parti-2" } }));
    expect(y.status).toBe(200);
    expect((await y.json()).sonuc).toMatchObject({ hedef: 67, degisen: 67 });
    const partide = kayitlar.kayitlariListele(k.ctx, { grup: "tum", etiket: "parti-2", boyut: 100 });
    expect(idler(partide.kayitlar)).toEqual(idler([...k.almamisEtiketsiz, ...ek]));
    // Kampanya almış ve etiketli kayıtlar dokunulmadan kalır; "etiket yok" olarak yalnızca almış olanlar kalır.
    expect(kayitlar.kayitGetir(k.ctx, k.gonderildi.id)!.etiketler).toEqual([]);
    expect(kayitlar.kayitGetir(k.ctx, k.etiketli[1].id)!.etiketler).toEqual(["parti-1"]);
    expect(kayitlar.kayitlariListele(k.ctx, { grup: "tum", etiketsiz: true }).toplam).toBe(3);
  });

  it("izolasyon: başka çalışma alanının kuyruğu ve kayıtları sonucu etkilemez", () => {
    const a = kurulum("IzolA");
    const b = kurulum("IzolB");
    const aAlmis = idler(kayitlar.kayitlariListele(a.ctx, { grup: "tum", kampanyaDurumu: "almis" }).kayitlar);
    expect(aAlmis).toEqual(idler(a.almis));
    // B'nin A'daki kayıtlara işaret eden bir kuyruk satırı yazamaz (yabancı anahtar kiracıyla birlikte); B'nin kendi
    // gönderimleri A'nın "almamış" listesini değiştirmez.
    const bKamp = kampanya(b.ctx, "whatsapp_api", [{ lead: b.hic, durum: "gonderildi" }]);
    expect(() =>
      db.$client
        .prepare("insert into message_queue (id, tenant_id, kampanya_id, lead_id, kanal, durum) values (?, ?, ?, ?, 'whatsapp_api', 'gonderildi')")
        .run(crypto.randomUUID(), b.ctx.tenantId, bKamp.id, a.hic.id),
    ).toThrow();
    const aAlmamis = kayitlar.kayitlariListele(a.ctx, { grup: "tum", kampanyaDurumu: "almamis" });
    expect(aAlmamis.kayitlar.every((x) => x.tenantId === a.ctx.tenantId)).toBe(true);
    expect(idler(aAlmamis.kayitlar)).toContain(a.hic.id);
    expect(idler(kayitlar.kayitlariListele(a.ctx, { grup: "tum", kampanyaDurumu: "almis" }).kayitlar)).toEqual(aAlmis);
    const aEtiketsiz = kayitlar.kayitlariListele(a.ctx, { grup: "tum", etiketsiz: true });
    expect(aEtiketsiz.kayitlar.every((x) => x.tenantId === a.ctx.tenantId)).toBe(true);
    expect(aEtiketsiz.toplam).toBe(10);
    expect(idler(kayitlar.kayitlariListele(b.ctx, { grup: "tum", kampanyaDurumu: "almis" }).kayitlar)).toEqual(
      idler([...b.almis, b.hic]),
    );
  });
});
