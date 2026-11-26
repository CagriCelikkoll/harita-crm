"use client";
// Ayarlar → Hazır cevaplar: ekleme formu ve listedeki satır (düzenle / sil).
import { useActionState, useState } from "react";
import { KaydetCubugu } from "@/components/arayuz/kart";
import { SonucMesaji } from "@/components/bildirim";
import { YANIT_AZAMI } from "@/lib/gelen-kutusu";
import { GONDEREN_NUMARA_YER_TUTUCU, HAZIR_CEVAP_BASLIK_AZAMI, type HazirCevapDto, type HazirCevapGirdisi } from "@/lib/hazir-cevaplar";
import type { FormDurumu } from "../eylemler";
import { hazirCevabiSil, hazirCevapKaydet } from "./eylemler";

function Durum({ durum }: { durum: FormDurumu }) {
  return (
    <>
      {durum.hata && <SonucMesaji key={durum.hata} tur="hata" metin={durum.hata} />}
      {durum.tamam && <SonucMesaji key={durum.tamam} tur="tamam" metin={durum.tamam} />}
    </>
  );
}

/**
 * Yeni hazır cevap (cevap verilmezse) ya da düzenleme. Eklenince form boşalır. Alanlar denetimli: React form eylemi
 * bitince denetimsiz alanları sıfırlar; hata olduğunda (ör. aynı başlık) yazılan başlık kaybolmasın.
 */
export function HazirCevapFormu(props: { cevap?: HazirCevapDto; onVazgec?: () => void; /** Yeni formda: örnek öneriler (yalnızca forma doldurur; kaydetmez). */ oneriler?: readonly HazirCevapGirdisi[] }) {
  const [baslik, setBaslik] = useState(props.cevap?.baslik ?? "");
  const [metin, setMetin] = useState(props.cevap?.metin ?? "");
  const [durum, eylem, bekliyor] = useActionState(async (onceki: FormDurumu, formData: FormData) => {
    const sonuc = await hazirCevapKaydet(onceki, formData);
    if (sonuc.tamam && !props.cevap) {
      setBaslik("");
      setMetin("");
    }
    return sonuc;
  }, {});
  const on = props.cevap ? `hc-${props.cevap.id}` : "hc-yeni";
  return (
    <form action={eylem} className="border-t border-cizgi">
      {props.cevap && <input type="hidden" name="id" value={props.cevap.id} />}
      <fieldset disabled={bekliyor} className="flex flex-col gap-4 px-7 py-6">
        {!props.cevap && props.oneriler && props.oneriler.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-ufak text-soluk">
            Örnek:
            {props.oneriler.map((o) => (
              <button
                key={o.baslik}
                type="button"
                className="dugme dugme-kucuk"
                onClick={() => {
                  setBaslik(o.baslik);
                  setMetin(o.metin);
                }}
              >
                {o.baslik}
              </button>
            ))}
          </div>
        )}
        <label htmlFor={`${on}-baslik`} className="flex flex-col gap-1.5 text-ufak text-soluk">
          Başlık (seçerken aranır)
          <input
            id={`${on}-baslik`}
            name="baslik"
            required
            maxLength={HAZIR_CEVAP_BASLIK_AZAMI}
            value={baslik}
            onChange={(e) => setBaslik(e.target.value)}
            placeholder="ör. Fiyat bilgisi"
            className="girdi"
          />
        </label>
        <label htmlFor={`${on}-metin`} className="flex flex-col gap-1.5 text-ufak text-soluk">
          Metin
          <textarea
            id={`${on}-metin`}
            name="metin"
            required
            maxLength={YANIT_AZAMI}
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            className="girdi min-h-28"
          />
          <span className="flex flex-wrap justify-between gap-2 text-xs">
            <span>
              {GONDEREN_NUMARA_YER_TUTUCU} yazarsanız sohbetin gönderen numarasıyla dolar (ör. wa.me/{GONDEREN_NUMARA_YER_TUTUCU}).
            </span>
            <span className="ml-auto">
              {metin.length} / {YANIT_AZAMI}
            </span>
          </span>
        </label>
        <Durum durum={durum} />
      </fieldset>
      <KaydetCubugu aciklama="Hazır cevap yalnızca 24 saatlik pencere açıkken serbest metin olarak gönderilebilir.">
        {props.onVazgec && (
          <button type="button" className="dugme" onClick={props.onVazgec} disabled={bekliyor}>
            Vazgeç
          </button>
        )}
        <button type="submit" className="dugme-ana" disabled={bekliyor}>
          {props.cevap ? "Kaydet" : "Ekle"}
        </button>
      </KaydetCubugu>
    </form>
  );
}

export function HazirCevapSatiri(props: { cevap: HazirCevapDto; yonetici: boolean }) {
  const [duzenle, setDuzenle] = useState(false);
  const [silDurumu, silEylemi, siliniyor] = useActionState(hazirCevabiSil, {});
  const { cevap } = props;
  if (duzenle) {
    return (
      <li className="border-t border-cizgi">
        <HazirCevapFormu cevap={cevap} onVazgec={() => setDuzenle(false)} />
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-start gap-4 border-t border-cizgi px-7 py-[18px]">
      <div className="min-w-0 flex-[1_1_260px]">
        <p className="font-semibold break-words">{cevap.baslik}</p>
        <p className="line-clamp-3 text-ufak break-words whitespace-pre-wrap text-metin-ikincil">{cevap.metin}</p>
      </div>
      {props.yonetici && (
        <div className="flex items-center gap-2">
          <button type="button" className="dugme dugme-kucuk" onClick={() => setDuzenle(true)}>
            Düzenle
          </button>
          <form action={silEylemi} onSubmit={(e) => !confirm(`"${cevap.baslik}" silinsin mi?`) && e.preventDefault()}>
            <input type="hidden" name="id" value={cevap.id} />
            <button type="submit" className="dugme dugme-kucuk text-tehlike" disabled={siliniyor}>
              Sil
            </button>
          </form>
          {silDurumu.hata && <span className="text-xs text-tehlike">{silDurumu.hata}</span>}
        </div>
      )}
    </li>
  );
}
