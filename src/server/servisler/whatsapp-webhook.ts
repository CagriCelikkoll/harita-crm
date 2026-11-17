// WhatsApp Cloud API webhook'u (oturumsuz). Çalışma alanı URL'deki rastgele kimlikten bulunur (K1).
//
// GET: Meta'nın abonelik doğrulaması — hub.verify_token, çalışma alanının (şifreli) verify token'ıyla sabit zamanlı
//      karşılaştırılır; eşleşirse hub.challenge döner ve "webhook doğrulandı" işaretlenir.
// Bir bildirimin tüm işlenmesi tek transaction'dır (hata → hiçbir şey kalıcı olmaz, Meta tekrar dener).
// POST: X-Hub-Signature-256 (HMAC-SHA256, App Secret, HAM gövde) doğrulanmadan gövde AYRIŞTIRILMAZ ve hiçbir işlem
//      yapılmaz. Çoklu numara: Meta'da callback adresi uygulama düzeyindedir, aynı uygulamaya bağlı numaraların
//      bildirimleri tek adrese gelebilir. Bu yüzden her değişiklik, AYNI çalışma alanının ve AYNI App Secret'ın
//      (imzayı doğrulayan) numaralarından numarası (metadata.phone_number_id) eşleşene, numarasız değişiklik (şablon,
//      limit) WABA'sı (entry.id) eşleşenlere yönlendirilir. Eşleşmeyen (başka çalışma alanının ya da başka uygulamanın
//      numarası) atlanır.
//      Bir numara için ortak adres üzerinden imzalı teslim bildirimi gelirse, o numaranın "bildirim adresi doğrulandı"
//      adımı da tamamlanır: Meta'nın GET doğrulaması yalnızca uygulamanın tek adresine yapılır; imzalı bildirimin
//      gelmesi o numaranın bildirimlerinin bize ulaştığının daha güçlü kanıtıdır.
//
// İşlenenler:
//  - statuses: kuyruk satırının ve gelen kutusu mesajının teslim durumu (yalnızca ileri), hata kodu, ücret; 131026 → "WhatsApp yok",
//    131050 → ret; hesap düzeyi hata (131031, 368, 131042; value.errors'ta da) → bu WABA'daki numaralar kilitlenir ve
//    onların WhatsApp kampanyaları duraklar (hesap bilgisidir: başka aracın iletisinin bildirimi de kilitler). Test modu kilidinin ikinci koşulunu YALNIZCA bizim gönderdiğimiz (sandbox olmayan), bağlantının
//    mevcut numarasından giden bir iletinin imzalı durum bildirimi sağlar; başka aracın bildirimleri sağlamaz.
//  - messages: kişi eşleştirme önce BSUID (user_id), yoksa telefon (wa_id), yoksa bu BSUID'e gönderim yapılmış
//    kuyruk satırı; Click-to-WhatsApp reklamı (referral) → kişi yoksa 'meta_reklam' kaydı ("Reklamdan yazdı", izin YOK),
//    varsa reklam bilgisi; reklam dışı bilinmeyen numara → 'whatsapp_gelen' kaydı (bireysel, WhatsApp izni YOK);
//    ret kelimesi / abonelikten çıkma butonu → ret akışı (sohbet kaydından ÖNCE); sonra gelen kutusu: sohbet (kişi ×
//    numara) ve mesaj (metin ya da başlık; fotoğraf, belge ve seste "bekliyor" medya satırı, indirme işçide),
//    okunmamış ve 24 saat penceresi; "gelen WhatsApp mesajı" olayı; BSUID değişimi. Metin ileti_ayarlari.mesaj_saklama_gun sonra boşaltılır (bakim.ts).
//  - user_preferences: "stop" → ret (K5); "resume" yalnızca olay (ret geri alınmaz).
//  - message_template_status_update: şablon durumu ve kullanılabilirliği.
//  - phone_number_quality_update / business_capability_update: portföy mesajlaşma limiti.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { telefonNormallestir } from "@/lib/adres-normal";
import { cikisYanitiMi, hesapKilidiNedeni, retMetniMi, UCRETSIZ_PENCERE_SAAT } from "@/lib/whatsapp-api";
import { adresOzeti } from "../messaging/adres";
import type { TenantContext } from "../repo/baglam";
import { retIsle } from "../repo/engel-listesi";
import { telefonlaKayitlar } from "../repo/kayitlar";
import { whatsappKampanyalariniDuraklat } from "../repo/kampanyalar";
import { adreseGonderilenKayitlar, teslimDurumuIsle } from "../repo/kuyruk";
import { sistemOlayiEkle } from "../repo/olaylar";
import {
  imzaliDurumAlindiIsaretle,
  webhookBaglantisi,
  webhookDogrulandiIsaretle,
  webhookIslemi,
  webhookNumaralari,
  webhookOrtakAdresleDogrulandi,
} from "../repo/sistem/whatsapp-webhook";
import { hesapKilidiYaz, limitKatmaniYaz, type WhatsappBaglantisi } from "../repo/whatsapp-baglantilari";
import { gelenIletiKaydet } from "../repo/whatsapp-gelen";
import {
  bsuidAta,
  bsuidDegistir,
  bsuidIleBul,
  gelenKisiOlustur,
  reklamBilgisiYaz,
  reklamKisisiOlustur,
  whatsappYokIsaretle,
} from "../repo/whatsapp-kisileri";
import { sablonDurumuYaz } from "../repo/whatsapp-sablonlari";
import { gelenMesajYaz, mesajTeslimDurumuYaz } from "../repo/gelen-kutusu";
import { MEDYA_TURLERI, sohbetMesajTuru } from "@/lib/gelen-kutusu";
import { whatsappBaglantisiCoz } from "./whatsapp-api";

