// İçe aktarmayı uygular. İzinli satır varsa beyan onayı (beyanOnayi: true), ret işaretli satır varsa ret onayı
// (retOnayi: true; ret geri alınamaz) sunucuda zorunludur.
import { NextResponse } from "next/server";
import { z } from "zod";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { EslemVeSecenekler } from "@/server/ice-aktarma-semasi";
import { apiBaglami } from "@/server/oturum";
import { IceAktarmaHatasi, iceAktarmaTamamla } from "@/server/servisler/ice-aktarma";

const Govde = EslemVeSecenekler.extend({ beyanOnayi: z.boolean(), retOnayi: z.boolean().default(false) });

export async function POST(istek: Request, { params }: RouteContext<"/api/ice-aktarma/[id]/tamamla">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = Govde.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz istek.");
  try {
    const sonuc = iceAktarmaTamamla(ctx, (await params).id, g.data.eslem, g.data.secenekler, g.data.beyanOnayi, g.data.retOnayi);
    return NextResponse.json({ sonuc }, { headers: { "Cache-Control": "no-store" } });
  } catch (hata) {
    if (hata instanceof IceAktarmaHatasi) {
      return NextResponse.json({ hata: hata.message, kod: hata.kod }, { status: hata.kod === "bulunamadi" ? 404 : 400 });
    }
    throw hata;
  }
}
