// WhatsApp Cloud API webhook'u (oturumsuz). Çalışma alanı URL'deki rastgele kimlikten bulunur (K1).
//
// GET: Meta'nın abonelik doğrulaması — hub.verify_token, çalışma alanının (şifreli) verify token'ıyla sabit zamanlı
//      karşılaştırılır; eşleşirse hub.challenge döner ve "webhook doğrulandı" işaretlenir.
// POST: X-Hub-Signature-256 (HMAC-SHA256, App Secret, HAM gövde) doğrulanmadan gövde AYRIŞTIRILMAZ ve hiçbir işlem
//      yapılmaz. Sonra her değişiklikte numara (metadata.phone_number_id) ya da WABA (entry.id) bu bağlantınınkiyle
//      eşleşmeli; eşleşmeyen (başka çalışma alanının numarası) atlanır.
//
// İşlenenler (gelen ileti METNİ hiçbir yerde saklanmaz):
//  - statuses: kuyruk satırının teslim durumu (yalnızca ileri), hata kodu, ücret; 131026 → "WhatsApp yok",
//    131050 → ret. İmzalı bir durum bildirimi test modu kilidinin ikinci koşulunu sağlar.
//  - messages: kişi eşleştirme önce BSUID (user_id), yoksa telefon (wa_id); ret kelimesi / abonelikten çıkma
//    butonu → ret akışı; Click-to-WhatsApp reklamı (referral) → kişi yoksa 'meta_reklam' kaydı (izin "kendisi
//    yazdı"), varsa reklam bilgisi; diğer iletiler yalnızca "gelen WhatsApp mesajı" olayı; BSUID değişimi.
//  - user_preferences: "stop" → ret (K5); "resume" yalnızca olay (ret geri alınmaz).
//  - message_template_status_update: şablon durumu ve kullanılabilirliği.
//  - phone_number_quality_update / business_capability_update: portföy mesajlaşma limiti.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { telefonNormallestir } from "@/lib/adres-normal";
import { cikisButonuMu, retMetniMi, UCRETSIZ_PENCERE_SAAT } from "@/lib/whatsapp-api";
import { adresOzeti } from "../messaging/adres";
import type { TenantContext } from "../repo/baglam";
import { retIsle } from "../repo/engel-listesi";
import { telefonlaKayitlar } from "../repo/kayitlar";
import { teslimDurumuIsle } from "../repo/kuyruk";
import { sistemOlayiEkle } from "../repo/olaylar";
import { imzaliDurumAlindiIsaretle, webhookBaglantisi, webhookDogrulandiIsaretle } from "../repo/sistem/whatsapp-webhook";
import { limitKatmaniYaz, type WhatsappBaglantisi } from "../repo/whatsapp-baglantilari";
import { gelenIletiKaydet } from "../repo/whatsapp-gelen";
import { bsuidAta, bsuidDegistir, bsuidIleBul, reklamBilgisiYaz, reklamKisisiOlustur, whatsappYokIsaretle } from "../repo/whatsapp-kisileri";
import { sablonDurumuYaz } from "../repo/whatsapp-sablonlari";
import { whatsappBaglantisiCoz } from "./whatsapp-api";

export const WEBHOOK_AZAMI_BAYT = 1024 * 1024;

const esit = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

/** GET doğrulaması: eşleşirse challenge, değilse null. */
export function webhookDogrula(kimlik: string, p: { mode: string | null; token: string | null; challenge: string | null }, simdi = new Date()) {
  const w = webhookBaglantisi(kimlik);
  if (!w || p.mode !== "subscribe" || !p.token || !p.challenge) return null;
  const gizli = whatsappBaglantisiCoz(w.ctx)?.gizli;
  if (!gizli?.verifyToken || !esit(p.token, gizli.verifyToken)) return null;
  webhookDogrulandiIsaretle(w.baglanti.tenantId, simdi);
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
  interactive?: { button_reply?: { id?: string; title?: string } };
  referral?: { source_id?: string; source_type?: string; headline?: string; ctwa_clid?: string };
  system?: { type?: string; user_id?: string; previous_user_id?: string; wa_id?: string };
};
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

