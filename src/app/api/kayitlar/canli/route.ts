// Google kayıtlarının ad, adres ve konumu (Place Details Pro, kayıt başına bir istek ve kota birimi). Yanıt saklanmaz
// (no-store); istemci yalnızca bellekte tutar. Başka kiracının ya da Google dışı kaydın kimliği yok sayılır.
// - Elle ("Göster"): kota dolana kadar çalışır.
// - Otomatik (otomatik: true; Kayıtlar listesi ve tarama sonuçları): yalnızca kendi adı girilmemiş kayıtlar için ve
//   yalnızca aylık kullanım uyarı eşiğinin (%80) altında kalıyorsa. Eşik sunucuda, kota ayırmanın atomik SQL'inde
//   uygulanır; eşiğe gelinince istek yapılmaz, birim düşmez ve yanıt otomatikKapali: true olur (istemci "Göster"e
//   döner). Adı girilmiş kayıt otomatik istekte hiç çağrılmaz.
import { NextResponse } from "next/server";
import { z } from "zod";
import { KOTA_UYARI_ORANI } from "@/lib/sabitler";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { kayitlariGetir } from "@/server/repo/kayitlar";
import { canliBilgiGetir, listeBilgisi, type ListeBilgisi } from "@/server/servisler/canli-bilgi";

const Govde = z
  .object({ idler: z.array(z.string().max(100)).min(1).max(20, "En fazla 20 kayıt."), otomatik: z.boolean().optional() })
  .strict();

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = Govde.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz istek.");
  const otomatik = g.data.otomatik === true;
  const google = kayitlariGetir(ctx, g.data.idler).filter((k) => k.placeId && !(otomatik && k.isletmeAdi));
  const canli = await canliBilgiGetir(
    ctx,
    google.map((k) => k.placeId!),
    "liste",
    otomatik ? { esik: KOTA_UYARI_ORANI } : {},
  );
  const sonuclar: Record<string, ListeBilgisi> = {};
  let otomatikKapali = false;
  for (const k of google) {
    const c = canli.get(k.placeId!);
    if (otomatik && c?.durum === "kota") {
      otomatikKapali = true; // eşik: bu kayıt istenince ("Göster") gösterilir
      continue;
    }
    sonuclar[k.id] = listeBilgisi(c);
  }
  return NextResponse.json({ sonuclar, ...(otomatik ? { otomatikKapali } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
