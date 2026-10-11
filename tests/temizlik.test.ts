// npm run cleanup: Google 30 gün kuralı ve saklama süresi.
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { konumlariKaydet } from "@/server/repo/konumlar";
import { temizlikYap } from "@/server/repo/sistem/bakim";
import { taramaGetir, taramaOlustur } from "@/server/repo/taramalar";
import { kiraciOlustur } from "./yardimci/fabrika";

const GUN = 24 * 60 * 60 * 1000;
const yaslandir = (tablo: string, sutun: string, gun: number, kosul: string, ...p: unknown[]) =>
  db.$client.prepare(`update ${tablo} set ${sutun} = ? where ${kosul}`).run(Date.now() - gun * GUN, ...p);

describe("temizlik", () => {
  it("adres kaynaklı tarama merkezi 30 gün sonra silinir; adres metni ve yarıçap kalır", () => {
    const { ctx } = kiraciOlustur("Temiz");
    const girdi = { merkezLat: 41.01, merkezLng: 29.02, yaricapM: 3000, kategori: "kafe" };
    const eskiAdres = taramaOlustur(ctx, { ...girdi, merkezKaynagi: "adres", adresMetni: "Bağdat Caddesi" });
    const yeniAdres = taramaOlustur(ctx, { ...girdi, merkezKaynagi: "adres", adresMetni: "Moda" });
    const eskiHarita = taramaOlustur(ctx, { ...girdi, merkezKaynagi: "harita" });
    yaslandir("scans", "olusturma_tarihi", 31, "id in (?, ?)", eskiAdres.id, eskiHarita.id);
    yaslandir("scans", "olusturma_tarihi", 10, "id = ?", yeniAdres.id);

    const sonuc = temizlikYap();
    expect(sonuc.temizlenenMerkez).toBe(1);

    const e = taramaGetir(ctx, eskiAdres.id)!;
    expect([e.merkezLat, e.merkezLng]).toEqual([null, null]);
    expect(e.adresMetni).toBe("Bağdat Caddesi");
    expect(e.yaricapM).toBe(3000);
    expect(e.merkezKaynagi).toBe("adres");

    expect(taramaGetir(ctx, yeniAdres.id)!.merkezLat).toBe(41.01); // 30 gün dolmadı
    expect(taramaGetir(ctx, eskiHarita.id)!.merkezLat).toBe(41.01); // kullanıcı verisi: kalır

    expect(temizlikYap().temizlenenMerkez).toBe(0); // ikinci çalıştırma bir şey yapmaz
  });

  it("haritadan seçilen merkezde adres metni saklanmaz", () => {
    const { ctx } = kiraciOlustur("Harita");
    const t = taramaOlustur(ctx, {
      merkezLat: 1,
      merkezLng: 1,
      yaricapM: 1000,
      kategori: "kafe",
      merkezKaynagi: "harita",
      adresMetni: "yok sayılmalı",
    });
    expect(t.adresMetni).toBeNull();
  });

  it("30 günden eski Places konumları silinir, yenileri kalır", () => {
    const { ctx } = kiraciOlustur("Konum");
    konumlariKaydet(ctx, [
      { placeId: "eski", lat: 1, lng: 1 },
      { placeId: "yeni", lat: 2, lng: 2 },
    ]);
    yaslandir("place_locations", "alinma_tarihi", 31, "tenant_id = ? and place_id = 'eski'", ctx.tenantId);
    temizlikYap();
    const kalan = db.$client.prepare("select place_id from place_locations where tenant_id = ?").all(ctx.tenantId);
    expect(kalan).toEqual([{ place_id: "yeni" }]);
  });
});
