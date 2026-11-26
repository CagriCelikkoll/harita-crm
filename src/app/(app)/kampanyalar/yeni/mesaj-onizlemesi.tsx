// Kampanya sihirbazının sağ sütunundaki (dar ekranda adım içeriğinin altındaki) mesaj önizlemesi. Yalnızca gösterim:
// WhatsApp'ta Meta'da onaylı şablon telefon / sohbet balonu görünümünde (görsel, başlık, gövde, alt bilgi, butonlar;
// değişkenler örnek değerle ve vurgulu), e-posta / SMS'te örnek işletme adıyla doldurulmuş metin.
import type { ReactNode } from "react";
import type { KuyrukKanali } from "@/lib/mesajlasma";
import {
  DEGISKEN_KAYNAK_ADLARI,
  degiskenAnahtari,
  SABLON_KATEGORI_ADLARI,
  sablonParcalari,
  type DegiskenEslemi,
} from "@/lib/whatsapp-api";
import type { SablonDto } from "@/server/servisler/whatsapp-api";

/** Önizlemede değişken yerine konan örnek değer (kaynak kayıtsa örnek; sabitse girilen metin). */
export const ornekDeger = (a: DegiskenEslemi[string] | undefined) =>
  a?.kaynak === "sabit" ? a.deger || "…" : a?.kaynak === "yetkili_adi" ? "Örnek Yetkili" : "Örnek İşletme";

/** Kayıttan gelen değişkenin "Kayıtta boşsa" değeri: girildiyse o, girilmediyse alıcı hariç tutulur. */
export const yedekMetni = (a: DegiskenEslemi[string] | undefined) =>
  a?.yedek?.trim() ? `boşsa: "${a.yedek.trim()}"` : "boşsa alıcı hariç tutulur";

/** Önizlemenin altında: girilen "Kayıtta boşsa" değerleri (kayıttan gelen değişkenler için). */
function YedekDegerler(props: { sablon: SablonDto; eslem: DegiskenEslemi }) {
  const satirlar = props.sablon.degiskenler.flatMap((dg) => {
    const a = props.eslem[degiskenAnahtari(dg)];
    return a?.kaynak !== "sabit" && a?.yedek?.trim() ? [{ ad: `${dg.bilesen === "header" ? "Başlık" : "Gövde"} {{${dg.ad}}}`, deger: a.yedek.trim() }] : [];
  });
  if (!satirlar.length) return null;
  return (
    <span className="mt-0.5 block text-left text-metin-ikincil">
      Kayıtta boşsa:{" "}
      {satirlar.map((s, i) => (
        <span key={s.ad}>
          {i > 0 && ", "}
          {s.ad} → &quot;{s.deger}&quot;
        </span>
      ))}
    </span>
  );
}

const BUTON_TURU_ADLARI: Record<string, string> = { QUICK_REPLY: "Hızlı yanıt", URL: "Bağlantı", PHONE_NUMBER: "Telefon", COPY_CODE: "Kodu kopyala" };
const BOLUM_ADLARI = { gorsel: "Görsel", baslik: "Başlık", govde: "Gövde", altbilgi: "Alt bilgi", butonlar: "Butonlar" } as const;

/** Şablonun butonları (Meta bileşenlerinden; her buton ayrı satır). */
const sablonButonlari = (s: SablonDto) =>
  s.bilesenler.filter((b) => b.type.toUpperCase() === "BUTTONS").flatMap((b) => b.buttons ?? []);

function Telefon(props: { ust: string; children: ReactNode; etiket: string; aciklama: string; ek?: ReactNode }) {
  return (
    <figure aria-label={props.etiket} className="mx-auto flex w-full max-w-[320px] flex-col overflow-hidden rounded-[26px] border-[6px] border-[#1f2c34] bg-[#efeae2] shadow-sm">
      <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2.5 text-white">
        <span aria-hidden="true" className="size-7 shrink-0 rounded-full bg-white/25" />
        <span className="truncate text-sm font-semibold">{props.ust}</span>
      </div>
      <div className="flex min-h-48 flex-col gap-1.5 p-3">{props.children}</div>
      <figcaption className="bg-white/70 px-3 py-1.5 text-center text-xs text-soluk">
        {props.aciklama}
        {props.ek}
      </figcaption>
    </figure>
  );
}

