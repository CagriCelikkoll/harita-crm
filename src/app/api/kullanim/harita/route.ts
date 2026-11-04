// Tarayıcıda harita oluşturulunca çağrılır: yükleme (Dynamic Maps) bu ayki kullanıma "harita" kalemiyle yazılır.
// Kota denetimi yoktur (harita engellenmez); yanıt gövdesizdir, birim ya da kota döndürülmez.
// Bir üyenin döngüyle istek atıp çalışma alanının kotasını doldurmaması için kullanıcı başına hız sınırı vardır
// (HARITA_SAYIM_SINIRI); sınırı aşan istek sayılmaz, 429 döner (haritaya etkisi yok: istemci yanıtı yok sayar).
import { NextResponse } from "next/server";
import { ayniKaynakMi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { haritaSayimSiniri, haritaYuklemesiKaydet } from "@/server/servisler/kota";

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  if (!haritaSayimSiniri.izinVer(`${ctx.tenantId}:${ctx.userId}`)) {
    return NextResponse.json(
      { hata: "Çok sık harita yüklemesi bildirildi; bir süre sonra tekrar deneyin." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }
  haritaYuklemesiKaydet(ctx);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
