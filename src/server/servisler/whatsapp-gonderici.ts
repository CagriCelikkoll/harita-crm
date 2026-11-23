// İşçinin WhatsApp (Cloud API) gönderim adımı. isci.ts kampanya durumunu ve gönderim saatini denetledikten sonra
// her whatsapp_api mesajı için çağırır. Sırayla:
//  1. Alıcı kuralları YENİDEN (izin, ret, engel, İYS beyanı, WhatsApp yok) — kampanya sonrası gelen ret yakalanır.
//     Test modunda test numaralarına İYS beyanı aranmaz; test modu sonradan kapatıldıysa yeniden aranır.
//  2. Şablon hâlâ kullanılabilir mi (değilse kampanya duraklar) ve değişken değerleri (boşsa hariç).
//  3. Sandbox kampanyası: Meta'ya gidilmez, metin kaydedilir.
//  4. Kampanyanın gönderen numarası (kampanyalar.baglanti_id; silinmişse kampanya duraklar). Meta hesap kilidi varsa
//     (131031, 368, 131042) bu WABA'daki numaraların kampanyaları duraklar, hiçbir mesaj gitmez; numaranın test modu
//     açıksa yalnızca O NUMARANIN test numaraları. Test modu kapalıyken gönderen bilgileri (unvan, iletişim, İYS,
//     sorumluluk onayı) tam olmalı; test modunda aranmaz.
//  5. Kalite (15 dakikadan eskiyse Meta'dan yenilenir; numara sahipliği de yeniden denetlenir, reddedilirse kampanya
//     duraklar): RED → bu numaranın kampanyaları duraklar (diğer numaralar sürer).
//     Görselli (IMAGE başlıklı) şablon: kampanyanın görseli bu numarayla Meta'ya yüklenmiş ve kimliği taze değilse
//     yüklenir (kampanya-gorseli.ts); kimlik sonraki alıcılarda yeniden kullanılır. Yükleme reddedilirse "Son hata"
//     yazılır ve yalnızca bu kampanya duraklar (gorsel_hatasi); dosya yoksa gorsel_yok; geçici hata yeniden denenir.
//  6. Günlük sınır (atomik sayaç, çalışma alanının bütün numaralarının toplamı) ve Meta mesajlaşma limitinin bu
//     uygulamaya ayrılan payı (kayan 24 saat; portföy limiti numaralarca paylaşıldığı için yine bütün numaraların
//     toplamı sayılır; gelen kutusundan gönderilen şablonlar da sayılır); dolarsa ertesi günün gönderim başlangıcına kalır.
//  7. Hız (WHATSAPP_SANIYE_BASI); gönderimden hemen önce satır kilidi ve kampanya durumu yeniden denetlenir;
//     gönderim; Meta hata kodlarına göre sonuç. Hesap düzeyi hata kodu bu WABA'daki numaraları kilitler ve onların
//     kampanyalarını duraklatır; mesaj kuyrukta beklemeye döner (deneme sayılmaz, kendiliğinden tekrar denenmez).
//     Numara Cloud API'ye kayıtlı değilse (133010) yalnızca bu numaranın kampanyaları duraklar ("Son hata" yazılır).
//     Medya hatası (131053, 131052): yalnızca bu kampanya duraklar, Meta görsel kimliği silinir (devamda yeniden
//     yüklenir), "Son hata" yazılır.
// Belirsiz sonuç (ağ kesildi, 5xx, bilinmeyen hata) tekrar denenmez: ileti iki kez gitmez.
import {
  baslikBicimiBul,
  degiskenDegerleri,
  GORSEL_BASLIK,
  gorselHataMesaji,
  hesapKilidiNedeni,
  medyaHataKoduMu,
  metaLimitPayi,
  numaraKayitsizGonderimMesaji,
  numaraKayitsizKoduMu,
  sablonMetni,
  sablonParametreleri,
} from "@/lib/whatsapp-api";
import { gunAnahtari, gunEkle, istanbulAni } from "@/lib/zaman";
import { adresOzeti } from "../messaging/adres";
import { aliciDegerlendir } from "../messaging/alici-kurallari";
import type { TenantContext } from "../repo/baglam";
import { retIsle } from "../repo/engel-listesi";
import { sayacAyir, sayacIade } from "../repo/gonderim-sayaci";
import type { IletiAyarlari } from "../repo/ileti-ayarlari";
import { whatsappKampanyalariniDuraklat, type Kampanya } from "../repo/kampanyalar";
import { kampanyaGorselAlanlari, kampanyaMetaGorselYaz } from "../repo/kampanya-gorselleri";
import { kayitGetir } from "../repo/kayitlar";
import { mesajBirak, mesajGonderildi, whatsappSon24Saat, type KuyrukMesaji } from "../repo/kuyruk";
import { sablonGetir } from "../repo/whatsapp-sablonlari";
import { ayniWabaBaglantilari, hesapKilidiYaz, sonHataYaz } from "../repo/whatsapp-baglantilari";
import { whatsappKisisiGetir, whatsappYokIsaretle } from "../repo/whatsapp-kisileri";
import { GraphHatasi, whatsappApiIstemcisi } from "../whatsapp-api";
import { GorselDosyasiHatasi, metaGorselHazirla } from "./kampanya-gorseli";
import { engelSorgusuOlustur, gunlukSinir, ticariIletiEksikleri } from "./ileti";
import { baglantiyiTestEt, whatsappBaglantisiCoz } from "./whatsapp-api";

