// Sağlayıcı kimlik bilgileri: doğrulama, şifreleyerek kaydetme, gönderim için çözme, test gönderimi.
// Kimlik bilgileri bu modülden dışarı (API yanıtına) hiçbir zaman çıkmaz.
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { SMTP_IZINLI_PORTLAR, TEST_GONDERIM_SAATLIK_SINIR, type Kanal } from "@/lib/mesajlasma";
import { gunAnahtari, gunIciDakika } from "@/lib/zaman";
import type { TenantContext } from "../repo/baglam";
import { sayacAyir } from "../repo/gonderim-sayaci";
import { iletiAyarlariGetir } from "../repo/ileti-ayarlari";
import { saglayiciKaydet, saglayiciSifreliGetir } from "../repo/saglayicilar";
import { cepMi, telefonNormallestir } from "../messaging/adres";
import { smtpHedefiDogrula, SmtpHedefHatasi, type Cozucu } from "../messaging/ag-guvenligi";
import { hmac, imzaAnahtari } from "../messaging/anahtarlar";
import { netgsmSaglayici, type NetgsmBilgileri, type NetgsmSecenekleri } from "../messaging/netgsm";
import { SandboxSaglayici, type GonderimSonucu, type MessageProvider } from "../messaging/saglayici";
import { coz, sifrele } from "../messaging/sifreleme";
import { smtpSaglayici, type SmtpBilgileri, type SmtpSecenekleri } from "../messaging/smtp";

export class SaglayiciHatasi extends Error {
  constructor(
    mesaj: string,
    readonly durumKodu = 400,
  ) {
    super(mesaj);
    this.name = "SaglayiciHatasi";
  }
}

export const SmtpGirdisi = z
  .object({
    sunucu: z.string().trim().min(1, "SMTP sunucusu gerekli.").max(253),
    port: z.coerce
      .number("Port bir sayı olmalı.")
      .int()
      .refine((p) => (SMTP_IZINLI_PORTLAR as readonly number[]).includes(p), `Port ${SMTP_IZINLI_PORTLAR.join(", ")} olabilir.`),
    kullanici: z.string().trim().min(1, "Kullanıcı adı gerekli.").max(200),
    sifre: z.string().min(1, "Şifre gerekli.").max(500),
    gonderen: z.email("Geçerli bir gönderen e-posta adresi girin.").max(200),
  })
  .strict();

export const NetgsmGirdisi = z
  .object({
    kullanici: z.string().trim().min(1, "Netgsm kullanıcı kodu gerekli.").max(40),
    sifre: z.string().min(1, "API şifresi gerekli.").max(200),
    // Onaylı başlıklar en fazla 11 karakterdir.
    baslik: z
      .string()
      .trim()
      .min(1, "Onaylı SMS başlığı gerekli.")
      .max(11, "SMS başlığı en fazla 11 karakter olabilir."),
  })
  .strict();

/** Test kancaları: DNS çözücü, SMTP taşıyıcısı ve Netgsm HTTP istemcisi. */
export type SaglayiciSecenekleri = { cozucu?: Cozucu; smtp?: SmtpSecenekleri; netgsm?: NetgsmSecenekleri };

/** SMS ret webhook anahtarının veritabanında tutulan özeti. */
export const webhookOzeti = (anahtar: string) => hmac(imzaAnahtari("webhook"), anahtar).toString("hex");

/**
 * Kanalın sağlayıcı bilgilerini doğrular ve şifreleyerek kaydeder. Yalnızca yönetici (repo denetler).
 * SMS'te ilk kayıtta (ya da istenirse) gelen RET yanıtları için yeni bir webhook anahtarı üretilir; anahtar
 * YALNIZCA bu yanıtta bir kez döner (veritabanında özeti tutulur).
 */
export async function saglayiciBilgisiKaydet(
  ctx: TenantContext,
  kanal: Kanal,
  girdi: unknown,
  secenek: SaglayiciSecenekleri & { webhookYenile?: boolean } = {},
): Promise<{ webhookAnahtari?: string }> {
  if (kanal === "eposta") {
    await smtpKaydet(ctx, girdi, secenek);
    return {};
  }
  const sonuc = NetgsmGirdisi.safeParse(girdi);
  if (!sonuc.success) throw new SaglayiciHatasi(sonuc.error.issues[0]?.message ?? "Geçersiz Netgsm bilgisi.");
  const mevcut = saglayiciSifreliGetir(ctx, "sms");
  const yeniAnahtar = !mevcut?.webhookTanimli || secenek.webhookYenile ? randomBytes(24).toString("base64url") : undefined;
  saglayiciKaydet(ctx, "sms", "netgsm", sifrele(sonuc.data, ctx.tenantId, "sms"), yeniAnahtar ? webhookOzeti(yeniAnahtar) : undefined);
  return yeniAnahtar ? { webhookAnahtari: yeniAnahtar } : {};
}

