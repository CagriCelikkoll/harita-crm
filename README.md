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
| `ILETI_SIFRELEME_ANAHTARI` | Mesajlaşma için | 32 bayt rastgele, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Sağlayıcı (SMTP) kimlik bilgilerini AES-256-GCM ile şifreler. Değişirse kayıtlı sağlayıcı bilgileri yeniden girilmelidir. |
| `ILETI_IMZA_ANAHTARI` | Mesajlaşma için | 32 bayt rastgele, base64 (yukarıdaki komut). Abonelikten çıkma bağlantılarını imzalar ve engel listesi özetlerini üretir. **Değiştirmeyin:** eski bağlantılar geçersiz olur ve engel listesi eşleşmez. Yoksa "ret" işaretleme ve abonelikten çıkma çalışmaz; başlangıçta uyarı yazılır. |
| `GUNLUK_EPOSTA_SINIRI`, `GUNLUK_SMS_SINIRI` | Hayır | Çalışma alanı başına günlük gönderim sınırı (varsayılan 300 / 200). Alan bazında `npm run sinir`. |
| `WORKER_ARALIK_SN`, `WORKER_PARTI` | Hayır | Gönderim işçisinin tur aralığı (varsayılan 30 sn) ve tur başına en fazla mesaj (20). |
| `AUTH_INSECURE_COOKIES` | Hayır | Çerezler her zaman `Secure`'dur; tarayıcılar `http://localhost`'ta bunu kabul eder. Yalnızca localhost dışında düz HTTP ile geliştirme yapıyorsanız `true`. |

