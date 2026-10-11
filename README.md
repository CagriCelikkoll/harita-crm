# Harita CRM

Seçilen bir merkez ve yarıçap içindeki işletmeleri **Google Places API (New)** ile bulan, bunları potansiyel
müşteri olarak takip etmeyi sağlayan çok kiracılı (multi-tenant) web uygulaması. Ödeme sistemi yoktur.

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- SQLite (better-sqlite3, WAL) + Drizzle ORM, migration'lar drizzle-kit ile
- Better Auth (e-posta/şifre), oturum çerezleri `HttpOnly` + `Secure`
- Google Places API (New) REST (yalnızca sunucuda) + Google Maps JavaScript API (harita)

Bu sürüm **1. aşamadır**: kurulum, kimlik doğrulama ve davet, bölge taraması, kayıt listesi/detay, panel, ayarlar ve
testler. Toplu SMS/e-posta (2. aşama) için yalnızca mimaride yer açılmıştır (`src/server/messaging/`).

---

## Hızlı başlangıç (API anahtarı olmadan)

```bash
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
# .env.local içinde BETTER_AUTH_SECRET'i doldurun:  npx auth@latest secret
npm run db:migrate
npm run dev                        # http://localhost:3000
```

`PLACES_MOCK=true` iken Places'a hiç istek gitmez; Kadıköy çevresinde deterministik örnek işletmeler döner.
Harita anahtarı yoksa harita yerine enlem/boylam alanları kullanılır.

İlk kez: **Kayıt ol** → **çalışma alanı oluştur** → **Bölge taraması** → **Kayıtlar**.

## Ortam değişkenleri (`.env.local`)

| Değişken | Zorunlu | Nereden |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Evet | En az 32 karakter rastgele değer: `npx auth@latest secret` veya `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Evet | Uygulamanın dış adresi (ör. `https://crm.ornek.com`). Davet bağlantıları da bununla üretilir. |
| `DATABASE_PATH` | Hayır | SQLite dosyası; varsayılan `./data/app.db`. Kalıcı diskte olmalı. |
| `GOOGLE_PLACES_API_KEY` | Gerçek veri için | Google Cloud Console → *APIs & Services* → *Credentials* → *Create API key*. **Places API (New)** etkin olmalı. Anahtarı *API restrictions* ile yalnızca "Places API (New)"a, *Application restrictions* ile sunucunuzun IP adresine kısıtlayın. Projede faturalandırma açık olmalı. |
| `PLACES_MOCK` | Hayır | `true` = örnek veri, Places'a istek yok. Gerçek kullanımda `false`. |
| `SCAN_MAX_REQUESTS` | Hayır | Tarama başına en fazla Places isteği (varsayılan 50). |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Harita için | **Ayrı** bir anahtar oluşturun: yalnızca **Maps JavaScript API**'ye ve *HTTP referrers* ile alan adınıza (`https://crm.ornek.com/*`, geliştirmede `http://localhost:3000/*`) kısıtlayın. Bu anahtar tarayıcıya gider; Places anahtarı gitmez. |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Hayır | Gelişmiş işaretçiler için Map ID (Cloud Console → *Map Management*). Boşsa `DEMO_MAP_ID`. |
| `AUTH_INSECURE_COOKIES` | Hayır | Çerezler her zaman `Secure`'dur; tarayıcılar `http://localhost`'ta bunu kabul eder. Yalnızca localhost dışında düz HTTP ile geliştirme yapıyorsanız `true`. |

## Veritabanı ve migration'lar

```bash
npm run db:migrate     # drizzle/ altındaki migration'ları DATABASE_PATH'e uygular
npm run db:generate    # şema (src/server/db/schema.ts) değiştikten sonra yeni migration üretir
```

- Uygulama tabloları: `tenants`, `memberships`, `invitations`, `scans`, `leads`, `lead_events`, `usage_counters`,
  `place_locations`. Better Auth tabloları: `user`, `session`, `account`, `verification`.
- Better Auth şeması (`src/server/db/auth-schema.ts`) `npx auth@latest generate` ile üretildi. Better Auth
  yükseltmesinden sonra aynı komutla yenileyip `npm run db:generate` çalıştırın.
- Bağlantı WAL modunda, `foreign_keys = ON` ve `busy_timeout = 5000` ile açılır.

