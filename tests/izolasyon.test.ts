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
import fs from "node:fs";
import path from "node:path";
import * as calismaAlani from "@/server/repo/calisma-alani";
import * as engelListesi from "@/server/repo/engel-listesi";
import * as gonderimSayaci from "@/server/repo/gonderim-sayaci";
import * as iletiAyarlari from "@/server/repo/ileti-ayarlari";
import * as kampanyalar from "@/server/repo/kampanyalar";
import * as kuyruk from "@/server/repo/kuyruk";
import * as saglayicilar from "@/server/repo/saglayicilar";
import * as whatsapp from "@/server/repo/whatsapp-listesi";
import * as whatsappKisileri from "@/server/repo/whatsapp-kisileri";
import { adresOzeti } from "@/server/messaging/adres";
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
let bKampanya: kampanyalar.Kampanya;
let bMesajId: string;
let bOgeId: string;
let bKisi: kayitlar.Kayit;
let bWaKisi: whatsappKisileri.WhatsappKisisi;
const B_BSUID = "TR.1000000000000000001";
const WA_GUN = "2026-10-12";
const B_ENGEL = { tur: "eposta" as const, ozet: "" };
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
  kullanim.kotaAyir(B, 7);
  bDavetId = calismaAlani.davetOlustur(B, { eposta: "davetli-b@ornek.test", rol: "uye" }).id;

  // Mesajlaşma verisi
  iletiAyarlari.iletiAyarlariGuncelle(B, { gonderenUnvani: "B Ltd.", iysNo: "B-IYS", sorumlulukOnayi: true });
  saglayicilar.saglayiciKaydet(B, "eposta", "smtp", "v1:B-gizli");
  B_ENGEL.ozet = adresOzeti(B.tenantId, "eposta", "engel-b@ornek.test");
  engelListesi.engelEkle(B, [B_ENGEL], "abonelik");
  gonderimSayaci.sayacAyir(B, "eposta", "2026-10-12", 100);
  bKampanya = kampanyalar.kampanyaOlustur(
    B,
    { kanal: "eposta", ad: "B kampanyası", konu: "K", sablon: "S", bosIsimHitabi: null, filtre: {}, sandbox: true, planlananTarih: null },
    [{ leadId: bKayit.id }],
  );
  bMesajId = kampanyalar.kampanyaMesajlari(B, bKampanya.id).mesajlar[0].id;
  whatsapp.listeyeEkle(B, WA_GUN, [bKayit.id]);
  bOgeId = whatsapp.gunlukListe(B, WA_GUN)[0].id;
  // Google dışı kişi (içe aktarma) + WhatsApp izni ve BSUID
  bKisi = kayitlar.kisileriEkle(B, [{ kaynak: "ice_aktarma", isletmeAdi: "B Kişisi", ekTelefon: "0533 444 55 66" }], "test")[0];
  whatsappKisileri.whatsappIzniAyarla(B, bKisi.id, { izin: "var", kaynak: "form" });
  db.$client.prepare("update whatsapp_kisileri set bsuid = ? where lead_id = ?").run(B_BSUID, bKisi.id);
  bKisi = kayitlar.kayitGetir(B, bKisi.id)!;
  bWaKisi = whatsappKisileri.whatsappKisisiGetir(B, bKisi.id)!;
  // İşçinin aldığı (gönderilmekte olan) mesajı taklit et.
  db.$client.prepare("update message_queue set durum = 'gonderiliyor', kilit_zamani = ? where id = ?").run(Date.now(), bMesajId);
});

/** B'nin mesajlaşma verisinin değişmediğini doğrular. */
function bMesajlasmaDegismedi() {
  expect(iletiAyarlari.iletiAyarlariGetir(B)).toMatchObject({ gonderenUnvani: "B Ltd.", iysNo: "B-IYS" });
  expect(iletiAyarlari.iletiAyarlariGetir(B).sorumlulukOnayTarihi).not.toBeNull();
  expect(saglayicilar.saglayiciSifreliGetir(B, "eposta")).toMatchObject({ saglayici: "smtp", sifreliVeri: "v1:B-gizli" });
  expect(engelListesi.engelliOzetler(B, [B_ENGEL.ozet]).has(B_ENGEL.ozet)).toBe(true);
  expect(gonderimSayaci.sayacDegeri(B, "eposta", "2026-10-12")).toBe(1);
  expect(kampanyalar.kampanyaGetir(B, bKampanya.id)).toMatchObject({ durum: "calisiyor", sayilar: { gonderiliyor: 1 } });
  expect(kuyruk.mesajGetir(B, bMesajId)).toMatchObject({ durum: "gonderiliyor" });
  expect(whatsapp.ogeGetir(B, bOgeId)).toMatchObject({ durum: "bekliyor", adresOzeti: null, leadId: bKayit.id });
}

