// Alıcı kuralları — TEK fonksiyon. Kampanya özeti, kampanya oluşturma (kuyruğa ekleme), işçinin her mesajdan
// hemen önceki kontrolü ve WhatsApp günlük listesi bunu çağırır. Günlük sınır burada değil, sayaçtadır.
//
// Kurallar (sırayla):
//  1. ileti_izni = 'ret'                         → hariç ("ret")
//  2. alici_turu = 'bireysel' ve izin 'onayli' değil → hariç ("bireysel_izinsiz")
//  3. Adres: e-posta yalnızca kaydın eposta alanı; telefon önce ek_telefon, yoksa gönderim anında canlı
//     Places detayı (çağıran çözer ve placesTelefonu ile tekrar sorar; yalnızca place_id olan Google kayıtları).
//     Adres yoksa "iletisim_yok".
//  4. SMS / WhatsApp: cep telefonu değilse "cep_degil".
//  5. Adres engel listesindeyse "engel".
//
// WhatsApp (Cloud API, kanal "whatsapp_api") — Places'a HİÇ gidilmez:
//  1. ileti_izni = 'ret' ya da WhatsApp izni 'ret'      → "ret"
//  2. WhatsApp izni 'var' değil                           → "whatsapp_izni_yok" (Meta politikası: her alıcıda onay)
//  3. bireysel ve İYS beyanı yok                          → "iys_beyani_yok" (tacir/esnafta WhatsApp izni yeterli)
//  4. Son 90 günde (WHATSAPP_YOK_GUN) "WhatsApp yok" bildirilmiş  → "whatsapp_yok"
//  5. Adres: ek_telefon (cep olmalı → "cep_degil"); telefon yoksa BSUID; ikisi de yoksa "iletisim_yok"
//  6. Telefon ya da BSUID engel listesindeyse            → "engel"
import "server-only";
import type { EngelTuru, HaricNedeni, Kanal, WhatsappIzni } from "@/lib/mesajlasma";
import type { Kayit } from "../repo/kayitlar";
import { cepMi, epostaNormallestir, telefonNormallestir } from "./adres";

export type AliciKanali = Kanal | "whatsapp" | "whatsapp_api";
/** Kaydın WhatsApp bilgisi (whatsapp_kisileri); satır yoksa null = izin 'yok'. */
export type AliciWhatsappBilgisi = {
  izin: WhatsappIzni;
  iysBeyanTarihi: Date | null;
  whatsappYokTarihi: Date | null;
  bsuid: string | null;
};
export type AliciKaydi = Pick<Kayit, "iletiIzni" | "aliciTuru" | "eposta" | "ekTelefon" | "placeId"> & {
  /** Yalnızca "whatsapp_api" kanalında kullanılır. */
  whatsapp?: AliciWhatsappBilgisi | null;
};

/** Meta "alıcıda WhatsApp yok" bildirdikten sonra bu süre boyunca tekrar denenmez. */
export const WHATSAPP_YOK_GUN = 90;

export type AliciKarari =
  | { uygun: true; adres: string; kaynak: "kayit" | "places" }
  /** Yalnızca whatsapp_api: telefonu bilinmeyen kişi, adres = BSUID. */
  | { uygun: true; adres: string; kaynak: "bsuid" }
  /** Telefon kayıtta yok; gönderim anında Places'tan alınacak (kota birimi düşer). */
  | { uygun: true; adres: null; kaynak: "places"; placeId: string }
  | { uygun: false; neden: HaricNedeni };

/** (tür, normal adres) engel listesinde mi? Çağıran, kiracının engel özetleriyle sağlar. */
export type EngelSorgusu = (tur: EngelTuru, normalAdres: string) => boolean;

export function aliciDegerlendir(
  kayit: AliciKaydi,
  kanal: AliciKanali,
  engelli: EngelSorgusu,
  secenek: { placesTelefonu?: string | null; simdi?: Date } = {},
): AliciKarari {
  if (kayit.iletiIzni === "ret") return { uygun: false, neden: "ret" };
  if (kanal === "whatsapp_api") return whatsappApiDegerlendir(kayit, engelli, secenek.simdi ?? new Date());
  if (kayit.aliciTuru === "bireysel" && kayit.iletiIzni !== "onayli") return { uygun: false, neden: "bireysel_izinsiz" };

  if (kanal === "eposta") {
    const eposta = epostaNormallestir(kayit.eposta);
    if (!eposta) return { uygun: false, neden: "iletisim_yok" };
    if (engelli("eposta", eposta)) return { uygun: false, neden: "engel" };
    return { uygun: true, adres: eposta, kaynak: "kayit" };
  }

  let telefon: string | null;
  let kaynak: "kayit" | "places";
  if (kayit.ekTelefon?.trim()) {
    telefon = telefonNormallestir(kayit.ekTelefon);
    kaynak = "kayit";
    if (!telefon) return { uygun: false, neden: "cep_degil" }; // tanınmayan numara
  } else {
    // Google dışı kayıtta (içe aktarma, elle, reklam) Places yoktur: telefon yalnızca kayıttan.
    if (!kayit.placeId) return { uygun: false, neden: "iletisim_yok" };
    if (secenek.placesTelefonu === undefined) return { uygun: true, adres: null, kaynak: "places", placeId: kayit.placeId };
    if (secenek.placesTelefonu === null) return { uygun: false, neden: "iletisim_yok" };
    telefon = telefonNormallestir(secenek.placesTelefonu);
    kaynak = "places";
    if (!telefon) return { uygun: false, neden: "cep_degil" };
  }
  if (!cepMi(telefon)) return { uygun: false, neden: "cep_degil" };
  if (engelli("telefon", telefon)) return { uygun: false, neden: "engel" };
  return { uygun: true, adres: telefon, kaynak };
}

function whatsappApiDegerlendir(kayit: AliciKaydi, engelli: EngelSorgusu, simdi: Date): AliciKarari {
  const wa = kayit.whatsapp ?? null;
  if (wa?.izin === "ret") return { uygun: false, neden: "ret" };
  if (wa?.izin !== "var") return { uygun: false, neden: "whatsapp_izni_yok" };
  if (kayit.aliciTuru === "bireysel" && !wa.iysBeyanTarihi) return { uygun: false, neden: "iys_beyani_yok" };
  if (wa.whatsappYokTarihi && simdi.getTime() - wa.whatsappYokTarihi.getTime() < WHATSAPP_YOK_GUN * 86_400_000) {
    return { uygun: false, neden: "whatsapp_yok" };
  }
  if (wa.bsuid && engelli("wa_kimlik", wa.bsuid)) return { uygun: false, neden: "engel" };
  if (kayit.ekTelefon?.trim()) {
    const telefon = telefonNormallestir(kayit.ekTelefon);
    if (!cepMi(telefon)) return { uygun: false, neden: "cep_degil" };
    if (engelli("telefon", telefon)) return { uygun: false, neden: "engel" };
    return { uygun: true, adres: telefon, kaynak: "kayit" };
  }
  if (wa.bsuid) return { uygun: true, adres: wa.bsuid, kaynak: "bsuid" };
  return { uygun: false, neden: "iletisim_yok" };
}
