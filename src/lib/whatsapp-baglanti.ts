// WhatsApp numarasının istemciye giden durumu (gizli bilgi yok). Sunucu (servisler/whatsapp-api.ts) üretir; istemci
// bileşenleri de kullanır (ör. yeni numara formu için boş durum).
import type { Kalite } from "./whatsapp-api";

export type BaglantiDto = {
  /** null: henüz kaydedilmemiş yeni numara formu. */
  id: string | null;
  ad: string;
  /** "Merkez · …4567": ekranlarda gösterim. */
  etiket: string;
  tanimli: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  erisimAnahtariTanimli: boolean;
  appSecretTanimli: boolean;
  verifyTokenTanimli: boolean;
  webhookAdresi: string | null;
  webhookDogrulandi: boolean;
  imzaliDurumAlindi: boolean;
  /** phone_number_id WABA'ya ait (Graph API); değilse bağlantı kullanılmaz. */
  numaraDogrulandi: boolean;
  testModu: boolean;
  testModuKapatilabilir: boolean;
  /**
   * Test modu kapalıyken (ve kapatılırken) gereken gönderen bilgilerinden eksik olanlar. Test modunda, yalnızca test
   * numaralarına giden kampanyalarda aranmaz.
   */
  gonderenEksikleri: string[];
  testNumaralari: string[];
  uygulamaPayi: number;
  /**
   * Meta hesap düzeyi hata kodu (131031, 368, 131042) geldi: kilit kalkıp "Bağlantıyı test et" başarılı olana kadar bu
   * numaradan (ve aynı WABA'daki numaralardan) hiçbir WhatsApp mesajı gönderilmez; kampanyaları duraklatılmış kalır.
   */
  hesapKilidi: { kod: number; neden: "meta_hesap_kilitli" | "meta_odeme_sorunu"; mesaj: string; tarih: string } | null;
  numara: {
    gorunenNumara: string | null;
    dogrulanmisAd: string | null;
    kalite: Kalite | null;
    limitKatmani: string | null;
    /** 24 saatte benzersiz alıcı (portföy); null: bilinmiyor. */
    limit: number | null;
    sonKontrol: string | null;
    sonHata: string | null;
  };
  sablonSenkronTarihi: string | null;
};

/** Numara listesi (sekmeler, kampanya sihirbazındaki gönderen seçimi, panel): gizli ve teknik bilgi yok. */
export type NumaraOzeti = {
  id: string;
  ad: string;
  etiket: string;
  gorunenNumara: string | null;
  numaraDogrulandi: boolean;
  testModu: boolean;
  kalite: Kalite | null;
  hesapKilidi: boolean;
  /** Dört kurulum adımı tamam (test modu kapalı). */
  kurulumTamam: boolean;
};

/** Kaydedilmemiş yeni numara formu için boş durum. */
export function bosBaglantiDto(ad = ""): BaglantiDto {
  return {
    id: null,
    ad,
    etiket: ad || "Yeni numara",
    tanimli: false,
    wabaId: null,
    phoneNumberId: null,
    erisimAnahtariTanimli: false,
    appSecretTanimli: false,
    verifyTokenTanimli: false,
    webhookAdresi: null,
    webhookDogrulandi: false,
    imzaliDurumAlindi: false,
    numaraDogrulandi: false,
    testModu: true,
    testModuKapatilabilir: false,
    gonderenEksikleri: [],
    testNumaralari: [],
    uygulamaPayi: 0,
    hesapKilidi: null,
    numara: { gorunenNumara: null, dogrulanmisAd: null, kalite: null, limitKatmani: null, limit: null, sonKontrol: null, sonHata: null },
    sablonSenkronTarihi: null,
  };
}

