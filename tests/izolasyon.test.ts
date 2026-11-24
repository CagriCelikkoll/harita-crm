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
import * as iceAktarmalar from "@/server/repo/ice-aktarmalar";
import * as waBaglantilari from "@/server/repo/whatsapp-baglantilari";
import * as waSablonlari from "@/server/repo/whatsapp-sablonlari";
import * as waGelen from "@/server/repo/whatsapp-gelen";
import * as gelenKutusu from "@/server/repo/gelen-kutusu";
import * as hazirCevaplar from "@/server/repo/hazir-cevaplar";
import * as pushAbonelikleri from "@/server/repo/push-abonelikleri";
import * as kampanyaGorselleri from "@/server/repo/kampanya-gorselleri";
import * as denetim from "@/server/repo/denetim";
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
let bIceAktarma: iceAktarmalar.IceAktarma;
let bWaBaglanti: waBaglantilari.WhatsappBaglantisi;
let bWaSablon: waSablonlari.WhatsappSablonu;
let bSohbet: gelenKutusu.Sohbet;
let bMedya: gelenKutusu.SohbetMedyasi;
let bSohbetMesajlari: gelenKutusu.SohbetMesajiSatiri[];
let bSohbetNotlari: ReturnType<typeof gelenKutusu.notlariListele>;
let bGelenKutusuSurumu: number;
let bHazirCevap: ReturnType<typeof hazirCevaplar.hazirCevapEkle>;
let bPushCihazi: pushAbonelikleri.PushCihazi;
let bGorsel: kampanyaGorselleri.KampanyaGorseli;
let bGorselliKampanya: kampanyalar.Kampanya;
let bDenetim: denetim.DenetimKaydi;
const B_PUSH = { endpoint: "https://fcm.googleapis.com/fcm/send/b-cihazi", keys: { p256dh: `B${"A".repeat(86)}`, auth: "B".repeat(22) } };
const B_SABLON: waSablonlari.SenkronSablonu = {
  metaId: "b-1",
  ad: "b_sablon",
  dil: "tr",
  kategori: "UTILITY",
  durum: "APPROVED",
  parametreBicimi: null,
  bilesenler: [{ type: "BODY", text: "B" }],
  baslikBicimi: null,
  degiskenler: [],
  abonelikButonu: false,
  destekNedeni: null,
  kalite: null,
};
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
  iletiAyarlari.iysKontroluDegistir(B, { acik: false, onay: true });
  bDenetim = denetim.denetimKayitlariListele(B)[0];
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
  bIceAktarma = iceAktarmalar.iceAktarmaOlustur(B, { dosyaAdi: "b.csv", satirlar: [["Telefon"], ["0533 111 11 11"]] });
  bWaBaglanti = waBaglantilari.baglantiEkle(B, { ad: "B Merkez", wabaId: "900001", phoneNumberId: "900002", sifreliVeri: "v1:B-wa", numaraDogrulamaTarihi: new Date() });
  waSablonlari.sablonlariSenkronla(B, "900001", [B_SABLON]);
  bWaBaglanti = waBaglantilari.baglantiGetir(B, bWaBaglanti.id)!;
  bWaSablon = waSablonlari.sablonlariListele(B)[0];
  waGelen.gelenIletiKaydet(B, "wamid.B-gelen");
  // Gelen kutusu: B'nin sohbeti (gelen + giden mesaj, iç not, atama).
  const gelen = gelenKutusu.gelenMesajYaz(B, { baglantiId: bWaBaglanti.id, leadId: bKisi.id, wamid: "wamid.B-sohbet", tur: "text", metin: "B'nin gizli mesajı", medyaId: null, metaZamani: null })!;
  gelenKutusu.gidenMesajYaz(B, { baglantiId: bWaBaglanti.id, leadId: bKisi.id, kaynak: "temsilci", tur: "text", metin: "B yanıtı", wamid: "wamid.B-giden", istemciKimligi: "B-istemci", gonderenKullanici: bKullaniciId, teslimDurumu: "gonderildi", ilkDurum: "acik" });
  const fotograf = gelenKutusu.gelenMesajYaz(B, { baglantiId: bWaBaglanti.id, leadId: bKisi.id, wamid: "wamid.B-foto", tur: "image", metin: null, medyaId: "777001", medya: { mime: "image/jpeg", dosyaAdi: null, metaSha256: null }, metaZamani: null })!;
  db.$client.prepare("update sohbet_medyalari set durum = 'indirildi', yol = ?, boyut = 1234 where mesaj_id = ?").run(`${B.tenantId}/2026-11/b-foto`, fotograf.mesajId);
  bMedya = gelenKutusu.sohbetMesajlariGetir(B, gelen.sohbetId).find((m) => m.id === fotograf.mesajId)!.medya!;
  gelenKutusu.notEkle(B, gelen.sohbetId, "B'nin iç notu");
  gelenKutusu.sohbetGuncelle(B, gelen.sohbetId, { atananKullanici: bKullaniciId });
  bSohbet = gelenKutusu.sohbetGetir(B, gelen.sohbetId)!;
  bSohbetMesajlari = gelenKutusu.sohbetMesajlariGetir(B, bSohbet.id);
  bSohbetNotlari = gelenKutusu.notlariListele(B, bSohbet.id);
  bGelenKutusuSurumu = gelenKutusu.gelenKutusuSurumuGetir(B);
  bHazirCevap = hazirCevaplar.hazirCevapEkle(B, { baslik: "B fiyat", metin: "B'nin metni" });
  bPushCihazi = pushAbonelikleri.pushAboneligiKaydet(B, B_PUSH, "B cihazı");
  // Görselli WhatsApp kampanyası: görsel (mesajsız medya satırı) ve Meta'ya yüklenmiş kimliği.
  bGorsel = kampanyaGorselleri.kampanyaGorseliEkle(B, { yol: `${B.tenantId}/2026-11/b-gorsel`, mime: "image/png", boyut: 99, sha256: "b".repeat(64), dosyaAdi: "b.png" });
  bGorselliKampanya = kampanyalar.kampanyaOlustur(
    B,
    { kanal: "whatsapp_api", ad: "B görselli", konu: null, sablon: "S", bosIsimHitabi: null, filtre: {}, sandbox: true, planlananTarih: null, gorselMedyaId: bGorsel.id },
    [],
  );
  kampanyaGorselleri.kampanyaMetaGorselYaz(B, bGorselliKampanya.id, { metaId: "B-META-1", numara: "900002", tarih: new Date("2026-11-20T00:00:00Z") });
  // İşçinin aldığı (gönderilmekte olan) mesajı taklit et.
  db.$client.prepare("update message_queue set durum = 'gonderiliyor', kilit_zamani = ? where id = ?").run(Date.now(), bMesajId);
});

