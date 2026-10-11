"use server";
// Kayıt işlemleri. Her işlem lead_events'e yazılır (depo fonksiyonları içinde).
// Kayıt bağlamdaki kiracıya ait değilse depo null/false döner ve burada 404 (notFound) verilir.
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { KAYIT_DURUMLARI } from "@/lib/sabitler";
import { sayfaBaglami } from "@/server/oturum";
import { kayitGuncelle, kayitSil } from "@/server/repo/kayitlar";
import { notOlayiGuncelle, notOlayiSil, olayEkle } from "@/server/repo/olaylar";

export type FormDurumu = { hata?: string; tamam?: string };

const metinAlani = (azami: number) =>
  z
    .string()
    .trim()
    .max(azami)
    .transform((s) => s || null);

const BilgiFormu = z.object({
  id: z.string().min(1),
  yetkiliAdi: metinAlani(120),
  eposta: z
    .string()
    .trim()
    .max(200)
    .refine((s) => s === "" || z.email().safeParse(s).success, "Geçerli bir e-posta adresi girin.")
    .transform((s) => s || null),
  ekTelefon: metinAlani(40),
  notlar: metinAlani(5000),
  etiketler: z
    .string()
    .max(500)
    .transform((s) => [...new Set(s.split(",").map((e) => e.trim().toLocaleLowerCase("tr")).filter(Boolean))].slice(0, 20)),
});

const yenile = () => revalidatePath("/kayitlar");

export async function kayitBilgileriniKaydet(_onceki: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  const sonuc = BilgiFormu.safeParse(Object.fromEntries(formData));
  if (!sonuc.success) return { hata: sonuc.error.issues[0]?.message ?? "Geçersiz değer." };
  const { id, ...degisiklik } = sonuc.data;
  if (!kayitGuncelle(ctx, id, degisiklik)) notFound();
  yenile();
  return { tamam: "Kaydedildi." };
}

/** Yalnızca e-posta alanını kaydeder (detaydaki "E-posta ekle" alanı). */
export async function epostaKaydet(_onceki: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  const eposta = z.email().max(200).safeParse(String(formData.get("eposta") ?? "").trim());
  if (!eposta.success) return { hata: "Geçerli bir e-posta adresi girin." };
  if (!kayitGuncelle(ctx, String(formData.get("id")), { eposta: eposta.data })) notFound();
  yenile();
  return { tamam: "E-posta kaydedildi." };
}

export async function durumDegistir(formData: FormData) {
  const { ctx } = await sayfaBaglami();
  const durum = z.enum(KAYIT_DURUMLARI).safeParse(formData.get("durum"));
  if (!durum.success) return;
  if (!kayitGuncelle(ctx, String(formData.get("id")), { durum: durum.data })) notFound();
  yenile();
}

export async function iletiReddiIsaretle(formData: FormData) {
  const { ctx } = await sayfaBaglami();
  if (!kayitGuncelle(ctx, String(formData.get("id")), { iletiIzni: "ret" })) notFound();
  yenile();
}

export async function iletiIzniOnayla(formData: FormData) {
  const { ctx } = await sayfaBaglami();
  if (!kayitGuncelle(ctx, String(formData.get("id")), { iletiIzni: "onayli" })) notFound();
  yenile();
}

/** "Ara" / "E-posta" düğmeleri: bağlantı açılmadan önce etkinlik kaydı. */
export async function iletisimKaydet(id: string, tur: "arama" | "eposta"): Promise<boolean> {
  const { ctx } = await sayfaBaglami();
  const olay = olayEkle(ctx, id, tur, tur === "arama" ? "Arama başlatıldı" : "E-posta penceresi açıldı");
  if (!olay) notFound();
  yenile();
  return true;
}

export async function notEkle(_onceki: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  const metin = z.string().trim().min(1).max(2000).safeParse(formData.get("metin"));
  if (!metin.success) return { hata: "Not boş olamaz (en fazla 2000 karakter)." };
  if (!olayEkle(ctx, String(formData.get("id")), "not", metin.data)) notFound();
  yenile();
  return { tamam: "Not eklendi." };
}

export async function notDuzenle(_onceki: FormDurumu, formData: FormData): Promise<FormDurumu> {
  const { ctx } = await sayfaBaglami();
  const metin = z.string().trim().min(1).max(2000).safeParse(formData.get("metin"));
  if (!metin.success) return { hata: "Not boş olamaz." };
  if (!notOlayiGuncelle(ctx, String(formData.get("olayId")), metin.data)) notFound();
  yenile();
  return { tamam: "Güncellendi." };
}

export async function notSil(formData: FormData) {
  const { ctx } = await sayfaBaglami();
  if (!notOlayiSil(ctx, String(formData.get("olayId")))) notFound();
  yenile();
}

export async function kaydiSil(formData: FormData) {
  const { ctx } = await sayfaBaglami();
  if (!kayitSil(ctx, String(formData.get("id")))) notFound();
  yenile();
  redirect("/kayitlar");
}
