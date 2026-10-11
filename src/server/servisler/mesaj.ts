// Gönderilecek iletinin oluşturulması: şablon ({isletme} yalnızca kullanıcının girdiği addan), gönderen
// altbilgisi ve ret yolu. E-postada tek tıkla abonelikten çıkma bağlantısı ve RFC 8058 başlıkları.
import type { AliciTuru, Kanal } from "@/lib/mesajlasma";
import { sablonDoldur, smsAltbilgisi, smsRetYolu } from "@/lib/sablon";
import type { Kampanya } from "../repo/kampanyalar";
import { abonelikBaglantisi, abonelikBelirteciUret, abonelikPostAdresi } from "../messaging/abonelik-belirteci";
import { adresOzeti } from "../messaging/adres";
import type { Ileti } from "../messaging/saglayici";
import type { IletiAyarlari } from "../repo/ileti-ayarlari";

const htmlKacir = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function epostaAltbilgisi(ayar: IletiAyarlari, baglanti: string): string {
  return [
    "--",
    ayar.gonderenUnvani?.trim() || "(gönderen unvanı girilmemiş)",
    ayar.iletisimBilgisi?.trim(),
    ayar.iysNo?.trim() ? `İYS No: ${ayar.iysNo.trim()}` : null,
    `Bu iletileri almak istemiyorsanız: ${baglanti}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function iletiOlustur(girdi: {
  ctx: { tenantId: string };
  kanal: Kanal;
  kampanya: Pick<Kampanya, "sablon" | "konu" | "bosIsimHitabi">;
  kayit: { id: string; isletmeAdi: string | null; aliciTuru: AliciTuru };
  adres: string;
  ayar: IletiAyarlari;
}): Ileti {
  const { ctx, kanal, kampanya, kayit, adres, ayar } = girdi;
  const belirtec = abonelikBelirteciUret({
    tenantId: ctx.tenantId,
    leadId: kayit.id,
    kanal,
    adresOzeti: adresOzeti(ctx.tenantId, kanal === "eposta" ? "eposta" : "telefon", adres),
  });
  const baglanti = abonelikBaglantisi(belirtec);
  const govde = sablonDoldur(kampanya.sablon, kayit.isletmeAdi, kampanya.bosIsimHitabi);
  const ortak = {
    kanal,
    alici: adres,
    aboneliktenCikmaBaglantisi: baglanti,
    aliciTuru: kayit.aliciTuru,
    gonderenAdi: ayar.gonderenUnvani?.trim() || undefined,
  };
  if (kanal === "sms") {
    // SMS'te bağlantı yerine ret yolu: "RET yazıp <numara>" (gelen yanıt webhook'la ret akışına girer).
    return { ...ortak, aboneliktenCikmaBaglantisi: smsRetYolu(ayar.smsRetNumarasi), metin: `${govde}
${smsAltbilgisi(ayar)}` };
  }
  const altbilgi = epostaAltbilgisi(ayar, baglanti);
  const metin = `${govde}\n\n${altbilgi}`;
  const html =
    `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${htmlKacir(govde).replace(/\n/g, "<br>")}</div>` +
    `<hr style="border:0;border-top:1px solid #ddd;margin:24px 0 12px">` +
    `<div style="font-family:sans-serif;font-size:12px;color:#666;line-height:1.5">` +
    htmlKacir(altbilgi.replace(/^--\n/, "").replace(/\nBu iletileri almak istemiyorsanız: .*$/, "")).replace(/\n/g, "<br>") +
    `<br><a href="${htmlKacir(baglanti)}">Abonelikten çık</a></div>`;
  return {
    ...ortak,
    konu: kampanya.konu ?? "",
    metin,
    html,
    basliklar: {
      "List-Unsubscribe": `<${abonelikPostAdresi(belirtec)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