/** SMTP bilgilerini doğrular (port, DNS → herkese açık IP) ve şifreleyerek kaydeder. */
async function smtpKaydet(ctx: TenantContext, girdi: unknown, secenek: SaglayiciSecenekleri) {
  const sonuc = SmtpGirdisi.safeParse(girdi);
  if (!sonuc.success) throw new SaglayiciHatasi(sonuc.error.issues[0]?.message ?? "Geçersiz SMTP bilgisi.");
  const bilgi: SmtpBilgileri = { ...sonuc.data, gonderen: sonuc.data.gonderen.toLowerCase() };
  try {
    await smtpHedefiDogrula(bilgi.sunucu, bilgi.port, secenek.cozucu);
  } catch (hata) {
    if (hata instanceof SmtpHedefHatasi) throw new SaglayiciHatasi(hata.message);
    throw hata;
  }
  saglayiciKaydet(ctx, "eposta", "smtp", sifrele(bilgi, ctx.tenantId, "eposta"));
}

/** Kanalın gerçek sağlayıcısı; tanımlı değilse null. */
export function gercekSaglayici(ctx: TenantContext, kanal: Kanal, secenek: SaglayiciSecenekleri = {}): MessageProvider | null {
  const kayit = saglayiciSifreliGetir(ctx, kanal);
  if (!kayit) return null;
  if (kanal === "eposta" && kayit.saglayici === "smtp") {
    const bilgi = coz<SmtpBilgileri>(kayit.sifreliVeri, ctx.tenantId, kanal);
    return smtpSaglayici(bilgi, { cozucu: secenek.cozucu, ...secenek.smtp });
  }
  if (kanal === "sms" && kayit.saglayici === "netgsm") {
    return netgsmSaglayici(coz<NetgsmBilgileri>(kayit.sifreliVeri, ctx.tenantId, kanal), secenek.netgsm);
  }
  return null;
}

/** Gönderimde kullanılacak sağlayıcı: sandbox kampanyada (ya da sağlayıcı yoksa) her zaman sandbox. */
export function saglayiciAl(ctx: TenantContext, kanal: Kanal, sandbox: boolean, secenek: SaglayiciSecenekleri = {}): MessageProvider {
  return (sandbox ? null : gercekSaglayici(ctx, kanal, secenek)) ?? new SandboxSaglayici(kanal);
}

function testSiniri(ctx: TenantContext, kanal: Kanal, simdi: Date) {
  const saat = `${gunAnahtari(simdi)}T${String(Math.floor(gunIciDakika(simdi) / 60)).padStart(2, "0")}`;
  if (!sayacAyir(ctx, `${kanal}_test`, saat, TEST_GONDERIM_SAATLIK_SINIR)) {
    throw new SaglayiciHatasi(`Saatte en fazla ${TEST_GONDERIM_SAATLIK_SINIR} test gönderimi yapılabilir.`, 429);
  }
}

/**
 * Test gönderimi: YALNIZCA çalışma alanının kendi adresine gider (e-postada SMTP gönderen adresi, SMS'te
 * Ayarlar'daki yetkili cep telefonu); alıcı istemciden alınmaz. Kiracı başına saatte en fazla
 * TEST_GONDERIM_SAATLIK_SINIR.
 */
export async function testGonder(ctx: TenantContext, kanal: Kanal, secenek: SaglayiciSecenekleri = {}, simdi = new Date()) {
  const kayit = saglayiciSifreliGetir(ctx, kanal);
  if (!kayit) throw new SaglayiciHatasi(kanal === "eposta" ? "Önce SMTP bilgilerini kaydedin." : "Önce Netgsm bilgilerini kaydedin.");
  const ayar = iletiAyarlariGetir(ctx);

  if (kanal === "sms") {
    const telefon = telefonNormallestir(ayar.yetkiliTelefonu);
    if (!cepMi(telefon)) throw new SaglayiciHatasi("Ayarlar → SMS bölümüne yetkili cep telefonunu girin; test SMS'i yalnızca oraya gider.");
    testSiniri(ctx, kanal, simdi);
    const saglayici = netgsmSaglayici(coz<NetgsmBilgileri>(kayit.sifreliVeri, ctx.tenantId, "sms"), secenek.netgsm);
    return saglayici.gonderBilgilendirme({
      kanal: "sms",
      alici: telefon,
      metin: "Harita CRM test SMS'i. Netgsm ayarlariniz calisiyor.",
      aboneliktenCikmaBaglantisi: "test",
      aliciTuru: "tacir_esnaf",
    });
  }

  testSiniri(ctx, kanal, simdi);
  const bilgi = coz<SmtpBilgileri>(kayit.sifreliVeri, ctx.tenantId, "eposta");
  const saglayici = smtpSaglayici(bilgi, { cozucu: secenek.cozucu, ...secenek.smtp });
  const sonuc: GonderimSonucu = await saglayici.gonder({
    kanal: "eposta",
    alici: bilgi.gonderen,
    konu: "Harita CRM test e-postası",
    metin:
      "Bu bir test e-postasıdır. SMTP ayarlarınız çalışıyor.\n\n" +
      `Gönderen: ${ayar.gonderenUnvani ?? "(gönderen unvanı girilmemiş)"}`,
    gonderenAdi: ayar.gonderenUnvani ?? undefined,
    aboneliktenCikmaBaglantisi: "test",
    aliciTuru: "tacir_esnaf",
  });
  return sonuc;
}
