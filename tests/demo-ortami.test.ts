// Elle deneme ortamı: npm run demo:hazirla yalnızca ./data/demo.db'yi (her seferinde sıfırdan) kurar, başka
// veritabanına dokunmaz, yazdırdığı giriş bilgileri çalışır; docs/ornek-ice-aktarma.csv rehberde yazan sonucu verir.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { verifyPassword } from "better-auth/crypto";
import { describe, expect, it } from "vitest";

const KOK = path.resolve(__dirname, "..");
const { kiraciOlustur } = await import("./yardimci/fabrika");
const { kayitGuncelle, kisileriEkle } = await import("@/server/repo/kayitlar");
const svc = await import("@/server/servisler/ice-aktarma");

describe("npm run demo:hazirla", () => {
  // Betik, depodaki bir kopyayı değil gerçek betiği çalıştırır; çalışma klasörü geçici olduğundan ./data/ de geçicidir.
  const klasor = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-demo-"));
  const veri = path.join(klasor, "data");
  const hazirla = () =>
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        pathToFileURL(path.join(KOK, "node_modules", "tsx", "dist", "loader.mjs")).href,
        path.join(KOK, "scripts", "demo-hazirla.ts"),
      ],
      {
        cwd: klasor,
        // Testin kendi DATABASE_PATH'i ve anahtarları demo betiğine sızmamalı: betik kendi değerlerini kullanır.
        env: { ...process.env, TSX_TSCONFIG_PATH: path.join(KOK, "tsconfig.json") },
        encoding: "utf8",
      },
    );
  const ozet = (dosya: string) => crypto.createHash("sha1").update(fs.readFileSync(dosya)).digest("hex");
  const sorgu = <T>(sql: string) => {
    const d = new Database(path.join(veri, "demo.db"), { readonly: true });
    try {
      return d.prepare(sql).all() as T[];
    } finally {
      d.close();
    }
  };

  it("demo.db'yi kurar, başka veritabanına dokunmaz, her çalıştırmada sıfırdan kurar", async () => {
    // Aynı klasörde "gerçek" veritabanı ve testin kendi veritabanı.
    fs.mkdirSync(veri);
    const gercek = path.join(veri, "app.db");
    const g = new Database(gercek);
    g.exec("create table t (x); insert into t values (1);");
    g.close();
    const gercekOzet = ozet(gercek);
    const testOzet = ozet(process.env.DATABASE_PATH!);

    const cikti = hazirla();
    expect(ozet(gercek)).toBe(gercekOzet);
    expect(ozet(process.env.DATABASE_PATH!)).toBe(testOzet);
    expect(fs.readdirSync(veri).sort()).toEqual(["app.db", "demo.db"]); // -wal/-shm kalmaz, yedek alınmaz

    // Giriş bilgileri ekrana yazılır ve Better Auth'un parola özetiyle eşleşir.
    const hesaplar = [...cikti.matchAll(/(\S+@demo\.test)\s+parola: (\S+)/g)].map((m) => ({ eposta: m[1], parola: m[2] }));
    expect(hesaplar.map((h) => h.eposta)).toEqual(["yonetici@demo.test", "uye@demo.test"]);
    const kullanicilar = sorgu<{ email: string; password: string; rol: string }>(
      `select u.email, a.password, m.rol from user u join account a on a.user_id = u.id and a.provider_id = 'credential'
       join memberships m on m.user_id = u.id order by m.rol`,
    );
    expect(kullanicilar.map((k) => [k.email, k.rol])).toEqual([
      ["uye@demo.test", "uye"],
      ["yonetici@demo.test", "yonetici"],
    ]);
    for (const h of hesaplar) {
      const k = kullanicilar.find((x) => x.email === h.eposta)!;
      expect(await verifyPassword({ hash: k.password, password: h.parola })).toBe(true);
    }

    // Kayıtlar: dört kaynak, farklı durum ve izinler; Google kaynaklılar sahte place_id ile.
    const kayitlar = sorgu<{ kaynak: string; place_id: string | null; durum: string; ileti_izni: string; alici_turu: string }>(
      "select kaynak, place_id, durum, ileti_izni, alici_turu from leads",
    );
    expect(new Set(kayitlar.map((k) => k.kaynak))).toEqual(new Set(["google", "elle", "ice_aktarma", "meta_reklam"]));
    expect(kayitlar.filter((k) => k.kaynak === "google").every((k) => k.place_id?.startsWith("mock_"))).toBe(true);
    expect(new Set(kayitlar.map((k) => k.durum))).toEqual(new Set(["yeni", "iletisimde", "gorusme", "kazanildi", "ilgilenmiyor"]));
    expect(new Set(kayitlar.map((k) => k.ileti_izni))).toEqual(new Set(["bekliyor", "onayli", "ret"]));
    expect(new Set(kayitlar.map((k) => k.alici_turu))).toEqual(new Set(["tacir_esnaf", "bireysel"]));

    // Ret verilmiş kayıt: adresleri engel listesinde, WhatsApp izni 'ret'.
    expect(sorgu<{ tur: string }>("select tur from engel_listesi order by tur").map((e) => e.tur)).toEqual(["eposta", "telefon"]);
    expect(sorgu<{ izin: string }>("select izin from whatsapp_kisileri").map((k) => k.izin).sort()).toEqual(["ret", "var", "var", "var", "var"]);

    // Sahte WhatsApp bağlantısı (test modunda, numara doğrulanmış) ve şablonlar.
    expect(sorgu("select test_modu, numara_dogrulama_tarihi is not null as d from whatsapp_baglantilari")).toEqual([{ test_modu: 1, d: 1 }]);
    expect(sorgu<{ ad: string }>("select ad from whatsapp_sablonlari order by ad").map((s) => s.ad)).toEqual([
      "butonsuz_pazarlama",
      "kampanya_tanitim",
      "randevu_hatirlatma",
    ]);

    // Gerçek kişi verisi yok: bütün e-postalar .test alan adında, bütün elle girilen numaralar 0500 000 00 xx / 0212 000 00 xx.
    const adresler = sorgu<{ eposta: string | null; ek_telefon: string | null }>("select eposta, ek_telefon from leads");
    expect(adresler.every((a) => a.eposta === null || a.eposta.endsWith("@demo.test"))).toBe(true);
    expect(adresler.every((a) => a.ek_telefon === null || /^0(500|212) 000 00 \d\d$/.test(a.ek_telefon))).toBe(true);

    // İkinci çalıştırma: veriler eklenmez, sıfırdan kurulur.
    const ilkKayit = kayitlar.length;
    hazirla();
    expect(sorgu<{ n: number }>("select count(*) as n from leads")[0].n).toBe(ilkKayit);
    expect(sorgu<{ n: number }>("select count(*) as n from user")[0].n).toBe(2);
    expect(ozet(gercek)).toBe(gercekOzet);
    fs.rmSync(klasor, { recursive: true, force: true });
  }, 120_000);
});

