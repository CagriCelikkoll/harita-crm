// İşçinin WhatsApp (Cloud API) gönderim adımı. isci.ts kampanya durumunu ve gönderim saatini denetledikten sonra
// her whatsapp_api mesajı için çağırır. Sırayla:
//  1. Alıcı kuralları YENİDEN (izin, ret, engel, İYS beyanı, WhatsApp yok) — kampanya sonrası gelen ret yakalanır.
//  2. Şablon hâlâ kullanılabilir mi (değilse kampanya duraklar) ve değişken değerleri (boşsa hariç).
//  3. Sandbox kampanyası: Meta'ya gidilmez, metin kaydedilir.
//  4. Bağlantı; test modu açıksa yalnızca test numaraları.
//  5. Kalite (15 dakikadan eskiyse Meta'dan yenilenir; numara sahipliği de yeniden denetlenir, reddedilirse kampanya
//     duraklar): RED → çalışma alanının tüm WhatsApp kampanyaları duraklar.
//  6. Günlük sınır (atomik sayaç) ve Meta mesajlaşma limitinin bu uygulamaya ayrılan payı (kayan 24 saat);
//     dolarsa ertesi günün gönderim başlangıcına kalır.
//  7. Hız (WHATSAPP_SANIYE_BASI); gönderimden hemen önce satır kilidi ve kampanya durumu yeniden denetlenir;
//     gönderim; Meta hata kodlarına göre sonuç.
// Belirsiz sonuç (ağ kesildi, 5xx, bilinmeyen hata) tekrar denenmez: ileti iki kez gitmez.
import { degiskenDegerleri, limitKatmaniSayisi, sablonMetni, sablonParametreleri } from "@/lib/whatsapp-api";
import { gunAnahtari, gunEkle, istanbulAni } from "@/lib/zaman";
import { adresOzeti } from "../messaging/adres";
import { aliciDegerlendir } from "../messaging/alici-kurallari";
import type { TenantContext } from "../repo/baglam";
import { retIsle } from "../repo/engel-listesi";
import { sayacAyir, sayacIade } from "../repo/gonderim-sayaci";
import type { IletiAyarlari } from "../repo/ileti-ayarlari";
import { whatsappKampanyalariniDuraklat, type Kampanya } from "../repo/kampanyalar";
import { kayitGetir } from "../repo/kayitlar";
import { mesajBirak, mesajGonderildi, whatsappSon24Saat, type KuyrukMesaji } from "../repo/kuyruk";
import { sablonGetir } from "../repo/whatsapp-sablonlari";
import { whatsappKisisiGetir, whatsappYokIsaretle } from "../repo/whatsapp-kisileri";
import { GraphHatasi, whatsappApiIstemcisi } from "../whatsapp-api";
import { engelSorgusuOlustur, gunlukSinir } from "./ileti";
import { baglantiyiTestEt, whatsappBaglantisiCoz } from "./whatsapp-api";

export type WhatsappSonucu = "gonderildi" | "bekletildi" | "haric" | "basarisiz" | "atlandi";

/** Kalite bilgisi bundan eskiyse gönderimden önce Meta'dan yenilenir. */
const KALITE_TAZELIK_MS = 15 * 60_000;
/** Limit katmanı bilinmiyorsa en düşük katman varsayılır. */
const EN_DUSUK_LIMIT = 250;

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

