// Gönderim işçisi: kuyruğu küçük partiler halinde işler (npm run worker döngüsü bunu çağırır).
//
// Tur, tek işçi kilidi altında çalışır (alınamazsa hiçbir şey yapılmaz; kilitAlinamadi). Her mesaj için sırayla:
// kampanyanın GÜNCEL durumu (her mesajda veritabanından) → gönderim saati penceresi → alıcı kuralları YENİDEN
// (ret, engel listesi, bireysel + izinsiz; kampanya oluşturulduktan sonra gelen ret de yakalanır) →
// sandbox dışıysa ticari ileti ön koşulları → günlük sınır (atomik sayaç) → gönderimden HEMEN önce satır kilidi
// yenilenir, satırın hâlâ bu turda ve kampanyanın hâlâ çalışıyor olduğu doğrulanır → gönderim → olay + durum.
// İptal edilen kampanyanın kalan mesajları 'iptal', duraklatılanınkiler 'kuyrukta' olur; hiçbiri gönderilmez.
// Aynı mesaj iki kez gönderilmez: bkz. repo/sistem/isci.ts.
import { AZAMI_DENEME, YENIDEN_DENEME_DK, type Kanal } from "@/lib/mesajlasma";
import { ayAnahtari, gunAnahtari, gunEkle, istanbulAni, penceredeMi, sonrakiPencere } from "@/lib/zaman";
import { adresOzeti } from "../messaging/adres";
import { aliciDegerlendir } from "../messaging/alici-kurallari";
import type { GonderimSonucu, MessageProvider } from "../messaging/saglayici";
import type { TenantContext } from "../repo/baglam";
import { retIsle } from "../repo/engel-listesi";
import { sayacAyir, sayacIade } from "../repo/gonderim-sayaci";
import { iletiAyarlariGetir, type IletiAyarlari } from "../repo/ileti-ayarlari";
import { kampanyaGetir, type Kampanya } from "../repo/kampanyalar";
import { kayitGetir } from "../repo/kayitlar";
import { mesajBirak, mesajGonderildi, type KuyrukMesaji } from "../repo/kuyruk";
import {
  belirsizMesajlariKapat,
  bitenKampanyalariKapat,
  gonderimOncesiKontrol,
  isciKilidiAl,
  isciKilidiBirak,
  isciKilidiYenile,
  mesajlariAl,
  zamaniGelenKampanyalariBaslat,
} from "../repo/sistem/isci";
import { engelSorgusuOlustur, gunlukSinir, ticariIletiEksikleri } from "./ileti";
import { iletiOlustur } from "./mesaj";
import { saglayiciAl, type SaglayiciSecenekleri } from "./saglayici";
import { placesTelefonuGetir } from "./telefon";
import { whatsappMesajIsle } from "./whatsapp-gonderici";

export type IsciSecenekleri = {
  simdi?: () => Date;
  parti?: number;
  /** Testler: sağlayıcıyı değiştirir (varsayılan: kampanya sandbox ise sandbox, değilse kiracının sağlayıcısı). */
  saglayiciSec?: (ctx: TenantContext, kanal: Kanal, sandbox: boolean) => MessageProvider;
  saglayici?: SaglayiciSecenekleri;
  /** WhatsApp gönderimleri arası en az süre (ms); testler 0 verir. */
  whatsappAralikMs?: number;
  /** Turun kimliği (işçi kilidi ve satır kilidi sahibi); varsayılan rastgele. */
  isciKimligi?: string;
  /** İşçi kilidinin süresi (ms); nabız bunun dörtte birinde bir uzatır. Varsayılan ISCI_KILIT_SN (120 sn). */
  kilitSuresiMs?: number;
};

export type TurSonucu = {
  /** Başka bir işçi turu çalışıyordu: bu tur hiçbir şey yapmadı. */
  kilitAlinamadi: boolean;
  baslatilanKampanya: number;
  tamamlananKampanya: number;
  belirsiz: number;
  alinan: number;
  gonderilen: number;
  bekletilen: number;
  haric: number;
  basarisiz: number;
  /** Gönderimden hemen önce satır bu turda değildi: gönderilmedi, satıra dokunulmadı. */
  atlanan: number;
};

type Sonuc = "gonderildi" | "bekletildi" | "haric" | "basarisiz" | "atlandi";

