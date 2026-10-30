// WhatsApp webhook: bildirimin tamamı tek transaction (bir değişikliğin hatası aynı bildirimdeki RET'i ve gelen ileti
// kimliğini kalıcı yapmaz; Meta'nın tekrar denemesi baştan işler) ve yalnızca BSUID ile gelen ret (BSUID'in bağlı
// olduğu kayıt, yoksa bu BSUID'e gönderim yapılmış kuyruk satırının kaydı; telefon dahil engellenir).
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Geçici hata: reklam bilgisini yazan depo fonksiyonu bir kez hata verir.
const hata = vi.hoisted(() => ({ kalan: 0 }));
vi.mock("@/server/repo/whatsapp-kisileri", async (orijinal) => {
  const o = await orijinal<typeof import("@/server/repo/whatsapp-kisileri")>();
  return {
    ...o,
    reklamBilgisiYaz: (...a: Parameters<typeof o.reklamBilgisiYaz>) => {
      if (hata.kalan > 0) {
        hata.kalan--;
        throw new Error("geçici veritabanı hatası");
      }
      return o.reklamBilgisiYaz(...a);
    },
  };
});

const { db } = await import("@/server/db");
const { adresOzeti } = await import("@/server/messaging/adres");
const { engelliOzetler } = await import("@/server/repo/engel-listesi");
const { iletiAyarlariGuncelle } = await import("@/server/repo/ileti-ayarlari");
const { kayitGetir, kisileriEkle } = await import("@/server/repo/kayitlar");
const { baglantiGetir } = await import("@/server/repo/whatsapp-baglantilari");
const { whatsappKisisiGetir } = await import("@/server/repo/whatsapp-kisileri");
const wa = await import("@/server/servisler/whatsapp-api");
const { mockWhatsappSifirla } = await import("@/server/whatsapp-api/mock");
const { POST } = await import("@/app/api/whatsapp/webhook/[kimlik]/route");
const { kiraciOlustur } = await import("./yardimci/fabrika");

const U = "https://crm.ornek.test";
let sayac = 0;

async function kur(ad: string) {
  const { ctx } = kiraciOlustur(ad);
  iletiAyarlariGuncelle(ctx, { gonderenUnvani: "Ege Ltd.", iletisimBilgisi: "İzmir", iysNo: "1", sorumlulukOnayi: true });
  const phoneId = String(700000 + ++sayac);
  const secret = `secret-${ad}`;
  await wa.whatsappBaglantisiKaydet(ctx, { wabaId: String(600000 + sayac), phoneNumberId: phoneId, erisimAnahtari: "x", appSecret: secret });
  return { ctx, kimlik: baglantiGetir(ctx)!.webhookKimligi, secret, phoneId };
}
type Kurulum = Awaited<ReturnType<typeof kur>>;

async function gonder(k: Kurulum, value: Record<string, unknown>) {
  const govde = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "x", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: k.phoneId }, ...value } }] }],
  });
  const imza = `sha256=${createHmac("sha256", k.secret).update(govde).digest("hex")}`;
  return POST(new Request(`${U}/api/whatsapp/webhook/${k.kimlik}`, { method: "POST", headers: { "X-Hub-Signature-256": imza }, body: govde }), {
    params: Promise.resolve({ kimlik: k.kimlik }),
  });
}

const gelenSayisi = (k: Kurulum) =>
  (db.$client.prepare("select count(*) n from whatsapp_gelen_kimlikleri where tenant_id = ?").get(k.ctx.tenantId) as { n: number }).n;

function kuyrukSatiri(k: Kurulum, leadId: string, wamid: string, adresOzeti_: string) {
  const kampanya = `k-${wamid}`;
  db.$client
    .prepare("insert into kampanyalar (id, tenant_id, kanal, ad, sablon, filtre, sandbox, durum) values (?, ?, 'whatsapp_api', 'K', 'S', '{}', 0, 'tamamlandi')")
    .run(kampanya, k.ctx.tenantId);
  db.$client
    .prepare(
      "insert into message_queue (id, tenant_id, kampanya_id, lead_id, kanal, durum, saglayici_kimligi, adres_ozeti) values (?, ?, ?, ?, 'whatsapp_api', 'gonderildi', ?, ?)",
    )
    .run(`m-${wamid}`, k.ctx.tenantId, kampanya, leadId, wamid, adresOzeti_);
}

beforeEach(() => {
  mockWhatsappSifirla();
  hata.kalan = 0;
});

