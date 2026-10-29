// Kampanya ve kuyruk satırlarının istemciye giden biçimi (alıcı adresi içermez).
import type { KampanyaDurumu, KuyrukKanali, MesajDurumu } from "@/lib/mesajlasma";
import type { KampanyaFiltresi, kampanyaGetir, kampanyaMesajlari } from "../repo/kampanyalar";

export type KampanyaDto = {
  id: string;
  ad: string;
  kanal: KuyrukKanali;
  konu: string | null;
  sablon: string;
  bosIsimHitabi: string | null;
  filtre: KampanyaFiltresi;
  sandbox: boolean;
  durum: KampanyaDurumu;
  planlananTarih: string | null;
  olusturmaTarihi: string;
  baslamaTarihi: string | null;
  tamamlanmaTarihi: string | null;
  sayilar: Record<MesajDurumu, number>;
  nedenler: { durum: MesajDurumu; neden: string | null; n: number }[];
  /** WhatsApp: sistemin duraklatma nedeni (DURAKLATMA_NEDEN_ADLARI). */
  duraklatmaNedeni: string | null;
  /** WhatsApp: Meta teslim bildirimleri (sent / delivered / read / failed + hata kodu). */
  teslim: { durum: string | null; kod: number | null; n: number }[];
  /** WhatsApp: Meta’nın ücretlendirdiği iletiler (kategori bazında). */
  ucretli: { kategori: string | null; n: number }[];
};

type KampanyaSatiri = Omit<NonNullable<ReturnType<typeof kampanyaGetir>>, "nedenler" | "teslim" | "ucretli"> & {
  nedenler?: KampanyaDto["nedenler"];
  teslim?: KampanyaDto["teslim"];
  ucretli?: KampanyaDto["ucretli"];
};

export const kampanyaDto = (k: KampanyaSatiri): KampanyaDto => ({
  id: k.id,
  ad: k.ad,
  kanal: k.kanal,
  konu: k.konu,
  sablon: k.sablon,
  bosIsimHitabi: k.bosIsimHitabi,
  filtre: k.filtre,
  sandbox: k.sandbox,
  durum: k.durum,
  planlananTarih: k.planlananTarih?.toISOString() ?? null,
  olusturmaTarihi: k.olusturmaTarihi.toISOString(),
  baslamaTarihi: k.baslamaTarihi?.toISOString() ?? null,
  tamamlanmaTarihi: k.tamamlanmaTarihi?.toISOString() ?? null,
  sayilar: k.sayilar,
  nedenler: k.nedenler ?? [],
  duraklatmaNedeni: k.duraklatmaNedeni,
  teslim: k.teslim ?? [],
  ucretli: k.ucretli ?? [],
});

type MesajSatiri = ReturnType<typeof kampanyaMesajlari>["mesajlar"][number];
export type MesajDto = Omit<MesajSatiri, "sonrakiDeneme" | "gonderimTarihi"> & {
  sonrakiDeneme: string | null;
  gonderimTarihi: string | null;
};

export const mesajDto = (m: MesajSatiri): MesajDto => ({
  ...m,
  sonrakiDeneme: m.sonrakiDeneme?.toISOString() ?? null,
  gonderimTarihi: m.gonderimTarihi?.toISOString() ?? null,
});
