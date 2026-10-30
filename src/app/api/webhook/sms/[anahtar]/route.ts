// Gelen SMS webhook'u (oturumsuz). Adres kiracıya özgü gizli anahtar içerir (Ayarlar → SMS'te bir kez
// gösterilir); veritabanında yalnızca özeti tutulur. "RET" ile başlayan mesaj ret akışını çalıştırır.
//
// UYARI — DOĞRULANMADI: Netgsm'in gelen SMS'i bir URL'ye iletme (push) biçimi resmî kaynaklardan
// doğrulanamadı. Bu uç nokta GET sorgu parametrelerini, JSON ve form gövdesini kabul eder; numara için
// no / gsmno / telefon / phone / msisdn / numara / from, mesaj için msg / mesaj / message / text alanlarını
// okur. Canlıya almadan önce Netgsm panelindeki gelen SMS yönlendirme biçimiyle karşılaştırın (README).
import { NextResponse } from "next/server";
import { cokBuyuk, govdeOku } from "@/server/api-yardimci";
import { smsRetIsle, webhookBaglami } from "@/server/servisler/sms-ret";

/** Gövde akış halinde en fazla bu kadar okunur (anahtar doğrulandıktan sonra); aşılırsa 413. */
const AZAMI_BAYT = 1024 * 1024;

const TELEFON = ["no", "gsmno", "gsm", "telefon", "phone", "msisdn", "numara", "from", "sender"];
const MESAJ = ["msg", "mesaj", "message", "text", "icerik"];

function ilk(alanlar: Record<string, unknown>, adlar: string[]): string | null {
  const kucuk = Object.fromEntries(Object.entries(alanlar).map(([k, v]) => [k.toLowerCase(), v]));
  for (const ad of adlar) {
    const v = kucuk[ad];
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  return null;
}

/** null: gövde AZAMI_BAYT'ı aşıyor. */
async function alanlariOku(istek: Request): Promise<Record<string, unknown> | null> {
  const alanlar: Record<string, unknown> = Object.fromEntries(new URL(istek.url).searchParams);
  if (istek.method !== "POST") return alanlar;
  const govde = await govdeOku(istek, AZAMI_BAYT);
  if (!govde) return null;
  const metin = new TextDecoder().decode(govde).slice(0, 10_000);
  if (!metin) return alanlar;
  try {
    const json = JSON.parse(metin);
    if (json && typeof json === "object" && !Array.isArray(json)) return { ...alanlar, ...json };
  } catch {
    /* JSON değil: form */
  }
  return { ...alanlar, ...Object.fromEntries(new URLSearchParams(metin)) };
}

async function isle(istek: Request, { params }: RouteContext<"/api/webhook/sms/[anahtar]">) {
  const { anahtar } = await params;
  // Önce anahtar: bilinmeyen adrese gelen gövde hiç okunmaz.
  if (!webhookBaglami(anahtar)) return NextResponse.json({ hata: "Bulunamadı." }, { status: 404 });
  const alanlar = await alanlariOku(istek);
  if (!alanlar) return cokBuyuk();
  const sonuc = smsRetIsle(anahtar, { telefon: ilk(alanlar, TELEFON), mesaj: ilk(alanlar, MESAJ) });
  return NextResponse.json({ tamam: true, ret: sonuc === "ret" }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = isle;
export const POST = isle;
