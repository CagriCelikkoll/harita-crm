// 1) Tünel koruması: geçici tünelden (Host *.trycloudflare.com ya da GENEL_ADRES'in alanı) gelen istek yalnızca
//    /api/whatsapp/webhook/* yoluna ulaşır; diğer her yol 404 (ayrıntı ve Host başlığı uyarıları: src/lib/tunel.ts).
//    Bu yüzden proxy her istekte çalışır (statik dosyalar dahil); localhost'tan gelen istekler bu adımdan geçer.
// 2) İyimser yönlendirme: oturum çerezi yoksa giriş sayfasına gönder (yalnızca aşağıdaki sayfa yollarında).
// Bu GÜVENLİK KONTROLÜ DEĞİLDİR; asıl doğrulama her sayfada/route'ta src/server/oturum.ts ile yapılır.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { tunelIstegiMi, tuneldenIzinliMi } from "@/lib/tunel";

/** Oturum çerezi yoksa girişe yönlendirilen sayfalar (Next matcher biçiminde: "/x/:path*" hem /x'i hem altını kapsar). */
const OTURUM_YOLLARI = ["/", "/panel/:path*", "/tarama/:path*", "/kayitlar/:path*", "/kampanyalar/:path*", "/iletisim/:path*", "/ayarlar/:path*", "/kurulum"];

export function oturumYoluMu(yol: string): boolean {
  return OTURUM_YOLLARI.some((y) => {
    if (!y.endsWith("/:path*")) return yol === y;
    const kok = y.slice(0, -"/:path*".length);
    return yol === kok || yol.startsWith(`${kok}/`);
  });
}

export function proxy(request: NextRequest) {
  const yol = request.nextUrl.pathname;
  if (tunelIstegiMi(request.headers)) {
    if (tuneldenIzinliMi(yol)) return NextResponse.next();
    return new NextResponse("Bulunamadı.", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (oturumYoluMu(yol) && !getSessionCookie(request)) {
    const giris = new URL("/giris", request.url);
    giris.searchParams.set("sonra", yol + request.nextUrl.search);
    return NextResponse.redirect(giris);
  }
  return NextResponse.next();
}

// Matcher yok: tünel koruması statik dosyalar ve tüm API'ler dahil her isteği görmeli.
