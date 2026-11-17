// Gelen medyanın indirme adresi Meta'nın GET /{media-id} yanıtından gelir. Erişim anahtarı bu adrese gönderildiği için
// yalnızca Meta'nın medya alanlarına (https, varsayılan port, kullanıcı bilgisi yok) izin verilir; yönlendirme izlenmez.

const IZINLI_ALANLAR = ["fbsbx.com", "fbcdn.net", "whatsapp.net"];

export function metaMedyaAdresiGecerli(adres: string): boolean {
  let u: URL;
  try {
    u = new URL(adres);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return IZINLI_ALANLAR.some((a) => host === a || host.endsWith(`.${a}`));
}
