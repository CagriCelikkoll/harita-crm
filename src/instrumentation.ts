// Sunucu başlarken bir kez çalışır: önceki süreç tarama sırasında kapandıysa, 10 dakikadan uzun süredir
// "calisiyor" durumunda kalan taramaları "hata" olarak işaretler.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { tumYarimKalanTaramalariKapat } = await import("./server/repo/sistem/bakim");
  const sayi = tumYarimKalanTaramalariKapat();
  if (sayi) console.info(`[başlangıç] ${sayi} yarıda kalmış tarama "hata" olarak işaretlendi.`);
}
