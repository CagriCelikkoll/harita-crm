"use client";
// Google bilgisi (ad + adres + konum, Place Details Pro). Places içeriği SAKLANMAZ: bu bileşen ağacının React
// durumunda ve en fazla 30 dakikalık bellek önbelleğinde (lib/google-onbellegi.ts) tutulur; tarayıcı depolamasına
// (localStorage / sessionStorage / IndexedDB) ve sunucuya yazılmaz. Önbellekte olan kayıt için Google'a yeniden
// gidilmez. Arayüzde maliyet ya da birim gösterilmez (kullanım yalnızca menüdeki yüzde göstergesinde).
import { useCallback, useEffect, useRef, useState } from "react";
import { kullanimDegisti } from "@/components/kullanim-gostergesi";
import { apiIstek } from "@/lib/api-istemci";
import { listeOnbellegi } from "@/lib/google-onbellegi";
import type { ListeBilgisi } from "@/server/servisler/canli-bilgi";

/** Önbellekte olan kayıtların bilgisi (sayfa açılışında kullanım harcamadan gösterilir). */
function onbellektekiler(idler: string[]): Map<string, ListeBilgisi> {
  const m = new Map<string, ListeBilgisi>();
  for (const id of idler) {
    const b = listeOnbellegi.al(id);
    if (b) m.set(id, b);
  }
  return m;
}

/**
 * `gorunenIdler`: ekranın açılışta gösterdiği kayıtlar; önbellekte olanların bilgisi hemen gelir (istek yok).
 * `otomatikIdler`: açılışta kendiliğinden istenecek kayıtlar (adı girilmemiş Google kayıtları). İstek
 * `otomatik: true` ile gider; sunucu kullanım %80'e ulaşacaksa çağırmaz (otomatikKapali) ve satırlar "Göster"e döner.
 * Bileşen başına bir kez gönderilir (geliştirmede efektlerin iki kez çalışması çift istek / çift kullanım yapmaz).
 * goster(): önbellektekileri istek yapmadan, kalanları Google'dan getirir.
 */
export function useGoogleBilgisi(gorunenIdler: string[] = [], secenek: { otomatikIdler?: string[] } = {}) {
  const [bilgi, setBilgi] = useState<ReadonlyMap<string, ListeBilgisi>>(() => onbellektekiler(gorunenIdler));
  const [yukleniyor, setYukleniyor] = useState<ReadonlySet<string>>(() =>
    new Set((secenek.otomatikIdler ?? []).filter((id) => !listeOnbellegi.al(id))),
  );
  const [hata, setHata] = useState<string | null>(null);
  const [otomatikKapali, setOtomatikKapali] = useState(false);
  const otomatikIstendi = useRef(false);

  // İlk çizimdeki otomatik liste; sonraki çizimlerde değişmesi yeni istek başlatmaz (bileşen sayfa başına oluşur).
  const [ilkOtomatik] = useState(() => (secenek.otomatikIdler ?? []).filter((id) => !listeOnbellegi.al(id)));
  useEffect(() => {
    if (otomatikIstendi.current || !ilkOtomatik.length) return;
    otomatikIstendi.current = true;
    void (async () => {
      const s = await apiIstek<{ sonuclar: Record<string, ListeBilgisi>; otomatikKapali?: boolean }>("/api/kayitlar/canli", {
        method: "POST",
        govde: { idler: ilkOtomatik.slice(0, 20), otomatik: true },
      });
      if (s.ok) {
        for (const [id, b] of Object.entries(s.veri.sonuclar)) if (!("hata" in b)) listeOnbellegi.koy(id, b);
        setBilgi((b) => new Map([...b, ...Object.entries(s.veri.sonuclar)]));
        if (s.veri.otomatikKapali) setOtomatikKapali(true);
      } else setHata(s.hata);
      setYukleniyor((y) => new Set([...y].filter((id) => !ilkOtomatik.includes(id))));
      kullanimDegisti();
    })();
  }, [ilkOtomatik]);

  const goster = useCallback(async (idler: string[]) => {
    if (!idler.length) return;
    setHata(null);
    const onbellekte = onbellektekiler(idler);
    if (onbellekte.size) setBilgi((b) => new Map([...b, ...onbellekte]));
    const istenecek = idler.filter((id) => !onbellekte.has(id));
    if (!istenecek.length) return;
    setYukleniyor((y) => new Set([...y, ...istenecek]));
    for (let i = 0; i < istenecek.length; i += 20) {
      const parca = istenecek.slice(i, i + 20);
      const s = await apiIstek<{ sonuclar: Record<string, ListeBilgisi> }>("/api/kayitlar/canli", {
        method: "POST",
        govde: { idler: parca },
      });
      if (s.ok) {
        for (const [id, b] of Object.entries(s.veri.sonuclar)) if (!("hata" in b)) listeOnbellegi.koy(id, b);
        setBilgi((b) => new Map([...b, ...Object.entries(s.veri.sonuclar)]));
      } else setHata(s.hata);
    }
    setYukleniyor((y) => new Set([...y].filter((id) => !istenecek.includes(id))));
    kullanimDegisti();
  }, []);

  return { bilgi, yukleniyor, hata, goster, otomatikKapali };
}

/** Tek kayıt için "Göster" düğmesi ya da gösterilen ad/adres. */
export function GoogleBilgisiHucresi(props: {
  id: string;
  bilgi: ListeBilgisi | undefined;
  yukleniyor: boolean;
  onGoster: (idler: string[]) => void;
  /** "adres": yalnızca adres satırı; "ad": "Google: <ad>" satırı. */
  alan: "adres" | "ad";
}) {
  if (props.bilgi) {
    if ("hata" in props.bilgi) return <span className="text-xs text-soluk italic">{props.bilgi.hata}</span>;
    return props.alan === "ad" ? (
      <span className="text-xs text-soluk">Google: {props.bilgi.ad}</span>
    ) : (
      <span>{props.bilgi.adres ?? "—"}</span>
    );
  }
  return (
    <button
      type="button"
      className="text-xs font-medium text-ana underline-offset-2 hover:underline disabled:opacity-50"
      disabled={props.yukleniyor}
      onClick={() => props.onGoster([props.id])}
      title="Google Haritalar'dan anlık gösterilir; saklanmaz"
    >
      {props.yukleniyor ? "Yükleniyor…" : "Göster"}
    </button>
  );
}
