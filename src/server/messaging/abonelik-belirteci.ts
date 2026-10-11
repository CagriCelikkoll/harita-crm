// Abonelikten çıkma belirteci: imzalı, tahmin edilemez, kiracıya ve kayda bağlı.
//
// İçerik (ikili, base64url, 82 bayt): sürüm[1] | kiracı UUID[16] | kayıt UUID[16] | kanal[1] | adres özeti[32] | imza[16]
// İmza = HMAC-SHA256(ILETI_IMZA_ANAHTARI'ndan türetilen "abonelik" anahtarı, önceki alanlar), ilk 16 bayt.
// Adres özeti sayesinde kayıt silinmiş olsa da adres engel listesine yazılabilir. Belirteç kişisel veri
// taşımaz (UUID'ler ve tek yönlü özet). Sahte ya da değiştirilmiş belirteç imza kontrolünde reddedilir.
import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { Kanal } from "@/lib/mesajlasma";
import { hmac, imzaAnahtari } from "./anahtarlar";

const SURUM = 1;
const KANAL_KODU: Record<Kanal, number> = { eposta: 1, sms: 2 };
const KODDAN_KANAL: Record<number, Kanal> = { 1: "eposta", 2: "sms" };
const UZUNLUK = 1 + 16 + 16 + 1 + 32 + 16;

export type AbonelikBilgisi = { tenantId: string; leadId: string; kanal: Kanal; adresOzeti: string };

const uuidBayt = (uuid: string) => {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error("Geçersiz UUID.");
  return Buffer.from(hex, "hex");
};
const baytUuid = (b: Buffer) => {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const imzala = (govde: Buffer) => hmac(imzaAnahtari("abonelik"), govde).subarray(0, 16);

export function abonelikBelirteciUret(b: AbonelikBilgisi): string {
  const govde = Buffer.concat([
    Buffer.from([SURUM]),
    uuidBayt(b.tenantId),
    uuidBayt(b.leadId),
    Buffer.from([KANAL_KODU[b.kanal]]),
    Buffer.from(b.adresOzeti, "hex"),
  ]);
  return Buffer.concat([govde, imzala(govde)]).toString("base64url");
}

/** İmza geçerliyse içeriği, değilse null döndürür. */
export function abonelikBelirteciCoz(belirtec: string): AbonelikBilgisi | null {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(belirtec)) return null;
  const bayt = Buffer.from(belirtec, "base64url");
  // Yalnızca kanonik yazım: kullanılmayan son bitleri farklı olan başka yazımlar kabul edilmez.
  if (bayt.toString("base64url") !== belirtec) return null;
  if (bayt.length !== UZUNLUK || bayt[0] !== SURUM) return null;
  const govde = bayt.subarray(0, UZUNLUK - 16);
  if (!timingSafeEqual(imzala(govde), bayt.subarray(UZUNLUK - 16))) return null;
  const kanal = KODDAN_KANAL[govde[33]];
  if (!kanal) return null;
  return {
    tenantId: baytUuid(govde.subarray(1, 17)),
    leadId: baytUuid(govde.subarray(17, 33)),
    kanal,
    adresOzeti: govde.subarray(34, 66).toString("hex"),
  };
}

export function abonelikBaglantisi(belirtec: string) {
  return `${uygulamaAdresi()}/abonelik/${belirtec}`;
}
/** RFC 8058 tek tıkla abonelikten çıkma (List-Unsubscribe-Post) uç noktası. */
export function abonelikPostAdresi(belirtec: string) {
  return `${uygulamaAdresi()}/api/abonelik/${belirtec}`;
}
export const uygulamaAdresi = () => (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
