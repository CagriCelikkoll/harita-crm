// Kullanıcı istediğinde görünen Google kayıtlarının ad ve adresi (Place Details Pro, kayıt başına bir istek ve kota
// birimi). Kayıtlar listesi, tarama sonuçlarını inceleme ve kampanya alıcıları bunu "Göster" düğmesiyle çağırır;
// liste kendiliğinden Places'a gitmez. Yanıt saklanmaz (no-store); istemci yalnızca o sayfa görünümünün belleğinde
// tutar. Başka kiracının ya da Google dışı kaydın kimliği yok sayılır.
import { NextResponse } from "next/server";
import { z } from "zod";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { kayitlariGetir } from "@/server/repo/kayitlar";
import { canliBilgiGetir, listeBilgisi, type ListeBilgisi } from "@/server/servisler/canli-bilgi";

const Govde = z.object({ idler: z.array(z.string().max(100)).min(1).max(20, "En fazla 20 kayıt.") }).strict();

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = Govde.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz istek.");
  const google = kayitlariGetir(ctx, g.data.idler).filter((k) => k.placeId);
  const canli = await canliBilgiGetir(ctx, google.map((k) => k.placeId!), "liste");
  const sonuclar: Record<string, ListeBilgisi> = {};
  for (const k of google) sonuclar[k.id] = listeBilgisi(canli.get(k.placeId!));
  return NextResponse.json({ sonuclar }, { headers: { "Cache-Control": "no-store" } });
}
