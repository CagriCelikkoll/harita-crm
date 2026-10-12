// Ticari ileti bilgileri ve gönderim saatleri. Okuma: tüm üyeler. Değiştirme: yalnızca yönetici.
import { NextResponse } from "next/server";
import { z } from "zod";
import { WHATSAPP_AZAMI_GUNLUK } from "@/lib/mesajlasma";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { YetkiHatasi } from "@/server/repo/baglam";
import { iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import { telefonNormallestir } from "@/server/messaging/adres";
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
    // SMS ret numarası: alıcıların RET yazıp gönderdiği, gelen SMS alabilen numara (kısa numara da olabilir).
    smsRetNumarasi: metin(20, "SMS ret numarası").refine(
      (s) => s === null || /^\+?[0-9 ]{3,20}$/.test(s),
      "Ret numarası yalnızca rakam içermeli.",
    ),
    yetkiliTelefonu: metin(20, "Yetkili telefonu").refine(
      (s) => s === null || /^905\d{9}$/.test(telefonNormallestir(s) ?? ""),
      "Yetkili telefonu bir cep telefonu olmalı (5XX XXX XX XX).",
    ),
    whatsappSablonu: metin(1000, "WhatsApp şablonu"),
    whatsappGunlukSinir: z
      .number("Günlük sınır bir sayı olmalı.")
      .int()
      .min(1, "Günlük sınır en az 1 olmalı.")
      .max(WHATSAPP_AZAMI_GUNLUK, `Günlük sınır kullanıcı başına en fazla ${WHATSAPP_AZAMI_GUNLUK} olabilir.`)
      .nullable(),
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
