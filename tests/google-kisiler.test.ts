// Google Kişiler CSV (plan D): yeni ve eski biçim başlıktan tanınır; " ::: " çoklu değer; cep önceliği ve diğer
// telefonların nota gitmesi; dosya içi tekrar birleşir; sistem grupları atılır, etiket eşleme (yeniden adlandır / yok
// say); toplu izin; bireysel + izin + İYS beyanı yok → izin yazılmaz; engel listesine izin yazılmaz; çakışma politikası;
// dışa aktarma (biçim, BOM, +90, Places verisi yok, yalnızca yönetici, olay); gidiş-dönüş; örnek dosya; 20 000 satır.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { adresOzeti } = await import("@/server/messaging/adres");
const { engelEkle } = await import("@/server/repo/engel-listesi");
const { kayitlariListele, kisileriEkle } = await import("@/server/repo/kayitlar");
const { olaylariListele } = await import("@/server/repo/olaylar");
const { whatsappKisisiGetir } = await import("@/server/repo/whatsapp-kisileri");
const svc = await import("@/server/servisler/ice-aktarma");
const g = await import("@/server/servisler/google-kisiler");
const disaAktar = await import("@/app/api/kayitlar/disa-aktar/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");
const { kayitOlustur } = await import("./yardimci/mesaj-fabrika");

const metin = (s: string) => new TextEncoder().encode(s);
const ORNEK = readFileSync(path.join(process.cwd(), "docs", "ornek-google-kisiler.csv"));
type Secenek = import("@/server/servisler/ice-aktarma").IceAktarmaSecenekleri;
const SECENEK: Secenek = { cakisma: "atla", varsayilanAliciTuru: "tacir_esnaf", varsayilanIzinKaynagi: null, iysBeyani: false, varsayilanIzin: "yok" };

async function ornekBaslat(ctx: TenantContext) {
  return svc.iceAktarmaBaslat(ctx, "contacts.csv", new Uint8Array(ORNEK));
}

