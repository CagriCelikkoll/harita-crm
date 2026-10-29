// Gerçek Graph API istemcisi. Sürüm META_GRAPH_SURUMU (varsayılan v26.0), adres META_GRAPH_URL (yalnızca test için
// değiştirilir; https zorunlu). Sayfalama Meta'nın döndürdüğü "next" adresiyle değil, imleçle (after) yapılır:
// istekler yalnızca yapılandırılmış adrese gider.
import "server-only";
import { GraphHatasi, type GraphBaglantisi, type MetaSablon, type NumaraBilgisi, type WhatsappApiIstemcisi } from "./tipler";

export const VARSAYILAN_GRAPH_SURUMU = "v26.0";
const ZAMAN_ASIMI_MS = 15_000;
const AZAMI_SAYFA = 50;

export function graphAyarlari() {
  const surum = process.env.META_GRAPH_SURUMU?.trim() || VARSAYILAN_GRAPH_SURUMU;
  if (!/^v\d+\.\d+$/.test(surum)) throw new Error(`META_GRAPH_SURUMU geçersiz: ${surum}`);
  const adres = (process.env.META_GRAPH_URL?.trim() || "https://graph.facebook.com").replace(/\/+$/, "");
  if (!adres.startsWith("https://")) throw new Error("META_GRAPH_URL https ile başlamalı.");
  return { surum, adres };
}

const kimlikGecerli = (s: string) => /^\d{5,30}$/.test(s);

export function gercekWhatsappIstemcisi(b: GraphBaglantisi): WhatsappApiIstemcisi {
  if (!kimlikGecerli(b.wabaId) || !kimlikGecerli(b.phoneNumberId)) throw new GraphHatasi("WABA ID ve Phone Number ID sayısal olmalı.", 400);
  const { surum, adres } = graphAyarlari();

  async function istek<T>(
    yol: string,
    secenek: { method?: "GET" | "POST"; sorgu?: Record<string, string>; govde?: unknown } = {},
  ): Promise<T> {
    const url = new URL(`${adres}/${surum}/${yol}`);
    for (const [k, v] of Object.entries(secenek.sorgu ?? {})) url.searchParams.set(k, v);
    let yanit: Response;
    try {
      yanit = await fetch(url, {
        method: secenek.method ?? "GET",
        headers: {
          Authorization: `Bearer ${b.erisimAnahtari}`,
          "User-Agent": "HaritaCRM/1.0",
          ...(secenek.govde !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: secenek.govde !== undefined ? JSON.stringify(secenek.govde) : undefined,
        signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
        redirect: "error",
        cache: "no-store",
      });
    } catch (hata) {
      throw new GraphHatasi(`Meta'ya ulaşılamadı: ${(hata as Error).name === "TimeoutError" ? "zaman aşımı" : "ağ hatası"}`, 0);
    }
    const govde = (await yanit.json().catch(() => null)) as
      | (T & { error?: { message?: string; code?: number; error_subcode?: number } })
      | null;
    if (!yanit.ok || govde?.error) {
      const e = govde?.error;
      throw new GraphHatasi(e?.message ?? `Meta HTTP ${yanit.status}`, yanit.status, e?.code ?? null, e?.error_subcode ?? null);
    }
    return govde as T;
  }

  return {
    async mesajGonder(g) {
      const v = await istek<{ messages?: { id: string; message_status?: string }[] }>(`${b.phoneNumberId}/messages`, {
        method: "POST",
        govde: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          ...(g.alici.tur === "telefon" ? { to: g.alici.deger } : { recipient: g.alici.deger }),
          type: "template",
          template: { name: g.sablonAdi, language: { code: g.dil }, ...(g.bilesenler.length ? { components: g.bilesenler } : {}) },
        },
      });
      const m = v.messages?.[0];
      // Yanıt alındı ama ileti kimliği yok: gidip gitmediği bilinmiyor (belirsiz sayılır).
      if (!m?.id) throw new GraphHatasi("Meta yanıtında ileti kimliği yok.", 0);
      return { wamid: m.id, durum: m.message_status ?? null };
    },

    async numaraBilgisi() {
      const v = await istek<{
        id: string;
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
        whatsapp_business_manager_messaging_limit?: string;
      }>(b.phoneNumberId, {
        sorgu: { fields: "id,display_phone_number,verified_name,quality_rating,whatsapp_business_manager_messaging_limit" },
      });
      return {
        id: v.id,
        gorunenNumara: v.display_phone_number ?? null,
        dogrulanmisAd: v.verified_name ?? null,
        kalite: v.quality_rating ?? null,
        limitKatmani: v.whatsapp_business_manager_messaging_limit ?? null,
      } satisfies NumaraBilgisi;
    },

    async sablonlar() {
      const sonuc: MetaSablon[] = [];
      let after: string | undefined;
      for (let sayfa = 0; sayfa < AZAMI_SAYFA; sayfa++) {
        const v = await istek<{ data: MetaSablon[]; paging?: { cursors?: { after?: string }; next?: string } }>(
          `${b.wabaId}/message_templates`,
          {
            sorgu: {
              fields: "id,name,language,status,category,components,parameter_format,quality_score",
              limit: "100",
              ...(after ? { after } : {}),
            },
          },
        );
        sonuc.push(...(v.data ?? []));
        after = v.paging?.next ? v.paging.cursors?.after : undefined;
        if (!after) break;
      }
      return sonuc;
    },

    async uygulamayiAboneEt() {
      await istek(`${b.wabaId}/subscribed_apps`, { method: "POST" });
    },
  };
}