export type WhatsappSonucu = "gonderildi" | "bekletildi" | "haric" | "basarisiz" | "atlandi";

/** Kalite bilgisi bundan eskiyse gönderimden önce Meta'dan yenilenir. */
const KALITE_TAZELIK_MS = 15 * 60_000;

export type WhatsappGondericiSecenekleri = {
  /** İki gönderim arası en az süre (ms). Varsayılan 1000 / WHATSAPP_SANIYE_BASI (20 → 50 ms). */
  aralikMs?: number;
  geciciHata: (hata: string) => WhatsappSonucu;
  /**
   * Gönderimden (ve sandbox kaydından) HEMEN önce: satır hâlâ bu turda ve kampanya hâlâ çalışıyor mu. Değilse satırı
   * uygun duruma bırakır, iade'yi çağırır ve sonucu döner; null: gönderilebilir.
   */
  gonderimOncesi: (iade: () => void) => WhatsappSonucu | null;
};

let sonGonderim = 0;
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function hizSiniri(aralikMs: number) {
  const fark = sonGonderim + aralikMs - Date.now();
  if (fark > 0) await bekle(fark);
  sonGonderim = Date.now();
}

/**
 * Bu mesajı kuyruğa geri bırakır (denenmiş sayılmaz) ve kampanyayı ya da verilen numaralardan gönderen bütün
 * kampanyaları duraklatır.
 */
function duraklat(ctx: TenantContext, mesaj: KuyrukMesaji, neden: string, baglantiIdler?: string[]): WhatsappSonucu {
  whatsappKampanyalariniDuraklat(ctx, neden, baglantiIdler ? { baglantiIdler } : { kampanyaId: mesaj.kampanyaId });
  mesajBirak(ctx, mesaj.id, { durum: "kuyrukta", neden: `duraklatildi:${neden}`, denemeGeriAl: true });
  return "bekletildi";
}

