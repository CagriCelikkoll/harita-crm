// Kayıt detayındaki WhatsApp durumu (GET; Places çağrısı yapmaz) ve "Gönderdim" (POST; kullanıcının günlük
// WhatsApp sayacına işlenir). Kayıt bu kiracının değilse 404. Sohbeti açmak: /api/whatsapp/ac-kayit/[leadId].
import { NextResponse } from "next/server";
import { ayniKaynakMi, bulunamadi, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { kayitWhatsapp, kayitWhatsappGonderildi, WhatsappHatasi } from "@/server/servisler/whatsapp";

const BASLIK = { "Cache-Control": "no-store" };

export async function GET(_istek: Request, { params }: RouteContext<"/api/kayitlar/[id]/whatsapp">) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const durum = kayitWhatsapp(ctx, (await params).id);
  return durum ? NextResponse.json(durum, { headers: BASLIK }) : bulunamadi();
}

export async function POST(istek: Request, { params }: RouteContext<"/api/kayitlar/[id]/whatsapp">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const { id } = await params;
  try {
    kayitWhatsappGonderildi(ctx, id);
  } catch (hata) {
    if (hata instanceof WhatsappHatasi) {
      return hata.durumKodu === 404 ? bulunamadi() : NextResponse.json({ hata: hata.message }, { status: hata.durumKodu });
    }
    throw hata;
  }
  return NextResponse.json(kayitWhatsapp(ctx, id), { headers: BASLIK });
}
