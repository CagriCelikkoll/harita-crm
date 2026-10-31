// Kişi içe aktarma: ayrıştırma (CSV / XLSX, kodlama, sınırlar), satır doğrulama ve telefon normalleştirme,
// dosya içi tekrar, mevcut kayıtla çakışma (atla / boş alanları doldur), engel listesi, izin ve beyan zorunluluğu
// (sunucu tarafında), İYS beyanı, ret satırları, oturumun tek kez uygulanması ve süresi.
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/server/repo/baglam";

const oturum = vi.hoisted(() => ({ ctx: null as TenantContext | null }));
vi.mock("@/server/oturum", () => ({ apiBaglami: async () => oturum.ctx }));

const { db } = await import("@/server/db");
const { adresOzeti } = await import("@/server/messaging/adres");
const { engelEkle } = await import("@/server/repo/engel-listesi");
const { iceAktarmaGetir } = await import("@/server/repo/ice-aktarmalar");
const { kayitGetir, kayitlariListele, kisileriEkle } = await import("@/server/repo/kayitlar");
const { whatsappIzniAyarla, whatsappKisisiGetir } = await import("@/server/repo/whatsapp-kisileri");
const { retIsle } = await import("@/server/repo/engel-listesi");
const svc = await import("@/server/servisler/ice-aktarma");
const yuklemeRotasi = await import("@/app/api/ice-aktarma/route");
const tamamlaRotasi = await import("@/app/api/ice-aktarma/[id]/tamamla/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const metin = (s: string) => new TextEncoder().encode(s);
const SECENEK: import("@/server/servisler/ice-aktarma").IceAktarmaSecenekleri = {
  cakisma: "atla",
  varsayilanAliciTuru: "tacir_esnaf",
  varsayilanIzinKaynagi: null,
  iysBeyani: false,
};
const ESLEM = { yetkiliAdi: 0, telefon: 1, eposta: 2, whatsappIzni: 3, izinKaynagi: 4, aliciTuru: 5 };
const BASLIK = "Ad Soyad;Telefon;E-posta;WhatsApp izni;İzin kaynağı;Tür";

async function baslat(ctx: TenantContext, csv: string) {
  return svc.iceAktarmaBaslat(ctx, "liste.csv", metin(csv));
}

describe("dosya ayrıştırma", () => {
  it("CSV: ayırıcı (;) ve BOM otomatik; Windows-1254 kodlaması çözülür", async () => {
    expect(await svc.dosyaAyristir("a.csv", metin("﻿Ad;Telefon\nAyşe;0532 111 22 33\n"))).toEqual([
      ["Ad", "Telefon"],
      ["Ayşe", "0532 111 22 33"],
    ]);
    // "Şükrü" Windows-1254: Ş=0xDE ü=0xFC
    const bayt = new Uint8Array([0x41, 0x64, 0x2c, 0x54, 0x0a, 0xde, 0xfc, 0x6b, 0x72, 0xfc, 0x2c, 0x31, 0x0a]);
    expect((await svc.dosyaAyristir("a.csv", bayt))[1][0]).toBe("Şükrü");
  });

  it("XLSX: ilk sayfa, sayılar ve tarihler metne çevrilir", async () => {
    const kitap = new ExcelJS.Workbook();
    const sayfa = kitap.addWorksheet("Kişiler");
    sayfa.addRow(["Ad", "Telefon", "İzin tarihi"]);
    sayfa.addRow(["Ali", 5321112233, new Date("2026-09-01T00:00:00Z")]);
    const bayt = new Uint8Array(await kitap.xlsx.writeBuffer());
    expect(await svc.dosyaAyristir("a.xlsx", bayt)).toEqual([
      ["Ad", "Telefon", "İzin tarihi"],
      ["Ali", "5321112233", "2026-09-01"],
    ]);
  });

  it("sınırlar: boş, yalnızca başlık, .xls, 5.000 satırdan fazla", async () => {
    await expect(svc.dosyaAyristir("a.csv", new Uint8Array())).rejects.toThrow(/boş/);
    await expect(svc.dosyaAyristir("a.csv", metin("Ad;Telefon\n"))).rejects.toThrow(/veri yok/);
    await expect(svc.dosyaAyristir("a.xls", metin("x"))).rejects.toThrow(/xlsx/);
    const cok = ["Telefon", ...Array.from({ length: 5001 }, (_, i) => `0532${String(i).padStart(7, "0")}`)].join("\n");
    await expect(svc.dosyaAyristir("a.csv", metin(cok))).rejects.toThrow(/5\.000/);
    const tam = ["Telefon", ...Array.from({ length: 5000 }, (_, i) => `0532${String(i).padStart(7, "0")}`)].join("\n");
    expect(await svc.dosyaAyristir("a.csv", metin(tam))).toHaveLength(5001);
  });

  it("başlıktan sütun eşlemesi önerilir", async () => {
    const { ctx } = kiraciOlustur("Oneri");
    const o = await baslat(ctx, `${BASLIK}\nAli;05321112233;;var;form;bireysel\n`);
    expect(o.onerilenEslem).toMatchObject({ yetkiliAdi: 0, telefon: 1, eposta: 2, whatsappIzni: 3, izinKaynagi: 4 });
    expect(o.toplam).toBe(1);
  });
});

describe("önizleme ve doğrulama", () => {
  it("normalleştirme, hatalı satır nedenleri, dosya içi tekrar, çakışma, engel; hiçbir şey yazılmaz", async () => {
    const { ctx } = kiraciOlustur("Onizle");
    const [mevcut] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: "0533 000 00 01" }], "x");
    engelEkle(ctx, [{ tur: "telefon", ozet: adresOzeti(ctx.tenantId, "telefon", "905330000002") }], "abonelik");
    const csv = [
      BASLIK,
      "Ayşe;+90 (532) 111 22 33;;var;form;bireysel", // 2: geçerli, izinli
      "Bora;12345;;yok;;", // 3: telefon tanınmadı
      "Cem;;yanlis-eposta;;;", // 4: e-posta geçersiz
      "Can;;;;;", // 5: telefon/e-posta yok
      "Deniz;0532 111 22 33;;yok;;", // 6: dosyada tekrar (satır 2)
      "Ece;0533 000 00 01;;yok;;", // 7: mevcut kayıtla çakışma
      "Fatih;0533 000 00 02;;yok;;", // 8: engel listesinde
      "Gül;0534 000 00 03;;belki;;", // 9: izin anlaşılamadı
      "Hale;0534 000 00 04;;var;;", // 10: izin kaynağı yok
      "İpek;0534 000 00 05;;ret;;", // 11: ret
    ].join("\n");
    const o = await baslat(ctx, csv);
    const rapor = svc.iceAktarmaOnizle(ctx, o.id, ESLEM, SECENEK);
    expect(rapor).toMatchObject({ toplam: 10, gecerli: 4, yeni: 3, cakisan: 1, engelli: 1, izinli: 1, retli: 1, hatali: 6 });
    expect(rapor.beyanGerekli).toBe(true);
    expect(rapor.sorunlar).toEqual([
      { satir: 3, neden: "Telefon numarası tanınmadı" },
      { satir: 4, neden: "E-posta adresi geçersiz" },
      { satir: 5, neden: "Telefon veya e-posta yok" },
      { satir: 6, neden: "Dosyada tekrar (satır 2)" },
      { satir: 9, neden: "WhatsApp izni anlaşılamadı (var / yok / ret)" },
      { satir: 10, neden: "İzin kaynağı yok" },
    ]);
    expect(kayitlariListele(ctx).toplam).toBe(1); // yalnızca mevcut kayıt
    expect(kayitGetir(ctx, mevcut.id)?.yetkiliAdi).toBeNull();
    // Sorunlu satırlar CSV'si
    const csvCikti = svc.sorunluSatirlarCsv(ctx, o.id, ESLEM, SECENEK);
    expect(csvCikti.startsWith("\uFEFFSatır;Sorun;")).toBe(true); // UTF-8 BOM + noktalı virgül (Türkçe Excel)
    expect(csvCikti.split("\r\n")[1]).toBe("3;Telefon numarası tanınmadı;Bora;12345;;yok;;");
  });

  it("eşleme: telefon ya da e-posta zorunlu; aynı sütun iki alana eşlenemez", async () => {
    const { ctx } = kiraciOlustur("Eslem");
    const o = await baslat(ctx, `${BASLIK}\nAli;05321112233;;;;\n`);
    expect(() => svc.iceAktarmaOnizle(ctx, o.id, { yetkiliAdi: 0 }, SECENEK)).toThrow(/Telefon ya da e-posta/);
    expect(() => svc.iceAktarmaOnizle(ctx, o.id, { yetkiliAdi: 1, telefon: 1 }, SECENEK)).toThrow(/yalnızca bir alana/);
  });
});

