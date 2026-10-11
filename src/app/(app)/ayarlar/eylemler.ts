"use server";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ROLLER, ROL_ADLARI } from "@/lib/sabitler";
import { postaciAl } from "@/server/eposta/postaci";
import { sayfaBaglami } from "@/server/oturum";
import { YetkiHatasi } from "@/server/repo/baglam";
import { calismaAlaniGuncelle, davetIptal, davetOlustur, uyeCikar } from "@/server/repo/calisma-alani";

export type FormDurumu = { hata?: string; tamam?: string; baglanti?: string };

const yetkiMesaji = (h: unknown): FormDurumu => {
  if (h instanceof YetkiHatasi) return { hata: h.message };
  throw h;
};

export async function alanGuncelle(_o: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  const sonuc = z
    .object({
      ad: z.string().trim().min(2, "Ad en az 2 karakter olmalı.").max(80),
      veriSaklamaGun: z
        .string()
        .trim()
        .transform((s) => (s === "" ? null : Number(s)))
        .refine((n) => n === null || (Number.isInteger(n) && n >= 30 && n <= 3650), "Saklama süresi 30–3650 gün olmalı (boş = süresiz)."),
    })
    .safeParse(Object.fromEntries(formData));
  if (!sonuc.success) return { hata: sonuc.error.issues[0]?.message };
  try {
    calismaAlaniGuncelle(ctx, sonuc.data);
  } catch (h) {
    return yetkiMesaji(h);
  }
  revalidatePath("/", "layout");
  return { tamam: "Kaydedildi." };
}

export async function davetGonder(_o: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const b = await sayfaBaglami();
  const sonuc = z
    .object({ eposta: z.email("Geçerli bir e-posta girin."), rol: z.enum(ROLLER) })
    .safeParse(Object.fromEntries(formData));
  if (!sonuc.success) return { hata: sonuc.error.issues[0]?.message };
  try {
    const davet = davetOlustur(b.ctx, sonuc.data);
    const baglanti = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/davet/${davet.token}`;
    await postaciAl().gonder({
      kime: davet.eposta,
      konu: `${b.aktif.ad} çalışma alanına davet`,
      metin:
        `${b.oturum.user.name} sizi Harita CRM'deki "${b.aktif.ad}" çalışma alanına ` +
        `${ROL_ADLARI[davet.rol]} olarak davet etti.\n\nDaveti kabul etmek için: ${baglanti}\n\n` +
        `Bağlantı 7 gün geçerlidir.`,
    });
    revalidatePath("/ayarlar");
    return { tamam: `${davet.eposta} davet edildi. Bağlantıyı paylaşabilirsiniz:`, baglanti };
  } catch (h) {
    return yetkiMesaji(h);
  }
}

export async function davetiIptalEt(formData: FormData) {
  const { ctx } = await sayfaBaglami();
  if (!davetIptal(ctx, String(formData.get("id")))) notFound();
  revalidatePath("/ayarlar");
}

export async function uyeyiCikar(_o: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  try {
    if (!uyeCikar(ctx, String(formData.get("userId")))) notFound();
  } catch (h) {
    return yetkiMesaji(h);
  }
  revalidatePath("/ayarlar");
  return { tamam: "Üye çıkarıldı." };
}
