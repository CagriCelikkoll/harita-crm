// WhatsApp Cloud API webhook'u (oturumsuz; Meta çağırır). Adres çalışma alanına özel rastgele kimlik içerir.
// GET: abonelik doğrulaması (verify token). POST: X-Hub-Signature-256 doğrulanmadan gövde işlenmez (401).
// Meta tekrar denemesin diye işlenen her geçerli istek 200 döner; ayrıntı: servisler/whatsapp-webhook.ts.
import { NextResponse } from "next/server";
import { cokBuyuk, govdeOku } from "@/server/api-yardimci";
import { WEBHOOK_AZAMI_BAYT, webhookDogrula, webhookIsle, webhookTanimliMi } from "@/server/servisler/whatsapp-webhook";

const BASLIK = { "Cache-Control": "no-store" };

export async function GET(istek: Request, { params }: RouteContext<"/api/whatsapp/webhook/[kimlik]">) {
  const { kimlik } = await params;
  const p = new URL(istek.url).searchParams;
  const challenge = webhookDogrula(kimlik, {
    mode: p.get("hub.mode"),
    token: p.get("hub.verify_token"),
    challenge: p.get("hub.challenge"),
  });
  if (challenge === null) return new Response("Doğrulama başarısız.", { status: 403, headers: BASLIK });
  return new Response(challenge, { status: 200, headers: { ...BASLIK, "Content-Type": "text/plain; charset=utf-8" } });
}

export async function POST(istek: Request, { params }: RouteContext<"/api/whatsapp/webhook/[kimlik]">) {
  const { kimlik } = await params;
  // Önce adres: bilinmeyen (ya da numarası doğrulanmamış) kimliğe gelen gövde hiç okunmaz.
  if (!webhookTanimliMi(kimlik)) return NextResponse.json({ hata: "Bulunamadı." }, { status: 404, headers: BASLIK });
  // Gövde akış halinde, sayaçla okunur (Content-Length'e güvenilmez); 1 MB aşılınca okuma kesilir.
  const govde = await govdeOku(istek, WEBHOOK_AZAMI_BAYT);
  if (!govde) return cokBuyuk();
  let sonuc;
  try {
    sonuc = webhookIsle(kimlik, govde, istek.headers.get("x-hub-signature-256"));
  } catch (h) {
    // Transaction geri alındı (hiçbir şey kalıcı değil); 500 ile Meta bildirimi tekrar gönderir. Gövde loglanmaz.
    console.error("WhatsApp webhook işlenemedi:", h instanceof Error ? h.name : "bilinmeyen hata");
    return NextResponse.json({ hata: "İşlenemedi." }, { status: 500, headers: BASLIK });
  }
  if (sonuc.durum === 404) return NextResponse.json({ hata: "Bulunamadı." }, { status: 404, headers: BASLIK });
  if (sonuc.durum === 401) return NextResponse.json({ hata: "İmza geçersiz." }, { status: 401, headers: BASLIK });
  return NextResponse.json({ tamam: true }, { headers: BASLIK });
}
