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
  it("kaynağı ne olursa olsun tüm tarama merkezleri 30 gün sonra silinir; adres metni, yarıçap ve kaynak kalır", () => {
    const { ctx } = kiraciOlustur("Temiz");
    const girdi = { merkezLat: 41.01, merkezLng: 29.02, yaricapM: 3000, kategori: "kafe" };
    const eskiAdres = taramaOlustur(ctx, { ...girdi, merkezKaynagi: "adres", adresMetni: "Bağdat Caddesi" });
    const eskiHarita = taramaOlustur(ctx, { ...girdi, yaricapM: 1500, merkezKaynagi: "harita" });
    const yeniAdres = taramaOlustur(ctx, { ...girdi, merkezKaynagi: "adres", adresMetni: "Moda" });
    const yeniHarita = taramaOlustur(ctx, { ...girdi, merkezKaynagi: "harita" });
    // Süre merkezin alındığı andan (merkez_tarihi) sayılır; oluşturma tarihiyle birlikte yaşlandırılır.
    for (const sutun of ["olusturma_tarihi", "merkez_tarihi"]) {
      yaslandir("scans", sutun, 31, "id in (?, ?)", eskiAdres.id, eskiHarita.id);
      yaslandir("scans", sutun, 10, "id in (?, ?)", yeniAdres.id, yeniHarita.id);
    }

    expect(temizlikYap().temizlenenMerkez).toBe(2);

    const a = taramaGetir(ctx, eskiAdres.id)!;
    expect([a.merkezLat, a.merkezLng]).toEqual([null, null]);
    expect(a).toMatchObject({ adresMetni: "Bağdat Caddesi", yaricapM: 3000, merkezKaynagi: "adres" });

    const h = taramaGetir(ctx, eskiHarita.id)!;
    expect([h.merkezLat, h.merkezLng]).toEqual([null, null]); // haritadan seçilen nokta da silinir
    expect(h).toMatchObject({ adresMetni: null, yaricapM: 1500, merkezKaynagi: "harita" });

    expect(taramaGetir(ctx, yeniAdres.id)!.merkezLat).toBe(41.01); // 30 gün dolmadı
    expect(taramaGetir(ctx, yeniHarita.id)!.merkezLat).toBe(41.01);

    expect(temizlikYap().temizlenenMerkez).toBe(0); // ikinci çalıştırma bir şey yapmaz
  });

  it("merkezi silinmiş tarama çalıştırılamaz, açık bir mesajla hata olur", async () => {
    const { ctx } = kiraciOlustur("Silinmis");
    const t = taramaOlustur(ctx, { merkezLat: 41, merkezLng: 29, yaricapM: 1000, kategori: "kafe" });
    db.$client.prepare("update scans set merkez_lat = null, merkez_lng = null where id = ?").run(t.id);
    const { taramaCalistir } = await import("@/server/servisler/tarama");
    const sonuc = await taramaCalistir(ctx, t.id);
    expect(sonuc?.durum).toBe("hata");
    expect(sonuc?.hataMesaji).toMatch(/Tekrar kullan/);
    expect(sonuc?.istekSayisi).toBe(0); // Places'a gidilmedi
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