export async function isciTuru(s: IsciSecenekleri = {}): Promise<TurSonucu> {
  const simdi = s.simdi ?? (() => new Date());
  const sonuc: TurSonucu = {
    kilitAlinamadi: false,
    baslatilanKampanya: 0,
    tamamlananKampanya: 0,
    belirsiz: 0,
    alinan: 0,
    gonderilen: 0,
    bekletilen: 0,
    haric: 0,
    basarisiz: 0,
    atlanan: 0,
  };
  const kimlik = s.isciKimligi ?? crypto.randomUUID();
  const sure = s.kilitSuresiMs ?? Math.max(10, Number(process.env.ISCI_KILIT_SN ?? 120)) * 1000;
  if (!isciKilidiAl(kimlik, sure)) return { ...sonuc, kilitAlinamadi: true };
  let kilitKaybedildi = false;
  const nabiz = setInterval(() => {
    if (!isciKilidiYenile(kimlik, sure)) kilitKaybedildi = true;
  }, Math.max(250, Math.floor(sure / 4)));
  nabiz.unref?.();

  try {
    sonuc.baslatilanKampanya = zamaniGelenKampanyalariBaslat(simdi());
    sonuc.belirsiz = belirsizMesajlariKapat(simdi()).length;

    const alinan = mesajlariAl(simdi(), s.parti ?? Number(process.env.WORKER_PARTI ?? 20), kimlik);
    sonuc.alinan = alinan.length;
    const ayarOnbellek = new Map<string, IletiAyarlari>();

    for (const [i, { mesaj, ctx }] of alinan.entries()) {
      if (kilitKaybedildi || !isciKilidiYenile(kimlik, sure)) {
        // Kilit süresi doldu ve başka bir işçi aldı: kalan (denenmemiş) satırlar kuyruğa döner.
        kilitKaybedildi = true;
        for (const r of alinan.slice(i)) mesajBirak(r.ctx, r.mesaj.id, { durum: "kuyrukta", neden: null, denemeGeriAl: true });
        sonuc.bekletilen += alinan.length - i;
        break;
      }
      if (!ayarOnbellek.has(ctx.tenantId)) ayarOnbellek.set(ctx.tenantId, iletiAyarlariGetir(ctx));
      let s_: Sonuc;
      try {
        // Kampanya her mesajda yeniden okunur: tur sırasında iptal / duraklatma hemen uygulanır.
        s_ = await mesajIsle(ctx, mesaj, kampanyaGetir(ctx, mesaj.kampanyaId), ayarOnbellek.get(ctx.tenantId)!, simdi(), s, kimlik);
      } catch (hata) {
        // Beklenmeyen hata: gönderim çağrısından ÖNCE oluşur (adaptörler hata fırlatmaz), yeniden denenmez.
        mesajBirak(ctx, mesaj.id, { durum: "basarisiz", neden: "hata", hata: (hata as Error).message.slice(0, 300) });
        s_ = "basarisiz";
      }
      if (s_ === "gonderildi") sonuc.gonderilen++;
      else if (s_ === "bekletildi") sonuc.bekletilen++;
      else if (s_ === "haric") sonuc.haric++;
      else if (s_ === "atlandi") sonuc.atlanan++;
      else sonuc.basarisiz++;
    }
    sonuc.tamamlananKampanya = bitenKampanyalariKapat(simdi());
    return sonuc;
  } finally {
    clearInterval(nabiz);
    isciKilidiBirak(kimlik);
  }
}

/** Kampanya artık çalışmıyor: duraklatıldıysa mesaj kuyruğa döner (devam edince gönderilir), değilse iptal. */
function kampanyaDurduBirak(ctx: TenantContext, mesaj: KuyrukMesaji, durum: string | null, neden: string | null): Sonuc {
  if (durum === "duraklatildi") {
    mesajBirak(ctx, mesaj.id, { durum: "kuyrukta", neden: `duraklatildi:${neden ?? ""}`, denemeGeriAl: true });
    return "bekletildi";
  }
  mesajBirak(ctx, mesaj.id, { durum: "iptal", neden: "iptal", denemeGeriAl: true });
  return "haric";
}

/**
 * Gönderim çağrısından HEMEN önce: satır hâlâ bu turda mı, kampanya hâlâ çalışıyor mu (veritabanından). Değilse
 * günlük sınır iade edilir ve gönderilmez. null: gönderilebilir.
 */
