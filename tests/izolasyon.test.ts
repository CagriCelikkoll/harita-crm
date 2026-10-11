// Kiracı izolasyonu testi.
// İki kiracı (A ve B) oluşturulur; B'nin verisi doldurulur. A'nın bağlamıyla B'nin
// scans / leads / lead_events (ve diğer kiracı verisi) satırlarını listeleme, id ile okuma,
// güncelleme ve silme denemelerinin HEPSİ boş / null (404) / false döndürmeli ve B'nin verisi
// değişmeden kalmalıdır.
//
// Her depo fonksiyonu için bir test vardır. "kapsam" testi, src/server/repo/ altına eklenen ve
// burada testi olmayan her yeni fonksiyonda başarısız olur.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { leadEvents } from "@/server/db/schema";
import { YetkiHatasi, type TenantContext } from "@/server/repo/baglam";
import * as calismaAlani from "@/server/repo/calisma-alani";
import * as kayitlar from "@/server/repo/kayitlar";
import * as konumlar from "@/server/repo/konumlar";
import * as kullanim from "@/server/repo/kullanim";
import * as olaylar from "@/server/repo/olaylar";
import * as taramalar from "@/server/repo/taramalar";
import { baglamUret } from "@/server/repo/sistem/uyelik";
import { kiraciOlustur, kullaniciOlustur } from "./yardimci/fabrika";

let A: TenantContext;
let B: TenantContext;
let bKullaniciId: string;
let bTarama: taramalar.Tarama;
let bKayit: kayitlar.Kayit;
let bOlay: olaylar.KayitOlayi;
let bDavetId: string;
const B_PLACE = "places-b-1";

beforeAll(() => {
  const a = kiraciOlustur("Ayse");
  const b = kiraciOlustur("Bora");
  A = a.ctx;
  B = b.ctx;
  bKullaniciId = b.kullanici.id;

  bTarama = taramalar.taramaOlustur(B, { merkezLat: 41, merkezLng: 29, yaricapM: 2000, kategori: "emlak_ofisi" });
  kayitlar.kayitlariEkle(B, bTarama.id, [B_PLACE, "places-b-2"]);
  bKayit = kayitlar.kayitlariListele(B).kayitlar.find((k) => k.placeId === B_PLACE)!;
  kayitlar.kayitGuncelle(B, bKayit.id, { etiketler: ["gizli-b"], notlar: "B'nin notu", eposta: "b@ornek.test" });
  bOlay = olaylar.olayEkle(B, bKayit.id, "not", "B'nin olayı")!;
  bKayit = kayitlar.kayitGetir(B, bKayit.id)!; // olayEkle güncelleme tarihini değiştirir
  konumlar.konumlariKaydet(B, [{ placeId: B_PLACE, lat: 41.01, lng: 29.01 }]);
  kullanim.placesIstegiSay(B, 7);
  bDavetId = calismaAlani.davetOlustur(B, { eposta: "davetli-b@ornek.test", rol: "uye" }).id;
});

/** B'nin verisinin hiç değişmediğini doğrular. */
function bDegismedi() {
  expect(taramalar.taramaGetir(B, bTarama.id)).toEqual(bTarama);
  expect(kayitlar.kayitGetir(B, bKayit.id)).toEqual(bKayit);
  expect(olaylar.olayGetir(B, bOlay.id)).toEqual(bOlay);
  expect(kayitlar.kayitlariListele(B).toplam).toBe(2);
}

