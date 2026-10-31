"use client";
// İstenince gösterilen Google bilgisi (ad + adres, Place Details Pro, kayıt başına PLACES_BIRIMLERI.placeDetailsPro
// birim). Places içeriği SAKLANMAZ: yalnızca bu bileşen ağacının React durumunda (o sayfa görünümünün belleğinde)
// tutulur; tarayıcı depolamasına (localStorage / sessionStorage / IndexedDB) ve sunucuya yazılmaz. Sayfa, süzgeç ya
// da sayfa numarası değişince bileşen yeniden oluşur ve bilgi kaybolur.
import { useCallback, useState } from "react";
import { apiIstek } from "@/lib/api-istemci";
import { sayiYaz } from "@/lib/bicim";
import { PLACES_BIRIMLERI } from "@/lib/places-birimleri";
import type { ListeBilgisi } from "@/server/servisler/canli-bilgi";

/** Kayıt başına liste bilgisinin kota birimi. */
export const LISTE_BIRIMI = PLACES_BIRIMLERI.placeDetailsPro;

export const maliyetMetni = (adet: number) =>
  adet === 1 ? `${LISTE_BIRIMI} birim` : `${sayiYaz(adet)} × ${LISTE_BIRIMI} = ${sayiYaz(adet * LISTE_BIRIMI)} birim`;

export function useGoogleBilgisi() {
  const [bilgi, setBilgi] = useState<ReadonlyMap<string, ListeBilgisi>>(new Map());
  const [yukleniyor, setYukleniyor] = useState<ReadonlySet<string>>(new Set());
  const [hata, setHata] = useState<string | null>(null);

  const goster = useCallback(async (idler: string[]) => {
    if (!idler.length) return;
    setHata(null);
    setYukleniyor((y) => new Set([...y, ...idler]));
    for (let i = 0; i < idler.length; i += 20) {
      const parca = idler.slice(i, i + 20);
      const s = await apiIstek<{ sonuclar: Record<string, ListeBilgisi> }>("/api/kayitlar/canli", {
        method: "POST",
        govde: { idler: parca },
      });
      if (s.ok) setBilgi((b) => new Map([...b, ...Object.entries(s.veri.sonuclar)]));
      else setHata(s.hata);
    }
    setYukleniyor((y) => new Set([...y].filter((id) => !idler.includes(id))));
  }, []);

  return { bilgi, yukleniyor, hata, goster };
}

/** Tek kayıt için "Göster (3 birim)" düğmesi ya da gösterilen ad/adres. */
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
      title="Google'dan ad ve adres çekilir; saklanmaz"
    >
      {props.yukleniyor ? "Yükleniyor…" : `Göster (${maliyetMetni(1)})`}
    </button>
  );
}
