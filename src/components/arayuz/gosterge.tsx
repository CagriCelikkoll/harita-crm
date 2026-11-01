// İstatistik kutusu (küçük başlık + büyük değer) ve ilerleme çubuğu.
export function IstatistikKutusu(props: { baslik: string; deger: React.ReactNode; aciklama?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="rounded-[10px] bg-ic-kutu px-4 py-3.5">
      <p className="text-[13px] text-soluk">{props.baslik}</p>
      <p className="text-xl font-bold tabular-nums">{props.deger}</p>
      {props.aciklama && <p className="mt-1 text-[13px] text-soluk">{props.aciklama}</p>}
      {props.children}
    </div>
  );
}

/** Yüzde çubuğu (0–100). `kalin`: 12 px (Kullanım sayfası), varsayılan 6 px. */
export function IlerlemeCubugu(props: { yuzde: number; etiket: string; kalin?: boolean; renk?: string; zemin?: string }) {
  const yuzde = Math.max(0, Math.min(100, Math.round(props.yuzde)));
  const yukseklik = props.kalin ? "h-3" : "h-1.5";
  return (
    <div
      role="progressbar"
      aria-label={props.etiket}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={yuzde}
      className={`${yukseklik} overflow-hidden rounded-full ${props.zemin ?? "bg-[#eef0ec]"}`}
    >
      <div className={`${yukseklik} rounded-full ${props.renk ?? "bg-ana"}`} style={{ width: `${yuzde}%` }} />
    </div>
  );
}
