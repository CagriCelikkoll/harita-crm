// Demo ortamında Meta'nın webhook bildirimlerini taklit eder: demo.db'deki WhatsApp bağlantısının App Secret'ıyla doğru
// imzalanmış istekleri çalışan uygulamanın GERÇEK webhook ucuna (localhost) gönderir; imza doğrulama ve işleme kodu
// gerçekten çalışır. Rehber: docs/PROVA.md
//
// Kullanım: npm run demo:webhook -- dogrula | durum [son|kampanya|<wamid>] [--kadar …] | ret <telefon> | buton <telefon>
//
// Betik veritabanını yalnızca SALT OKUNUR açar (yazan tek taraf webhook ucudur), yol demo-ortam.ts'te sabittir ve
// istekler yalnızca localhost'a gider; Meta'ya ve Google'a hiçbir istek yapılmaz. Gizli değerler ekrana yazılmaz.
import { DEMO_ADRESI, DEMO_ALAN_ADI, DEMO_VERITABANI } from "./demo-ortam";
import { setTimeout as bekle } from "node:timers/promises";
import { telefonBicimle, telefonNormallestir } from "../src/lib/adres-normal";
import { coz } from "../src/server/messaging/sifreleme";
import { butonYuku, durumYuku, imzala, komutCozumle, retYuku, TESLIM_ADIMLARI, type Hesap, type Komut } from "./demo-webhook-yuk";
import { saltOkunurAc } from "./salt-okunur-db";

const ADIM_BEKLEME_MS = 800;

class BetikHatasi extends Error {}

type Baglanti = Hesap & { tenantId: string; kimlik: string; appSecret: string; verifyToken: string };
type Veritabani = ReturnType<typeof saltOkunurAc>;

function veritabaniAc(): Veritabani {
  try {
    return saltOkunurAc(DEMO_VERITABANI);
  } catch {
    throw new BetikHatasi(`Demo veritabanı yok (${DEMO_VERITABANI}). Önce: npm run demo:hazirla`);
  }
}

function baglantiOku(d: Veritabani): Baglanti {
  const b = d
    .prepare(
      `select b.tenant_id tenantId, b.waba_id wabaId, b.phone_number_id phoneNumberId, b.webhook_kimligi kimlik, b.sifreli_veri sifreli
       from whatsapp_baglantilari b join tenants t on t.id = b.tenant_id where t.ad = ?`,
    )
    .get(DEMO_ALAN_ADI) as (Omit<Baglanti, "appSecret" | "verifyToken"> & { sifreli: string }) | undefined;
  if (!b) throw new BetikHatasi("Demo WhatsApp bağlantısı bulunamadı. Önce: npm run demo:hazirla");
  const { sifreli, ...kalan } = b;
  const gizli = coz<{ appSecret: string; verifyToken: string }>(sifreli, b.tenantId, "whatsapp_api");
  return { ...kalan, appSecret: gizli.appSecret, verifyToken: gizli.verifyToken };
}

async function istekYap(url: string, init: RequestInit = {}) {
  try {
    return await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new BetikHatasi(`${DEMO_ADRESI} adresine ulaşılamadı. Uygulama açık mı? Başka bir terminalde: npm run demo`);
  }
}

function yanitDenetle(durum: number) {
  if (durum === 200) return;
  if (durum === 404) {
    throw new BetikHatasi("Webhook adresi bulunamadı (404). 3000 portunda demo değil başka bir uygulama açık olabilir: `npm run dev`i kapatıp `npm run demo` çalıştırın.");
  }
  if (durum === 401) throw new BetikHatasi("İmza reddedildi (401). `npm run demo`yu kapatıp yeniden başlatın.");
  if (durum === 403) throw new BetikHatasi("Doğrulama reddedildi (403): doğrulama anahtarı eşleşmedi.");
  throw new BetikHatasi(`Beklenmeyen yanıt: HTTP ${durum}. Uygulamanın terminaline bakın.`);
}

const webhookAdresi = (b: Baglanti) => `${DEMO_ADRESI}/api/whatsapp/webhook/${b.kimlik}`;

async function bildirimGonder(b: Baglanti, yuk: unknown) {
  const govde = JSON.stringify(yuk);
  const y = await istekYap(webhookAdresi(b), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": imzala(b.appSecret, govde) },
    body: govde,
  });
  yanitDenetle(y.status);
}

async function dogrula(d: Veritabani, b: Baglanti) {
  const challenge = `demo-${Date.now()}`;
  const q = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": b.verifyToken, "hub.challenge": challenge });
  const y = await istekYap(`${webhookAdresi(b)}?${q}`);
  yanitDenetle(y.status);
  if ((await y.text()) !== challenge) throw new BetikHatasi("Yanıttaki challenge eşleşmedi.");
  const r = d.prepare("select webhook_dogrulama_tarihi t from whatsapp_baglantilari where tenant_id = ?").get(b.tenantId) as { t: number | null };
  console.log(`✓ Bildirim adresi doğrulandı (Verify and save karşılığı). Kayıt: ${r.t ? "işaretlendi" : "İŞARETLENMEDİ"}.`);
  console.log("  Ayarlar → WhatsApp (Meta) sayfasını yenileyin: Kurulum adımları 2 \"Tamamlandı\" olmalı.");
}

