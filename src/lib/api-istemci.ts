// Tarayıcıdan uygulamanın kendi API'sine JSON istekleri.
export type ApiSonucu<T> = { ok: true; veri: T } | { ok: false; durum: number; hata: string };

export async function apiIstek<T = unknown>(
  url: string,
  secenek: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; govde?: unknown; sinyal?: AbortSignal } = {},
): Promise<ApiSonucu<T>> {
  let yanit: Response;
  try {
    yanit = await fetch(url, {
      method: secenek.method ?? "GET",
      headers: secenek.govde !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: secenek.govde !== undefined ? JSON.stringify(secenek.govde) : undefined,
      cache: "no-store",
      signal: secenek.sinyal,
    });
  } catch (hata) {
    if ((hata as Error).name === "AbortError") throw hata;
    return { ok: false, durum: 0, hata: "Sunucuya ulaşılamadı." };
  }
  if (yanit.status === 204) return { ok: true, veri: undefined as T };
  const veri = await yanit.json().catch(() => ({}));
  if (!yanit.ok) {
    const hata = yanit.status === 404 ? "Kayıt bulunamadı." : (veri as { hata?: string }).hata ?? "İşlem başarısız.";
    return { ok: false, durum: yanit.status, hata };
  }
  return { ok: true, veri: veri as T };
}
