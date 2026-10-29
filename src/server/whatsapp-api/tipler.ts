// WhatsApp Cloud API (Graph API) istemcisinin arayüzü. Gerçek istemci: istemci.ts; sahte: mock.ts.
import type { MetaSablonBileseni } from "@/lib/whatsapp-api";

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
  bilesenler: { type: "header" | "body"; parameters: { type: "text"; text: string; parameter_name?: string }[] }[];
};

/** messages[0].id (wamid) ve message_status (accepted | held_for_quality_assessment | paused). */
export type GonderimYaniti = { wamid: string; durum: string | null };

export interface WhatsappApiIstemcisi {
  mesajGonder(g: SablonGonderimi): Promise<GonderimYaniti>;
  numaraBilgisi(): Promise<NumaraBilgisi>;
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
