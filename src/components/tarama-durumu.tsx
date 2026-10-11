import { TARAMA_DURUM_ADLARI, type TaramaDurumu } from "@/lib/sabitler";

const RENK: Record<TaramaDurumu, string> = {
  kuyrukta: "bg-zemin text-soluk",
  calisiyor: "bg-amber-100 text-amber-800",
  tamamlandi: "bg-ana-acik text-ana-koyu",
  hata: "bg-red-100 text-tehlike",
};

export function TaramaDurumuRozeti({ durum }: { durum: TaramaDurumu }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RENK[durum]}`}>{TARAMA_DURUM_ADLARI[durum]}</span>;
}