## Çalıştırma ve test

```bash
npm run dev            # geliştirme
npm run build && npm start   # üretim
npm test               # Vitest: izolasyon, tarama motoru, şema, mesajlaşma iskeleti
npm run lint           # ESLint (veritabanı erişim kuralı dahil)
npm run typecheck
```

Testler her dosya için geçici bir SQLite veritabanı oluşturur, migration'ları uygular ve sonra siler.

| Test | Ne doğrular |
| --- | --- |
| `tests/izolasyon.test.ts` | İki kiracı (A, B). A'nın bağlamıyla B'nin scans / leads / lead_events (ve davet, üye, sayaç, konum) verisini **listeleme, id ile okuma, güncelleme, silme** denemeleri boş / `null` (404) / `false` döner ve B'nin verisi değişmez. **Her depo fonksiyonu için bir test vardır**; depo modüllerine eklenen ve testi olmayan her yeni fonksiyon "kapsam" testini kırar. Ayrıca bileşik yabancı anahtarın başka kiracının kaydına olay bağlamayı veritabanı seviyesinde reddettiği ve `uye` rolünün yönetici işlemlerini yapamadığı test edilir. |
| `tests/tarama-motoru.test.ts` | Hücre geometrisi, doymuş hücrenin bölünmesi, `place_id` tekilleştirme, daire dışı sonuçların elenmesi, iç hücrelerde konum istenmemesi, istek bütçesi, 60 sonuç sınırında kapsam uyarısı. |
| `tests/sema.test.ts` | `leads` tablosunda Places içeriği tutan sütun olmadığı; tüm uygulama sütunlarının beyaz listede olduğu (yeni sütun bilinçli inceleme gerektirir); Places konumunun yalnızca tarihli `place_locations`'ta tutulduğu. |
| `tests/mesajlasma.test.ts` | 2. aşama iskeleti: ret işaretliler her zaman hariç, sandbox gerçek gönderim yapmaz. |

## Kiracı izolasyonu (SQLite, RLS yerine)

1. **Tek erişim noktası:** Veritabanına yalnızca `src/server/repo/` altındaki depo fonksiyonları erişir.
   Route handler, server action, sayfa, bileşen ve servisler `db`'yi, şemayı, `drizzle-orm`'u veya `better-sqlite3`'ü
   içe aktaramaz. Bu, `eslint.config.mjs` içindeki `no-restricted-imports` kuralıyla engellenir.
2. **TenantContext:** Her depo fonksiyonu ilk parametre olarak `TenantContext { tenantId, userId, rol }` alır. Bu
   markalı (brand) bir tiptir; yalnızca `src/server/oturum.ts` içinde **doğrulanmış Better Auth oturumu +
   `memberships` tablosundan** üretilir (`baglamUret`). İstemciden gelen `tenant_id` hiçbir yerde kullanılmaz.
   Aktif çalışma alanı çerezi yalnızca kullanıcının zaten üye olduğu alanlar arasından seçim yapar.
3. **Her sorguda tenant koşulu:** Her SELECT/UPDATE/DELETE `tenant_id = ctx.tenantId` koşulunu depo fonksiyonu
   içinde ekler. INSERT'te `tenant_id` dışarıdan alınmaz, bağlamdan yazılır.
4. **Id ile işlemler:** Sahiplik aynı sorguda doğrulanır (`WHERE id = ? AND tenant_id = ?`). Kayıt yoksa veya başka
   kiracınınsa depo `null`/`false` döner; route handler'lar **404**, server action'lar `notFound()` verir.
5. **Veritabanı güvencesi:** `lead_events (tenant_id, lead_id)` → `leads (tenant_id, id)` bileşik yabancı anahtarı,
   kod hatası olsa bile olayın başka kiracının kaydına bağlanmasını engeller.

## Google Places kuralları nasıl uygulanıyor

- **Veri kaynağı yalnızca Places API (New).** Scraping veya headless tarayıcı yok. Tüm çağrılar
  `src/server/places/istemci.ts` içinde, yalnızca sunucuda; `PLACES_MOCK=true` iken `mock.ts` kullanılır.