type Mesaj = { wamid: string; kampanyaId: string; ad: string | null; telefon: string | null };

function mesajlariBul(d: Veritabani, b: Baglanti, hedef: string): Mesaj[] {
  const secim = `select m.saglayici_kimligi wamid, m.kampanya_id kampanyaId, coalesce(l.isletme_adi, l.yetkili_adi) ad, l.ek_telefon telefon
    from message_queue m join leads l on l.id = m.lead_id
    where m.tenant_id = ? and m.kanal = 'whatsapp_api' and m.saglayici_kimligi is not null and m.sandbox_icerik is null`;
  if (hedef.startsWith("wamid.")) {
    const m = d.prepare(`${secim} and m.saglayici_kimligi = ?`).all(b.tenantId, hedef) as Mesaj[];
    if (!m.length) throw new BetikHatasi(`Bu kimlikle gönderilmiş mesaj yok: ${hedef}`);
    return m;
  }
  const son = d.prepare(`${secim} order by m.gonderim_tarihi desc, m.rowid desc limit 1`).get(b.tenantId) as Mesaj | undefined;
  if (!son) throw new BetikHatasi("Henüz gönderilmiş WhatsApp mesajı yok. Kampanyayı başlatın ve işçinin göndermesini bekleyin (npm run demo:isci).");
  if (hedef === "son") return [son];
  return d.prepare(`${secim} and m.kampanya_id = ? order by m.rowid`).all(b.tenantId, son.kampanyaId) as Mesaj[];
}

async function durumGonder(d: Veritabani, b: Baglanti, hedef: string, kadar: (typeof TESLIM_ADIMLARI)[number]) {
  const mesajlar = mesajlariBul(d, b, hedef);
  const adimlar = TESLIM_ADIMLARI.slice(0, TESLIM_ADIMLARI.indexOf(kadar) + 1);
  const oku = d.prepare("select teslim_durumu d from message_queue where tenant_id = ? and saglayici_kimligi = ?");
  for (const m of mesajlar) {
    console.log(`${m.ad ?? "(adsız)"} · ${m.wamid}`);
    for (const adim of adimlar) {
      await bildirimGonder(b, durumYuku(b, m.wamid, adim, telefonNormallestir(m.telefon)));
      console.log(`  ✓ ${adim} gönderildi; kuyruktaki teslim durumu: ${(oku.get(b.tenantId, m.wamid) as { d: string | null }).d}`);
      if (adim !== kadar) await bekle(ADIM_BEKLEME_MS);
    }
  }
  console.log("Kampanya ayrıntısını yenileyin (Alıcılar ve Geçmiş sekmeleri).");
}

type Kayit = { ad: string | null; telefon: string | null; izin: string };

function kayitlariOku(d: Veritabani, b: Baglanti, telefon: string): Kayit[] {
  const satirlar = d
    .prepare("select coalesce(isletme_adi, yetkili_adi) ad, ek_telefon telefon, ileti_izni izin from leads where tenant_id = ? and ek_telefon is not null")
    .all(b.tenantId) as Kayit[];
  return satirlar.filter((k) => telefonNormallestir(k.telefon) === telefon);
}

async function gelenGonder(d: Veritabani, b: Baglanti, tur: "ret" | "buton", telefon: string) {
  if (!kayitlariOku(d, b, telefon).length) {
    console.warn(`! ${telefonBicimle(telefon)} numarasında kayıt yok: numara yalnızca engel listesine yazılacak, hiçbir kayıt değişmeyecek.`);
  }
  await bildirimGonder(b, tur === "ret" ? retYuku(b, telefon) : butonYuku(b, telefon));
  console.log(`✓ ${tur === "ret" ? '"RET" metni' : "Abonelikten çıkma düğmesi"} ${telefonBicimle(telefon)} numarasından gönderildi ve işlendi.`);
  for (const k of kayitlariOku(d, b, telefon)) console.log(`  Kayıt: ${k.ad ?? "(adsız)"} · İleti izni: ${k.izin}`);
}

async function calistir(k: Komut) {
  const d = veritabaniAc();
  try {
    const b = baglantiOku(d);
    if (k.komut === "dogrula") await dogrula(d, b);
    else if (k.komut === "durum") await durumGonder(d, b, k.hedef, k.kadar);
    else await gelenGonder(d, b, k.komut, k.telefon);
  } finally {
    d.close();
  }
}

const komut = komutCozumle(process.argv.slice(2));
if ("hata" in komut) {
  console.error(komut.hata);
  process.exit(1);
}
calistir(komut).catch((hata) => {
  console.error(hata instanceof BetikHatasi ? hata.message : `Beklenmeyen hata: ${hata instanceof Error ? hata.name : "bilinmiyor"}`);
  process.exit(1);
});
