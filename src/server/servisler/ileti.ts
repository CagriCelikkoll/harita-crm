// Ticari ileti kuralları: gönderen bilgileri, sandbox dışı gönderim ön koşulları, günlük sınır, saat penceresi.
import type { Kanal } from "@/lib/mesajlasma";
import type { TenantContext } from "../repo/baglam";
import { engelliOzetler } from "../repo/engel-listesi";
import { iletiAyarlariGetir, type IletiAyarlari } from "../repo/ileti-ayarlari";
import { varsayilanGunlukSinir } from "../repo/sistem/sinir";
import { adresOzeti } from "../messaging/adres";
import type { AliciKaydi, EngelSorgusu } from "../messaging/alici-kurallari";
import { epostaNormallestir, telefonNormallestir } from "../messaging/adres";

/** Sandbox dışı kampanya için eksik olanlar (boşsa hazır). SMS'te ret numarası da gerekir. */
export function ticariIletiEksikleri(a: IletiAyarlari, kanal?: Kanal): string[] {
  const eksik: string[] = [];
  if (!a.gonderenUnvani?.trim()) eksik.push("gönderen unvanı");
  if (!a.iletisimBilgisi?.trim()) eksik.push("iletişim bilgisi");
  if (!a.iysNo?.trim()) eksik.push("İYS kayıt numarası");
  if (!a.sorumlulukOnayTarihi) eksik.push("İYS / 6563 sorumluluk onayı");
  if (kanal === "sms" && !a.smsRetNumarasi?.trim()) eksik.push("SMS ret numarası");
  return eksik;
}

export function gunlukSinir(a: IletiAyarlari, kanal: Kanal): number {
  const ozel = kanal === "eposta" ? a.gunlukEpostaSiniri : a.gunlukSmsSiniri;
  return ozel ?? varsayilanGunlukSinir(kanal);
}

/**
 * Kiracının engel listesine karşı sorgu fonksiyonu. Önceden bilinen adresler toplu sorgulanır; listede
 * olmayan bir adres (ör. gönderim anında Places'tan gelen telefon) için tek sorgu yapılır.
 */
export function engelSorgusuOlustur(ctx: TenantContext, kayitlar: AliciKaydi[] = []): EngelSorgusu {
  const ozetler: string[] = [];
  for (const k of kayitlar) {
    const e = epostaNormallestir(k.eposta);
    if (e) ozetler.push(adresOzeti(ctx.tenantId, "eposta", e));
    const t = telefonNormallestir(k.ekTelefon);
    if (t) ozetler.push(adresOzeti(ctx.tenantId, "telefon", t));
  }
  const bilinen = new Set(ozetler);
  const engelli = engelliOzetler(ctx, ozetler);
  return (tur, adres) => {
    const ozet = adresOzeti(ctx.tenantId, tur, adres);
    return bilinen.has(ozet) ? engelli.has(ozet) : engelliOzetler(ctx, [ozet]).has(ozet);
  };
}

export { iletiAyarlariGetir };
