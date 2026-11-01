// Numaralı adım listesi (WhatsApp kurulumu, kampanya sihirbazı): tamam (tik), etkin (çerçeveli numara + eylem),
// bekliyor (soluk numara), kilitli (kilit simgesi). Durum metin olarak da yazılır (ekran okuyucu).
import type { KurulumAdimDurumu } from "@/lib/whatsapp-api";
import { Simge } from "./simge";

export type Adim = { baslik: string; aciklama: React.ReactNode; durum: KurulumAdimDurumu; eylem?: React.ReactNode };

const DURUM_METNI: Record<KurulumAdimDurumu, string> = {
  tamam: "tamamlandı",
  etkin: "sıradaki adım",
  bekliyor: "önceki adımları bekliyor",
  kilitli: "kilitli",
};

function Isaret({ durum, no }: { durum: KurulumAdimDurumu; no: number }) {
  const ortak = "flex size-7 shrink-0 items-center justify-center rounded-full";
  if (durum === "tamam") {
    return (
      <span className={`${ortak} bg-ana text-white`}>
        <Simge ad="tik" boyut={14} kalinlik={3} />
      </span>
    );
  }
  if (durum === "kilitli") {
    return (
      <span className={`${ortak} bg-[#eef0ec] text-soluk`}>
        <Simge ad="kilit" boyut={13} kalinlik={2.5} />
      </span>
    );
  }
  return (
    <span
      className={`${ortak} border-2 text-[13px] font-bold ${durum === "etkin" ? "border-ana text-ana" : "border-kenar-alan text-soluk"}`}
    >
      {no}
    </span>
  );
}

export function AdimListesi({ adimlar }: { adimlar: Adim[] }) {
  return (
    <ol className="flex flex-col">
      {adimlar.map((a, i) => (
        <li key={a.baslik} className="flex flex-wrap items-start gap-4 border-cizgi py-3.5 [&:not(:first-child)]:border-t">
          <Isaret durum={a.durum} no={i + 1} />
          <div className="min-w-0 flex-[1_1_240px]">
            <p className={`font-semibold ${a.durum === "kilitli" || a.durum === "bekliyor" ? "text-soluk" : ""}`}>
              {a.baslik} <span className="sr-only">({DURUM_METNI[a.durum]})</span>
            </p>
            <div className="text-[13px] text-soluk">{a.aciklama}</div>
          </div>
          {a.eylem && <div className="flex flex-wrap gap-2">{a.eylem}</div>}
        </li>
      ))}
    </ol>
  );
}
