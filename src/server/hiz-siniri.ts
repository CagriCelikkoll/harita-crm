// Bellek içi kayan pencere hız sınırı. Sayaçlar süreç belleğindedir: sunucu yeniden başlayınca sıfırlanır ve birden
// çok süreç arasında paylaşılmaz (uygulama tek süreçte çalışır). Kotayı korumak için değil, kötüye kullanımı
// yavaşlatmak içindir.
import "server-only";

export type Pencere = { azami: number; sureMs: number };

export type HizSiniri = {
  /** İzin verilirse isteği sayar ve true döner; herhangi bir pencere doluysa saymaz, false döner. */
  izinVer(anahtar: string, simdi?: number): boolean;
  /** Testler için. */
  sifirla(): void;
};

export function hizSiniriOlustur(pencereler: Pencere[]): HizSiniri {
  const enUzun = Math.max(...pencereler.map((p) => p.sureMs));
  const kayitlar = new Map<string, number[]>();
  let sonTemizlik = 0;

  return {
    izinVer(anahtar, simdi = Date.now()) {
      // Ara sıra hiç istek gelmeyen anahtarlar atılır (bellek sınırsız büyümesin).
      if (simdi - sonTemizlik > enUzun) {
        sonTemizlik = simdi;
        for (const [k, z] of kayitlar) if (!z.length || z[z.length - 1] <= simdi - enUzun) kayitlar.delete(k);
      }
      const zamanlar = (kayitlar.get(anahtar) ?? []).filter((z) => z > simdi - enUzun);
      const dolu = pencereler.some((p) => zamanlar.filter((z) => z > simdi - p.sureMs).length >= p.azami);
      if (!dolu) zamanlar.push(simdi);
      if (zamanlar.length) kayitlar.set(anahtar, zamanlar);
      else kayitlar.delete(anahtar);
      return !dolu;
    },
    sifirla() {
      kayitlar.clear();
    },
  };
}
