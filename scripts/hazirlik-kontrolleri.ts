// npm run hazirlik denetimleri (testler doğrudan çağırır). Her denetim ✓/✗ ve ✗ için Türkçe çözüm döndürür.
// GİZLİ DEĞER YAZILMAZ: anahtarlar, şifreler ve token'lar için yalnızca "dolu / boş / uzunluk yetersiz" söylenir.
// Yalnızca gizli olmayan değerler (veritabanı yolu, uygulama ve tünel adresi) gösterilir. Veritabanı salt okunur açılır.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { hesapKilidiMesaji } from "../src/lib/whatsapp-api";

export type Sonuc = { tamam: boolean; baslik: string; cozum?: string };

const tamam = (baslik: string): Sonuc => ({ tamam: true, baslik });
const hata = (baslik: string, cozum: string): Sonuc => ({ tamam: false, baslik, cozum });

const ANAHTAR_URET = `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`;

/** .env.local (ve diğer env dosyaları) yüklendikten sonraki ortam. Değerler hiçbir sonuca yazılmaz. */
export function ortamKontrolleri(env: Record<string, string | undefined>, envLocalVar: boolean): Sonuc[] {
  const dolu = (ad: string) => Boolean(env[ad]?.trim());
  const sonuclar: Sonuc[] = [
    envLocalVar ? tamam(".env.local var") : hata(".env.local yok", "Proje klasöründe .env.example'ı .env.local adıyla kopyalayıp doldurun."),
  ];

  sonuclar.push(
    dolu("DATABASE_PATH")
      ? tamam(`DATABASE_PATH dolu (${env.DATABASE_PATH})`)
      : hata("DATABASE_PATH boş", "Ofis günü için .env.local'e DATABASE_PATH=./data/gercek-test.db yazın (app.db ve demo.db kullanılmaz)."),
  );

  const sir = env.BETTER_AUTH_SECRET ?? "";
  sonuclar.push(
    !sir.trim()
      ? hata("BETTER_AUTH_SECRET boş", `.env.local'e en az 32 karakterlik rastgele bir değer yazın; üretmek için: ${ANAHTAR_URET}`)
      : sir.length < 32
        ? hata("BETTER_AUTH_SECRET 32 karakterden kısa", `Daha uzun bir değer üretin: ${ANAHTAR_URET} (değişince herkes yeniden giriş yapar).`)
        : tamam("BETTER_AUTH_SECRET dolu"),
  );

  let uygulamaAdresi: URL | null = null;
  try {
    uygulamaAdresi = env.BETTER_AUTH_URL ? new URL(env.BETTER_AUTH_URL) : null;
  } catch {
    /* aşağıda ✗ */
  }
  sonuclar.push(
    uygulamaAdresi
      ? tamam(`BETTER_AUTH_URL dolu (${uygulamaAdresi.origin})`)
      : hata("BETTER_AUTH_URL boş ya da geçersiz", ".env.local'e BETTER_AUTH_URL=http://localhost:3000 yazın."),
  );

  for (const ad of ["ILETI_SIFRELEME_ANAHTARI", "ILETI_IMZA_ANAHTARI"]) {
    const bayt = Buffer.from(env[ad] ?? "", "base64").length;
    sonuclar.push(
      !dolu(ad)
        ? hata(`${ad} boş`, `Bu bilgisayarda daha önce kullanılan değeri geri yazın; hiç yoksa üretin: ${ANAHTAR_URET}`)
        : bayt < 32
          ? hata(`${ad} 32 bayttan kısa`, "32 baytlık base64 değer olmalı. Daha önce kullanılan değeri değiştirmeyin; kayıtlı gizli bilgiler çözülemez.")
          : tamam(`${ad} dolu`),
    );
  }

  sonuclar.push(
    dolu("GOOGLE_PLACES_API_KEY")
      ? tamam("GOOGLE_PLACES_API_KEY dolu")
      : hata("GOOGLE_PLACES_API_KEY boş", "Google Cloud → API'ler ve Hizmetler → Kimlik bilgileri'ndeki sunucu anahtarını .env.local'e girin."),
    dolu("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY")
      ? tamam("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY dolu")
      : hata("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY boş", "Bölge tara haritası için tarayıcı anahtarını .env.local'e girin (yoksa harita yerine enlem/boylam alanları çıkar)."),
    env.PLACES_MOCK === "false"
      ? tamam("PLACES_MOCK=false (Google'a gerçek istek)")
      : hata(`PLACES_MOCK=false değil`, ".env.local'de PLACES_MOCK=false yapın ve uygulamayı yeniden başlatın; yoksa Bölge tara örnek veri gösterir."),
    !dolu("WHATSAPP_API_MOCK")
      ? tamam("WHATSAPP_API_MOCK boş (WhatsApp gerçek Meta'ya gider)")
      : hata("WHATSAPP_API_MOCK dolu", ".env.local'de WHATSAPP_API_MOCK= satırını boş bırakın (ya da silin) ve uygulamayı yeniden başlatın; yoksa mesajlar Meta'ya gitmez."),
  );

  // GENEL_ADRES gün içinde tünel açılınca doldurulur; boş olması sorun değil, doluysa https olmalı.
  const genel = env.GENEL_ADRES?.trim();
  let genelGecerli = false;
  try {
    genelGecerli = Boolean(genel) && new URL(genel!).protocol === "https:";
  } catch {
    /* aşağıda ✗ */
  }
  sonuclar.push(
    !genel
      ? tamam("GENEL_ADRES boş (npm run tunel açılınca doldurulacak)")
      : genelGecerli
        ? tamam(`GENEL_ADRES dolu (${genel}); tünel her açılışta yeni adres alır, bugünkü adresle güncelleyin`)
        : hata("GENEL_ADRES https ile başlamıyor", "npm run tunel çıktısındaki https://…trycloudflare.com adresini yazın ya da satırı boş bırakın."),
  );
  return sonuclar;
}

