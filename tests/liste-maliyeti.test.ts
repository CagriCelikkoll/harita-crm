// Grup B — liste maliyeti: kayıt listesi Places'a kendiliğinden gitmez; Google ad/adresi yalnızca istenince
// (/api/kayitlar/canli, kayıt başı 3 birim) gelir ve yalnızca bellekte tutulur; detay paneli istisnalarla otomatik
// (ilgilenilmeyen kayıt ve kota %80+ → çağrı yok); tarama sonuçlarının incelenmesi (leads.inceleme, migration 0013);
// "ilgilenmiyor" kayıtlar listede gizli ve hiçbir kampanyaya / WhatsApp listesine girmez.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AD_GIRME_IPUCU } from "@/lib/sabitler";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db, veritabaniAc } = await import("@/server/db");
const { migrasyonlariUygula } = await import("@/server/db/migrasyon");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kampanyaMesajlari } = await import("@/server/repo/kampanyalar");
const kayitlar = await import("@/server/repo/kayitlar");
const { aylikPlacesBirimi } = await import("@/server/repo/kullanim");
const { taramaOlustur } = await import("@/server/repo/taramalar");
const { gunlukListe } = await import("@/server/repo/whatsapp-listesi");
const { isciTuru } = await import("@/server/servisler/isci");
const { kampanyaBaslat, kampanyaOzeti } = await import("@/server/servisler/kampanya");
const wa = await import("@/server/servisler/whatsapp");
const canliRotasi = await import("@/app/api/kayitlar/canli/route");
const kayitRotasi = await import("@/app/api/kayitlar/[id]/route");
const incelemeRotasi = await import("@/app/api/kayitlar/inceleme/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");
const { SahteSaglayici } = await import("./yardimci/mesaj-fabrika");

const KOK = path.resolve(__dirname, "..");
const U = "https://crm.ornek.test";
const OGLE = new Date("2026-10-12T09:00:00Z");
const post = (url: string, govde: unknown) =>
  new Request(`${U}${url}`, { method: "POST", body: JSON.stringify(govde), headers: { "content-type": "application/json" } });

function kiraci(kota = 6000) {
  const { ctx } = kiraciOlustur(`L${Math.random().toString(36).slice(2, 7)}`);
  db.$client.prepare("update tenants set aylik_places_kotasi = ? where id = ?").run(kota, ctx.tenantId);
  oturum.ctx = ctx;
  return ctx;
}
/** Taramayla gelmiş gibi Google kayıtları (sahte place_id'ler; inceleme = incelenmedi). */
function googleKayitlari(ctx: TenantContext, adet: number) {
  const t = taramaOlustur(ctx, { merkezLat: 41, merkezLng: 29, yaricapM: 1000, kategori: "emlak_ofisi" });
  const idler = Array.from({ length: adet }, (_, i) => `mock_real_estate_agency_${10300 + i}_${7300 + i}`);
  kayitlar.kayitlariEkle(ctx, t.id, idler);
  return { tarama: t, kayitlar: kayitlar.taramaKayitlari(ctx, t.id) };
}