/** POST: imza doğrulanırsa işler. */
export function webhookIsle(kimlik: string, govde: Uint8Array, imza: string | null, simdi = new Date()): WebhookSonucu {
  const w = webhookBaglantisi(kimlik);
  if (!w) return { durum: 404, islenen: 0, atlanan: 0 };
  const gizli = whatsappBaglantisiCoz(w.ctx)?.gizli;
  if (!gizli?.appSecret || !imzaGecerli(govde, imza, gizli.appSecret)) return { durum: 401, islenen: 0, atlanan: 0 };

  let yuk: Yuk;
  try {
    yuk = JSON.parse(Buffer.from(govde).toString("utf8")) as Yuk;
  } catch {
    return { durum: 200, islenen: 0, atlanan: 1 };
  }
  const s = new Isleyici(w.ctx, w.baglanti, simdi);
  for (const entry of yuk.entry ?? []) {
    for (const c of entry.changes ?? []) {
      const v = c.value ?? {};
      // Numara alanı olan değişiklikte numara, olmayanda (şablon, limit) WABA eşleşmeli.
      const numara = v.metadata?.phone_number_id;
      const bizim = numara ? numara === w.baglanti.phoneNumberId : entry.id === w.baglanti.wabaId;
      if (!bizim) {
        s.atlanan++;
        continue;
      }
      s.degisiklik(c.field ?? "", v);
    }
  }
  if (s.durumAlindi) imzaliDurumAlindiIsaretle(w.baglanti.tenantId, simdi);
  return { durum: 200, islenen: s.islenen, atlanan: s.atlanan };
}

class Isleyici {
  islenen = 0;
  atlanan = 0;
  durumAlindi = false;

  constructor(
    private ctx: TenantContext,
    private baglanti: WhatsappBaglantisi,
    private simdi: Date,
  ) {}

  degisiklik(alan: string, v: Deger) {
    if (alan === "messages") {
      for (const d of v.statuses ?? []) this.durum(d);
      for (const m of v.messages ?? []) this.gelen(m, v.contacts ?? []);
    } else if (alan === "user_preferences") {
      for (const p of v.user_preferences ?? []) this.tercih(p);
    } else if (alan === "message_template_status_update") {
      this.sablon(v);
    } else if (alan === "phone_number_quality_update" || alan === "business_capability_update") {
      const k = katman(v.max_daily_conversations_per_business) ?? katman(v.current_limit);
      if (k && k !== "TIER_NOT_SET") {
        limitKatmaniYaz(this.ctx, k);
        this.islenen++;
      }
    } else {
      this.atlanan++;
    }
  }

  /** Kişi: önce BSUID, yoksa telefon. */
  private kisiBul(bsuid?: string, waId?: string): string | null {
    if (bsuid) {
      const id = bsuidIleBul(this.ctx, bsuid);
      if (id) return id;
    }
    const tel = telefonNormallestir(waId);
    return tel ? (telefonlaKayitlar(this.ctx, [tel])[0]?.id ?? null) : null;
  }

  private adresler(bsuid?: string, waId?: string) {
    const tel = telefonNormallestir(waId);
    return [
      ...(tel ? [{ tur: "telefon" as const, ozet: adresOzeti(this.ctx.tenantId, "telefon", tel) }] : []),
      ...(bsuid ? [{ tur: "wa_kimlik" as const, ozet: adresOzeti(this.ctx.tenantId, "wa_kimlik", bsuid) }] : []),
    ];
  }

  private ret(leadId: string | null, bsuid: string | undefined, waId: string | undefined, aciklama: string) {
    retIsle(this.ctx, { leadId, adresler: this.adresler(bsuid, waId), kaynak: "whatsapp_ret", aciklama });
  }

  private durum(d: Durum) {
    this.durumAlindi = true;
    const kod = d.errors?.[0]?.code ?? null;
    const sonuc = teslimDurumuIsle(this.ctx, d.id, {
      durum: d.status,
      hataKodu: kod,
      zaman: zaman(d.timestamp, this.simdi),
      ucretKategorisi: d.pricing?.category ?? null,
      ucretli: d.pricing?.billable ?? null,
    });
    if (!sonuc) {
      this.atlanan++;
      return;
    }
    this.islenen++;
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
          this.simdi,
        );
      }
    }
    if (leadId && (bsuid || kisi?.profile?.username)) bsuidAta(this.ctx, leadId, bsuid ?? null, kisi?.profile?.username ?? undefined);

    const butonMetni = m.button?.payload ?? m.button?.text ?? m.interactive?.button_reply?.title;
    const retMi =
      (m.type === "text" && retMetniMi(m.text?.body)) ||
      (butonMetni !== undefined && (retMetniMi(butonMetni) || cikisButonuMu({ type: "QUICK_REPLY", text: butonMetni })));
    if (retMi) {
      this.ret(leadId, bsuid, waId, m.type === "text" ? "WhatsApp'ta ret yazdı" : "WhatsApp'ta abonelikten çıkma butonuna dokundu");
    }
    if (leadId) {
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
    const yazildi = sablonDurumuYaz(this.ctx, {
      metaId: v.message_template_id !== undefined ? String(v.message_template_id) : null,
      ad: v.message_template_name,
      dil: v.message_template_language,
      durum,
    });
    if (yazildi) this.islenen++;
    else this.atlanan++;
  }
}

