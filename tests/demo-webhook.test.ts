// npm run demo:webhook: komut ayrıştırma, imza ve sahte Meta bildirimlerinin GERÇEK webhook kodunda (rota + işleme)
// beklenen sonucu vermesi; demo veritabanı yokken dosya oluşturulmaması; sahte istemcinin süreçler arası benzersiz wamid üretmesi.
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { iletiAyarlariGuncelle } from "@/server/repo/ileti-ayarlari";
import { kayitGetir, kisileriEkle } from "@/server/repo/kayitlar";
import { olaylariListele } from "@/server/repo/olaylar";
import { baglantiGetir } from "@/server/repo/whatsapp-baglantilari";
import { sablonlariListele } from "@/server/repo/whatsapp-sablonlari";
import { whatsappIzniAyarla } from "@/server/repo/whatsapp-kisileri";
import { isciTuru } from "@/server/servisler/isci";
import { kampanyaBaslat } from "@/server/servisler/kampanya";
import * as wa from "@/server/servisler/whatsapp-api";
import { mockWhatsappSifirla } from "@/server/whatsapp-api/mock";
import { POST } from "@/app/api/whatsapp/webhook/[kimlik]/route";
import { butonYuku, durumYuku, imzala, komutCozumle, retYuku, TESLIM_ADIMLARI } from "../scripts/demo-webhook-yuk";
import { kiraciOlustur } from "./yardimci/fabrika";

const KOK = path.resolve(__dirname, "..");
const SIMDI = new Date("2026-10-29T09:00:00Z");
const TEL = "0532 222 00 01";
const WA_ID = "905322220001";
let sayac = 0;

