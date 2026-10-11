// Alıcı kuralları — TEK fonksiyon. Kampanya özeti, kampanya oluşturma (kuyruğa ekleme), işçinin her mesajdan
// hemen önceki kontrolü ve WhatsApp günlük listesi bunu çağırır. Günlük sınır burada değil, sayaçtadır.
//
// Kurallar (sırayla):
//  1. ileti_izni = 'ret'                         → hariç ("ret")
//  2. alici_turu = 'bireysel' ve izin 'onayli' değil → hariç ("bireysel_izinsiz")
//  3. Adres: e-posta yalnızca kaydın eposta alanı; telefon önce ek_telefon, yoksa gönderim anında canlı
//     Places detayı (çağıran çözer ve placesTelefonu ile tekrar sorar). Adres yoksa "iletisim_yok".
//  4. SMS / WhatsApp: cep telefonu değilse "cep_degil".
//  5. Adres engel listesindeyse "engel".
import "server-only";
import type { EngelTuru, HaricNedeni, Kanal } from "@/lib/mesajlasma";
import type { Kayit } from "../repo/kayitlar";
import { cepMi, epostaNormallestir, telefonNormallestir } from "./adres";

export type AliciKanali = Kanal | "whatsapp";
export type AliciKaydi = Pick<Kayit, "iletiIzni" | "aliciTuru" | "eposta" | "ekTelefon">;

export type AliciKarari =
  | { uygun: true; adres: string; kaynak: "kayit" | "places" }
  /** Telefon kayıtta yok; gönderim anında Places'tan alınacak (kota birimi düşer). */
  | { uygun: true; adres: null; kaynak: "places" }
  | { uygun: false; neden: HaricNedeni };

/** (tür, normal adres) engel listesinde mi? Çağıran, kiracının engel özetleriyle sağlar. */
export type EngelSorgusu = (tur: EngelTuru, normalAdres: string) => boolean;

export function aliciDegerlendir(
  kayit: AliciKaydi,
  kanal: AliciKanali,
  engelli: EngelSorgusu,
  secenek: { placesTelefonu?: string | null } = {},
): AliciKarari {
  if (kayit.iletiIzni === "ret") return { uygun: false, neden: "ret" };
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
    if (secenek.placesTelefonu === undefined) return { uygun: true, adres: null, kaynak: "places" };
    if (secenek.placesTelefonu === null) return { uygun: false, neden: "iletisim_yok" };
    telefon = telefonNormallestir(secenek.placesTelefonu);
    kaynak = "places";
    if (!telefon) return { uygun: false, neden: "cep_degil" };
  }
  if (!cepMi(telefon)) return { uygun: false, neden: "cep_degil" };
  if (engelli("telefon", telefon)) return { uygun: false, neden: "engel" };
  return { uygun: true, adres: telefon, kaynak };
}
