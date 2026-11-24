"use client";
// Sunucuda süzülen listeler (Kayıtlar, Kampanyalar) için tercih eşitleyici: adres sorgusu her değiştiğinde
// lib/liste-tercihi kararını uygular. Adreste izlenen parametre varsa kaydeder; yoksa kayıtlı tercihi adrese yazar
// (router.replace: geri tuşu geçmişinde fazladan adım oluşmaz). Görünür bir şey çizmez.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { tarayiciDeposu, tercihAnahtari, tercihKarari, tercihOku, tercihYaz, type ListeAdi } from "@/lib/liste-tercihi";

export function ListeTercihi(props: {
  liste: ListeAdi;
  tenantId: string;
  kullaniciId: string;
  /** Sayfanın yolu (ör. "/kayitlar"). */
  yol: string;
  /** Geçerli adres sorgusu ("?" olmadan). */
  arama: string;
  alanlar: readonly string[];
}) {
  const router = useRouter();
  const { liste, tenantId, kullaniciId, yol, arama, alanlar } = props;
  const alanAnahtari = alanlar.join(",");
  useEffect(() => {
    const depo = tarayiciDeposu();
    const anahtar = tercihAnahtari(liste, tenantId, kullaniciId);
    const izlenen = alanAnahtari.split(",");
    const karar = tercihKarari(arama, izlenen, tercihOku(depo, anahtar, izlenen));
    if (karar.tur === "kaydet") tercihYaz(depo, anahtar, karar.tercih);
    else if (karar.tur === "uygula" && karar.arama !== arama) router.replace(`${yol}${karar.arama ? `?${karar.arama}` : ""}`, { scroll: false });
  }, [liste, tenantId, kullaniciId, yol, arama, alanAnahtari, router]);
  return null;
}
