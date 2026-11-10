// npm run demo:webhook için saf yardımcılar: komut satırı ayrıştırma, sahte Meta bildirim gövdeleri ve imza.
// Veritabanına ya da ağa dokunmaz; testler de aynı gövdeleri gerçek webhook koduna verir.
import { createHmac, randomBytes } from "node:crypto";
import { cepMi, telefonNormallestir } from "../src/lib/adres-normal";

export const TESLIM_ADIMLARI = ["sent", "delivered", "read"] as const;
export type TeslimAdimi = (typeof TESLIM_ADIMLARI)[number];

export type Hesap = { wabaId: string; phoneNumberId: string };

export type Komut =
  | { komut: "dogrula" }
  /** hedef: "son", "kampanya" ya da wamid. */
  | { komut: "durum"; hedef: string; kadar: TeslimAdimi }
  | { komut: "ret" | "buton"; telefon: string };

export const KULLANIM = `Kullanım (npm run demo açıkken):
  npm run demo:webhook -- dogrula
      Meta'nın "Verify and save" isteği: bildirim adresi doğrulanır.
  npm run demo:webhook -- durum [son | kampanya | <wamid>] [--kadar sent|delivered|read]
      Teslim bildirimleri: sent → delivered → read. Varsayılan: son gönderilen mesaj, read'e kadar.
      "kampanya": son kampanyanın gönderilen bütün mesajları. "--kadar delivered": Teslim edildi'de durur.
  npm run demo:webhook -- ret <telefon>
      O numaradan "RET" metinli gelen mesaj.
  npm run demo:webhook -- buton <telefon>
      O numaradan abonelikten çıkma hızlı yanıt düğmesine basılmış gibi.`;

/** Komut satırı (npm run demo:webhook -- …). Hatalıysa ekrana yazılacak metin döner. */
export function komutCozumle(argumanlar: string[]): Komut | { hata: string } {
  const [komut, ...kalan] = argumanlar;
  if (komut === "dogrula" && kalan.length === 0) return { komut };
  if (komut === "durum") {
    const i = kalan.indexOf("--kadar");
    let kadar: TeslimAdimi = "read";
    if (i >= 0) {
      const secilen = TESLIM_ADIMLARI.find((a) => a === kalan[i + 1]);
      if (!secilen) return { hata: "--kadar için sent, delivered ya da read yazın." };
      kadar = secilen;
      kalan.splice(i, 2);
    }
    if (kalan.length > 1) return { hata: KULLANIM };
    const hedef = kalan[0] ?? "son";
    if (hedef !== "son" && hedef !== "kampanya" && !hedef.startsWith("wamid.")) {
      return { hata: `"${hedef}" tanınmadı: son, kampanya ya da wamid. ile başlayan kimlik yazın.` };
    }
    return { komut, hedef, kadar };
  }
  if (komut === "ret" || komut === "buton") {
    // Tırnaksız yazılan "0500 000 00 21" ayrı argümanlar olarak gelir.
    const telefon = telefonNormallestir(kalan.join(" "));
    if (!cepMi(telefon)) return { hata: `Cep telefonu numarası gerekli (ör. npm run demo:webhook -- ${komut} 05000000021).` };
    return { komut, telefon };
  }
  return { hata: KULLANIM };
}

/** Meta'nın X-Hub-Signature-256 başlığı: HMAC-SHA256(App Secret, ham gövde). */
export const imzala = (appSecret: string, govde: string) => `sha256=${createHmac("sha256", appSecret).update(govde, "utf8").digest("hex")}`;

const saniye = (t: Date) => String(Math.floor(t.getTime() / 1000));

const zarf = (h: Hesap, value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: h.wabaId,
      changes: [
        {
          field: "messages",
          value: { messaging_product: "whatsapp", metadata: { display_phone_number: "908500000000", phone_number_id: h.phoneNumberId }, ...value },
        },
      ],
    },
  ],
});

export const durumYuku = (h: Hesap, wamid: string, durum: TeslimAdimi, aliciWaId: string | null, simdi = new Date()) =>
  zarf(h, { statuses: [{ id: wamid, status: durum, timestamp: saniye(simdi), ...(aliciWaId ? { recipient_id: aliciWaId } : {}) }] });

const gelenYuku = (h: Hesap, waId: string, mesaj: Record<string, unknown>, simdi: Date) =>
  zarf(h, {
    contacts: [{ profile: { name: "Demo Kişi" }, wa_id: waId }],
    messages: [{ from: waId, id: `wamid.DEMO.GELEN.${randomBytes(9).toString("hex")}`, timestamp: saniye(simdi), ...mesaj }],
  });

export const retYuku = (h: Hesap, waId: string, simdi = new Date()) => gelenYuku(h, waId, { type: "text", text: { body: "RET" } }, simdi);

/** Meta'nın hazır düğmesi gibi: yük anlamsız bir kimlik, abonelikten çıkma yalnızca düğme metninden anlaşılır. */
export const butonYuku = (h: Hesap, waId: string, simdi = new Date()) =>
  gelenYuku(h, waId, { type: "button", button: { payload: `DEMO_QR_${randomBytes(6).toString("hex")}`, text: "Promosyonları durdur" } }, simdi);
