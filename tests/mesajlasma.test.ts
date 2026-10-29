// Mesajlaşma çekirdeği: şablon, adres normalleştirme, alıcı kuralları, sandbox sağlayıcı.
import { describe, expect, it } from "vitest";
import { sablonDoldur } from "@/lib/sablon";
import { cepMi, epostaNormallestir, telefonNormallestir } from "@/server/messaging/adres";
import { aliciDegerlendir, type AliciKaydi } from "@/server/messaging/alici-kurallari";
import { SandboxSaglayici } from "@/server/messaging/saglayici";

describe("şablon: {isletme} yalnızca kullanıcının girdiği addan", () => {
  it("ad varsa yerine konur (birden çok kez de)", () => {
    expect(sablonDoldur("Merhaba {isletme}, {isletme} için teklif.", "Ege Emlak")).toBe("Merhaba Ege Emlak, Ege Emlak için teklif.");
  });
  it("ad yoksa ve hitap tanımlıysa hitap kullanılır", () => {
    expect(sablonDoldur("Merhaba {isletme},", null, "Değerli işletme")).toBe("Merhaba Değerli işletme,");
  });
  it("ad ve hitap yoksa yer tutucu çevresindeki boşluk/virgülle kaldırılır", () => {
    expect(sablonDoldur("Merhaba {isletme},", null)).toBe("Merhaba,");
    expect(sablonDoldur("Merhaba {isletme},\nTeklifimiz var.", "  ")).toBe("Merhaba,\nTeklifimiz var.");
    expect(sablonDoldur("Merhaba, {isletme}!", null)).toBe("Merhaba!");
    expect(sablonDoldur("Sayın {isletme} yetkilisi", null)).toBe("Sayın yetkilisi");
    expect(sablonDoldur("{isletme}, hoş geldiniz", null)).toBe("hoş geldiniz");
    expect(sablonDoldur("Selam\n{isletme} ekibi", null)).toBe("Selam\nekibi");
  });
  it("adın içindeki $ gibi özel karakterler bozulmaz", () => {
    expect(sablonDoldur("Merhaba {isletme}", "A$& B")).toBe("Merhaba A$& B");
  });
});

describe("adres normalleştirme", () => {
  it("Türkiye telefonları 90XXXXXXXXXX biçimine çevrilir; cep numarası tanınır", () => {
    for (const giris of ["0532 123 45 67", "+90 (532) 123-4567", "905321234567", "00905321234567", "5321234567"]) {
      expect(telefonNormallestir(giris)).toBe("905321234567");
    }
    expect(telefonNormallestir("0216 555 44 33")).toBe("902165554433");
    expect(cepMi("905321234567")).toBe(true);
    expect(cepMi("902165554433")).toBe(false);
    expect(telefonNormallestir("12345")).toBeNull();
    expect(telefonNormallestir("+44 20 7946 0958")).toBeNull();
  });
  it("e-posta küçük harfe çevrilir; geçersiz olan null", () => {
    expect(epostaNormallestir("  Bilgi@Ornek.COM ")).toBe("bilgi@ornek.com");
    expect(epostaNormallestir("gecersiz")).toBeNull();
    expect(epostaNormallestir("ad.soyad+etiket@alt.ornek.com.tr")).toBe("ad.soyad+etiket@alt.ornek.com.tr");
    expect(epostaNormallestir("bilgi@xn--rnek-0ra.com")).toBe("bilgi@xn--rnek-0ra.com");
  });
  it("e-posta: tırnak, yorum, ; > , gibi addressparser'ı yanıltabilecek adresler reddedilir", () => {
    for (const kotu of [
      '"a>b"@ornek.com',
      "a>b@ornek.com",
      "a;kurban@ornek.com",
      "a(yorum)@ornek.com",
      "a@ornek.com(yorum)",
      "a,b@ornek.com",
      "a@ornek",
      ".a@ornek.com",
      "a..b@ornek.com",
      "a@-ornek.com",
      `${"a".repeat(250)}@ornek.com`,
    ]) {
      expect(epostaNormallestir(kotu), kotu).toBeNull();
    }
  });
});