Komut satırı betikleri (`db:migrate`, `cleanup`, `kota`, `sinir`, `worker`) de Next.js ile aynı `.env`,
`.env.production` ve `.env.local` dosyalarını yükler (`scripts/ortam.ts`); süreçte zaten tanımlı değişkenler ezilmez.

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
npm run worker         # gönderim işçisi (ayrı süreç; aşağıda "Gönderim işçisi")
npm test               # Vitest (13 dosya)
npm run lint           # ESLint (veritabanı erişim kuralı dahil)
npm run typecheck
```

Testler her dosya için geçici bir SQLite veritabanı oluşturur, migration'ları uygular ve sonra siler.

| Test | Ne doğrular |
| --- | --- |
| `tests/izolasyon.test.ts` | İki kiracı (A, B). A'nın bağlamıyla B'nin scans / leads / lead_events (ve davet, üye, sayaç, konum) verisini **listeleme, id ile okuma, güncelleme, silme** denemeleri boş / `null` (404) / `false` döner ve B'nin verisi değişmez. **Her depo fonksiyonu için bir test vardır** (mesajlaşma tabloları dahil: ileti ayarları, sağlayıcılar, engel listesi, sayaçlar, kampanyalar, kuyruk); depo modüllerine eklenen ve testi olmayan her yeni fonksiyon ve teste kaydedilmemiş her yeni depo dosyası "kapsam" testini kırar. Ayrıca bileşik yabancı anahtarın başka kiracının kaydına olay bağlamayı veritabanı seviyesinde reddettiği ve `uye` rolünün yönetici işlemlerini yapamadığı test edilir. |
| `tests/tarama-motoru.test.ts` | Hücre geometrisi, doymuş hücrenin bölünmesi, `place_id` tekilleştirme, daire dışı sonuçların elenmesi, iç hücrelerde konum istenmemesi, istek bütçesi, 60 sonuç sınırında kapsam uyarısı. |
| `tests/sema.test.ts` | `leads` tablosunda Places içeriği tutan sütun olmadığı; tüm uygulama sütunlarının beyaz listede olduğu (yeni sütun bilinçli inceleme gerektirir); Places konumunun yalnızca tarihli `place_locations`'ta tutulduğu. |
| `tests/mesajlasma.test.ts` | `{isletme}` şablonu (yalnızca kullanıcının girdiği ad; boşsa hitap ya da çevresiyle kaldırma), telefon/e-posta normalleştirme, **alıcı kuralları** fonksiyonunun her nedeni (ret, bireysel + izinsiz, iletişim yok, engel, cep değil, Places'tan alınacak telefon), sandbox sağlayıcı. |
| `tests/kampanya.test.ts` | Kampanya oluşturmada ve **gönderim anında** ret / engel listesi / bireysel + izinsiz kayıtların hariç tutulması (kampanyadan sonra gelen ret dahil); elle ret sonrası kayıt silinip aynı adresle yeniden eklense de gönderilmemesi; ticari ileti bilgileri olmadan sandbox dışı kampanyanın başlatılamaması; gerçek gönderimde olay + `yeni → iletisimde`, sandbox'ta durum değişmemesi; **günlük sınır** (ertesi günün 09:00'ına kalma) ve **gönderim saati** (İstanbul); iptal; **idempotans:** tekrar çalıştırma, aynı süreçte eşzamanlı turlar ve **3 ayrı süreçte 40 mesajın her birinin tam bir kez** gönderilmesi; geçici hatada en fazla 3 deneme ve sınır iadesi; çöken işçinin mesajının "belirsiz" kapanıp yeniden denenmemesi; İYS reddinin ret akışına girmesi; zamanlanmış kampanya. |
| `tests/saglayici-guvenlik.test.ts` | Kimlik bilgilerinin veritabanında düz metin olmaması; başka kiracının / kanalın AAD'siyle ya da başka anahtarla çözülememesi; **ayarlar, sağlayıcı, test gönderimi ve kampanya API yanıtlarının hiçbirinde** sunucu, kullanıcı adı ve şifrenin geçmemesi; üyenin sağlayıcı kaydedememesi; test e-postasının yalnızca kayıtlı gönderen adresine gitmesi ve saatte 5 sınırı; **SMTP SSRF:** iç ağ / loopback / link-local / metadata / IPv4-eşlemeli IPv6 adreslerinin ve izinsiz portların reddi, çözülen adreslerden biri bile iç ağdaysa ret, bağlantının doğrulanan IP'ye yapılması ve her gönderimde yeniden doğrulama (DNS yeniden bağlama). |
| `tests/abonelik.test.ts` | Belirtecin tek bir baytı bile değiştirilince, kısaltılınca ya da kiracı/kayıt alanı başka kiracınınkiyle değiştirilince reddedilmesi; A'nın geçerli belirtecinin B'nin kaydını ve engel listesini etkilememesi; tek tıkla çıkışta `ret` + engel listesi + olay (tekrar tıklamada çift olay yok); kayıt silinmiş olsa da engel listesine yazma; sayfanın yalnızca gönderen unvanını döndürmesi; e-posta altbilgisi ve ham iletideki `List-Unsubscribe` / `List-Unsubscribe-Post` başlıkları. |
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
   Kullanıcısız sistem akışları bağlamı `src/server/repo/sistem/` içinde, kendi doğrulamalarından sonra üretir:
   gönderim işçisi (kuyruk satırının kiracısı) ve abonelikten çıkma (imzalı belirtecin kiracısı).
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

## Mesajlaşma (e-posta kampanyaları)

Gönderen her zaman çalışma alanının kendisidir. Tüm gönderimler `MessageProvider` arayüzünden geçer
(`src/server/messaging/saglayici.ts`). Bir kanalın sağlayıcısı tanımlı değilse kampanya **sandbox**'tır: gerçek
gönderim yapılmaz, gönderilecek metin kuyruk satırına kaydedilir ve kampanya detayında görülür. Sağlayıcı tanımlıyken
de "Test modu" ile sandbox kampanya başlatılabilir.

**Alıcı kuralları** — tek fonksiyon: `aliciDegerlendir()` (`src/server/messaging/alici-kurallari.ts`). Kampanya
özetinde, kuyruğa eklerken ve işçide **her mesajdan hemen önce** çağrılır:

1. `ileti_izni = 'ret'` → her zaman hariç.
2. `alici_turu = 'bireysel'` → yalnızca `ileti_izni = 'onayli'` ise gönderilir (Places'tan gelen kayıtlar
   varsayılan olarak `tacir_esnaf`'tır; kayıt detayından değiştirilir).
3. E-posta yalnızca kaydın kullanıcı tarafından girilen `eposta` alanına gider (Places e-posta vermez).
4. Adres **engel listesindeyse** hariç.

**Engel listesi** (`engel_listesi`): ret gelen her adres (abonelikten çıkma, elle "ileti reddi" işaretleme, İYS
reddi) buraya yazılır; kayıt silinse ya da işletme yeni bir taramada tekrar bulunsa bile o adrese gönderilmez.
Adresin kendisi değil, kiracıya bağlı anahtarlı özeti (HMAC-SHA256, `ILETI_IMZA_ANAHTARI`) tutulur. Temizlikte
silinmez.

**Ret akışı** (`retIsle`, tek yer): kayıt `ileti_izni = 'ret'`, adres(ler) engel listesine, `lead_events`'e `ret`.

**Ticari ileti** (Ayarlar): gönderen unvanı, iletişim bilgisi, İYS kayıt numarası ve *"Ticari elektronik ileti
gönderimlerinde İYS kaydı ve 6563 sayılı Kanun kapsamındaki yükümlülüklerin sorumluluğu çalışma alanımıza aittir."*
onayı (kim / ne zaman kaydedilir). Bunlar olmadan sandbox dışı kampanya başlatılamaz; işçi de gönderimden önce
yeniden kontrol eder.

**E-posta** (`src/server/messaging/smtp.ts`, nodemailer): çalışma alanı kendi SMTP sunucusu, kullanıcı, şifre ve
gönderen adresini girer. Her e-postada gönderen unvanı, iletişim bilgisi, İYS no, tek tıkla abonelikten çıkma
bağlantısı ve `List-Unsubscribe` / `List-Unsubscribe-Post: List-Unsubscribe=One-Click` başlıkları bulunur.

- **Kimlik bilgileri** `saglayici_ayarlari.sifreli_veri`'de AES-256-GCM ile şifreli (`ILETI_SIFRELEME_ANAHTARI`; ek
  doğrulanmış veri = kiracı|kanal). Hiçbir API yanıtında dönmez; arayüz yalnızca "tanımlı / tanımlı değil" gösterir.
- **SSRF koruması** (`ag-guvenligi.ts`): port yalnızca 25, 465, 587, 2525. Sunucu adı kaydederken ve **her
  bağlantıdan önce** DNS ile çözülür; çözülen adreslerden biri bile loopback, özel ağ (10/8, 172.16/12,
  192.168/16), CGNAT, link-local (169.254/16, bulut metadata dahil), 0.0.0.0, çok noktaya yayın ya da bunların IPv6
  karşılıklarıysa (::1, fc00::/7, fe80::/10, IPv4-eşlemeli adresler) reddedilir. Bağlantı doğrulanan IP'ye yapılır,
  TLS sertifikası sunucu adına göre denetlenir (DNS yeniden bağlamaya karşı).
- **Test e-postası** yalnızca kayıtlı gönderen adresine gider (alıcı istemciden alınmaz); kiracı başına saatte 5.

**Abonelikten çıkma:** `https://<BETTER_AUTH_URL>/abonelik/<belirteç>`. Belirteç 82 baytlık, imzalı (HMAC-SHA256,
`ILETI_IMZA_ANAHTARI`'ndan türetilen anahtar) ve kiracı + kayıt + kanal + adres özetine bağlıdır; kişisel veri
taşımaz. Sayfa (oturumsuz) yalnızca gönderen unvanını gösterir; "Abonelikten çık" butonu ya da e-posta istemcisinin
tek tıkla çıkışı (`POST /api/abonelik/<belirteç>`) ret akışını çalıştırır. Sahte/değiştirilmiş belirteç reddedilir;
bir kiracının belirteci başka kiracının kaydını etkileyemez.

