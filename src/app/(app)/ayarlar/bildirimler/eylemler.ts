"use server";
// Ayarlar → Bildirimler: kullanıcının kendi cihazını listeden kaldırması (ör. kaybolan telefon). Herkes yalnızca
// kendi cihazlarını görür ve kaldırır (depo katmanında kullanıcıya göre süzülür).
import { revalidatePath } from "next/cache";
import { sayfaBaglami } from "@/server/oturum";
import { pushCihaziKaldir } from "@/server/repo/push-abonelikleri";
import type { FormDurumu } from "../eylemler";

export async function bildirimCihaziniKaldir(_o: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  if (!pushCihaziKaldir(ctx, String(formData.get("id") ?? ""))) return { hata: "Cihaz bulunamadı; sayfayı yenileyin." };
  revalidatePath("/ayarlar/bildirimler");
  return { tamam: "Kaldırıldı." };
}
