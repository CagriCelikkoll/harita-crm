"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { AKTIF_ALAN_CEREZI, baglamGetir, oturumGetir } from "@/server/oturum";
import { calismaAlaniKur, davetKabulEt, kullaniciUyelikleri } from "@/server/repo/sistem/uyelik";

const CEREZ_AYARI = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 } as const;

export async function cikisYap() {
  await auth.api.signOut({ headers: await headers() });
  (await cookies()).delete(AKTIF_ALAN_CEREZI);
  redirect("/giris");
}

/** Aktif çalışma alanını değiştirir; yalnızca kullanıcının üye olduğu alanlar seçilebilir. */
export async function aktifAlanSec(formData: FormData) {
  const oturum = await oturumGetir();
  if (!oturum) redirect("/giris");
  const tenantId = String(formData.get("tenantId") ?? "");
  if (kullaniciUyelikleri(oturum.user.id).some((u) => u.tenantId === tenantId)) {
    (await cookies()).set(AKTIF_ALAN_CEREZI, tenantId, CEREZ_AYARI);
  }
  redirect("/panel");
}

export type KurulumDurumu = { hata?: string };

export async function calismaAlaniOlustur(_onceki: KurulumDurumu, formData: FormData): Promise<KurulumDurumu> {
  const b = await baglamGetir();
  if (b.durum === "oturum-yok") redirect("/giris");
  const ad = z.string().trim().min(2).max(80).safeParse(formData.get("ad"));
  if (!ad.success) return { hata: "Çalışma alanı adı 2–80 karakter olmalı." };
  const ctx = calismaAlaniKur(b.oturum.user.id, ad.data);
  (await cookies()).set(AKTIF_ALAN_CEREZI, ctx.tenantId, CEREZ_AYARI);
  redirect("/panel");
}

export type DavetDurumu = { hata?: string };

export async function davetiKabulEt(_onceki: DavetDurumu, formData: FormData): Promise<DavetDurumu> {
  const oturum = await oturumGetir();
  const token = String(formData.get("token") ?? "");
  if (!oturum) redirect(`/giris?sonra=${encodeURIComponent(`/davet/${token}`)}`);
  const sonuc = davetKabulEt(token, oturum.user.id);
  if (sonuc.durum !== "kabul") {
    return {
      hata:
        sonuc.durum === "eposta-uyusmuyor"
          ? "Bu davet başka bir e-posta adresine gönderilmiş. Davet edilen adresle giriş yapın."
          : "Davet geçersiz, kullanılmış veya süresi dolmuş.",
    };
  }
  (await cookies()).set(AKTIF_ALAN_CEREZI, sonuc.tenantId, CEREZ_AYARI);
  redirect("/panel");
}
