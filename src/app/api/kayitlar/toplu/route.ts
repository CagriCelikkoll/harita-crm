// Kayıtlar listesinde toplu işlem: etiket ekle / kaldır, alıcı türünü değiştir, WhatsApp iznini kaydet. Yalnızca yönetici
// (403). En fazla TOPLU_ISLEM_AZAMI kayıt (filtreye uyan tümü dahil; aşarsa 400).
// Seçim: sayfada işaretlenen id'ler ya da "filtreye uyan tümü" (süzgeç sorgusu sunucuda yeniden ayrıştırılır; istemciden
// gelen tenant ya da kayıt listesine güvenilmez). Kurallar ve özet repo/kayitlar.ts > kayitlariTopluGuncelle.
// { onizleme: true }: onay penceresinin ön sayımı (değişecek / atlanacak), hiçbir şey yazılmaz.
import { NextResponse } from "next/server";
import { z } from "zod";
import { kayitFiltresiCoz, topluSuzgec } from "@/lib/kayit-filtresi";
import { ALICI_TURLERI, TOPLU_IZIN_KAYNAKLARI } from "@/lib/mesajlasma";
import { TOPLU_ISLEM_AZAMI, TOPLU_ISLEM_SINIRI_METNI } from "@/lib/sabitler";
import { ayniKaynakMi, gecersiz, yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { KayitKuraliHatasi, TopluSecimDegistiHatasi, YetkiHatasi } from "@/server/repo/baglam";
import { kayitlariTopluGuncelle, type TopluIslem, type TopluSecim } from "@/server/repo/kayitlar";

const BASLIK = { "Cache-Control": "no-store" };

const etiket = z.string().trim().toLowerCase().min(1, "Etiket girin.").max(40, "Etiket en fazla 40 karakter olabilir.");

const Secim = z.discriminatedUnion("tur", [
  z.object({
    tur: z.literal("idler"),
    idler: z.array(z.string().min(1).max(64)).min(1, "Kayıt seçin.").max(TOPLU_ISLEM_AZAMI, TOPLU_ISLEM_SINIRI_METNI),
  }),
  z.object({
    tur: z.literal("filtre"),
    /** Kayıtlar sayfasının süzgeç sorgusu (grup, durum, izin, kaynak, wa_izin, etiket, q, ad, inceleme). */
    sorgu: z.string().max(2000),
    /** Onay penceresinde gösterilen sayı: değiştiyse 409. */
    beklenenToplam: z.number().int().min(0),
  }),
]);

/**
 * Onay penceresi önizlemesi ({ onizleme: true }): hiçbir şey yazılmaz; kaç kaydın değişeceği ve hangi nedenle
 * atlanacağı aynı kurallarla hesaplanır. WhatsApp izninde kaynak ve beyan henüz seçilmediğinden istenmez.
 */
const OnizlemeIstek = z
  .object({
    onizleme: z.literal(true),
    secim: Secim,
    islem: z.discriminatedUnion("tur", [
      z.object({ tur: z.literal("etiket_ekle"), etiket }),
      z.object({ tur: z.literal("etiket_kaldir"), etiket }),
      z.object({ tur: z.literal("alici_turu"), aliciTuru: z.enum(ALICI_TURLERI, "Alıcı türünü seçin.") }),
      z.object({ tur: z.literal("whatsapp_izni") }),
    ]),
  })
  .strict();

const TopluIstek = z
  .object({
    secim: Secim,
    islem: z.discriminatedUnion("tur", [
      z.object({ tur: z.literal("etiket_ekle"), etiket }),
      z.object({ tur: z.literal("etiket_kaldir"), etiket }),
      z.object({ tur: z.literal("alici_turu"), aliciTuru: z.enum(ALICI_TURLERI, "Alıcı türünü seçin.") }),
      z.object({
        tur: z.literal("whatsapp_izni"),
        kaynak: z.enum(TOPLU_IZIN_KAYNAKLARI, "İzin kaynağını seçin."),
        // "Diğer" kaynağında zorunlu (repo denetler); kaydın izin notuna yazılır.
        aciklama: z.string().trim().max(500, "Açıklama en fazla 500 karakter olabilir.").nullish(),
        // Onay penceresindeki zorunlu beyan kutusu.
        beyan: z.literal(true, "WhatsApp izni için beyan onay kutusunu işaretleyin."),
      }),
    ]),
  })
  .strict();

export async function POST(istek: Request) {
  if (!ayniKaynakMi(istek)) return yasak();
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  if (ctx.rol !== "yonetici") return yasak(new YetkiHatasi().message);
  const govde = await istek.json().catch(() => null);
  const onizleme = Boolean(govde && typeof govde === "object" && (govde as { onizleme?: unknown }).onizleme === true);
  const g = onizleme ? OnizlemeIstek.safeParse(govde) : TopluIstek.safeParse(govde);
  if (!g.success) return gecersiz(g.error.issues[0]?.message ?? "Geçersiz değer.");
  const s = g.data.secim;
  // Önizlemede WhatsApp izninin kaynağı ve beyanı yok sayılır (repo önizlemede denetlemez).
  const islem: TopluIslem =
    g.data.islem.tur === "whatsapp_izni" && !("kaynak" in g.data.islem)
      ? { tur: "whatsapp_izni", kaynak: "diger", aciklama: null, beyan: false }
      : (g.data.islem as TopluIslem);
  let secim: TopluSecim;
  if (s.tur === "idler") secim = { idler: s.idler };
  else {
    const p = new URLSearchParams(s.sorgu);
    // Kayıtlar sayfasıyla aynı ayrıştırıcı ve aynı varsayılan sekme ("İlgilendiklerim").
    secim = { filtre: topluSuzgec(kayitFiltresiCoz((ad) => p.get(ad) ?? undefined, "ilgi")), beklenenToplam: s.beklenenToplam };
  }
  try {
    return NextResponse.json({ sonuc: kayitlariTopluGuncelle(ctx, secim, islem, { onizleme }) }, { headers: BASLIK });
  } catch (h) {
    if (h instanceof YetkiHatasi) return yasak(h.message);
    if (h instanceof KayitKuraliHatasi) return NextResponse.json({ hata: h.message }, { status: h.durum, headers: BASLIK });
    if (h instanceof TopluSecimDegistiHatasi) {
      return NextResponse.json({ hata: h.message, guncelToplam: h.guncelToplam }, { status: 409, headers: BASLIK });
    }
    throw h;
  }
}
