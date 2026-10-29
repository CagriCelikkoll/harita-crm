import type { Metadata } from "next";
import Link from "next/link";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayfaBaglami } from "@/server/oturum";
import { YeniKisiFormu } from "./yeni-kisi-formu";

export const metadata: Metadata = { title: "Kişi ekle" };

export default async function YeniKisiSayfasi() {
  await sayfaBaglami();
  return (
    <>
      <SayfaBasligi baslik="Kişi ekle" aciklama="Google taraması dışında, elle eklenen kişi.">
        <Link href="/kayitlar" className="dugme">
          Kayıtlara dön
        </Link>
      </SayfaBasligi>
      <YeniKisiFormu />
    </>
  );
}
