// Kampanya sihirbazı ve kampanya ayrıntısının görünüm hesapları (saf işlevler; DOM ve veritabanı yok). İş kuralı
// içermez: sunucunun döndürdüğü özet / teslim sayılarını ekranda gösterilecek biçime çevirir.
import { HARIC_NEDEN_ADLARI, HARIC_NEDENLERI, type HaricNedeni, type KuyrukKanali } from "./mesajlasma";
import { teslimHataAciklamasi, teslimHataMetni } from "./whatsapp-api";

/** Yalnızca WhatsApp kanalında anlamlı olan hariç tutma nedenleri. */
const WHATSAPP_NEDENLERI = new Set<HaricNedeni>(["whatsapp_izni_yok", "iys_beyani_yok", "whatsapp_yok", "test_modu", "degisken_bos"]);

/** Bu kanalda gösterilen hariç tutma nedeni mi (ör. e-postada "cep telefonu değil" yok). */
export const kanalNedeni = (kanal: KuyrukKanali, n: HaricNedeni) =>
  (kanal !== "eposta" || n !== "cep_degil") && (kanal === "whatsapp_api" ? n !== "bireysel_izinsiz" : !WHATSAPP_NEDENLERI.has(n));

export type HaricSatiri = { neden: HaricNedeni; ad: string; n: number };

/**
 * Kanalın hariç tutma nedenleri, özetteki sırayla. `tumu`: sıfırlar dahil hepsi ("Tüm nedenleri göster"), `sifirdanBuyuk`:
 * yalnızca en az bir kaydı hariç tutanlar (her zaman görünen liste).
 */
export function haricSatirlari(kanal: KuyrukKanali, haricler: Record<HaricNedeni, number>) {
  const tumu: HaricSatiri[] = HARIC_NEDENLERI.filter((n) => kanalNedeni(kanal, n)).map((n) => ({
    neden: n,
    ad: HARIC_NEDEN_ADLARI[n],
    n: haricler[n] ?? 0,
  }));
  return { tumu, sifirdanBuyuk: tumu.filter((s) => s.n > 0) };
}

/** Meta mesajlaşma limitinin bu uygulamaya ayrılan payından kalan (24 saat); pay yoksa (sınırsız) null. */
export const metaPayiKalani = (limitPayi: number | null, son24Saat: number) => (limitPayi === null ? null : Math.max(0, limitPayi - son24Saat));

/** Meta teslim bildirimi (webhook statuses) adları. */
export const TESLIM_ADLARI: Record<string, string> = {
  sent: "Meta'ya iletildi",
  delivered: "Teslim edildi",
  read: "Okundu",
  failed: "Teslim edilemedi",
};

/** Teslim hata kodunun kısa açıklaması (tek kaynak: lib/whatsapp-api TESLIM_HATA_ACIKLAMALARI; bilinmiyorsa null). */
export const teslimKoduAciklamasi = (kod: number) => teslimHataAciklamasi(kod);

/**
 * Alıcı satırının Durum sütunu: mesajın Meta'dan gelen son durumu teslim edildi / okundu / teslim edilemedi ise o
 * gösterilir (teslim edilemedi + kısa kod açıklaması); yoksa (bildirim gelmedi ya da yalnızca "sent") null: mevcut
 * mesaj durumu rozeti.
 */
export function kisiTeslimDurumu(teslimDurumu: string | null, kod: number | null): { durum: "delivered" | "read" | "failed"; ad: string; kod: string | null } | null {
  if (teslimDurumu !== "delivered" && teslimDurumu !== "read" && teslimDurumu !== "failed") return null;
  return {
    durum: teslimDurumu,
    ad: TESLIM_ADLARI[teslimDurumu],
    kod: teslimDurumu === "failed" && kod !== null ? teslimHataMetni(kod) : null,
  };
}

export type TeslimKarti = {
  durum: "sent" | "delivered" | "read" | "failed";
  ad: string;
  n: number;
  /** Yalnızca "Teslim edilemedi": hata kodları (çoktan aza). */
  kodlar: { kod: number; n: number; aciklama: string | null }[];
};

/**
 * Kampanyanın teslim sayıları (durum + kod grupları) → kartlar. Her mesajın son Meta durumu sayılır (okunan ileti
 * "Teslim edildi"de ayrıca sayılmaz). "Teslim edildi", "Okundu" ve "Teslim edilemedi" her zaman; "Meta'ya iletildi"
 * (henüz teslim bildirimi yok) yalnızca varsa gösterilir.
 */
export function teslimKartlari(teslim: { durum: string | null; kod: number | null; n: number }[]): TeslimKarti[] {
  const kartlar: TeslimKarti[] = (["sent", "delivered", "read", "failed"] as const).map((durum) => ({ durum, ad: TESLIM_ADLARI[durum], n: 0, kodlar: [] }));
  for (const t of teslim) {
    const kart = kartlar.find((k) => k.durum === t.durum);
    if (!kart) continue;
    kart.n += t.n;
    if (kart.durum === "failed" && t.kod !== null) {
      const var_ = kart.kodlar.find((k) => k.kod === t.kod);
      if (var_) var_.n += t.n;
      else kart.kodlar.push({ kod: t.kod, n: t.n, aciklama: teslimKoduAciklamasi(t.kod) });
    }
  }
  for (const k of kartlar) k.kodlar.sort((a, b) => b.n - a.n || a.kod - b.kod);
  return kartlar.filter((k) => k.durum !== "sent" || k.n > 0);
}
