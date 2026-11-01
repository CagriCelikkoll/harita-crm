// Çizgi simgeleri (docs/tasarim/ taslaklarındaki). Her zaman süsleme: aria-hidden; anlamı yanındaki metin taşır.
const YOLLAR = {
  konum: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  tarama: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  kayitlar: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </>
  ),
  kampanyalar: <path d="M4 5h16v11H8l-4 4z" />,
  ayarlar: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  bilgi: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  uyari: (
    <>
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  kapat: <path d="M6 6l12 12M18 6L6 18" />,
  filtre: <path d="M4 6h16M7 12h10M10 18h4" />,
  tik: <path d="M5 12l5 5L20 7" />,
  kilit: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4 20l1.4-4.2A8 8 0 1 1 8.2 18.6z" />
      <path d="M9 10c.5 2 2 3.5 4 4" />
    </>
  ),
} as const;

export type SimgeAdi = keyof typeof YOLLAR;

export function Simge({ ad, boyut = 18, kalinlik = 2, className }: { ad: SimgeAdi; boyut?: number; kalinlik?: number; className?: string }) {
  return (
    <svg
      width={boyut}
      height={boyut}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={kalinlik}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
    >
      {YOLLAR[ad]}
    </svg>
  );
}