**Kampanya akışı** (İletişim sayfası): kanal, alıcı grubu (durum, etiket, alıcı türü), `{isletme}` yer tutuculu
şablon ve canlı önizleme → **gönderim özeti** (gönderilecek alıcı sayısı; hariç tutulanların nedenlere göre
dökümü; günlük sınır nedeniyle sonraki günlere kalacaklar; "İşletme adı girilmemiş: N kayıt") → hemen başlat ya da
ileri tarihe zamanla. Kampanya detayı: ilerleme, nedenlere göre döküm, alıcı bazında durum ve hata, iptal.

`{isletme}` **yalnızca** kaydın "İşletme adı (sizin kaydınız)" alanından (`leads.isletme_adi`, kullanıcı verisi)
dolar; Google'dan gelen ad hiçbir koşulda mesaja girmez. Alan boşsa kampanyada tanımlanan "boş isim hitabı"
kullanılır; o da yoksa yer tutucu çevresindeki boşluk ve virgülle birlikte kaldırılır
(`"Merhaba {isletme},"` → `"Merhaba,"`).

**Kuyruk ve sınırlar:**

- `message_queue`: kampanya × kayıt başına bir satır; alıcı adresi tutulmaz, gönderim anında kayıttan okunur.
- **Günlük sınır**: kiracı ve kanal başına, İstanbul gününe göre, atomik sayaçla (`gonderim_sayaclari`; Places
  kotasıyla aynı tek ifade kalıbı). Varsayılan e-posta 300, SMS 200; ortam değişkeni ya da
  `npm run sinir -- <slug> <eposta|sms> <sayı|varsayilan>`. Sınıra takılan mesaj ertesi günün gönderim
  başlangıcına kalır.
