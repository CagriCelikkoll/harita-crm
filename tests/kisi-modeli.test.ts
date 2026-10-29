// Google dışı kişiler ve WhatsApp kişi bilgileri: telefon normalleştirme, izin ve ret akışı.
import { describe, expect, it } from "vitest";
import { adresOzeti } from "@/server/messaging/adres";
import { engelliOzetler, retIsle } from "@/server/repo/engel-listesi";
import { kayitGetir, kayitGuncelle, kayitlariListele, kisileriEkle, telefonlaKayitlar } from "@/server/repo/kayitlar";
import { olaylariListele } from "@/server/repo/olaylar";
import { whatsappIzniAyarla, whatsappKisisiGetir } from "@/server/repo/whatsapp-kisileri";
import { db } from "@/server/db";
import { kiraciOlustur } from "./yardimci/fabrika";

describe("Google dışı kişiler", () => {
  it("place_id'siz eklenir, telefon normalize edilir, kaynak filtresiyle listelenir", () => {
    const { ctx } = kiraciOlustur("Kisi1");
    const [k] = kisileriEkle(ctx, [{ kaynak: "ice_aktarma", isletmeAdi: "Ege Emlak", ekTelefon: "+90 (532) 111 22 33" }], "İçe aktarma");
    expect(k).toMatchObject({ kaynak: "ice_aktarma", placeId: null, telefonE164: "905321112233", isletmeAdi: "Ege Emlak" });
    expect(olaylariListele(ctx, k.id).map((o) => o.tur)).toEqual(["eklendi"]);
    expect(kayitlariListele(ctx, { kaynak: "ice_aktarma" }).toplam).toBe(1);
    expect(kayitlariListele(ctx, { kaynak: "google" }).toplam).toBe(0);
    expect(telefonlaKayitlar(ctx, ["905321112233"]).map((x) => x.id)).toEqual([k.id]);
  });

  it("ek telefon değişince telefon_e164 de güncellenir; tanınmayan numarada boşalır", () => {
    const { ctx } = kiraciOlustur("Kisi2");
    const [k] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: "0532 111 22 33" }], "Elle eklendi");
    expect(kayitGuncelle(ctx, k.id, { ekTelefon: "0533 999 88 77" })?.telefonE164).toBe("905339998877");
    expect(kayitGuncelle(ctx, k.id, { ekTelefon: "12" })?.telefonE164).toBeNull();
    // Başka alan güncellemesi telefon_e164'e dokunmaz.
    kayitGuncelle(ctx, k.id, { ekTelefon: "0533 999 88 77" });
    expect(kayitGuncelle(ctx, k.id, { notlar: "x" })?.telefonE164).toBe("905339998877");
  });
});

describe("WhatsApp izni", () => {
  it("izin ve kaynağı kaydedilir, olay yazılır; satır yoksa getir null", () => {
    const { ctx } = kiraciOlustur("Izin1");
    const [k] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: "0532 111 22 33" }], "x");
    expect(whatsappKisisiGetir(ctx, k.id)).toBeNull();
    const sonuc = whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "sozlesme", not: "Sözleşme no 12", iysBeyani: true });
    expect(sonuc).toMatchObject({ tamam: true, kisi: { izin: "var", izinKaynagi: "sozlesme", izinNotu: "Sözleşme no 12" } });
    expect(whatsappKisisiGetir(ctx, k.id)?.iysBeyanTarihi).toBeInstanceOf(Date);
    expect(olaylariListele(ctx, k.id).find((o) => o.tur === "izin")?.aciklama).toContain("İzin var");
    // Aynı değerle tekrar: yeni olay yok.
    const olay = olaylariListele(ctx, k.id).length;
    whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "sozlesme", not: "Sözleşme no 12", iysBeyani: true });
    expect(olaylariListele(ctx, k.id)).toHaveLength(olay);
  });

  it("ret akışı WhatsApp iznini de 'ret' yapar, BSUID'i engeller; ret geri alınamaz", () => {
    const { ctx } = kiraciOlustur("Ret1");
    const [k] = kisileriEkle(ctx, [{ kaynak: "meta_reklam", yetkiliAdi: "Ali" }], "Reklam");
    whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "kendisi_yazdi" });
    db.$client.prepare("update whatsapp_kisileri set bsuid = 'TR.42' where lead_id = ?").run(k.id);

    expect(retIsle(ctx, { leadId: k.id, adresler: [], kaynak: "whatsapp_ret", aciklama: "RET yazdı" })).toBe(true);
    expect(kayitGetir(ctx, k.id)?.iletiIzni).toBe("ret");
    expect(whatsappKisisiGetir(ctx, k.id)?.izin).toBe("ret");
    const ozet = adresOzeti(ctx.tenantId, "wa_kimlik", "TR.42");
    expect(engelliOzetler(ctx, [ozet]).has(ozet)).toBe(true);
    expect(whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form" })).toEqual({ tamam: false, neden: "ret" });
    expect(whatsappKisisiGetir(ctx, k.id)?.izin).toBe("ret");
  });

  it("kayıtta ileti izni elle 'ret' yapılınca WhatsApp izni de 'ret' olur", () => {
    const { ctx } = kiraciOlustur("Ret2");
    const [k] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: "0532 111 22 33" }], "x");
    whatsappIzniAyarla(ctx, k.id, { izin: "var", kaynak: "form" });
    kayitGuncelle(ctx, k.id, { iletiIzni: "ret" });
    expect(whatsappKisisiGetir(ctx, k.id)?.izin).toBe("ret");
  });
});