const taramaTestleri: Record<keyof typeof taramalar, () => void> = {
  taramaOlustur: () => {
    const t = taramalar.taramaOlustur(A, { merkezLat: 1, merkezLng: 1, yaricapM: 1000, kategori: "kafe" });
    expect(t.tenantId).toBe(A.tenantId); // tenant_id dışarıdan alınmaz, bağlamdan yazılır
    expect(taramalar.taramaGetir(B, t.id)).toBeNull();
    taramalar.taramaSil(A, t.id);
  },
  taramalariListele: () => {
    expect(taramalar.taramalariListele(A).map((t) => t.id)).not.toContain(bTarama.id);
  },
  taramaGetir: () => {
    expect(taramalar.taramaGetir(A, bTarama.id)).toBeNull();
  },
  taramaBaslat: () => {
    expect(taramalar.taramaBaslat(A, bTarama.id)).toBeNull();
    expect(taramalar.taramaGetir(B, bTarama.id)?.durum).toBe("kuyrukta");
  },
  taramaGuncelle: () => {
    expect(taramalar.taramaGuncelle(A, bTarama.id, { durum: "hata", istekSayisi: 999 })).toBeNull();
    expect(taramalar.taramaGetir(B, bTarama.id)).toEqual(bTarama);
  },
  taramaSil: () => {
    expect(taramalar.taramaSil(A, bTarama.id)).toBe(false);
    expect(taramalar.taramaGetir(B, bTarama.id)).not.toBeNull();
  },
  yarimKalmaSiniri: () => {
    const simdi = new Date("2026-10-11T12:00:00Z");
    expect(taramalar.yarimKalmaSiniri(simdi).toISOString()).toBe("2026-10-11T11:50:00.000Z");
  },
  yarimKalanTaramalariKapat: () => {
    // B'nin 11 dakikadır "calisiyor" kalan taraması A'nın çağrısından etkilenmez.
    const yarim = taramalar.taramaOlustur(B, { merkezLat: 41, merkezLng: 29, yaricapM: 1000, kategori: "kafe" });
    db.$client
      .prepare("update scans set durum = 'calisiyor', baslama_tarihi = ? where id = ?")
      .run(Date.now() - 11 * 60 * 1000, yarim.id);
    expect(taramalar.yarimKalanTaramalariKapat(A)).toBe(0);
    expect(taramalar.taramaGetir(B, yarim.id)?.durum).toBe("calisiyor");
    taramalar.taramaSil(B, yarim.id);
  },
};

const kayitTestleri: Record<keyof typeof kayitlar, () => void> = {
  kayitlariListele: () => {
    const sonuc = kayitlar.kayitlariListele(A, { arama: "B'nin" });
    expect(sonuc.toplam).toBe(0);
    expect(kayitlar.kayitlariListele(A).kayitlar.map((k) => k.id)).not.toContain(bKayit.id);
  },
  kayitGetir: () => {
    expect(kayitlar.kayitGetir(A, bKayit.id)).toBeNull();
  },
  kayitlariEkle: () => {
    // A, B'nin taramasına kayıt ekleyemez.
    expect(kayitlar.kayitlariEkle(A, bTarama.id, ["places-a-saldiri"])).toBeNull();
    expect(kayitlar.kayitlariListele(B).toplam).toBe(2);
    // Aynı place_id iki kiracıda ayrı ayrı bulunabilir; A'nın eklemesi B'ye dokunmaz.
    const aTarama = taramalar.taramaOlustur(A, { merkezLat: 1, merkezLng: 1, yaricapM: 1000, kategori: "kafe" });
    expect(kayitlar.kayitlariEkle(A, aTarama.id, [B_PLACE])).toEqual({ yeni: 1, toplam: 1 });
    expect(kayitlar.kayitGetir(B, bKayit.id)).toEqual(bKayit);
    taramalar.taramaSil(A, aTarama.id);
  },
  kayitGuncelle: () => {
    const olaySayisi = olaylar.olaylariListele(B, bKayit.id).length;
    expect(kayitlar.kayitGuncelle(A, bKayit.id, { durum: "kazanildi", notlar: "ele geçirildi" })).toBeNull();
    expect(kayitlar.kayitGetir(B, bKayit.id)).toEqual(bKayit);
    expect(olaylar.olaylariListele(B, bKayit.id)).toHaveLength(olaySayisi);
  },
  kayitSil: () => {
    expect(kayitlar.kayitSil(A, bKayit.id)).toBe(false);
    expect(kayitlar.kayitGetir(B, bKayit.id)).not.toBeNull();
  },
  durumSayilari: () => {
    const toplam = Object.values(kayitlar.durumSayilari(A)).reduce((a, b) => a + b, 0);
    expect(toplam).toBe(kayitlar.kayitlariListele(A).toplam);
    expect(kayitlar.durumSayilari(B).yeni).toBe(2);
  },
  etiketleriListele: () => {
    expect(kayitlar.etiketleriListele(A)).not.toContain("gizli-b");
    expect(kayitlar.etiketleriListele(B)).toContain("gizli-b");
  },
  taramaKayitlari: () => {
    expect(kayitlar.taramaKayitlari(A, bTarama.id)).toEqual([]);
  },
  disaAktarilacakKayitlar: () => {
    expect(kayitlar.disaAktarilacakKayitlar(A).map((k) => k.id)).not.toContain(bKayit.id);
  },
  kayitlariGetir: () => {
    expect(kayitlar.kayitlariGetir(A, [bKayit.id])).toEqual([]);
  },
};

