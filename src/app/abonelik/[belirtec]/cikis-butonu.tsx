"use client";
import { useState } from "react";

export function CikisButonu({ belirtec }: { belirtec: string }) {
  const [durum, setDurum] = useState<"bekliyor" | "gonderiliyor" | "tamam" | "hata">("bekliyor");

  async function cik() {
    setDurum("gonderiliyor");
    try {
      const yanit = await fetch(`/api/abonelik/${encodeURIComponent(belirtec)}`, { method: "POST", cache: "no-store" });
      setDurum(yanit.ok ? "tamam" : "hata");
    } catch {
      setDurum("hata");
    }
  }

  if (durum === "tamam") {
    return (
      <p role="status" className="mt-4 rounded-md bg-ana-acik p-3 text-sm font-medium text-ana-koyu">
        Aboneliğiniz sonlandırıldı. Bu göndericiden artık ticari ileti almayacaksınız.
      </p>
    );
  }
  return (
    <div className="mt-4 flex flex-col gap-2">
      <button type="button" className="dugme-ana self-start" onClick={cik} disabled={durum === "gonderiliyor"}>
        {durum === "gonderiliyor" ? "İşleniyor…" : "Abonelikten çık"}
      </button>
      {durum === "hata" && (
        <p role="alert" className="text-sm text-tehlike">
          İşlem tamamlanamadı. Lütfen biraz sonra tekrar deneyin.
        </p>
      )}
    </div>
  );
}
