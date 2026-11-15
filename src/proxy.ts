// 1) Tünel koruması: geçici tünelden (Host *.trycloudflare.com ya da GENEL_ADRES'in alanı) gelen istek yalnızca
//    /api/whatsapp/webhook/* yoluna ulaşır; diğer her yol 404 (ayrıntı ve Host başlığı uyarıları: src/lib/tunel.ts).
//    Bu yüzden proxy her istekte çalışır (statik dosyalar dahil); localhost'tan gelen istekler bu adımdan geçer.
// 2) Canlı sunucu koruması (yalnızca NODE_ENV=production): izinli alan adı (UYGULAMA_ALANLARI, boşsa BETTER_AUTH_URL'in
//    alanı) ve yerel adresler dışındaki Host'a (ör. sunucunun IP'si) 404.
// 3) İyimser yönlendirme: oturum çerezi yoksa giriş sayfasına gönder (yalnızca aşağıdaki sayfa yollarında).
// Bu GÜVENLİK KONTROLÜ DEĞİLDİR; asıl doğrulama her sayfada/route'ta src/server/oturum.ts ile yapılır.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { izinsizHostMu, tunelIstegiMi, tuneldenIzinliMi } from "@/lib/tunel";

const bulunamadi = () =>
  new NextResponse("Bulunamadı.", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

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
    return bulunamadi();
  }
  if (izinsizHostMu(request.headers)) return bulunamadi();
  if (oturumYoluMu(yol) && !getSessionCookie(request)) {
    const giris = new URL("/giris", request.url);
    giris.searchParams.set("sonra", yol + request.nextUrl.search);
    return NextResponse.redirect(giris);
  }
  return NextResponse.next();
}

// Matcher yok: tünel koruması statik dosyalar ve tüm API'ler dahil her isteği görmeli.
