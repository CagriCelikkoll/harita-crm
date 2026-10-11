// Sunucu başlarken bir kez çalışır: önceki süreç tarama sırasında kapandıysa, 10 dakikadan uzun süredir
// "calisiyor" durumunda kalan taramaları "hata" olarak işaretler; eksik mesajlaşma anahtarlarını uyarır.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { tumYarimKalanTaramalariKapat } = await import("./server/repo/sistem/bakim");
  const sayi = tumYarimKalanTaramalariKapat();
  if (sayi) console.info(`[başlangıç] ${sayi} yarıda kalmış tarama "hata" olarak işaretlendi.`);

  // Mesajlaşma anahtarları yoksa: ret işaretleme, abonelikten çıkma ve sağlayıcı kaydı çalışmaz.
  for (const ad of ["ILETI_SIFRELEME_ANAHTARI", "ILETI_IMZA_ANAHTARI"]) {
    if (Buffer.from(process.env[ad] ?? "", "base64").length < 32) {
      console.warn(`[başlangıç] ${ad} tanımlı değil veya 32 bayttan kısa; mesajlaşma özellikleri çalışmaz (README → Mesajlaşma).`);
    }
  }
}
