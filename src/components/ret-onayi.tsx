"use client";
// Ret onay penceresi. Ret geri alınamaz: düğme önce bu pencereyi açar; ret isteği yalnızca "Ret ver" ile gönderilir
// (sunucu da retOnayi: true olmayan ret isteklerini reddeder). Detay paneli ve WhatsApp günlük liste kullanır.
// Pencere ortak Diyalog bileşenidir (document.body'ye taşınır, kendi formu yoktur): düğme bir formun içinde olsa bile
// (ör. WhatsApp izni formu) iç içe form oluşmaz ve "Ret ver" dıştaki formu göndermez.
import { useState } from "react";
import { Diyalog } from "@/components/arayuz/diyalog";
import { Dugme } from "@/components/arayuz/dugme";
import { RET_ONAY_METNI } from "@/lib/mesajlasma";

export function RetDugmesi(props: { ad: string; etiket: string; disabled?: boolean; onOnay: () => void }) {
  const [acik, setAcik] = useState(false);
  return (
    <>
      <Dugme tur="tehlike" disabled={props.disabled} onClick={() => setAcik(true)}>
        {props.etiket}
      </Dugme>
      <Diyalog
        acik={acik}
        onKapat={() => setAcik(false)}
        baslik={`Ret: ${props.ad}`}
        eylemler={
          <>
            <Dugme autoFocus onClick={() => setAcik(false)}>
              Vazgeç
            </Dugme>
            <Dugme
              tur="tehlike"
              onClick={() => {
                setAcik(false);
                props.onOnay();
              }}
            >
              Ret ver
            </Dugme>
          </>
        }
      >
        <p>{RET_ONAY_METNI}</p>
      </Diyalog>
    </>
  );
}