describe("kayıt listesi Places'a kendiliğinden gitmez", () => {
  it("liste sayfası Places çağrısı yapmaz (canlı bilgi kodu yok); listeleme 0 birim", () => {
    const sayfa = fs.readFileSync(path.join(KOK, "src/app/(app)/kayitlar/page.tsx"), "utf8");
    expect(sayfa).not.toMatch(/canliBilgiGetir|from "@\/server\/servisler\/canli-bilgi"/);
    const ctx = kiraci();
    googleKayitlari(ctx, 5);
    expect(kayitlar.kayitlariListele(ctx).kayitlar).toHaveLength(5);
    expect(aylikPlacesBirimi(ctx)).toBe(0);
  });

  it("istenince: yalnızca kiracının Google kayıtları, kayıt başı 3 birim, no-store; başka kiracının ve Google dışı kimlik yok sayılır", async () => {
    const baska = kiraci();
    const baskaninKaydi = googleKayitlari(baska, 1).kayitlar[0];
    const ctx = kiraci();
    const g = googleKayitlari(ctx, 3).kayitlar;
    const [elle] = kayitlar.kisileriEkle(ctx, [{ kaynak: "elle", isletmeAdi: "Elle", ekTelefon: "0532 000 00 01" }], "t");

    const y = await canliRotasi.POST(post("/api/kayitlar/canli", { idler: [...g.map((k) => k.id), elle.id, baskaninKaydi.id] }));
    expect(y.status).toBe(200);
    expect(y.headers.get("cache-control")).toBe("no-store");
    const { sonuclar } = await y.json();
    expect(Object.keys(sonuclar).sort()).toEqual(g.map((k) => k.id).sort());
    for (const k of g) expect(sonuclar[k.id]).toMatchObject({ ad: expect.any(String), adres: expect.stringContaining("örnek veri") });
    expect(aylikPlacesBirimi(ctx)).toBe(9);
    expect(aylikPlacesBirimi(baska)).toBe(0);

    // Places içeriği hiçbir tabloya yazılmaz.
    const ad = sonuclar[g[0].id].ad as string;
    expect(JSON.stringify(db.$client.prepare("select * from leads where tenant_id = ?").all(ctx.tenantId))).not.toContain(ad);
  });

  it("en fazla 20 kayıt; kota doluysa Places çağrılmaz ve neden döner", async () => {
    const ctx = kiraci(0);
    const g = googleKayitlari(ctx, 2).kayitlar;
    expect((await canliRotasi.POST(post("/api/kayitlar/canli", { idler: Array.from({ length: 21 }, (_, i) => `x${i}`) }))).status).toBe(400);
    const { sonuclar } = await (await canliRotasi.POST(post("/api/kayitlar/canli", { idler: g.map((k) => k.id) }))).json();
    expect(sonuclar[g[0].id]).toEqual({ hata: "İşletme bilgisi gösterilemiyor (kota doldu)" });
    expect(aylikPlacesBirimi(ctx)).toBe(0);
  });

  it("Places içeriği tarayıcı depolamasına yazılmaz (yalnızca bileşen belleği)", () => {
    for (const d of [
      "src/components/google-bilgisi.tsx",
      "src/app/(app)/kayitlar/kayitlar-ekrani.tsx",
      "src/app/(app)/kayitlar/kayit-tablosu.tsx",
      "src/app/(app)/kayitlar/detay-paneli.tsx",
      "src/app/(app)/tarama/sonuc-izgarasi.tsx",
      "src/app/(app)/iletisim/kampanya/[id]/kampanya-detayi.tsx",
    ]) {
      const kod = fs
        .readFileSync(path.join(KOK, d), "utf8")
        .split("\n")
        .filter((s) => !/^\s*(\/\/|\*|\/\*)/.test(s)) // yorumlar hariç
        .join("\n");
      expect(kod, d).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open/);
    }
  });
});

describe("detay paneli: otomatik Enterprise çağrısı istisnalarla", () => {
  const detay = (id: string, canli: string) =>
    kayitRotasi.GET(new Request(`${U}/api/kayitlar/${id}?canli=${canli}`), { params: Promise.resolve({ id }) });

  it("normalde açılışta çekilir (4 birim); ilgilenilmeyen kayıtta çekilmez, ?canli=1 ile istenince çekilir", async () => {
    const ctx = kiraci();
    const [a, b] = googleKayitlari(ctx, 2).kayitlar;
    const normal = await (await detay(a.id, "oto")).json();
    expect(normal.canli?.durum).toBe("tamam");
    expect(normal.canliAtlandi).toBeUndefined();
    expect(aylikPlacesBirimi(ctx)).toBe(4);

    kayitlar.incelemeAyarla(ctx, [b.id], "ilgilenmiyor");
    const atlandi = await (await detay(b.id, "oto")).json();
    expect(atlandi).toMatchObject({ canliAtlandi: "ilgilenmiyor" });
    expect(atlandi.canli).toBeUndefined();
    expect(aylikPlacesBirimi(ctx)).toBe(4);

    expect((await (await detay(b.id, "1")).json()).canli?.durum).toBe("tamam");
    expect(aylikPlacesBirimi(ctx)).toBe(8);
  });

  it("kota %80'i geçtiyse açılışta çekilmez", async () => {
    const ctx = kiraci(10);
    const [a, b] = googleKayitlari(ctx, 2).kayitlar;
    await detay(a.id, "1"); // 4 birim: %40
    await detay(a.id, "1"); // 8 birim: %80
    const atlandi = await (await detay(b.id, "oto")).json();
    expect(atlandi).toMatchObject({ canliAtlandi: "kota" });
    expect(aylikPlacesBirimi(ctx)).toBe(8);
  });

  it("detay paneli aynı kaydı bellek önbelleğinden açar (Places'a gitmez); ad alanı boş ve yalnızca genel ipucu", () => {
    const panel = fs.readFileSync(path.join(KOK, "src/app/(app)/kayitlar/detay-paneli.tsx"), "utf8");
    expect(panel).toContain("const onceki = detayOnbellegi.al(id);");
    expect(panel).toMatch(/name="isletmeAdi"\s+defaultValue=\{kayit\.isletmeAdi \?\? ""\}[\s\S]{0,120}placeholder=\{AD_GIRME_IPUCU\}/);
    expect(AD_GIRME_IPUCU).toBe("İşletmeyle görüştüğünüzde adını buraya yazın");
  });
});

