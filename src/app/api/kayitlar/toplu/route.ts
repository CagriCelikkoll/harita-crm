// Kayıtlar listesinde toplu işlem: etiket ekle / kaldır, alıcı türünü değiştir. Yalnızca yönetici (403).
// Seçim: sayfada işaretlenen id'ler ya da "filtreye uyan tümü" (süzgeç sorgusu sunucuda yeniden ayrıştırılır; istemciden
// gelen tenant ya da kayıt listesine güvenilmez). Kurallar ve özet repo/kayitlar.ts > kayitlariTopluGuncelle.
import { NextResponse } from "next/server";
import { z } from "zod";
import { kayitFiltresiCoz, topluSuzgec } from "@/lib/kayit-filtresi";
import { ALICI_TURLERI } from "@/lib/mesajlasma";
import { TOPLU_ISLEM_AZAMI_ID } from "@/lib/sabitler";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { TopluSecimDegistiHatasi, YetkiHatasi } from "@/server/repo/baglam";
import { kayitlariTopluGuncelle, type TopluSecim } from "@/server/repo/kayitlar";

const BASLIK = { "Cache-Control": "no-store" };

const etiket = z.string().trim().toLowerCase().min(1, "Etiket girin.").max(40, "Etiket en fazla 40 karakter olabilir.");

const TopluIstek = z
  .object({
    secim: z.discriminatedUnion("tur", [
      z.object({
        tur: z.literal("idler"),
        idler: z.array(z.string().min(1).max(64)).min(1, "Kayıt seçin.").max(TOPLU_ISLEM_AZAMI_ID, `En fazla ${TOPLU_ISLEM_AZAMI_ID} kayıt seçilebilir.`),
      }),
      z.object({
        tur: z.literal("filtre"),
        /** Kayıtlar sayfasının süzgeç sorgusu (grup, durum, izin, kaynak, wa_izin, etiket, q, ad, inceleme). */
        sorgu: z.string().max(2000),
        /** Onay penceresinde gösterilen sayı: değiştiyse 409. */
        beklenenToplam: z.number().int().min(0),
      }),
    ]),
    islem: z.discriminatedUnion("tur", [
      z.object({ tur: z.literal("etiket_ekle"), etiket }),
      z.object({ tur: z.literal("etiket_kaldir"), etiket }),
      z.object({ tur: z.literal("alici_turu"), aliciTuru: z.enum(ALICI_TURLERI, "Alıcı türünü seçin.") }),
    ]),
  })
  .strict();

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  if (ctx.rol !== "yonetici") return yasak(new YetkiHatasi().message);
  const g = TopluIstek.safeParse(await istek.json().catch(() => null));
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz değer.");
  const { secim: s, islem } = g.data;
  let secim: TopluSecim;
  if (s.tur === "idler") secim = { idler: s.idler };
  else {
    const p = new URLSearchParams(s.sorgu);
    // Kayıtlar sayfasıyla aynı ayrıştırıcı ve aynı varsayılan sekme ("İlgilendiklerim").
    secim = { filtre: topluSuzgec(kayitFiltresiCoz((ad) => p.get(ad) ?? undefined, "ilgi")), beklenenToplam: s.beklenenToplam };
  }
  try {
    return NextResponse.json({ sonuc: kayitlariTopluGuncelle(ctx, secim, islem) }, { headers: BASLIK });
  } catch (h) {
    if (h instanceof YetkiHatasi) return yasak(h.message);
    if (h instanceof TopluSecimDegistiHatasi) {
      return NextResponse.json({ hata: h.message, guncelToplam: h.guncelToplam }, { status: 409, headers: BASLIK });
    }
    throw h;
  }
}
