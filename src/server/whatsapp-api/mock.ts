// Sahte WhatsApp Cloud API istemcisi: testlerde her zaman, geliştirmede WHATSAPP_API_MOCK=1 ile. Gerçek ağa çıkmaz.
// Durum modül düzeyindedir; testler mockWhatsappSifirla() ve mockWhatsapp üzerinden senaryo kurar.
import type { MetaSablon, MetinGonderimi, NumaraBilgisi, SablonGonderimi, WhatsappApiIstemcisi } from "./tipler";
import { GraphHatasi, type GraphBaglantisi } from "./tipler";
import { createHash } from "node:crypto";
import { metaMedyaAdresiGecerli } from "./medya-adresi";

const ornekSablonlar = (): MetaSablon[] => [
  {
    id: "1001",
    name: "kampanya_tanitim",
    language: "tr",
    status: "APPROVED",
    category: "MARKETING",
    parameter_format: "POSITIONAL",
    components: [
      { type: "HEADER", format: "TEXT", text: "Merhaba {{1}}" },
      { type: "BODY", text: "{{1}}, yeni portföyümüz hazır. Ayrıntılar için {{2}}." },
      { type: "FOOTER", text: "Almak istemiyorsanız aşağıdaki butona dokunun." },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Abonelikten çık" }] },
    ],
  },
  {
    id: "1002",
    name: "butonsuz_pazarlama",
    language: "tr",
    status: "APPROVED",
    category: "MARKETING",
    components: [{ type: "BODY", text: "İndirim başladı!" }],
  },
  {
    id: "1003",
    name: "randevu_hatirlatma",
    language: "tr",
    status: "APPROVED",
    category: "UTILITY",
    parameter_format: "NAMED",
    components: [{ type: "BODY", text: "Sayın {{ad}}, randevunuz {{tarih}}." }],
  },
];

export const mockWhatsapp = {
  numara: null as NumaraBilgisi | null,
  sablonlar: ornekSablonlar(),
  /** Doluysa bir sonraki çağrı bu hatayla başarısız olur (tek seferlik). */
  hata: null as GraphHatasi | null,
  abonelikSayisi: 0,
  /** Gönderilen şablonlu iletiler (sırasıyla). */
  gonderilenler: [] as (SablonGonderimi & { wamid: string })[],
  /** Gönderilen serbest metinler (gelen kutusu yanıtları). */
  metinler: [] as (MetinGonderimi & { wamid: string; phoneNumberId: string })[],
  /** Okundu bildirimi gönderilen gelen ileti kimlikleri. */
  okundular: [] as string[],
  /** Alıcıya (telefon ya da BSUID) özel gönderim hatası; her gönderimde yeniden uygulanır. */
  aliciHatalari: new Map<string, GraphHatasi>(),
  /** Gönderim yanıtındaki message_status. */
  gonderimDurumu: "accepted" as string | null,
  /** Son çağrıda kullanılan bağlantı (erişim anahtarının doğru çözüldüğünü test etmek için). */
  sonBaglanti: null as GraphBaglantisi | null,
  /** WABA'daki numaralar; null: yalnızca bağlantının kendi numarası (sahiplik doğrulanır). */
  wabaNumaralari: null as string[] | null,
  /**
   * Meta'daki medyalar (kimlik → içerik). url verilmezse Meta'nın medya alanında bir adres üretilir; sha256 verilmezse
   * içeriğin gerçek özeti (hex) döner; boyut verilmezse içeriğin boyutu. akisBoyutu: indirme yanıtının Content-Length'i
   * (verilmezse içeriğin boyutu; null: başlık yok). Listede olmayan kimlik 404.
   */
  medyalar: new Map<
    string,
    { icerik: Uint8Array; mime: string; url?: string; sha256?: string | null; boyut?: number | null; akisBoyutu?: number | null }
  >(),
  /** İndirilen medya adresleri (sırasıyla). */
  medyaIndirmeleri: [] as string[],
};

export function mockWhatsappSifirla() {
  mockWhatsapp.numara = null;
  mockWhatsapp.sablonlar = ornekSablonlar();
  mockWhatsapp.hata = null;
  mockWhatsapp.abonelikSayisi = 0;
  mockWhatsapp.sonBaglanti = null;
  mockWhatsapp.gonderilenler = [];
  mockWhatsapp.metinler = [];
  mockWhatsapp.okundular = [];
  mockWhatsapp.aliciHatalari = new Map();
  mockWhatsapp.gonderimDurumu = "accepted";
  mockWhatsapp.wabaNumaralari = null;
  mockWhatsapp.medyalar = new Map();
  mockWhatsapp.medyaIndirmeleri = [];
}

