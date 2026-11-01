// Kayıtlar süzgecinin adres (URL) biçimi: Kayıtlar sayfası ve CSV dışa aktarma aynı ayrıştırıcıyı kullanır.
// grup: ilgi | incelenmemis | tum (sekme), durum, izin, kaynak, wa_izin, etiket, q (arama), ad=bos (adı girilmemiş
// Google kayıtları), inceleme (eski bağlantılar ve sekme verilmediğinde), sayfa.
import { WHATSAPP_IZINLERI, type WhatsappIzni } from "./mesajlasma";
import {
  ILETI_IZINLERI,
  INCELEME_DURUMLARI,
  KAYIT_DURUMLARI,
  KAYIT_GRUPLARI,
  KAYIT_KAYNAKLARI,
  type IletiIzni,
  type IncelemeDurumu,
  type KayitDurumu,
  type KayitGrubu,
  type KayitKaynagi,
} from "./sabitler";
import type { KayitFiltresi } from "@/server/repo/kayitlar";

const bul = <T extends string>(liste: readonly T[], d: string | undefined) => liste.find((x) => x === d);

/**
 * `al`: parametre okuyucu. `varsayilanGrup` verilirse adreste sekme yoksa o sekme uygulanır (Kayıtlar ekranı);
 * verilmezse sekme yalnızca adreste açıkça varsa uygulanır (CSV: parametresiz çağrıda bütün ilgili kayıtlar).
 */
export function kayitFiltresiCoz(al: (ad: string) => string | undefined, varsayilanGrup?: KayitGrubu): KayitFiltresi {
  const inceleme = al("inceleme");
  const grup = bul(KAYIT_GRUPLARI, al("grup")) ?? (inceleme ? undefined : varsayilanGrup);
  return {
    sayfa: Number(al("sayfa")) || 1,
    grup,
    durum: bul(KAYIT_DURUMLARI, al("durum")) as KayitDurumu | undefined,
    iletiIzni: bul(ILETI_IZINLERI, al("izin")) as IletiIzni | undefined,
    kaynak: bul(KAYIT_KAYNAKLARI, al("kaynak")) as KayitKaynagi | undefined,
    whatsappIzni: bul(WHATSAPP_IZINLERI, al("wa_izin")) as WhatsappIzni | undefined,
    etiket: al("etiket") || undefined,
    arama: al("q")?.trim() || undefined,
    inceleme: grup ? undefined : inceleme === "hepsi" ? "hepsi" : (bul(INCELEME_DURUMLARI, inceleme) as IncelemeDurumu | undefined),
    adsizGoogle: al("ad") === "bos" || undefined,
  };
}

/** Süzgecin adres sorgusu (sayfa hariç). `grup` verilirse onunla değiştirilir. */
export function kayitSorgusu(f: KayitFiltresi, degisiklik: { grup?: KayitGrubu } = {}): URLSearchParams {
  const s = new URLSearchParams();
  const grup = degisiklik.grup ?? f.grup;
  for (const [k, v] of Object.entries({
    grup,
    durum: f.durum,
    izin: f.iletiIzni,
    kaynak: f.kaynak,
    wa_izin: f.whatsappIzni,
    etiket: f.etiket,
    q: f.arama,
    inceleme: grup ? undefined : f.inceleme,
    ad: f.adsizGoogle ? "bos" : undefined,
  })) {
    if (v) s.set(k, v);
  }
  return s;
}

/** Filtreler panelinde seçili süzgeç sayısı (düğmedeki rozet). */
export const etkinSuzgecSayisi = (f: KayitFiltresi) =>
  [f.durum, f.iletiIzni, f.kaynak, f.whatsappIzni, f.etiket, f.adsizGoogle].filter(Boolean).length;