export async function whatsappMesajIsle(
  ctx: TenantContext,
  mesaj: KuyrukMesaji,
  kampanya: Kampanya,
  ayar: IletiAyarlari,
  simdi: Date,
  s: WhatsappGondericiSecenekleri,
): Promise<WhatsappSonucu> {
  // 1) Alıcı kuralları.
  const kayit = kayitGetir(ctx, mesaj.leadId);
  if (!kayit) {
    mesajBirak(ctx, mesaj.id, { durum: "haric", neden: "iletisim_yok" });
    return "haric";
  }
  const wa = whatsappKisisiGetir(ctx, kayit.id);
  // Test modunda test numaralarına İYS beyanı aranmaz; kampanyadan sonra test modu kapatıldıysa yeniden aranır.
  const testBaglantisi = kampanya.sandbox || !kampanya.baglantiId ? null : whatsappBaglantisiCoz(ctx, kampanya.baglantiId);
  const karar = aliciDegerlendir({ ...kayit, whatsapp: wa }, "whatsapp_api", engelSorgusuOlustur(ctx, [kayit]), {
    simdi,
    testNumaralari: testBaglantisi?.baglanti.testModu ? new Set(testBaglantisi.gizli.testNumaralari) : undefined,
  });
  if (!karar.uygun) {
    mesajBirak(ctx, mesaj.id, { durum: "haric", neden: karar.neden });
    return "haric";
  }
  if (karar.adres === null) throw new Error("whatsapp_api alıcısı adressiz olamaz.");
  const engelTuru = karar.kaynak === "bsuid" ? "wa_kimlik" : "telefon";
  const ozet = adresOzeti(ctx.tenantId, engelTuru, karar.adres);

  // 2) Şablon ve değişkenler.
  const sablon = kampanya.sablonId ? sablonGetir(ctx, kampanya.sablonId) : null;
  if (!sablon || sablon.destekNedeni !== null) return duraklat(ctx, mesaj, "sablon_kullanilamaz");
  const gorselli = baslikBicimiBul(sablon.bilesenler) === GORSEL_BASLIK;
  if (gorselli && !kampanya.gorselMedyaId) return duraklat(ctx, mesaj, "gorsel_yok");
  const degerler = degiskenDegerleri(sablon.degiskenler, kampanya.degiskenEslem ?? {}, kayit);
  if (!degerler) {
    mesajBirak(ctx, mesaj.id, { durum: "haric", neden: "degisken_bos" });
    return "haric";
  }
  const olayAciklamasi = `Kampanya: ${kampanya.ad} (şablon ${sablon.ad})`;

  // 3) Sandbox: Meta'ya gidilmez.
  if (kampanya.sandbox) {
    const durdu = s.gonderimOncesi(() => {});
    if (durdu) return durdu;
    mesajGonderildi(
      ctx,
      mesaj.id,
      { saglayiciKimligi: null, sandbox: true, sandboxIcerik: sablonMetni(sablon.bilesenler, degerler), olayAciklamasi, adresOzeti: ozet },
      simdi,
    );
    return "gonderildi";
  }

  // 4) Bağlantı ve test modu.
  const baglantiId = kampanya.baglantiId;
  let c = baglantiId ? whatsappBaglantisiCoz(ctx, baglantiId) : null;
  if (!baglantiId || !c) return duraklat(ctx, mesaj, "baglanti_yok");
  const kilit = hesapKilidiNedeni(c.baglanti.hesapKilidiKodu);
  if (kilit) return duraklat(ctx, mesaj, kilit, ayniWabaBaglantilari(ctx, baglantiId));
  if (c.baglanti.testModu && (karar.kaynak !== "kayit" || !c.gizli.testNumaralari.includes(karar.adres))) {
    mesajBirak(ctx, mesaj.id, { durum: "haric", neden: "test_modu" });
    return "haric";
  }
  if (!c.baglanti.testModu) {
    const eksik = ticariIletiEksikleri(ayar, "whatsapp_api");
    if (eksik.length) {
      mesajBirak(ctx, mesaj.id, { durum: "basarisiz", neden: "ayar_eksik", hata: `Ticari ileti bilgileri eksik: ${eksik.join(", ")}.` });
      return "basarisiz";
    }
  }

  // 5) Kalite.
  if (!c.baglanti.sonKontrol || simdi.getTime() - c.baglanti.sonKontrol.getTime() > KALITE_TAZELIK_MS) {
    try {
      await baglantiyiTestEt(ctx, baglantiId, simdi);
    } catch {
      /* Meta'ya ulaşılamadı: son bilinen kalite kullanılır */
    }
    // Yenileme numara sahipliğini de denetler; reddedildiyse bağlantı artık kullanılmaz.
    const yeni = whatsappBaglantisiCoz(ctx, baglantiId);
    if (!yeni) return duraklat(ctx, mesaj, "baglanti_yok");
    c = yeni;
  }
  if (c.baglanti.kalite === "RED") return duraklat(ctx, mesaj, "kalite_dusuk", [baglantiId]);
  const istemci = whatsappApiIstemcisi({
    wabaId: c.baglanti.wabaId,
    phoneNumberId: c.baglanti.phoneNumberId,
    erisimAnahtari: c.gizli.erisimAnahtari,
  });

  // 5b) Görselli şablon: Meta medya kimliği (taze değilse görsel bu numarayla yüklenir; alıcı başına yüklenmez).
  let gorsel: { metaId: string } | null = null;
  if (gorselli) {
    // Aynı turdaki önceki mesaj kampanyayı duraklattıysa (ör. görsel reddedildi) Meta'ya yeniden yüklenmez.
    const durdu = s.gonderimOncesi(() => {});
    if (durdu) return durdu;
    try {
      const alanlar = kampanyaGorselAlanlari(ctx, kampanya.id) ?? kampanya;
      gorsel = { metaId: await metaGorselHazirla(ctx, alanlar, c.baglanti.phoneNumberId, istemci, simdi) };
    } catch (hata) {
      return gorselHataIsle(ctx, mesaj, baglantiId, hata, s, simdi);
    }
  }

  // 6) Günlük sınır ve Meta limitinin payı.
  const gun = gunAnahtari(simdi);
  const yarin = istanbulAni(gunEkle(gun, 1), ayar.gonderimBaslangicDk);
  if (!sayacAyir(ctx, "whatsapp_api", gun, gunlukSinir(ayar, "whatsapp_api"))) {
    mesajBirak(ctx, mesaj.id, { durum: "kuyrukta", neden: "gunluk_sinir", sonrakiDeneme: yarin, denemeGeriAl: true });
    return "bekletildi";
  }
  const iade = () => sayacIade(ctx, "whatsapp_api", gun);
  // Gelen kutusundan gönderilen şablonlar da bu paya sayılır (whatsappSon24Saat).
  const pay = metaLimitPayi(c.baglanti);
  if (Number.isFinite(pay) && whatsappSon24Saat(ctx, simdi, mesaj.id) >= pay) {
    iade();
    mesajBirak(ctx, mesaj.id, { durum: "kuyrukta", neden: "whatsapp_limit", sonrakiDeneme: yarin, denemeGeriAl: true });
    return "bekletildi";
  }

  // 7) Gönderim.
  await hizSiniri(s.aralikMs ?? Math.ceil(1000 / Math.max(1, Number(process.env.WHATSAPP_SANIYE_BASI ?? 20))));
  const durdu = s.gonderimOncesi(iade);
  if (durdu) return durdu;
  try {
    const yanit = await istemci.mesajGonder({
      alici: { tur: karar.kaynak === "bsuid" ? "bsuid" : "telefon", deger: karar.adres },
      sablonAdi: sablon.ad,
      dil: sablon.dil,
      bilesenler: sablonParametreleri(sablon.degiskenler, degerler, sablon.parametreBicimi === "NAMED", gorsel),
    });
    mesajGonderildi(
      ctx,
      mesaj.id,
      {
        saglayiciKimligi: yanit.wamid,
        sandbox: false,
        sandboxIcerik: null,
        olayAciklamasi,
        adresOzeti: ozet,
        gonderenNumara: c.baglanti.phoneNumberId,
        sohbet: { baglantiId, metin: sablonMetni(sablon.bilesenler, degerler) },
      },
      simdi,
    );
    return "gonderildi";
  } catch (hata) {
    return hataIsle(ctx, mesaj, baglantiId, kayit.id, ozet, engelTuru, hata, iade, s, simdi);
  }
}