const olayTestleri: Record<keyof typeof olaylar, () => void> = {
  olaylariListele: () => {
    expect(olaylar.olaylariListele(A, bKayit.id)).toEqual([]);
  },
  olayGetir: () => {
    expect(olaylar.olayGetir(A, bOlay.id)).toBeNull();
  },
  olayEkle: () => {
    expect(olaylar.olayEkle(A, bKayit.id, "arama", "sızma denemesi")).toBeNull();
    expect(olaylar.olaylariListele(B, bKayit.id).map((o) => o.aciklama)).not.toContain("sızma denemesi");
  },
  notOlayiGuncelle: () => {
    expect(olaylar.notOlayiGuncelle(A, bOlay.id, "değiştirildi")).toBeNull();
    expect(olaylar.olayGetir(B, bOlay.id)).toEqual(bOlay);
  },
  notOlayiSil: () => {
    expect(olaylar.notOlayiSil(A, bOlay.id)).toBe(false);
    expect(olaylar.olayGetir(B, bOlay.id)).not.toBeNull();
  },
};

const kullanimTestleri: Record<keyof typeof kullanim, () => void> = {
  ayAnahtari: () => {
    expect(kullanim.ayAnahtari(new Date("2026-10-11T00:00:00Z"))).toBe("2026-10");
  },
  placesIstegiSay: () => {
    const once = kullanim.aylikPlacesIstegi(B);
    kullanim.placesIstegiSay(A, 3);
    expect(kullanim.aylikPlacesIstegi(B)).toBe(once);
  },
  aylikPlacesIstegi: () => {
    expect(kullanim.aylikPlacesIstegi(B)).toBe(7);
    expect(kullanim.aylikPlacesIstegi(A)).not.toBe(kullanim.aylikPlacesIstegi(A) + 7);
  },
};

const konumTestleri: Record<keyof typeof konumlar, () => void> = {
  konumlariGetir: () => {
    expect(konumlar.konumlariGetir(A, [B_PLACE])).toEqual([]);
    expect(konumlar.konumlariGetir(B, [B_PLACE])).toHaveLength(1);
  },
  konumlariKaydet: () => {
    konumlar.konumlariKaydet(A, [{ placeId: B_PLACE, lat: 1, lng: 1 }]);
    expect(konumlar.konumlariGetir(B, [B_PLACE])[0]).toMatchObject({ lat: 41.01, lng: 29.01 });
  },
};