describe("Google biçimi ve ön işlem", () => {
  it("örnek dosya: yeni biçim tanınır, sütunlar eşlenir, iki satır birleşir; cep önceliği, diğer telefon nota, sistem grupları atılır", async () => {
    const { ctx } = kiraciOlustur("GoogleOrnek");
    const o = await ornekBaslat(ctx);
    expect(o).toMatchObject({ bicim: "google", googleBicimi: "yeni", dosyaSatiri: 14, toplam: 12, birlesen: 2 });
    expect(o.basliklar).toEqual([...g.GOOGLE_SUTUNLARI]);
    expect(o.onerilenEslem).toEqual(g.GOOGLE_ESLEMI);
    expect(o.googleEtiketleri).toEqual(["bursa", "esnaf", "müşteri", "toptancı", "vıp"]);
    const satir = (ad: string) => o.ornek.find((s) => s[1] === ad)!;
    // Ayşe (satır 2) + 0090 ile yazılmış aynı numara (satır 4): etiketler birleşti, not eklendi, şirket ilk dolu değer.
    expect(satir("Ayşe Kaya")).toEqual(["Kaya Kırtasiye (Sahte)", "Ayşe Kaya", "+90 500 000 00 01", "ayse.kaya@ornek.test", "esnaf, bursa, toptancı", "Fuarda tanıştık (sahte)", "2, 4"]);
    // Mobile etiketli cep, önce yazılmış sabit hatta tercih edilir; sabit hat nota.
    expect(satir("Mehmet Demir").slice(0, 3)).toEqual(["Mehmet Demir", "Mehmet Demir", "+90 500 000 00 02"]);
    expect(satir("Mehmet Demir")[5]).toBe("Diğer telefonlar: +90 224 000 00 02");
    // " ::: " ile iki numara tek hücrede: ilki telefon, ikincisi nota.
    expect(satir("Can Er")[2]).toBe("+90 500 000 00 07");
    expect(satir("Can Er")[5]).toBe("Diğer telefonlar: +90 500 000 00 08");
    // Şirket adı olan ama adı olmayan kişi.
    expect(o.ornek.find((s) => s[0] === "Örnek Fırın (Sahte)")?.[1]).toBe("");
    // Çok satırlı not + birleşme (satır 11 ve 15).
    expect(satir("Deniz Yıldız").slice(4)).toEqual(["esnaf, vıp", "Çok satır\nnot (sahte)", "11, 15"]);

    const r = svc.iceAktarmaOnizle(ctx, o.id, o.onerilenEslem, SECENEK);
    expect(r).toMatchObject({ bicim: "google", birlesen: 2, toplam: 12, gecerli: 9, yeni: 9, hatali: 3, cakisan: 0, izinli: 0, uyari: 0 });
    expect(r.sorunlar.map((s) => s.neden).sort()).toEqual(["Telefon numarası tanınmadı", "Telefon veya e-posta yok", "Yurt dışı numara (yalnızca Türkiye numaraları)"]);

    // Sorunlu satırlar CSV'si dönüşmüş hücreleri ve özgün dosya satırını içerir.
    const csv = svc.sorunluSatirlarCsv(ctx, o.id, o.onerilenEslem, SECENEK);
    expect(csv).toContain("Yurt dışı numara");
    expect(csv).toContain("+49 30 1234567");
    expect(csv).toContain("Dosya satırı");
  });

  it("eski biçim (Name, Given Name, Group Membership, Phone 1 - Type) tanınır", async () => {
    const { ctx } = kiraciOlustur("GoogleEski");
    const csv = [
      "Name,Given Name,Additional Name,Family Name,Group Membership,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value,Phone 2 - Type,Phone 2 - Value,Organization 1 - Name",
      "Hakan Öz,Hakan,,Öz,* My Contacts ::: Esnaf,,hakan@ornek.test,Work,0224 000 00 20,Mobile,0500 000 00 20,Öz Ticaret",
      ",Nur,,Sel,* My Contacts,,,Mobile,0500 000 00 21,,,",
    ].join("\n");
    expect(g.googleBicimi(csv.split("\n")[0].split(","))).toBe("eski");
    const o = await svc.iceAktarmaBaslat(ctx, "eski.csv", metin(csv));
    expect(o).toMatchObject({ bicim: "google", googleBicimi: "eski", toplam: 2, googleEtiketleri: ["esnaf"] });
    expect(o.ornek[0].slice(0, 6)).toEqual(["Öz Ticaret", "Hakan Öz", "+90 500 000 00 20", "hakan@ornek.test", "esnaf", "Diğer telefonlar: +90 224 000 00 20"]);
    expect(o.ornek[1].slice(0, 3)).toEqual(["Nur Sel", "Nur Sel", "+90 500 000 00 21"]);
  });

  it("genel dosya Google sayılmaz; sütun sınırı yalnızca Google'da geniş", async () => {
    expect(g.googleBicimi(["Ad", "Telefon"])).toBeNull();
    expect(g.googleBicimi(["First Name", "Last Name", "Phone 1 - Value", "Labels"])).toBe("yeni");
    const genis = (b: string[]) => `${b.join(",")}\n${b.map(() => "x").join(",")}`;
    const fazla = Array.from({ length: 60 }, (_, i) => `S${i}`);
    await expect(svc.dosyaAyristir("a.csv", metin(genis(fazla)))).rejects.toThrow(/50 sütun/);
    const googleGenis = ["First Name", "Last Name", "Labels", "Phone 1 - Value", ...fazla];
    expect(await svc.dosyaAyristir("a.csv", metin(genis(googleGenis)))).toHaveLength(2);
  });
});