describe("uygulama", () => {
  it("izinli satır varken beyan onayı olmadan içe aktarılamaz; onayla eklenir ve iz kalır", async () => {
    const { ctx } = kiraciOlustur("Beyan");
    const o = await baslat(ctx, `${BASLIK}\nAyşe;0532 111 22 33;a@ornek.test;var;sözleşme;bireysel\nBora;0532 111 22 34;;;;\n`);
    expect(() => svc.iceAktarmaTamamla(ctx, o.id, ESLEM, SECENEK, false)).toThrow(/beyan/);
    expect(kayitlariListele(ctx).toplam).toBe(0);

    const sonuc = svc.iceAktarmaTamamla(ctx, o.id, ESLEM, { ...SECENEK, iysBeyani: true }, true);
    expect(sonuc).toMatchObject({ eklenen: 2, izinli: 1 });
    const kayitlar = kayitlariListele(ctx, { kaynak: "ice_aktarma" }).kayitlar;
    const ayse = kayitlar.find((k) => k.yetkiliAdi === "Ayşe")!;
    expect(ayse).toMatchObject({ telefonE164: "905321112233", eposta: "a@ornek.test", aliciTuru: "bireysel", placeId: null });
    expect(whatsappKisisiGetir(ctx, ayse.id)).toMatchObject({ izin: "var", izinKaynagi: "sozlesme", izinIceAktarmaId: o.id });
    expect(whatsappKisisiGetir(ctx, ayse.id)?.iysBeyanTarihi).toBeInstanceOf(Date);
    const bora = kayitlar.find((k) => k.yetkiliAdi === "Bora")!;
    expect(bora.aliciTuru).toBe("tacir_esnaf");
    expect(whatsappKisisiGetir(ctx, bora.id)).toBeNull(); // izin yok
    const iz = iceAktarmaGetir(ctx, o.id)!;
    expect(iz).toMatchObject({ durum: "tamamlandi", satirlar: null, eklenen: 2 });
    expect(iz.beyanOnayTarihi).toBeInstanceOf(Date);

    // Aynı oturum ikinci kez uygulanamaz.
    expect(() => svc.iceAktarmaTamamla(ctx, o.id, ESLEM, SECENEK, true)).toThrow(/bulunamadı|tamamlanmış/);
  });

  it("İYS beyanı yalnızca bireysel kişilere işlenir", async () => {
    const { ctx } = kiraciOlustur("Iys");
    const o = await baslat(ctx, `${BASLIK}\nAli;0532 111 22 33;;var;form;kurumsal\n`);
    svc.iceAktarmaTamamla(ctx, o.id, ESLEM, { ...SECENEK, iysBeyani: true }, true);
    const k = kayitlariListele(ctx).kayitlar[0];
    expect(whatsappKisisiGetir(ctx, k.id)?.iysBeyanTarihi).toBeNull();
  });

  it("çakışma: 'atla' dokunmaz; 'boş alanları doldur' yalnızca boşları ve 'yok' izni doldurur, ret'e dokunmaz", async () => {
    const { ctx } = kiraciOlustur("Cakisma");
    const [dolu, bos, retli] = kisileriEkle(
      ctx,
      [
        { kaynak: "elle", ekTelefon: "0532 000 00 01", yetkiliAdi: "Eski Ad" },
        { kaynak: "elle", ekTelefon: "0532 000 00 02" },
        { kaynak: "elle", ekTelefon: "0532 000 00 03" },
      ],
      "x",
    );
    whatsappIzniAyarla(ctx, retli.id, { izin: "var", kaynak: "form" });
    retIsle(ctx, { leadId: retli.id, adresler: [], kaynak: "kayit_ret", aciklama: "x" });
    const csv = `${BASLIK}\nYeni Ad;0532 000 00 01;d@ornek.test;var;form;\nB;0532 000 00 02;;var;form;\nR;0532 000 00 03;;var;form;\n`;

    const o1 = await baslat(ctx, csv);
    expect(svc.iceAktarmaTamamla(ctx, o1.id, ESLEM, SECENEK, true)).toMatchObject({ eklenen: 0, guncellenen: 0, cakisan: 3 });
    expect(kayitGetir(ctx, dolu.id)?.eposta).toBeNull();

    const o2 = await baslat(ctx, csv);
    expect(svc.iceAktarmaTamamla(ctx, o2.id, ESLEM, { ...SECENEK, cakisma: "bos_doldur" }, true)).toMatchObject({
      eklenen: 0,
      guncellenen: 3, // ret kaydında da boş ad dolar; izni değişmez
    });
    expect(kayitGetir(ctx, dolu.id)).toMatchObject({ yetkiliAdi: "Eski Ad", eposta: "d@ornek.test" });
    expect(kayitGetir(ctx, bos.id)?.yetkiliAdi).toBe("B");
    expect(whatsappKisisiGetir(ctx, bos.id)?.izin).toBe("var");
    expect(whatsappKisisiGetir(ctx, retli.id)?.izin).toBe("ret");
    expect(kayitGetir(ctx, retli.id)?.yetkiliAdi).toBe("R");
  });

  it("dosyada ret işaretli kişi eklenir ve ret akışından geçer (engel listesi)", async () => {
    const { ctx } = kiraciOlustur("RetSatiri");
    const o = await baslat(ctx, `${BASLIK}\nAli;0532 111 22 33;;ret;;\n`);
    // Ret geri alınamaz: onaysız uygulanmaz, hiçbir şey yazılmaz.
    expect(() => svc.iceAktarmaTamamla(ctx, o.id, ESLEM, SECENEK, false)).toThrow(/geri alınamaz/);
    expect(kayitlariListele(ctx).kayitlar).toHaveLength(0);
    svc.iceAktarmaTamamla(ctx, o.id, ESLEM, SECENEK, false, true);
    const k = kayitlariListele(ctx).kayitlar[0];
    expect(k.iletiIzni).toBe("ret");
    expect(whatsappKisisiGetir(ctx, k.id)?.izin).toBe("ret");
  });

  it("süresi dolmuş oturum uygulanamaz", async () => {
    const { ctx } = kiraciOlustur("Sure");
    const o = await baslat(ctx, `${BASLIK}\nAli;0532 111 22 33;;;;\n`);
    db.$client.prepare("update ice_aktarmalar set olusturma_tarihi = ? where id = ?").run(Date.now() - 61 * 60_000, o.id);
    expect(() => svc.iceAktarmaOnizle(ctx, o.id, ESLEM, SECENEK)).toThrow(/süresi doldu/);
  });
});