/**
 * Görselin Meta'ya aktarılamaması (gönderimden önce; ileti gitmedi, sayaç ayrılmadı). Hesap kilidi, kayıtsız numara ve
 * yetki hataları gönderimdeki gibi; diğer kalıcı ret yalnızca bu kampanyayı duraklatır ve "Son hata"ya yazılır.
 */
function gorselHataIsle(
  ctx: TenantContext,
  mesaj: KuyrukMesaji,
  baglantiId: string,
  hata: unknown,
  s: WhatsappGondericiSecenekleri,
  simdi: Date,
): WhatsappSonucu {
  if (hata instanceof GorselDosyasiHatasi) return duraklat(ctx, mesaj, "gorsel_yok");
  const e = hata instanceof GraphHatasi ? hata : null;
  const metin = (e?.message ?? (hata as Error).message ?? "Bilinmeyen hata").slice(0, 300);
  if (!e || e.gecici || e.http === 429) return s.geciciHata(`Görsel Meta'ya yüklenemedi: ${metin}`);
  const kilit = hesapKilidiNedeni(e.kod);
  if (kilit) return duraklat(ctx, mesaj, kilit, hesapKilidiYaz(ctx, baglantiId, e.kod!, simdi));
  if (numaraKayitsizKoduMu(e.kod)) {
    sonHataYaz(ctx, baglantiId, numaraKayitsizGonderimMesaji(e.kod!));
    return duraklat(ctx, mesaj, "numara_kayitsiz", [baglantiId]);
  }
  if (e.yetkiHatasi) return duraklat(ctx, mesaj, "yetki");
  sonHataYaz(ctx, baglantiId, gorselHataMesaji(e.kod, e.message));
  return duraklat(ctx, mesaj, "gorsel_hatasi");
}

