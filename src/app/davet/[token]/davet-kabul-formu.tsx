"use client";
import { useActionState } from "react";
import { davetiKabulEt } from "@/app/eylemler/oturum";

export function DavetKabulFormu({ token }: { token: string }) {
  const [durum, eylem, bekliyor] = useActionState(davetiKabulEt, {});
  return (
    <form action={eylem} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {durum.hata && (
        <p role="alert" className="text-sm text-tehlike">
          {durum.hata}
        </p>
      )}
      <button type="submit" className="dugme-ana" disabled={bekliyor}>
        Daveti kabul et
      </button>
    </form>
  );
}
