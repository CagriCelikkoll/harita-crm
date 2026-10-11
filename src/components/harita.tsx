"use client";
// Google Maps JavaScript API haritası. Places içeriği yalnızca Google haritası üzerinde gösterilebilir;
// bu yüzden başka bir harita kütüphanesi kullanılmaz.
// NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: tarayıcı anahtarı (HTTP referrer kısıtlı, yalnızca Maps JavaScript API).
// Sunucudaki Places anahtarı (GOOGLE_PLACES_API_KEY) tarayıcıya hiç gönderilmez.
/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import type { KayitDurumu } from "@/lib/sabitler";

const ANAHTAR = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const HARITA_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

let yukleniyor: Promise<void> | null = null;

function mapsYukle(): Promise<void> {
  if (typeof window === "undefined" || !ANAHTAR) return Promise.reject(new Error("anahtar yok"));
  if (window.google?.maps?.Map) return Promise.resolve();
  yukleniyor ??= new Promise((coz, reddet) => {
    const geriCagirim = "__haritaCrmMapsHazir";
    (window as unknown as Record<string, () => void>)[geriCagirim] = () => coz();
    const betik = document.createElement("script");
    const p = new URLSearchParams({
      key: ANAHTAR,
      v: "weekly",
      loading: "async",
      libraries: "marker",
      language: "tr",
      region: "TR",
      callback: geriCagirim,
    });
    betik.src = `https://maps.googleapis.com/maps/api/js?${p}`;
    betik.async = true;
    betik.onerror = () => reddet(new Error("Google Maps yüklenemedi"));
    document.head.append(betik);
  });
  return yukleniyor;
}

export const haritaAnahtariVar = Boolean(ANAHTAR);

export type Isaret = { kayitId: string; durum: KayitDurumu; lat: number; lng: number };

const DURUM_RENGI: Record<KayitDurumu, string> = {
  yeni: "#0e6655",
  iletisimde: "#2563eb",
  gorusme: "#d97706",
  kazanildi: "#15803d",
  ilgilenmiyor: "#6b7280",
};

export function Harita(props: {
  merkez: google.maps.LatLngLiteral;
  yaricapM: number;
  isaretler: Isaret[];
  onMerkezSec: (m: google.maps.LatLngLiteral) => void;
  onIsaretSec?: (kayitId: string) => void;
}) {
  const kutu = useRef<HTMLDivElement>(null);
  const harita = useRef<google.maps.Map | null>(null);
  const daire = useRef<google.maps.Circle | null>(null);
  const isaretNesneleri = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const geriCagirimlar = useRef(props);
  const [hata, setHata] = useState<string | null>(null);
  const [hazir, setHazir] = useState(false);

  useEffect(() => {
    geriCagirimlar.current = props;
  });

  useEffect(() => {
    let iptal = false;
    mapsYukle()
      .then(() => {
        if (iptal || !kutu.current || harita.current) return;
        const m = new google.maps.Map(kutu.current, {
          center: props.merkez,
          zoom: 12,
          mapId: HARITA_ID,
          streetViewControl: false,
          mapTypeControl: false,
          clickableIcons: false,
        });
        m.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) geriCagirimlar.current.onMerkezSec(e.latLng.toJSON());
        });
        daire.current = new google.maps.Circle({
          map: m,
          center: props.merkez,
          radius: props.yaricapM,
          strokeColor: "#0e6655",
          strokeWeight: 2,
          fillColor: "#0e6655",
          fillOpacity: 0.08,
          clickable: false,
        });
        harita.current = m;
        setHazir(true);
      })
      .catch((e: Error) => setHata(e.message));
    return () => {
      iptal = true;
    };
    // Harita yalnızca bir kez oluşturulur; güncellemeler aşağıdaki efektlerde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hazir || !daire.current || !harita.current) return;
    daire.current.setCenter(props.merkez);
    daire.current.setRadius(props.yaricapM);
    const sinir = daire.current.getBounds();
    if (sinir) harita.current.fitBounds(sinir, 24);
  }, [hazir, props.merkez, props.yaricapM]);

  useEffect(() => {
    if (!hazir || !harita.current) return;
    for (const i of isaretNesneleri.current) i.map = null;
    isaretNesneleri.current = props.isaretler.map((i) => {
      const nokta = document.createElement("div");
      nokta.style.cssText = `width:12px;height:12px;border-radius:50%;border:2px solid #fff;background:${DURUM_RENGI[i.durum]};box-shadow:0 0 2px rgba(0,0,0,.5);cursor:pointer`;
      const isaret = new google.maps.marker.AdvancedMarkerElement({
        map: harita.current,
        position: { lat: i.lat, lng: i.lng },
        content: nokta,
        title: "Kaydı aç",
        gmpClickable: true,
      });
      isaret.addListener("gmp-click", () => geriCagirimlar.current.onIsaretSec?.(i.kayitId));
      return isaret;
    });
  }, [hazir, props.isaretler]);

  if (!ANAHTAR || hata) {
    return (
      <div className="flex h-full min-h-72 items-center justify-center rounded-lg border border-dashed border-kenar bg-white p-6 text-center text-sm text-soluk">
        {ANAHTAR
          ? `Harita yüklenemedi: ${hata}`
          : "Harita için NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY tanımlı değil. Merkezi aşağıdaki enlem/boylam alanlarından girebilirsiniz."}
      </div>
    );
  }
  return <div ref={kutu} className="h-full min-h-72 w-full rounded-lg border border-kenar" role="application" aria-label="Harita: merkezi seçmek için tıklayın" />;
}