describe("tek transaction", () => {
  it("bir iletinin işlenmesi hata verirse aynı bildirimdeki RET dahil hiçbir şey kalıcı olmaz; tekrar deneme ikisini de işler", async () => {
    const k = await kur("Islem");
    const [x, y] = kisileriEkle(
      k.ctx,
      [
        { kaynak: "elle", ekTelefon: "0532 555 00 01" },
        { kaynak: "elle", ekTelefon: "0532 555 00 02" },
      ],
      "x",
    );
    const yuk = {
      contacts: [{ wa_id: "905325550001" }, { wa_id: "905325550002" }],
      messages: [
        { id: "wamid.T1", from: "905325550001", type: "text", text: { body: "RET" } },
        // Reklamdan gelen ret: reklam bilgisi yazılırken (ret'ten önce) geçici hata.
        { id: "wamid.T2", from: "905325550002", type: "text", text: { body: "STOP" }, referral: { source_type: "ad", source_id: "r1" } },
      ],
    };

    hata.kalan = 1;
    const ilk = await gonder(k, yuk).catch(() => null);
    expect(ilk?.status ?? 500).toBe(500);
    expect(kayitGetir(k.ctx, x.id)?.iletiIzni).not.toBe("ret");
    expect(kayitGetir(k.ctx, y.id)?.iletiIzni).not.toBe("ret");
    expect(gelenSayisi(k)).toBe(0); // gelen ileti kimlikleri de geri alındı

    const tekrar = await gonder(k, yuk);
    expect(tekrar.status).toBe(200);
    expect(kayitGetir(k.ctx, x.id)?.iletiIzni).toBe("ret");
    expect(kayitGetir(k.ctx, y.id)?.iletiIzni).toBe("ret");
    expect(whatsappKisisiGetir(k.ctx, y.id)?.reklamKimligi).toBe("r1");
    expect(gelenSayisi(k)).toBe(2);
  });
});

describe("yalnızca BSUID ile gelen ret", () => {
  it("BSUID kayda bağlı değilse bu BSUID'e gönderim yapılmış kuyruk satırının kaydına uygulanır; telefon da engellenir", async () => {
    const k = await kur("BsuidKuyruk");
    const [kayit] = kisileriEkle(k.ctx, [{ kaynak: "elle", ekTelefon: "0532 666 00 01" }], "x");
    // İleti BSUID'e gönderilmişti (kuyrukta yalnızca BSUID özeti); BSUID kayda bağlı değil.
    kuyrukSatiri(k, kayit.id, "wamid.B1", adresOzeti(k.ctx.tenantId, "wa_kimlik", "TR.900"));

    await gonder(k, { contacts: [{ user_id: "TR.900" }], messages: [{ id: "wamid.IN.B1", from_user_id: "TR.900", type: "text", text: { body: "DUR" } }] });

    expect(kayitGetir(k.ctx, kayit.id)?.iletiIzni).toBe("ret");
    expect(whatsappKisisiGetir(k.ctx, kayit.id)).toMatchObject({ izin: "ret", bsuid: "TR.900" });
    const tel = adresOzeti(k.ctx.tenantId, "telefon", "905326660001");
    const bsuid = adresOzeti(k.ctx.tenantId, "wa_kimlik", "TR.900");
    expect(engelliOzetler(k.ctx, [tel, bsuid])).toEqual(new Set([tel, bsuid]));
  });

  it("telefona gönderilen iletinin durum bildirimindeki BSUID kayda bağlanır; sonra yalnızca BSUID'le gelen ret telefonu da engeller", async () => {
    const k = await kur("BsuidDurum");
    const [kayit] = kisileriEkle(k.ctx, [{ kaynak: "elle", ekTelefon: "0532 666 00 02" }], "x");
    kuyrukSatiri(k, kayit.id, "wamid.B2", adresOzeti(k.ctx.tenantId, "telefon", "905326660002"));

    await gonder(k, { statuses: [{ id: "wamid.B2", status: "delivered", timestamp: "1761728400", recipient_id: "905326660002", recipient_user_id: "TR.901" }] });
    expect(whatsappKisisiGetir(k.ctx, kayit.id)?.bsuid).toBe("TR.901");

    await gonder(k, { contacts: [{ user_id: "TR.901" }], messages: [{ id: "wamid.IN.B2", from_user_id: "TR.901", type: "text", text: { body: "RET" } }] });
    expect(kayitGetir(k.ctx, kayit.id)?.iletiIzni).toBe("ret");
    const tel = adresOzeti(k.ctx.tenantId, "telefon", "905326660002");
    expect(engelliOzetler(k.ctx, [tel]).has(tel)).toBe(true);
  });
});
