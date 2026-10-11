// Sağlayıcı kimlik bilgileri: doğrulama, şifreleyerek kaydetme, gönderim için çözme, test gönderimi.
// Kimlik bilgileri bu modülden dışarı (API yanıtına) hiçbir zaman çıkmaz.
import { z } from "zod";
import { SMTP_IZINLI_PORTLAR, TEST_GONDERIM_SAATLIK_SINIR, type Kanal } from "@/lib/mesajlasma";
import { gunAnahtari, gunIciDakika } from "@/lib/zaman";
import type { TenantContext } from "../repo/baglam";
import { sayacAyir } from "../repo/gonderim-sayaci";
import { iletiAyarlariGetir } from "../repo/ileti-ayarlari";
import { saglayiciKaydet, saglayiciSifreliGetir } from "../repo/saglayicilar";
import { smtpHedefiDogrula, SmtpHedefHatasi, type Cozucu } from "../messaging/ag-guvenligi";
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

/** Test kancaları: DNS çözücü ve SMTP taşıyıcısı. */
export type SaglayiciSecenekleri = { cozucu?: Cozucu; smtp?: SmtpSecenekleri };

/** Kanalın sağlayıcı bilgilerini doğrular ve şifreleyerek kaydeder. Yalnızca yönetici (repo denetler). */
export async function saglayiciBilgisiKaydet(ctx: TenantContext, kanal: Kanal, girdi: unknown, secenek: SaglayiciSecenekleri = {}) {
  if (kanal === "eposta") return smtpKaydet(ctx, girdi, secenek);
  throw new SaglayiciHatasi("Bu kanal için sağlayıcı henüz desteklenmiyor.");
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
  return null;
}

/** Gönderimde kullanılacak sağlayıcı: sandbox kampanyada (ya da sağlayıcı yoksa) her zaman sandbox. */
export function saglayiciAl(ctx: TenantContext, kanal: Kanal, sandbox: boolean, secenek: SaglayiciSecenekleri = {}): MessageProvider {
  return (sandbox ? null : gercekSaglayici(ctx, kanal, secenek)) ?? new SandboxSaglayici(kanal);
}

/**
 * Test gönderimi: YALNIZCA çalışma alanının kendi adresine (e-postada SMTP gönderen adresi) gider; alıcı
 * istemciden alınmaz. Kiracı başına saatte en fazla TEST_GONDERIM_SAATLIK_SINIR.
 */
export async function testGonder(ctx: TenantContext, kanal: Kanal, secenek: SaglayiciSecenekleri = {}, simdi = new Date()) {
  if (kanal !== "eposta") throw new SaglayiciHatasi("Bu kanal için test gönderimi henüz desteklenmiyor.");
  const kayit = saglayiciSifreliGetir(ctx, "eposta");
  if (!kayit) throw new SaglayiciHatasi("Önce SMTP bilgilerini kaydedin.");
  const saat = `${gunAnahtari(simdi)}T${String(Math.floor(gunIciDakika(simdi) / 60)).padStart(2, "0")}`;
  if (!sayacAyir(ctx, "eposta_test", saat, TEST_GONDERIM_SAATLIK_SINIR)) {
    throw new SaglayiciHatasi(`Saatte en fazla ${TEST_GONDERIM_SAATLIK_SINIR} test e-postası gönderilebilir.`, 429);
  }
  const bilgi = coz<SmtpBilgileri>(kayit.sifreliVeri, ctx.tenantId, "eposta");
  const ayar = iletiAyarlariGetir(ctx);
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