export const WEBHOOK_AZAMI_BAYT = 1024 * 1024;

const esit = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Bu adres (kimlik) bir çalışma alanının doğrulanmış bağlantısına ait mi? Rota gövdeyi okumadan önce sorar. */
export function webhookTanimliMi(kimlik: string): boolean {
  return webhookBaglantisi(kimlik) !== null;
}

/** GET doğrulaması: eşleşirse challenge, değilse null. */
export function webhookDogrula(kimlik: string, p: { mode: string | null; token: string | null; challenge: string | null }, simdi = new Date()) {
  const w = webhookBaglantisi(kimlik);
  if (!w || p.mode !== "subscribe" || !p.token || !p.challenge) return null;
  const gizli = whatsappBaglantisiCoz(w.ctx, w.baglanti.id)?.gizli;
  if (!gizli?.verifyToken || !esit(p.token, gizli.verifyToken)) return null;
  webhookDogrulandiIsaretle(w.baglanti.id, simdi);
  return p.challenge.slice(0, 200);
}

/** X-Hub-Signature-256: "sha256=" + HMAC-SHA256(App Secret, ham gövde) hex. */
export function imzaGecerli(govde: Uint8Array, baslik: string | null, appSecret: string): boolean {
  const m = /^sha256=([0-9a-f]{64})$/i.exec(baslik?.trim() ?? "");
  if (!m) return false;
  const beklenen = createHmac("sha256", appSecret).update(govde).digest();
  const gelen = Buffer.from(m[1], "hex");
  return gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen);
}

export type WebhookSonucu = { durum: 200 | 401 | 404; islenen: number; atlanan: number };

// --- Yük tipleri (kullandığımız alanlar) ---
type Kisi = { profile?: { name?: string; username?: string }; wa_id?: string; user_id?: string };
type Gelen = {
  from?: string;
  from_user_id?: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
  image?: Medya;
  video?: Medya;
  document?: Medya;
  audio?: Medya;
  sticker?: Medya;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  reaction?: { emoji?: string; message_id?: string };
  referral?: { source_id?: string; source_type?: string; headline?: string; ctwa_clid?: string };
  system?: { type?: string; user_id?: string; previous_user_id?: string; wa_id?: string };
};
type Medya = { id?: string; caption?: string; filename?: string; mime_type?: string; sha256?: string };
type Durum = {
  id: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
  recipient_user_id?: string;
  errors?: { code?: number }[];
  pricing?: { billable?: boolean; category?: string };
};
type Deger = {
  metadata?: { phone_number_id?: string };
  contacts?: Kisi[];
  messages?: Gelen[];
  statuses?: Durum[];
  errors?: { code?: number }[];
  user_preferences?: { wa_id?: string; user_id?: string; value?: string }[];
  // şablon durumu
  event?: string;
  message_template_id?: number | string;
  message_template_name?: string;
  message_template_language?: string;
  // limit
  current_limit?: string;
  max_daily_conversations_per_business?: string | number;
};
type Yuk = { object?: string; entry?: { id?: string; changes?: { field?: string; value?: Deger }[] }[] };

