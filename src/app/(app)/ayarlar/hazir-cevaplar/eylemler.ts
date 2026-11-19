"use server";
// Ayarlar → Hazır cevaplar: ekleme, düzenleme ve silme (yetki denetimi depo katmanında: yalnızca yönetici).
import { revalidatePath } from "next/cache";
import { HazirCevapGirdisi } from "@/lib/hazir-cevaplar";
import { sayfaBaglami } from "@/server/oturum";
import { KayitKuraliHatasi, YetkiHatasi } from "@/server/repo/baglam";
import { hazirCevapEkle, hazirCevapGuncelle, hazirCevapSil } from "@/server/repo/hazir-cevaplar";
import type { FormDurumu } from "../eylemler";

const hataMesaji = (h: unknown): FormDurumu => {
  if (h instanceof YetkiHatasi || h instanceof KayitKuraliHatasi) return { hata: h.message };
  throw h;
};

const BULUNAMADI = "Hazır cevap bulunamadı; sayfayı yenileyin.";

/** id varsa düzenler, yoksa ekler. */
export async function hazirCevapKaydet(_o: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  const sonuc = HazirCevapGirdisi.safeParse({ baslik: formData.get("baslik") ?? "", metin: formData.get("metin") ?? "" });
  if (!sonuc.success) return { hata: sonuc.error.issues[0]?.message };
  const id = String(formData.get("id") ?? "");
  try {
    if (id) {
      if (!hazirCevapGuncelle(ctx, id, sonuc.data)) return { hata: BULUNAMADI };
    } else {
      hazirCevapEkle(ctx, sonuc.data);
    }
  } catch (h) {
    return hataMesaji(h);
  }
  revalidatePath("/ayarlar/hazir-cevaplar");
  return { tamam: id ? "Kaydedildi." : "Eklendi." };
}

export async function hazirCevabiSil(_o: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  try {
    if (!hazirCevapSil(ctx, String(formData.get("id") ?? ""))) return { hata: BULUNAMADI };
  } catch (h) {
    return hataMesaji(h);
  }
  revalidatePath("/ayarlar/hazir-cevaplar");
  return { tamam: "Silindi." };
}
