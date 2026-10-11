// Genel SMTP adaptörü (nodemailer). Çalışma alanının kendi SMTP sunucusu üzerinden gönderir; gönderen her
// zaman çalışma alanıdır. Her gönderimden önce sunucu adı yeniden çözülür ve doğrulanır (ag-guvenligi.ts);
// bağlantı doğrulanan IP'ye yapılır, TLS sertifikası sunucu adına göre denetlenir.
import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { smtpHedefiDogrula, SmtpHedefHatasi, type Cozucu, type DogrulanmisHedef } from "./ag-guvenligi";
import type { GonderimSonucu, Ileti, MessageProvider } from "./saglayici";

export type SmtpBilgileri = {
  sunucu: string;
  port: number;
  kullanici: string;
  sifre: string;
  /** Gönderen adresi (From). Test e-postaları da yalnızca bu adrese gider. */
  gonderen: string;
};

export type SmtpSecenekleri = {
  cozucu?: Cozucu;
  /** Testler için: doğrulanmış hedefle taşıyıcı üretir. */
  tasiyiciOlustur?: (hedef: DogrulanmisHedef, bilgi: SmtpBilgileri) => Transporter;
};

function varsayilanTasiyici(hedef: DogrulanmisHedef, b: SmtpBilgileri): Transporter {
  return nodemailer.createTransport({
    host: hedef.ip, // doğrulanmış IP: DNS yeniden bağlamaya karşı
    port: hedef.port,
    secure: hedef.port === 465,
    requireTLS: hedef.port === 587,
    auth: { user: b.kullanici, pass: b.sifre },
    tls: { servername: hedef.sunucuAdi, minVersion: "TLSv1.2" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

type SmtpHatasi = Error & { code?: string; command?: string; responseCode?: number };

/** Hata sınıflandırması: yalnızca iletinin GİTMEDİĞİ kesin olan durumlar geçicidir (yeniden denenir). */
export function smtpHatasiSiniflandir(hata: SmtpHatasi): GonderimSonucu {
  const kod = hata.responseCode;
  if (typeof kod === "number" && kod >= 400 && kod < 500) {
    return { durum: "gecici_hata", hata: `SMTP geçici hata (${kod}).` };
  }
  if (hata.command === "CONN" || hata.code === "ECONNECTION" || hata.code === "EDNS") {
    return { durum: "gecici_hata", hata: "SMTP sunucusuna bağlanılamadı." };
  }
  if (hata.code === "EAUTH") return { durum: "kalici_hata", hata: "SMTP kimlik doğrulaması başarısız." };
  if (typeof kod === "number" && kod >= 500) return { durum: "kalici_hata", hata: `SMTP sunucusu reddetti (${kod}).` };
  return {
    durum: "kalici_hata",
    hata: "Gönderim sonucu belirsiz (bağlantı yarıda kesildi); gönderilmiş olabilir.",
    belirsiz: true,
  };
}

export function smtpSaglayici(bilgi: SmtpBilgileri, secenek: SmtpSecenekleri = {}): MessageProvider {
  return {
    ad: "smtp",
    kanal: "eposta",
    sandbox: false,
    async gonder(ileti: Ileti): Promise<GonderimSonucu> {
      if (!ileti.aboneliktenCikmaBaglantisi) {
        return { durum: "kalici_hata", hata: "Abonelikten çıkma bağlantısı zorunlu." };
      }
      let hedef: DogrulanmisHedef;
      try {
        hedef = await smtpHedefiDogrula(bilgi.sunucu, bilgi.port, secenek.cozucu);
      } catch (hata) {
        if (hata instanceof SmtpHedefHatasi) return { durum: "kalici_hata", hata: hata.message };
        throw hata;
      }
      const tasiyici = (secenek.tasiyiciOlustur ?? varsayilanTasiyici)(hedef, bilgi);
      try {
        const sonuc = await tasiyici.sendMail({
          from: ileti.gonderenAdi ? { name: ileti.gonderenAdi, address: bilgi.gonderen } : bilgi.gonderen,
          to: ileti.alici,
          subject: ileti.konu ?? "",
          text: ileti.metin,
          html: ileti.html,
          headers: ileti.basliklar,
        });
        return { durum: "gonderildi", saglayiciKimligi: sonuc.messageId };
      } catch (hata) {
        return smtpHatasiSiniflandir(hata as SmtpHatasi);
      } finally {
        tasiyici.close();
      }
    },
  };
}