- **Gönderim saatleri**: varsayılan 09:00–20:00 İstanbul, Ayarlar'dan değiştirilir; dışında kalan mesaj bekler.
- Her gönderim `lead_events`'e yazılır; durumu `yeni` olan kayıt `iletisimde` olur.

### Gönderim işçisi (`npm run worker`)

İşçi, web sunucusundan **ayrı** sürekli çalışan bir süreçtir; kuyruğu küçük partiler halinde işler:

1. Zamanı gelen kampanyaları başlatır; 10 dakikadan uzun "gönderiliyor" kalan mesajları "belirsiz" kapatır.
2. Hazır mesajları **tek bir SQL ifadesiyle** (`UPDATE … WHERE durum='kuyrukta' … RETURNING`) alır: aynı mesajı iki
   işçi alamaz, tekrar çalıştırmak çift gönderim yapmaz.
3. Her mesaj için: gönderim saati → alıcı kuralları (yeniden) → ticari ileti ön koşulları → günlük sınır → gönderim.
4. Geçici hata (iletinin gitmediği kesin: bağlantı kurulamadı, SMTP 4xx) en fazla 3 deneme (1, 5 dk arayla);
   kalıcı ya da belirsiz sonuç yeniden denenmez. Gönderilemeyen mesajın günlük sınır birimi iade edilir.

```bash
npm run worker               # sürekli (WORKER_ARALIK_SN, varsayılan 30 sn)
npm run worker -- --bir-kez  # tek tur (ör. cron ile dakikada bir)
```

**systemd** (`/etc/systemd/system/harita-crm-worker.service`):

```ini
[Unit]
Description=Harita CRM gönderim işçisi
After=network-online.target

[Service]
WorkingDirectory=/srv/harita-crm
EnvironmentFile=/srv/harita-crm/.env.local
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=5
User=harita-crm

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now harita-crm-worker`. SIGTERM'de eldeki turu bitirip çıkar. Birden fazla işçi aynı
veritabanında güvenle çalışabilir (tek sunucu, tek SQLite dosyası).

### Gerçek e-posta göndermek için çalışma alanının hazırlaması gerekenler

