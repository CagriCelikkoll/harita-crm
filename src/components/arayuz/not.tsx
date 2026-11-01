// Bilgi / uyarı notu (simgeli kutu) ve katlanır bölüm ("Teknik ayrıntıları göster").
import { Simge } from "./simge";

const NOT_TONLARI = {
  bilgi: { sinif: "bg-ana-acik text-ana-koyu", simge: "bilgi" },
  uyari: { sinif: "bg-uyari-acik text-uyari", simge: "uyari" },
  tehlike: { sinif: "bg-tehlike-acik text-tehlike", simge: "uyari" },
} as const;

export function BilgiNotu(props: { ton?: keyof typeof NOT_TONLARI; children: React.ReactNode; className?: string; uyariRolu?: boolean }) {
  const t = NOT_TONLARI[props.ton ?? "bilgi"];
  return (
    <div
      role={props.uyariRolu ? "alert" : undefined}
      className={`flex items-start gap-3 rounded-[10px] px-4 py-3.5 text-[13px] ${t.sinif} ${props.className ?? ""}`}
    >
      <Simge ad={t.simge} className="mt-px" />
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}

/** Kart içinde katlanır bölüm: başlık satırı 56 px; kapalı başlar. */
export function Katlanir(props: { baslik: string; ozet?: string; children: React.ReactNode; acik?: boolean }) {
  return (
    <details open={props.acik} className="group overflow-hidden rounded-kart border border-kenar bg-white">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-7 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">
          <span className="group-open:hidden">{props.baslik} göster</span>
          <span className="hidden group-open:inline">{props.baslik} gizle</span>
        </span>
        {props.ozet && <span className="text-[13px] text-soluk">{props.ozet}</span>}
      </summary>
      <div className="border-t border-cizgi px-7 pt-2 pb-5">{props.children}</div>
    </details>
  );
}
