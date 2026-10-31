// Elle deneme ortamını sıfırdan kurar: ./data/demo.db silinir, migration'lar uygulanır ve sahte örnek veri eklenir.
// Başka hiçbir veritabanına dokunulmaz (yol demo-ortam.ts'te sabittir; .env.local'deki DATABASE_PATH kullanılmaz).
// Rehber: docs/TEST-REHBERI.md
//
// Kullanım: npm run demo:hazirla   (sonra: npm run demo, ikinci terminalde gerekirse npm run demo:isci)
//
// Tüm isimler, numaralar ve adresler açıkça sahtedir: telefonlar 0500 000 xx xx (elle girilenler 0500 000 00 xx;
// sahte Places istemcisininkiler 0500 000 10 00–99 99), e-postalar @demo.test (".test"
// gerçek bir alan adı olamaz). Google kaynaklı kayıtlar sahte Places istemcisiyle yapılan bir taramadan gelir
// (place_id "mock_…"); bu kayıtların ekranda görünen ad/telefon/adresleri de sahte istemcinin ürettiği uydurma
// değerlerdir.
import { DEMO_ADRESI, DEMO_ALAN_ADI, DEMO_VERITABANI } from "./demo-ortam";
import { DEMO_SABIT_HATLAR } from "./demo-sabitler";
import fs from "node:fs";
import path from "node:path";

const HESAPLAR = {
  yonetici: { ad: "Demo Yönetici", eposta: "yonetici@demo.test", parola: "Demo-Yonetici-2026" },
  uye: { ad: "Demo Üye", eposta: "uye@demo.test", parola: "Demo-Uye-2026!" },
};
/** WhatsApp test numarası (bağlantı test modundayken yalnızca buna gönderilir). */
const TEST_NUMARASI = "0500 000 00 01";

function demoVeritabaniniSil() {
  const dosya = process.env.DATABASE_PATH;
  // Güvenlik: yalnızca demo veritabanı silinir.
  if (dosya !== DEMO_VERITABANI || path.basename(dosya) !== "demo.db") {
    throw new Error(`Beklenmeyen veritabanı yolu: ${dosya}. Yalnızca ${DEMO_VERITABANI} silinebilir.`);
  }
  for (const ek of ["", "-wal", "-shm", "-journal"]) {
    try {
      fs.rmSync(dosya + ek, { force: true });
    } catch (hata) {
      if ((hata as NodeJS.ErrnoException).code === "EBUSY" || (hata as NodeJS.ErrnoException).code === "EPERM") {
        throw new Error("demo.db kullanımda. Önce çalışan `npm run demo` ve `npm run demo:isci` süreçlerini durdurun (Ctrl+C).");
      }
      throw hata;
    }
  }
}