1. **İYS:** Ticari elektronik ileti göndermek için İleti Yönetim Sistemi'ne (iys.org.tr) hizmet sağlayıcı olarak
   kayıt; İYS kayıt numarası Ayarlar → Ticari ileti'ye girilir. Tacir/esnaf alıcılar için İYS'de ret kontrolü,
   bireysel alıcılar için açık onay gerekir (6563 sayılı Kanun ve Ticari İletişim ve Ticari Elektronik İletiler
   Hakkında Yönetmelik). Hukuki sorumluluk çalışma alanındadır (Ayarlar'daki onay).
2. **SMTP hesabı:** kendi alan adına ait bir gönderen adresi ve SMTP erişimi (kurumsal e-posta sağlayıcısı ya da
   işlemsel e-posta servisi). Toplu gönderime izin verdiğinden ve gönderim sınırlarından emin olun.
3. **Alan adı doğrulaması:** gönderen alan adı için SPF, DKIM ve DMARC kayıtları (sağlayıcının belgelerine göre).
   Aksi halde iletiler spam'e düşer; Gmail/Yahoo toplu gönderimde bunları ve tek tıkla abonelikten çıkmayı zorunlu
   tutar.
4. Ayarlar → E-posta (SMTP) → bilgileri kaydet → **Test e-postası gönder** (gönderen adresine gelir).
5. Önce **Test modu** ile bir kampanya oluşturup kaydedilen metni kontrol edin; sonra gerçek kampanya.
6. Sunucuda `ILETI_SIFRELEME_ANAHTARI`, `ILETI_IMZA_ANAHTARI` ve `BETTER_AUTH_URL` (abonelik bağlantıları bu adresle
   üretilir) tanımlı olmalı ve işçi çalışıyor olmalı.

## Proje yapısı

```
drizzle/                         migration SQL'leri (drizzle-kit)
scripts/migrate.ts, cleanup.ts,  migration, günlük temizlik,
  kota.ts, sinir.ts, worker.ts   kota / günlük sınır değiştirme, gönderim işçisi
  ortam.ts                       betikler için .env yükleme
src/proxy.ts                     oturum çerezi yoksa /giris (iyimser; asıl kontrol sunucuda)
src/app/(auth)/                  giriş/kayıt, ilk çalışma alanı kurulumu
src/app/davet/[token]/           davet kabulü
src/app/abonelik/[belirtec]/     herkese açık abonelikten çıkma sayfası
src/app/(app)/                   panel, tarama, kayitlar (istemci detay paneli), iletisim (+kampanya/[id]), ayarlar
src/app/api/                     auth, taramalar, adres, kayitlar/[id] (+olaylar), olaylar/[id], kayitlar/disa-aktar,
                                 ayarlar/ileti, ayarlar/saglayicilar/[kanal] (+test), kampanyalar (+ozet, [id]),
                                 abonelik/[belirtec]
src/instrumentation.ts           başlangıçta yarıda kalan taramaları kapatır
src/components/                  menü, harita, Google atfı
src/lib/                         sabitler, mesajlaşma sabitleri, şablon, İstanbul saati, Places birimleri
src/server/db/                   bağlantı, şema, güvenli migration (yalnızca repo/ ve auth erişir)
src/server/repo/                 kiracıya bağlı depo fonksiyonları; sistem/ = bağlam öncesi işler
src/server/places/               Places istemcisi + mock
src/server/scan/                 hücre geometrisi + tarama motoru (saf)
src/server/servisler/            tarama, canlı bilgi, kampanya, işçi, sağlayıcı, abonelik servisleri
src/server/messaging/            sağlayıcı arayüzü + sandbox, SMTP, alıcı kuralları, şifreleme, abonelik belirteci,
                                 SMTP SSRF koruması
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
- **`{isletme}`** yalnızca kullanıcının girdiği `leads.isletme_adi`'ndan; Places içeriği mesaj gövdesine hiçbir
  koşulda girmez. Boşsa kampanyanın "boş isim hitabı" ya da yer tutucunun çevresiyle kaldırılması.
- **Abonelikten çıkma:** e-postadaki bağlantı butonlu bir sayfa açar (GET işlem yapmaz; tarayıcı ön açmaları ret
  üretmez); `List-Unsubscribe-Post` (RFC 8058) doğrudan işler. Sayfa gönderen unvanından başka bilgi göstermez.
- **Sandbox** gönderimi lead_events'e "(test)" olayı yazar, kayıt durumunu değiştirmez, günlük sınırı kullanır.
- **En fazla bir kez gönderim:** gönderim ortasında çöken işçinin mesajı "belirsiz" kapanır, yeniden denenmez.
- **SMTP güvenliği:** port 25/465/587/2525; her bağlantıdan önce DNS çözümü ve iç ağ reddi; bağlantı doğrulanan IP'ye.
- **Test gönderimi** yalnızca kayıtlı gönderen adresine, kiracı başına saatte 5.

## Açık kararlar

1. **Davet e-postaları:** Davetler hâlâ konsol adaptörüyle (bağlantı Ayarlar'da). Kampanyalar çalışma alanının
   SMTP'sini kullanır; davetler için uygulama geneli bir SMTP ve e-posta doğrulaması (Better Auth
   `emailVerification`) sonraya.
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
8. **Kampanya yetkisi:** Kampanyayı her üye başlatabilir (sağlayıcı ve ticari ileti ayarları yalnızca yönetici).
   Gerçek gönderimi yöneticiye sınırlamak isterseniz `kampanyaBaslat` içinde `yoneticiOlmali` eklenebilir.
9. **Engel listesinden çıkarma:** Arayüz yok; ret veren adres kalıcı olarak engellidir. Yanlışlıkla "ret" işaretlenen
   bir kaydın adresi de engellenir (kayıt izni geri alınsa bile). Gerekirse yönetici için denetim kayıtlı bir
   "engeli kaldır" işlemi eklenebilir.
10. **Geri dönen e-postalar (bounce) ve şikâyetler** işlenmiyor; SMTP sağlayıcısının panelinden izlenmeli.
11. **Sandbox mesaj metni** (`message_queue.sandbox_icerik`) kampanya silinene kadar tutulur; kampanya silme /
    saklama süresi yok.
