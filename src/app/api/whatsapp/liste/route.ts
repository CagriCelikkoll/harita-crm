// WhatsApp günlük liste: GET bugünkü liste ve sıradaki kayıt; POST alıcı grubundan listeyi doldurur.
// Liste kullanıcıya özeldir; gönderimi kullanıcı wa.me bağlantısına tıklayarak kendisi yapar.
import { NextResponse } from "next/server";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { ListeFiltresi, listeDurumu, listeHazirla, WhatsappHatasi } from "@/server/servisler/whatsapp";

const BASLIK = { "Cache-Control": "no-store" };

export async function GET() {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  return NextResponse.json(listeDurumu(ctx), { headers: BASLIK });
}

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const filtre = ListeFiltresi.safeParse(((await istek.json().catch(() => null)) as { filtre?: unknown } | null)?.filtre ?? {});
  if (!filtre.success) return gecersiz(filtre.error.issues[0]?.message ?? "Geçersiz filtre.");
  try {
    const hazirlik = listeHazirla(ctx, filtre.data);
    return NextResponse.json({ hazirlik, ...(listeDurumu(ctx)) }, { headers: BASLIK });
  } catch (hata) {
    if (hata instanceof WhatsappHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durumKodu });
    throw hata;
  }
}