export function WhatsappOnizlemesi(props: {
  /** Gönderen numaranın etiketi (telefonun üst çubuğunda). */
  numara: string;
  sablon: SablonDto | null;
  eslem: DegiskenEslemi;
  /** Görselli şablon: yüklenen görselin adresi (yoksa yer tutucu). */
  gorselAdresi: string | null;
}) {
  const { sablon } = props;
  if (!sablon) {
    return (
      <Telefon ust={props.numara || "WhatsApp"} etiket="WhatsApp önizlemesi" aciklama="Şablon seçilmedi">
        <p className="m-auto max-w-[220px] text-center text-ufak text-soluk">Mesaj adımında şablon seçince önizleme burada görünür.</p>
      </Telefon>
    );
  }
  const bolumler = sablonParcalari(sablon.bilesenler).filter((b) => b.tur !== "butonlar");
  const butonlar = sablonButonlari(sablon);
  return (
    <Telefon ust={props.numara || "WhatsApp"} etiket="WhatsApp önizlemesi" aciklama="Örnek değerlerle; değişkenler vurgulu" ek={<YedekDegerler sablon={sablon} eslem={props.eslem} />}>
      <div className="max-w-[92%] self-start overflow-hidden rounded-lg rounded-tl-none bg-white text-ufak text-[#111b21] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
        {bolumler.map((b, i) =>
          b.tur === "gorsel" ? (
            props.gorselAdresi ? (
              // eslint-disable-next-line @next/next/no-img-element -- oturumlu API'den gelen dosya; next/image optimizasyonu kullanılmaz
              <img key={i} src={props.gorselAdresi} alt="Kampanya görseli" className="aspect-[1.91/1] w-full object-cover p-1" />
            ) : (
              <div key={i} className="m-1 flex aspect-[1.91/1] items-center justify-center rounded-md bg-[#d9dfe3] text-xs text-soluk">
                Görsel yüklenince burada görünür
              </div>
            )
          ) : (
            <p
              key={i}
              className={`px-2.5 ${i === 0 ? "pt-2" : "pt-1"} ${b.tur === "baslik" ? "font-semibold" : b.tur === "altbilgi" ? "text-xs text-[#667781]" : ""} whitespace-pre-wrap break-words`}
            >
              {b.parcalar.map((x, j) =>
                "metin" in x ? (
                  <span key={j}>{x.metin}</span>
                ) : (
                  <mark
                    key={j}
                    className="rounded-md bg-uyari-acik px-0.5 text-uyari"
                    title={DEGISKEN_KAYNAK_ADLARI[props.eslem[degiskenAnahtari(x.degisken)]?.kaynak ?? "isletme_adi"]}
                  >
                    {ornekDeger(props.eslem[degiskenAnahtari(x.degisken)])}
                  </mark>
                ),
              )}
            </p>
          ),
        )}
        <p className="px-2.5 pt-0.5 pb-1.5 text-right text-xs text-[#667781]">09:41</p>
      </div>
      {butonlar.length > 0 && (
        <ul aria-label="Şablon butonları" className="flex max-w-[92%] flex-col gap-1">
          {butonlar.map((b, i) => (
            <li key={i} className="rounded-lg bg-white py-2 text-center text-ufak font-medium text-[#008069] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
              {b.text ?? BUTON_TURU_ADLARI[b.type] ?? b.type}
            </li>
          ))}
        </ul>
      )}
    </Telefon>
  );
}

