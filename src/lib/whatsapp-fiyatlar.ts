// WhatsApp Business Platform ileti başı liste fiyatları (Türkiye, USD) — yalnızca kampanya özetindeki TAHMİN için.
// Meta ücreti doğrudan işletmenin WhatsApp hesabından keser; Harita CRM fatura kesmez. Meta yalnızca TESLİM EDİLEN
// şablon iletisini ücretlendirir; tahmin "uygun alıcı × birim fiyat"tır (teslim edilmeyen ücretlenmez, hacim
// indirimleri dahil değildir).
//
// DOĞRULANMADI: Meta'nın 01.10.2026 fiyat kartı (CSV) bağlantısı imzalı ve geçici olduğundan doğrudan okunamadı;
// business.whatsapp.com fiyat aracı değeri tarayıcıda yükler. Rakamlar birden çok üçüncü taraf özetinde aynıdır.
// Pilot öncesi Meta'nın güncel kartından kontrol edilip güncellenmeli.

export const WHATSAPP_FIYATLARI = {
  pazar: "TR",
  paraBirimi: "USD",
  /** Meta fiyat kartının yürürlük tarihi. */
  tarih: "2026-10-01",
  kaynak: "Üçüncü taraf özetleri (Meta 01.10.2026 kartı); Meta'nın kendi kartından doğrulanmadı",
  dogrulandi: false,
  kategori: {
    MARKETING: 0.0109,
    UTILITY: 0.0009,
    AUTHENTICATION: 0.0009,
  } as Record<string, number>,
} as const;

export function birimFiyat(kategori: string): number | null {
  return WHATSAPP_FIYATLARI.kategori[kategori.toUpperCase()] ?? null;
}