/** Veritabanında henüz uygulanmamış migration sayısı (drizzle/ klasörü ile __drizzle_migrations karşılaştırılır). */
export function bekleyenMigrasyonlar(sqlite: Database, klasor = path.resolve(process.cwd(), "drizzle")): number {
  const dosyalar = readMigrationFiles({ migrationsFolder: klasor });
  const tabloVar = sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'").get();
  if (!tabloVar) return dosyalar.length;
  const son = sqlite.prepare(`select created_at from "__drizzle_migrations" order by created_at desc limit 1`).get() as
    | { created_at: number | string }
    | undefined;
  return dosyalar.filter((m) => !son || Number(son.created_at) < m.folderMillis).length;
}

export function migrasyonKontrolu(sqlite: Database, klasor?: string): Sonuc {
  const n = bekleyenMigrasyonlar(sqlite, klasor);
  return n === 0
    ? tamam("Migration'lar güncel")
    : hata(`${n} migration uygulanmamış`, "Uygulama ve işçi kapalıyken npm run db:migrate çalıştırın (önce yedek alır).");
}

type BaglantiSatiri = {
  ad: string;
  slug: string;
  baglanti: number | null;
  test_modu: number | null;
  numara_dogrulama_tarihi: number | null;
  webhook_dogrulama_tarihi: number | null;
  hesap_kilidi_kodu: number | null;
};

/** Çalışma alanlarının (ya da yalnızca `slug`'ın) WhatsApp bağlantısı: var mı, test modu açık mı, hesap kilidi var mı. */
export function whatsappKontrolleri(sqlite: Database, slug?: string): Sonuc[] {
  const satirlar = sqlite
    .prepare(
      `select t.ad, t.slug, w.tenant_id is not null baglanti, w.test_modu, w.numara_dogrulama_tarihi, w.webhook_dogrulama_tarihi,
              w.hesap_kilidi_kodu
         from tenants t left join whatsapp_baglantilari w on w.tenant_id = t.id
        where ? is null or t.slug = ? order by t.olusturma_tarihi`,
    )
    .all(slug ?? null, slug ?? null) as BaglantiSatiri[];
  if (!satirlar.length) {
    return [
      slug
        ? hata(`"${slug}" slug'ına sahip çalışma alanı yok`, "Slug'ı Ayarlar sayfasındaki komut örneğinden kopyalayın.")
        : hata("Hiç çalışma alanı yok", "npm run dev → http://localhost:3000 → Kayıt ol → çalışma alanı oluşturun."),
    ];
  }
  return satirlar.flatMap((s): Sonuc[] => {
    const on = satirlar.length > 1 ? `${s.ad} (${s.slug}): ` : "";
    if (!s.baglanti) {
      return [
        hata(
          `${on}WhatsApp bağlantısı yok`,
          "Ofiste Meta adımlarından sonra Ayarlar → WhatsApp (Meta) → Teknik ayrıntıları'ndan kurulacak (docs/OFIS-GUNU.md, 7. adım). Sabah bu madde ✗ olabilir.",
        ),
      ];
    }
    const webhook = s.webhook_dogrulama_tarihi ? "webhook doğrulandı" : "webhook henüz doğrulanmadı";
    return [
      s.numara_dogrulama_tarihi
        ? tamam(`${on}WhatsApp bağlantısı var (numara doğrulandı, ${webhook})`)
        : hata(`${on}WhatsApp bağlantısı var ama numara doğrulanmamış`, "Ayarlar → WhatsApp (Meta) → Teknik ayrıntıları'nda bilgileri yeniden girip Kaydet'e basın."),
      s.test_modu
        ? tamam(`${on}Test modu açık (yalnızca test numaralarına gönderilir)`)
        : hata(`${on}Test modu KAPALI`, "Ayarlar → WhatsApp (Meta) → Kurulum adımları → Test modunu yeniden aç. Ofis günü boyunca açık kalmalı."),
      s.hesap_kilidi_kodu == null
        ? tamam(`${on}Meta hesap kilidi yok`)
        : hata(
            `${on}Meta hesap kilidi var (kod ${s.hesap_kilidi_kodu}); WhatsApp gönderimi durdu`,
            `${hesapKilidiMesaji(s.hesap_kilidi_kodu)} Sorun çözülünce Ayarlar → WhatsApp (Meta) → Bağlantıyı test et.`,
          ),
    ];
  });
}

