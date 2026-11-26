// Döner gösterge: yükleniyor durumunun tek görünümü (düğme içinde ya da tek başına). Hareket azaltma tercihinde dönmez.
// `etiket` verilirse ekran okuyucuya ve görünür metin olarak söylenir; düğme içinde (etiketsiz) gizlidir.
export function DonerGosterge(props: { boyut?: 14 | 16 | 20; etiket?: string; className?: string }) {
  const b = props.boyut ?? 16;
  const simge = (
    <svg
      aria-hidden="true"
      width={b}
      height={b}
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 animate-spin motion-reduce:animate-none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  if (!props.etiket) return simge;
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-ufak text-soluk ${props.className ?? ""}`}>
      {simge}
      {props.etiket}
    </span>
  );
}
