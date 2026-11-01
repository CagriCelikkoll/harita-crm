// Maliyet güvencesi: alan maskeleri beklenen SKU katmanında kalmalı.
// (Places, bir isteği maskedeki EN YÜKSEK katmandan faturalar; listeye tek bir Enterprise alanı
// eklemek her liste satırını Enterprise'a taşır.)
import { describe, expect, it } from "vitest";
import { ALAN_MASKELERI } from "@/server/places/istemci";
import { mockPlacesIstemcisi } from "@/server/places/mock";

// Place Details (New) dokümantasyonu, Ekim 2026.
const PRO = ["displayName", "googleMapsUri", "businessStatus", "primaryType", "iconMaskBaseUri", "utcOffsetMinutes"];
const ENTERPRISE = [
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
  "currentOpeningHours",
  "priceLevel",
];
const alanlar = (maske: string) => maske.split(",");

describe("Places alan maskeleri", () => {
  it("liste yalnızca ad, adres ve konum ister (Place Details Pro), Enterprise alanı yok", () => {
    // location Essentials alanıdır; istek displayName nedeniyle zaten Pro faturalanır.
    expect(alanlar(ALAN_MASKELERI.liste).sort()).toEqual(["displayName", "formattedAddress", "id", "location"]);
    expect(alanlar(ALAN_MASKELERI.liste).filter((a) => ENTERPRISE.includes(a))).toEqual([]);
    expect(alanlar(ALAN_MASKELERI.liste).some((a) => PRO.includes(a))).toBe(true); // ad için Pro gerekir
  });

  it("detay telefon ve web sitesini ayrı (Enterprise) çağrıda ister", () => {
    for (const a of ["nationalPhoneNumber", "websiteUri", "googleMapsUri"]) expect(alanlar(ALAN_MASKELERI.detay)).toContain(a);
  });

  it("tarama, daire içi hücrelerde yalnızca ID ister (ücretsiz IDs Only)", () => {
    expect(alanlar(ALAN_MASKELERI.taramaYalnizcaId).sort()).toEqual(["nextPageToken", "places.id"]);
  });

  it("mock da gerçek API gibi listede telefon döndürmez", async () => {
    const istemci = mockPlacesIstemcisi();
    const yer = await istemci.yerDetayi("mock_cafe_10250_7258", "liste");
    expect(yer).toMatchObject({ id: "mock_cafe_10250_7258" });
    expect(yer?.telefon).toBeUndefined();
    expect(yer?.webSitesi).toBeUndefined();
    expect((await istemci.yerDetayi("mock_cafe_10250_7258", "detay"))?.telefon).toBeDefined();
  });
});
