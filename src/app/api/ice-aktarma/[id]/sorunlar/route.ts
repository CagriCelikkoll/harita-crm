// Sorunlu satırlar CSV olarak (satır no, sorun, dosyadaki hücreler). Eşleme gövdede gelir; hiçbir şey yazmaz.
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { EslemVeSecenekler } from "@/server/ice-aktarma-semasi";
import { apiBaglami } from "@/server/oturum";
import { IceAktarmaHatasi, sorunluSatirlarCsv } from "@/server/servisler/ice-aktarma";

export async function POST(istek: Request, { params }: RouteContext<"/api/ice-aktarma/[id]/sorunlar">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = EslemVeSecenekler.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz istek.");
  try {
    const csv = sorunluSatirlarCsv(ctx, (await params).id, g.data.eslem, g.data.secenekler);
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sorunlu-satirlar.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (hata) {
    if (hata instanceof IceAktarmaHatasi) return hata.kod === "bulunamadi" ? bulunamadi() : gecersiz(hata.message);
    throw hata;
  }
}
