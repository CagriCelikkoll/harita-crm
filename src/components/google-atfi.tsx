/**
 * Google Maps atfı. Places içeriğinin Google haritası DIŞINDA gösterildiği her ekranda görünür
 * olmalıdır (Places API politikaları).
 */
export function GoogleAtfi({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-soluk ${className}`}>
      İşletme bilgileri:{" "}
      <span translate="no" className="font-medium text-[#5e5e5e]" style={{ fontFamily: "Roboto, Arial, sans-serif" }}>
        Google Maps
      </span>
    </p>
  );
}
