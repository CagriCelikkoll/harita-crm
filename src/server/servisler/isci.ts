// Gönderim işçisi: kuyruğu küçük partiler halinde işler (npm run worker döngüsü bunu çağırır).
//
// Her mesaj için sırayla: kampanya hâlâ çalışıyor mu → gönderim saati penceresi → alıcı kuralları YENİDEN
// (ret, engel listesi, bireysel + izinsiz; kampanya oluşturulduktan sonra gelen ret de yakalanır) →
// sandbox dışıysa ticari ileti ön koşulları → günlük sınır (atomik sayaç) → gönderim → olay + durum.
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
  mesajlariAl,
  zamaniGelenKampanyalariBaslat,
} from "../repo/sistem/isci";
import { engelSorgusuOlustur, gunlukSinir, ticariIletiEksikleri } from "./ileti";
import { iletiOlustur } from "./mesaj";
import { saglayiciAl, type SaglayiciSecenekleri } from "./saglayici";
import { placesTelefonuGetir } from "./telefon";

export type IsciSecenekleri = {
  simdi?: () => Date;
  parti?: number;
  /** Testler: sağlayıcıyı değiştirir (varsayılan: kampanya sandbox ise sandbox, değilse kiracının sağlayıcısı). */
  saglayiciSec?: (ctx: TenantContext, kanal: Kanal, sandbox: boolean) => MessageProvider;
  saglayici?: SaglayiciSecenekleri;
};

export type TurSonucu = {
  baslatilanKampanya: number;
  tamamlananKampanya: number;
  belirsiz: number;
  alinan: number;
  gonderilen: number;
  bekletilen: number;
  haric: number;
  basarisiz: number;
};

type Sonuc = "gonderildi" | "bekletildi" | "haric" | "basarisiz";

export async function isciTuru(s: IsciSecenekleri = {}): Promise<TurSonucu> {
  const simdi = s.simdi ?? (() => new Date());
  const sonuc: TurSonucu = { baslatilanKampanya: 0, tamamlananKampanya: 0, belirsiz: 0, alinan: 0, gonderilen: 0, bekletilen: 0, haric: 0, basarisiz: 0 };

  sonuc.baslatilanKampanya = zamaniGelenKampanyalariBaslat(simdi());
  sonuc.belirsiz = belirsizMesajlariKapat(simdi()).length;

  const alinan = mesajlariAl(simdi(), s.parti ?? Number(process.env.WORKER_PARTI ?? 20));
  sonuc.alinan = alinan.length;
  const kampanyaOnbellek = new Map<string, Kampanya | null>();
  const ayarOnbellek = new Map<string, IletiAyarlari>();

  for (const { mesaj, ctx } of alinan) {
    if (!kampanyaOnbellek.has(mesaj.kampanyaId)) kampanyaOnbellek.set(mesaj.kampanyaId, kampanyaGetir(ctx, mesaj.kampanyaId));
    if (!ayarOnbellek.has(ctx.tenantId)) ayarOnbellek.set(ctx.tenantId, iletiAyarlariGetir(ctx));
    let s_: Sonuc;
    try {
      s_ = await mesajIsle(ctx, mesaj, kampanyaOnbellek.get(mesaj.kampanyaId) ?? null, ayarOnbellek.get(ctx.tenantId)!, simdi(), s);
    } catch (hata) {
      // Beklenmeyen hata: gönderim çağrısından ÖNCE oluşur (adaptörler hata fırlatmaz), yeniden denenmez.
      mesajBirak(ctx, mesaj.id, { durum: "basarisiz", neden: "hata", hata: (hata as Error).message.slice(0, 300) });
      s_ = "basarisiz";
    }
    if (s_ === "gonderildi") sonuc.gonderilen++;
    else if (s_ === "bekletildi") sonuc.bekletilen++;
    else if (s_ === "haric") sonuc.haric++;
    else sonuc.basarisiz++;
  }
  sonuc.tamamlananKampanya = bitenKampanyalariKapat(simdi());
  return sonuc;
}

async function mesajIsle(
  ctx: TenantContext,
  mesaj: KuyrukMesaji,
  kampanya: Kampanya | null,
  ayar: IletiAyarlari,
  simdi: Date,
  s: IsciSecenekleri,
): Promise<Sonuc> {
  if (!kampanya || kampanya.durum !== "calisiyor") {
    mesajBirak(ctx, mesaj.id, { durum: "iptal", neden: "iptal", denemeGeriAl: true });
    return "haric";
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
  let adres = karar.adres;
  if (adres === null) {
    const tel = await placesTelefonuGetir(ctx, kayit.placeId);
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