describe("Google içe aktarma kuralları", () => {
  it("etiket eşleme: yeniden adlandırma ve yok sayma; tamamlanınca kayıtlara yazılır; çakışmada 'atla'", async () => {
    const { ctx } = kiraciOlustur("GoogleEtiket");
    kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: "0500 000 00 06", isletmeAdi: "Mevcut Fırın", aliciTuru: "tacir_esnaf" }], "elle");
    const o = await ornekBaslat(ctx);
    const s: Secenek = { ...SECENEK, etiketEslemi: { esnaf: "Bursa Esnafı", "vıp": null } };
    const r = svc.iceAktarmaTamamla(ctx, o.id, o.onerilenEslem, s, false);
    expect(r).toMatchObject({ yeni: 8, cakisan: 1, eklenen: 8, hatali: 3 });
    const kayitlar = kayitlariListele(ctx, { grup: "tum" }).kayitlar;
    const bul = (tel: string) => kayitlar.find((k) => k.telefonE164 === tel)!;
    expect(bul("905000000001").etiketler.sort()).toEqual(["bursa", "bursa esnafı", "toptancı"]);
    expect(bul("905000000010").etiketler).toEqual(["bursa esnafı"]);
    expect(bul("905000000001")).toMatchObject({ kaynak: "ice_aktarma", isletmeAdi: "Kaya Kırtasiye (Sahte)", yetkiliAdi: "Ayşe Kaya", eposta: "ayse.kaya@ornek.test" });
    expect(bul("905000000002").notlar).toBe("Diğer telefonlar: +90 224 000 00 02");
    expect(bul("905000000006").isletmeAdi).toBe("Mevcut Fırın"); // atla: dokunulmadı
  });

  it("toplu izin: bireysel + izin var + İYS beyanı yok → izin yazılmaz (uyarı); beyanla yazılır; tacirde beyan aranmaz; kaynaksız toplu izin reddedilir", async () => {
    const { ctx } = kiraciOlustur("GoogleIzin");
    const o = await ornekBaslat(ctx);
    expect(() => svc.iceAktarmaOnizle(ctx, o.id, o.onerilenEslem, { ...SECENEK, varsayilanIzin: "var" })).toThrow(/izin kaynağını/);

    const bireysel: Secenek = { ...SECENEK, varsayilanAliciTuru: "bireysel", varsayilanIzin: "var", varsayilanIzinKaynagi: "form" };
    const r = svc.iceAktarmaOnizle(ctx, o.id, o.onerilenEslem, bireysel);
    expect(r).toMatchObject({ yeni: 9, izinli: 0, uyari: 9, beyanGerekli: false });
    expect(r.uyarilar[0].neden).toMatch(/İYS beyanı gerekli/);
    expect(svc.sorunluSatirlarCsv(ctx, o.id, o.onerilenEslem, bireysel)).toContain("Uyarı: İYS beyanı gerekli");
    svc.iceAktarmaTamamla(ctx, o.id, o.onerilenEslem, bireysel, false);
    const k = kayitlariListele(ctx, { grup: "tum" }).kayitlar.find((x) => x.telefonE164 === "905000000001")!;
    expect(k.aliciTuru).toBe("bireysel");
    expect(whatsappKisisiGetir(ctx, k.id)?.izin ?? "yok").toBe("yok");

    // İYS beyanıyla: izin ve beyan yazılır, beyan onayı zorunlu.
    const { ctx: ctx2 } = kiraciOlustur("GoogleIzin2");
    const o2 = await ornekBaslat(ctx2);
    const beyanli = { ...bireysel, iysBeyani: true };
    expect(svc.iceAktarmaOnizle(ctx2, o2.id, o2.onerilenEslem, beyanli)).toMatchObject({ izinli: 9, uyari: 0, beyanGerekli: true });
    expect(() => svc.iceAktarmaTamamla(ctx2, o2.id, o2.onerilenEslem, beyanli, false)).toThrow(/beyan/);
    svc.iceAktarmaTamamla(ctx2, o2.id, o2.onerilenEslem, beyanli, true);
    const k2 = kayitlariListele(ctx2, { grup: "tum" }).kayitlar.find((x) => x.telefonE164 === "905000000001")!;
    expect(whatsappKisisiGetir(ctx2, k2.id)).toMatchObject({ izin: "var", izinKaynagi: "form" });
    expect(whatsappKisisiGetir(ctx2, k2.id)?.iysBeyanTarihi).not.toBeNull();

    // Tacir/esnaf: İYS beyanı aranmaz.
    const { ctx: ctx3 } = kiraciOlustur("GoogleIzin3");
    const o3 = await ornekBaslat(ctx3);
    expect(svc.iceAktarmaOnizle(ctx3, o3.id, o3.onerilenEslem, { ...bireysel, varsayilanAliciTuru: "tacir_esnaf" })).toMatchObject({ izinli: 9, uyari: 0 });
  });

  it("engel listesindeki numaraya izin yazılmaz; kişi eklenir ve satır uyarıyla raporlanır", async () => {
    const { ctx } = kiraciOlustur("GoogleEngel");
    engelEkle(ctx, [{ tur: "telefon", ozet: adresOzeti(ctx.tenantId, "telefon", "905000000010") }], "abonelik");
    const o = await ornekBaslat(ctx);
    const s: Secenek = { ...SECENEK, varsayilanIzin: "var", varsayilanIzinKaynagi: "sozlesme" };
    const r = svc.iceAktarmaOnizle(ctx, o.id, o.onerilenEslem, s);
    expect(r).toMatchObject({ engelli: 1, izinli: 8, uyari: 1 });
    expect(r.uyarilar[0].neden).toMatch(/Engel listesinde/);
    svc.iceAktarmaTamamla(ctx, o.id, o.onerilenEslem, s, true);
    const k = kayitlariListele(ctx, { grup: "tum" }).kayitlar.find((x) => x.telefonE164 === "905000000010")!;
    expect(whatsappKisisiGetir(ctx, k.id)?.izin ?? "yok").toBe("yok");
  });
});