async function calistir() {
  process.env.PLACES_MOCK_GECIKME_MS = "0"; // örnek tarama beklemeden bitsin
  demoVeritabaniniSil();

  // Veritabanı modülü içe aktarılırken bağlantıyı açar: silme işleminden SONRA yüklenir.
  const { db } = await import("../src/server/db");
  const { migrasyonlariUygula } = await import("../src/server/db/migrasyon");
  const { account, iletiAyarlari, memberships, tenants, user } = await import("../src/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const { hashPassword } = await import("better-auth/crypto");
  const { calismaAlaniKur } = await import("../src/server/repo/sistem/uyelik");
  const { iletiAyarlariGuncelle } = await import("../src/server/repo/ileti-ayarlari");
  const { taramaOlustur } = await import("../src/server/repo/taramalar");
  const { taramaCalistir } = await import("../src/server/servisler/tarama");
  const { kayitGuncelle, kisileriEkle, taramaKayitlari } = await import("../src/server/repo/kayitlar");
  const { whatsappIzniAyarla, reklamKisisiOlustur } = await import("../src/server/repo/whatsapp-kisileri");
  const api = await import("../src/server/servisler/whatsapp-api");
  const { mockKullaniliyor } = await import("../src/server/whatsapp-api");

  if (!mockKullaniliyor()) throw new Error("WhatsApp sahte istemcisi etkin değil (WHATSAPP_API_MOCK=1 bekleniyordu).");
  migrasyonlariUygula(db, path.resolve(__dirname, "..", "drizzle"));

  // --- Kullanıcılar (Better Auth ile aynı parola özeti; giriş ekranından girilebilir) ---
  async function kullaniciEkle(h: { ad: string; eposta: string; parola: string }) {
    const id = crypto.randomUUID();
    db.insert(user).values({ id, name: h.ad, email: h.eposta, emailVerified: true }).run();
    db.insert(account)
      .values({
        id: crypto.randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: await hashPassword(h.parola),
        updatedAt: new Date(),
      })
      .run();
    return id;
  }
  const yoneticiId = await kullaniciEkle(HESAPLAR.yonetici);
  const uyeId = await kullaniciEkle(HESAPLAR.uye);

  // --- Çalışma alanı ---
  const ctx = calismaAlaniKur(yoneticiId, DEMO_ALAN_ADI);
  db.insert(memberships).values({ userId: uyeId, tenantId: ctx.tenantId, rol: "uye" }).run();

  iletiAyarlariGuncelle(ctx, {
    gonderenUnvani: "Demo Emlak Ltd. Şti. (sahte)",
    iletisimBilgisi: "Örnek Mah. Deneme Sok. No:0, Kadıköy / İstanbul · iletisim@demo.test",
    iysNo: "000000 (demo)",
    smsRetNumarasi: "0850 000 00 00",
    yetkiliTelefonu: TEST_NUMARASI,
    whatsappSablonu: "Merhaba {isletme}, Demo Emlak'tan yazıyorum. Bölgenizdeki yeni portföyümüzü paylaşmak isterim.",
    sorumlulukOnayi: true,
    // Demo günün her saatinde denenebilsin diye gönderim penceresi tüm gün (gerçek varsayılan 09:00–20:00).
    gonderimBaslangicDk: 0,
    gonderimBitisDk: 24 * 60,
  });

  // Sınırlar elle denenebilsin diye düşük: günde en fazla 5 e-posta ve 5 SMS (fazlası ertesi güne kalır). Places
  // kotası 1.000 birim (istenince gösterilen Google bilgileri ve detay birim harcar); doldurmak için: npm run demo:kota -- 0.
  // Gerçek varsayılanlar: 6.000 birim, 300 e-posta, 200 SMS.
  db.update(tenants).set({ aylikPlacesKotasi: 1000 }).where(eq(tenants.id, ctx.tenantId)).run();
  db.update(iletiAyarlari).set({ gunlukEpostaSiniri: 5, gunlukSmsSiniri: 5 }).where(eq(iletiAyarlari.tenantId, ctx.tenantId)).run();

  // --- Google kaynaklı kayıtlar: sahte Places istemcisiyle örnek tarama (Kadıköy, emlak ofisi) ---
  const tarama = taramaOlustur(ctx, {
    merkezLat: 40.9903,
    merkezLng: 29.029,
    yaricapM: 1500,
    kategori: "emlak_ofisi",
    merkezKaynagi: "adres",
    adresMetni: "Kadıköy, İstanbul",
  });
  const biten = await taramaCalistir(ctx, tarama.id);
  if (biten?.durum !== "tamamlandi") throw new Error(`Örnek tarama tamamlanamadı: ${biten?.hataMesaji ?? "bilinmeyen hata"}`);
  const google = taramaKayitlari(ctx, tarama.id);
  // Sahte istemci bu iki kayıt için bilerek sabit hat döner (SMS'te "cep telefonu değil"); tarama değişirse uyar.
  const eksikSabitHat = DEMO_SABIT_HATLAR.filter((p) => !google.some((k) => k.placeId === p));
  if (eksikSabitHat.length) throw new Error(`Demo taraması beklenen kayıtları üretmedi: ${eksikSabitHat.join(", ")}`);
  const googleBilgisi: Parameters<typeof kayitGuncelle>[2][] = [
    { durum: "iletisimde", yetkiliAdi: "Deneme Can Örnekoğlu", eposta: "can.ornek@demo.test", iletiIzni: "onayli", etiketler: ["demo", "kadikoy"] },
    { durum: "gorusme", yetkiliAdi: "Test Zeynep Sahtekin", eposta: "zeynep.test@demo.test", etiketler: ["demo", "sicak"] },
    { durum: "kazanildi", yetkiliAdi: "Örnek Burak Denemeci", ekTelefon: "0500 000 00 11", iletiIzni: "onayli", etiketler: ["demo"] },
    { durum: "ilgilenmiyor", notlar: "Demo notu: şu an ilgilenmiyor, 3 ay sonra tekrar aranabilir.", etiketler: ["demo"] },
    { eposta: "bilgi.sahte@demo.test", notlar: "Demo notu: e-posta adresi web sitesinden alınmış gibi düşünün." },
  ];
  googleBilgisi.forEach((d, i) => google[i] && kayitGuncelle(ctx, google[i].id, d));

  // --- Google dışı kayıtlar ---
  const [kirtasiye, firin, bireysel, servis, kuafor, retli] = kisileriEkle(
    ctx,
    [
      {
        kaynak: "elle",
        isletmeAdi: "Örnek Kırtasiye (Sahte)",
        yetkiliAdi: "Deneme Ayşe Örnek",
        eposta: "ayse.ornek@demo.test",
        ekTelefon: TEST_NUMARASI,
        etiketler: ["demo", "whatsapp-test"],
      },
      {
        kaynak: "elle",
        isletmeAdi: "Sahte Fırın",
        yetkiliAdi: "Test Mehmet Deneme",
        ekTelefon: "0500 000 00 02",
        etiketler: ["demo"],
      },
      {
        kaynak: "ice_aktarma",
        yetkiliAdi: "Örnek Bireysel Müşteri",
        ekTelefon: "0500 000 00 03",
        eposta: "bireysel.ornek@demo.test",
        aliciTuru: "bireysel",
        etiketler: ["demo", "bireysel"],
      },
      {
        kaynak: "ice_aktarma",
        isletmeAdi: "Kurgu Oto Servis (Sahte)",
        yetkiliAdi: "Deneme Hasan Uydurma",
        eposta: "servis@demo.test",
        ekTelefon: "0212 000 00 04",
        etiketler: ["demo", "kurumsal"],
      },
      {
        kaynak: "elle",
        isletmeAdi: "Hayali Kuaför",
        yetkiliAdi: "Test Elif Kurgu",
        eposta: "elif.kurgu@demo.test",
        ekTelefon: "0500 000 00 05",
        etiketler: ["demo"],
      },
      {
        kaynak: "elle",
        isletmeAdi: "Ret Vermiş Örnek İşletme",
        yetkiliAdi: "Deneme Ret Örneği",
        eposta: "ret.ornek@demo.test",
        ekTelefon: "0500 000 00 09",
        etiketler: ["demo", "ret"],
      },
    ],
    "Demo verisi (npm run demo:hazirla)",
  );
  kayitGuncelle(ctx, kirtasiye.id, { durum: "iletisimde", iletiIzni: "onayli" });
  kayitGuncelle(ctx, firin.id, { durum: "gorusme" });
  kayitGuncelle(ctx, servis.id, { durum: "kazanildi", iletiIzni: "onayli" });
  kayitGuncelle(ctx, kuafor.id, { notlar: "Demo notu: WhatsApp izni henüz alınmadı." });

  // WhatsApp izinleri: kırtasiye test numarasında (test modunda gönderilir); fırın izinli ama test numarası değil
  // (test modunda hariç kalır); bireysel kişinin izni var ama İYS beyanı yok (hariç kalır).
  const izinTarihi = new Date(Date.now() - 20 * 24 * 3600 * 1000);
  whatsappIzniAyarla(ctx, kirtasiye.id, { izin: "var", kaynak: "form", tarih: izinTarihi, not: "Demo: web formu (sahte)" });
  whatsappIzniAyarla(ctx, firin.id, { izin: "var", kaynak: "sozlu", tarih: izinTarihi, not: "Demo: telefonda sözlü onay (sahte)" });
  whatsappIzniAyarla(ctx, bireysel.id, { izin: "var", kaynak: "form", tarih: izinTarihi, iysBeyani: false });

  // Meta reklamından WhatsApp ile yazmış kişi (sahte reklam bilgisi).
  reklamKisisiOlustur(ctx, {
    ad: "Reklamdan Gelen Deneme Kişi",
    telefon: "0500 000 00 06",
    bsuid: "DEMO.BSUID.000006",
    kullaniciAdi: "deneme_kisi_demo",
    aliciTuru: "tacir_esnaf",
    reklam: {
      reklamKimligi: "demo-reklam-0001",
      reklamBasligi: "Demo: Kadıköy'de satılık daireler (sahte reklam)",
      ctwaClid: null,
      pencereBitis: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });

  // Ret: kalıcıdır, kaydın bütün adresleri engel listesine yazılır.
  kayitGuncelle(ctx, retli.id, { iletiIzni: "ret", notlar: "Demo: \"bir daha yazmayın\" dedi (sahte)." });

  // --- Sahte WhatsApp Business bağlantısı ve şablonlar (WHATSAPP_API_MOCK=1: ağa çıkılmaz) ---
  await api.whatsappBaglantisiKaydet(ctx, {
    wabaId: "100000000000001",
    phoneNumberId: "100000000000002",
    erisimAnahtari: "demo-sahte-erisim-anahtari",
    appSecret: "demo-sahte-app-secret",
  });
  await api.baglantiyiTestEt(ctx);
  await api.sablonlariSenkronizeEt(ctx);
  api.testNumaralariKaydet(ctx, [TEST_NUMARASI]);

  const sablonSayisi = api.sablonlar(ctx).length;
  const toplam = (db.$client.prepare("select count(*) as n from leads").get() as { n: number }).n;
  db.$client.pragma("wal_checkpoint(TRUNCATE)");
  db.$client.close();

  console.log(`
Demo ortamı hazır: ${DEMO_VERITABANI}
  Çalışma alanı : ${DEMO_ALAN_ADI}
  Kayıt         : ${toplam} (${google.length} Google kaynaklı örnek taramadan, ${toplam - google.length} elle / içe aktarma / reklam)
  Ret verilmiş  : "Ret Vermiş Örnek İşletme" (0500 000 00 09, ret.ornek@demo.test engel listesinde)
  Sabit hat     : ${DEMO_SABIT_HATLAR.length} Google kaydının telefonu 0 (212) 000 … (SMS'te "cep telefonu değil")
  WhatsApp      : sahte bağlantı (test modunda), ${sablonSayisi} şablon, test numarası ${TEST_NUMARASI}
  Sınırlar      : günde 5 e-posta, 5 SMS (demo için düşük); Places kotası 1.000 birim/ay (npm run demo:kota -- <birim>)

Giriş bilgileri (${DEMO_ADRESI}/giris):
  Yönetici : ${HESAPLAR.yonetici.eposta}   parola: ${HESAPLAR.yonetici.parola}
  Üye      : ${HESAPLAR.uye.eposta}         parola: ${HESAPLAR.uye.parola}

Başlatmak için: npm run demo     (gönderim işçisi, ikinci terminalde: npm run demo:isci)
Adım adım rehber: docs/TEST-REHBERI.md
`);
}

calistir().catch((hata) => {
  console.error("Demo ortamı kurulamadı:", hata instanceof Error ? hata.message : hata);
  process.exit(1);
});