/** B'nin mesajlaşma verisinin değişmediğini doğrular. */
function bMesajlasmaDegismedi() {
  expect(iletiAyarlari.iletiAyarlariGetir(B)).toMatchObject({ gonderenUnvani: "B Ltd.", iysNo: "B-IYS" });
  expect(iletiAyarlari.iletiAyarlariGetir(B).sorumlulukOnayTarihi).not.toBeNull();
  expect(iletiAyarlari.iletiAyarlariGetir(B).iysKontrolu).toBe(false);
  expect(denetim.denetimKayitlariListele(B)).toEqual([bDenetim]);
  expect(saglayicilar.saglayiciSifreliGetir(B, "eposta")).toMatchObject({ saglayici: "smtp", sifreliVeri: "v1:B-gizli" });
  expect(engelListesi.engelliOzetler(B, [B_ENGEL.ozet]).has(B_ENGEL.ozet)).toBe(true);
  expect(gonderimSayaci.sayacDegeri(B, "eposta", "2026-10-12")).toBe(1);
  expect(kampanyalar.kampanyaGetir(B, bKampanya.id)).toMatchObject({ durum: "calisiyor", sayilar: { gonderiliyor: 1 } });
  expect(kuyruk.mesajGetir(B, bMesajId)).toMatchObject({ durum: "gonderiliyor" });
  expect(whatsapp.ogeGetir(B, bOgeId)).toMatchObject({ durum: "bekliyor", adresOzeti: null, leadId: bKayit.id });
  expect(kampanyaGorselleri.kampanyaGorseliGetir(B, bGorsel.id)).toEqual(bGorsel);
  expect(kampanyaGorselleri.kampanyaGorselAlanlari(B, bGorselliKampanya.id)).toMatchObject({
    gorselMedyaId: bGorsel.id,
    metaGorselId: "B-META-1",
    metaGorselNumarasi: "900002",
  });
}

