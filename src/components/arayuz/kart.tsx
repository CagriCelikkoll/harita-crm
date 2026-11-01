// Kart ve ayar satırı düzeni (docs/tasarim/Main.dc.html): 14 px köşeli beyaz kart; içinde 24×28 iç boşluklu
// satırlar, satırlar arası ince çizgi; altta kaydet çubuğu. Ayar satırı solda başlık + açıklama, sağda alan;
// dar ekranda alt alta.
import { useId } from "react";

export function Kart({ children, className, etiket }: { children: React.ReactNode; className?: string; etiket?: string }) {
  return (
    <section aria-label={etiket} className={`overflow-hidden rounded-kart border border-kenar bg-white ${className ?? ""}`}>
      {children}
    </section>
  );
}

/** Kartın üst satırı: başlık, açıklama ve sağda isteğe bağlı eylem. */
export function KartBaslik(props: { baslik: string; aciklama?: React.ReactNode; children?: React.ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-7 py-5">
      <div className="min-w-0">
        <h3 id={props.id} className="text-base font-bold">
          {props.baslik}
        </h3>
        {props.aciklama && <p className="text-[13px] text-soluk">{props.aciklama}</p>}
      </div>
      {props.children && <div className="flex flex-wrap gap-2">{props.children}</div>}
    </div>
  );
}

/** Kart içinde sıradan bir satır (ilk satır dışında üstünde çizgi). */
export function KartSatiri({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`border-cizgi px-7 py-6 [&:not(:first-child)]:border-t ${className ?? ""}`}>{children}</div>;
}

/**
 * Ayar satırı. `alanId` verilirse başlık o alanın <label>'ıdır; verilmezse başlık metindir ve alan grubu başlığa
 * aria-labelledby ile bağlanır.
 */
export function AyarSatiri(props: { baslik: string; aciklama?: React.ReactNode; alanId?: string; children: React.ReactNode }) {
  const baslikId = useId();
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-3 border-cizgi px-7 py-6 [&:not(:first-child)]:border-t">
      <div className="min-w-0 flex-[1_1_220px]">
        {props.alanId ? (
          <label htmlFor={props.alanId} className="mb-1 block font-semibold">
            {props.baslik}
          </label>
        ) : (
          <p id={baslikId} className="mb-1 font-semibold">
            {props.baslik}
          </p>
        )}
        {props.aciklama && <div className="text-[13px] text-soluk">{props.aciklama}</div>}
      </div>
      <div className="min-w-0 flex-[2_1_340px]" role={props.alanId ? undefined : "group"} aria-labelledby={props.alanId ? undefined : baslikId}>
        {props.children}
      </div>
    </div>
  );
}

/** Kartın altındaki çubuk: solda isteğe bağlı açıklama, sağda düğmeler. */
export function KaydetCubugu({ aciklama, children }: { aciklama?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 border-t border-cizgi bg-kart-alt px-7 py-4 ${aciklama ? "justify-between" : "justify-end"}`}
    >
      {aciklama && <span className="text-[13px] text-soluk">{aciklama}</span>}
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

/** Ayarlar'ın sağ sütunundaki bölüm: başlık (h2), açıklama ve kartlar; sağda isteğe bağlı eylem. */
export function AyarBolumu(props: { baslik: string; aciklama: string; eylem?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="mb-1 text-xl font-bold">{props.baslik}</h2>
          <p className="text-soluk">{props.aciklama}</p>
        </div>
        {props.eylem}
      </div>
      {props.children}
    </div>
  );
}
