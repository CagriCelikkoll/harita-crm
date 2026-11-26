"use client";
// Bu cihazda bildirimi açma / kapatma ve cihaz listesindeki satır. İzin yalnızca düğmeye basınca istenir.
import { DonerGosterge } from "@/components/arayuz/doner-gosterge";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SonucMesaji } from "@/components/bildirim";
import { bildirimDestegi, bildirimiAc, bildirimiKapat, mevcutAbonelik, type BildirimDestegi } from "@/lib/bildirim-istemci";
import type { FormDurumu } from "../eylemler";
import { bildirimCihaziniKaldir } from "./eylemler";

type Durum = { destek: BildirimDestegi; izin: NotificationPermission | null; abone: boolean };

async function durumOku(): Promise<Durum> {
  const destek = bildirimDestegi();
  if (destek !== "var") return { destek, izin: null, abone: false };
  return { destek, izin: Notification.permission, abone: !!(await mevcutAbonelik()) };
}

export function BildirimAyari(props: { acikAnahtar: string | null }) {
  const router = useRouter();
  const [durum, setDurum] = useState<Durum | null>(null);
  const [mesaj, setMesaj] = useState<{ tur: "tamam" | "hata"; metin: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  useEffect(() => {
    durumOku()
      .then(setDurum)
      .catch(() => setDurum({ destek: "yok", izin: null, abone: false }));
  }, []);

  async function calistir(is: () => Promise<string | null>, basari: string) {
    setBekliyor(true);
    setMesaj(null);
    try {
      const hata = await is();
      setMesaj(hata ? { tur: "hata", metin: hata } : { tur: "tamam", metin: basari });
    } catch {
      setMesaj({ tur: "hata", metin: "Bildirim ayarı değiştirilemedi. Sayfayı yenileyip yeniden deneyin." });
    } finally {
      setDurum(await durumOku().catch(() => null));
      setBekliyor(false);
      router.refresh();
    }
  }

  let icerik: React.ReactNode;
  if (!props.acikAnahtar) {
    icerik = <p className="text-sm text-soluk">Bu sunucuda bildirimler kapalı. Sunucu yöneticisinin VAPID anahtarlarını tanımlaması gerekir (docs/SUNUCU-KURULUM.md).</p>;
  } else if (!durum) {
    icerik = <DonerGosterge etiket="Denetleniyor…" />;
  } else if (durum.destek === "ios-ana-ekran") {
    icerik = (
      <p className="text-sm">
        iPhone ve iPad’de bildirimler yalnızca <strong>ana ekrana eklenmiş uygulamada</strong> çalışır (iOS 16.4 ve üstü). Safari’de Paylaş →{" "}
        <strong>Ana Ekrana Ekle</strong>’ye dokunun, Harita CRM’i ana ekrandan açın ve bildirimleri buradan açın.
      </p>
    );
  } else if (durum.destek === "yok") {
    icerik = <p className="text-sm text-soluk">Bu tarayıcı bildirimleri desteklemiyor.</p>;
  } else if (durum.abone && durum.izin === "granted") {
    const anahtar = props.acikAnahtar;
    icerik = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ana-koyu">Bu cihazda bildirimler açık.</p>
        <button type="button" className="dugme" disabled={bekliyor} onClick={() => calistir(bildirimiKapat, "Bu cihazda bildirimler kapatıldı.")}>
          Kapat
        </button>
        {/* Anahtar değiştiyse ya da kayıt silindiyse yeniden bağlamak için. */}
        <button type="button" className="dugme dugme-kucuk" disabled={bekliyor} onClick={() => calistir(() => bildirimiAc(anahtar), "Bildirimler yenilendi.")}>
          Yenile
        </button>
      </div>
    );
  } else if (durum.izin === "denied") {
    icerik = (
      <p className="text-sm">
        Bu tarayıcıda bildirim izni reddedilmiş. Adres çubuğundaki site ayarlarından bu site için bildirimlere izin verin, sonra sayfayı yenileyin.
      </p>
    );
  } else {
    const anahtar = props.acikAnahtar;
    icerik = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-soluk">Bu cihazda bildirimler kapalı.</p>
        <button type="button" className="dugme-ana" disabled={bekliyor} onClick={() => calistir(() => bildirimiAc(anahtar), "Bu cihazda bildirimler açıldı.")}>
          Bildirimleri aç
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-cizgi px-7 py-6">
      {icerik}
      {mesaj && <SonucMesaji key={mesaj.metin} tur={mesaj.tur} metin={mesaj.metin} />}
    </div>
  );
}

export function CihazSatiri(props: { id: string; ad: string; ayrinti: string }) {
  const [durum, eylem, bekliyor] = useActionState<FormDurumu, FormData>(bildirimCihaziniKaldir, {});
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-cizgi px-7 py-4">
      <div className="min-w-0">
        <p className="font-semibold">{props.ad}</p>
        <p className="text-ufak text-soluk">{props.ayrinti}</p>
      </div>
      <form action={eylem} className="flex items-center gap-2">
        <input type="hidden" name="id" value={props.id} />
        <button type="submit" className="dugme dugme-kucuk" disabled={bekliyor}>
          Kaldır
        </button>
        {durum.hata && <span className="text-xs text-tehlike">{durum.hata}</span>}
      </form>
    </li>
  );
}
