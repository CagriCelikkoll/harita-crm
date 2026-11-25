import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { aliciSuzgeciCoz } from "@/lib/mesajlasma";
import { adrestekiSayfa, sayfaAdresi } from "@/lib/sayfalama";
import { sayfaBaglami } from "@/server/oturum";
import { kampanyaGetir, kampanyaMesajlari } from "@/server/repo/kampanyalar";
import { isciSonNabiz } from "@/server/repo/sistem/isci";
import { kampanyaDto, mesajDto } from "@/server/servisler/kampanya-dto";
import { kampanyaNumarasi } from "@/server/servisler/whatsapp-api";
import { KampanyaDetayi } from "./kampanya-detayi";

export const metadata: Metadata = { title: "Kampanya" };

const tek = (d: string | string[] | undefined) => (Array.isArray(d) ? d[0] : d);

// Alıcı listesinin sayfası ve durum süzgeci adreste: ?sayfa=&durum= (mesaj durumu ya da Meta teslim durumu;
// lib/mesajlasma ALICI_SUZGECLERI). Aralık dışı sayfa en yakın geçerli sayfaya gider.
export default async function KampanyaSayfasi({ params, searchParams }: PageProps<"/kampanyalar/[id]">) {
  const { ctx } = await sayfaBaglami();
  const { id } = await params;
  const p = await searchParams;
  const kampanya = kampanyaGetir(ctx, id);
  if (!kampanya) notFound(); // başka kiracının kampanyası da 404
  const durum = aliciSuzgeciCoz(tek(p.durum));
  const istenenSayfa = tek(p.sayfa);
  const sayfa = kampanyaMesajlari(ctx, id, { sayfa: adrestekiSayfa(istenenSayfa), durum });
  if (istenenSayfa !== undefined && istenenSayfa !== String(sayfa.sayfa) && !(sayfa.sayfa === 1 && istenenSayfa === "")) {
    redirect(sayfaAdresi(`/kampanyalar/${id}${durum ? `?durum=${durum}` : ""}`, sayfa.sayfa));
  }
  return (
    <KampanyaDetayi
      ilk={{ kampanya: kampanyaDto(kampanya, kampanyaNumarasi(ctx, kampanya)), ...sayfa, mesajlar: sayfa.mesajlar.map(mesajDto) }}
      durum={durum ?? ""}
      isci={{ sonNabiz: isciSonNabiz()?.toISOString() ?? null, simdi: new Date().toISOString(), yonetici: ctx.rol === "yonetici" }}
    />
  );
}
