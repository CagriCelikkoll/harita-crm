import "server-only";
import { NextResponse } from "next/server";

export const yetkisiz = () => NextResponse.json({ hata: "Oturum gerekli." }, { status: 401 });
export const bulunamadi = () => NextResponse.json({ hata: "Bulunamadı." }, { status: 404 });
export const gecersiz = (hata: string) => NextResponse.json({ hata }, { status: 400 });
export const yasak = (hata = "İstek kaynağı reddedildi.") => NextResponse.json({ hata }, { status: 403 });

/**
 * Değişiklik yapan isteklerde (POST/PATCH/DELETE) CSRF koruması: tarayıcının gönderdiği Origin,
 * uygulamanın kendi adresiyle eşleşmeli. (Oturum çerezi SameSite=Lax; bu ikinci katmandır.)
 */
export function ayniKaynakMi(istek: Request): boolean {
  const origin = istek.headers.get("origin");
  if (!origin) return true; // tarayıcı dışı istemciler; tarayıcılar bu yöntemlerde Origin gönderir
  let kaynak: string;
  try {
    kaynak = new URL(origin).host;
  } catch {
    return false;
  }
  const izinli = new Set<string>();
  const host = istek.headers.get("x-forwarded-host") ?? istek.headers.get("host");
  if (host) izinli.add(host);
  if (process.env.BETTER_AUTH_URL) {
    try {
      izinli.add(new URL(process.env.BETTER_AUTH_URL).host);
    } catch {
      /* geçersiz BETTER_AUTH_URL yok sayılır */
    }
  }
  return izinli.has(kaynak);
}
