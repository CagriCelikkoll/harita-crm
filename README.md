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
| `PLACES_AYLIK_KOTA` | Hayır | Yeni çalışma alanlarının aylık Places kotası, **birim** cinsinden (varsayılan 6.000). Mevcut alanlar için `npm run kota`. |
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
- **Migration'ları her zaman `npm run db:migrate` ile uygulayın** (`drizzle-kit migrate` ile değil).
  SQLite'ta sütun kısıtını değiştirmek tabloyu yeniden oluşturmayı gerektirir; yabancı anahtarlar açıkken
  `DROP TABLE` bağlı tablolardaki `ON DELETE SET NULL/CASCADE` kurallarını tetikler. drizzle-kit'in migration
  içine yazdığı `PRAGMA foreign_keys=OFF` transaction içinde etkisizdir. `src/server/db/migrasyon.ts` denetimi
  transaction dışında kapatır, migration sonrası `PRAGMA foreign_key_check` ile doğrular ve yeniden açar.
  (`0001` için drizzle-kit'in ürettiği `INSERT … SELECT` de eski tabloda olmayan sütunları okuduğu için elle
  düzeltildi; yeni migration'ları gözden geçirin.)
- Canlı veritabanında migration öncesi yedek alın (Litestream bölümüne bakın).

## Çalıştırma ve test

```bash
npm run dev            # geliştirme
npm run build && npm start   # üretim
npm test               # Vitest (9 dosya)
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
| `tests/yarim-kalan-tarama.test.ts` | 10 dakikadan uzun "calisiyor" veya "kuyrukta" kalan taramaların "hata" + "Tarama yarıda kaldı, yeniden başlatın." olması; kiracı bazında (liste yüklenirken) ve tüm kiracılarda (uygulama başlangıcı); 10 dakika sınırı; kuyruktaki/bitmiş/taze taramalara dokunulmaması. |
| `tests/temizlik.test.ts` | Kaynağı ne olursa olsun tarama merkezlerinin 30 gün sonra silinip adres metni, yarıçap ve kaynağın kalması; merkezi silinmiş taramanın Places'a gitmeden açık mesajla hata vermesi; 30 günden eski Places konumlarının silinmesi. |
| `tests/migrasyon.test.ts` | Regresyon: tabloyu yeniden oluşturan migration'ın (`0001`) `leads.scan_id` bağlantılarını ve verileri koruması. |
| `tests/places-maske.test.ts` | Maliyet güvencesi: liste maskesinde Enterprise alanı olmaması (yalnızca ad + adres, Pro), detayın telefon/web sitesini ayrı çağrıda istemesi, taramada yalnızca ID. |
| `tests/kota.test.ts` | Varsayılan ve ortam değişkeninden kota; kotaya kadar ayırma ve sonrasında ret; %80 uyarı / %100 doldu; `npm run kota` mantığı; **eşzamanlılık:** aynı süreçte 40 eşzamanlı liste isteğinde (3 birim) kota 75 birimken tam 25 başarı ve **4 ayrı süreçte 1.200 denemede tam 500 (kota) başarı**; kota dolunca taramanın kısmi bitmesi; liste/detayda Places çağrısı yapılmaması; gerçek istemcide kota doluyken HTTP isteği gönderilmemesi ve başarısız istekte iade. |
| `tests/kota-birim.test.ts` | Birim ağırlıkları (Essentials = 1, ücretsiz = 0, oranla yuvarlama); her çağrının SKU birimi; ücretsiz isteğin kota doluyken yapılıp kotadan düşmemesi; kalan birime göre detay/liste ayrımı; **İstanbul ay sınırı** (31 Ekim 23:30 → 1 Kasım 00:30) ve geçiş sonrası iadenin doğru aya yapılması. |

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
   kiracınınsa depo `null`/`false` döner ve route handler **404** verir. Kayıt ve olay işlemleri REST
   route'larıdır (`/api/kayitlar/[id]`, `/api/kayitlar/[id]/olaylar`, `/api/olaylar/[id]`); Ayarlar'daki server
   action'lar `notFound()` kullanır. Değişiklik yapan tüm API isteklerinde Origin kontrolü vardır (yabancı → 403).
5. **Veritabanı güvencesi:** `lead_events (tenant_id, lead_id)` → `leads (tenant_id, id)` bileşik yabancı anahtarı,
   kod hatası olsa bile olayın başka kiracının kaydına bağlanmasını engeller.

## Google Places kuralları nasıl uygulanıyor

- **Veri kaynağı yalnızca Places API (New).** Scraping veya headless tarayıcı yok. Tüm çağrılar
  `src/server/places/istemci.ts` içinde, yalnızca sunucuda; `PLACES_MOCK=true` iken `mock.ts` kullanılır.
- **Saklama:** İşletme adı, telefon, adres, web sitesi, puan **hiçbir tabloya yazılmaz** ve önbelleğe alınmaz
  (`fetch(..., { cache: "no-store" })`). Veritabanında süresiz tutulan tek Places verisi `place_id`'dir.
  Ekranda gösterileceği an sunucuda Place Details ile çekilir ve yalnızca o isteğin belleğinde yaşar.
- **Konum (30 gün):** Places'tan gelen enlem/boylam yalnızca `place_locations` tablosunda `alinma_tarihi` ile tutulur.
  Okurken 30 günden eskiler yok sayılır; `npm run cleanup` fiziksel olarak siler.
- **Tarama merkezi (30 gün):** Merkez koordinatları (`scans.merkez_lat/lng`), **kaynağı ne olursa olsun**
  `npm run cleanup` ile 30 gün sonra silinir. Kullanıcının yazdığı `adres_metni` ve yarıçap kalır.
  `merkez_kaynagi` (`harita` = haritaya tıklama / elle giriş, `adres` = adres araması) yalnızca bilgi amaçlıdır;
  istemcinin bildirdiği bu değere hiçbir saklama kararı bağlı değildir. Geçmişteki "Tekrar kullan" düğmesi,
  koordinat silinmişse adres metni varsa adresi yeniden arar, yoksa haritada yeni bir nokta seçtirir
  (nokta seçilene kadar "Taramayı başlat" kapalıdır).
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
| Kayıt listesi (satır başına) | Place Details: `id,displayName,formattedAddress` | **Place Details Pro** | 5.000 | $17 |
| Kayıt detayı (panel açılınca, ayrı çağrı) | ad, adres, telefonlar, web sitesi, puan, konum, işletme durumu, googleMapsUri | Place Details Enterprise | 1.000 | $20 |
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

**Liste ve detay neden ayrı:** Places bir isteği maskedeki en yüksek katmandan **tek** olay olarak faturalar.
Telefon ve web sitesi Enterprise alanlarıdır; listede istenseydi her satır Enterprise olurdu. Bu yüzden:

- Liste yalnızca **ad + adres** ister. `displayName` Pro katmanında olduğundan en ucuz uygun katman **Place Details
  Pro**'dur (yalnızca adres isteseydik Essentials olurdu, ama ad gerekli).
- Telefon, web sitesi ve puan yalnızca **detay paneli açıldığında**, tek bir Enterprise çağrısıyla çekilir.
- Detay paneli istemcide açılır; kayıt seçmek veya kayıt üzerinde işlem yapmak (durum, not, ret, e-posta) listeyi
  **yeniden çekmez** ve Places'a gitmez. Liste yalnızca filtre/sayfa değiştiğinde çekilir.
  (`tests/places-maske.test.ts` liste maskesine Enterprise alanı eklenmesini engeller.)

**Tahmini aylık maliyet** — varsayım: ayda **1.000 liste sayfası** + **300 detay görüntüleme** (tek çalışma alanı,
ücretsiz kotalar Google faturalandırma hesabı başına ve SKU başına aylıktır):

| Kalem | İstek | Ücretsiz | Ücretli | Tutar |
| --- | --- | --- | --- | --- |
| Liste: 1.000 sayfa × 20 satır, Place Details Pro | 20.000 | 5.000 | 15.000 × $17/1000 | **$255** |
| Detay: 300 görüntüleme, Place Details Enterprise | 300 | 1.000 | 0 | **$0** |
| **Toplam** | | | | **≈ $255/ay** |

- Detay kotayı aşarsa (ayda 1.000'den fazla görüntüleme) her biri ~$0,02 ekler.
- Karşılaştırma: önceki tasarım (listede telefon, Enterprise; her detay açılışında listenin yeniden çekilmesi) aynı
  varsayımla ≈ 26.300 Enterprise isteği ≈ **$506/ay** ederdi.
- **Taramalar** buna eklenir: tarama başına en fazla 50 istek, en kötü durumda tamamı Text Search Pro → **≤ $1,60**
  (iç hücreler ücretsiz). Text Search Pro'nun ayda 5.000 ücretsiz isteği vardır (≈100 tam bütçeli tarama).
- Adres araması: arama başına 1 Text Search Pro isteği (aynı 5.000 ücretsiz kota).
- Panelde ve Ayarlar'da "Bu ayki Places kullanımı" çubuğu bu işlemlerin birimlerini kotayla birlikte gösterir.

## Aylık Places kotası (kiracı başına)

Maliyetin kontrolden çıkmaması için her çalışma alanının aylık bir Places kotası vardır
(`tenants.aylik_places_kotasi`). Kota **maliyet ağırlıklı birim** cinsindendir.

**Birimler** — tek kaynak `src/lib/places-birimleri.ts` (Ayarlar'daki "Hangi işlem kaç birim?" tablosu da buradan
okur). En ucuz ücretli SKU (Place Details Essentials, $5/1000) = 1 birim; diğerleri fiyatına oranla, tam sayıya
yuvarlanır; ücretsiz SKU 0 birimdir. Fiyat değişirse yalnızca bu dosyadaki fiyatlar güncellenir.

| İşlem | SKU | $/1000 | Birim |
| --- | --- | --- | --- |
| Tarama, dairenin içi | Text Search Essentials (IDs Only) | 0 | 0 |
| Tarama, dairenin sınırı; adres araması | Text Search Pro | 32 | 6 |
| Kayıt listesi satırı (ad + adres) | Place Details Pro | 17 | 3 |
| Kayıt detayı (telefon, web, puan) | Place Details Enterprise | 20 | 4 |

Ücretsiz istekler kotadan düşmez (kota doluyken de yapılabilir) ama `SCAN_MAX_REQUESTS` tarama sınırına sayılmaya
devam eder. Yukarıdaki maliyet varsayımı (1.000 liste sayfası + 300 detay) ≈ 60.000 + 1.200 = **61.200 birim/ay**
eder; varsayılan 6.000 birim bunun yaklaşık onda biridir (≈ 100 liste sayfası).

- **Varsayılan:** Yeni çalışma alanları `PLACES_AYLIK_KOTA` ortam değişkeniyle (yoksa **6.000 birim**) başlar.
  Birime geçiş migration'ı (`0003_places_birim_kotasi`) mevcut kotaları ve sayaçları 3 ile çarptı (liste satırı 3
  birim olduğu için kullanım oranı korunur; 2.000 istek → 6.000 birim).
- **Değiştirmek:** Şimdilik yönetici arayüzü yok; sunucuda:
  ```bash
  npm run kota -- <tenant-slug> <birim>     # ör. npm run kota -- ege-satis-ekibi 15000
  ```
  Slug, Ayarlar sayfasındaki komut örneğinde görünür.
- **Kontrol:** Her ücretli Places isteğinden **önce** o işlemin birimi ayrılır (tarama, liste, detay, adres
  araması). Kalan birim yetmezse istek hiç yapılmaz (ör. 3 birim kalmışsa detay yapılmaz, liste satırı yapılır).
  - **Tarama:** Kota dolduğunda tarama, bütçe bittiğindeki "kısmi tarama" mantığıyla durur. O ana kadar bulunanlar
    kaydedilir; tarama "tamamlandı (kısmi)" olur ve "Bu ayki veri kotanız doldu." mesajı gösterilir.
  - **Liste ve detay:** Places çağrısı yapılmaz; kullanıcının kendi verisi (durum, ileti izni, etiketler, notlar,
    iletişim bilgileri, etkinlikler) görünmeye devam eder ve "Bu ayki veri kotanız doldu" uyarısı çıkar.
  - **Adres araması:** 429 ve aynı uyarı.
- **Uyarı:** Panel ve Ayarlar'daki kullanım çubuğu %80'de sarı uyarı, %100'de kırmızı "kota doldu" gösterir.
  Kayıtlar sayfası da uyarı eşiği aşıldığında çubuğu gösterir.
- **Atomiklik:** Kontrol ve artırma tek bir SQL ifadesidir
  (`INSERT … ON CONFLICT DO UPDATE … WHERE kullanilan + adet <= kota … RETURNING`). SQLite her ifadeyi atomik
  yürüttüğü için aynı süreçteki eşzamanlı istekler ve ayrı süreçler kotayı aşamaz (`tests/kota.test.ts` 4 ayrı
  süreçle sınar).
- **İade:** Ağ hatası veya Google'ın reddettiği (404 dışı hata) istekte ayrılan birimler, **ayrıldıkları aya**
  geri verilir; Google başarısız isteği faturalamaz.
- **Ay sınırı:** Kota ayı **Europe/Istanbul** takvimine göredir; her ayın 1'inde 00:00'da (İstanbul) yeni sayaç
  başlar. Sayaç `usage_counters (tenant_id, ay)` satırındadır (sütun adı `places_istek_sayisi` tarihseldir, değer
  birimdir). `tests/kota-birim.test.ts` 31 Ekim 23:30 → 1 Kasım 00:30 geçişini sınar.

## Zamanlanmış temizlik (`npm run cleanup`)

`scripts/cleanup.ts` günde bir kez çalışmalıdır:

- 30 günden eski Places konumlarını (`place_locations`) siler (Google kuralı).
- 30 günden eski **tüm** taramaların merkez koordinatlarını (`merkez_lat/lng`) siler; adres metni ve yarıçap kalır.
- Çalışma alanında "veri saklama süresi" ayarlıysa o süredir güncellenmeyen kayıtları ve olaylarını siler.
- Süresi dolmuş, kabul edilmemiş davetleri siler.
- Yarıda kalmış taramaları "hata" yapar (aşağıya bakın).

**Linux (cron):** `crontab -e` ile her gece 03:30'da:

```cron
30 3 * * * cd /srv/harita-crm && DATABASE_PATH=/var/lib/harita-crm/app.db /usr/bin/npm run cleanup >> /var/log/harita-crm-cleanup.log 2>&1
```

**systemd timer** veya **Windows Görev Zamanlayıcı** da kullanılabilir (komut: `npm run cleanup`, çalışma dizini:
proje klasörü, `DATABASE_PATH` ortam değişkeniyle).

## Yarıda kalan taramalar

Tarama 1. aşamada istek içinde senkron çalışır. Bu yüzden aşağıdaki taramalar `durum = 'hata'`,
`hata_mesaji = "Tarama yarıda kaldı, yeniden başlatın."` yapılır:

- 10 dakikadan uzun süredir **"calisiyor"** olanlar (süreç tarama sırasında kapanmış); süre `scans.baslama_tarihi`'nden
  ölçülür,
- 10 dakikadan uzun süredir **"kuyrukta"** olanlar (çalıştırma isteği hiç gelmemiş, ör. sekme kapanmış); süre
  `scans.olusturma_tarihi`'nden ölçülür. Bu taramalar Places'a hiç gitmemiştir.

Kontrol şu anlarda yapılır:

- **Uygulama başlarken** (`src/instrumentation.ts` → tüm kiracılar),
- **Tarama listesi yüklenirken** (Bölge taraması ve Panel sayfaları → yalnızca o kiracı),
- `npm run cleanup` sırasında.

Mesaj tarama geçmişinde ve panelde görünür; "Tekrar kullan" düğmesi ayarları forma alır.

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
scripts/migrate.ts, cleanup.ts,  migration, günlük temizlik,
  kota.ts                        kota değiştirme
src/proxy.ts                     oturum çerezi yoksa /giris (iyimser; asıl kontrol sunucuda)
src/app/(auth)/                  giriş/kayıt, ilk çalışma alanı kurulumu
src/app/davet/[token]/           davet kabulü
src/app/(app)/                   panel, tarama, kayitlar (istemci detay paneli), iletisim, ayarlar
src/app/api/                     auth, taramalar, adres, kayitlar/[id] (+olaylar), olaylar/[id], kayitlar/disa-aktar
src/instrumentation.ts           başlangıçta yarıda kalan taramaları kapatır
src/components/                  menü, harita, Google atfı
src/lib/                         sabitler, kategoriler, biçimlendirme
src/server/db/                   bağlantı, şema, güvenli migration (yalnızca repo/ ve auth erişir)
src/server/repo/                 kiracıya bağlı depo fonksiyonları; sistem/ = bağlam öncesi işler
src/server/places/               Places istemcisi + mock
src/server/scan/                 hücre geometrisi + tarama motoru (saf)
src/server/servisler/            tarama ve canlı bilgi servisleri
src/server/messaging/            2. aşama iskeleti
tests/                           Vitest
```

## Alınan kararlar

- **Liste maliyeti:** Telefon ve web sitesi listeden kaldırıldı; liste yalnızca ad + adres (Place Details Pro),
  detay paneli Enterprise alanlarını ayrı çağrıyla çeker. Ayrıntı ve maliyet yukarıda.
- **Tarama merkezi:** İmzalı belirteç yerine, kaynağı ne olursa olsun tüm merkez koordinatları 30 gün sonra
  silinir; `merkez_kaynagi` bilgi amaçlı kalır.
- **Yarıda kalan taramalar:** 10 dakika kuralı hem "calisiyor" hem "kuyrukta" için (yukarıda).
- **Aylık Places kotası:** kiracı başına, atomik; yönetici arayüzü yok, `npm run kota` (yukarıda).
- **Kota birimi:** maliyet ağırlıklı (Essentials tabanı), varsayılan 6.000 birim; kota ayı İstanbul saatine göre.
- **Next.js önbelleği:** `cacheComponents`/`partialPrefetching` kapalı; tüm sayfalar oturuma bağlı ve canlı Places
  verisi gösterdiği için klasik dinamik render.
- **lead_events.sistem** sütunu ve `(tenant_id, lead_id)` bileşik yabancı anahtarı.

## Açık kararlar

1. **E-posta gönderimi:** Davetler için `Postaci` arayüzü var; şimdilik yalnızca konsol adaptörü (davet bağlantısı
   Ayarlar'da gösterilir). Gerçek SMTP/sağlayıcı ve e-posta doğrulaması (Better Auth `emailVerification`) sonraya.
2. **Kota yönetimi:** Kota yalnızca komut satırından değişir; yönetici arayüzü ve kota dolmadan önce e-posta
   uyarısı sonraya.
3. **Birimler ve ücretsiz kotalar:** Birimler yalnızca fiyata oranlıdır; Google'ın SKU başına aylık ücretsiz
   kullanımı (Pro 5.000, Enterprise 1.000) hesaba katılmaz ve faturalandırma hesabı tüm kiracılar için ortaktır.
4. **Kategori listesi:** `src/lib/kategoriler.ts` içinde 12 kategori (Places Table A türleri). Hedef sektörlere göre
   genişletilmeli.
5. **Tarama yürütme:** Tarama hâlâ istek içinde senkron çalışır; yüksek bütçeli taramalar için iş kuyruğu gerekecek.
6. **Veri saklama süresi:** Ayarlar'daki süre, o süredir **güncellenmeyen** kayıtları siler. "Oluşturulmadan bu yana"
   yorumu da mümkün; ürün kararı.
7. **Places politikaları:** Atıf metni "Google Maps" olarak eklendi. Yayın öncesi Google'ın güncel atıf ve marka
   kurallarını (logo kullanımı, üçüncü taraf atıfları) hukuki açıdan gözden geçirin.
