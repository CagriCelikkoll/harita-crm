// Gelen SMS ile ret: alıcı "RET" yazıp çalışma alanının ret numarasına gönderir; sağlayıcı gelen SMS'i
// kiracıya özgü gizli webhook adresine iletir. Sonuç abonelikten çıkmayla aynıdır (retIsle): kayıt(lar)
// ileti_izni = 'ret', numara engel listesine, lead_events'e 'ret'.
//
// Numara kayda iki yolla bağlanır: (1) bu numaraya gönderim yapılmış kuyruk satırları (adres özeti; Places'tan
// alınan numaralar dahil, numaranın kendisi saklanmadan), (2) ek_telefon'u bu numara olan kayıtlar. Hiçbiri
// yoksa numara yine engel listesine yazılır.
import type { TenantContext } from "../repo/baglam";
import { retIsle } from "../repo/engel-listesi";
import { ekTelefonluKayitlar } from "../repo/kayitlar";
import { adreseGonderilenKayitlar } from "../repo/kuyruk";
import { dogrulanmisSistemBaglami, webhookKiracisi } from "../repo/sistem/abonelik";
import { adresOzeti, telefonNormallestir } from "../messaging/adres";
import { webhookOzeti } from "./saglayici";

export type SmsRetSonucu = "gecersiz" | "yoksayildi" | "ret";

/** "RET", "ret", "Ret." … (başta boşluk olabilir). */
export const retMesajiMi = (mesaj: string) => /^\s*ret(?![a-zçğıöşü0-9])/iu.test(mesaj.normalize("NFC"));

export function webhookBaglami(anahtar: string): TenantContext | null {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(anahtar)) return null;
  const tenantId = webhookKiracisi(webhookOzeti(anahtar));
  return tenantId ? dogrulanmisSistemBaglami(tenantId) : null;
}

export function smsRetIsle(anahtar: string, yuk: { telefon?: string | null; mesaj?: string | null }): SmsRetSonucu {
  const ctx = webhookBaglami(anahtar);
  if (!ctx) return "gecersiz";
  if (!yuk.mesaj || !retMesajiMi(yuk.mesaj)) return "yoksayildi";
  const telefon = telefonNormallestir(yuk.telefon);
  if (!telefon) return "yoksayildi";

  const ozet = adresOzeti(ctx.tenantId, "telefon", telefon);
  const kayitlar = new Set(adreseGonderilenKayitlar(ctx, ozet));
  for (const k of ekTelefonluKayitlar(ctx)) if (telefonNormallestir(k.ekTelefon) === telefon) kayitlar.add(k.id);

  const girdi = { adresler: [{ tur: "telefon" as const, ozet }], kaynak: "sms_ret" as const, aciklama: "SMS ile ret (RET yanıtı)" };
  if (!kayitlar.size) retIsle(ctx, { ...girdi, leadId: null });
  for (const leadId of kayitlar) retIsle(ctx, { ...girdi, leadId });
  return "ret";
}
