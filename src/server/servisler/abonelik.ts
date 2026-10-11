// Abonelikten çıkma (oturumsuz, herkese açık). Belirteç imzası doğrulanmadan hiçbir veri okunmaz.
// Sayfada gönderenin unvanından başka kiracı ya da kayıt bilgisi gösterilmez.
import type { TenantContext } from "../repo/baglam";
import { retIsle } from "../repo/engel-listesi";
import { iletiAyarlariGetir } from "../repo/ileti-ayarlari";
import { dogrulanmisSistemBaglami } from "../repo/sistem/abonelik";
import { abonelikBelirteciCoz, type AbonelikBilgisi } from "../messaging/abonelik-belirteci";

function coz(belirtec: string): { bilgi: AbonelikBilgisi; ctx: TenantContext } | null {
  let bilgi: AbonelikBilgisi | null;
  try {
    bilgi = abonelikBelirteciCoz(belirtec);
  } catch {
    return null;
  }
  if (!bilgi) return null;
  const ctx = dogrulanmisSistemBaglami(bilgi.tenantId);
  return ctx ? { bilgi, ctx } : null;
}

/** Sayfa için: yalnızca gönderen unvanı. Geçersiz belirteçte null. */
export function abonelikSayfaBilgisi(belirtec: string): { gonderenUnvani: string | null } | null {
  const c = coz(belirtec);
  if (!c) return null;
  return { gonderenUnvani: iletiAyarlariGetir(c.ctx).gonderenUnvani?.trim() || null };
}

/**
 * Abonelikten çıkar: kayıt (bu kiracıdaysa) ileti_izni = 'ret', adres engel listesine, lead_events'e 'ret'.
 * Kayıt silinmiş olsa da adres özeti engel listesine yazılır. Geçersiz belirteçte false.
 */
export function aboneliktenCik(belirtec: string): boolean {
  const c = coz(belirtec);
  if (!c) return false;
  retIsle(c.ctx, {
    leadId: c.bilgi.leadId,
    adresler: [{ tur: c.bilgi.kanal === "eposta" ? "eposta" : "telefon", ozet: c.bilgi.adresOzeti }],
    kaynak: "abonelik",
    aciklama: `Abonelikten çıkma bağlantısıyla ileti reddi (${c.bilgi.kanal === "eposta" ? "e-posta" : "SMS"})`,
  });
  return true;
}
