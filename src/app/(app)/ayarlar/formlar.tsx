"use client";
// Ayarlar → Çalışma alanı, Ekip ve Veri saklama formları (server action'larla).
import { useActionState, useState } from "react";
import { AyarSatiri, KaydetCubugu } from "@/components/arayuz/kart";
import { SonucMesaji } from "@/components/bildirim";
import { ROL_ADLARI, ROLLER } from "@/lib/sabitler";
import { alanGuncelle, davetGonder, uyeyiCikar, type FormDurumu } from "./eylemler";

function Durum({ durum }: { durum: FormDurumu }) {
  return (
    <>
      {durum.hata && <SonucMesaji key={durum.hata} tur="hata" metin={durum.hata} />}
      {durum.tamam && <SonucMesaji key={durum.tamam} tur="tamam" metin={durum.tamam} />}
      {durum.baglanti && <input readOnly aria-label="Davet bağlantısı" value={durum.baglanti} className="girdi font-mono text-[13px]" onFocus={(e) => e.currentTarget.select()} />}
    </>
  );
}

const SALT_OKUNUR = "Bu ayarları yalnızca yöneticiler değiştirebilir.";

/** Kopyala düğmesi (giriş adresi, webhook adresi). */
export function KopyalaDugmesi({ metin, etiket = "Kopyala" }: { metin: string; etiket?: string }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  return (
    <button
      type="button"
      className="dugme"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(metin);
          setKopyalandi(true);
          setTimeout(() => setKopyalandi(false), 2000);
        } catch {
          // Pano izni yoksa kullanıcı alanı seçip kopyalayabilir.
        }
      }}
    >
      {kopyalandi ? "Kopyalandı" : etiket}
    </button>
  );
}

export function AlanAdiFormu(props: { ad: string; duzenlenebilir: boolean; girisAdresi: string }) {
  const [durum, eylem, bekliyor] = useActionState(alanGuncelle, {});
  return (
    <form action={eylem}>
      <fieldset disabled={!props.duzenlenebilir || bekliyor}>
        <AyarSatiri baslik="Çalışma alanı adı" aciklama="Menüde ve davet e-postalarında görünür." alanId="ca-ad">
          <input id="ca-ad" name="ad" defaultValue={props.ad} required minLength={2} maxLength={80} className="girdi" />
        </AyarSatiri>
      </fieldset>
      <AyarSatiri baslik="Giriş adresi" aciklama="Ekibiniz bu adresten giriş yapar.">
        <div className="flex flex-wrap gap-2">
          <span className="flex min-h-11 min-w-0 flex-[1_1_220px] items-center overflow-hidden rounded-lg border border-kenar bg-ic-kutu px-3.5 font-mono text-[13px] whitespace-nowrap">
            {props.girisAdresi}
          </span>
          <KopyalaDugmesi metin={props.girisAdresi} />
        </div>
      </AyarSatiri>
      <AyarSatiri baslik="Saat dilimi" aciklama="Gönderim saatleri, günlük sınırlar ve aylık kullanım buna göre hesaplanır.">
        <p className="flex min-h-11 items-center">İstanbul (UTC+3)</p>
      </AyarSatiri>
      <div className="px-7 empty:hidden">
        <Durum durum={durum} />
      </div>
      <KaydetCubugu aciklama={props.duzenlenebilir ? undefined : SALT_OKUNUR}>
        {props.duzenlenebilir && (
          <button type="submit" className="dugme-ana" disabled={bekliyor}>
            Kaydet
          </button>
        )}
      </KaydetCubugu>
    </form>
  );
}

export function VeriSaklamaFormu(props: { veriSaklamaGun: number | null }) {
  const [durum, eylem, bekliyor] = useActionState(alanGuncelle, {});
  return (
    <form action={eylem}>
      <fieldset disabled={bekliyor}>
        <AyarSatiri
          baslik="Kullanılmayan kayıtları sil"
          aciklama="Bu süre boyunca güncellenmeyen kayıtlar ve etkinlik geçmişleri günlük temizlikte silinir. Boş bırakırsanız süresiz saklanır."
          alanId="vs-sure"
        >
          <div className="flex items-center gap-3">
            <input
              id="vs-sure"
              name="veriSaklamaGun"
              type="number"
              min={30}
              max={3650}
              defaultValue={props.veriSaklamaGun ?? ""}
              placeholder="Süresiz"
              className="girdi max-w-40"
            />
            <span className="text-soluk">gün (30–3650)</span>
          </div>
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

export function DavetFormu() {
  const [durum, eylem, bekliyor] = useActionState(davetGonder, {});
  return (
    <form action={eylem}>
      <fieldset disabled={bekliyor}>
        <AyarSatiri baslik="Kişi davet et" aciklama="Davet bağlantısı 7 gün geçerlidir.">
          <div className="flex flex-wrap gap-3">
            <label className="flex min-w-0 flex-[2_1_220px] flex-col gap-1.5 text-[13px] text-soluk">
              E-posta
              <input name="eposta" type="email" required className="girdi" />
            </label>
            <label className="flex min-w-0 flex-[1_1_140px] flex-col gap-1.5 text-[13px] text-soluk">
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
        </AyarSatiri>
      </fieldset>
      <div className="flex flex-col gap-2 px-7 empty:hidden">
        <Durum durum={durum} />
      </div>
      <KaydetCubugu aciklama="E-posta sunucusu bağlı değilse davet bağlantısı burada gösterilir.">
        <button type="submit" className="dugme-ana" disabled={bekliyor}>
          Kişi davet et
        </button>
      </KaydetCubugu>
    </form>
  );
}

export function UyeCikarFormu({ userId, ad }: { userId: string; ad: string }) {
  const [durum, eylem, bekliyor] = useActionState(uyeyiCikar, {});
  return (
    <form action={eylem} onSubmit={(e) => !confirm(`${ad} çalışma alanından çıkarılsın mı?`) && e.preventDefault()}>
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="dugme dugme-kucuk text-tehlike" disabled={bekliyor}>
        Çıkar
      </button>
      {durum.hata && <span className="ml-1 text-xs text-tehlike">{durum.hata}</span>}
    </form>
  );
}