function gonderimOncesi(ctx: TenantContext, mesaj: KuyrukMesaji, kimlik: string, simdi: Date, iade: () => void): Sonuc | null {
  const k = gonderimOncesiKontrol(ctx, mesaj.id, kimlik, simdi);
  if (k.durum === "tamam") return null;
  iade();
  if (k.durum === "satir_yok") return "atlandi";
  return kampanyaDurduBirak(ctx, mesaj, k.kampanyaDurumu, k.duraklatmaNedeni);
}

async function mesajIsle(
  ctx: TenantContext,
  mesaj: KuyrukMesaji,
  kampanya: Kampanya | null,
  ayar: IletiAyarlari,
  simdi: Date,
  s: IsciSecenekleri,
  kimlik: string,
): Promise<Sonuc> {
  // Duraklatılmış kampanya (WhatsApp): mesaj kuyruğa geri döner; devam ettirilince gönderilir. İptal: gönderilmez.
  if (!kampanya || kampanya.durum !== "calisiyor") {
    return kampanyaDurduBirak(ctx, mesaj, kampanya?.durum ?? null, kampanya?.duraklatmaNedeni ?? null);
  }

  // 1) Gönderim saati (İstanbul).
  if (!penceredeMi(simdi, ayar.gonderimBaslangicDk, ayar.gonderimBitisDk)) {
    mesajBirak(ctx, mesaj.id, {
      durum: "kuyrukta",
      neden: "gonderim_saati",
      sonrakiDeneme: sonrakiPencere(simdi, ayar.gonderimBaslangicDk, ayar.gonderimBitisDk),
      denemeGeriAl: true,
    });
    return "bekletildi";
  }

  // WhatsApp (Cloud API): kendi adımları (servisler/whatsapp-gonderici.ts).
  if (mesaj.kanal === "whatsapp_api") {
    return whatsappMesajIsle(ctx, mesaj, kampanya, ayar, simdi, {
      aralikMs: s.whatsappAralikMs,
      geciciHata: (hata) => geciciHata(ctx, mesaj, hata, simdi),
      gonderimOncesi: (iade) => gonderimOncesi(ctx, mesaj, kimlik, simdi, iade),
    });
  }

  // 2) Alıcı kuralları, gönderimden hemen önce yeniden.
  const kayit = kayitGetir(ctx, mesaj.leadId);
  if (!kayit) {
    mesajBirak(ctx, mesaj.id, { durum: "haric", neden: "iletisim_yok" });
    return "haric";
  }
  const karar = aliciDegerlendir(kayit, mesaj.kanal, engelSorgusuOlustur(ctx, [kayit]));
  if (!karar.uygun) {
    mesajBirak(ctx, mesaj.id, { durum: "haric", neden: karar.neden });
    return "haric";
  }

  // 3) Gerçek gönderimde ticari ileti ön koşulları (kampanyadan sonra kaldırılmış olabilir).
  if (!kampanya.sandbox) {
    const eksik = ticariIletiEksikleri(ayar, mesaj.kanal);
    if (eksik.length) {
      mesajBirak(ctx, mesaj.id, { durum: "basarisiz", neden: "ayar_eksik", hata: `Ticari ileti bilgileri eksik: ${eksik.join(", ")}.` });
      return "basarisiz";
    }
  }

  // 4) Günlük sınır (İstanbul günü, atomik). Dolduysa ertesi günün gönderim başlangıcına kalır.
  const gun = gunAnahtari(simdi);
  if (!sayacAyir(ctx, mesaj.kanal, gun, gunlukSinir(ayar, mesaj.kanal))) {
    mesajBirak(ctx, mesaj.id, {
      durum: "kuyrukta",
      neden: "gunluk_sinir",
      sonrakiDeneme: istanbulAni(gunEkle(gun, 1), ayar.gonderimBaslangicDk),
      denemeGeriAl: true,
    });
    return "bekletildi";
  }
  const iade = () => sayacIade(ctx, mesaj.kanal, gun);

  // 5) Telefon kayıtta yoksa (SMS): gönderim anında Places'tan canlı; numara saklanmaz, kota birimi düşer.
  //    Günlük sınırdan SONRA: sınıra takılacak mesaj için Places kotası harcanmaz.
  let adres: string;
  if (karar.adres === null) {
    const tel = await placesTelefonuGetir(ctx, karar.placeId);
    if (tel.durum === "kota") {
      iade();
      mesajBirak(ctx, mesaj.id, {
        durum: "kuyrukta",
        neden: "kota",
        sonrakiDeneme: istanbulAni(`${sonrakiAy(ayAnahtari(simdi))}-01`, ayar.gonderimBaslangicDk),
        denemeGeriAl: true,
      });
      return "bekletildi";
    }
    if (tel.durum === "hata") {
      iade();
      return geciciHata(ctx, mesaj, `Places telefonu alınamadı: ${tel.mesaj}`, simdi);
    }
    const ikinci = aliciDegerlendir(kayit, mesaj.kanal, engelSorgusuOlustur(ctx, [kayit]), {
      placesTelefonu: tel.durum === "tamam" ? tel.telefon : null,
    });
    if (!ikinci.uygun || ikinci.adres === null) {
      iade();
      mesajBirak(ctx, mesaj.id, { durum: "haric", neden: ikinci.uygun ? "iletisim_yok" : ikinci.neden });
      return "haric";
    }
    adres = ikinci.adres;
  } else {
    adres = karar.adres;
  }
  const engelTuru = mesaj.kanal === "eposta" ? "eposta" : "telefon";

  // 6) Gönderim.
  let saglayici: MessageProvider;
  try {
    saglayici = s.saglayiciSec?.(ctx, mesaj.kanal, kampanya.sandbox) ?? saglayiciAl(ctx, mesaj.kanal, kampanya.sandbox, s.saglayici);
  } catch (hata) {
    iade();
    mesajBirak(ctx, mesaj.id, { durum: "basarisiz", neden: "saglayici", hata: (hata as Error).message });
    return "basarisiz";
  }
  const ileti = iletiOlustur({ ctx, kanal: mesaj.kanal, kampanya, kayit, adres, ayar });
  const durdu = gonderimOncesi(ctx, mesaj, kimlik, simdi, iade);
  if (durdu) return durdu;
  const sonuc: GonderimSonucu = await saglayici.gonder(ileti);

  if (sonuc.durum === "gonderildi") {
    mesajGonderildi(
      ctx,
      mesaj.id,
      {
        saglayiciKimligi: sonuc.saglayiciKimligi ?? null,
        sandbox: saglayici.sandbox,
        sandboxIcerik: saglayici.sandbox ? [ileti.konu ? `Konu: ${ileti.konu}` : null, ileti.metin].filter(Boolean).join("\n\n") : null,
        olayAciklamasi: `Kampanya: ${kampanya.ad}`,
        adresOzeti: adresOzeti(ctx.tenantId, engelTuru, adres),
      },
      simdi,
    );
    return "gonderildi";
  }
  if (sonuc.durum === "gecici_hata") {
    iade();
    return geciciHata(ctx, mesaj, sonuc.hata, simdi);
  }
  // Kalıcı hata.
  if (sonuc.ret) {
    iade();
    retIsle(ctx, {
      leadId: kayit.id,
      adresler: [{ tur: engelTuru, ozet: adresOzeti(ctx.tenantId, engelTuru, adres) }],
      kaynak: "iys_ret",
      aciklama: "Alıcı İYS'de ret vermiş (sağlayıcı gönderimi reddetti)",
    });
    mesajBirak(ctx, mesaj.id, { durum: "haric", neden: "ret", hata: sonuc.hata });
    return "haric";
  }
  if (!sonuc.belirsiz) iade(); // gitmediği kesin: sınırdan düşülmez
  mesajBirak(ctx, mesaj.id, { durum: "basarisiz", neden: "saglayici", hata: sonuc.hata });
  return "basarisiz";
}

/** Geçici hata: AZAMI_DENEME'ye kadar artan beklemeyle kuyruğa döner, sonra başarısız. */
function geciciHata(ctx: TenantContext, mesaj: KuyrukMesaji, hata: string, simdi: Date): Sonuc {
  if (mesaj.denemeSayisi < AZAMI_DENEME) {
    const bekle = YENIDEN_DENEME_DK[Math.min(mesaj.denemeSayisi, YENIDEN_DENEME_DK.length) - 1] ?? 15;
    mesajBirak(ctx, mesaj.id, {
      durum: "kuyrukta",
      neden: "gecici_hata",
      hata,
      sonrakiDeneme: new Date(simdi.getTime() + bekle * 60_000),
    });
    return "bekletildi";
  }
  mesajBirak(ctx, mesaj.id, { durum: "basarisiz", neden: "gecici_hata", hata: `${hata} (${AZAMI_DENEME} deneme)` });
  return "basarisiz";
}

/** "YYYY-MM" → sonraki ay. */
function sonrakiAy(ay: string): string {
  const [y, m] = ay.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
