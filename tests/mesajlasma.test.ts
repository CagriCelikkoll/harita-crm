// 2. aşama iskeleti: ret kuralı ve sandbox sağlayıcı.
import { describe, expect, it } from "vitest";
import { SandboxSaglayici, uygunAlicilar } from "@/server/messaging/saglayici";

describe("mesajlaşma iskeleti", () => {
  it("ret işaretli kayıtlar her zaman hariç tutulur", () => {
    const kayitlar = [
      { id: "1", iletiIzni: "onayli" as const },
      { id: "2", iletiIzni: "ret" as const },
      { id: "3", iletiIzni: "bekliyor" as const },
    ];
    expect(uygunAlicilar(kayitlar).map((k) => k.id)).toEqual(["1", "3"]);
  });

  it("sandbox gerçek gönderim yapmaz, kaydeder; abonelikten çıkma bağlantısı zorunlu", async () => {
    const s = new SandboxSaglayici();
    const ileti = { kanal: "eposta" as const, kayitId: "1", alici: "a@ornek.test", govde: "Merhaba", aboneliktenCikmaBaglantisi: "https://ornek.test/cik/x" };
    expect((await s.gonder(ileti)).durum).toBe("kaydedildi");
    expect((await s.gonder({ ...ileti, aboneliktenCikmaBaglantisi: "" })).durum).toBe("hata");
    expect(s.kayit).toHaveLength(1);
  });
});
