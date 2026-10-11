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
  });
});

describe("alıcı kuralları (tek fonksiyon)", () => {
  const temel: AliciKaydi = { iletiIzni: "bekliyor", aliciTuru: "tacir_esnaf", eposta: "a@ornek.test", ekTelefon: "0532 111 22 33" };
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
    expect(aliciDegerlendir({ ...temel, ekTelefon: null }, "sms", engelYok)).toEqual({ uygun: true, adres: null, kaynak: "places" });
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