describe("tarama sonuçlarının incelenmesi", () => {
  it("taramayla gelen kayıt 'incelenmedi', elle eklenen 'ilgileniyor'; sayılar tarama bazında", () => {
    const ctx = kiraci();
    const { tarama, kayitlar: g } = googleKayitlari(ctx, 3);
    const [elle] = kayitlar.kisileriEkle(ctx, [{ kaynak: "elle", isletmeAdi: "E", ekTelefon: "0532 000 00 02" }], "t");
    expect(g.map((k) => kayitlar.kayitGetir(ctx, k.id)!.inceleme)).toEqual(["incelenmedi", "incelenmedi", "incelenmedi"]);
    expect(kayitlar.kayitGetir(ctx, elle.id)!.inceleme).toBe("ilgileniyor");
    expect(kayitlar.incelenmemisSayilari(ctx, [tarama.id]).get(tarama.id)).toBe(3);
  });

  it("İlgilen / İlgilenme (toplu): ilgilenilmeyenler varsayılan listede gizli, 'hepsi' ve özel süzgeçte görünür; başka kiracıya etki yok", async () => {
    const baska = kiraci();
    const baskaninKaydi = googleKayitlari(baska, 1).kayitlar[0];
    const ctx = kiraci();
    const { tarama, kayitlar: g } = googleKayitlari(ctx, 4);
    const y = await incelemeRotasi.POST(post("/api/kayitlar/inceleme", { idler: [g[0].id, g[1].id, baskaninKaydi.id], inceleme: "ilgilenmiyor" }));
    expect(await y.json()).toEqual({ guncellenen: 2 });
    await incelemeRotasi.POST(post("/api/kayitlar/inceleme", { idler: [g[2].id], inceleme: "ilgileniyor" }));
    expect(kayitlar.kayitGetir(baska, baskaninKaydi.id)!.inceleme).toBe("incelenmedi");

    const idler = (f: Parameters<typeof kayitlar.kayitlariListele>[1]) => kayitlar.kayitlariListele(ctx, f).kayitlar.map((k) => k.id).sort();
    expect(idler({})).toEqual([g[2].id, g[3].id].sort());
    expect(idler({ inceleme: "hepsi" })).toHaveLength(4);
    expect(idler({ inceleme: "ilgilenmiyor" })).toEqual([g[0].id, g[1].id].sort());
    expect(idler({ inceleme: "incelenmedi", scanId: tarama.id })).toEqual([g[3].id]);
    expect(kayitlar.incelenmemisSayilari(ctx, [tarama.id]).get(tarama.id)).toBe(1);
    expect((await incelemeRotasi.POST(post("/api/kayitlar/inceleme", { idler: [g[0].id], inceleme: "silindi" }))).status).toBe(400);
  });

  it("'adı boş Google kayıtları' süzgeci yalnızca kendi adı girilmemiş Google kayıtlarını verir", () => {
    const ctx = kiraci();
    const g = googleKayitlari(ctx, 2).kayitlar;
    kayitlar.kayitGuncelle(ctx, g[0].id, { isletmeAdi: "Kendi Adım" });
    kayitlar.kisileriEkle(ctx, [{ kaynak: "elle", yetkiliAdi: "Adsız Elle", ekTelefon: "0532 000 00 03" }], "t");
    expect(kayitlar.kayitlariListele(ctx, { adsizGoogle: true }).kayitlar.map((k) => k.id)).toEqual([g[1].id]);
  });

  it("migration 0013: mevcut kayıtlar (Google dahil) 'ilgileniyor' olur", () => {
    const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-0013-"));
    let v: ReturnType<typeof veritabaniAc> | null = null;
    try {
      const gercek = path.join(KOK, "drizzle");
      const gunluk = JSON.parse(fs.readFileSync(path.join(gercek, "meta/_journal.json"), "utf8"));
      const once = path.join(gecici, "once");
      fs.mkdirSync(path.join(once, "meta"), { recursive: true });
      // 0013'ten önceki durum (0013 ve sonrası hariç).
      const onceki = gunluk.entries.filter((e: { tag: string }) => e.tag < "0013_");
      expect(onceki.length).toBe(13);
      for (const e of onceki) fs.copyFileSync(path.join(gercek, `${e.tag}.sql`), path.join(once, `${e.tag}.sql`));
      fs.writeFileSync(path.join(once, "meta/_journal.json"), JSON.stringify({ ...gunluk, entries: onceki }));

      v = veritabaniAc(path.join(gecici, "v.db"));
      migrasyonlariUygula(v, once);
      v.$client.prepare("insert into tenants (id, ad, slug) values ('t1', 'T', 't')").run();
      v.$client.prepare("insert into leads (id, tenant_id, kaynak, place_id) values ('l1', 't1', 'google', 'mock_x_1_1')").run();
      v.$client.prepare("insert into leads (id, tenant_id, kaynak) values ('l2', 't1', 'elle')").run();
      migrasyonlariUygula(v, gercek);
      expect(v.$client.prepare("select id, inceleme from leads order by id").all()).toEqual([
        { id: "l1", inceleme: "ilgileniyor" },
        { id: "l2", inceleme: "ilgileniyor" },
      ]);
    } finally {
      v?.$client.close();
      fs.rmSync(gecici, { recursive: true, force: true });
    }
  });
});

