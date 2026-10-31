import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { kategoriBul } from "@/lib/kategoriler";
import { sayfaBaglami } from "@/server/oturum";
import { kayitlariListele } from "@/server/repo/kayitlar";
import { taramaGetir } from "@/server/repo/taramalar";
import { IncelemeEkrani } from "./inceleme-ekrani";

export const metadata: Metadata = { title: "Sonuçları incele" };

// Tarama sonuçlarını inceleme: incelenmemiş Google kayıtları 20'şer gelir. Sayfa Places'a kendiliğinden gitmez;
// ad ve adres kullanıcı "Göster" deyince (maliyeti yazılarak) gelir ve yalnızca bellekte tutulur. İncelenen
// kayıtlar listeden düştüğü için her zaman ilk sayfa gösterilir.
export default async function IncelemeSayfasi({ searchParams }: PageProps<"/tarama/inceleme">) {
  const { ctx } = await sayfaBaglami();
  const p = await searchParams;
  const taramaId = typeof p.tarama === "string" ? p.tarama : undefined;
  const tarama = taramaId ? taramaGetir(ctx, taramaId) : null;
  if (taramaId && !tarama) notFound();
  const liste = kayitlariListele(ctx, { inceleme: "incelenmedi", kaynak: "google", scanId: tarama?.id });
  const satirlar = liste.kayitlar.map((k) => ({ id: k.id, isletmeAdi: k.isletmeAdi }));
  const baslik = tarama ? `${kategoriBul(tarama.kategori)?.etiket ?? tarama.kategori} · ${tarama.yaricapM / 1000} km` : "Tüm taramalar";

  return (
    <>
      <SayfaBasligi
        baslik="Sonuçları incele"
        aciklama={`${baslik}. İlgilendiğiniz işletmeleri işaretleyin; ilgilenmediklerinizi listeden gizleyin (silinmez, sonraki taramada yeniden gelmez).`}
      >
        <Link href="/tarama" className="dugme">
          Taramaya dön
        </Link>
      </SayfaBasligi>
      <IncelemeEkrani key={satirlar.map((s) => s.id).join(",")} satirlar={satirlar} kalan={liste.toplam} />
    </>
  );
}
