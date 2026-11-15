// KAYIT_KIPI=davetle (canlı): yalnızca hiç kullanıcı yokken ILK_YONETICI_EPOSTASI ile ve geçerli daveti olan e-postayla
// kayıt olunur. Varsayılan (acik) geliştirme ve testlerde eskisi gibi. Kural Better Auth'un kullanıcı oluşturma
// kancasında uygulanır: kayıt ucu (sign-up) reddedilen e-postayla kullanıcı oluşturmaz.
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { invitations, user } from "@/server/db/schema";
import { davetOlustur } from "@/server/repo/calisma-alani";
import { kayitIzni, kayitKipi } from "@/server/repo/sistem/uyelik";
import { kiraciOlustur } from "./yardimci/fabrika";

const davetle = { KAYIT_KIPI: "davetle", ILK_YONETICI_EPOSTASI: "Patron@Bursali.test" };
const kayitOl = (email: string) =>
  auth.api.signUpEmail({ body: { email, password: "cok-gizli-sifre-123", name: "Deneme" }, headers: new Headers() });
const kullaniciVar = (email: string) => Boolean(db.select().from(user).where(eq(user.email, email)).get());

afterEach(() => {
  vi.unstubAllEnvs();
});

// Kayıt ucu parola özetini (scrypt) hesaplar: tam paket koşarken 5 sn varsayılan süreyi aşabiliyor.
describe("kayıt kipi", { timeout: 30_000 }, () => {
  it("varsayılan açık; yalnızca 'davetle' değeri kayıt kapatır", () => {
    expect(kayitKipi({})).toBe("acik");
    expect(kayitKipi({ KAYIT_KIPI: " DAVETLE " })).toBe("davetle");
    expect(kayitKipi({ KAYIT_KIPI: "kapali" })).toBe("acik");
    expect(kayitIzni("kim@ornek.test", {})).toEqual({ izinli: true });
  });

  // Bu blok boş veritabanıyla başlar (test dosyasının kendi veritabanı); sıra önemlidir.
  it("hiç kullanıcı yokken yalnızca ilk yönetici adresi; adres tanımlı değilse kimse", () => {
    expect(db.select().from(user).all()).toHaveLength(0);
    expect(kayitIzni("patron@bursali.test", davetle)).toEqual({ izinli: true });
    expect(kayitIzni(" PATRON@bursali.test ", davetle)).toEqual({ izinli: true });
    expect(kayitIzni("yabanci@ornek.test", davetle).izinli).toBe(false);
    expect(kayitIzni("patron@bursali.test", { KAYIT_KIPI: "davetle" })).toMatchObject({
      izinli: false,
      mesaj: expect.stringContaining("ILK_YONETICI_EPOSTASI"),
    });
  });

  it("kayıt ucu: davetle kipinde yabancı reddedilir, ilk yönetici kayıt olur, sonra ilk yönetici adresi de ayrıcalık taşımaz", async () => {
    vi.stubEnv("KAYIT_KIPI", "davetle");
    vi.stubEnv("ILK_YONETICI_EPOSTASI", "patron@bursali.test");
    await expect(kayitOl("yabanci@ornek.test")).rejects.toMatchObject({ body: { code: "KAYIT_KAPALI" } });
    expect(kullaniciVar("yabanci@ornek.test")).toBe(false);

    await kayitOl("patron@bursali.test");
    expect(kullaniciVar("patron@bursali.test")).toBe(true);

    // Artık kullanıcı var: davetsiz kayıt yok.
    await expect(kayitOl("ikinci@ornek.test")).rejects.toMatchObject({ body: { code: "KAYIT_KAPALI" } });
    expect(kullaniciVar("ikinci@ornek.test")).toBe(false);
  });

  it("geçerli davet: kayıt olunur; süresi dolmuş ya da kabul edilmiş davet: olunmaz", async () => {
    vi.stubEnv("KAYIT_KIPI", "davetle");
    const { ctx } = kiraciOlustur("Davetci");
    davetOlustur(ctx, { eposta: "uye@ornek.test", rol: "uye" });
    davetOlustur(ctx, { eposta: "suresi-dolan@ornek.test", rol: "uye" });
    davetOlustur(ctx, { eposta: "kullanilmis@ornek.test", rol: "uye" });
    db.update(invitations).set({ sonGecerlilik: new Date(Date.now() - 1000) }).where(eq(invitations.eposta, "suresi-dolan@ornek.test")).run();
    db.update(invitations).set({ kabulTarihi: new Date() }).where(eq(invitations.eposta, "kullanilmis@ornek.test")).run();

    await kayitOl("Uye@Ornek.test");
    expect(kullaniciVar("uye@ornek.test")).toBe(true);
    for (const e of ["suresi-dolan@ornek.test", "kullanilmis@ornek.test", "davetsiz@ornek.test"]) {
      await expect(kayitOl(e), e).rejects.toMatchObject({ body: { code: "KAYIT_KAPALI" } });
      expect(kullaniciVar(e), e).toBe(false);
    }
  });

  it("açık kipte (varsayılan) herkes kayıt olur", async () => {
    await kayitOl("serbest@ornek.test");
    expect(kullaniciVar("serbest@ornek.test")).toBe(true);
  });
});
