// Çalışma alanının "İYS kontrolü" ayarı. Değiştirme: yalnızca yönetici. Kapatmak, sorumluluk beyanının açıkça
// onaylanmasını ister (onay: true); her değişiklik denetim kaydına yazılır (repo/ileti-ayarlari.iysKontroluDegistir).
import { NextResponse } from "next/server";
import { z } from "zod";
import { IYS_KAPATMA_ONAY_METNI } from "@/lib/mesajlasma";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YetkiHatasi } from "@/server/repo/baglam";
import { iysKontroluDegistir } from "@/server/repo/ileti-ayarlari";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";

const Girdi = z
  .object({ acik: z.boolean(), onay: z.boolean().optional() })
  .strict()
  .refine((g) => g.acik || g.onay === true, `Kapatmak için onaylayın: "${IYS_KAPATMA_ONAY_METNI}"`);

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = Girdi.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz değer.");
  try {
    iysKontroluDegistir(ctx, g.data);
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return yasak("İYS kontrolünü yalnızca yönetici değiştirebilir.");
    throw hata;
  }
  return NextResponse.json(
    { ayarlar: mesajlasmaAyarlariDto(ctx), mesaj: g.data.acik ? "İYS kontrolü açıldı." : "İYS kontrolü kapatıldı." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