describe("'ilgilenmiyor' kayıt hiçbir gönderime girmez", () => {
  it("kampanya özetinde hariç nedeni; kampanyadan SONRA işaretlenirse işçi göndermez; WhatsApp listesine alınmaz", async () => {
    const ctx = kiraci();
    iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege", whatsappSablonu: "Merhaba {isletme}" });
    const [a, b, c] = kayitlar.kisileriEkle(
      ctx,
      ["0532 000 00 11", "0532 000 00 12", "0532 000 00 13"].map((t, i) => ({
        kaynak: "elle" as const,
        isletmeAdi: `K${i}`,
        eposta: `k${i}@ornek.test`,
        ekTelefon: t,
      })),
      "t",
    );
    kayitlar.incelemeAyarla(ctx, [a.id], "ilgilenmiyor");
    const girdi = { kanal: "eposta" as const, ad: "E", konu: "K", sablon: "Merhaba", filtre: {}, testModu: true };
    expect(kampanyaOzeti(ctx, girdi, OGLE)).toMatchObject({ gonderilecek: 2, haricler: { ilgilenmiyor: 1 } });

    const k = kampanyaBaslat(ctx, girdi, OGLE);
    kayitlar.incelemeAyarla(ctx, [b.id], "ilgilenmiyor"); // kampanyadan sonra
    const s = new SahteSaglayici("eposta", true);
    await isciTuru({ simdi: () => OGLE, parti: 50, saglayiciSec: () => s });
    expect(s.gonderilen.map((i) => i.alici)).toEqual(["k2@ornek.test"]);
    const m = kampanyaMesajlari(ctx, k.id).mesajlar;
    expect(m.find((x) => x.leadId === b.id)).toMatchObject({ durum: "haric", neden: "ilgilenmiyor" });

    wa.listeHazirla(ctx, {}, OGLE);
    expect(gunlukListe(ctx, "2026-10-12").map((o) => o.leadId)).toEqual([c.id]);
  });
});
