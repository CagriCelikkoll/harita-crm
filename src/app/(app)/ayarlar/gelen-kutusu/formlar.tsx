"use client";
// Ayarlar → Gelen kutusu formları (server action'larla).
import { useActionState } from "react";
import { AyarSatiri, KaydetCubugu } from "@/components/arayuz/kart";
import { SonucMesaji } from "@/components/bildirim";
import { GERI_AL_MS, OTOMATIK_KAPATMA_GUNLERI } from "@/lib/gelen-kutusu";
import type { FormDurumu } from "../eylemler";
import { gonderimGeriAlGuncelle, otomatikKapatmaGuncelle } from "./eylemler";

function Durum({ durum }: { durum: FormDurumu }) {
  return (
    <>
      {durum.hata && <SonucMesaji key={durum.hata} tur="hata" metin={durum.hata} />}
      {durum.tamam && <SonucMesaji key={durum.tamam} tur="tamam" metin={durum.tamam} />}
    </>
  );
}

/** Kişisel: metin ve dosya gönderimi GERI_AL_MS bekletilir; bu sürede "Geri al" ile hiç gönderilmez. */
export function GonderimGeriAlFormu(props: { acik: boolean }) {
  const [durum, eylem, bekliyor] = useActionState(gonderimGeriAlGuncelle, {});
  return (
    <form action={eylem}>
      <fieldset disabled={bekliyor}>
        <AyarSatiri
          baslik="Gönderimi geri al"
          aciklama={`Gönder'e bastıktan sonra mesaj ${GERI_AL_MS / 1000} saniye bekler; bu sürede “Geri al” ile WhatsApp'a hiç gitmez ve yazı alanına döner. Sayfa kapanır ya da bağlantı koparsa bekleyen mesaj gönderilmez. Yalnızca sizin için geçerlidir.`}
        >
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="gonderimGeriAl" defaultChecked={props.acik} />
            Gönderimi {GERI_AL_MS / 1000} saniye beklet
          </label>
        </AyarSatiri>
      </fieldset>
      <div className="px-7 empty:hidden">
        <Durum durum={durum} />
      </div>
      <KaydetCubugu>
        <button type="submit" className="dugme-ana" disabled={bekliyor}>
          Kaydet
        </button>
      </KaydetCubugu>
    </form>
  );
}

/** Çalışma alanı: sessiz sohbetleri günlük bakımda kapatma (yalnızca yönetici değiştirir). */
export function OtomatikKapatmaFormu(props: { gun: number | null; yonetici: boolean }) {
  const [durum, eylem, bekliyor] = useActionState(otomatikKapatmaGuncelle, {});
  return (
    <form action={eylem}>
      <fieldset disabled={bekliyor || !props.yonetici}>
        <AyarSatiri
          baslik="Sessiz sohbetleri otomatik kapat"
          aciklama="Bu kadar gündür hiç mesaj olmayan açık sohbetler günde bir kez kapatılır (arşiv). Müşteri yeniden yazınca sohbet kendiliğinden açılır."
          alanId="gk-otomatik-kapatma"
        >
          <select id="gk-otomatik-kapatma" name="otomatikKapatmaGun" defaultValue={props.gun ?? ""} className="girdi max-w-56">
            <option value="">Kapalı</option>
            {OTOMATIK_KAPATMA_GUNLERI.map((g) => (
              <option key={g} value={g}>
                {g} gün sessizlikten sonra
              </option>
            ))}
          </select>
        </AyarSatiri>
      </fieldset>
      <div className="px-7 empty:hidden">
        {!props.yonetici && <p className="text-sm text-soluk">Bu ayarı yalnızca yöneticiler değiştirebilir.</p>}
        <Durum durum={durum} />
      </div>
      {props.yonetici && (
        <KaydetCubugu>
          <button type="submit" className="dugme-ana" disabled={bekliyor}>
            Kaydet
          </button>
        </KaydetCubugu>
      )}
    </form>
  );
}
