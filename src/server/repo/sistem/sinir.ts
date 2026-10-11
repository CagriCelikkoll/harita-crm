// Günlük gönderim sınırı yönetimi (yalnızca komut satırından: npm run sinir -- <slug> <kanal> <sayı|varsayilan>).
import { eq } from "drizzle-orm";
import { VARSAYILAN_GUNLUK_SINIR, type Kanal } from "@/lib/mesajlasma";
import { db } from "../../db";
import { iletiAyarlari, tenants } from "../../db/schema";

const ORTAM: Record<Kanal, string> = { eposta: "GUNLUK_EPOSTA_SINIRI", sms: "GUNLUK_SMS_SINIRI" };
const SUTUN = { eposta: "gunlukEpostaSiniri", sms: "gunlukSmsSiniri" } as const;

/** Ortam değişkeni (geçerli tam sayıysa) ya da varsayılan (e-posta 300, SMS 200). */
export function varsayilanGunlukSinir(kanal: Kanal): number {
  const deger = Number(process.env[ORTAM[kanal]]);
  return Number.isInteger(deger) && deger >= 0 ? deger : VARSAYILAN_GUNLUK_SINIR[kanal];
}

/** sinir = null: çalışma alanına özel değeri kaldırır (ortam değişkeni / varsayılan geçerli olur). */
export function gunlukSinirAyarla(slug: string, kanal: Kanal, sinir: number | null) {
  if (sinir !== null && (!Number.isInteger(sinir) || sinir < 0)) {
    throw new Error("Sınır 0 veya daha büyük bir tam sayı olmalı.");
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
