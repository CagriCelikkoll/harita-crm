// CSV dışa aktarma: YALNIZCA kullanıcının kendi verisi (place_id, durum, notlar, girdiği iletişim
// bilgileri). Places'tan gelen ad/adres/telefon dışa aktarılmaz.
import { ALICI_TURU_ADLARI } from "@/lib/mesajlasma";
import {
  ILETI_IZINLERI,
  ILETI_IZNI_ADLARI,
  INCELEME_ADLARI,
  INCELEME_DURUMLARI,
  KAYIT_DURUM_ADLARI,
  KAYIT_DURUMLARI,
  KAYIT_KAYNAK_ADLARI,
  KAYIT_KAYNAKLARI,
} from "@/lib/sabitler";
import { yetkisiz } from "@/server/api-yardimci";
import { apiBaglami } from "@/server/oturum";
import { disaAktarilacakKayitlar } from "@/server/repo/kayitlar";

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

export async function GET(istek: Request) {
  const ctx = await apiBaglami();
  if (!ctx) return yetkisiz();
  const p = new URL(istek.url).searchParams;
  const durum = KAYIT_DURUMLARI.find((d) => d === p.get("durum"));
  const iletiIzni = ILETI_IZINLERI.find((d) => d === p.get("izin"));
  const kayitlar = disaAktarilacakKayitlar(ctx, {
    durum,
    iletiIzni,
    etiket: p.get("etiket") || undefined,
    arama: p.get("q") || undefined,
    // Listeyle aynı: varsayılan olarak "ilgilenmiyor" işaretliler hariç.
    inceleme: p.get("inceleme") === "hepsi" ? "hepsi" : INCELEME_DURUMLARI.find((d) => d === p.get("inceleme")),
    adsizGoogle: p.get("ad") === "bos" || undefined,
    kaynak: KAYIT_KAYNAKLARI.find((d) => d === p.get("kaynak")),
  });

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
  const govde = "﻿" + [SUTUNLAR.join(";"), ...satirlar].join("\r\n");
  const tarih = new Date().toISOString().slice(0, 10);
  return new Response(govde, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="harita-crm-kayitlar-${tarih}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
