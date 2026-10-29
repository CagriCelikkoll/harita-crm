// Günlük gönderim sınırı yönetimi (yalnızca komut satırından: npm run sinir -- <slug> <kanal> <sayı|varsayilan>).
import { eq } from "drizzle-orm";
import {
  VARSAYILAN_GUNLUK_SINIR,
  WHATSAPP_AZAMI_GUNLUK,
  WHATSAPP_VARSAYILAN_GUNLUK,
  type KuyrukKanali,
} from "@/lib/mesajlasma";
import { db } from "../../db";
import { iletiAyarlari, tenants } from "../../db/schema";

/** whatsapp: yarı otomatik liste (kullanıcı başına); whatsapp_api: Cloud API kampanyaları (çalışma alanı başına). */
export type SinirKanali = KuyrukKanali | "whatsapp";
const ORTAM: Record<SinirKanali, string> = {
  eposta: "GUNLUK_EPOSTA_SINIRI",
  sms: "GUNLUK_SMS_SINIRI",
  whatsapp_api: "GUNLUK_WHATSAPP_API_SINIRI",
  whatsapp: "WHATSAPP_GUNLUK_VARSAYILAN",
};
const SUTUN = {
  eposta: "gunlukEpostaSiniri",
  sms: "gunlukSmsSiniri",
  whatsapp_api: "gunlukWhatsappApiSiniri",
  whatsapp: "whatsappGunlukSinir",
} as const;

/**
 * Ortam değişkeni (geçerli tam sayıysa) ya da varsayılan (e-posta 300, SMS 200, WhatsApp kullanıcı başına 30).
 * WhatsApp en fazla 50.
 */
export function varsayilanGunlukSinir(kanal: SinirKanali): number {
  const deger = Number(process.env[ORTAM[kanal]]);
  const gecerli = Number.isInteger(deger) && deger >= 0;
  if (kanal === "whatsapp") return Math.min(WHATSAPP_AZAMI_GUNLUK, gecerli ? deger : WHATSAPP_VARSAYILAN_GUNLUK);
  return gecerli ? deger : VARSAYILAN_GUNLUK_SINIR[kanal];
}

/** sinir = null: çalışma alanına özel değeri kaldırır (ortam değişkeni / varsayılan geçerli olur). */
export function gunlukSinirAyarla(slug: string, kanal: SinirKanali, sinir: number | null) {
  if (sinir !== null && (!Number.isInteger(sinir) || sinir < 0)) {
    throw new Error("Sınır 0 veya daha büyük bir tam sayı olmalı.");
  }
  if (kanal === "whatsapp" && sinir !== null && sinir > WHATSAPP_AZAMI_GUNLUK) {
    throw new Error(`WhatsApp sınırı kullanıcı başına en fazla ${WHATSAPP_AZAMI_GUNLUK} olabilir.`);
  }
  const alan = db.select({ id: tenants.id, ad: tenants.ad, slug: tenants.slug }).from(tenants).where(eq(tenants.slug, slug)).get();
  if (!alan) return null;
  const deger = { [SUTUN[kanal]]: sinir, guncellemeTarihi: new Date() };
  db.insert(iletiAyarlari)
    .values({ tenantId: alan.id, ...deger })
    .onConflictDoUpdate({ target: iletiAyarlari.tenantId, set: deger })
    .run();
  return { ...alan, kanal, sinir: sinir ?? varsayilanGunlukSinir(kanal) };
}
