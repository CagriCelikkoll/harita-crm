// Panel > "Sıradaki işler": kullanıcının bugün nereden devam edeceği (saf; test edilebilir). Sıra önem sırasıdır:
// önce yöneticinin engelleyici uyarıları, sonra günlük işler.
export type SiradakiIs = { metin: string; aciklama: string; href: string; eylem: string; ton: "normal" | "uyari" | "tehlike" };

export function siradakiIsler(d: {
  yonetici: boolean;
  incelenmemis: number;
  waBekleyen: number;
  gonderimdekiKampanya: number;
  /** Kuyrukta mesaj varken gönderim servisi (işçi) çalışmıyor. */
  isciUyari: boolean;
  /** Gerçek gönderim için eksik gönderen bilgileri. */
  eksikAyarlar: string[];
  /** WhatsApp (Meta) bağlı ama test modu açık. */
  waTestModu: boolean;
}): SiradakiIs[] {
  const isler: SiradakiIs[] = [];
  if (d.yonetici && d.isciUyari) {
    isler.push({
      metin: "Gönderim servisi çalışmıyor",
      aciklama: "Kuyruktaki kampanya mesajları gönderilmiyor.",
      href: "/kampanyalar",
      eylem: "Kampanyalar",
      ton: "tehlike",
    });
  }
  if (d.yonetici && d.eksikAyarlar.length) {
    isler.push({
      metin: "Gönderen bilgileri eksik",
      aciklama: `Gerçek gönderim için: ${d.eksikAyarlar.join(", ")}.`,
      href: "/ayarlar/gonderen",
      eylem: "Tamamla",
      ton: "uyari",
    });
  }
  if (d.incelenmemis > 0) {
    isler.push({
      metin: `${d.incelenmemis.toLocaleString("tr")} incelenmemiş tarama sonucu`,
      aciklama: "İlgilendiklerinizi kayıtlarınıza ekleyin, diğerlerini geçin.",
      href: "/kayitlar?grup=incelenmemis",
      eylem: "İncele",
      ton: "normal",
    });
  }
  if (d.waBekleyen > 0) {
    isler.push({
      metin: `WhatsApp günlük listenizde ${d.waBekleyen.toLocaleString("tr")} kişi sırada`,
      aciklama: "Kendi WhatsApp'ınızdan gönderip sonucu işaretleyin.",
      href: "/kampanyalar?sekme=whatsapp",
      eylem: "Listeye git",
      ton: "normal",
    });
  }
  if (d.gonderimdekiKampanya > 0) {
    isler.push({
      metin: `${d.gonderimdekiKampanya.toLocaleString("tr")} kampanya gönderimde`,
      aciklama: "İlerlemeyi ve hariç tutulanları kampanya ayrıntısında görün.",
      href: "/kampanyalar",
      eylem: "Kampanyalar",
      ton: "normal",
    });
  }
  if (d.yonetici && d.waTestModu) {
    isler.push({
      metin: "WhatsApp test modunda",
      aciklama: "Kampanyalar yalnızca test numaralarına gider; kurulum adımlarını tamamlayın.",
      href: "/ayarlar/whatsapp",
      eylem: "Kurulum",
      ton: "normal",
    });
  }
  return isler;
}