/**
 * Gönderim işçisi kilidi. Çalışan işçi kilidi en fazla `kilitSuresiMs` ileriye uzatır; çöken işçinin kilidi bu süre
 * sonunda kendiliğinden düşer. Bitiş bundan daha ilerideyse kilit takılı kalmıştır (ör. bilgisayarın saati geri alındı).
 */
export function isciKilidiKontrolu(sqlite: Database, kilitSuresiMs: number, simdi = Date.now()): Sonuc {
  const k = sqlite.prepare("select bitis, son_nabiz from isci_kilitleri where ad = 'gonderim'").get() as
    | { bitis: number; son_nabiz: number | null }
    | undefined;
  if (!k || k.bitis <= simdi) return tamam("İşçi kilidi boşta");
  const kalanSn = Math.ceil((k.bitis - simdi) / 1000);
  if (k.bitis - simdi > kilitSuresiMs + 5_000) {
    return hata(
      `İşçi kilidi takılı (${kalanSn} sn sonra düşecek; normalde en fazla ${Math.round(kilitSuresiMs / 1000)} sn)`,
      "Bilgisayarın saati ve saat dilimi doğru mu bakın (Windows → Ayarlar → Saat ve dil → Saati şimdi eşitle). Tüm npm run worker terminallerini kapatın; kilit süre dolunca düşer, beklemeden düşürmek için geliştiriciye haber verin.",
    );
  }
  const nabiz = k.son_nabiz ? `, son nabız ${Math.round((simdi - k.son_nabiz) / 1000)} sn önce` : "";
  return tamam(`İşçi kilidi dolu: bir npm run worker çalışıyor${nabiz} (kapandıysa ${kalanSn} sn içinde düşer)`);
}

export async function placesKontrolu(
  anahtarVar: boolean,
  dogrula: () => Promise<{ tamam: true; kimlikSayisi: number } | { tamam: false; neden: string }>,
): Promise<Sonuc> {
  if (!anahtarVar) return hata("Places anahtarı denenmedi (GOOGLE_PLACES_API_KEY boş)", "Önce anahtarı .env.local'e girin.");
  const s = await dogrula();
  return s.tamam
    ? tamam(`Places anahtarı çalışıyor (ücretsiz istek, ${s.kimlikSayisi} yer kimliği; kotadan düşmez)`)
    : hata("Places anahtarı çalışmıyor", s.neden);
}

/** MSI ve winget kurulumlarının varsayılan yerleri (PATH'e kurulumdan sonra açılan terminallerde girer). */
const CLOUDFLARED_KONUMLARI = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles]
  .filter(Boolean)
  .map((k) => path.join(k!, "cloudflared", "cloudflared.exe"));

/** npm run tunel `cloudflared`'ı PATH'ten çalıştırır; bu yüzden PATH'te bulunması gerekir. */
export function cloudflaredKontrolu(calistir = spawnSync, dosyaVar = fs.existsSync, konumlar = CLOUDFLARED_KONUMLARI): Sonuc {
  const s = calistir("cloudflared", ["--version"], { encoding: "utf8", timeout: 15_000 });
  const surum = String(s.stdout ?? "").trim().split(/\r?\n/)[0];
  if (!s.error && s.status === 0) return tamam(`cloudflared kurulu (${surum || "sürüm okunamadı"})`);
  const kurulu = konumlar.find((k) => dosyaVar(k));
  return kurulu
    ? hata(
        "cloudflared kurulu ama bu terminal onu bulamıyor (PATH)",
        "Kurulumdan önce açılmış bir terminaldesiniz: VS Code'u (ya da terminali) tamamen kapatıp yeniden açın; cloudflared --version bir sürüm yazmalı.",
      )
    : hata(
        "cloudflared kurulu değil",
        "PowerShell'de: winget install --id Cloudflare.cloudflared — sonra terminali kapatıp açın (docs/GERCEK-KURULUM.md, 3a).",
      );
}

/** Portta dinleyen bir süreç var mı: IPv4 ve IPv6 geri döngü adreslerine bağlanmayı dener. */
export async function portKontrolu(port = 3000): Promise<Sonuc> {
  const baglanir = (host: string) =>
    new Promise<boolean>((coz) => {
      const soket = net.connect({ host, port });
      soket.setTimeout(1500);
      soket.once("connect", () => (soket.destroy(), coz(true)));
      soket.once("timeout", () => (soket.destroy(), coz(false)));
      soket.once("error", () => coz(false));
    });
  const dolu = (await Promise.all(["127.0.0.1", "::1"].map(baglanir))).some(Boolean);
  return dolu
    ? hata(
        `${port} portu dolu`,
        `Başka bir npm run dev (ya da npm run demo) açık. O terminalde Ctrl + C ile kapatın; yoksa uygulama başka bir porta geçer ve giriş/davet adresleri (BETTER_AUTH_URL) tutmaz. Hangi süreç olduğunu görmek için PowerShell'de: Get-NetTCPConnection -LocalPort ${port} -State Listen`,
      )
    : tamam(`${port} portu boş`);
}
