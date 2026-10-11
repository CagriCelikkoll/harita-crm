// 2. AŞAMA İÇİN İSKELET — 1. aşamada arayüze bağlı değildir.
//
// Toplu SMS / e-posta gönderimi bu arayüz üzerinden yapılacak:
//  - Gönderim yalnızca MessageProvider uygulamaları üzerinden yapılır; ilk adaptör "sandbox"
//    (gerçek gönderim yok, yalnızca kaydeder).
//  - İleti reddi (ileti_izni = 'ret') işaretli kayıtlar HER ZAMAN hariç tutulur: uygunAlicilar().
//  - Her iletiye ret seçeneği eklenir; e-postada tek tıkla abonelikten çıkma bağlantısı olur
//    (aboneliktenCikmaBaglantisi alanı zorunlu tutulmuştur).
//  - Her gönderim lead_events'e "sms" / "eposta" olarak yazılacak.
import type { IletiIzni } from "@/lib/sabitler";

export type Kanal = "sms" | "eposta";

export type Ileti = {
  kanal: Kanal;
  kayitId: string;
  alici: string; // telefon veya e-posta
  konu?: string;
  govde: string;
  /** Tek tıkla abonelikten çıkma / ret bağlantısı. Zorunlu: bağlantısız ileti gönderilemez. */
  aboneliktenCikmaBaglantisi: string;
};

export type GonderimSonucu = { kayitId: string; durum: "gonderildi" | "kaydedildi" | "hata"; saglayiciKimligi?: string; hata?: string };

export interface MessageProvider {
  readonly ad: string;
  readonly kanallar: readonly Kanal[];
  gonder(ileti: Ileti): Promise<GonderimSonucu>;
}

/** Gerçek gönderim yapmaz; iletiyi bellekte kaydeder (geliştirme ve test için). */
export class SandboxSaglayici implements MessageProvider {
  readonly ad = "sandbox";
  readonly kanallar = ["sms", "eposta"] as const;
  readonly kayit: Ileti[] = [];

  async gonder(ileti: Ileti): Promise<GonderimSonucu> {
    if (!ileti.aboneliktenCikmaBaglantisi) {
      return { kayitId: ileti.kayitId, durum: "hata", hata: "Abonelikten çıkma bağlantısı zorunlu." };
    }
    this.kayit.push(ileti);
    return { kayitId: ileti.kayitId, durum: "kaydedildi", saglayiciKimligi: `sandbox-${this.kayit.length}` };
  }
}

/** Ret işaretli kayıtları her zaman çıkarır. Toplu gönderimin tek giriş kapısı olmalıdır. */
export function uygunAlicilar<T extends { iletiIzni: IletiIzni }>(kayitlar: T[]): T[] {
  return kayitlar.filter((k) => k.iletiIzni !== "ret");
}
