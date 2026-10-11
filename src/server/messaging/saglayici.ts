// Mesaj sağlayıcısı arayüzü. TÜM gönderimler bir MessageProvider üzerinden yapılır.
//
// - Her kanal için varsayılan "sandbox"tır: gerçek gönderim yapmaz, iletiyi kaydeder (işçi metni kuyruk
//   satırına yazar). Gerçek adaptör (SMTP, Netgsm) yalnızca çalışma alanı kendi sağlayıcı bilgilerini
//   girdiğinde devreye girer: servisler/saglayici.ts → saglayiciAl().
// - Abonelikten çıkma / ret bağlantısı zorunludur: bağlantısız ileti gönderilmez.
// - Alıcı kuralları (ret, engel listesi, bireysel + izinsiz) gönderimden hemen önce işçide uygulanır:
//   messaging/alici-kurallari.ts → aliciDegerlendir().
import "server-only";
import type { AliciTuru, Kanal } from "@/lib/mesajlasma";

export type { Kanal };

export type Ileti = {
  kanal: Kanal;
  /** Normalleştirilmiş adres: e-posta ya da 90XXXXXXXXXX. */
  alici: string;
  konu?: string;
  /** Düz metin gövde; altbilgi (gönderen, ret yolu) dahil. */
  metin: string;
  html?: string;
  gonderenAdi?: string;
  basliklar?: Record<string, string>;
  /** Tek tıkla abonelikten çıkma / ret bağlantısı. Zorunlu. */
  aboneliktenCikmaBaglantisi: string;
  /** SMS'te İYS süzgeci (tacir / bireysel) için. */
  aliciTuru: AliciTuru;
};

export type GonderimSonucu =
  | { durum: "gonderildi"; saglayiciKimligi?: string }
  /** İletinin GİTMEDİĞİ kesin olan geçici hata (bağlantı kurulamadı, SMTP 4xx…): sınırlı yeniden deneme. */
  | { durum: "gecici_hata"; hata: string }
  /**
   * Kalıcı hata: yeniden denenmez. ret: alıcı İYS'de ret vermiş. belirsiz: iletinin gidip gitmediği
   * bilinmiyor (bağlantı yarıda kesildi) — günlük sınırdan düşülmez.
   */
  | { durum: "kalici_hata"; hata: string; ret?: boolean; belirsiz?: boolean };

export interface MessageProvider {
  readonly ad: string;
  readonly kanal: Kanal;
  /** true ise gerçek gönderim yapılmaz. */
  readonly sandbox: boolean;
  gonder(ileti: Ileti): Promise<GonderimSonucu>;
}

/** Gerçek gönderim yapmaz; iletiyi kaydeder. Sağlayıcısı tanımlı olmayan kanalların varsayılanı. */
export class SandboxSaglayici implements MessageProvider {
  readonly ad = "sandbox";
  readonly sandbox = true;
  readonly kayit: Ileti[] = [];

  constructor(readonly kanal: Kanal) {}

  async gonder(ileti: Ileti): Promise<GonderimSonucu> {
    if (!ileti.aboneliktenCikmaBaglantisi) {
      return { durum: "kalici_hata", hata: "Abonelikten çıkma bağlantısı zorunlu." };
    }
    this.kayit.push(ileti);
    return { durum: "gonderildi", saglayiciKimligi: `sandbox-${crypto.randomUUID()}` };
  }
}