/** B'nin verisinin hiç değişmediğini doğrular. */
function bDegismedi() {
  expect(taramalar.taramaGetir(B, bTarama.id)).toEqual(bTarama);
  expect(kayitlar.kayitGetir(B, bKayit.id)).toEqual(bKayit);
  expect(olaylar.olayGetir(B, bOlay.id)).toEqual(bOlay);
  expect(kayitlar.kayitlariListele(B).toplam).toBe(3);
  expect(kayitlar.kayitGetir(B, bKisi.id)).toEqual(bKisi);
  expect(whatsappKisileri.whatsappKisisiGetir(B, bKisi.id)).toEqual(bWaKisi);
  expect(iceAktarmalar.iceAktarmaGetir(B, bIceAktarma.id)).toEqual(bIceAktarma);
  expect(waBaglantilari.baglantiGetir(B, bWaBaglanti.id)).toEqual(bWaBaglanti);
  expect(waBaglantilari.baglantilariListele(B)).toEqual([bWaBaglanti]);
  expect(waSablonlari.sablonGetir(B, bWaSablon.id)).toEqual(bWaSablon);
  expect(gelenKutusu.sohbetGetir(B, bSohbet.id)).toEqual(bSohbet);
  expect(gelenKutusu.sohbetMesajlariGetir(B, bSohbet.id)).toEqual(bSohbetMesajlari);
  expect(gelenKutusu.notlariListele(B, bSohbet.id)).toEqual(bSohbetNotlari);
  expect(gelenKutusu.gelenKutusuSurumuGetir(B)).toBe(bGelenKutusuSurumu);
  expect(gelenKutusu.medyaGetir(B, bMedya.id)).toEqual(bMedya);
  expect(hazirCevaplar.hazirCevaplariListele(B)).toEqual([bHazirCevap]);
  expect(pushAbonelikleri.pushCihazlariListele(B)).toEqual([bPushCihazi]);
  expect(db.$client.prepare("select user_id, tenant_id, p256dh from push_abonelikleri where endpoint = ? and tenant_id = ?").all(B_PUSH.endpoint, B.tenantId)).toEqual([
    { user_id: B.userId, tenant_id: B.tenantId, p256dh: B_PUSH.keys.p256dh },
  ]);
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
  kayitlariTopluGuncelle: () => {
    const olaySayisi = olaylar.olaylariListele(B, bKayit.id).length;
    // id ile: B'nin kaydı A'nın seçimine konsa da bulunmaz, dokunulmaz.
    expect(kayitlar.kayitlariTopluGuncelle(A, { idler: [bKayit.id] }, { tur: "etiket_ekle", etiket: "ele-gecirildi" })).toMatchObject({
      hedef: 0,
      degisen: 0,
      bulunamayan: 1,
    });
    expect(kayitlar.kayitlariTopluGuncelle(A, { idler: [bKayit.id] }, { tur: "alici_turu", aliciTuru: "bireysel" }).degisen).toBe(0);
    // "Filtreye uyan tümü": süzgeç yalnızca A'nın kayıtlarında çalışır; B'nin etiketi kalır.
    expect(kayitlar.kayitlariTopluGuncelle(A, { filtre: { grup: "tum", etiket: "gizli-b" } }, { tur: "etiket_kaldir", etiket: "gizli-b" }).hedef).toBe(0);
    expect(kayitlar.kayitGetir(B, bKayit.id)).toEqual(bKayit);
    expect(olaylar.olaylariListele(B, bKayit.id)).toHaveLength(olaySayisi);
  },
  kayitSil: () => {
    expect(kayitlar.kayitSil(A, bKayit.id)).toBe(false);
    expect(kayitlar.kayitGetir(B, bKayit.id)).not.toBeNull();
  },
  taramaSonuclariListele: () => {
    // B'nin taramasının sonuçları A'nın bağlamıyla görünmez; B kendi sonuçlarını görür.
    expect(kayitlar.taramaSonuclariListele(A, bTarama.id)).toMatchObject({ toplam: 0, kayitlar: [], sayilar: { bulunan: 0 } });
    expect(kayitlar.taramaSonuclariListele(B, bTarama.id).toplam).toBeGreaterThanOrEqual(2);
  },
  grupSayilari: () => {
    // B'nin 2 taramadan gelmiş (incelenmemiş) kaydı A'nın sekme sayılarına karışmaz.
    const a = kayitlar.grupSayilari(A);
    expect(a.tum).toBe(kayitlar.kayitlariListele(A, { grup: "tum" }).toplam);
    expect(kayitlar.grupSayilari(B).incelenmemis).toBeGreaterThanOrEqual(1);
    expect(kayitlar.kayitlariListele(A, { grup: "incelenmemis" }).kayitlar.every((k) => k.tenantId === A.tenantId)).toBe(true);
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
  incelemeAyarla: () => {
    expect(kayitlar.incelemeAyarla(A, [bKayit.id, bKisi.id], "ilgilenmiyor")).toBe(0);
    expect(kayitlar.kayitGetir(B, bKayit.id)).toEqual(bKayit);
    expect(kayitlar.kayitGetir(B, bKisi.id)).toEqual(bKisi);
  },
  incelenmemisSayilari: () => {
    expect(kayitlar.incelenmemisSayilari(A, [bTarama.id]).size).toBe(0);
    expect(kayitlar.incelenmemisSayilari(B, [bTarama.id]).get(bTarama.id)).toBe(2);
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
  sistemOlayiEkle: () => {
    const sayi = olaylar.olaylariListele(B, bKayit.id).length;
    expect(olaylar.sistemOlayiEkle(A, bKayit.id, "whatsapp_gelen", "sızma")).toBeNull();
    expect(olaylar.olaylariListele(B, bKayit.id)).toHaveLength(sayi);
  },
  topluOlayEkle: () => {
    const sayi = olaylar.olaylariListele(B, bKayit.id).length;
    expect(olaylar.topluOlayEkle(A, [bKayit.id], "bilgi", "sızma")).toBe(0);
    expect(olaylar.olaylariListele(B, bKayit.id)).toHaveLength(sayi);
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
    expect(kullanim.kotaDurumu(A)).toMatchObject({ kullanilan: 0, kota: 30_000, doldu: false });
    expect(kullanim.kotaDurumu(B)).toMatchObject({ kullanilan: 7, kota: 9, kalan: 2 });
    db.$client.prepare("update tenants set aylik_places_kotasi = 30000 where id = ?").run(B.tenantId);
  },
  kullanimYaz: () => {
    // A'nın harita yüklemesi yalnızca A'nın sayacına ve kalemine yazılır.
    const once = { toplam: kullanim.aylikPlacesBirimi(B), dokum: kullanim.kullanimDokumu(B) };
    kullanim.kullanimYaz(A, 7, "harita");
    expect(kullanim.kullanimDokumu(A).harita).toBe(100);
    expect({ toplam: kullanim.aylikPlacesBirimi(B), dokum: kullanim.kullanimDokumu(B) }).toEqual(once);
    kullanim.kotaIadeEt(A, 7, { kalem: "harita" });
  },
  kullanimDokumu: () => {
    // A'nın kalemli kullanımı B'nin dökümüne karışmaz.
    const once = kullanim.kullanimDokumu(B);
    expect(kullanim.kotaAyir(A, 3, { kalem: "tarama" })).toBe(true);
    expect(kullanim.kullanimDokumu(A).tarama).toBe(100);
    expect(kullanim.kullanimDokumu(B)).toEqual(once);
    kullanim.kotaIadeEt(A, 3, { kalem: "tarama" });
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
  iysKontroluDegistir: () => {
    // A'nın açıp kapatması B'nin ayarını ve denetim kaydını değiştirmez (B'de kapalı, tek kayıt).
    expect(iletiAyarlari.iysKontroluDegistir(A, { acik: false, onay: true })).toBe(true);
    expect(iletiAyarlari.iletiAyarlariGetir(A).iysKontrolu).toBe(false);
    expect(iletiAyarlari.iysKontroluDegistir(A, { acik: true })).toBe(true);
    expect(denetim.denetimKayitlariListele(A).every((d) => d.tenantId === A.tenantId)).toBe(true);
  },
};

const denetimTestleri: Record<keyof typeof denetim, () => void> = {
  denetimKayitlariListele: () => {
    expect(denetim.denetimKayitlariListele(A).map((d) => d.id)).not.toContain(bDenetim.id);
    expect(denetim.denetimKayitlariListele(A, { olay: "iys_kontrolu" }).map((d) => d.id)).not.toContain(bDenetim.id);
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
  kayitTumAdresOzetleri: () => {
    // A, B'nin kaydının adres özetlerini okuyamaz.
    expect(engelListesi.kayitTumAdresOzetleri(db, A, bKayit.id)).toEqual([]);
  },
  retliKayitAdresleriniEngelle: () => {
    const once = engelListesi.engelSayisi(B);
    engelListesi.retliKayitAdresleriniEngelle(db, A, bKayit.id);
    expect(engelListesi.engelSayisi(A)).toBe(0);
    expect(engelListesi.engelSayisi(B)).toBe(once);
  },
  engelliKayitlar: () => {
    // B'nin engel listesi A'nın kayıtlarını etkilemez (özetler kiracıya özgü).
    const bEngelliKisi = { id: "x", eposta: null, ekTelefon: "0533 444 55 66" };
    expect(engelListesi.engelliKayitlar(A, [bEngelliKisi]).size).toBe(0);
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
  buAyGonderilenMesaj: () => {
    // B'nin gönderilmiş mesajı A'nın sayısına girmez. (B'nin mesajları geçici olarak "gönderildi" yapılır, sonra geri alınır.)
    const onceki = db.$client.prepare("select id, durum, gonderim_tarihi from message_queue where kampanya_id = ?").all(bKampanya.id) as {
      id: string;
      durum: string;
      gonderim_tarihi: number | null;
    }[];
    const once = kampanyalar.buAyGonderilenMesaj(A);
    try {
      db.$client.prepare("update message_queue set durum = 'gonderildi', gonderim_tarihi = ? where kampanya_id = ?").run(Date.now(), bKampanya.id);
      expect(kampanyalar.buAyGonderilenMesaj(B)).toBeGreaterThan(0);
      expect(kampanyalar.buAyGonderilenMesaj(A)).toBe(once);
    } finally {
      const geri = db.$client.prepare("update message_queue set durum = ?, gonderim_tarihi = ? where id = ?");
      for (const m of onceki) geri.run(m.durum, m.gonderim_tarihi, m.id);
    }
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
  whatsappKampanyalariniDuraklat: () => {
    expect(kampanyalar.whatsappKampanyalariniDuraklat(A, "kalite_dusuk", { kampanyaId: bKampanya.id })).toBe(0);
    // B'nin numarasının kimliğiyle de A, B'nin kampanyalarını duraklatamaz.
    db.$client.prepare("update kampanyalar set baglanti_id = ? where id = ?").run(bWaBaglanti.id, bKampanya.id);
    expect(kampanyalar.whatsappKampanyalariniDuraklat(A, "kalite_dusuk", { baglantiIdler: [bWaBaglanti.id] })).toBe(0);
    expect(kampanyalar.whatsappKampanyalariniDuraklat(A, "kalite_dusuk", { baglantiIdler: [] })).toBe(0);
    db.$client.prepare("update kampanyalar set baglanti_id = null where id = ?").run(bKampanya.id);
  },
  kampanyaDevamEttir: () => {
    db.$client.prepare("update kampanyalar set durum = 'duraklatildi' where id = ?").run(bKampanya.id);
    expect(kampanyalar.kampanyaDevamEttir(A, bKampanya.id)).toBe(false);
    expect(kampanyalar.kampanyaGetir(B, bKampanya.id)?.durum).toBe("duraklatildi");
    db.$client.prepare("update kampanyalar set durum = 'calisiyor' where id = ?").run(bKampanya.id);
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
  teslimDurumuIsle: () => {
    // B'nin WhatsApp mesajının wamid'i A'nın bildirimiyle değişmez.
    db.$client.prepare("update message_queue set kanal = 'whatsapp_api', saglayici_kimligi = 'wamid.B1' where id = ?").run(bMesajId);
    expect(kuyruk.teslimDurumuIsle(A, "wamid.B1", { durum: "read", hataKodu: null, zaman: new Date() })).toBeNull();
    expect(db.$client.prepare("select teslim_durumu t from message_queue where id = ?").get(bMesajId)).toEqual({ t: null });
    db.$client.prepare("update message_queue set kanal = 'eposta', saglayici_kimligi = null where id = ?").run(bMesajId);
  },
  whatsappSon24Saat: () => {
    // B'nin gönderilmekte olan WhatsApp mesajı A'nın sayımına girmez.
    db.$client.prepare("update message_queue set kanal = 'whatsapp_api' where id = ?").run(bMesajId);
    expect(kuyruk.whatsappSon24Saat(A, new Date(), "")).toBe(0);
    expect(kuyruk.whatsappSon24Saat(B, new Date(), "")).toBe(1);
    db.$client.prepare("update message_queue set kanal = 'eposta' where id = ?").run(bMesajId);
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
  bsuidIleBul: () => {
    expect(whatsappKisileri.bsuidIleBul(A, B_BSUID)).toBeNull();
    expect(whatsappKisileri.bsuidIleBul(B, B_BSUID)).toBe(bKisi.id);
  },
  bsuidAta: () => {
    expect(whatsappKisileri.bsuidAta(A, bKisi.id, "TR.saldiri", "saldirgan")).toBe(false);
  },
  bsuidDegistir: () => {
    expect(whatsappKisileri.bsuidDegistir(A, B_BSUID, "TR.yeni")).toBeNull();
  },
  reklamBilgisiYaz: () => {
    expect(
      whatsappKisileri.reklamBilgisiYaz(A, bKisi.id, { reklamKimligi: "x", reklamBasligi: "x", ctwaClid: null, pencereBitis: new Date() }),
    ).toBe(false);
  },
  gelenKisiOlustur: () => {
    // Kişi her zaman çağıranın kiracısında; B'nin BSUID'i A'da ayrı kişi olabilir.
    const id = whatsappKisileri.gelenKisiOlustur(A, { ad: "Yazan", telefon: null, bsuid: B_BSUID, kullaniciAdi: null, numaraAdi: "A" })!;
    expect(kayitlar.kayitGetir(A, id)?.tenantId).toBe(A.tenantId);
    expect(kayitlar.kayitGetir(B, id)).toBeNull();
    expect(whatsappKisileri.bsuidIleBul(B, B_BSUID)).toBe(bKisi.id);
    kayitlar.kayitSil(A, id);
  },
  reklamKisisiOlustur: () => {
    // Kişi her zaman çağıranın kiracısında; B'nin BSUID'i A'da ayrı kişi olabilir (BSUID işletmeye özel).
    const id = whatsappKisileri.reklamKisisiOlustur(A, {
      ad: "Reklam",
      telefon: null,
      bsuid: B_BSUID,
      kullaniciAdi: null,
      aliciTuru: "bireysel",
      reklam: { reklamKimligi: "ad1", reklamBasligi: "R", ctwaClid: null, pencereBitis: new Date() },
    })!;
    expect(kayitlar.kayitGetir(A, id)?.tenantId).toBe(A.tenantId);
    expect(kayitlar.kayitGetir(B, id)).toBeNull();
    expect(whatsappKisileri.bsuidIleBul(B, B_BSUID)).toBe(bKisi.id);
    kayitlar.kayitSil(A, id);
  },
  whatsappYokIsaretle: () => {
    expect(whatsappKisileri.whatsappYokIsaretle(A, bKisi.id)).toBe(false);
  },
  whatsappIzniAyarla: () => {
    const olaySayisi = olaylar.olaylariListele(B, bKisi.id).length;
    expect(whatsappKisileri.whatsappIzniAyarla(A, bKisi.id, { izin: "yok" })).toEqual({ tamam: false, neden: "bulunamadi" });
    expect(olaylar.olaylariListele(B, bKisi.id)).toHaveLength(olaySayisi);
  },
};

const iceAktarmaTestleri: Record<keyof typeof iceAktarmalar, () => void> = {
  iceAktarmaOlustur: () => {
    const o = iceAktarmalar.iceAktarmaOlustur(A, { dosyaAdi: "a.csv", satirlar: [["x"], ["y"]] });
    expect(o.tenantId).toBe(A.tenantId);
    expect(iceAktarmalar.iceAktarmaGetir(B, o.id)).toBeNull();
    iceAktarmalar.iceAktarmaIptal(A, o.id);
  },
  iceAktarmaGetir: () => {
    expect(iceAktarmalar.iceAktarmaGetir(A, bIceAktarma.id)).toBeNull();
  },
  iceAktarmaIptal: () => {
    expect(iceAktarmalar.iceAktarmaIptal(A, bIceAktarma.id)).toBe(false);
  },
  iceAktarmaUygula: () => {
    const plan = {
      eslem: { telefon: 0 },
      yeniler: [{ kisi: { kaynak: "ice_aktarma" as const, ekTelefon: "0533 111 11 11" }, izin: null }],
      doldurmalar: [{ leadId: bKisi.id, alanlar: { yetkiliAdi: "ele geçirildi" }, izin: null }],
      sayilar: { hatali: 0, cakisan: 0, engelli: 0 },
      beyanOnaylandi: false,
    };
    expect(iceAktarmalar.iceAktarmaUygula(A, bIceAktarma.id, plan)).toBeNull();
    // A kendi oturumuyla bile B'nin kaydını dolduramaz.
    const o = iceAktarmalar.iceAktarmaOlustur(A, { dosyaAdi: "a.csv", satirlar: [["x"], ["y"]] });
    expect(iceAktarmalar.iceAktarmaUygula(A, o.id, { ...plan, yeniler: [] })).toEqual({ eklenen: [], guncellenen: [] });
  },
};

const waBaglantiTestleri: Record<keyof typeof waBaglantilari, () => void> = {
  baglantilariListele: () => {
    expect(waBaglantilari.baglantilariListele(A)).toEqual([]);
  },
  baglantiGetir: () => {
    // B'nin numarasının kimliğiyle de A bulamaz.
    expect(waBaglantilari.baglantiGetir(A, bWaBaglanti.id)).toBeNull();
  },
  numaraAdiDuzelt: () => {
    expect(waBaglantilari.numaraAdiDuzelt("  Şube   2 ")).toBe("Şube 2");
    expect(() => waBaglantilari.numaraAdiDuzelt(" ")).toThrow(/ad verin/);
  },
  baglantiEkle: () => {
    // A kendi numarasını ekler; B'ninkine dokunmaz. B'nin numarasını alamaz (tekillik). Aynı ad başka alanda serbest.
    const a = waBaglantilari.baglantiEkle(A, { ad: "B Merkez", wabaId: "910001", phoneNumberId: "910002", sifreliVeri: "v1:A", numaraDogrulamaTarihi: new Date() });
    expect(a.tenantId).toBe(A.tenantId);
    expect(a.webhookKimligi).not.toBe(bWaBaglanti.webhookKimligi);
    expect(() =>
      waBaglantilari.baglantiEkle(A, { ad: "A Şube", wabaId: "910001", phoneNumberId: "900002", sifreliVeri: "v1:A", numaraDogrulamaTarihi: new Date() }),
    ).toThrow(/UNIQUE/);
    waBaglantilari.baglantiSil(A, a.id);
  },
  baglantiGuncelle: () => {
    expect(
      waBaglantilari.baglantiGuncelle(A, bWaBaglanti.id, { wabaId: "1", phoneNumberId: "2", sifreliVeri: "v1:saldiri", numaraDogrulamaTarihi: new Date() }),
    ).toBeNull();
  },
  baglantiAdiYaz: () => {
    expect(waBaglantilari.baglantiAdiYaz(A, bWaBaglanti.id, "Ele geçirildi")).toBe(false);
  },
  baglantiSifreliVeriYaz: () => {
    expect(waBaglantilari.baglantiSifreliVeriYaz(A, bWaBaglanti.id, "v1:saldiri", true)).toBe(false);
  },
  testModuAyarla: () => {
    expect(waBaglantilari.testModuAyarla(A, bWaBaglanti.id, false)).toEqual({ tamam: false, neden: "baglanti_yok" });
  },
  uygulamaPayiAyarla: () => {
    expect(waBaglantilari.uygulamaPayiAyarla(A, bWaBaglanti.id, 100)).toBe(false);
  },
  numaraBilgisiYaz: () => {
    expect(waBaglantilari.numaraBilgisiYaz(A, bWaBaglanti.id, { kalite: "RED", sonHata: "x", metaDurumu: "OFFLINE" })).toBe(false);
  },
  sonHataYaz: () => {
    // A, B'nin numarasının "Son hata" satırını yazamaz.
    expect(waBaglantilari.sonHataYaz(A, bWaBaglanti.id, "ele geçirildi")).toBe(false);
    expect(waBaglantilari.baglantiGetir(B, bWaBaglanti.id)?.sonHata).not.toBe("ele geçirildi");
  },
  numaraDogrulamaYaz: () => {
    // A, B'nin numarasının doğrulamasını kaldıramaz.
    expect(waBaglantilari.numaraDogrulamaYaz(A, bWaBaglanti.id, "900002", null)).toBe(false);
    expect(waBaglantilari.baglantiGetir(B, bWaBaglanti.id)?.numaraDogrulamaTarihi).toBeInstanceOf(Date);
  },
  baglantiSil: () => {
    expect(waBaglantilari.baglantiSil(A, bWaBaglanti.id)).toBe(false);
  },
  ayniWabaBaglantilari: () => {
    expect(waBaglantilari.ayniWabaBaglantilari(A, bWaBaglanti.id)).toEqual([]);
  },
  limitKatmaniYaz: () => {
    // B'nin WABA kimliğiyle de A yazamaz.
    expect(waBaglantilari.limitKatmaniYaz(A, "900001", "TIER_UNLIMITED")).toBe(0);
  },
  hesapKilidiYaz: () => {
    // A, B'nin numarasını kilitleyemez.
    expect(waBaglantilari.hesapKilidiYaz(A, bWaBaglanti.id, 131031)).toEqual([]);
    expect(waBaglantilari.baglantiGetir(B, bWaBaglanti.id)?.hesapKilidiKodu).toBeNull();
  },
  hesapKilidiKaldir: () => {
    // A, B'nin kilidini kaldıramaz.
    waBaglantilari.hesapKilidiYaz(B, bWaBaglanti.id, 368);
    expect(waBaglantilari.hesapKilidiKaldir(A, bWaBaglanti.id)).toBe(false);
    expect(waBaglantilari.baglantiGetir(B, bWaBaglanti.id)?.hesapKilidiKodu).toBe(368);
    waBaglantilari.hesapKilidiKaldir(B, bWaBaglanti.id);
  },
};

const waSablonTestleri: Record<keyof typeof waSablonlari, () => void> = {
  sablonlariListele: () => {
    expect(waSablonlari.sablonlariListele(A)).toEqual([]);
    expect(waSablonlari.sablonlariListele(A, "900001")).toEqual([]);
  },
  sablonGetir: () => {
    expect(waSablonlari.sablonGetir(A, bWaSablon.id)).toBeNull();
  },
  sablonDurumuYaz: () => {
    expect(waSablonlari.sablonDurumuYaz(A, "900001", { metaId: "b-1", ad: "b_sablon", dil: "tr", durum: "DISABLED" })).toBe(false);
  },
  sablonlariSenkronla: () => {
    // A'nın boş senkronu B'nin şablonlarını "silindi" yapmaz; aynı ad A'da ayrı satırdır.
    expect(waSablonlari.sablonlariSenkronla(A, "900001", [])).toEqual({ eklenen: 0, guncellenen: 0, silinen: 0 });
    expect(waSablonlari.sablonlariSenkronla(A, "900001", [{ ...B_SABLON, metaId: "a-1" }])).toMatchObject({ eklenen: 1 });
    waSablonlari.sablonlariSenkronla(A, "900001", []);
  },
};

const waGelenTestleri: Record<keyof typeof waGelen, () => void> = {
  gelenIletiKaydet: () => {
    // Aynı wamid iki kiracıda bağımsızdır: A'nın kaydı B'ninkini etkilemez, B'de zaten var.
    expect(waGelen.gelenIletiKaydet(A, "wamid.B-gelen")).toBe(true);
    expect(waGelen.gelenIletiKaydet(B, "wamid.B-gelen")).toBe(false);
  },
};

const hazirCevapTestleri: Record<keyof typeof hazirCevaplar, () => void> = {
  hazirCevaplariListele: () => {
    expect(hazirCevaplar.hazirCevaplariListele(A).map((c) => c.id)).not.toContain(bHazirCevap.id);
  },
  hazirCevapGetir: () => {
    expect(hazirCevaplar.hazirCevapGetir(A, bHazirCevap.id)).toBeNull();
  },
  hazirCevapEkle: () => {
    // B'deki başlık A'da serbest; kayıt A'ya yazılır.
    const c = hazirCevaplar.hazirCevapEkle(A, { baslik: bHazirCevap.baslik, metin: "A" });
    expect(c.tenantId).toBe(A.tenantId);
    expect(hazirCevaplar.hazirCevapGetir(B, c.id)).toBeNull();
    hazirCevaplar.hazirCevapSil(A, c.id);
  },
  hazirCevapGuncelle: () => {
    expect(hazirCevaplar.hazirCevapGuncelle(A, bHazirCevap.id, { baslik: "Ele geçir", metin: "x" })).toBeNull();
  },
  hazirCevapSil: () => {
    expect(hazirCevaplar.hazirCevapSil(A, bHazirCevap.id)).toBe(false);
  },
};

const pushAbonelikTestleri: Record<keyof typeof pushAbonelikleri, () => void> = {
  pushAboneligiKaydet: () => {
    // Aynı adres A'da ayrı satır olur; B'nin satırı (kullanıcı, anahtarlar) değişmez.
    const a = pushAbonelikleri.pushAboneligiKaydet(A, { ...B_PUSH, keys: { p256dh: `B${"Q".repeat(86)}`, auth: "Q".repeat(22) } }, "A");
    expect(pushAbonelikleri.pushCihazlariListele(A).map((c) => c.id)).toContain(a.id);
    expect(a.id).not.toBe(bPushCihazi.id);
    pushAbonelikleri.pushCihaziKaldir(A, a.id);
  },
  pushAboneligiSil: () => {
    expect(pushAbonelikleri.pushAboneligiSil(A, B_PUSH.endpoint)).toBe(false);
  },
  pushCihazlariListele: () => {
    expect(pushAbonelikleri.pushCihazlariListele(A).map((c) => c.id)).not.toContain(bPushCihazi.id);
  },
  pushCihaziKaldir: () => {
    expect(pushAbonelikleri.pushCihaziKaldir(A, bPushCihazi.id)).toBe(false);
  },
};

const gelenKutusuTestleri: Record<keyof typeof gelenKutusu, () => void> = {
  gelenKutusuSurumuGetir: () => {
    expect(gelenKutusu.gelenKutusuSurumuGetir(A)).not.toBe(bGelenKutusuSurumu);
  },
  sohbetGetir: () => {
    expect(gelenKutusu.sohbetGetir(A, bSohbet.id)).toBeNull();
  },
  sohbetBul: () => {
    expect(gelenKutusu.sohbetBul(A, bWaBaglanti.id, bKisi.id)).toBeNull();
  },
  gelenMesajYaz: () => {
    // B'nin kaydına A adına sohbet açılamaz.
    expect(() =>
      gelenKutusu.gelenMesajYaz(A, { baglantiId: bWaBaglanti.id, leadId: bKisi.id, wamid: "wamid.A-saldiri", tur: "text", metin: "x", medyaId: null, metaZamani: null }),
    ).toThrow();
  },
  gidenMesajYaz: () => {
    expect(() =>
      gelenKutusu.gidenMesajYaz(A, { baglantiId: bWaBaglanti.id, leadId: bKisi.id, kaynak: "temsilci", tur: "text", metin: "x", wamid: null, teslimDurumu: null, ilkDurum: "acik" }),
    ).toThrow();
  },
  istemciMesajiBul: () => {
    expect(gelenKutusu.istemciMesajiBul(A, "B-istemci")).toBeNull();
    expect(gelenKutusu.istemciMesajiBul(B, "B-istemci")).not.toBeNull();
  },
  mesajTeslimDurumuYaz: () => {
    expect(gelenKutusu.mesajTeslimDurumuYaz(A, "wamid.B-giden", "read", null)).toBe(false);
  },
  mesajSatiriGetir: () => {
    for (const m of bSohbetMesajlari) expect(gelenKutusu.mesajSatiriGetir(A, m.id)).toBeNull();
    expect(gelenKutusu.mesajSatiriGetir(B, bSohbetMesajlari[0].id)?.id).toBe(bSohbetMesajlari[0].id);
  },
  gidenMesajSonucuYaz: () => {
    // B'nin mesajı "failed" olsa bile A adına güncellenemez (sonuç denetimi: B'nin mesajları değişmez).
    for (const m of bSohbetMesajlari) {
      expect(gelenKutusu.gidenMesajSonucuYaz(A, m.id, { wamid: "wamid.A-saldiri", teslimDurumu: "gonderildi", teslimHataKodu: null, hataMetni: null })).toBe(false);
    }
  },
  sohbetleriListele: () => {
    expect(gelenKutusu.sohbetleriListele(A).toplam).toBe(0);
    expect(gelenKutusu.sohbetleriListele(A, { idler: [bSohbet.id] }).satirlar).toEqual([]);
    expect(gelenKutusu.sohbetleriListele(B).toplam).toBe(1);
  },
  okunmamisSayilari: () => {
    expect(gelenKutusu.okunmamisSayilari(A).size).toBe(0);
  },
  sohbetMesajlariGetir: () => {
    expect(gelenKutusu.sohbetMesajlariGetir(A, bSohbet.id)).toEqual([]);
    expect(gelenKutusu.sohbetMesajlariGetir(A, bSohbet.id, { sonraSurum: 0 })).toEqual([]);
  },
  degisenSohbetler: () => {
    expect(gelenKutusu.degisenSohbetler(A, 0)).not.toContain(bSohbet.id);
  },
  okunduIsaretle: () => {
    expect(gelenKutusu.okunduIsaretle(A, bSohbet.id)).toBeNull();
  },
  sohbetGuncelle: () => {
    expect(gelenKutusu.sohbetGuncelle(A, bSohbet.id, { durum: "kapali", atananKullanici: null })).toBeNull();
  },
  notEkle: () => {
    expect(gelenKutusu.notEkle(A, bSohbet.id, "saldırı")).toBeNull();
  },
  notlariListele: () => {
    expect(gelenKutusu.notlariListele(A, bSohbet.id)).toEqual([]);
  },
  atanabilirUyeler: () => {
    expect(gelenKutusu.atanabilirUyeler(A).map((u) => u.id)).not.toContain(bKullaniciId);
  },
  medyaGetir: () => {
    expect(gelenKutusu.medyaGetir(A, bMedya.id)).toBeNull();
  },
  medyaKullanimi: () => {
    // B'nin gelen fotoğrafı (1234) + kampanya görseli (99): ortak medya kotası.
    expect(gelenKutusu.medyaKullanimi(B)).toEqual({ bayt: 1333, adet: 2 });
    expect(gelenKutusu.medyaKullanimi(A)).toEqual({ bayt: 0, adet: 0 });
  },
};

const kampanyaGorselTestleri: Record<keyof typeof kampanyaGorselleri, () => void> = {
  kampanyaGorseliEkle: () => {
    const g = kampanyaGorselleri.kampanyaGorseliEkle(A, { yol: `${A.tenantId}/2026-11/a-gorsel`, mime: "image/jpeg", boyut: 10, sha256: "a".repeat(64), dosyaAdi: "a.jpg" });
    expect(g.tenantId).toBe(A.tenantId);
    expect(kampanyaGorselleri.kampanyaGorseliGetir(B, g.id)).toBeNull();
    db.$client.prepare("delete from sohbet_medyalari where id = ?").run(g.id);
  },
  kampanyaGorseliGetir: () => {
    // B'nin kampanya görseli de, B'nin gelen medyası da A'ya dönmez (önizleme adresi /api/medya de medyaGetir ile).
    expect(kampanyaGorselleri.kampanyaGorseliGetir(A, bGorsel.id)).toBeNull();
    expect(kampanyaGorselleri.kampanyaGorseliGetir(A, bMedya.id)).toBeNull();
    expect(gelenKutusu.medyaGetir(A, bGorsel.id)).toBeNull();
    // Gelen medya satırı kampanya görseli sayılmaz (B için bile).
    expect(kampanyaGorselleri.kampanyaGorseliGetir(B, bMedya.id)).toBeNull();
  },
  kampanyaGorselAlanlari: () => {
    expect(kampanyaGorselleri.kampanyaGorselAlanlari(A, bGorselliKampanya.id)).toBeNull();
  },
  kampanyaMetaGorselYaz: () => {
    expect(kampanyaGorselleri.kampanyaMetaGorselYaz(A, bGorselliKampanya.id, { metaId: "ele-gecirildi", numara: "1", tarih: new Date() })).toBe(false);
    expect(kampanyaGorselleri.kampanyaMetaGorselYaz(A, bGorselliKampanya.id, null)).toBe(false);
  },
};

const MODULLER = {
  "kampanya-gorselleri": [kampanyaGorselleri, kampanyaGorselTestleri],
  denetim: [denetim, denetimTestleri],
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
  "ice-aktarmalar": [iceAktarmalar, iceAktarmaTestleri],
  "whatsapp-baglantilari": [waBaglantilari, waBaglantiTestleri],
  "whatsapp-sablonlari": [waSablonlari, waSablonTestleri],
  "whatsapp-gelen": [waGelen, waGelenTestleri],
  "gelen-kutusu": [gelenKutusu, gelenKutusuTestleri],
  "hazir-cevaplar": [hazirCevaplar, hazirCevapTestleri],
  "push-abonelikleri": [pushAbonelikleri, pushAbonelikTestleri],
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
