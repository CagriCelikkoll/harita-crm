// Durum rozeti (tam yuvarlak, 12 px / 600) ve küçük "Google" etiketi. Renk tek başına anlam taşımaz: metin her zaman
// yazılıdır. Tonlar docs/tasarim/ taslaklarındaki eşlemeden.
import type { IletiIzni, KayitDurumu } from "@/lib/sabitler";
export type RozetTonu = "ana" | "notr" | "uyari" | "tehlike" | "mavi" | "mor";

const TONLAR: Record<RozetTonu, string> = {
  ana: "bg-ana-acik text-ana-koyu",
  notr: "bg-[#eef0ec] text-metin-ikincil",
  uyari: "bg-uyari-acik text-uyari",
  tehlike: "bg-tehlike-acik text-tehlike",
  mavi: "bg-[#e4ecf8] text-[#1d4f91]",
  mor: "bg-[#eee8f8] text-[#5b3a99]",
};

/** Kayıt durumlarının ve ileti izninin rozet renkleri (taslaktaki eşleme). */
export const DURUM_TONU: Record<KayitDurumu, RozetTonu> = {
  yeni: "mavi",
  iletisimde: "uyari",
  gorusme: "mor",
  kazanildi: "ana",
  ilgilenmiyor: "notr",
};
export const IZIN_TONU: Record<IletiIzni, RozetTonu> = { onayli: "ana", bekliyor: "uyari", ret: "tehlike" };

/** Huni ve çubuklarda aynı tonların dolgu rengi. */
export const TON_DOLGUSU: Record<RozetTonu, string> = {
  ana: "bg-ana",
  notr: "bg-pasif",
  uyari: "bg-[#b45309]",
  tehlike: "bg-tehlike",
  mavi: "bg-[#1d4f91]",
  mor: "bg-[#5b3a99]",
};

export function DurumRozeti({ ton = "ana", children, title }: { ton?: RozetTonu; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONLAR[ton]}`}>
      {children}
    </span>
  );
}

/** Google Haritalar'dan anlık gösterilen (saklanmayan) bilginin yanındaki küçük etiket. */
export function GoogleEtiketi() {
  return (
    <span className="inline-block rounded bg-[#eef0ec] px-[7px] py-px align-middle text-[11px] font-semibold text-soluk">
      Google
    </span>
  );
}
