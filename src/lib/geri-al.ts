// Gönderimi geri al (gelen kutusu): metin ve medya gönderimi tarayıcıda GERI_AL_MS bekletilir. Bu sürede geriAl() ile
// gönderim hiç yapılmaz (sunucuya, dolayısıyla Meta'ya istek gitmez) ve veri çağırana döner (yazı alanına geri konur).
// Bekleme yalnızca tarayıcıdadır: sayfa kapanır ya da sekme ölürse zamanlayıcı da ölür ve hiçbir şey gönderilmez.
// Aynı anda tek bekleyen olur: yenisi başlatılırsa önceki hemen gönderilir (sıra korunur).

export type Bekleyen<T> = { veri: T; bitis: number };

export type GecikmeliGonderici<T> = {
  /** Gönderimi bekletmeye alır (önceki bekleyen varsa önce o gönderilir). */
  baslat: (veri: T) => void;
  /** Bekleyeni iptal eder ve verisini döner; bekleyen yoksa null. Gönderim yapılmaz. */
  geriAl: () => T | null;
  /** Bekleyeni beklemeden gönderir ("Şimdi gönder", sohbetten çıkış). */
  hemen: () => void;
  bekleyen: () => Bekleyen<T> | null;
};

export function gecikmeliGonderici<T>(o: {
  sureMs: number;
  gonder: (veri: T) => void;
  /** Bekleyen değişince (başladı, gönderildi, geri alındı): arayüz geri sayımı için. */
  degisti?: (b: Bekleyen<T> | null) => void;
  simdi?: () => number;
  zamanla?: (fn: () => void, ms: number) => unknown;
  iptal?: (k: unknown) => void;
}): GecikmeliGonderici<T> {
  const simdi = o.simdi ?? (() => Date.now());
  const zamanla = o.zamanla ?? ((fn, ms) => setTimeout(fn, ms));
  const iptal = o.iptal ?? ((k) => clearTimeout(k as ReturnType<typeof setTimeout>));
  let b: Bekleyen<T> | null = null;
  let kol: unknown = null;

  const al = (): T | null => {
    if (!b) return null;
    iptal(kol);
    const veri = b.veri;
    b = null;
    kol = null;
    o.degisti?.(null);
    return veri;
  };
  const hemen = () => {
    if (!b) return;
    const veri = al() as T;
    o.gonder(veri);
  };
  return {
    baslat(veri) {
      hemen();
      if (o.sureMs <= 0) return o.gonder(veri);
      b = { veri, bitis: simdi() + o.sureMs };
      kol = zamanla(hemen, o.sureMs);
      o.degisti?.(b);
    },
    geriAl: al,
    hemen,
    bekleyen: () => b,
  };
}