const calismaAlaniTestleri: Record<keyof typeof calismaAlani, () => void> = {
  DAVET_GECERLILIK_GUN: () => {
    expect(calismaAlani.DAVET_GECERLILIK_GUN).toBeGreaterThan(0);
  },
  calismaAlaniGetir: () => {
    expect(calismaAlani.calismaAlaniGetir(A)?.id).toBe(A.tenantId);
  },
  calismaAlaniGuncelle: () => {
    const bOnce = calismaAlani.calismaAlaniGetir(B);
    calismaAlani.calismaAlaniGuncelle(A, { ad: "A yeni ad" });
    expect(calismaAlani.calismaAlaniGetir(B)).toEqual(bOnce);
  },
  uyeleriListele: () => {
    expect(calismaAlani.uyeleriListele(A).map((u) => u.userId)).not.toContain(bKullaniciId);
  },
  uyeCikar: () => {
    expect(calismaAlani.uyeCikar(A, bKullaniciId)).toBe(false);
    expect(calismaAlani.uyeleriListele(B).map((u) => u.userId)).toContain(bKullaniciId);
  },
  davetOlustur: () => {
    const davet = calismaAlani.davetOlustur(A, { eposta: "X@Ornek.test", rol: "uye" });
    expect(davet.tenantId).toBe(A.tenantId);
    expect(calismaAlani.davetleriListele(B).map((d) => d.id)).not.toContain(davet.id);
  },
  davetleriListele: () => {
    expect(calismaAlani.davetleriListele(A).map((d) => d.id)).not.toContain(bDavetId);
  },
  davetIptal: () => {
    expect(calismaAlani.davetIptal(A, bDavetId)).toBe(false);
    expect(calismaAlani.davetleriListele(B).map((d) => d.id)).toContain(bDavetId);
  },
};

const MODULLER = {
  taramalar: [taramalar, taramaTestleri],
  kayitlar: [kayitlar, kayitTestleri],
  olaylar: [olaylar, olayTestleri],
  kullanim: [kullanim, kullanimTestleri],
  konumlar: [konumlar, konumTestleri],
  "calisma-alani": [calismaAlani, calismaAlaniTestleri],
} as const;

for (const [modulAdi, [, testler]] of Object.entries(MODULLER)) {
  describe(`izolasyon: repo/${modulAdi}`, () => {
    for (const [fonksiyon, test] of Object.entries(testler as Record<string, () => void>)) {
      it(`${fonksiyon}: A, B'nin verisine erişemez`, () => {
        test();
        bDegismedi();
      });
    }
  });
}

describe("izolasyon: kapsam ve ek güvenceler", () => {
  it("her depo fonksiyonunun bir izolasyon testi var", () => {
    for (const [modulAdi, [modul, testler]] of Object.entries(MODULLER)) {
      const disaAktarilan = Object.keys(modul).sort();
      expect(disaAktarilan, `repo/${modulAdi}`).toEqual(Object.keys(testler).sort());
    }
  });

  it("veritabanı, olayın başka kiracının kaydına bağlanmasını reddeder (bileşik yabancı anahtar)", () => {
    expect(() =>
      db
        .insert(leadEvents)
        .values({ id: crypto.randomUUID(), tenantId: A.tenantId, leadId: bKayit.id, tur: "not" })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it("üye olmayan kiracı için bağlam üretilemez", () => {
    const yabanci = kullaniciOlustur("Yabanci");
    expect(baglamUret(yabanci.id, B.tenantId)).toBeNull();
    expect(baglamUret(bKullaniciId, A.tenantId)).toBeNull();
  });

  it("'uye' rolü yönetici işlemlerini yapamaz", () => {
    const uye = kullaniciOlustur("Uye");
    db.$client
      .prepare("insert into memberships (user_id, tenant_id, rol) values (?, ?, 'uye')")
      .run(uye.id, A.tenantId);
    const uyeCtx = baglamUret(uye.id, A.tenantId)!;
    expect(uyeCtx.rol).toBe("uye");
    expect(() => calismaAlani.davetOlustur(uyeCtx, { eposta: "z@ornek.test", rol: "yonetici" })).toThrow(YetkiHatasi);
    expect(() => calismaAlani.calismaAlaniGuncelle(uyeCtx, { ad: "x" })).toThrow(YetkiHatasi);
  });
});