const zaman = (ts: string | undefined, yedek: Date) => (ts && /^\d+$/.test(ts) ? new Date(Number(ts) * 1000) : yedek);

/** Limit değeri ("TIER_2K", "2000", 2000) → katman metni. */
function katman(deger: string | number | undefined): string | null {
  if (deger === undefined || deger === null || deger === "") return null;
  const s = String(deger).trim();
  if (/^TIER_/i.test(s)) return s.toUpperCase();
  if (/^\d+$/.test(s)) return `TIER_${s}`;
  return null;
}

/**
 * İmzayı doğrulayan App Secret'la aynı secret'a sahip, aynı çalışma alanının numaraları (imzayı doğrulayan dahil).
 * Gizli bilgisi çözülemeyen numara atlanır.
 */
function ayniUygulamaNumaralari(ctx: TenantContext, appSecret: string): WhatsappBaglantisi[] {
  return webhookNumaralari(ctx).filter((b) => {
    try {
      return whatsappBaglantisiCoz(ctx, b.id)?.gizli.appSecret === appSecret;
    } catch {
      return false;
    }
  });
}

/** POST: imza doğrulanırsa işler. */
export function webhookIsle(kimlik: string, govde: Uint8Array, imza: string | null, simdi = new Date()): WebhookSonucu {
  const w = webhookBaglantisi(kimlik);
  if (!w) return { durum: 404, islenen: 0, atlanan: 0 };
  const gizli = whatsappBaglantisiCoz(w.ctx, w.baglanti.id)?.gizli;
  if (!gizli?.appSecret || !imzaGecerli(govde, imza, gizli.appSecret)) return { durum: 401, islenen: 0, atlanan: 0 };

  let yuk: Yuk;
  try {
    yuk = JSON.parse(Buffer.from(govde).toString("utf8")) as Yuk;
  } catch {
    return { durum: 200, islenen: 0, atlanan: 1 };
  }
  // Tamamı tek transaction: hata olursa gelen ileti kimlikleri de yazılmamış olur, tekrar deneme RET'i kaybetmez.
  return webhookIslemi(() => {
    const numaralar = ayniUygulamaNumaralari(w.ctx, gizli.appSecret);
    const s = new Isleyici(w.ctx, simdi);
    for (const entry of yuk.entry ?? []) {
      for (const c of entry.changes ?? []) {
        const v = c.value ?? {};
        // Numara alanı olan değişiklik o numaraya, olmayan (şablon, limit) WABA'sı eşleşen numaralara.
        const numara = v.metadata?.phone_number_id;
        const hedefler = numara ? numaralar.filter((b) => b.phoneNumberId === numara) : numaralar.filter((b) => b.wabaId === entry.id);
        if (!hedefler.length) {
          s.atlanan++;
          continue;
        }
        s.degisiklik(c.field ?? "", v, hedefler);
      }
    }
    for (const b of s.durumAlinanlar.values()) {
      imzaliDurumAlindiIsaretle(b.id, b.phoneNumberId, simdi);
      // Ortak adres: bu numaranın kendi adresine GET doğrulaması hiç gelmeyebilir (tek Meta uygulaması, tek adres).
      if (b.id !== w.baglanti.id) webhookOrtakAdresleDogrulandi(b.id, simdi);
    }
    return { durum: 200 as const, islenen: s.islenen, atlanan: s.atlanan };
  });
}

/** Gelen iletinin sohbette gösterilecek metni (metin, başlık, buton, konum, tepki). Medya baytları burada değil. */
function gelenMetni(m: Gelen, medya: Medya | undefined): string | null {
  switch (m.type) {
    case "text":
      return m.text?.body ?? null;
    case "button":
      return m.button?.text ?? m.button?.payload ?? null;
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    case "location": {
      const l = m.location;
      if (!l) return null;
      const yer = [l.name, l.address].filter(Boolean).join(", ");
      return `${yer ? `${yer} ` : ""}(${l.latitude ?? "?"}, ${l.longitude ?? "?"})`;
    }
    case "reaction":
      return m.reaction?.emoji ?? null;
    default:
      return medya?.caption ?? medya?.filename ?? null;
  }
}

