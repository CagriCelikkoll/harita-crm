import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sayfaBaglami } from "@/server/oturum";
import { kampanyaGetir, kampanyaMesajlari } from "@/server/repo/kampanyalar";
import { isciSonNabiz } from "@/server/repo/sistem/isci";
import { kampanyaDto, mesajDto } from "@/server/servisler/kampanya-dto";
import { KampanyaDetayi } from "./kampanya-detayi";

export const metadata: Metadata = { title: "Kampanya" };

export default async function KampanyaSayfasi({ params }: PageProps<"/kampanyalar/[id]">) {
  const { ctx } = await sayfaBaglami();
  const { id } = await params;
  const kampanya = kampanyaGetir(ctx, id);
  if (!kampanya) notFound(); // başka kiracının kampanyası da 404
  const sayfa = kampanyaMesajlari(ctx, id);
  return (
    <KampanyaDetayi
      ilk={{ kampanya: kampanyaDto(kampanya), ...sayfa, mesajlar: sayfa.mesajlar.map(mesajDto) }}
      isci={{ sonNabiz: isciSonNabiz()?.toISOString() ?? null, simdi: new Date().toISOString(), yonetici: ctx.rol === "yonetici" }}
    />
  );
}
