// Tarama sonucunun incelenmesi: "İlgilen" / "İlgilenme" (tek kayıt ya da sayfadakilerin hepsi). Yalnızca bu
// kiracının kayıtları güncellenir; başka kiracının kimliği yok sayılır.
import { NextResponse } from "next/server";
import { z } from "zod";
import { INCELEME_DURUMLARI } from "@/lib/sabitler";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { incelemeAyarla } from "@/server/repo/kayitlar";

const Govde = z
  .object({ idler: z.array(z.string().max(100)).min(1).max(50), inceleme: z.enum(INCELEME_DURUMLARI) })
  .strict();

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = Govde.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz istek.");
  const guncellenen = incelemeAyarla(ctx, g.data.idler, g.data.inceleme);
  return NextResponse.json({ guncellenen }, { headers: { "Cache-Control": "no-store" } });
}