- **Saklama:** İşletme adı, telefon, adres, web sitesi, puan **hiçbir tabloya yazılmaz** ve önbelleğe alınmaz
  (`fetch(..., { cache: "no-store" })`). Veritabanında süresiz tutulan tek Places verisi `place_id`'dir.
  Ekranda gösterileceği an sunucuda Place Details ile çekilir ve yalnızca o isteğin belleğinde yaşar.
- **Konum (30 gün):** Places'tan gelen enlem/boylam yalnızca `place_locations` tablosunda `alinma_tarihi` ile tutulur.
  Okurken 30 günden eskiler yok sayılır; `npm run cleanup` fiziksel olarak siler. `scans.merkez_lat/lng`
  kullanıcının haritada seçtiği noktadır, Places içeriği değildir.
- **Atıf:** Places içeriği gösterilen ekranlarda "Google Maps" atfı (`src/components/google-atfi.tsx`) ve her kayıtta
  `googleMapsUri` bağlantısı ("Google Haritalar'da aç") vardır. Harita olarak yalnızca Google Maps JavaScript API.
- **CSV:** Yalnızca kullanıcının kendi verisi: `place_id, durum, ileti_izni, yetkili_adi, eposta, ek_telefon,
  etiketler, notlar, tarihler`. UTF-8 BOM + `;` ayraçlı (Türkçe Excel), formül enjeksiyonuna karşı korumalı.
- **Arama sınırı:** Ad/ilçe saklanmadığı için veritabanı araması yalnızca kullanıcının girdiği alanlarda çalışır;
  işletme adına göre süzme yalnızca görünen sayfadaki 20 kayıtta yapılır. Arayüzde bu belirtilir.
- **E-posta:** Places e-posta vermez; kullanıcı elle girer.

## Tarama mantığı, SKU seçimi ve tahmini maliyet

Fiyatlar Google'ın Ekim 2026 global fiyat listesinden alınmıştır (1.000 olay başına, ilk kademe):

| Kullanım | Uç nokta ve alan maskesi | SKU | Aylık ücretsiz | Sonrası |
| --- | --- | --- | --- | --- |
| Tarama, dairenin **içindeki** hücre | Text Search: `places.id,nextPageToken` | Text Search Essentials (IDs Only) | Sınırsız | $0 |
| Tarama, dairenin **sınırını kesen** hücre | Text Search: `places.id,places.location,nextPageToken` | Text Search Pro | 5.000 | $32 |
| Kayıt listesi (satır başına) | Place Details: ad, adres, ulusal telefon, googleMapsUri | Place Details Enterprise | 1.000 | $20 |
| Kayıt detayı | + uluslararası telefon, web sitesi, puan, konum, işletme durumu | Place Details Enterprise | 1.000 | $20 |
| Adres → konum | Text Search: `places.location,places.formattedAddress` | Text Search Pro | 5.000 | $32 |
| Harita yüklemesi | Maps JavaScript API | Dynamic Maps | 10.000 | $7 |

**Neden Text Search, Nearby Search değil:** Nearby Search'te `places.id` bile **Pro** SKU'sunu tetikler; Text
Search'te ise yalnızca ID istemek ücretsiz "IDs Only" SKU'sudur. Text Search'ün `locationRestriction`'ı yalnızca
dikdörtgen kabul ettiği için daire kare hücrelere bölünür:

1. Daireyi kapsayan kareyle başlanır (dörtlü ağaç, genişlik öncelikli).
2. Daire dışındaki hücreler atlanır.
3. Tamamen daire içindeki hücrede yalnızca ID istenir (ücretsiz). Sınırı kesen hücrede konum da istenir (Pro) ve
   daire dışındaki sonuçlar elenir.
4. Places istek başına 20, toplam en fazla 60 sonuç verir. İlk sayfası dolu ve devamı olan hücre "doymuş" sayılır
   ve 4'e bölünür; kalan sayfalar çekilmez, alt hücreler kapsar. En küçük hücrede (400 m) 3 sayfaya kadar çekilir.
5. Sonuçlar `place_id` ile tekilleştirilir. Bütçe biterse tarama durur ve `kapsam_tamam = false` ile arayüzde
   "kısmi" uyarısı gösterilir.

Her Places isteği hem `scans.istek_sayisi`'na hem `usage_counters`'a (kiracı + ay) işlenir; panelde "Bu ay Places
isteği" olarak görünür.

**Tahmini maliyet** (ücretsiz kotalar aşıldıktan sonra):

