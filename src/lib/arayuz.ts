// Arayüz parçalarının saf yardımcıları (test edilebilir; tarayıcı ya da sunucu bağımlılığı yok).

export type KullanimSeviyesi = "normal" | "uyari" | "doldu";
export type KullanimOzeti = { yuzde: number; seviye: KullanimSeviyesi };

/**
 * Menüdeki "Bu ayki kullanım" göstergesi: yalnızca yüzde ve seviye (birim ya da sayı gösterilmez).
 * Yüzde aşağı yuvarlanır; böylece kota dolmadan "%100" görünmez.
 */
export function kullanimOzeti(d: { oran: number; uyari: boolean; doldu: boolean }): KullanimOzeti {
  return {
    yuzde: d.doldu ? 100 : Math.min(99, Math.max(0, Math.floor(d.oran * 100))),
    seviye: d.doldu ? "doldu" : d.uyari ? "uyari" : "normal",
  };
}

/** Sekmelerde klavye: ok tuşları komşu sekmeye (başa / sona sarar), Home / End ilk ve son sekmeye; diğer tuşlar null. */
export function sekmeKlavye(simdiki: number, tus: string, adet: number): number | null {
  if (adet <= 0) return null;
  switch (tus) {
    case "ArrowRight":
    case "ArrowDown":
      return (simdiki + 1) % adet;
    case "ArrowLeft":
    case "ArrowUp":
      return (simdiki - 1 + adet) % adet;
    case "Home":
      return 0;
    case "End":
      return adet - 1;
    default:
      return null;
  }
}

/** Kullanıcı kartı için baş harfler: "Demo Yönetici" → "DY"; tek sözcükte ilk iki harf. */
export function basHarfler(ad: string): string {
  const parcalar = ad.trim().split(/\s+/).filter(Boolean);
  if (parcalar.length === 0) return "?";
  const harfler = parcalar.length === 1 ? parcalar[0].slice(0, 2) : `${parcalar[0][0]}${parcalar[parcalar.length - 1][0]}`;
  return harfler.toLocaleUpperCase("tr");
}
