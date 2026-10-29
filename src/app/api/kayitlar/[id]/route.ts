// Tek kayıt: okuma, güncelleme, silme. Kayıt bağlamdaki kiracıya ait değilse 404.
// Her değişiklik depo fonksiyonu içinde lead_events'e yazılır.
import { NextResponse } from "next/server";
import { z } from "zod";
import { ALICI_TURLERI } from "@/lib/mesajlasma";
import { ILETI_IZINLERI, KAYIT_DURUMLARI } from "@/lib/sabitler";
import { ayniKaynakMi, bulunamadi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { kayitGetir, kayitGuncelle, kayitSil } from "@/server/repo/kayitlar";
import { olaylariListele } from "@/server/repo/olaylar";
import { canliBilgiGetir, type CanliSonuc } from "@/server/servisler/canli-bilgi";
import { kayitDto, olayDto } from "@/server/servisler/kayit-dto";

const BASLIK = { "Cache-Control": "no-store" };

/**
 * ?canli=1 → işletme bilgisi Places'tan canlı (Place Details Enterprise, tek çağrı) çekilir.
 * Parametresiz → yalnızca kullanıcı verisi ve olaylar (Places çağrısı yok; işlemlerden sonra kullanılır).
 */
export async function GET(istek: Request, { params }: RouteContext<"/api/kayitlar/[id]">) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const kayit = kayitGetir(ctx, (await params).id);
  if (!kayit) return bulunamadi();
  let canli: CanliSonuc | undefined;
  // Google dışı kayıtta (place_id yok) Places çağrısı yapılmaz.
  if (kayit.placeId && new URL(istek.url).searchParams.get("canli") === "1") {
    canli = (await canliBilgiGetir(ctx, [kayit.placeId], "detay")).get(kayit.placeId);
  }
  return NextResponse.json(
    { kayit: kayitDto(kayit), olaylar: olaylariListele(ctx, kayit.id).map(olayDto), canli },
    { headers: BASLIK },
  );
}

const metin = (azami: number, alan: string) =>
  z
    .string()
    .trim()
    .max(azami, `${alan} en fazla ${azami} karakter olabilir.`)
    .transform((s) => s || null)
    .nullable();

const Degisiklik = z
  .object({
    durum: z.enum(KAYIT_DURUMLARI),
    iletiIzni: z.enum(ILETI_IZINLERI),
    // Kullanıcının girdiği işletme adı (kampanyalardaki {isletme}). Places'tan gelen ad buraya yazılmaz.
    isletmeAdi: metin(160, "İşletme adı"),
    aliciTuru: z.enum(ALICI_TURLERI),
    yetkiliAdi: metin(120, "Yetkili adı"),
    eposta: z
      .string()
      .trim()
      .max(200)
      .refine((s) => s === "" || z.email().safeParse(s).success, "Geçerli bir e-posta adresi girin.")
      .transform((s) => s || null)
      .nullable(),
    ekTelefon: metin(40, "Ek telefon"),
    notlar: metin(5000, "Notlar"),
    etiketler: z
      .array(z.string().trim().toLowerCase().max(40))
      .max(20, "En fazla 20 etiket.")
      .transform((e) => [...new Set(e.filter(Boolean))]),
  })
  .partial()
  .strict();

export async function PATCH(istek: Request, { params }: RouteContext<"/api/kayitlar/[id]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const sonuc = Degisiklik.safeParse(await istek.json().catch(() => null));
  if (!sonuc.success) return gecersiz(sonuc.error.issues[0]?.message ?? "Geçersiz değer.");
  const kayit = kayitGuncelle(ctx, (await params).id, sonuc.data);
  return kayit ? NextResponse.json({ kayit: kayitDto(kayit) }, { headers: BASLIK }) : bulunamadi();
}

export async function DELETE(istek: Request, { params }: RouteContext<"/api/kayitlar/[id]">) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  return kayitSil(ctx, (await params).id) ? new Response(null, { status: 204 }) : bulunamadi();
}