- **Bir tarama:** En kötü durumda 50 isteğin tamamı Pro → 50 × $0,032 = **en fazla ~$1,60**. Pratikte iç hücreler
  ücretsiz olduğundan daha az. Ayda 5.000 Pro isteği ücretsizdir (≈100 tam bütçeli tarama).
- **Kayıt listesi:** Her sayfa görüntüleme 20 Place Details Enterprise = **~$0,40**. Maliyetin asıl kaynağı budur.
  Örnek: ayda 1.000 liste sayfası görüntüleme ≈ 20.000 istek ≈ (20.000 − 1.000) × $0,02 ≈ **$380/ay**.
- **Detay:** görüntüleme başına ~$0,02.

> Not: Kayıt listesi ve detay aynı işletmeyi ayrı ayrı çeker; Places içeriği istekler arasında önbelleğe alınamadığı
> için bu bilinçli bir maliyettir. Azaltma seçenekleri "Açık kararlar" bölümündedir.

## Zamanlanmış temizlik (`npm run cleanup`)

`scripts/cleanup.ts` günde bir kez çalışmalıdır:

- 30 günden eski Places konumlarını (`place_locations`) siler (Google kuralı).
- Çalışma alanında "veri saklama süresi" ayarlıysa o süredir güncellenmeyen kayıtları ve olaylarını siler.
- Süresi dolmuş, kabul edilmemiş davetleri siler.

**Linux (cron):** `crontab -e` ile her gece 03:30'da:

```cron
30 3 * * * cd /srv/harita-crm && DATABASE_PATH=/var/lib/harita-crm/app.db /usr/bin/npm run cleanup >> /var/log/harita-crm-cleanup.log 2>&1
```

**systemd timer** veya **Windows Görev Zamanlayıcı** da kullanılabilir (komut: `npm run cleanup`, çalışma dizini:
proje klasörü, `DATABASE_PATH` ortam değişkeniyle).

## Barındırma

- **Kalıcı diskli bir sunucu gerekir:** VPS (Hetzner, DigitalOcean vb.) veya kalıcı volume'lu bir servis
  (Fly.io volume, Railway volume, Render disk). SQLite dosyası yerel diske yazılır.
- **Sunucusuz ortamlarda çalışmaz** (Vercel, Netlify Functions, AWS Lambda): dosya sistemi kalıcı değildir,
  örnekler arasında paylaşılmaz ve `better-sqlite3` yerel modülü bu ortamlarda kullanılamaz.
- Tek örnek (instance) çalıştırın: SQLite tek bir sunucudaki tek dosyadır. Önüne HTTPS sonlandıran bir ters vekil
  (Caddy, nginx) koyun; `BETTER_AUTH_URL`'i `https://` adresiyle ayarlayın.
- Node.js 22+ gerekir.

### Litestream ile yedekleme (önerilir)

[Litestream](https://litestream.io), SQLite'ın WAL değişikliklerini sürekli olarak S3 uyumlu bir depoya (AWS S3,
Cloudflare R2, Backblaze B2, MinIO) kopyalar. Uygulama zaten WAL modunda çalışır.