/** B'nin verisinin hiç değişmediğini doğrular. */
function bDegismedi() {
  expect(taramalar.taramaGetir(B, bTarama.id)).toEqual(bTarama);
  expect(kayitlar.kayitGetir(B, bKayit.id)).toEqual(bKayit);
  expect(olaylar.olayGetir(B, bOlay.id)).toEqual(bOlay);
  expect(kayitlar.kayitlariListele(B).toplam).toBe(3);
  expect(kayitlar.kayitGetir(B, bKisi.id)).toEqual(bKisi);
  expect(whatsappKisileri.whatsappKisisiGetir(B, bKisi.id)).toEqual(bWaKisi);
  if (bKampanya) bMesajlasmaDegismedi();
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
    expect(kayitlar.kayitlariListele(B).toplam).toBe(3);
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
    expect(kayitlar.durumSayilari(B).yeni).toBe(3);
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
  ekTelefonluKayitlar: () => {
    // B'nin ikinci kaydına telefon yaz: A görmez, B görür.
    db.$client
      .prepare("update leads set ek_telefon = '0532 999 88 77' where tenant_id = ? and place_id = 'places-b-2'")
      .run(B.tenantId);
    expect(kayitlar.ekTelefonluKayitlar(A)).toEqual([]);
    expect(kayitlar.ekTelefonluKayitlar(B)).toHaveLength(2); // + Google dışı kişi
    db.$client.prepare("update leads set ek_telefon = null where tenant_id = ? and place_id = 'places-b-2'").run(B.tenantId);
  },
  kisileriEkle: () => {
    // Kişi her zaman çağıranın kiracısına eklenir; B'nin numarasıyla aynı numara A'da ayrı kayıttır.
    const [k] = kayitlar.kisileriEkle(A, [{ kaynak: "elle", yetkiliAdi: "A kişisi", ekTelefon: "0533 444 55 66" }], "test");
    expect(k.tenantId).toBe(A.tenantId);
    expect(k.telefonE164).toBe("905334445566");
    expect(kayitlar.kayitGetir(B, k.id)).toBeNull();
    kayitlar.kayitSil(A, k.id);
  },
  telefonlaKayitlar: () => {
    expect(kayitlar.telefonlaKayitlar(A, ["905334445566"])).toEqual([]);
    expect(kayitlar.telefonlaKayitlar(B, ["905334445566"]).map((k) => k.id)).toEqual([bKisi.id]);
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
  kotaAyir: () => {
    // A'nın ayırdığı kota yalnızca A'nın sayacına yazılır.
    const once = kullanim.aylikPlacesBirimi(B);
    expect(kullanim.kotaAyir(A, 3)).toBe(true);
    expect(kullanim.aylikPlacesBirimi(B)).toBe(once);
    kullanim.kotaIadeEt(A, 3);
  },
  kotaIadeEt: () => {
    const once = kullanim.aylikPlacesBirimi(B);
    kullanim.kotaIadeEt(A, 5);
    expect(kullanim.aylikPlacesBirimi(B)).toBe(once);
  },
  aylikPlacesBirimi: () => {
    expect(kullanim.aylikPlacesBirimi(B)).toBe(7);
    expect(kullanim.aylikPlacesBirimi(A)).toBe(0);
  },
  kotaDurumu: () => {
    // A'nın kotası B'nin kullanımını görmez; kota A'nın kendi satırından okunur.
    db.$client.prepare("update tenants set aylik_places_kotasi = 9 where id = ?").run(B.tenantId);
    expect(kullanim.kotaDurumu(A)).toMatchObject({ kullanilan: 0, kota: 6000, doldu: false });
    expect(kullanim.kotaDurumu(B)).toMatchObject({ kullanilan: 7, kota: 9, kalan: 2 });
    db.$client.prepare("update tenants set aylik_places_kotasi = 6000 where id = ?").run(B.tenantId);
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

const iletiAyarlariTestleri: Record<keyof typeof iletiAyarlari, () => void> = {
  iletiAyarlariGetir: () => {
    expect(iletiAyarlari.iletiAyarlariGetir(A)).toMatchObject({ tenantId: A.tenantId, gonderenUnvani: null, iysNo: null });
  },
  iletiAyarlariGuncelle: () => {
    const a = iletiAyarlari.iletiAyarlariGuncelle(A, { gonderenUnvani: "A Ltd.", sorumlulukOnayi: false });
    expect(a.tenantId).toBe(A.tenantId);
    expect(iletiAyarlari.iletiAyarlariGetir(B).gonderenUnvani).toBe("B Ltd.");
  },
};

const saglayiciTestleri: Record<keyof typeof saglayicilar, () => void> = {
  saglayiciDurumlari: () => {
    expect(saglayicilar.saglayiciDurumlari(A).eposta.tanimli).toBe(false);
    expect(JSON.stringify(saglayicilar.saglayiciDurumlari(B))).not.toContain("B-gizli"); // şifreli veri dönmez
  },
  saglayiciSifreliGetir: () => {
    expect(saglayicilar.saglayiciSifreliGetir(A, "eposta")).toBeNull();
  },
  saglayiciKaydet: () => {
    saglayicilar.saglayiciKaydet(A, "eposta", "smtp", "v1:A");
    expect(saglayicilar.saglayiciSifreliGetir(A, "eposta")?.sifreliVeri).toBe("v1:A");
  },
  saglayiciSil: () => {
    expect(saglayicilar.saglayiciSil(A, "eposta")).toBe(true); // yalnızca A'nınki
    expect(saglayicilar.saglayiciSil(A, "eposta")).toBe(false);
  },
};

const engelTestleri: Record<keyof typeof engelListesi, () => void> = {
  engelliOzetler: () => {
    expect(engelListesi.engelliOzetler(A, [B_ENGEL.ozet]).size).toBe(0);
  },
  engelSayisi: () => {
    expect(engelListesi.engelSayisi(A)).toBe(0);
    expect(engelListesi.engelSayisi(B)).toBe(1);
  },
  engelEkle: () => {
    // Aynı özet A'ya eklenince yalnızca A'nın listesine yazılır.
    engelListesi.engelEkle(A, [B_ENGEL], "abonelik");
    expect(engelListesi.engelliOzetler(A, [B_ENGEL.ozet]).size).toBe(1);
    expect(engelListesi.engelSayisi(B)).toBe(1);
    db.$client.prepare("delete from engel_listesi where tenant_id = ?").run(A.tenantId);
  },
  retIsle: () => {
    // A, B'nin kaydını ret yapamaz; adres yalnızca A'nın engel listesine yazılır.
    expect(engelListesi.retIsle(A, { leadId: bKayit.id, adresler: [], kaynak: "abonelik", aciklama: "x" })).toBe(false);
    expect(kayitlar.kayitGetir(B, bKayit.id)?.iletiIzni).toBe("bekliyor");
  },
};

const sayacTestleri: Record<keyof typeof gonderimSayaci, () => void> = {
  sayacAyir: () => {
    expect(gonderimSayaci.sayacAyir(A, "eposta", "2026-10-12", 1)).toBe(true);
    expect(gonderimSayaci.sayacAyir(A, "eposta", "2026-10-12", 1)).toBe(false); // A'nın sınırı B'yi saymaz
  },
  sayacIade: () => {
    gonderimSayaci.sayacIade(A, "eposta", "2026-10-12");
    gonderimSayaci.sayacIade(A, "eposta", "2026-10-12");
  },
  sayacDegeri: () => {
    expect(gonderimSayaci.sayacDegeri(A, "eposta", "2026-10-12")).toBe(0);
  },
};

const kampanyaTestleri: Record<keyof typeof kampanyalar, () => void> = {
  kampanyaAdaylari: () => {
    expect(kampanyalar.kampanyaAdaylari(A, {}).map((k) => k.id)).not.toContain(bKayit.id);
  },
  kampanyaOlustur: () => {
    // B'nin kaydı A'nın kampanyasına giremez.
    const k = kampanyalar.kampanyaOlustur(
      A,
      { kanal: "eposta", ad: "A", konu: "K", sablon: "S", bosIsimHitabi: null, filtre: {}, sandbox: true, planlananTarih: null },
      [{ leadId: bKayit.id }],
    );
    expect(k.tenantId).toBe(A.tenantId);
    expect(kampanyalar.kampanyaMesajlari(A, k.id).toplam).toBe(0);
    expect(kampanyalar.kampanyaGetir(B, k.id)).toBeNull();
  },
  kampanyalariListele: () => {
    expect(kampanyalar.kampanyalariListele(A).map((k) => k.id)).not.toContain(bKampanya.id);
  },
  kampanyaGetir: () => {
    expect(kampanyalar.kampanyaGetir(A, bKampanya.id)).toBeNull();
  },
  kampanyaMesajlari: () => {
    expect(kampanyalar.kampanyaMesajlari(A, bKampanya.id)).toMatchObject({ toplam: 0, mesajlar: [] });
  },
  kampanyaIptal: () => {
    expect(kampanyalar.kampanyaIptal(A, bKampanya.id)).toBe(false);
  },
};

const kuyrukTestleri: Record<keyof typeof kuyruk, () => void> = {
  adreseGonderilenKayitlar: () => {
    db.$client.prepare("update message_queue set adres_ozeti = 'ozet-b' where id = ?").run(bMesajId);
    expect(kuyruk.adreseGonderilenKayitlar(A, "ozet-b")).toEqual([]);
    expect(kuyruk.adreseGonderilenKayitlar(B, "ozet-b")).toEqual([bKayit.id]);
  },
  mesajGetir: () => {
    expect(kuyruk.mesajGetir(A, bMesajId)).toBeNull();
  },
  mesajGonderildi: () => {
    expect(
      kuyruk.mesajGonderildi(A, bMesajId, { saglayiciKimligi: "x", sandbox: false, sandboxIcerik: null, olayAciklamasi: "x" }),
    ).toBe(false);
  },
  mesajBirak: () => {
    expect(kuyruk.mesajBirak(A, bMesajId, { durum: "basarisiz", neden: "x" })).toBe(false);
  },
};

const whatsappTestleri: Record<keyof typeof whatsapp, () => void> = {
  gunlukListe: () => {
    expect(whatsapp.gunlukListe(A, WA_GUN)).toEqual([]);
  },
  gunlukListedekiKayitlar: () => {
    expect(whatsapp.gunlukListedekiKayitlar(A, WA_GUN).size).toBe(0);
    expect(whatsapp.gunlukListedekiKayitlar(B, WA_GUN).has(bKayit.id)).toBe(true);
  },
  listeyeEkle: () => {
    // B'nin kaydı A'nın listesine giremez.
    expect(whatsapp.listeyeEkle(A, WA_GUN, [bKayit.id])).toBe(0);
    expect(whatsapp.gunlukListe(A, WA_GUN)).toEqual([]);
  },
  ogeGetir: () => {
    expect(whatsapp.ogeGetir(A, bOgeId)).toBeNull();
  },
  ogeSonuclandir: () => {
    expect(whatsapp.ogeSonuclandir(A, bOgeId, "atlandi")).toBe(false);
  },
  ogeAdresOzetiYaz: () => {
    expect(whatsapp.ogeAdresOzetiYaz(A, bOgeId, "ozet")).toBe(false);
  },
  whatsappGonderimiKaydet: () => {
    expect(whatsapp.whatsappGonderimiKaydet(A, bKayit.id, WA_GUN)).toBe(false);
  },
};

const whatsappKisiTestleri: Record<keyof typeof whatsappKisileri, () => void> = {
  whatsappKisisiGetir: () => {
    expect(whatsappKisileri.whatsappKisisiGetir(A, bKisi.id)).toBeNull();
  },
  whatsappKisileriGetir: () => {
    expect(whatsappKisileri.whatsappKisileriGetir(A, [bKisi.id]).size).toBe(0);
    expect(whatsappKisileri.whatsappKisileriGetir(B, [bKisi.id]).get(bKisi.id)?.bsuid).toBe(B_BSUID);
  },
  whatsappIzniAyarla: () => {
    const olaySayisi = olaylar.olaylariListele(B, bKisi.id).length;
    expect(whatsappKisileri.whatsappIzniAyarla(A, bKisi.id, { izin: "yok" })).toEqual({ tamam: false, neden: "bulunamadi" });
    expect(olaylar.olaylariListele(B, bKisi.id)).toHaveLength(olaySayisi);
  },
};

const MODULLER = {
  taramalar: [taramalar, taramaTestleri],
  kayitlar: [kayitlar, kayitTestleri],
  olaylar: [olaylar, olayTestleri],
  kullanim: [kullanim, kullanimTestleri],
  konumlar: [konumlar, konumTestleri],
  "calisma-alani": [calismaAlani, calismaAlaniTestleri],
  "ileti-ayarlari": [iletiAyarlari, iletiAyarlariTestleri],
  saglayicilar: [saglayicilar, saglayiciTestleri],
  "engel-listesi": [engelListesi, engelTestleri],
  "gonderim-sayaci": [gonderimSayaci, sayacTestleri],
  kampanyalar: [kampanyalar, kampanyaTestleri],
  kuyruk: [kuyruk, kuyrukTestleri],
  "whatsapp-listesi": [whatsapp, whatsappTestleri],
  "whatsapp-kisileri": [whatsappKisileri, whatsappKisiTestleri],
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
  it("src/server/repo/ altındaki her kiracı modülü bu teste kayıtlı (sistem/ ve baglam hariç)", () => {
    const klasor = path.resolve(__dirname, "../src/server/repo");
    const dosyalar = fs
      .readdirSync(klasor)
      .filter((d) => d.endsWith(".ts") && d !== "baglam.ts")
      .map((d) => d.replace(/\.ts$/, ""))
      .sort();
    expect(dosyalar).toEqual(Object.keys(MODULLER).sort());
  });

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
