"use client";
// "Geçmişi göster": bir ayarın denetim kayıtları (tarih, kişi, yeni değer, açıklama). Yalnızca yöneticiye gösterilir
// (sunucu da 403 verir). Liste açılınca istenir; her açılışta yenilenir (arada yapılan değişiklik görünür).
import { DonerGosterge } from "@/components/arayuz/doner-gosterge";
import { useState } from "react";
import { apiIstek } from "@/lib/api-istemci";
import { tarihYaz } from "@/lib/bicim";
import type { DenetimSatiri, GecmisOlayi } from "@/lib/denetim";

export function DenetimGecmisi(props: { olay: GecmisOlayi; degerAdi: (deger: string | null) => string; className?: string }) {
  const [durum, setDurum] = useState<{ tur: "bos" } | { tur: "yukleniyor" } | { tur: "tamam"; kayitlar: DenetimSatiri[] } | { tur: "hata"; metin: string }>({
    tur: "bos",
  });
  async function yukle() {
    setDurum({ tur: "yukleniyor" });
    const s = await apiIstek<{ kayitlar: DenetimSatiri[] }>(`/api/denetim?olay=${props.olay}`);
    setDurum(s.ok ? { tur: "tamam", kayitlar: s.veri.kayitlar } : { tur: "hata", metin: s.hata });
  }
  return (
    <details
      className={props.className}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) void yukle();
      }}
    >
      <summary className="cursor-pointer text-ufak font-medium text-ana">Geçmişi göster</summary>
      <div className="mt-2" aria-live="polite">
        {durum.tur === "yukleniyor" && <DonerGosterge boyut={14} etiket="Yükleniyor…" />}
        {durum.tur === "hata" && (
          <p role="alert" className="text-ufak text-tehlike">
            {durum.metin}
          </p>
        )}
        {durum.tur === "tamam" &&
          (durum.kayitlar.length === 0 ? (
            <p className="text-ufak text-soluk">Henüz değişiklik yok.</p>
          ) : (
            <ul aria-label="Değişiklik geçmişi" className="flex flex-col divide-y divide-cizgi rounded-xl border border-kenar text-ufak">
              {durum.kayitlar.map((k) => (
                <li key={k.id} className="flex flex-col gap-0.5 px-3 py-2">
                  <span className="flex flex-wrap gap-x-2">
                    <span className="font-semibold">{props.degerAdi(k.deger)}</span>
                    <span className="text-soluk">
                      {tarihYaz(k.tarih)} · {k.kullanici ?? "Silinmiş kullanıcı"}
                    </span>
                  </span>
                  {k.aciklama && <span className="break-words text-metin-ikincil">{k.aciklama}</span>}
                </li>
              ))}
            </ul>
          ))}
      </div>
    </details>
  );
}
