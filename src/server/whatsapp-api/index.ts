// İstemci seçimi: testlerde (VITEST) ve WHATSAPP_API_MOCK=1 iken sahte istemci; aksi halde gerçek Graph API.
// Testler hiçbir koşulda gerçek ağa çıkmaz.
import "server-only";
import { gercekWhatsappIstemcisi } from "./istemci";
import { mockWhatsappIstemcisi } from "./mock";
import type { GraphBaglantisi, WhatsappApiIstemcisi } from "./tipler";

export * from "./tipler";

export const mockKullaniliyor = () => process.env.VITEST === "true" || process.env.WHATSAPP_API_MOCK === "1";

export function whatsappApiIstemcisi(b: GraphBaglantisi): WhatsappApiIstemcisi {
  return mockKullaniliyor() ? mockWhatsappIstemcisi(b) : gercekWhatsappIstemcisi(b);
}
