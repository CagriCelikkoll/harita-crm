import type { Metadata } from "next";
import Link from "next/link";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { sayfaBaglami } from "@/server/oturum";
import { IceAktarmaSihirbazi } from "./sihirbaz";

export const metadata: Metadata = { title: "Kişileri içe aktar" };

export default async function IceAktarSayfasi() {
  await sayfaBaglami();
  return (
    <>
      <SayfaBasligi
        baslik="Kişileri içe aktar"
        aciklama="CSV ya da XLSX; tek seferde en fazla 5.000 satır. Ad ve telefon çalışma alanınızın verisi olarak saklanır."
      >
        <Link href="/kayitlar" className="dugme">
          Kayıtlara dön
        </Link>
      </SayfaBasligi>
      <IceAktarmaSihirbazi />
    </>
  );
}
