// Kampanya detayı: ilerleme ve alıcı bazında durum (sayfalı). Kampanya bu kiracının değilse 404.
// İptal: POST ?islem=iptal (bekleyen mesajlar gönderilmez). Devam: POST ?islem=devam (duraklatılmış WhatsApp
// kampanyası; yalnızca yönetici, kalite kırmızı değilse).
import { NextResponse } from "next/server";
import { MESAJ_DURUMLARI } from "@/lib/mesajlasma";
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { kampanyaGetir, kampanyaIptal, kampanyaMesajlari } from "@/server/repo/kampanyalar";
import { isciSonNabiz } from "@/server/repo/sistem/isci";
import { kampanyaDto, mesajDto } from "@/server/servisler/kampanya-dto";
import { YetkiHatasi } from "@/server/repo/baglam";
import { KampanyaHatasi, kampanyayiDevamEttir } from "@/server/servisler/kampanya";

export async function GET(istek: Request, { params }: RouteContext<"/api/kampanyalar/[id]">) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  const kampanya = kampanyaGetir(ctx, id);
  if (!kampanya) return bulunamadi();
  const p = new URL(istek.url).searchParams;
  const durum = MESAJ_DURUMLARI.find((d) => d === p.get("durum"));
  const sayfa = kampanyaMesajlari(ctx, id, { sayfa: Number(p.get("sayfa") ?? 1) || 1, durum });
  return NextResponse.json(
    {
      kampanya: kampanyaDto(kampanya),
      ...sayfa,
      mesajlar: sayfa.mesajlar.map(mesajDto),
      // Gönderim servisinin son çalışması (kampanya detayındaki durum satırı; 10 sn'de bir yenilenir).
      isciSonNabiz: isciSonNabiz()?.toISOString() ?? null,
      simdi: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(istek: Request, { params }: RouteContext<"/api/kampanyalar/[id]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const islem = new URL(istek.url).searchParams.get("islem");
  const { id } = await params;
  if (!kampanyaGetir(ctx, id)) return bulunamadi();
  if (islem === "devam") {
    try {
      await kampanyayiDevamEttir(ctx, id);
    } catch (hata) {
      if (hata instanceof YetkiHatasi) return yasak(hata.message);
      if (hata instanceof KampanyaHatasi) return gecersiz(hata.message);
      throw hata;
    }
    return NextResponse.json({ tamam: true });
  }
  if (islem !== "iptal") return gecersiz("Bilinmeyen işlem.");
  if (!kampanyaIptal(ctx, id)) return gecersiz("Bu kampanya iptal edilemez (tamamlanmış ya da zaten iptal).");
  return NextResponse.json({ tamam: true });
}
