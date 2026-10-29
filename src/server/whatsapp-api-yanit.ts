// WhatsApp API ayar rotalarının ortak hata yanıtı.
import "server-only";
import { NextResponse } from "next/server";
import { YetkiHatasi } from "./repo/baglam";
import { WhatsappApiHatasi } from "./servisler/whatsapp-api";

export const BASLIK = { "Cache-Control": "no-store" };

/** Bilinen hataları JSON yanıta çevirir; bilinmeyenleri yeniden fırlatır. */
export function hataYaniti(hata: unknown) {
  if (hata instanceof YetkiHatasi) return NextResponse.json({ hata: hata.message }, { status: 403 });
  if (hata instanceof WhatsappApiHatasi) return NextResponse.json({ hata: hata.message }, { status: hata.durum });
  throw hata;
}