const mockMedyaAdresi = (id: string) => `https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=${id}`;

// Demo işçisi her açılışta sayacı sıfırdan başlatır ama demo.db kalıcıdır: önek olmasa yeni mesaj eski mesajın kimliğini
// alır ve teslim bildirimi eski satıra işlenir.
const SUREC_ONEKI = process.env.VITEST === "true" ? "" : `${Date.now().toString(36).toUpperCase()}_`;

export function mockWhatsappIstemcisi(b: GraphBaglantisi): WhatsappApiIstemcisi {
  const cagri = () => {
    mockWhatsapp.sonBaglanti = b;
    const h = mockWhatsapp.hata;
    mockWhatsapp.hata = null;
    if (h) throw h;
    if (b.erisimAnahtari === "gecersiz") throw new GraphHatasi("Invalid OAuth access token", 401, 190);
  };
  return {
    async medyaBilgisi(medyaId) {
      cagri();
      const m = mockWhatsapp.medyalar.get(medyaId);
      if (!m) throw new GraphHatasi("Unsupported get request. Object does not exist", 404, 100);
      return {
        url: m.url ?? mockMedyaAdresi(medyaId),
        mime: m.mime,
        boyut: m.boyut === undefined ? m.icerik.byteLength : m.boyut,
        sha256: m.sha256 === undefined ? createHash("sha256").update(m.icerik).digest("hex") : m.sha256,
      };
    },
    async medyaAkisi(url) {
      cagri();
      if (!metaMedyaAdresiGecerli(url)) throw new GraphHatasi("Medya adresi Meta'nın alanında değil.", 400);
      const m = [...mockWhatsapp.medyalar.entries()].find(([id, v]) => (v.url ?? mockMedyaAdresi(id)) === url)?.[1];
      if (!m) throw new GraphHatasi("Meta medya HTTP 404", 404);
      mockWhatsapp.medyaIndirmeleri.push(url);
      const icerik = m.icerik;
      return {
        boyut: m.akisBoyutu === undefined ? icerik.byteLength : m.akisBoyutu,
        parcalar: {
          async *[Symbol.asyncIterator]() {
            for (let i = 0; i < icerik.byteLength; i += 64 * 1024) yield icerik.subarray(i, i + 64 * 1024);
          },
        },
        iptal: () => {},
      };
    },
    async mesajGonder(g) {
      cagri();
      const h = mockWhatsapp.aliciHatalari.get(g.alici.deger);
      if (h) throw h;
      const wamid = `wamid.MOCK${SUREC_ONEKI}${String(mockWhatsapp.gonderilenler.length + 1).padStart(6, "0")}`;
      mockWhatsapp.gonderilenler.push({ ...structuredClone(g), wamid });
      return { wamid, durum: mockWhatsapp.gonderimDurumu };
    },
    async metinGonder(g) {
      cagri();
      const h = mockWhatsapp.aliciHatalari.get(g.alici.deger);
      if (h) throw h;
      const wamid = `wamid.MOCKM${SUREC_ONEKI}${String(mockWhatsapp.metinler.length + 1).padStart(6, "0")}`;
      mockWhatsapp.metinler.push({ ...structuredClone(g), wamid, phoneNumberId: b.phoneNumberId });
      return { wamid, durum: mockWhatsapp.gonderimDurumu };
    },
    async okunduBildir(wamid) {
      cagri();
      mockWhatsapp.okundular.push(wamid);
    },
    async numaraBilgisi() {
      cagri();
      return (
        mockWhatsapp.numara ?? {
          id: b.phoneNumberId,
          gorunenNumara: "+90 850 000 00 00",
          dogrulanmisAd: "Deneme İşletmesi",
          kalite: "GREEN",
          limitKatmani: "TIER_10K",
          gonderimDurumu: "AVAILABLE",
          metaDurumu: "CONNECTED",
          kodDogrulamaDurumu: "VERIFIED",
        }
      );
    },
    async wabaNumaralari() {
      cagri();
      return [...(mockWhatsapp.wabaNumaralari ?? [b.phoneNumberId])];
    },
    async sablonlar() {
      cagri();
      return structuredClone(mockWhatsapp.sablonlar);
    },
    async uygulamayiAboneEt() {
      cagri();
      mockWhatsapp.abonelikSayisi++;
    },
  };
}
