// "WhatsApp'ta aç" yönlendirme rotaları için ortak yardımcılar.
//
// Bu rotalar kullanıcının tıkladığı bir bağlantıyla (üst düzey GET gezinmesi) açılır; tarayıcı bu isteklerde Origin
// göndermediği için diğer API'lerdeki Origin kontrolü burada uygulanamaz. Koruma: oturum çerezi (SameSite=Lax),
// tahmin edilemez liste öğesi kimliği, kiracı + kullanıcı sahipliği ve — tarayıcı gönderiyorsa —
// Sec-Fetch-Site: cross-site isteklerinin reddi (başka siteden gelen bağlantı Places kotası harcatamaz).
import "server-only";
import { NextResponse } from "next/server";
import { uygulamaAdresi } from "./messaging/abonelik-belirteci";

export const caprazSiteMi = (istek: Request) => istek.headers.get("sec-fetch-site") === "cross-site";

const BASLIK = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/** Dış adrese (wa.me) 302. */
export function disariYonlendir(url: string) {
  return NextResponse.redirect(url, { status: 302, headers: BASLIK });
}

/** Uygulama içi yola 302 (yalnızca "/" ile başlayan yollar). */
export function iceriYonlendir(yol: string) {
  if (!yol.startsWith("/") || yol.startsWith("//")) throw new Error("Geçersiz dönüş yolu.");
  return NextResponse.redirect(new URL(yol, uygulamaAdresi()), { status: 302, headers: BASLIK });
}
