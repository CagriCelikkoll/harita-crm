// Kayıt ve olayların istemciye giden JSON biçimi. Yalnızca kullanıcı verisi + place_id içerir.
import type { Kayit } from "../repo/kayitlar";
import type { olaylariListele } from "../repo/olaylar";

export type KayitDto = {
  id: string;
  kaynak: Kayit["kaynak"];
  /** Yalnızca 'google' kayıtlarında. */
  placeId: string | null;
  durum: Kayit["durum"];
  iletiIzni: Kayit["iletiIzni"];
  isletmeAdi: string | null;
  aliciTuru: Kayit["aliciTuru"];
  yetkiliAdi: string | null;
  eposta: string | null;
  ekTelefon: string | null;
  notlar: string | null;
  etiketler: string[];
  guncellemeTarihi: string;
};

export type OlayDto = {
  id: string;
  tur: ReturnType<typeof olaylariListele>[number]["tur"];
  aciklama: string | null;
  sistem: boolean;
  tarih: string;
  kullaniciId: string | null;
  kullaniciAdi: string | null;
};

export const kayitDto = (k: Kayit): KayitDto => ({
  id: k.id,
  kaynak: k.kaynak,
  placeId: k.placeId,
  durum: k.durum,
  iletiIzni: k.iletiIzni,
  isletmeAdi: k.isletmeAdi,
  aliciTuru: k.aliciTuru,
  yetkiliAdi: k.yetkiliAdi,
  eposta: k.eposta,
  ekTelefon: k.ekTelefon,
  notlar: k.notlar,
  etiketler: k.etiketler,
  guncellemeTarihi: k.guncellemeTarihi.toISOString(),
});

export const olayDto = (o: ReturnType<typeof olaylariListele>[number]): OlayDto => ({
  ...o,
  tarih: o.tarih.toISOString(),
});
