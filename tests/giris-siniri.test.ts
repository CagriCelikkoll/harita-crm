// Kaba kuvvet koruması: giriş ve kayıt uçlarında IP ve e-posta başına sınır. Better Auth'un HTTP işleyicisi
// (auth.handler) üzerinden, gerçek istekteki gibi X-Forwarded-For ile denenir.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { denemeIzinli, GIRIS_SINIRLARI, girisSinirlariniSifirla } from "@/server/giris-siniri";

const KOK = "https://crm.ornek.test/api/auth";

function istek(yol: string, ip: string | null, govde: Record<string, unknown>) {
  const basliklar: Record<string, string> = { "content-type": "application/json", origin: "https://crm.ornek.test" };
  if (ip) basliklar["x-forwarded-for"] = ip;
  return auth.handler(new Request(`${KOK}${yol}`, { method: "POST", headers: basliklar, body: JSON.stringify(govde) }));
}
const giris = (ip: string | null, email: string) => istek("/sign-in/email", ip, { email, password: "yanlis-parola-123" });
const kayit = (ip: string, email: string) =>
  istek("/sign-up/email", ip, { email, password: "cok-gizli-sifre-123", name: "Deneme" });

beforeEach(() => girisSinirlariniSifirla());
afterEach(() => girisSinirlariniSifirla());

// Her deneme parola özeti (scrypt) hesaplar; tam paket koşarken 5 sn varsayılan süre yetmeyebilir.
describe("giriş ve kayıt hız sınırı", { timeout: 60_000 }, () => {
  it("aynı hesaba farklı IP'lerden: 15 dakikada 5 deneme, sonra 429; başka hesap etkilenmez", async () => {
    for (let i = 0; i < 5; i++) expect((await giris(`203.0.113.${i + 1}`, "hedef@ornek.test")).status).toBe(401);

    const engel = await giris("203.0.113.99", "Hedef@Ornek.test "); // büyük harf ve boşluk aynı hesap sayılır
    expect(engel.status).toBe(429);
    expect(await engel.json()).toMatchObject({ code: "COK_FAZLA_DENEME" });

    expect((await giris("203.0.113.99", "baska@ornek.test")).status).toBe(401);
  });

  it("aynı IP'den farklı hesaplara: dakikada 10 deneme, sonra 429; başka IP etkilenmez", async () => {
    for (let i = 0; i < 10; i++) expect((await giris("198.51.100.7", `kisi${i}@ornek.test`)).status).toBe(401);
    expect((await giris("198.51.100.7", "kisi-son@ornek.test")).status).toBe(429);
    expect((await giris("198.51.100.8", "kisi-son@ornek.test")).status).toBe(401);
  });

  it("kayıt: aynı IP'den saatte 5", async () => {
    for (let i = 0; i < 5; i++) expect((await kayit("192.0.2.10", `yeni${i}@ornek.test`)).status).toBe(200);
    const engel = await kayit("192.0.2.10", "yeni-son@ornek.test");
    expect(engel.status).toBe(429);
    expect((await kayit("192.0.2.11", "yeni-son@ornek.test")).status).toBe(200);
  });

  it("sunucu içi auth.api çağrıları sayılmaz", async () => {
    for (let i = 0; i < 12; i++) {
      await expect(
        auth.api.signInEmail({ body: { email: "ic@ornek.test", password: "yanlis-parola-123" }, headers: new Headers() }),
      ).rejects.toMatchObject({ body: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    }
  });

  it("pencere dolunca yeniden izin verilir; e-posta sınırı 15 dakikadır", () => {
    const t0 = 1_000_000;
    const [pencere] = GIRIS_SINIRLARI.girisEposta;
    for (let i = 0; i < pencere.azami; i++) expect(denemeIzinli("giris", `10.0.0.${i}`, "a@ornek.test", t0)).toBe(true);
    expect(denemeIzinli("giris", "10.0.0.50", "a@ornek.test", t0 + pencere.sureMs - 1)).toBe(false);
    expect(denemeIzinli("giris", "10.0.0.51", "a@ornek.test", t0 + pencere.sureMs + 1)).toBe(true);
  });

  it("IP çözülemezse ortak sayaç kullanılır (sınır kalkmaz)", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < 10; i++) expect(denemeIzinli("giris", null, `x${i}@ornek.test`, t0)).toBe(true);
    expect(denemeIzinli("giris", null, "x-son@ornek.test", t0)).toBe(false);
  });
});
