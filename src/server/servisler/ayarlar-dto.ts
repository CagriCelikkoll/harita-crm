// Mesajlaşma ayarlarının istemciye giden biçimi. Sağlayıcı kimlik bilgileri YOKTUR: yalnızca "tanımlı mı".
import { KANALLAR, type Kanal } from "@/lib/mesajlasma";
import type { TenantContext } from "../repo/baglam";
import { iletiAyarlariGetir } from "../repo/ileti-ayarlari";
import { saglayiciDurumlari } from "../repo/saglayicilar";
import { gunlukSinir, ticariIletiEksikleri } from "./ileti";

export type MesajlasmaAyarlariDto = {
  gonderenUnvani: string | null;
  iletisimBilgisi: string | null;
  iysNo: string | null;
  sorumlulukOnayi: boolean;
  sorumlulukOnayTarihi: string | null;
  gonderimBaslangicDk: number;
  gonderimBitisDk: number;
  gunlukSinirlar: Record<Kanal, number>;
  saglayicilar: Record<Kanal, { tanimli: boolean; saglayici: string | null; guncellemeTarihi: string | null }>;
  eksikAyarlar: string[];
};

export function mesajlasmaAyarlariDto(ctx: TenantContext): MesajlasmaAyarlariDto {
  const a = iletiAyarlariGetir(ctx);
  const s = saglayiciDurumlari(ctx);
  return {
    gonderenUnvani: a.gonderenUnvani,
    iletisimBilgisi: a.iletisimBilgisi,
    iysNo: a.iysNo,
    sorumlulukOnayi: Boolean(a.sorumlulukOnayTarihi),
    sorumlulukOnayTarihi: a.sorumlulukOnayTarihi?.toISOString() ?? null,
    gonderimBaslangicDk: a.gonderimBaslangicDk,
    gonderimBitisDk: a.gonderimBitisDk,
    gunlukSinirlar: Object.fromEntries(KANALLAR.map((k) => [k, gunlukSinir(a, k)])) as Record<Kanal, number>,
    saglayicilar: Object.fromEntries(
      KANALLAR.map((k) => [
        k,
        { tanimli: s[k].tanimli, saglayici: s[k].saglayici, guncellemeTarihi: s[k].guncellemeTarihi?.toISOString() ?? null },
      ]),
    ) as MesajlasmaAyarlariDto["saglayicilar"],
    eksikAyarlar: ticariIletiEksikleri(a),
  };
}
