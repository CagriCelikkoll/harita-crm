"use client";
import { Dugme } from "@/components/arayuz/dugme";
import { useActionState } from "react";
import { calismaAlaniOlustur } from "@/app/eylemler/oturum";

export function KurulumFormu() {
  const [durum, eylem, bekliyor] = useActionState(calismaAlaniOlustur, {});
  return (
    <form action={eylem} className="flex flex-col gap-3">
      <label className="etiket">
        Çalışma alanı adı
        <input name="ad" required minLength={2} maxLength={80} placeholder="ör. Ege Satış Ekibi" className="girdi" />
      </label>
      {durum.hata && (
        <p role="alert" className="text-sm text-tehlike">
          {durum.hata}
        </p>
      )}
      <Dugme type="submit" tur="ana" yukleniyor={bekliyor}>
        Oluştur
      </Dugme>
    </form>
  );
}
