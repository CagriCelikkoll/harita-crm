import { sayiYaz } from "@/lib/bicim";
import { KOTA_DOLDU_MESAJI, KOTA_UYARI_ORANI } from "@/lib/sabitler";
import type { KotaDurumu } from "@/server/repo/kullanim";

/** Aylık Places kullanımı: kullanılan / kota çubuğu; %80'de uyarı, %100'de "kota doldu". */
export function KotaCubugu({ durum, aciklama = true }: { durum: KotaDurumu; aciklama?: boolean }) {
  const yuzde = Math.round(durum.oran * 100);
  const renk = durum.doldu ? "bg-tehlike" : durum.uyari ? "bg-amber-500" : "bg-ana";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">Bu ayki Places kullanımı</span>
        <span className="tabular-nums">
          {sayiYaz(durum.kullanilan)} / {sayiYaz(durum.kota)}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-zemin"
        role="meter"
        aria-label="Bu ayki Places kullanımı"
        aria-valuemin={0}
        aria-valuemax={durum.kota}
        aria-valuenow={Math.min(durum.kullanilan, durum.kota)}
        aria-valuetext={`${durum.kullanilan} / ${durum.kota} (%${yuzde})`}
      >
        <div className={`h-2.5 rounded-full ${renk}`} style={{ width: `${yuzde}%` }} />
      </div>
      {durum.doldu ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-tehlike">
          {KOTA_DOLDU_MESAJI} İşletme bilgileri ve taramalar ay sonuna kadar durduruldu; kendi verileriniz görünmeye
          devam eder.
        </p>
      ) : durum.uyari ? (
        <p role="status" className="mt-1.5 text-xs font-medium text-amber-700">
          Kotanın %{yuzde}&apos;i kullanıldı (uyarı eşiği %{Math.round(KOTA_UYARI_ORANI * 100)}). Kalan:{" "}
          {sayiYaz(durum.kalan)} istek.
        </p>
      ) : (
        aciklama && (
          <p className="mt-1.5 text-xs text-soluk">
            Tarama, kayıt listesi ve detay görüntülemeleri Places isteği kullanır. Kota her ayın başında (UTC) sıfırlanır.
          </p>
        )
      )}
    </div>
  );
}
