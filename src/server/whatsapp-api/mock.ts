// Sahte WhatsApp Cloud API istemcisi: testlerde her zaman, geliştirmede WHATSAPP_API_MOCK=1 ile. Gerçek ağa çıkmaz.
// Durum modül düzeyindedir; testler mockWhatsappSifirla() ve mockWhatsapp üzerinden senaryo kurar.
import type { MetaSablon, NumaraBilgisi, WhatsappApiIstemcisi } from "./tipler";
import { GraphHatasi, type GraphBaglantisi } from "./tipler";

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
  /** Son çağrıda kullanılan bağlantı (erişim anahtarının doğru çözüldüğünü test etmek için). */
  sonBaglanti: null as GraphBaglantisi | null,
};

export function mockWhatsappSifirla() {
  mockWhatsapp.numara = null;
  mockWhatsapp.sablonlar = ornekSablonlar();
  mockWhatsapp.hata = null;
  mockWhatsapp.abonelikSayisi = 0;
  mockWhatsapp.sonBaglanti = null;
}

export function mockWhatsappIstemcisi(b: GraphBaglantisi): WhatsappApiIstemcisi {
  const cagri = () => {
    mockWhatsapp.sonBaglanti = b;
    const h = mockWhatsapp.hata;
    mockWhatsapp.hata = null;
    if (h) throw h;
    if (b.erisimAnahtari === "gecersiz") throw new GraphHatasi("Invalid OAuth access token", 401, 190);
  };
  return {
    async numaraBilgisi() {
      cagri();
      return (
        mockWhatsapp.numara ?? {
          id: b.phoneNumberId,
          gorunenNumara: "+90 850 000 00 00",
          dogrulanmisAd: "Deneme İşletmesi",
          kalite: "GREEN",
          limitKatmani: "TIER_10K",
        }
      );
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