describe("Google Kişiler dışa aktarma", () => {
  const istek = (q = "bicim=google") => new Request(`https://crm.ornek.test/api/kayitlar/disa-aktar?${q}`);

  it("yeni biçim, sütun sırası, BOM, +90, etiketler; Places verisi yok; yalnızca yönetici; olay yazılır; gidiş-dönüş 0 yeni", async () => {
    const { ctx } = kiraciOlustur("GoogleDisa");
    const [ayse, sabit] = kisileriEkle(
      ctx,
      [
        { kaynak: "elle", yetkiliAdi: "Ayşe Nur Kaya", isletmeAdi: "Kaya Kırtasiye", ekTelefon: "0500 000 00 31", eposta: "a@ornek.test", etiketler: ["esnaf", "bursa"], notlar: "=1+1 formül değil", aliciTuru: "tacir_esnaf" },
        { kaynak: "elle", isletmeAdi: "Gül Matbaa", ekTelefon: "0224 000 00 32", aliciTuru: "tacir_esnaf" },
      ],
      "elle",
    );
    // Google kaynaklı kayıt: kullanıcı adı ve telefonu girmişse yalnızca o çıkar; place_id hiçbir yerde yok.
    kayitOlustur(ctx, { isletmeAdi: "Benim Adım", ekTelefon: "0500 000 00 33" }, "places-GIZLI-KIMLIK");
    kayitOlustur(ctx, {}, "places-BOS-KAYIT"); // kullanıcı verisi yok: satır çıkmaz

    oturum.ctx = ctx;
    const y = await disaAktar.GET(istek());
    expect(y.status).toBe(200);
    expect(y.headers.get("content-disposition")).toMatch(/google-kisiler/);
    const bayt = new Uint8Array(await y.arrayBuffer());
    expect([...bayt.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const govde = new TextDecoder().decode(bayt); // BOM'u atar
    const satirlar = govde.trimEnd().split("\r\n");
    expect(satirlar[0]).toBe("First Name,Last Name,Organization Name,Phone 1 - Label,Phone 1 - Value,E-mail 1 - Value,Labels,Notes");
    expect(satirlar).toHaveLength(4);
    expect(satirlar).toContain("Ayşe Nur,Kaya,Kaya Kırtasiye,Mobile,+90 500 000 00 31,a@ornek.test,* myContacts ::: esnaf ::: bursa,'=1+1 formül değil");
    expect(satirlar).toContain(",,Gül Matbaa,Work,+90 224 000 00 32,,* myContacts,");
    expect(satirlar).toContain(",,Benim Adım,Mobile,+90 500 000 00 33,,* myContacts,");
    expect(govde).not.toContain("places-");
    expect(olaylariListele(ctx, ayse.id).some((o) => o.aciklama === "Google Kişiler CSV olarak dışa aktarıldı")).toBe(true);
    expect(olaylariListele(ctx, sabit.id).find((o) => o.aciklama === "Google Kişiler CSV olarak dışa aktarıldı")?.kullaniciId).toBe(ctx.userId);

    // Üye: 403; genel dışa aktarma üyeye açık kalır.
    const uye = (await import("@/server/repo/baglam"))._baglamDamgala({ tenantId: ctx.tenantId, userId: ctx.userId, rol: "uye" });
    oturum.ctx = uye;
    expect((await disaAktar.GET(istek())).status).toBe(403);
    expect((await disaAktar.GET(istek(""))).status).toBe(200);
    oturum.ctx = null;
    expect((await disaAktar.GET(istek())).status).toBe(401);

    // Gidiş-dönüş: dışa aktarılan dosya yeniden içe aktarılınca 0 yeni, hepsi çakışan (atla).
    const o = await svc.iceAktarmaBaslat(ctx, "geri.csv", metin(govde));
    expect(o).toMatchObject({ bicim: "google", toplam: 3 });
    const r = svc.iceAktarmaTamamla(ctx, o.id, o.onerilenEslem, SECENEK, false);
    expect(r).toMatchObject({ yeni: 0, cakisan: 3, eklenen: 0, hatali: 0 });
  });
});

describe("sınırlar ve süre", () => {
  it("20 000 satır sınırı; 20 000 satırlık Google dosyası önizlenip içe aktarılır (süre ölçülür)", async () => {
    const baslik = "First Name,Last Name,Organization Name,Labels,Phone 1 - Label,Phone 1 - Value";
    const satir = (i: number) => `Kişi,${i},Firma ${i},* myContacts ::: Etiket${i % 7},Mobile,0533 ${String(i).padStart(7, "0").replace(/(\d{3})(\d{2})(\d{2})/, "$1 $2 $3")}`;
    const fazla = [baslik, ...Array.from({ length: 20_001 }, (_, i) => satir(i))].join("\n");
    await expect(svc.dosyaAyristir("a.csv", metin(fazla))).rejects.toThrow(/20\.000/);

    const { ctx } = kiraciOlustur("GoogleBuyuk");
    const tam = [baslik, ...Array.from({ length: 20_000 }, (_, i) => satir(i))].join("\n");
    // Bütçe bu sürecin CPU süresiyle ölçülür: duvar saati paralel test işçileri ve makinedeki diğer işler yüzünden
    // şişer (yük altında 13 sn'lik iş 30 sn'yi aşıyordu); CPU süresi işin kendi maliyetidir.
    const bas = performance.now();
    const cpuBas = process.cpuUsage();
    const o = await svc.iceAktarmaBaslat(ctx, "buyuk.csv", metin(tam));
    const r = svc.iceAktarmaTamamla(ctx, o.id, o.onerilenEslem, SECENEK, false);
    const cpu = process.cpuUsage(cpuBas);
    const cpuSure = (cpu.user + cpu.system) / 1000;
    const sure = performance.now() - bas;
    expect(r).toMatchObject({ toplam: 20_000, yeni: 20_000, eklenen: 20_000, hatali: 0 });
    expect((db.$client.prepare("select count(*) n from leads where tenant_id = ?").get(ctx.tenantId) as { n: number }).n).toBe(20_000);
    console.info(`20 000 satır Google içe aktarma: ${Math.round(sure)} ms (CPU ${Math.round(cpuSure)} ms)`);
    expect(cpuSure).toBeLessThan(30_000);
  }, 120_000);
});