/** Ham metin isteyene: kategori, dil, değişkenler (eşlendikleri kaynakla), butonlar ve {{1}} işaretli tam metin. */
export function SablonAyrintilari(props: { sablon: SablonDto; eslem: DegiskenEslemi }) {
  const { sablon } = props;
  const butonlar = sablonButonlari(sablon);
  return (
    <details className="rounded-xl border border-kenar bg-white text-sm">
      <summary className="cursor-pointer px-4 py-2.5 font-semibold">Şablon ayrıntıları</summary>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-cizgi px-4 py-3 text-ufak">
        <dt className="text-soluk">Ad</dt>
        <dd className="break-words">{sablon.ad}</dd>
        <dt className="text-soluk">Kategori</dt>
        <dd>{SABLON_KATEGORI_ADLARI[sablon.kategori] ?? sablon.kategori}</dd>
        <dt className="text-soluk">Dil</dt>
        <dd>{sablon.dil}</dd>
        <dt className="text-soluk">Değişkenler</dt>
        <dd>
          {sablon.degiskenler.length === 0 ? (
            "Yok"
          ) : (
            <ul>
              {sablon.degiskenler.map((dg) => {
                const a = props.eslem[degiskenAnahtari(dg)];
                return (
                  <li key={degiskenAnahtari(dg)}>
                    {dg.bilesen === "header" ? "Başlık" : "Gövde"} {`{{${dg.ad}}}`} → {DEGISKEN_KAYNAK_ADLARI[a?.kaynak ?? "isletme_adi"]}
                    {a?.kaynak === "sabit" ? (a.deger ? `: "${a.deger}"` : "") : ` (${yedekMetni(a)})`}
                  </li>
                );
              })}
            </ul>
          )}
        </dd>
        <dt className="text-soluk">Butonlar</dt>
        <dd>
          {butonlar.length === 0 ? (
            "Yok"
          ) : (
            <ul>
              {butonlar.map((b, i) => (
                <li key={i} className="break-words">
                  {b.text ?? "—"} <span className="text-soluk">({BUTON_TURU_ADLARI[b.type] ?? b.type}{b.url ? `: ${b.url}` : ""})</span>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
      <div className="border-t border-cizgi px-4 py-3">
        <p className="mb-1 text-xs font-semibold text-soluk">Ham metin (Meta&apos;da onaylı; değiştirilemez)</p>
        {sablonParcalari(sablon.bilesenler).map((b, i) => (
          <p key={i} className="text-ufak whitespace-pre-wrap break-words">
            <span className="mr-1 text-xs text-soluk">{BOLUM_ADLARI[b.tur]}:</span>
            {b.parcalar.map((x) => ("metin" in x ? x.metin : `{{${x.degisken.ad}}}`)).join("")}
          </p>
        ))}
      </div>
    </details>
  );
}

/** E-posta / SMS önizlemesi: işletme adı girilmiş ve girilmemiş kayıt için doldurulmuş metin. */
export function MetinOnizlemesi(props: {
  kanal: Exclude<KuyrukKanali, "whatsapp_api">;
  konu: string;
  /** Üstteki metnin açıklaması (örnek ya da ilk alıcı). */
  baslik: string;
  adli: string;
  adsiz: string | null;
}) {
  const sms = props.kanal === "sms";
  return (
    <figure aria-label={sms ? "SMS önizlemesi" : "E-posta önizlemesi"} className="kart flex flex-col gap-3 sm:!p-4 text-sm">
      <figcaption className="text-xs font-semibold text-soluk">{props.baslik}</figcaption>
      {sms ? (
        <p className="max-w-[92%] self-start rounded-2xl rounded-tl-sm bg-[#e9e9eb] px-3 py-2 whitespace-pre-wrap break-words">{props.adli || "—"}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-kenar">
          <p className="border-b border-cizgi bg-kart-alt px-3 py-2 text-ufak">
            <span className="text-soluk">Konu:</span> <span className="font-semibold">{props.konu || "—"}</span>
          </p>
          <p className="px-3 py-2.5 whitespace-pre-wrap break-words">{props.adli || "—"}</p>
        </div>
      )}
      {props.adsiz !== null && (
        <div className="border-t border-cizgi pt-2">
          <p className="mb-1 text-xs font-semibold text-soluk">İşletme adı girilmemiş kayıtta</p>
          <p className="text-ufak whitespace-pre-wrap break-words text-metin-ikincil">{props.adsiz || "—"}</p>
        </div>
      )}
    </figure>
  );
}
