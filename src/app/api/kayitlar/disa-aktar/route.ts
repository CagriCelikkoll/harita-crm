// CSV dışa aktarma: YALNIZCA kullanıcının kendi verisi (place_id, durum, notlar, girdiği iletişim
// bilgileri). Places'tan gelen ad/adres/telefon dışa aktarılmaz.
//  - Varsayılan: Türkçe başlıklı, noktalı virgüllü CSV (Excel).
//  - ?bicim=google: Google Kişiler'in içe aktarabildiği CSV (yeni biçim, virgül, UTF-8 BOM). Yalnızca yönetici;
//    dışa aktarılan her kaydın geçmişine olay yazılır.
import { ALICI_TURU_ADLARI } from "@/lib/mesajlasma";
import { kayitFiltresiCoz } from "@/lib/kayit-filtresi";
import { ILETI_IZNI_ADLARI, INCELEME_ADLARI, KAYIT_DURUM_ADLARI, KAYIT_KAYNAK_ADLARI } from "@/lib/sabitler";
import { yasak, yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { disaAktarilacakKayitlar } from "@/server/repo/kayitlar";
import { topluOlayEkle } from "@/server/repo/olaylar";
import { googleCsv, googleSatiri } from "@/server/servisler/google-kisiler";

// Başlıklar ve kod değerleri (durum, izin, alıcı türü, kaynak, inceleme) Türkçe etiketlerle yazılır; başlıklar içe
// aktarma sihirbazının otomatik eşlemesiyle de uyumludur (İşletme adı, Telefon, E-posta, Alıcı türü …).
const SUTUNLAR = [
  "Google yer kimliği (place_id)",
  "Kaynak",
  "Durum",
  "İleti izni",
  "Alıcı türü",
  "İnceleme",
  "İşletme adı",
  "Yetkili adı",
  "E-posta",
  "Ek telefon",
  "Etiketler",
  "Notlar",
  "Oluşturma tarihi",
  "Güncelleme tarihi",
] as const;

function hucre(deger: unknown) {
  let s = String(deger ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // Excel formül enjeksiyonuna karşı
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const indirme = (govde: string, ad: string) =>
  new Response(govde, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ad}"`,
      "Cache-Control": "no-store",
    },
  });

export async function GET(istek: Request) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const p = new URL(istek.url).searchParams;
  const google = p.get("bicim") === "google";
  if (google && ctx.rol !== "yonetici") return yasak("Google Kişiler biçiminde dışa aktarmayı yalnızca yönetici yapabilir.");
  // Kayıtlar ekranıyla aynı süzgeç (sekme dahil). Sekmesiz çağrıda (Ayarlar > Veri saklama) yalnızca
  // "ilgilenmiyor" işaretliler hariç tutulur.
  const filtre = kayitFiltresiCoz((ad) => p.get(ad) ?? undefined); // sayfa dışa aktarmada yok sayılır
  const kayitlar = disaAktarilacakKayitlar(ctx, filtre);
  const tarih = new Date().toISOString().slice(0, 10);

  if (google) {
    // Places içeriği zaten saklanmaz; burada yalnızca kullanıcının girdiği ad, telefon, e-posta, etiket ve not çıkar.
    const { csv } = googleCsv(kayitlar);
    const cikan = kayitlar.filter((k) => googleSatiri(k)).map((k) => k.id);
    topluOlayEkle(ctx, cikan, "bilgi", "Google Kişiler CSV olarak dışa aktarıldı");
    return indirme(csv, `harita-crm-google-kisiler-${tarih}.csv`);
  }

  const satirlar = kayitlar.map((k) =>
    [
      k.placeId,
      KAYIT_KAYNAK_ADLARI[k.kaynak],
      KAYIT_DURUM_ADLARI[k.durum],
      ILETI_IZNI_ADLARI[k.iletiIzni],
      ALICI_TURU_ADLARI[k.aliciTuru],
      INCELEME_ADLARI[k.inceleme],
      k.isletmeAdi,
      k.yetkiliAdi,
      k.eposta,
      k.ekTelefon,
      k.etiketler.join(", "),
      k.notlar,
      k.olusturmaTarihi.toISOString(),
      k.guncellemeTarihi.toISOString(),
    ]
      .map(hucre)
      .join(";"),
  );
  // UTF-8 BOM + noktalı virgül: Türkçe Excel'de doğrudan açılır.
  return indirme("﻿" + [SUTUNLAR.join(";"), ...satirlar].join("\r\n"), `harita-crm-kayitlar-${tarih}.csv`);
}