class Isleyici {
  islenen = 0;
  atlanan = 0;
  /** Bizim gönderdiğimiz iletinin imzalı durum bildirimini alan numaralar (test modu kilidinin 2. koşulu). */
  durumAlinanlar = new Map<string, WhatsappBaglantisi>();
  /** Şu an işlenen değişikliğin numarası (messages alanı tek numaraya aittir). */
  private baglanti!: WhatsappBaglantisi;

  constructor(
    private ctx: TenantContext,
    private simdi: Date,
  ) {}

  degisiklik(alan: string, v: Deger, hedefler: WhatsappBaglantisi[]) {
    this.baglanti = hedefler[0];
    if (alan === "messages") {
      for (const h of v.errors ?? []) {
        if (this.hesapHatasi(h.code)) this.islenen++;
      }
      for (const d of v.statuses ?? []) this.durum(d);
      for (const m of v.messages ?? []) this.gelen(m, v.contacts ?? []);
    } else if (alan === "user_preferences") {
      for (const p of v.user_preferences ?? []) this.tercih(p);
    } else if (alan === "message_template_status_update") {
      this.sablon(v);
    } else if (alan === "phone_number_quality_update" || alan === "business_capability_update") {
      const k = katman(v.max_daily_conversations_per_business) ?? katman(v.current_limit);
      if (k && k !== "TIER_NOT_SET") {
        limitKatmaniYaz(this.ctx, this.baglanti.wabaId, k);
        this.islenen++;
      }
    } else {
      this.atlanan++;
    }
  }

  /** Kişi: önce BSUID'in bağlı olduğu kayıt, sonra telefon, sonra bu BSUID'e gönderim yapılmış kuyruk satırının kaydı. */
  private kisiBul(bsuid?: string, waId?: string): string | null {
    if (bsuid) {
      const id = bsuidIleBul(this.ctx, bsuid);
      if (id) return id;
    }
    const tel = telefonNormallestir(waId);
    const telefonla = tel ? (telefonlaKayitlar(this.ctx, [tel])[0]?.id ?? null) : null;
    return telefonla ?? (bsuid ? (this.bsuidKuyrukKayitlari(bsuid)[0] ?? null) : null);
  }

  private bsuidKuyrukKayitlari(bsuid: string): string[] {
    return adreseGonderilenKayitlar(this.ctx, adresOzeti(this.ctx.tenantId, "wa_kimlik", bsuid));
  }

  private adresler(bsuid?: string, waId?: string) {
    const tel = telefonNormallestir(waId);
    return [
      ...(tel ? [{ tur: "telefon" as const, ozet: adresOzeti(this.ctx.tenantId, "telefon", tel) }] : []),
      ...(bsuid ? [{ tur: "wa_kimlik" as const, ozet: adresOzeti(this.ctx.tenantId, "wa_kimlik", bsuid) }] : []),
    ];
  }

  /**
   * Ret akışı. Kayıt bulunamadıysa (yalnızca BSUID geldi, BSUID henüz kayda bağlı değil) bu BSUID'e gönderim yapılmış
   * kuyruk satırlarının kayıtlarına uygulanır; retIsle kaydın telefonu dahil tüm adreslerini engeller.
   */
  private ret(leadId: string | null, bsuid: string | undefined, waId: string | undefined, aciklama: string) {
    const kayitlar = leadId ? [leadId] : bsuid ? this.bsuidKuyrukKayitlari(bsuid) : [];
    const girdi = { adresler: this.adresler(bsuid, waId), kaynak: "whatsapp_ret" as const, aciklama };
    if (!kayitlar.length) retIsle(this.ctx, { ...girdi, leadId: null });
    for (const id of kayitlar) {
      if (bsuid) bsuidAta(this.ctx, id, bsuid);
      retIsle(this.ctx, { ...girdi, leadId: id });
    }
  }

  /** Hesap düzeyi hata kodu: bu WABA'daki numaralar kilitlenir, kampanyaları duraklar. Değilse false. */
  private hesapHatasi(kod: number | null | undefined): boolean {
    const neden = hesapKilidiNedeni(kod);
    if (!neden) return false;
    whatsappKampanyalariniDuraklat(this.ctx, neden, { baglantiIdler: hesapKilidiYaz(this.ctx, this.baglanti.id, kod!, this.simdi) });
    return true;
  }