describe("alıcı kuralları (tek fonksiyon)", () => {
  const temel: AliciKaydi = {
    iletiIzni: "bekliyor",
    aliciTuru: "tacir_esnaf",
    eposta: "a@ornek.test",
    ekTelefon: "0532 111 22 33",
    placeId: "p1",
  };
  const engelYok = () => false;

  it("ret her zaman hariç", () => {
    expect(aliciDegerlendir({ ...temel, iletiIzni: "ret" }, "eposta", engelYok)).toEqual({ uygun: false, neden: "ret" });
    expect(aliciDegerlendir({ ...temel, iletiIzni: "ret" }, "sms", engelYok)).toEqual({ uygun: false, neden: "ret" });
  });
  it("bireysel kayda yalnızca onaylıysa gönderilir", () => {
    expect(aliciDegerlendir({ ...temel, aliciTuru: "bireysel" }, "eposta", engelYok)).toEqual({ uygun: false, neden: "bireysel_izinsiz" });
    expect(aliciDegerlendir({ ...temel, aliciTuru: "bireysel", iletiIzni: "onayli" }, "eposta", engelYok)).toMatchObject({ uygun: true });
  });
  it("tacir/esnaf kayda izin beklenirken de gönderilir", () => {
    expect(aliciDegerlendir(temel, "eposta", engelYok)).toEqual({ uygun: true, adres: "a@ornek.test", kaynak: "kayit" });
  });
  it("e-posta yalnızca kaydın eposta alanından; yoksa iletişim bilgisi yok", () => {
    expect(aliciDegerlendir({ ...temel, eposta: null }, "eposta", engelYok)).toEqual({ uygun: false, neden: "iletisim_yok" });
  });
  it("engel listesindeki adres hariç", () => {
    expect(aliciDegerlendir(temel, "eposta", (tur, a) => tur === "eposta" && a === "a@ornek.test")).toEqual({
      uygun: false,
      neden: "engel",
    });
  });
  it("SMS: ek_telefon cep değilse hariç; ek_telefon yoksa Places'tan alınacak", () => {
    expect(aliciDegerlendir(temel, "sms", engelYok)).toEqual({ uygun: true, adres: "905321112233", kaynak: "kayit" });
    expect(aliciDegerlendir({ ...temel, ekTelefon: "0216 555 44 33" }, "sms", engelYok)).toEqual({ uygun: false, neden: "cep_degil" });
    expect(aliciDegerlendir({ ...temel, ekTelefon: null }, "sms", engelYok)).toEqual({
      uygun: true,
      adres: null,
      kaynak: "places",
      placeId: "p1",
    });
    expect(aliciDegerlendir({ ...temel, ekTelefon: null }, "sms", engelYok, { placesTelefonu: "+90 533 444 55 66" })).toEqual({
      uygun: true,
      adres: "905334445566",
      kaynak: "places",
    });
    expect(aliciDegerlendir({ ...temel, ekTelefon: null }, "sms", engelYok, { placesTelefonu: null })).toEqual({
      uygun: false,
      neden: "iletisim_yok",
    });
  });
  describe("whatsapp_api kanalı", () => {
    const SIMDI = new Date("2026-10-29T10:00:00Z");
    const izinli = (w: Partial<NonNullable<AliciKaydi["whatsapp"]>> = {}): AliciKaydi => ({
      ...temel,
      whatsapp: { izin: "var", iysBeyanTarihi: null, whatsappYokTarihi: null, bsuid: null, ...w },
    });
    const d = (k: AliciKaydi, engel: Parameters<typeof aliciDegerlendir>[2] = engelYok) =>
      aliciDegerlendir(k, "whatsapp_api", engel, { simdi: SIMDI });

    it("izin 'var' değilse ya da kayıt yoksa hariç; genel ya da WhatsApp reti hariç", () => {
      expect(d(temel)).toEqual({ uygun: false, neden: "whatsapp_izni_yok" });
      expect(d(izinli({ izin: "yok" }))).toEqual({ uygun: false, neden: "whatsapp_izni_yok" });
      expect(d(izinli({ izin: "ret" }))).toEqual({ uygun: false, neden: "ret" });
      expect(d({ ...izinli(), iletiIzni: "ret" })).toEqual({ uygun: false, neden: "ret" });
      expect(d(izinli())).toEqual({ uygun: true, adres: "905321112233", kaynak: "kayit" });
    });
    it("bireysel kişide İYS beyanı gerekir; genel ileti izni (onayli) aranmaz", () => {
      expect(d({ ...izinli(), aliciTuru: "bireysel" })).toEqual({ uygun: false, neden: "iys_beyani_yok" });
      expect(d({ ...izinli({ iysBeyanTarihi: SIMDI }), aliciTuru: "bireysel" })).toMatchObject({ uygun: true });
    });
    it("son 90 günde 'WhatsApp yok' bildirilmişse hariç", () => {
      const gun = (n: number) => new Date(SIMDI.getTime() - n * 86_400_000);
      expect(d(izinli({ whatsappYokTarihi: gun(10) }))).toEqual({ uygun: false, neden: "whatsapp_yok" });
      expect(d(izinli({ whatsappYokTarihi: gun(91) }))).toMatchObject({ uygun: true });
    });
    it("cep değilse, engelliyse hariç; Places'a hiç gidilmez; telefon yoksa BSUID", () => {
      expect(d({ ...izinli(), ekTelefon: "0216 555 44 33" })).toEqual({ uygun: false, neden: "cep_degil" });
      expect(d(izinli(), (tur) => tur === "telefon")).toEqual({ uygun: false, neden: "engel" });
      expect(d({ ...izinli({ bsuid: "TR.1" }), ekTelefon: "0532 111 22 33" }, (tur) => tur === "wa_kimlik")).toEqual({
        uygun: false,
        neden: "engel",
      });
      // Google kaydı ama telefonu yok: whatsapp_api Places'a gitmez.
      expect(d({ ...izinli(), ekTelefon: null })).toEqual({ uygun: false, neden: "iletisim_yok" });
      expect(d({ ...izinli({ bsuid: "TR.1" }), ekTelefon: null })).toEqual({ uygun: true, adres: "TR.1", kaynak: "bsuid" });
    });
  });
  it("Google dışı kayıtta (place_id yok) telefon yalnızca kayıttan; Places'a gidilmez", () => {
    const kisi = { ...temel, placeId: null, ekTelefon: null };
    expect(aliciDegerlendir(kisi, "sms", engelYok)).toEqual({ uygun: false, neden: "iletisim_yok" });
    expect(aliciDegerlendir(kisi, "whatsapp", engelYok)).toEqual({ uygun: false, neden: "iletisim_yok" });
    expect(aliciDegerlendir({ ...kisi, ekTelefon: "0532 111 22 33" }, "sms", engelYok)).toMatchObject({
      uygun: true,
      kaynak: "kayit",
    });
  });
});

describe("sandbox sağlayıcı", () => {
  it("gerçek gönderim yapmaz, kaydeder; abonelikten çıkma bağlantısı zorunlu", async () => {
    const s = new SandboxSaglayici("eposta");
    const ileti = { kanal: "eposta" as const, alici: "a@ornek.test", metin: "x", aboneliktenCikmaBaglantisi: "https://x/abonelik/1", aliciTuru: "tacir_esnaf" as const };
    expect((await s.gonder(ileti)).durum).toBe("gonderildi");
    expect(await s.gonder({ ...ileti, aboneliktenCikmaBaglantisi: "" })).toMatchObject({ durum: "kalici_hata" });
    expect(s.kayit).toHaveLength(1);
    expect(s.sandbox).toBe(true);
  });
});
