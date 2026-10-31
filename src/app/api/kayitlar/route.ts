// Elle kişi ekleme (Google dışı kayıt, kaynak 'elle'). Ad ve telefon kullanıcının verisidir.
import { NextResponse } from "next/server";
import { z } from "zod";
import { epostaNormallestir, telefonNormallestir } from "@/lib/adres-normal";
import { ALICI_TURLERI } from "@/lib/mesajlasma";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { kisileriEkle } from "@/server/repo/kayitlar";
import { kayitDto } from "@/server/servisler/kayit-dto";

const metin = (azami: number, alan: string) =>
  z
    .string()
    .trim()
    .max(azami, `${alan} en fazla ${azami} karakter olabilir.`)
    .transform((s) => s || null)
    .nullish();

const YeniKisi = z
  .object({
    isletmeAdi: metin(160, "İşletme adı"),
    yetkiliAdi: metin(120, "Ad"),
    eposta: metin(200, "E-posta").refine((s) => !s || epostaNormallestir(s), "Geçerli bir e-posta adresi girin."),
    ekTelefon: metin(40, "Telefon").refine((s) => !s || telefonNormallestir(s), "Telefon numarası tanınmadı."),
    notlar: metin(5000, "Notlar"),
    etiketler: z
      .array(z.string().trim().toLowerCase().max(40))
      .max(20, "En fazla 20 etiket.")
      .transform((e) => [...new Set(e.filter(Boolean))])
      .optional(),
    // Varsayılan yok: kullanıcı seçmek zorunda.
    aliciTuru: z.enum(ALICI_TURLERI, "Alıcı türünü seçin: Tacir/esnaf (işletme) ya da Bireysel (kişi)."),
  })
  .strict()
  .refine((k) => k.ekTelefon || k.eposta, "Telefon ya da e-posta girin.")
  .refine((k) => k.isletmeAdi || k.yetkiliAdi, "İşletme adı ya da ad girin.");

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const g = YeniKisi.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz değer.");
  const [kayit] = kisileriEkle(ctx, [{ kaynak: "elle", ...g.data }], "Elle eklendi");
  return NextResponse.json({ kayit: kayitDto(kayit) }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
