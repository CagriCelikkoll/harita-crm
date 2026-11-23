// WhatsApp Cloud API (Graph API) istemcisinin arayüzü. Gerçek istemci: istemci.ts; sahte: mock.ts.
import type { MetaSablonBileseni, SablonBileseniParametreleri } from "@/lib/whatsapp-api";

/** İstemcinin ihtiyaç duyduğu bağlantı bilgisi (çözülmüş). Erişim anahtarı hiçbir yere yazılmaz/loglanmaz. */
export type GraphBaglantisi = { wabaId: string; phoneNumberId: string; erisimAnahtari: string };

/** GET /{phone-number-id}?fields=… */
export type NumaraBilgisi = {
  id: string;
  gorunenNumara: string | null;
  dogrulanmisAd: string | null;
  /** GREEN | YELLOW | RED | NA */
  kalite: string | null;
  /** whatsapp_business_manager_messaging_limit, ör. "TIER_250" */
  limitKatmani: string | null;
  /**
   * health_status.can_send_message (numara, WABA, işletme ve uygulamanın toplu durumu): AVAILABLE | LIMITED | BLOCKED;
   * null: alan dönmedi. https://developers.facebook.com/documentation/business-messaging/whatsapp/support/health-status
   */
  gonderimDurumu?: string | null;
  /** status: CONNECTED | PENDING | OFFLINE | … (lib/whatsapp-api META_BAGLI); null: alan dönmedi. */
  metaDurumu?: string | null;
  /** code_verification_status: VERIFIED | NOT_VERIFIED | EXPIRED; null: alan dönmedi. */
  kodDogrulamaDurumu?: string | null;
};

/** GET /{waba-id}/message_templates öğesi (kullandığımız alanlar). */
export type MetaSablon = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: MetaSablonBileseni[];
  parameter_format?: string;
  quality_score?: { score?: string };
};

/** POST /{phone-number-id}/messages, type "template". Telefon varsa "to", yoksa BSUID ile "recipient". */
export type SablonGonderimi = {
  alici: { tur: "telefon" | "bsuid"; deger: string };
  sablonAdi: string;
  dil: string;
  /** Metin parametreleri; görselli şablonda başlık { type: "image", image: { id } } (Meta'ya yüklenmiş görsel). */
  bilesenler: SablonBileseniParametreleri[];
};

/** POST /{phone-number-id}/media (multipart): kampanya görseli. Dönen kimlik ~30 gün geçerlidir. */
export type MedyaYuklemesi = { icerik: Uint8Array; mime: string; dosyaAdi: string };

/** POST /{phone-number-id}/messages, type "text": 24 saat penceresinde serbest metin (gelen kutusu yanıtı). */
export type MetinGonderimi = { alici: { tur: "telefon" | "bsuid"; deger: string }; metin: string };

/** messages[0].id (wamid) ve message_status (accepted | held_for_quality_assessment | paused). */
export type GonderimYaniti = { wamid: string; durum: string | null };

/** GET /{media-id}?phone_number_id=…: kısa ömürlü indirme adresi ve Meta'nın bildirdiği tür, boyut, özet. */
export type MedyaBilgisi = { url: string; mime: string | null; boyut: number | null; sha256: string | null };

/** İndirme adresine yapılan GET'in gövdesi; parça parça okunur (boyut sınırı çağıranda). */
export type MedyaAkisi = { boyut: number | null; parcalar: AsyncIterable<Uint8Array>; iptal: () => void };

export interface WhatsappApiIstemcisi {
  /** GET /{media-id}: indirme adresi (birkaç dakika geçerli). */
  medyaBilgisi(medyaId: string): Promise<MedyaBilgisi>;
  /** Adres Meta'nın medya alanında olmalı (metaMedyaAdresiGecerli); yönlendirme izlenmez. */
  medyaAkisi(url: string): Promise<MedyaAkisi>;
  /** POST /{phone-number-id}/media: dosyayı gönderen numaranın adına Meta'ya yükler; medya kimliğini döner. */
  medyaYukle(y: MedyaYuklemesi): Promise<string>;
  mesajGonder(g: SablonGonderimi): Promise<GonderimYaniti>;
  metinGonder(g: MetinGonderimi): Promise<GonderimYaniti>;
  /** POST /{phone-number-id}/messages { status: "read", message_id }: gelen iletiyi okundu işaretler. */
  okunduBildir(wamid: string): Promise<void>;
  numaraBilgisi(): Promise<NumaraBilgisi>;
  /** GET /{waba-id}/phone_numbers (tüm sayfalar): WABA'daki numaraların kimlikleri (sahiplik doğrulaması). */
  wabaNumaralari(): Promise<string[]>;
  /** Tüm sayfalar. */
  sablonlar(): Promise<MetaSablon[]>;
  /** POST /{waba-id}/subscribed_apps — erişim anahtarının uygulamasını WABA webhook'larına abone eder. */
  uygulamayiAboneEt(): Promise<void>;
}

/** Graph API hatası. Mesaj Meta'nın döndürdüğü metindir (erişim anahtarını içermez). */
export class GraphHatasi extends Error {
  constructor(
    mesaj: string,
    readonly http: number,
    readonly kod: number | null = null,
    readonly altKod: number | null = null,
  ) {
    super(mesaj);
    this.name = "GraphHatasi";
  }
  /** Yeniden denemeye değer mi (ağ, 5xx, hız sınırı). */
  get gecici(): boolean {
    return this.http === 0 || this.http >= 500 || this.kod === 4 || this.kod === 80007 || this.kod === 130429;
  }
  /** Anahtar geçersiz / yetki yok. */
  get yetkiHatasi(): boolean {
    return this.http === 401 || this.kod === 190 || this.kod === 200 || this.kod === 10;
  }
}
