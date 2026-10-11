// İşlemsel e-posta (davet vb.). 1. aşamada yalnızca konsol adaptörü vardır: e-posta gönderilmez,
// sunucu günlüğüne yazılır; davet bağlantısı Ayarlar ekranında da gösterilir.
// Gerçek gönderim için (SMTP, Resend, SES…) bu arayüzü uygulayan bir adaptör eklenip
// postaciAl() içinde seçilmelidir.
export type Eposta = { kime: string; konu: string; metin: string };

export interface Postaci {
  readonly ad: string;
  gonder(eposta: Eposta): Promise<void>;
}

const konsolPostaci: Postaci = {
  ad: "konsol",
  async gonder(e) {
    console.info(`[e-posta:konsol] Kime: ${e.kime}\nKonu: ${e.konu}\n\n${e.metin}\n`);
  },
};

export function postaciAl(): Postaci {
  return konsolPostaci;
}