describe("API", () => {
  it("dosya yükleme ve beyan onayı olmadan izinli tamamlama reddi (sunucu)", async () => {
    const { ctx } = kiraciOlustur("Api");
    oturum.ctx = ctx;
    const form = new FormData();
    form.set("dosya", new File([`${BASLIK}\nAli;0532 111 22 33;;var;form;\n`], "liste.csv", { type: "text/csv" }));
    const y = await yuklemeRotasi.POST(new Request("https://crm.ornek.test/api/ice-aktarma", { method: "POST", body: form }));
    expect(y.status).toBe(200);
    const { id } = (await y.json()) as { id: string };

    const istek = (beyanOnayi: boolean) =>
      tamamlaRotasi.POST(
        new Request(`https://crm.ornek.test/api/ice-aktarma/${id}/tamamla`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eslem: ESLEM, secenekler: SECENEK, beyanOnayi }),
        }),
        { params: Promise.resolve({ id }) },
      );
    const ret = await istek(false);
    expect(ret.status).toBe(400);
    expect(await ret.json()).toMatchObject({ kod: "beyan" });
    expect(kayitlariListele(ctx).toplam).toBe(0);
    expect((await istek(true)).status).toBe(200);
    expect(kayitlariListele(ctx).toplam).toBe(1);

    // Başka kiracı oturumu göremez.
    oturum.ctx = kiraciOlustur("Api2").ctx;
    const yabanci = await tamamlaRotasi.POST(
      new Request(`https://crm.ornek.test/api/ice-aktarma/${id}/tamamla`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eslem: ESLEM, secenekler: SECENEK, beyanOnayi: true }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(yabanci.status).toBe(404);
  });
});
