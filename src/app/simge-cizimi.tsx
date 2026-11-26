// icon.tsx ve apple-icon.tsx'in ortak çizimi (next/og; yalnızca satır içi stil).
import { RENK } from "@/lib/renk-belirtecleri";
const ANA = RENK.ana;

export function SimgeCizimi(props: { boyut: number; maske: boolean }) {
  const { boyut, maske } = props;
  // Maskelenebilir simgede işaret, kırpılmayan merkez daireye (çapın %80'i) sığar.
  const isaret = Math.round(boyut * (maske ? 0.5 : 0.62));
  return (
    <div
      style={{
        width: boyut,
        height: boyut,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ANA,
        borderRadius: maske ? 0 : Math.round(boyut * 0.22),
      }}
    >
      <svg width={isaret} height={isaret} viewBox="0 0 24 24" fill="none" stroke={RENK.beyaz} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </svg>
    </div>
  );
}
