// Tarayıcıda harita oluşturulunca çağrılır: yükleme (Dynamic Maps) bu ayki kullanıma "harita" kalemiyle yazılır.
// Kota denetimi yoktur (harita engellenmez); yanıt gövdesizdir, birim ya da kota döndürülmez.
import { ayniKaynakMi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { haritaYuklemesiKaydet } from "@/server/servisler/kota";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  haritaYuklemesiKaydet(ctx);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
