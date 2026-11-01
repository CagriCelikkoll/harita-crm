import { redirect } from "next/navigation";

// Eski "Sonuçları incele" adresi: sonuçlar artık Bölge tara sayfasında, taramalar arası incelenmemişler Kayıtlar >
// İncelenmemiş sekmesinde.
export default async function IncelemeSayfasi({ searchParams }: PageProps<"/tarama/inceleme">) {
  const p = await searchParams;
  const tarama = typeof p.tarama === "string" ? p.tarama : undefined;
  redirect(tarama ? `/tarama?tarama=${encodeURIComponent(tarama)}` : "/kayitlar?grup=incelenmemis");
}
