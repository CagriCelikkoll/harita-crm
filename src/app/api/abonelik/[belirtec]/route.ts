// Abonelikten çıkma — oturumsuz, herkese açık. İki kullanım:
//  - Abonelik sayfasındaki "Abonelikten çık" butonu (fetch POST).
//  - E-posta istemcilerinin tek tıkla çıkışı (RFC 8058: List-Unsubscribe-Post, gövde
//    "List-Unsubscribe=One-Click"). Bu istekler başka kaynaktan gelir; Origin kontrolü yapılmaz,
//    yetki imzalı belirteçtir.
// GET işlem YAPMAZ (e-posta tarayıcıları bağlantıları önceden açar).
import { NextResponse } from "next/server";
import { aboneliktenCik } from "@/server/servisler/abonelik";

export async function POST(_istek: Request, { params }: RouteContext<"/api/abonelik/[belirtec]">) {
  const tamam = aboneliktenCik((await params).belirtec);
  return tamam
    ? NextResponse.json({ tamam: true }, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ hata: "Bağlantı geçersiz." }, { status: 404 });
}
