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

export const cokBuyuk = (hata = "Gövde çok büyük.") =>
  NextResponse.json({ hata }, { status: 413, headers: { "Cache-Control": "no-store" } });

/**
 * İstek gövdesini akış halinde, bayt sayacıyla okur; `azami` aşılınca okumayı keser ve null döner (413 için).
 * Content-Length'e güvenilmez (chunked istekte yoktur): bellekte hiçbir zaman azami + bir parçadan fazlası tutulmaz.
 */
export async function govdeOku(istek: Request, azami: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(istek.headers.get("content-length") ?? 0) > azami) return null;
  if (!istek.body) return new Uint8Array(0);
  const okuyucu = istek.body.getReader();
  const parcalar: Uint8Array[] = [];
  let toplam = 0;
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    toplam += value.byteLength;
    if (toplam > azami) {
      await okuyucu.cancel().catch(() => {});
      return null;
    }
    parcalar.push(value);
  }
  const govde = new Uint8Array(toplam);
  let konum = 0;
  for (const p of parcalar) {
    govde.set(p, konum);
    konum += p.byteLength;
  }
  return govde;
}