async function kur() {
  const { ctx } = kiraciOlustur(`Prova${++sayac}`);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Ltd.", iletisimBilgisi: "İzmir", iysNo: "1", sorumlulukOnayi: true });
  const hesap = { wabaId: String(700000 + sayac), phoneNumberId: String(710000 + sayac) };
  const secret = `prova-secret-${sayac}`;
  await wa.whatsappBaglantisiKaydet(ctx, { ...hesap, erisimAnahtari: "x", appSecret: secret });
  await wa.sablonlariSenkronizeEt(ctx);
  wa.testNumaralariKaydet(ctx, [TEL]);
  const [kayit] = kisileriEkle(ctx, [{ kaynak: "elle", ekTelefon: TEL, aliciTuru: "bireysel", etiketler: ["prova"] }], "x");
  whatsappIzniAyarla(ctx, kayit.id, { izin: "var", kaynak: "sozlu" });
  const kimlik = baglantiGetir(ctx)!.webhookKimligi;
  const gonder = (yuk: unknown, anahtar = secret) => {
    const govde = JSON.stringify(yuk);
    return POST(
      new Request(`http://localhost:3000/api/whatsapp/webhook/${kimlik}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hub-Signature-256": imzala(anahtar, govde) },
        body: govde,
      }),
      { params: Promise.resolve({ kimlik }) },
    );
  };
  return { ctx, hesap, kayit, gonder };
}

beforeEach(() => mockWhatsappSifirla());

describe("komut satırı", () => {
  it("komutları ayrıştırır; boşluklu numarayı birleştirir; hatalı girdide metin döner", () => {
    expect(komutCozumle(["dogrula"])).toEqual({ komut: "dogrula" });
    expect(komutCozumle(["durum"])).toEqual({ komut: "durum", hedef: "son", kadar: "read" });
    expect(komutCozumle(["durum", "kampanya", "--kadar", "delivered"])).toEqual({ komut: "durum", hedef: "kampanya", kadar: "delivered" });
    expect(komutCozumle(["durum", "wamid.ABC"])).toEqual({ komut: "durum", hedef: "wamid.ABC", kadar: "read" });
    expect(komutCozumle(["ret", "0532", "222", "00", "01"])).toEqual({ komut: "ret", telefon: WA_ID });
    expect(komutCozumle(["buton", "+905322220001"])).toEqual({ komut: "buton", telefon: WA_ID });
    for (const hatali of [[], ["bilinmeyen"], ["ret"], ["ret", "02122220001"], ["durum", "yanlis"], ["durum", "--kadar", "failed"]]) {
      expect(komutCozumle(hatali)).toHaveProperty("hata");
    }
  });
});

describe("imza", () => {
  it("Meta'nın biçimi: sha256= + App Secret ile ham gövdenin HMAC'i (Türkçe karakterde UTF-8)", () => {
    const govde = '{"metin":"Promosyonları durdur"}';
    expect(imzala("gizli", govde)).toBe(`sha256=${createHmac("sha256", "gizli").update(Buffer.from(govde, "utf8")).digest("hex")}`);
  });
});

describe("sahte bildirimler gerçek webhook kodunda", () => {
  it("durum: sent → delivered → read kuyruk satırını ilerletir ve test modu kilidinin imzalı durum koşulunu sağlar", async () => {
    const k = await kur();
    const sablon = sablonlariListele(k.ctx).find((s) => s.ad === "randevu_hatirlatma")!;
    kampanyaBaslat(
      k.ctx,
      { kanal: "whatsapp_api", ad: "P", filtre: { etiket: "prova" }, testModu: false, sablonId: sablon.id, degiskenEslem: { "body:ad": { kaynak: "sabit", deger: "A" }, "body:tarih": { kaynak: "sabit", deger: "B" } } },
      SIMDI,
    );
    await isciTuru({ simdi: () => SIMDI, whatsappAralikMs: 0 });
    const teslim = () =>
      db.$client.prepare("select saglayici_kimligi s, teslim_durumu d from message_queue where lead_id = ?").get(k.kayit.id) as { s: string; d: string | null };
    const { s: wamid } = teslim();
    expect(baglantiGetir(k.ctx)?.sonImzaliDurumTarihi).toBeNull();
    for (const adim of TESLIM_ADIMLARI) {
      expect((await k.gonder(durumYuku(k.hesap, wamid, adim, WA_ID, SIMDI))).status).toBe(200);
      expect(teslim().d).toBe(adim);
    }
    expect(baglantiGetir(k.ctx)?.sonImzaliDurumTarihi).toBeInstanceOf(Date);
  });

  it('ret: "RET" metni kaydı Ret yapar', async () => {
    const k = await kur();
    expect((await k.gonder(retYuku(k.hesap, WA_ID, SIMDI))).status).toBe(200);
    expect(kayitGetir(k.ctx, k.kayit.id)?.iletiIzni).toBe("ret");
    expect(olaylariListele(k.ctx, k.kayit.id).map((o) => o.aciklama).join(" | ")).toContain("Gelen WhatsApp mesajı (text)");
  });

  it("buton: anlamsız yüklü abonelikten çıkma düğmesi kaydı Ret yapar", async () => {
    const k = await kur();
    expect((await k.gonder(butonYuku(k.hesap, WA_ID, SIMDI))).status).toBe(200);
    expect(kayitGetir(k.ctx, k.kayit.id)?.iletiIzni).toBe("ret");
    expect(olaylariListele(k.ctx, k.kayit.id).map((o) => o.aciklama).join(" | ")).toContain("Gelen WhatsApp mesajı (button)");
  });

  it("art arda iki bildirimde gelen ileti kimliği farklıdır (ikincisi tekrar sayılmaz)", async () => {
    const k = await kur();
    const kimlik = (y: ReturnType<typeof retYuku>) => (y.entry[0].changes[0].value as unknown as { messages: { id: string }[] }).messages[0].id;
    expect(kimlik(retYuku(k.hesap, WA_ID))).not.toBe(kimlik(retYuku(k.hesap, WA_ID)));
  });

  it("yanlış App Secret ile imzalanan bildirim 401 alır ve kayıt değişmez", async () => {
    const k = await kur();
    expect((await k.gonder(retYuku(k.hesap, WA_ID, SIMDI), "baska-secret")).status).toBe(401);
    expect(kayitGetir(k.ctx, k.kayit.id)?.iletiIzni).not.toBe("ret");
  });
});

describe("betik", () => {
  it("demo veritabanı yokken uyarır, istek yapmaz ve dosya oluşturmaz", () => {
    const klasor = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-demo-webhook-"));
    let cikti = "";
    try {
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          pathToFileURL(path.join(KOK, "node_modules", "tsx", "dist", "loader.mjs")).href,
          path.join(KOK, "scripts", "demo-webhook.ts"),
          "dogrula",
        ],
        { cwd: klasor, env: { ...process.env, TSX_TSCONFIG_PATH: path.join(KOK, "tsconfig.json") }, encoding: "utf8", stdio: "pipe" },
      );
    } catch (h) {
      cikti = (h as { stderr: string }).stderr;
    }
    expect(cikti).toContain("npm run demo:hazirla");
    expect(fs.readdirSync(klasor)).toEqual([]);
  }, 30_000);
});

describe("sahte istemcinin wamid'i", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("test dışında her süreçte farklıdır: demo işçisi yeniden başlayınca eski mesajın kimliği kullanılmaz", async () => {
    vi.stubEnv("VITEST", "");
    const gonder = async (zaman: number) => {
      vi.resetModules();
      vi.spyOn(Date, "now").mockReturnValue(zaman);
      const { mockWhatsappIstemcisi } = await import("@/server/whatsapp-api/mock");
      const istemci = mockWhatsappIstemcisi({ wabaId: "1", phoneNumberId: "2", erisimAnahtari: "x" });
      return (await istemci.mesajGonder({ alici: { tur: "telefon", deger: WA_ID } } as never)).wamid;
    };
    const birinci = await gonder(1_000_000);
    const ikinci = await gonder(2_000_000);
    expect(birinci).not.toBe(ikinci);
  });
});
