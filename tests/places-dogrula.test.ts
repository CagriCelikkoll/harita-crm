// npm run places:dogrula: anahtarın ücretsiz istekle doğrulanması ve Google hatalarının Türkçe açıklaması.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALAN_MASKELERI, anahtariDogrula, placesHatasiniAcikla, placesIstemcisiOlustur } from "@/server/places/istemci";

const ANAHTAR = "AIzaDENEMEanahtari000000000000000000000";
const googleHatasi = (code: number, status: string, reason?: string, message = "hata") =>
  JSON.stringify({
    error: { code, status, message, details: reason ? [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason }] : [] },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("placesHatasiniAcikla", () => {
  it.each([
    [400, "INVALID_ARGUMENT", "API_KEY_INVALID", /Anahtar geçersiz/],
    [403, "PERMISSION_DENIED", "SERVICE_DISABLED", /Places API \(New\) bu projede etkin değil/],
    [403, "PERMISSION_DENIED", "API_KEY_SERVICE_BLOCKED", /API kısıtlaması/],
    [403, "PERMISSION_DENIED", "API_KEY_HTTP_REFERRER_BLOCKED", /referrer/],
    [403, "PERMISSION_DENIED", "API_KEY_IP_ADDRESS_BLOCKED", /IP adresiyle kısıtlı/],
    [403, "PERMISSION_DENIED", "BILLING_DISABLED", /faturalandırma açık değil/],
    [429, "RESOURCE_EXHAUSTED", "RATE_LIMIT_EXCEEDED", /İstek sınırı aşıldı/],
  ])("%i %s %s → Türkçe neden", (kod, status, reason, beklenen) => {
    const metin = placesHatasiniAcikla(kod, googleHatasi(kod, status, reason));
    expect(metin).toMatch(beklenen);
    expect(metin).toContain(`Google: ${kod} ${status} ${reason}`);
  });

  it("ayrıntı yoksa mesajdan faturalandırmayı tanır; tanınmayan 403'te yetki açıklaması verir", () => {
    expect(placesHatasiniAcikla(403, googleHatasi(403, "PERMISSION_DENIED", undefined, "This API requires billing to be enabled"))).toMatch(
      /faturalandırma/,
    );
    expect(placesHatasiniAcikla(403, googleHatasi(403, "PERMISSION_DENIED"))).toMatch(/yetki nedeniyle reddetti/);
    expect(placesHatasiniAcikla(500, "<html>sunucu hatası</html>")).toMatch(/^Beklenmeyen Places API hatası\. \(Google: 500; <html>/);
  });

  it("Google mesajında anahtar geçerse gizler", () => {
    const metin = placesHatasiniAcikla(400, googleHatasi(400, "INVALID_ARGUMENT", "API_KEY_INVALID", `key ${ANAHTAR} bad`), ANAHTAR);
    expect(metin).not.toContain(ANAHTAR);
    expect(metin).toContain("key *** bad");
  });
});

describe("anahtariDogrula", () => {
  it("tek sayfalık, yalnızca ID isteyen ücretsiz Text Search gönderir", async () => {
    const fetchSahte = vi.fn(async () => Response.json({ places: [{ id: "ChIJabc" }] }));
    vi.stubGlobal("fetch", fetchSahte);
    expect(await anahtariDogrula(ANAHTAR)).toEqual({ tamam: true, kimlikSayisi: 1 });
    const [url, istek] = fetchSahte.mock.calls[0] as unknown as [string, RequestInit];
    const basliklar = istek.headers as Record<string, string>;
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(basliklar["X-Goog-FieldMask"]).toBe(ALAN_MASKELERI.taramaYalnizcaId); // Text Search Essentials (IDs Only)
    expect(basliklar["X-Goog-FieldMask"]).toBe("places.id,nextPageToken");
    expect(JSON.parse(istek.body as string)).toMatchObject({ pageSize: 1 });
    expect(istek.cache).toBe("no-store");
  });

  it("anahtar yoksa istek yapmaz", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    const fetchSahte = vi.fn();
    vi.stubGlobal("fetch", fetchSahte);
    expect(await anahtariDogrula()).toEqual({ tamam: false, neden: expect.stringMatching(/tanımlı değil/) });
    expect(fetchSahte).not.toHaveBeenCalled();
  });

  it("Google reddederse nedeni Türkçe döner, anahtarı yazmaz; ağ hatasını ayırır", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(googleHatasi(403, "PERMISSION_DENIED", "SERVICE_DISABLED", ANAHTAR), { status: 403 })));
    const sonuc = await anahtariDogrula(ANAHTAR);
    expect(sonuc.tamam).toBe(false);
    if (!sonuc.tamam) {
      expect(sonuc.neden).toMatch(/etkin değil/);
      expect(sonuc.neden).not.toContain(ANAHTAR);
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await anahtariDogrula(ANAHTAR)).toEqual({ tamam: false, neden: expect.stringMatching(/ulaşılamadı/) });
  });
});

describe("gerçek istemci hataları", () => {
  it("reddedilen istekte PlacesHatasi Türkçe nedeni taşır ve anahtarı içermez", async () => {
    vi.stubEnv("PLACES_MOCK", "false");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", ANAHTAR);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(googleHatasi(403, "PERMISSION_DENIED", "BILLING_DISABLED", ANAHTAR), { status: 403 })));
    const hata = await placesIstemcisiOlustur().yerDetayi("ChIJabc", "liste").catch((h: Error) => h);
    expect(hata).toBeInstanceOf(Error);
    expect((hata as Error).message).toMatch(/faturalandırma açık değil/);
    expect((hata as Error).message).not.toContain(ANAHTAR);
  });
});
