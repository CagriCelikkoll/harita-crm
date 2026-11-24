// Kayıtlar süzgecinin adres (URL) biçimi: Kayıtlar sayfası ve CSV dışa aktarma aynı ayrıştırıcıyı kullanır.
// grup: ilgi | incelenmemis | tum (sekme), durum, izin, kaynak, wa_izin, etiket, q (arama), ad=bos (adı girilmemiş
// Google kayıtları), inceleme (eski bağlantılar ve sekme verilmediğinde), sira (son | ad), boyut (50 | 100 | 200), sayfa.
import { WHATSAPP_IZINLERI, WHATSAPP_IZNI_ADLARI, type WhatsappIzni } from "./mesajlasma";
import {
  ILETI_IZINLERI,
  ILETI_IZNI_ADLARI,
  KAYIT_DURUM_ADLARI,
  KAYIT_KAYNAK_ADLARI,
  INCELEME_DURUMLARI,
  KAYIT_DURUMLARI,
  KAYIT_SAYFA_BOYUTLARI,
  KAYIT_SIRALARI,
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
    sira: al("sira") === "ad" ? "ad" : undefined,
    boyut: KAYIT_SAYFA_BOYUTLARI.find((b) => b !== KAYIT_SAYFA_BOYUTLARI[0] && String(b) === al("boyut")),
  };
}

/** Süzgecin adres sorgusu (sayfa hariç; sıra ve boyut varsayılandan farklıysa dahil). `grup` verilirse onunla değiştirilir. */
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
    sira: f.sira && f.sira !== KAYIT_SIRALARI[0] ? f.sira : undefined,
    boyut: f.boyut && f.boyut !== KAYIT_SAYFA_BOYUTLARI[0] ? String(f.boyut) : undefined,
  })) {
    if (v) s.set(k, v);
  }
  return s;
}

/** Toplu işlemde "filtreye uyan tümü": yalnızca süzgeç (sayfa, sıra, boyut yok sayılır). */
export function topluSuzgec(f: KayitFiltresi): Omit<KayitFiltresi, "sayfa" | "sira" | "boyut"> {
  const kopya = { ...f };
  delete kopya.sayfa;
  delete kopya.sira;
  delete kopya.boyut;
  return kopya;
}

/** Filtreler panelinde seçili süzgeç sayısı (düğmedeki rozet). */
export const etkinSuzgecSayisi = (f: KayitFiltresi) =>
  [f.durum, f.iletiIzni, f.kaynak, f.whatsappIzni, f.etiket, f.adsizGoogle].filter(Boolean).length;

/** Etkin süzgeçlerin okunur hâli ("Etiket = parti-1"): listenin üstündeki "Filtre aktif" şeridi. */
export function etkinSuzgecEtiketleri(f: KayitFiltresi): string[] {
  return [
    f.durum && `Durum = ${KAYIT_DURUM_ADLARI[f.durum]}`,
    f.iletiIzni && `İleti izni = ${ILETI_IZNI_ADLARI[f.iletiIzni]}`,
    f.kaynak && `Kaynak = ${KAYIT_KAYNAK_ADLARI[f.kaynak]}`,
    f.whatsappIzni && `WhatsApp izni = ${WHATSAPP_IZNI_ADLARI[f.whatsappIzni]}`,
    f.etiket && `Etiket = ${f.etiket}`,
    f.adsizGoogle && "Yalnızca adı girilmemiş Google kayıtları",
  ].filter((x): x is string => !!x);
}
