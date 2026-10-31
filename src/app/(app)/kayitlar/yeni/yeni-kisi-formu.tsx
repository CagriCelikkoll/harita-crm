"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiIstek } from "@/lib/api-istemci";
import { ALICI_TURLERI, ALICI_TURU_ACIKLAMASI, ALICI_TURU_SECIM_ADLARI, type AliciTuru } from "@/lib/mesajlasma";
import type { KayitDto } from "@/server/servisler/kayit-dto";

export function YeniKisiFormu() {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  async function gonder(form: FormData) {
    setHata(null);
    setMesgul(true);
    const d = (ad: string) => String(form.get(ad) ?? "");
    const s = await apiIstek<{ kayit: KayitDto }>("/api/kayitlar", {
      method: "POST",
      govde: {
        isletmeAdi: d("isletmeAdi"),
        yetkiliAdi: d("yetkiliAdi"),
        ekTelefon: d("ekTelefon"),
        eposta: d("eposta"),
        notlar: d("notlar"),
        etiketler: d("etiketler").split(","),
        aliciTuru: d("aliciTuru") as AliciTuru,
      },
    });
    setMesgul(false);
    if (!s.ok) return setHata(s.hata);
    router.push(`/kayitlar?secili=${s.veri.kayit.id}`);
  }

  return (
    <form action={gonder} className="kart grid max-w-2xl gap-3 sm:grid-cols-2">
      <label className="etiket">
        İşletme adı
        <input name="isletmeAdi" maxLength={160} className="girdi" />
      </label>
      <label className="etiket">
        Ad soyad / yetkili
        <input name="yetkiliAdi" maxLength={120} className="girdi" />
      </label>
      <label className="etiket">
        Telefon
        <input name="ekTelefon" maxLength={40} className="girdi" placeholder="0532 111 22 33" />
      </label>
      <label className="etiket">
        E-posta
        <input name="eposta" type="email" maxLength={200} className="girdi" />
      </label>
      <label className="etiket">
        Alıcı türü
        {/* Varsayılan yok: kampanya kuralları alıcı türüne göre değiştiği için kullanıcı bilerek seçer. */}
        <select name="aliciTuru" className="girdi" defaultValue="" required>
          <option value="" disabled>
            Seçin
          </option>
          {ALICI_TURLERI.map((t) => (
            <option key={t} value={t}>
              {ALICI_TURU_SECIM_ADLARI[t]}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-soluk">{ALICI_TURU_ACIKLAMASI}</span>
      </label>
      <label className="etiket">
        Etiketler (virgülle)
        <input name="etiketler" className="girdi" />
      </label>
      <label className="etiket sm:col-span-2">
        Not
        <textarea name="notlar" maxLength={5000} rows={3} className="girdi" />
      </label>
      <p className="text-xs text-soluk sm:col-span-2">
        WhatsApp iznini kaydettikten sonra kayıt detayından girebilirsiniz.
      </p>
      {hata && (
        <p role="alert" className="text-sm text-tehlike sm:col-span-2">
          {hata}
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" className="dugme-ana" disabled={mesgul}>
          Kaydet
        </button>
      </div>
    </form>
  );
}
