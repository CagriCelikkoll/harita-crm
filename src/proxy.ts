// İyimser yönlendirme: oturum çerezi yoksa giriş sayfasına gönder.
// Bu GÜVENLİK KONTROLÜ DEĞİLDİR; asıl doğrulama her sayfada/route'ta src/server/oturum.ts ile yapılır.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const giris = new URL("/giris", request.url);
    giris.searchParams.set("sonra", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(giris);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/panel/:path*", "/tarama/:path*", "/kayitlar/:path*", "/kampanyalar/:path*", "/iletisim/:path*", "/ayarlar/:path*", "/kurulum"],
};