1. Kurulum (Debian/Ubuntu): [litestream.io/install](https://litestream.io/install) adresindeki `.deb` paketini indirin.
   Kurduktan sonra `litestream version` ile doğrulayın.
2. `/etc/litestream.yml`:

   ```yaml
   dbs:
     - path: /var/lib/harita-crm/app.db
       replicas:
         - type: s3
           bucket: harita-crm-yedek
           path: app.db
           endpoint: https://<hesap>.r2.cloudflarestorage.com   # AWS S3 için bu satırı kaldırın
           access-key-id: ${LITESTREAM_ACCESS_KEY_ID}
           secret-access-key: ${LITESTREAM_SECRET_ACCESS_KEY}
           retention: 168h
   ```

3. Erişim anahtarlarını ortam değişkeni olarak verip servisi açın: `sudo systemctl enable --now litestream`.
   Alternatif olarak uygulamayı Litestream altında başlatın:
   `litestream replicate -exec "npm start"` (bu durumda uygulama durunca Litestream da durur).
4. **Geri yükleme** (uygulama durdurulmuşken):
   `litestream restore -o /var/lib/harita-crm/app.db s3://harita-crm-yedek/app.db`
5. Geri yükleme provasını düzenli olarak ayrı bir makinede yapın.

## 2. aşama için hazırlık

`src/server/messaging/saglayici.ts`: `MessageProvider` arayüzü, gerçek gönderim yapmayan `SandboxSaglayici` ve ret
işaretli kayıtları her zaman hariç tutan `uygunAlicilar()`. İletilerde abonelikten çıkma bağlantısı zorunlu alandır.
`lead_events.tur` zaten `sms`, `eposta`, `ret` değerlerini içerir. Tek tıkla abonelikten çıkma sayfası, gönderim
kuyruğu ve "İletişim" ekranı 2. aşamada yapılacaktır.

## Proje yapısı

```
drizzle/                         migration SQL'leri (drizzle-kit)
scripts/migrate.ts, cleanup.ts   migration ve günlük temizlik
src/proxy.ts                     oturum çerezi yoksa /giris (iyimser; asıl kontrol sunucuda)
src/app/(auth)/                  giriş/kayıt, ilk çalışma alanı kurulumu
src/app/davet/[token]/           davet kabulü
src/app/(app)/                   panel, tarama, kayitlar, iletisim, ayarlar (+ server action'lar)
src/app/api/                     auth, taramalar, adres, kayitlar/disa-aktar
src/components/                  menü, harita, Google atfı
src/lib/                         sabitler, kategoriler, biçimlendirme
src/server/db/                   bağlantı ve şema (yalnızca repo/ ve auth erişir)
src/server/repo/                 kiracıya bağlı depo fonksiyonları; sistem/ = bağlam öncesi işler
src/server/places/               Places istemcisi + mock
src/server/scan/                 hücre geometrisi + tarama motoru (saf)
src/server/servisler/            tarama ve canlı bilgi servisleri
src/server/messaging/            2. aşama iskeleti
tests/                           Vitest
```

## Açık kararlar

1. **Liste maliyeti:** Listede telefon gösterilmesi her satırı Enterprise SKU'suna taşır (sayfa başı ~$0,40).
   Seçenekler: listede yalnızca ad ve adres gösterip telefonu detaya bırakmak (Place Details Pro, $17/1000; düşüş
   küçük), sayfa boyutunu düşürmek ya da listeyi yalnızca kullanıcı verisiyle gösterip Places bilgisini "göster"
   düğmesiyle istemek.
2. **Adres araması:** Adres → konum için Places Text Search (Pro) kullanılıyor; sonuç yalnızca haritayı ortalar.
   Kullanıcı bu noktayla tarama başlatırsa `scans.merkez_lat/lng` olarak saklanır. Bunu "kullanıcının seçtiği nokta"
   saymak bir yorumdur. Daha temkinli seçenek: merkezi yuvarlamak veya adres sonucunu ayrıca onaylatmak.
3. **E-posta gönderimi:** Davetler için `Postaci` arayüzü var; 1. aşamada yalnızca konsol adaptörü. Davet bağlantısı
   Ayarlar'da gösterilir. Gerçek SMTP/sağlayıcı seçimi ve e-posta doğrulaması (Better Auth `emailVerification`)
   bekliyor.
4. **Kategori listesi:** `src/lib/kategoriler.ts` içinde 12 kategori (Places Table A türleri). Hedef sektörlere göre
   genişletilmeli.
5. **Tarama yürütme:** 1. aşamada tarama, istek içinde senkron çalışır. Uzun taramalar için (yüksek bütçe) bir iş
   kuyruğuna taşınması gerekecek; uygulama kapanırsa "çalışıyor"da kalan taramalar için kurtarma yok.
6. **Veri saklama süresi:** Ayarlar'daki süre, o süredir **güncellenmeyen** kayıtları siler. "Oluşturulmadan bu yana"
   yorumu da mümkün; ürün kararı.
7. **Next.js önbelleği:** Şablonun açtığı `cacheComponents`/`partialPrefetching` kapatıldı; tüm sayfalar oturuma bağlı
   ve canlı Places verisi gösterdiği için klasik dinamik render kullanılıyor.
8. **Places politikaları:** Atıf metni "Google Maps" olarak eklendi. Yayın öncesi Google'ın güncel atıf ve marka
   kurallarını (logo kullanımı, üçüncü taraf atıfları) hukuki açıdan gözden geçirin.