/** Meta hata kodu → sonuç. https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes */
function hataIsle(
  ctx: TenantContext,
  mesaj: KuyrukMesaji,
  baglantiId: string,
  leadId: string,
  ozet: string,
  engelTuru: "telefon" | "wa_kimlik",
  hata: unknown,
  iade: () => void,
  s: WhatsappGondericiSecenekleri,
  simdi: Date,
): WhatsappSonucu {
  const e = hata instanceof GraphHatasi ? hata : null;
  const metin = (e?.message ?? (hata as Error).message ?? "Bilinmeyen hata").slice(0, 300);
  const basarisiz = (neden: string) => {
    mesajBirak(ctx, mesaj.id, { durum: "basarisiz", neden, hata: metin });
    return "basarisiz" as const;
  };
  // Gidip gitmediği bilinmiyor: tekrar denenmez, sayaçtan düşülmez.
  if (!e || e.http === 0 || e.http >= 500 || e.kod === 131000) return basarisiz("belirsiz");

  iade(); // aşağıdakilerin hepsinde iletinin gitmediği kesin
  const kilit = hesapKilidiNedeni(e.kod);
  if (kilit) {
    // Hesap düzeyi (131031 kilit, 368 politika, 131042 ödeme): bu WABA'daki numaralar kilitlenir, kampanyaları durur.
    return duraklat(ctx, mesaj, kilit, hesapKilidiYaz(ctx, baglantiId, e.kod!, simdi));
  }
  if (numaraKayitsizKoduMu(e.kod)) {
    // Numara Cloud API'ye kayıtlı değil (133010): bu numaradan sonraki her mesaj da aynı hatayla düşer. Liste "başarısız"
    // diye tükenmesin diye yalnızca BU numaranın kampanyaları duraklar (hesap kilidi değil: aynı WABA'daki diğer
    // numaralar ve gelen kutusu etkilenmez); mesaj kuyrukta bekler. Neden bağlantının "Son hata" satırına yazılır.
    sonHataYaz(ctx, baglantiId, numaraKayitsizGonderimMesaji(e.kod!));
    return duraklat(ctx, mesaj, "numara_kayitsiz", [baglantiId]);
  }
  if (medyaHataKoduMu(e.kod)) {
    // Görsel işlenemedi (131053) / indirilemedi (131052): sonraki alıcılar da düşerdi. Yalnızca bu kampanya duraklar;
    // kimlik silinir, devam ettirilince görsel yeniden yüklenir.
    kampanyaMetaGorselYaz(ctx, mesaj.kampanyaId, null);
    sonHataYaz(ctx, baglantiId, gorselHataMesaji(e.kod, e.message));
    return duraklat(ctx, mesaj, "gorsel_hatasi");
  }
  switch (e.kod) {
    case 131026: // teslim edilemez (alıcıda WhatsApp yok vb.)
      whatsappYokIsaretle(ctx, leadId, simdi);
      return basarisiz("whatsapp_yok");
    case 131050: // kişi bu işletmeden pazarlama iletilerini durdurdu → ret (K5)
      retIsle(ctx, {
        leadId,
        adresler: [{ tur: engelTuru, ozet }],
        kaynak: "whatsapp_ret",
        aciklama: "Kişi WhatsApp'ta bu işletmeden pazarlama iletilerini durdurmuş (Meta 131050)",
      });
      mesajBirak(ctx, mesaj.id, { durum: "haric", neden: "ret", hata: metin });
      return "haric";
    case 131049: // sağlıklı ekosistem için teslim edilmedi; tekrar denenmez
      return basarisiz("meta_teslim_etmedi");
    case 131048: // spam kısıtlaması
      return duraklat(ctx, mesaj, "spam_siniri");
    case 4:
    case 80007:
    case 130429:
    case 131056:
      return s.geciciHata(metin);
  }
  if (e.http === 429) return s.geciciHata(metin);
  if (e.kod !== null && e.kod >= 132000 && e.kod < 133000) return duraklat(ctx, mesaj, "sablon_kullanilamaz");
  if (e.yetkiHatasi || e.kod === 0 || e.kod === 3 || e.kod === 131005) return duraklat(ctx, mesaj, "yetki");
  return basarisiz("saglayici");
}
