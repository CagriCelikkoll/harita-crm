"use server";
// Ayarlar → Gelen kutusu: kişisel "Gönderimi geri al" tercihi (herkes, yalnızca kendi üyeliği) ve çalışma alanının
// otomatik kapatma ayarı (yalnızca yönetici).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { otomatikKapatmaGunuMu } from "@/lib/gelen-kutusu";
import { sayfaBaglami } from "@/server/oturum";
import { YetkiHatasi } from "@/server/repo/baglam";
import { gonderimGeriAlAyarla } from "@/server/repo/gelen-kutusu";
import { iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import type { FormDurumu } from "../eylemler";

export async function gonderimGeriAlGuncelle(_o: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  if (!gonderimGeriAlAyarla(ctx, formData.get("gonderimGeriAl") === "on")) return { hata: "Üyelik bulunamadı; sayfayı yenileyin." };
  revalidatePath("/ayarlar/gelen-kutusu");
  revalidatePath("/gelen-kutusu");
  return { tamam: "Kaydedildi." };
}

export async function otomatikKapatmaGuncelle(_o: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  const sonuc = z
    .string()
    .transform((s) => (s === "" ? null : Number(s)))
    .refine((n) => n === null || otomatikKapatmaGunuMu(n), "Geçersiz süre.")
    .safeParse(formData.get("otomatikKapatmaGun") ?? "");
  if (!sonuc.success) return { hata: sonuc.error.issues[0]?.message };
  try {
    iletiAyarlariGuncelle(ctx, { otomatikKapatmaGun: sonuc.data });
  } catch (h) {
    if (h instanceof YetkiHatasi) return { hata: h.message };
    throw h;
  }
  revalidatePath("/ayarlar/gelen-kutusu");
  return { tamam: "Kaydedildi." };
}