  private durum(d: Durum) {
    const kod = d.errors?.[0]?.code ?? null;
    const kilit = d.status === "failed" && this.hesapHatasi(kod);
    // Gelen kutusundaki mesaj (temsilci yanıtı ya da sohbete düşen kampanya mesajı): yalnızca ileri.
    const sohbetteVar = mesajTeslimDurumuYaz(this.ctx, d.id, d.status, kod);
    const sonuc = teslimDurumuIsle(this.ctx, d.id, {
      durum: d.status,
      hataKodu: kod,
      zaman: zaman(d.timestamp, this.simdi),
      ucretKategorisi: d.pricing?.category ?? null,
      ucretli: d.pricing?.billable ?? null,
    });
    if (!sonuc) {
      // Kuyrukta yok: gelen kutusu yanıtı ya da bizim göndermediğimiz ileti (aynı numarayı kullanan başka bir araç).
      // İkisi de test modu kilidini açmaz.
      if (kilit || sohbetteVar) this.islenen++;
      else this.atlanan++;
      return;
    }
    this.islenen++;
    // Test modu kilidinin 2. koşulu: bizim gönderdiğimiz (sandbox olmayan), bağlantının MEVCUT numarasından giden ileti.
    if (!sonuc.sandbox && sonuc.gonderenNumara === this.baglanti.phoneNumberId) this.durumAlinanlar.set(this.baglanti.id, this.baglanti);
    if (d.recipient_user_id) bsuidAta(this.ctx, sonuc.leadId, d.recipient_user_id);
    if (d.status === "failed" && kod === 131026) whatsappYokIsaretle(this.ctx, sonuc.leadId, this.simdi);
    if (d.status === "failed" && kod === 131050) {
      this.ret(sonuc.leadId, d.recipient_user_id, d.recipient_id, "Kişi WhatsApp'ta bu işletmeden pazarlama iletilerini durdurmuş (Meta 131050)");
    }
  }

