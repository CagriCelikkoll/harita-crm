"use client";
import { useActionState } from "react";
import { ROL_ADLARI, ROLLER } from "@/lib/sabitler";
import { alanGuncelle, davetGonder, uyeyiCikar, type FormDurumu } from "./eylemler";

function Durum({ durum }: { durum: FormDurumu }) {
  return (
    <>
      {durum.hata && <p role="alert" className="text-sm text-tehlike">{durum.hata}</p>}
      {durum.tamam && <p role="status" className="text-sm text-ana">{durum.tamam}</p>}
      {durum.baglanti && <input readOnly aria-label="Davet bağlantısı" value={durum.baglanti} className="girdi text-xs" onFocus={(e) => e.currentTarget.select()} />}
    </>
  );
}

export function AlanFormu(props: { ad: string; veriSaklamaGun: number | null; duzenlenebilir: boolean }) {
  const [durum, eylem, bekliyor] = useActionState(alanGuncelle, {});
  return (
    <form action={eylem} className="flex flex-col gap-3">
      <fieldset disabled={!props.duzenlenebilir} className="flex flex-col gap-3">
        <label className="etiket">
          Çalışma alanı adı
          <input name="ad" defaultValue={props.ad} required minLength={2} maxLength={80} className="girdi" />
        </label>
        <label className="etiket">
          Veri saklama süresi (gün)
          <input
            name="veriSaklamaGun"
            type="number"
            min={30}
            max={3650}
            defaultValue={props.veriSaklamaGun ?? ""}
            placeholder="Süresiz"
            className="girdi"
          />
          <span className="text-xs font-normal text-soluk">
            Bu süre boyunca güncellenmeyen kayıtlar ve etkinlik geçmişleri günlük temizlikte silinir. Boş bırakırsanız
            süresiz saklanır.
          </span>
        </label>
      </fieldset>
      <Durum durum={durum} />
      {props.duzenlenebilir ? (
        <button type="submit" className="dugme-ana self-start" disabled={bekliyor}>
          Kaydet
        </button>
      ) : (
        <p className="text-xs text-soluk">Bu ayarları yalnızca yöneticiler değiştirebilir.</p>
      )}
    </form>
  );
}

export function DavetFormu() {
  const [durum, eylem, bekliyor] = useActionState(davetGonder, {});
  return (
    <form action={eylem} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="etiket">
          E-posta
          <input name="eposta" type="email" required className="girdi" />
        </label>
        <label className="etiket">
          Rol
          <select name="rol" defaultValue="uye" className="girdi">
            {ROLLER.map((r) => (
              <option key={r} value={r}>
                {ROL_ADLARI[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Durum durum={durum} />
      <button type="submit" className="dugme-ana self-start" disabled={bekliyor}>
        Davet et
      </button>
      <p className="text-xs text-soluk">
        1. aşamada e-posta sunucusu bağlı değil: davet bağlantısı burada gösterilir ve sunucu günlüğüne yazılır.
      </p>
    </form>
  );
}

export function UyeCikarFormu({ userId, ad }: { userId: string; ad: string }) {
  const [durum, eylem, bekliyor] = useActionState(uyeyiCikar, {});
  return (
    <form action={eylem} onSubmit={(e) => !confirm(`${ad} çalışma alanından çıkarılsın mı?`) && e.preventDefault()}>
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="text-xs text-tehlike underline" disabled={bekliyor}>
        Çıkar
      </button>
      {durum.hata && <span className="ml-1 text-xs text-tehlike">{durum.hata}</span>}
    </form>
  );
}