/** Bu mesajı kuyruğa geri bırakır (denenmiş sayılmaz) ve kampanyayı/kampanyaları duraklatır. */
function duraklat(ctx: TenantContext, mesaj: KuyrukMesaji, neden: string, tumu = false): WhatsappSonucu {
  whatsappKampanyalariniDuraklat(ctx, neden, tumu ? undefined : mesaj.kampanyaId);
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
  const karar = aliciDegerlendir({ ...kayit, whatsapp: wa }, "whatsapp_api", engelSorgusuOlustur(ctx, [kayit]), { simdi });
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
  let c = whatsappBaglantisiCoz(ctx);
  if (!c) return duraklat(ctx, mesaj, "baglanti_yok");
  if (c.baglanti.testModu && (karar.kaynak !== "kayit" || !c.gizli.testNumaralari.includes(karar.adres))) {
    mesajBirak(ctx, mesaj.id, { durum: "haric", neden: "test_modu" });
    return "haric";
  }

  // 5) Kalite.
  if (!c.baglanti.sonKontrol || simdi.getTime() - c.baglanti.sonKontrol.getTime() > KALITE_TAZELIK_MS) {
    try {
      await baglantiyiTestEt(ctx, simdi);
    } catch {
      /* Meta'ya ulaşılamadı: son bilinen kalite kullanılır */
    }
    // Yenileme numara sahipliğini de denetler; reddedildiyse bağlantı artık kullanılmaz.
    const yeni = whatsappBaglantisiCoz(ctx);
    if (!yeni) return duraklat(ctx, mesaj, "baglanti_yok");
    c = yeni;
  }
  if (c.baglanti.kalite === "RED") return duraklat(ctx, mesaj, "kalite_dusuk", true);

  // 6) Günlük sınır ve Meta limitinin payı.
  const gun = gunAnahtari(simdi);
  const yarin = istanbulAni(gunEkle(gun, 1), ayar.gonderimBaslangicDk);
  if (!sayacAyir(ctx, "whatsapp_api", gun, gunlukSinir(ayar, "whatsapp_api"))) {
    mesajBirak(ctx, mesaj.id, { durum: "kuyrukta", neden: "gunluk_sinir", sonrakiDeneme: yarin, denemeGeriAl: true });
    return "bekletildi";
  }
  const iade = () => sayacIade(ctx, "whatsapp_api", gun);
  const limit = limitKatmaniSayisi(c.baglanti.limitKatmani) ?? EN_DUSUK_LIMIT;
  if (Number.isFinite(limit)) {
    const pay = Math.max(1, Math.floor((limit * c.baglanti.uygulamaPayi) / 100));
    if (whatsappSon24Saat(ctx, simdi, mesaj.id) >= pay) {
      iade();
      mesajBirak(ctx, mesaj.id, { durum: "kuyrukta", neden: "whatsapp_limit", sonrakiDeneme: yarin, denemeGeriAl: true });
      return "bekletildi";
    }
  }

  // 7) Gönderim.
  await hizSiniri(s.aralikMs ?? Math.ceil(1000 / Math.max(1, Number(process.env.WHATSAPP_SANIYE_BASI ?? 20))));
  const durdu = s.gonderimOncesi(iade);
  if (durdu) return durdu;
  const istemci = whatsappApiIstemcisi({
    wabaId: c.baglanti.wabaId,
    phoneNumberId: c.baglanti.phoneNumberId,
    erisimAnahtari: c.gizli.erisimAnahtari,
  });
  try {
    const yanit = await istemci.mesajGonder({
      alici: { tur: karar.kaynak === "bsuid" ? "bsuid" : "telefon", deger: karar.adres },
      sablonAdi: sablon.ad,
      dil: sablon.dil,
      bilesenler: sablonParametreleri(sablon.degiskenler, degerler, sablon.parametreBicimi === "NAMED"),
    });
    mesajGonderildi(
      ctx,
      mesaj.id,
      { saglayiciKimligi: yanit.wamid, sandbox: false, sandboxIcerik: null, olayAciklamasi, adresOzeti: ozet, gonderenNumara: c.baglanti.phoneNumberId },
      simdi,
    );
    return "gonderildi";
  } catch (hata) {
    return hataIsle(ctx, mesaj, kayit.id, ozet, engelTuru, hata, iade, s, simdi);
  }
}

/** Meta hata kodu → sonuç. https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes */
function hataIsle(
  ctx: TenantContext,
  mesaj: KuyrukMesaji,
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
