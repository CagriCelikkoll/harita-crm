// Ticari ileti bilgileri ve gönderim saatleri. Okuma: tüm üyeler. Değiştirme: yalnızca yönetici.
import { NextResponse } from "next/server";
import { z } from "zod";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YetkiHatasi } from "@/server/repo/baglam";
import { iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import { mesajlasmaAyarlariDto } from "@/server/servisler/ayarlar-dto";

const BASLIK = { "Cache-Control": "no-store" };

export async function GET() {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  return NextResponse.json({ ayarlar: mesajlasmaAyarlariDto(ctx) }, { headers: BASLIK });
}

const metin = (azami: number, alan: string) =>
  z
    .string()
    .trim()
    .max(azami, `${alan} en fazla ${azami} karakter olabilir.`)
    .transform((s) => s || null)
    .nullable();
const dakika = z.number("Saat geçersiz.").int().min(0).max(24 * 60);

const Degisiklik = z
  .object({
    gonderenUnvani: metin(160, "Gönderen unvanı"),
    iletisimBilgisi: metin(300, "İletişim bilgisi"),
    iysNo: metin(40, "İYS numarası"),
    sorumlulukOnayi: z.boolean(),
    gonderimBaslangicDk: dakika,
    gonderimBitisDk: dakika,
  })
  .partial()
  .strict()
  .refine(
    (d) =>
      d.gonderimBaslangicDk === undefined || d.gonderimBitisDk === undefined || d.gonderimBaslangicDk < d.gonderimBitisDk,
    "Gönderim başlangıç saati bitişten önce olmalı.",
  );

export async function PUT(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const sonuc = Degisiklik.safeParse(await istek.json().catch(() => null));
  if (!sonuc.success) return gecersiz(sonuc.error.issues[0]?.message ?? "Geçersiz değer.");
  try {
    iletiAyarlariGuncelle(ctx, sonuc.data);
  } catch (hata) {
    if (hata instanceof YetkiHatasi) return yasak(hata.message);
    throw hata;
  }
  return NextResponse.json({ ayarlar: mesajlasmaAyarlariDto(ctx) }, { headers: BASLIK });
}