  private gelen(m: Gelen, kisiler: Kisi[]) {
    if (!gelenIletiKaydet(this.ctx, m.id, this.simdi)) {
      this.atlanan++; // Meta'nın tekrar gönderdiği webhook
      return;
    }
    this.islenen++;
    const kisi = kisiler.find((k) => (m.from_user_id && k.user_id === m.from_user_id) || (m.from && k.wa_id === m.from)) ?? kisiler[0];
    const bsuid = m.from_user_id ?? kisi?.user_id;
    const waId = m.from ?? kisi?.wa_id;

    // BSUID değişimi (kullanıcı adı / numara değişikliği): metin yok, yalnızca kimlik güncellenir.
    if (m.type === "system") {
      const yeni = m.system?.user_id;
      const eski = m.system?.previous_user_id;
      if (yeni && eski) {
        const leadId = bsuidDegistir(this.ctx, eski, yeni);
        if (leadId) sistemOlayiEkle(this.ctx, leadId, "whatsapp_gelen", "WhatsApp kullanıcı kimliği değişti");
      }
      return;
    }

    let leadId = this.kisiBul(bsuid, waId);
    const reklam = m.referral?.source_type === "ad" ? m.referral : null;
    if (reklam) {
      const bilgi = {
        reklamKimligi: reklam.source_id ?? null,
        reklamBasligi: reklam.headline?.slice(0, 200) ?? null,
        ctwaClid: reklam.ctwa_clid ?? null,
        pencereBitis: new Date(zaman(m.timestamp, this.simdi).getTime() + UCRETSIZ_PENCERE_SAAT * 3_600_000),
      };
      if (leadId) {
        reklamBilgisiYaz(this.ctx, leadId, bilgi);
      } else {
        leadId = reklamKisisiOlustur(
          this.ctx,
          {
            ad: kisi?.profile?.name?.slice(0, 120) ?? null,
            telefon: waId ? `+${waId.replace(/\D/g, "")}` : null,
            bsuid: bsuid ?? null,
            kullaniciAdi: kisi?.profile?.username ?? null,
            aliciTuru: "bireysel", // K15
            reklam: bilgi,
          },
        );
      }
    }
    // Bilinmeyen numara (reklam dışı): kayıt açılır, WhatsApp izni YOK (kendisi yazdı diye pazarlama izni sayılmaz).
    if (!leadId && (waId || bsuid)) {
      leadId =
        gelenKisiOlustur(this.ctx, {
          ad: kisi?.profile?.name?.slice(0, 120) ?? null,
          telefon: waId ? `+${waId.replace(/\D/g, "")}` : null,
          bsuid: bsuid ?? null,
          kullaniciAdi: kisi?.profile?.username ?? null,
          numaraAdi: this.baglanti.ad,
        }) ?? this.kisiBul(bsuid, waId);
    }
    if (leadId && (bsuid || kisi?.profile?.username)) bsuidAta(this.ctx, leadId, bsuid ?? null, kisi?.profile?.username ?? undefined);

    // Buton yanıtında yük (payload) Meta'nın verdiği bir kimlik olabilir: yük, metin, kimlik ve başlık ayrı ayrı denenir.
    const butonYaniti = m.type === "button" || m.type === "interactive";
    const retMi =
      (m.type === "text" && retMetniMi(m.text?.body)) ||
      (butonYaniti && cikisYanitiMi([m.button?.payload, m.button?.text, m.interactive?.button_reply?.id, m.interactive?.button_reply?.title]));
    // Önce ret (değişmez akış), sonra sohbet: RET yazan kişinin mesajı da gelen kutusuna düşer.
    if (retMi) {
      this.ret(leadId, bsuid, waId, m.type === "text" ? "WhatsApp'ta ret yazdı" : "WhatsApp'ta abonelikten çıkma butonuna dokundu");
    }
    if (leadId) {
      const tur = sohbetMesajTuru(m.type);
      const medya = MEDYA_TURLERI.includes(tur) ? m[tur as "image" | "video" | "document" | "audio" | "sticker"] : undefined;
      gelenMesajYaz(
        this.ctx,
        {
          baglantiId: this.baglanti.id,
          leadId,
          wamid: m.id,
          tur,
          metin: gelenMetni(m, medya)?.slice(0, 4096) ?? null,
          medyaId: medya?.id ?? null,
          medya: medya ? { mime: medya.mime_type ?? null, dosyaAdi: medya.filename ?? null, metaSha256: medya.sha256 ?? null } : null,
          metaZamani: zaman(m.timestamp, this.simdi),
        },
        this.simdi,
      );
      sistemOlayiEkle(
        this.ctx,
        leadId,
        "whatsapp_gelen",
        `Gelen WhatsApp mesajı (${m.type})${reklam?.headline ? ` — reklam: ${reklam.headline.slice(0, 100)}` : ""}`,
      );
    }
  }

  private tercih(p: { wa_id?: string; user_id?: string; value?: string }) {
    const leadId = this.kisiBul(p.user_id, p.wa_id);
    this.islenen++;
    if (p.value === "stop") {
      this.ret(leadId, p.user_id, p.wa_id, "Kişi WhatsApp ayarlarından bu işletmenin pazarlama iletilerini durdurdu");
    } else if (p.value === "resume" && leadId) {
      // Ret geri alınmaz; yalnızca bilgi.
      sistemOlayiEkle(this.ctx, leadId, "whatsapp_gelen", "Kişi WhatsApp ayarlarından pazarlama iletilerini yeniden açtı (izin değişmedi)");
    }
  }

  private sablon(v: Deger) {
    const durum = v.event?.toUpperCase();
    // Yalnızca kesin durumlar işlenir; diğerleri (FLAGGED, IN_APPEAL …) için senkron bekler.
    const KESIN = ["APPROVED", "REJECTED", "PAUSED", "DISABLED", "ARCHIVED", "DELETED", "PENDING_DELETION", "LOCKED"];
    if (!durum || !KESIN.includes(durum) || !v.message_template_name || !v.message_template_language) {
      this.atlanan++;
      return;
    }
    const yazildi = sablonDurumuYaz(this.ctx, this.baglanti.wabaId, {
      metaId: v.message_template_id !== undefined ? String(v.message_template_id) : null,
      ad: v.message_template_name,
      dil: v.message_template_language,
      durum,
    });
    if (yazildi) this.islenen++;
    else this.atlanan++;
  }
}