describe("docs/ornek-ice-aktarma.csv", () => {
  it("rehberdeki sonucu verir: 12 satır, 6 hatalı, 1 çakışma, 1 engelli, 1 izinli, 5 yeni", async () => {
    const { ctx } = kiraciOlustur("Ornek");
    // Demo verisindeki iki kayıt: çakışan fırın ve ret vermiş işletme.
    const [, retli] = kisileriEkle(
      ctx,
      [
        { kaynak: "elle", isletmeAdi: "Sahte Fırın", ekTelefon: "0500 000 00 02" },
        { kaynak: "elle", isletmeAdi: "Ret Vermiş Örnek İşletme", eposta: "ret.ornek@demo.test", ekTelefon: "0500 000 00 09" },
      ],
      "test",
    );
    kayitGuncelle(ctx, retli.id, { iletiIzni: "ret" });

    const dosya = fs.readFileSync(path.join(KOK, "docs", "ornek-ice-aktarma.csv"));
    const oturum = await svc.iceAktarmaBaslat(ctx, "ornek-ice-aktarma.csv", new Uint8Array(dosya));
    // Başlıklardan otomatik eşleme: bütün sütunlar doğru alana.
    expect(oturum.onerilenEslem).toEqual({
      isletmeAdi: 0,
      yetkiliAdi: 1,
      telefon: 2,
      eposta: 3,
      etiketler: 4,
      aliciTuru: 5,
      whatsappIzni: 6,
      izinTarihi: 7,
      izinKaynagi: 8,
      not: 9,
    });
    const rapor = svc.iceAktarmaOnizle(ctx, oturum.id, oturum.onerilenEslem, {
      cakisma: "atla",
      varsayilanAliciTuru: "tacir_esnaf",
      varsayilanIzinKaynagi: null,
      iysBeyani: false,
    });
    expect(rapor).toMatchObject({ toplam: 12, gecerli: 6, hatali: 6, cakisan: 1, engelli: 1, izinli: 1, retli: 0, yeni: 5, beyanGerekli: true });
    expect(rapor.sorunlar).toEqual([
      { satir: 8, neden: "Telefon numarası tanınmadı" },
      { satir: 9, neden: "E-posta adresi geçersiz" },
      { satir: 10, neden: "Telefon veya e-posta yok" },
      { satir: 11, neden: "WhatsApp izni anlaşılamadı (var / yok / ret)" },
      { satir: 12, neden: "İzin tarihi geçersiz (GG.AA.YYYY ya da YYYY-AA-GG)" },
      { satir: 13, neden: "Dosyada tekrar (satır 2)" },
    ]);
  });
});
