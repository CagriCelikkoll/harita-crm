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

const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Kota ayı ("2026-11", İstanbul takvimi) → "Kasım ayı · 1 Aralık'ta sıfırlanır". */
export function kotaDonemiMetni(ay: string): string {
  const no = Number(ay.slice(5, 7));
  const sonraki = AY_ADLARI[no % 12];
  return `${AY_ADLARI[no - 1]} ayı · 1 ${sonraki}'${bulunmaEki(sonraki)} sıfırlanır`;
}

/** Bulunma eki (-da/-de/-ta/-te): ünlü uyumu son ünlüye, ünsüz benzeşmesi son harfe göre. */
function bulunmaEki(sozcuk: string): string {
  const kucuk = sozcuk.toLocaleLowerCase("tr");
  const sonUnlu = [...kucuk].reverse().find((h) => "aıoueiöü".includes(h)) ?? "a";
  const unlu = "aıou".includes(sonUnlu) ? "a" : "e";
  const unsuz = "çfhkpsşt".includes(kucuk[kucuk.length - 1]) ? "t" : "d";
  return `${unsuz}${unlu}`;
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
