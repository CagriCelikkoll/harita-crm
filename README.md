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

### Elle deneme (demo) ortamı

Hazır sahte verilerle tarayıcıda denemek için (adım adım Türkçe kontrol listesi: [docs/TEST-REHBERI.md](docs/TEST-REHBERI.md)):

```bash
npm run demo:hazirla   # ./data/demo.db'yi sıfırdan kurar, giriş bilgilerini yazar (her çalıştırmada sıfırlanır)
npm run demo           # uygulamayı demo.db, PLACES_MOCK=true, WHATSAPP_API_MOCK=1 ile başlatır (http://localhost:3000)
npm run demo:isci      # ikinci terminalde: gönderim işçisi (demo.db)
npm run demo:kota -- 0 # demo çalışma alanının Places kotası (kota dolu durumunu denemek için; geri: -- 1000)
```

Demo betikleri (`scripts/demo-ortam.ts`) veritabanı yolunu, sahte istemcileri ve demo'ya özel sabit anahtarları
yalnızca kendi süreçlerinde ayarlar; `.env.local` değişmez, gerçek veritabanı açılmaz. Demo verisi: yönetici ve üye
kullanıcı, sahte Places taramasından Google kaynaklı kayıtlar (`mock_…` place_id), elle / içe aktarma / reklam
kaynaklı kayıtlar, ret verilmiş bir kayıt, test modunda sahte WhatsApp bağlantısı ve 3 şablon. Bütün numaralar
`0500 000 xx xx` (sahte Places istemcisi de yalnızca `0500 000 10 00`–`99 99` üretir), e-postalar `@demo.test`. Gönderim penceresi tüm gün, günlük sınır 5 e-posta / 5 SMS. İçe aktarmayı
denemek için örnek dosya: `docs/ornek-ice-aktarma.csv`.

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
| `NETGSM_API_URL` | Hayır | Netgsm API kök adresi (varsayılan `https://api.netgsm.com.tr`); testte sahte sunucu için. |
| `META_GRAPH_SURUMU` | Hayır | WhatsApp Cloud API için Graph API sürümü (varsayılan `v26.0`). Meta sürümleri yaklaşık iki yıl destekler. |
| `META_GRAPH_URL` | Hayır | Graph API kök adresi (varsayılan `https://graph.facebook.com`); yalnızca test için, https zorunlu. |
| `GUNLUK_WHATSAPP_API_SINIRI` | Hayır | WhatsApp (Cloud API) kampanyalarında çalışma alanı başına günlük üst sınır (varsayılan 1000; `npm run sinir -- <slug> whatsapp_api <sayı>`). Meta limitinin payı ayrıca uygulanır. |
| `WHATSAPP_SANIYE_BASI` | Hayır | WhatsApp gönderim hızı, saniyede en fazla ileti (varsayılan 20; Meta kapasitesinin altında). |
| `WHATSAPP_API_MOCK` | Hayır | `1`: geliştirmede gerçek Meta yerine sahte istemci. Testler her zaman sahte istemci kullanır. |
| `WHATSAPP_GUNLUK_VARSAYILAN` | Hayır | Kullanıcı başına günlük WhatsApp sınırı varsayılanı (30; en fazla 50). Alan bazında Ayarlar'dan ya da `npm run sinir -- <slug> whatsapp <sayı>`. |
| `WORKER_ARALIK_SN`, `WORKER_PARTI` | Hayır | Gönderim işçisinin tur aralığı (varsayılan 30 sn) ve tur başına en fazla mesaj (20). |
| `ISCI_KILIT_SN` | Hayır | Tek işçi kilidinin süresi (varsayılan 120 sn; tur boyunca nabızla uzatılır, çöken işçinin kilidi bu süre sonunda düşer). |
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
- **Migration'ları her zaman `npm run db:migrate` ile uygulayın. Düz `drizzle-kit migrate` VERİ SİLER**
  (bağlı satırlar: ör. 0007'de `lead_events`, `message_queue`, `whatsapp_listesi`; geliştirme veritabanının
  kopyasında denendi). Bu yüzden `drizzle.config.ts` `drizzle-kit migrate` komutunu reddeder (`generate` çalışır).
  Neden: SQLite'ta sütun kısıtını değiştirmek tabloyu yeniden oluşturmayı gerektirir; yabancı anahtarlar açıkken
  `DROP TABLE` bağlı tablolardaki `ON DELETE SET NULL/CASCADE` kurallarını tetikler. drizzle-kit'in migration
  içine yazdığı `PRAGMA foreign_keys=OFF` transaction içinde etkisizdir. `src/server/db/migrasyon.ts` denetimi
  transaction dışında kapatır, bekleyen migration'ları **tek transaction'da** uygular ve `PRAGMA foreign_key_check`'i
  **COMMIT'ten önce** çalıştırır: ihlal varsa her şey geri alınır, veritabanı migration öncesindeki haliyle kalır.
  (drizzle-orm'un dosya okuyucusu ve `__drizzle_migrations` tablosu aynen kullanılır.) (`0001` için drizzle-kit'in
  ürettiği `INSERT … SELECT` de eski tabloda olmayan sütunları okuduğu için elle düzeltildi; yeni migration'ları
  gözden geçirin.)
- **Otomatik yedek:** `npm run db:migrate` her çalıştırmada önce veritabanının zaman damgalı yedeğini alır:
  veritabanı dosyasının klasöründe `yedek/` (varsayılan `data/yedek/app-YYYYMMDD-HHMMSSmmm.db`, UTC). SQLite
  çevrimiçi yedekleme API'si kullanılır: WAL dosyasında olup ana dosyaya henüz yazılmamış işlemler de yedeğe girer ve
  yedek tek, tutarlı bir dosyadır. Yedek alınamazsa migration uygulanmaz.
- **Yedek saklama:** o veritabanına ait yedeklerden **en son 10 tanesi ve son 30 gün içinde alınanların hepsi**
  saklanır; diğerleri `npm run db:migrate` sonunda ve gönderim işçisinin günlük bakımında otomatik silinir
  (`src/server/yedek-saklama.ts`). Yedeğin anı dosya adındaki zaman damgasından okunur; yalnızca adı veritabanıyla
  eşleşen yedekler silinir (`app-<damga>.db`; başka veritabanlarının yedekleri ve elle konan dosyalar kalır). Yedekler
  kişisel veri içerir; daha uzun saklama gerekiyorsa şifreli ve harici bir yere kopyalayın. Geri dönmek için: uygulamayı ve işçiyi durdurun, yedeği `app.db` olarak kopyalayın, `app.db-wal` ve
  `app.db-shm` dosyalarını silin. Canlıda Litestream de önerilir (aşağıda).

## Çalıştırma ve test

```bash
npm run dev            # geliştirme
npm run build && npm start   # üretim
npm run worker         # gönderim işçisi (ayrı süreç; aşağıda "Gönderim işçisi")
npm test               # Vitest
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
| `tests/sms.test.ts` | SMS uzunluğu (160/153, Türkçe 155/149, UCS-2 70/67); **Netgsm isteği** (uç nokta, Basic Auth, msgheader, messages, encoding, iysfilter 11/12) ve hata kodu sınıflaması; ek_telefon cep / sabit hat; **Places telefonu** gönderim anında alınıp 4 birim düşmesi ve numaranın hiçbir tabloya yazılmaması; Places numarasının engel listesine takılması; kota dolunca ay başını bekleme; ret numarası olmadan gerçek SMS kampanyası başlatılamaması; **RET webhook'u** (anahtar yalnızca özet, yenileme, ek_telefon ve adres özetiyle eşleşme, RET olmayan mesajın yok sayılması, kiracılar arası etki olmaması, geçersiz anahtar 404); test SMS'inin yalnızca yetkili telefona `iysfilter=0` ile gitmesi ve saatte 5 sınırı. |
| `tests/whatsapp.test.ts` | wa.me bağlantısı (yalnızca rakam, 90 ile başlayan numara; `encodeURIComponent`); mesaj şablonu ve altbilgi; liste hazırlamada ret / engel / izinsiz bireysel dışlama, günlük sınır kapasitesi (en fazla 50), aynı kaydın iki kullanıcıya verilmemesi; **liste ekranını açmak ve 5 kez yenilemek kota birimi düşürmez**, Places numarası ekranda görünmez; ek_telefon cep değilse Places'sız otomatik atlama; "WhatsApp'ta aç": ek_telefon ile 0 birim, Places ile 4 birim ve numaranın hiçbir tabloya yazılmaması, cep değilse `otomatik_atlandi`, kota doluysa bekleme; "Gönderdim" (olay, `yeni → iletisimde`, sayaç, sınırda 429, detay panelinin aynı sayacı kullanması, İstanbul gününe göre sıfırlanma); "Ret istedi" (Places numarasının özeti engel listesine) ve "Atla"; detay panelinde pasif durumlar; **yönlendirme rotaları:** oturumsuz → giriş, `Sec-Fetch-Site: cross-site` → işlem yok, uygunsa 302 wa.me, başka kiracının öğesi / kaydı bulunamadı, cep değilse nedenle listeye dönüş. |
| `tests/abonelik.test.ts` | Belirtecin tek bir baytı bile değiştirilince, kısaltılınca ya da kiracı/kayıt alanı başka kiracınınkiyle değiştirilince reddedilmesi; A'nın geçerli belirtecinin B'nin kaydını ve engel listesini etkilememesi; tek tıkla çıkışta `ret` + engel listesi + olay (tekrar tıklamada çift olay yok); kayıt silinmiş olsa da engel listesine yazma; sayfanın yalnızca gönderen unvanını döndürmesi; e-posta altbilgisi ve ham iletideki `List-Unsubscribe` / `List-Unsubscribe-Post` başlıkları. |
| `tests/yarim-kalan-tarama.test.ts` | 10 dakikadan uzun "calisiyor" veya "kuyrukta" kalan taramaların "hata" + "Tarama yarıda kaldı, yeniden başlatın." olması; kiracı bazında (liste yüklenirken) ve tüm kiracılarda (uygulama başlangıcı); 10 dakika sınırı; kuyruktaki/bitmiş/taze taramalara dokunulmaması. |
| `tests/temizlik.test.ts` | Kaynağı ne olursa olsun tarama merkezlerinin 30 gün sonra silinip adres metni, yarıçap ve kaynağın kalması; merkezi silinmiş taramanın Places'a gitmeden açık mesajla hata vermesi; 30 günden eski Places konumlarının silinmesi. |
| `tests/migrasyon.test.ts` | Regresyon: tabloyu yeniden oluşturan migration'ın (`0001`) `leads.scan_id` bağlantılarını ve verileri koruması. |
| `tests/places-maske.test.ts` | Maliyet güvencesi: liste maskesinde Enterprise alanı olmaması (yalnızca ad + adres, Pro), detayın telefon/web sitesini ayrı çağrıda istemesi, taramada yalnızca ID. |
| `tests/kota.test.ts` | Varsayılan ve ortam değişkeninden kota; kotaya kadar ayırma ve sonrasında ret; %80 uyarı / %100 doldu; `npm run kota` mantığı; **eşzamanlılık:** aynı süreçte 40 eşzamanlı liste isteğinde (3 birim) kota 75 birimken tam 25 başarı ve **4 ayrı süreçte 1.200 denemede tam 500 (kota) başarı**; kota dolunca taramanın kısmi bitmesi; liste/detayda Places çağrısı yapılmaması; gerçek istemcide kota doluyken HTTP isteği gönderilmemesi ve başarısız istekte iade. |
| `tests/yedek-saklama.test.ts` | Yedek saklama kuralı: 30 günden eskilerden yalnızca en son 10'u kalır, son 30 gündekilerin hepsi kalır, 10 ve altında hiçbiri silinmez; başka veritabanının yedekleri ve klasördeki diğer dosyalar silinmez; işçinin günlük bakımının günde bir çalışması; `npm run db:migrate`'in yedek alıp sonunda eski yedekleri silmesi. |
| `tests/demo-ortami.test.ts` | `npm run demo:hazirla` yalnızca `data/demo.db`'yi kurar (aynı klasördeki başka veritabanı ve testin veritabanı bayt bayt aynı kalır), her çalıştırmada sıfırdan kurar; yazdırdığı giriş bilgileri Better Auth parola özetiyle eşleşir; kaynak / durum / izin çeşitliliği, ret ve engel listesi, test modunda WhatsApp bağlantısı ve şablonlar; elle girilen bütün adreslerin sahte biçimde olması. `docs/ornek-ice-aktarma.csv`'nin rehberde yazan önizleme sonucunu vermesi. |
| `tests/kullanilabilirlik.test.ts` | Gönderim servisinin son nabzı (kilit alma/bırakma, işçi turu, kampanya API'si) ve 5 dakika uyarısı; engelli işareti; WhatsApp izni değişince güncelleme tarihi; "bilgi" / "izin" olay türleri; dışa aktarmada BOM, noktalı virgül ve Türkçe etiketler; şablon metni parçaları, numara biçimi, limit katmanı adı; "WhatsApp'ta aç"ın tek Enterprise çağrısıyla adı döndürmesi (ek birim yok, kaydın kendi adı varsa dönmez, hiçbir tabloya yazılmaz); giriş formunun hidrasyondan önce gönderilememesi ve geliştirme simgesinin yeri. |
| `tests/liste-maliyeti.test.ts` | Kayıt listesinin Places'a gitmemesi (0 birim); istenince yalnızca kiracının Google kayıtlarının ad/adresinin kayıt başı 3 birimle, `no-store` ile dönmesi (en fazla 20; kota doluysa çağrı yok) ve hiçbir tabloya yazılmaması; bileşenlerde tarayıcı depolaması kullanılmaması; detay panelinde "ilgilenmiyor" kayıt ve kota %80+ iken otomatik çağrı yapılmaması, `?canli=1` ile yapılması; inceleme işaretleri (toplu, kiracı izolasyonu, varsayılan gizleme, süzgeçler), migration 0013'ün mevcut kayıtları "ilgileniyor" yapması; "ilgilenmiyor" kaydın kampanya özetinde hariç tutulması, kampanyadan sonra işaretlenince işçinin göndermemesi ve WhatsApp listesine alınmaması. |
| `tests/dogruluk-demo.test.ts` | Ret'in onaysız gönderilememesi (kayıt, WhatsApp izni, günlük liste); sahte Places'in yalnızca 0500 000 xx xx üretmesi; arayüzde npm komutu olmaması; alıcı türünün varsayılanı olmaması (Kişi ekle, içe aktarma). |
| `tests/kota-birim.test.ts` | Birim ağırlıkları (Essentials = 1, ücretsiz = 0, oranla yuvarlama); her çağrının SKU birimi; ücretsiz isteğin kota doluyken yapılıp kotadan düşmemesi; kalan birime göre detay/liste ayrımı; **İstanbul ay sınırı** (31 Ekim 23:30 → 1 Kasım 00:30) ve geçiş sonrası iadenin doğru aya yapılması. |
| `tests/yeni-duzen.test.ts` | Yeni düzen: menüdeki kullanım göstergesinin yalnızca yüzde göstermesi (`GET /api/kullanim` birim, kota ya da kalan döndürmez; %80 uyarı, dolmadan %100 yok); sekmelerde klavye, baş harfler; menü ve sayfa iskeleti ölçüleri; Ayarlar bölümlerinin role göre görünmesi (üye yalnızca kendini ilgilendirenleri) ve her bölüm sayfasının rol denetimi; çalışma alanı adı ile saklama süresinin ayrı formlardan güncellenmesi; WhatsApp kurulum adımlarının test modu kilidinden türetilmesi. || `tests/yeni-duzen.test.ts` (Grup 4–5) | Kayıtlar sekmelerinin anlamı ve sayıları, süzgeç adresi, CSV'nin sekmesiz ve sekmeli davranışı, otomatik istek kuralları, panel sekmeleri; Bölge tara sonuçlarının yeniden bulunan işletmeleri de göstermesi, süzgeç ve sabit sıra, migration 0016'nın eşleşmeleri taşıması, ekran ve eski adresin yönlendirilmesi. |
| `tests/gorunurluk.test.ts` | Kullanım kalemlerinin toplamla aynı atomik ifadede artması ve iadesi; her Places çağrısının kalemi; eşikli ayırma (sonraki toplam kota × 0,8'in altında); otomatik gösterimin yalnızca adı girilmemiş kayıtlara ve %80'in altına gitmesi, eşikte istek yapmaması ve birim düşmemesi, elle Göster'in %100'e kadar sürmesi; detay panelinin otomatik açılışında aynı eşik; 30 dakikalık bellek önbelleğinin süresi, çıkış / giriş / alan değişince temizlenmesi ve tarayıcı depolaması kullanmaması; arayüzde "birim" sözcüğünün geçmemesi. |

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
  Ekranda gösterileceği an sunucuda Place Details ile çekilir ve yalnızca o isteğin belleğinde yaşar. Tarayıcıda
  yalnızca bellekte, kayıt kimliğine göre en fazla 30 dakika tutulur (`src/lib/google-onbellegi.ts`; aşağıda
  "Alınan kararlar"): tarayıcı depolamasına ve sunucuya yazılmaz; sayfa yenilenince, çıkış / giriş yapılınca ve
  çalışma alanı değişince silinir.
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

- **Kayıt listesini çizen sunucu sayfası Places'a gitmez.** Satırlarda kullanıcının verisi görünür: kendi girdiği
  işletme adı (yoksa "Google kaydı · ad girilmemiş"), durum, izinler, etiketler, son işlem, kaynak, inceleme.
- Google adı, adresi ve konumu `POST /api/kayitlar/canli` ile gelir (en fazla 20 kayıt, yalnızca kiracının Google
  kayıtları, `no-store`). Maske `id,displayName,formattedAddress,location`: `displayName` Pro katmanında olduğundan
  en ucuz uygun katman **Place Details Pro**'dur; `location` Essentials alanıdır, ek ücret doğurmaz (Bölge tara
  kartlarında mesafe).
  - **Otomatik gösterim** (`otomatik: true`; Kayıtlar listesi ve Bölge tara sonuçları): yalnızca kendi adı
    girilmemiş Google kayıtları için ve yalnızca aylık kullanım **%80'in altında kalıyorsa**. Eşik, kota ayırmanın
    atomik SQL ifadesinde uygulanır (`kotaAyir(..., { esik: 0.8 })`: ayırmadan sonraki toplam kota × 0,8'in altında
    kalmalı); eşzamanlı istekler de eşiği aşamaz. Eşiğe gelinince istek yapılmaz, birim düşmez, yanıt
    `otomatikKapali: true` olur ve satır "Göster" düğmesine döner. Kayıtlar ve Ayarlar > Kullanım "Bu ay otomatik
    gösterim sınırına ulaşıldı; bilgileri istediğinizde gösterilir." yazar.
  - **Elle** ("Göster", "Bu sayfadaki Google bilgilerini göster"): kota dolana kadar.
  - Arayüzde birim ya da tıklama başı maliyet yazmaz; kullanım yalnızca menüdeki yüzde göstergesinde ve Ayarlar >
    Kullanım ve paket'te görünür.
  - Gösterilen içerik React belleğinde ve en fazla 30 dakikalık bellek önbelleğinde tutulur; aynı oturumda aynı kayıt
    için Google'a yeniden gidilmez (`components/google-bilgisi.tsx`, `lib/google-onbellegi.ts`).
- Telefon, web sitesi ve puan **detay paneli açıldığında**, tek bir Enterprise çağrısıyla çekilir. İstisnalar: kayıt
  "ilgilenmiyor" işaretliyse ya da çağrı kullanımı %80'e taşıyacaksa (aynı atomik eşik) otomatik çağrı yapılmaz,
  panel "Google bilgilerini göster" düğmesi gösterir; aynı kayıt 30 dakika içinde yeniden açılınca bellekteki sonuç
  kullanılır.
- **Tarama sonuçlarını inceleme** (Bölge tara sayfasının altında; eski `/tarama/inceleme` adresi oraya, tarama
  verilmemişse Kayıtlar > İncelenmemiş sekmesine yönlenir): taramayla gelen kayıtlar `leads.inceleme = 'incelenmedi'`
  gelir. Sonuçlar 20'şer kart olarak görünür; ad, adres ve merkeze mesafe %80'e kadar otomatik gelir (sonra "Göster").
  Kullanıcı "İlgilen" / "Geç" der, "Geri al" ile geri döner. "Geç" kaydı silmez (sonraki taramada geri gelmesin);
  Kayıtlar'da İlgilendiklerim sekmesinde görünmez ve kayıt hiçbir kampanyaya / WhatsApp listesine girmez (alıcı kuralı
  "ilgilenmiyor"). Bir taramanın sonuçları `tarama_sonuclari (tenant_id, scan_id, lead_id)` tablosundan gelir
  (yalnızca kimlikler, migration 0016): aynı işletme daha önce başka bir taramayla eklenmiş olsa da yeni taramanın
  sonuçlarında görünür; `leads.scan_id` kaydı ilk bulan taramayı tutmaya devam eder.
- **WhatsApp günlük liste:** sıradaki kayıt Google kaydıysa ve kendi adı yoksa ad "Göster" ile istenebilir.
  "WhatsApp'ta aç" telefonu zaten bir Place Details Enterprise çağrısıyla çözer; aynı çağrının alan maskesinde
  `displayName` (Pro) vardır ve istek en yüksek SKU'dan faturalandığı için ek ücret doğurmaz (Google "Usage and
  billing": *billed at the highest SKU applicable to your request*; "Place Data Fields": displayName → Place Details
  Pro, nationalPhoneNumber/internationalPhoneNumber → Enterprise; Ekim 2026'da doğrulandı). Liste sayfa içinden açar
  (`POST /api/whatsapp/ac/[id]`), dönen ad yalnızca o sayfa görünümünün belleğinde gösterilir.
- Kayıt seçmek veya kayıt üzerinde işlem yapmak (durum, not, ret, e-posta) Places'a gitmez.
  (`tests/places-maske.test.ts` liste maskesine Enterprise alanı eklenmesini engeller; `tests/liste-maliyeti.test.ts`
  listenin Places'a gitmediğini ve istenince doğru birimin düştüğünü, `tests/gorunurluk.test.ts` otomatik gösterim
  eşiğini, kullanım kalemlerini, bellek önbelleğinin süresini ve arayüzde "birim" geçmediğini doğrular.)

**Tahmini aylık tüketim** (tek çalışma alanı; birimler aşağıdaki tabloya göre):

*Önceki akış* (liste yalnızca istenince; ayda 1.000 liste sayfası görüntüleme, sayfaların %20'sinde "Göster",
300 detay açılışı, 20 tarama × 40 sonuç): liste 200 × 20 × 3 = 12.000 + inceleme 2.400 + detay 1.200 =
**15.600 birim**.

*Yeni akış* (otomatik gösterim %80'e kadar + 30 dakikalık bellek önbelleği). Önbellek yüzünden maliyeti sayfa
görüntüleme sayısı değil, **her oturumda görüntülenen farklı, adı girilmemiş Google kaydı** belirler (aynı kayıt
30 dakika içinde yeniden görülünce Google'a gidilmez). Varsayım: ayda 22 iş günü, günde 2 oturum (aralarında 30
dakikadan fazla) = **44 önbellek dönemi**; detay açılışlarının %20'si aynı kaydın 30 dakika içinde yeniden açılması.

| Kalem | Oturum başına 40 farklı kayıt | 60 farklı kayıt | 100 farklı kayıt |
| --- | --- | --- | --- |
| Kayıt listesi (otomatik) | 44 × 40 × 3 = 5.280 | 44 × 60 × 3 = 7.920 | 44 × 100 × 3 = 13.200 |
| Bölge tara sonuçları (otomatik; her sonuç bir kez) | 20 × 40 × 3 = 2.400 | 2.400 | 2.400 |
| Detay paneli (Enterprise; %20'si bellekten) | 240 × 4 = 960 | 960 | 960 |
| **Toplam** | **8.640** | **11.280** | **16.560** |

Önbelleksiz otomatik gösterimde aynı ay (1.000 sayfa görüntüleme, satırların yarısı adı girilmemiş Google kaydı)
≈ 33.600 birim olurdu; önbellek bunu yaklaşık üçte bire indirir.

- **Kota eşiğiyle:** varsayılan kota 6.000 birim; otomatik gösterim 4.800 birimde durur. 60 farklı kayıt / oturumda
  bu, yaklaşık 9–10. iş gününe (günde ≈ 510 birim) denk gelir; sonrasında liste "Göster" ile çalışır. Ay boyu
  otomatik görmek için kota en az toplam / 0,8 olmalı: 40 → 10.800, 60 → 14.100, 100 → 20.700 birim. Kota bir üst sınır olduğu için çalışma
  alanı başına harcama hiçbir durumda kotayı aşmaz. (Fiyat / paket kararı pilottan sonra.)
- **Dolar karşılığı** (Ekim 2026 liste fiyatı; Place Details Pro $17 / 1.000 ve ayda 5.000 ücretsiz; Enterprise
  $20 / 1.000 ve ayda 1.000 ücretsiz): 60 farklı kayıt / oturumda 2.640 + 800 = 3.440 Pro ve 240 Enterprise isteği →
  ilk çalışma alanı için **≈ $0** (ücretsiz kotalar içinde); 100 farklı kayıtta 5.200 Pro → ≈ $3,40.
- **Ücretsiz kotalar Google faturalama hesabı başınadır**, çalışma alanı başına değil: aynı hesabı paylaşan ikinci ve
  sonraki çalışma alanlarında 60 farklı kayıt / oturumda ≈ 3.440 × $0,017 + 240 × $0,020 ≈ **$63 / ay**.
- Detay kotayı aşarsa (ayda 1.000'den fazla görüntüleme) her biri ~$0,02 ekler.
- **Taramalar** buna eklenir: tarama başına en fazla 50 istek, en kötü durumda tamamı Text Search Pro → **≤ $1,60**
  (iç hücreler ücretsiz). Text Search Pro'nun ayda 5.000 ücretsiz isteği vardır (≈100 tam bütçeli tarama).
- Adres araması: arama başına 1 Text Search Pro isteği (aynı 5.000 ücretsiz kota).
- Arayüzde kullanım yalnızca yüzde olarak görünür: menüdeki "Bu ayki kullanım %N" göstergesi (`GET /api/kullanim`,
  yalnızca yüzde ve seviye döner) ve Ayarlar > Kullanım ve paket (yüzde, kalemlere göre pay: işletme bilgileri,
  telefon ve web sitesi, taramalar; `usage_counters` kalem sütunları, migration 0015).

## Aylık Places kotası (kiracı başına)

Maliyetin kontrolden çıkmaması için her çalışma alanının aylık bir Places kotası vardır
(`tenants.aylik_places_kotasi`). Kota **maliyet ağırlıklı birim** cinsindendir.

**Birimler** — tek kaynak `src/lib/places-birimleri.ts` (birimler arayüzde gösterilmez; tablo yalnızca burada). En ucuz ücretli SKU (Place Details Essentials, $5/1000) = 1 birim; diğerleri fiyatına oranla, tam sayıya
yuvarlanır; ücretsiz SKU 0 birimdir. Fiyat değişirse yalnızca bu dosyadaki fiyatlar güncellenir.

| İşlem | SKU | $/1000 | Birim |
| --- | --- | --- | --- |
| Tarama, dairenin içi | Text Search Essentials (IDs Only) | 0 | 0 |
| Tarama, dairenin sınırı; adres araması | Text Search Pro | 32 | 6 |
| Kayıt listesinde / incelemede istenince gösterilen satır (ad + adres) | Place Details Pro | 17 | 3 |
| Kayıt detayı (telefon, web, puan) | Place Details Enterprise | 20 | 4 |

Ücretsiz istekler kotadan düşmez (kota doluyken de yapılabilir) ama `SCAN_MAX_REQUESTS` tarama sınırına sayılmaya
devam eder. Yukarıdaki varsayımla yeni akışta tüketim ≈ **8.640–16.560 birim/ay**; varsayılan 6.000 birimin %80'i
(4.800) otomatik gösterimin üst sınırıdır.

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
- **Uyarı:** menüdeki gösterge %80'de sarı, %100'de kırmızıdır. Kayıtlar ve Ayarlar > Kullanım %80'de "Bu ay
  otomatik gösterim sınırına ulaşıldı; bilgileri istediğinizde gösterilir.", %100'de "Bu ayki kullanımınız doldu…"
  yazar (sayı yazmadan).
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
  Süre merkezin ilk alındığı andan (`merkez_tarihi`) sayılır: "Tekrar kullan" ile (ya da son taramanın merkeziyle)
  aynı koordinatla açılan yeni tarama, bu koordinatı taşıyan en eski taramanın süresini devralır; kopyalamak 30 günü
  sıfırlamaz.
- Süresi dolmuş (60 dk) tamamlanmamış içe aktarma oturumlarının dosya satırlarını siler. Gönderim işçisi bunu ayrıca
  **saatte bir** (ve her `--bir-kez` çalıştırmasında) yapar; kişisel veri en fazla yaklaşık 2 saat kalır.
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

## Kişi içe aktarma: girdi sınırları

- Dosya en fazla 5 MB, 5.000 satır, 50 sütun; yalnızca `.csv` ve `.xlsx`. Yükleme gövdesi akış halinde sayaçla okunur
  (Content-Length'e güvenilmez); sınır aşılınca okuma kesilir (413).
- **XLSX sıkıştırma bombası:** ayrıştırmadan (exceljs) önce ZIP merkez dizinindeki iç dosya sayısı (en fazla 1.000)
  ve açılmış boyut toplamı (en fazla 50 MB) denetlenir; merkez dizin yalan söyleyebileceği için her iç dosya ayrıca
  kalan bütçeyle sınırlı açılır (`src/server/zip-denetimi.ts`). Aşan dosya reddedilir.
- **Sorunlu satırlar CSV'si** ve kayıtların dışa aktarımı formül enjeksiyonuna karşı kaçırılır (`=`, `+`, `-`, `@`,
  sekme, CR ile başlayan hücreye `'` eklenir).
- Tamamlanmamış oturumun satırları (kişisel veri) 60 dakika sonra kullanılamaz; işçi saatte bir, günlük temizlik de
  ayrıca siler.

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

## Mesajlaşma (e-posta ve SMS kampanyaları, WhatsApp günlük liste)

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

- **Ret geri alınamaz:** ret verilmiş kaydın ileti izni hiçbir yoldan (PATCH `/api/kayitlar/[id]` dahil, yönetici
  de) başka değere geçmez; depo katmanı reddeder, rota 400 ve nedeni döner.
- **Kaydın bilinen tüm adresleri engellenir** (`kayitTumAdresOzetleri`): kendi e-postası ve ek telefonu, WhatsApp
  BSUID'i, kuyrukta **gönderildiği adresler** (gönderim anında Places'tan alınan telefon dahil; `message_queue`
  yalnızca özetini tutar) ve WhatsApp günlük listesinde açılan numara. Ret verilmiş kayda sonradan eklenen adres
  (kayıt güncelleme, içe aktarmada boş alan doldurma, BSUID bağlama / değişimi) aynı transaction'da engellenir.
  Böylece aynı numara ya da e-posta başka bir kayıtta (ör. içe aktarma) bulunsa da SMS, e-posta, WhatsApp günlük
  liste ve WhatsApp API ile gönderilmez; gönderim anında Places'tan alınan telefon da engel listesine karşı denetlenir.
- **Alıcı türü:** WhatsApp izni `var` olan ya da Meta reklamından gelen bireysel kişiyi tacir/esnaf yapmak İYS beyanı
  kuralını kaldırdığı için yalnızca yöneticiye açıktır (üyeye 403); reklam kaynaklı kişide yönetici açıklama da
  yazmalıdır (400). Değişiklik açıklamasıyla `izin` olayı olarak loglanır.

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

0. **Tek işçi kilidi:** tur, veritabanındaki süresi dolan bir kilit (`isci_kilitleri`, `ISCI_KILIT_SN`, varsayılan
   120 sn) altında çalışır ve kilit tur boyunca nabızla uzatılır. Kilit başka işçideyse tur hiçbir şey yapmadan biter
   (`--bir-kez` cron çalıştırmaları üst üste binse de, birden çok `npm run worker` süreci olsa da). Çöken işçinin
   kilidi süre dolunca başkasına geçer; tur sırasında kilit kaybedilirse denenmemiş mesajlar kuyruğa döner.
1. Zamanı gelen kampanyaları başlatır; 10 dakikadan uzun "gönderiliyor" kalan mesajları "belirsiz" kapatır.
2. Hazır mesajları **tek bir SQL ifadesiyle** (`UPDATE … WHERE durum='kuyrukta' … RETURNING`) alır ve satıra turun
   kimliğini (`kilit_sahibi`) yazar: aynı mesajı iki işçi alamaz, tekrar çalıştırmak çift gönderim yapmaz.
3. Her mesaj için: kampanyanın **güncel** durumu (her mesajda veritabanından) → gönderim saati → alıcı kuralları
   (yeniden) → ticari ileti ön koşulları → günlük sınır → **gönderimden hemen önce** satırın kilidi yenilenir, satırın
   hâlâ bu turda (başka işçiye geçmemiş, belirsiz kapatılmamış) ve kampanyanın hâlâ çalışıyor olduğu doğrulanır; değilse
   gönderilmez → gönderim. Tur sırasında iptal edilen kampanyanın kalan mesajları `iptal`, duraklatılanınkiler (ör.
   Meta 131048 spam kısıtlaması) `kuyrukta` olur; ikisinde de gönderilmez.
4. Geçici hata (iletinin gitmediği kesin: bağlantı kurulamadı, SMTP 4xx) en fazla 3 deneme (1, 5 dk arayla);
   kalıcı ya da belirsiz sonuç yeniden denenmez. Gönderilemeyen mesajın günlük sınır birimi iade edilir.

```bash
npm run worker               # sürekli (WORKER_ARALIK_SN, varsayılan 30 sn)
npm run worker -- --bir-kez  # tek tur (ör. cron ile dakikada bir)
```

İşçi ayrıca saatte bir süresi dolan içe aktarma satırlarını, günde bir de saklama süresi dolan migration yedeklerini
siler (ikisi de her `--bir-kez` çalıştırmasında).

**İşçinin durumu arayüzde:** kilit satırı tur bitince silinmez; `isci_kilitleri.son_nabiz` (migration 0014) işçinin en son
çalıştığı anı tutar (kilit alma, nabız, bırakma). Kampanya detayı, kuyrukta mesaj varken "Gönderim kuyrukta — gönderim
servisi en son X dakika önce çalıştı" yazar; 5 dakikadan uzun süredir çalışmıyorsa (ya da hiç çalışmadıysa) yöneticiye
uyarı gösterir.

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

`sudo systemctl enable --now harita-crm-worker`. SIGTERM'de eldeki turu bitirip çıkar. Birden fazla işçi süreci aynı
veritabanında güvenle çalışabilir (tek sunucu, tek SQLite dosyası) ama turlar sırayla yürür; hız sınırı
(`WHATSAPP_SANIYE_BASI`) süreç içinde uygulandığı için bu, toplam hızın aşılmamasını da sağlar.

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

### SMS kampanyaları (Netgsm)

**Sağlayıcı seçimi: Netgsm.** Netgsm ve İleti Merkezi'nin ikisinin de REST API'si var. Netgsm'i seçme nedenleri:

1. Netgsm'in GitHub'daki resmî SDK'sı (`github.com/netgsm/netgsm-sms-python`) güncel REST v2 uç noktalarını,
   istek alanlarını ve hata kodlarını açıkça gösteriyor. Adaptör bu kaynaktan doğrulandı.
2. İYS süzgeci (`iysfilter`) doğrudan bizim `alici_turu` ayrımıyla eşleşiyor: bireysele ticari `11`, tacire
   ticari `12`, bilgilendirme `0`.
3. Kimlik doğrulama sade (HTTP Basic). İleti Merkezi her istekte API anahtarı + gizli anahtardan hash üretimi
   istiyor.

**Doğrulanan alanlar** (`src/server/messaging/netgsm.ts`; kaynak: resmî SDK'nın `netgsm/sms/sms_service.py`,
`netgsm/exceptions/api_exception.py`, `tests/test_sms_service.py`):

| Alan | Değer |
| --- | --- |
| Uç nokta | `POST https://api.netgsm.com.tr/sms/rest/v2/send` (`NETGSM_API_URL` ile değiştirilebilir) |
| Kimlik | HTTP Basic: Netgsm kullanıcı kodu : API şifresi |
| Gövde | `{ msgheader, messages: [{ msg, no }], encoding?: "tr", iysfilter }`; `no` = `5XXXXXXXXX` |
| `encoding` | Yalnızca Türkçe karakter varsa `"tr"` (SDK: "Only use 'tr' if your message contains Turkish characters") |
| Başarı | HTTP 200 + `{ code: "00", description, jobid }` |
| Hata | HTTP 406 + `{ code }`: 20 metin, 30 kimlik, 40 başlık, 50/51 İYS hesabı, 70 parametre, 80 gönderim sınırı, 85 mükerrer; 100/101 sistem |

Hata sınıflaması: 80, 85, 100, 101 ve bağlantının hiç kurulamaması **geçici** (yeniden denenir); diğer kodlar
**kalıcı**; zaman aşımı ya da beklenmeyen yanıt **belirsiz** (SMS gitmiş olabilir; yeniden denenmez).

**DOĞRULANMADI** (resmî kaynakta bulunamadı; canlıya almadan önce Netgsm'den teyit edin):

- `code` 01 ve 02'nin anlamı: topluluk kaynakları başarılı sayıyor, adaptör de öyle sayıyor.
- **Gelen SMS'in bir URL'ye iletilmesi (push) ve biçimi.** Resmî SDK yalnızca çekme (pull) API'sini gösteriyor:
  `GET /sms/rest/v2/inbox?startdate&stopdate` (`ddMMyyyyHHmmss`), ama yanıt alanlarını göstermiyor. Webhook
  (`/api/webhook/sms/<anahtar>`) bu yüzden toleranslı yazıldı: GET sorgusu, JSON ya da form gövdesi; numara için
  `no / gsmno / telefon / phone / msisdn / numara / from`, mesaj için `msg / mesaj / message / text` alanlarını okur.
  Netgsm panelinde gelen SMS yönlendirmesi yoksa inbox çekme API'siyle işçiye bir adım eklenmesi gerekir.
- **Kişi bazında İYS reddinin bildirilmesi.** `iysfilter` ile Netgsm, İYS'de ret vermiş alıcıya göndermez. Ama
  bunun gönderim yanıtında mı, raporda mı, hangi kodla döndüğü doğrulanamadı; adaptör şu an kişi bazında
  `ret: true` üretmiyor. Bu alıcılar ret yolu (RET yanıtı) ile ya da elle işaretlenir.

**Numara:** SMS yalnızca cep telefonuna gider (`90 5XX…`).

- Numara önce kullanıcının girdiği `ek_telefon`'dan alınır; girilmiş ama cep değilse kayıt "cep telefonu değil"
  nedeniyle hariç tutulur.
- `ek_telefon` yoksa numara **gönderim anında** Places'tan canlı alınır (yalnızca telefon alanı, Place Details
  Enterprise, **4 birim**) ve hiçbir yere yazılmaz. Kuyrukta yalnızca gönderildiği adresin anahtarlı özeti kalır;
  gelen RET yanıtını kayda bağlamak için kullanılır.
- Places çağrısı günlük sınır ayrıldıktan sonra yapılır. Böylece sınıra takılacak mesaj için kota harcanmaz.
- Kota doluysa mesaj "Places kotası bekleniyor" nedeniyle ayın 1'ine (İstanbul, gönderim başlangıç saati) kalır.
- Kampanya özeti "Google'dan alınacak: N kayıt ≈ N×4 birim" ve bu ay kalan kotayı gösterir.

**Ret yolu:**

- Her SMS'in sonuna `<gönderen unvanı> İYS No:<no>. Ret için RET yazıp <ret numarası> numarasına gönderin.` eklenir.
- Ret numarası, çalışma alanının gelen SMS alabilen numarasıdır (Ayarlar → SMS). Sandbox dışı SMS kampanyası
  bunsuz başlatılamaz.
- Gelen "RET" yanıtı kiracıya özgü webhook adresine düşer: `https://<alan>/api/webhook/sms/<anahtar>`. Anahtar
  gövde okunmadan önce doğrulanır (bilinmeyen anahtar 404); gövde akış halinde en fazla 1 MB okunur (aşarsa 413).
  - Anahtar Netgsm ilk kaydedildiğinde üretilir ve **yalnızca bir kez** gösterilir; veritabanında HMAC özeti
    tutulur. "Webhook adresini de yenile" ile değiştirilebilir.
  - Ret yanıtı e-postadaki abonelikten çıkmayla aynı sonucu doğurur: kayıt `ret`, numara engel listesine,
    `lead_events`'e `ret`.
  - Numara kayda iki yolla bağlanır: o numaraya gönderilmiş kuyruk satırları (adres özeti) ve `ek_telefon`'u
    eşleşen kayıtlar.

**Karakter sayacı** (`src/lib/sms-uzunluk.ts`, kampanya formunda canlı):

- Standart GSM karakterleri: 160 / 153 karakter.
- Türkçe karakterler (ç ğ ı İ ş Ş Ğ; GSM Türkçe tek kaydırma tablosu, her biri 2 karakter): 155 / 149.
- Emoji vb. (UCS-2): 70 / 67.
- Sayaç altbilgiyi de sayar. Tahminidir; faturalamada sağlayıcının hesabı esastır.

**Test SMS'i** yalnızca Ayarlar'daki yetkili cep telefonuna, bilgilendirme (`iysfilter=0`) olarak gider; kiracı
başına saatte 5 ile sınırlıdır.

### Gerçek SMS göndermek için çalışma alanının hazırlaması gerekenler

1. **Netgsm hesabı** ve API kullanıcısı (kullanıcı kodu + API şifresi). IP kısıtı varsa sunucunun IP'sini Netgsm'de
   tanımlayın.
2. **Onaylı SMS başlığı** (en fazla 11 karakter; operatör onayı birkaç gün sürebilir).
3. **İYS:** Hesabınızda İYS marka bilgisi tanımlı olmalı (aksi halde Netgsm 50/51 döner). Tacirlere ticari ileti
   için İYS ret kontrolü, bireysel alıcılar için İYS'de kayıtlı onay gerekir.
4. **Gelen SMS numarası** (ret numarası) ve Netgsm panelinde gelen SMS'lerin webhook adresine yönlendirilmesi
   (bkz. "DOĞRULANMADI").
5. Ayarlar → SMS: ret numarası, yetkili cep telefonu, Netgsm bilgileri → **Test SMS'i gönder**.
6. Önce **Test modu** ile kampanya oluşturup kaydedilen metni ve parça sayısını kontrol edin.

### WhatsApp günlük liste (yarı otomatik)

Amaç hazırlığı otomatikleştirmek, gönderimi kullanıcıya bırakmak. **WhatsApp Web otomasyonu, gayriresmî kütüphane,
otomatik gönderim ya da kullanıcı tıklamadan sekme açma yoktur**; bu bilinçli bir ürün sınırıdır.

- **Ayarlar → WhatsApp günlük liste:**
  - `{isletme}` yer tutuculu mesaj şablonu. Yer tutucu yalnızca kaydın kullanıcı tarafından girilen işletme adıyla
    dolar.
  - Mesajın sonuna gönderen unvanı ve "Bu mesajları almak istemiyorsanız RET yazmanız yeterli." eklenir.
  - Kullanıcı başına günlük sınır: varsayılan 30 (`WHATSAPP_GUNLUK_VARSAYILAN`), çalışma alanı en fazla 50.
    `npm run sinir -- <slug> whatsapp <sayı>` ile de değiştirilebilir.
- **İletişim → WhatsApp günlük liste:** kullanıcı alıcı grubunu (durum, etiket, alıcı türü) seçer.
  - Uygulama alıcı kurallarını (ret, engel listesi, izinsiz bireysel) uygular ve kayıtları sıraya koyar. Sıraya alınan
    sayı, kullanıcının bugünkü kalan sınırı kadardır (sırada bekleyenler de sayılır).
  - Aynı kayıt aynı gün iki kullanıcının listesine girmez. Liste kullanıcıya özeldir.
- **Akış:** Ekranda sıradaki işletme ve kişiselleştirilmiş mesaj görünür.
  1. **"WhatsApp'ta aç"**, yeni sekmede sunucu yönlendirmesini açar (aşağıda).
  2. Kullanıcı WhatsApp'ta gönderip geri döner ve sonucu seçer:
     - **Gönderdim:** `lead_events`'e `whatsapp` olayı yazılır, `yeni` durumu `iletisimde` olur, günlük sayaç artar.
       Sayaç atomiktir; sınır doluysa işlem reddedilir (429).
     - **Atla:** kayıt atlanır.
     - **Ret istedi:** ret akışı çalışır (`ileti_izni = ret`, engel listesi, `lead_events`).
  3. Ardından sıradaki kayıt gösterilir. Her yeni sohbet ayrı bir kullanıcı tıklamasıyla açılır.
- **Sayaç:** Kullanıcı başına ve İstanbul gününe göredir; gece yarısı (İstanbul) sıfırlanır.
- **Kayıt detayı:** Tek kayıt için aynı "WhatsApp'ta aç" ve "Gönderdim" butonları vardır.
  - Ret, engel listesi, izinsiz bireysel, günlük sınır dolu ya da şablon yoksa butonlar pasiftir ve nedeni yazılır.
  - "Gönderdim" aynı günlük sayaca işlenir.

**Numara çözümleme — yalnızca "WhatsApp'ta aç" anında.** Liste ekranını açmak ya da yenilemek **Places çağrısı yapmaz
ve kota birimi düşmez** (`tests/whatsapp.test.ts` bunu sınar).

- Ekranda numara yalnızca kayıtta `ek_telefon` varsa (kullanıcının kendi verisi) gösterilir.
- "WhatsApp'ta aç" bir sunucu rotasına gider:
  - liste için `GET /api/whatsapp/ac/[listeKaydiId]`
  - detay paneli için `GET /api/whatsapp/ac-kayit/[leadId]`
- Rota şunları yapar:
  1. Oturumu, kiracıyı ve kullanıcı sahipliğini, şablonu, günlük sınırı ve alıcı kurallarını kontrol eder.
  2. Numarayı `ek_telefon`'dan, yoksa Places'tan canlı alır (yalnızca telefon + ad maskesi, Place Details
     Enterprise, **4 birim**). Numara hiçbir yere yazılmaz. Liste öğesine yalnızca anahtarlı özeti yazılır; bu özet
     "Ret istedi"de numarayı engel listesine eklemek için kullanılır.
  3. Cep numarasıysa `https://wa.me/90XXXXXXXXXX?text=<encodeURIComponent(mesaj)>` adresine **302** ile yönlendirir.
  4. Cep değilse ya da numara yoksa öğe `otomatik_atlandi` olur ve kullanıcı nedeni gösteren bir mesajla listeye
     (`/iletisim?wa=atlandi&neden=cep_degil#whatsapp`) ya da kayda geri yönlendirilir. Kota doluysa öğe atlanmaz,
     sırada bekler.
- `ek_telefon` cep değilse (ya da kayıt artık kurallara uymuyorsa) bu, Places'a gitmeden liste ekranında
  anlaşılır ve öğe otomatik atlanır.

**Yönlendirme rotalarında Origin kontrolü yok.** Bu rotalar kullanıcının tıkladığı bir bağlantıyla (üst düzey GET
gezinmesi) açılır ve tarayıcı bu isteklerde Origin başlığı göndermez. Diğer API'lerdeki Origin kontrolü burada
uygulanamaz. Koruma şunlara dayanır:

- oturum çerezi (`SameSite=Lax`, `httpOnly`, `Secure`),
- tahmin edilemez liste öğesi kimliği,
- kiracı + kullanıcı sahipliği,
- tarayıcı `Sec-Fetch-Site: cross-site` gönderiyorsa isteğin işlem yapılmadan reddedilmesi. Böylece başka bir siteden
  verilen bağlantı Places kotası harcatamaz ya da öğeyi atlatamaz.

Rotalar yalnızca okuma ve yönlendirme yapar. Durum değiştiren "Gönderdim", "Atla" ve "Ret istedi" POST'tur ve Origin
kontrollüdür.

### WhatsApp Business (Cloud API) bağlantısı

Onaylı şablonlarla toplu kampanya için (plan: `docs/plan-whatsapp-api.md`). Bağlantı, şablonlar, kampanyalar ve
webhook (teslim bildirimleri, ret, reklamdan gelenler).

- **Ayarlar → WhatsApp Business (API)** (yalnızca yönetici): WABA ID, Phone Number ID, kalıcı erişim anahtarı (system
  user token) ve App Secret.
  - Erişim anahtarı, App Secret, webhook verify token ve test numaraları AES-GCM ile şifreli saklanır (ek doğrulanmış
    veri: kiracı + `whatsapp_api`); hiçbir API yanıtında dönmez, ekranda yalnızca "tanımlı / tanımlı değil".
  - Verify token ilk kayıtta üretilir ve **yalnızca o yanıtta bir kez** gösterilir; "Verify token yenile" yenisini
    üretir (bir kez gösterilir), webhook doğrulamasını sıfırlar ve test modunu yeniden açar.
  - Webhook adresi çalışma alanına özeldir: `/api/whatsapp/webhook/<rastgele kimlik>`.
  - Aynı numara iki çalışma alanına bağlanamaz.
  - **Numara sahipliği:** kayıt sırasında Phone Number ID'nin girilen WABA'ya ait olduğu, çalışma alanının **kendi**
    erişim anahtarıyla `GET /{waba-id}/phone_numbers` (tüm sayfalar) ile doğrulanır. Doğrulanamazsa hiçbir şey
    kaydedilmez. Numaranın başka bir çalışma alanına bağlı olması da aynı, tek tip "Numara doğrulanamadı…" mesajıyla
    reddedilir (400); hangi durumun gerçekleştiği açığa çıkmaz. Meta'ya ulaşılamazsa 502 (tekrar deneyin).
  - Sahipliği doğrulanmamış bağlantı **bağlı sayılmaz**: gönderim yapılmaz (kampanya `baglanti_yok` ile duraklar),
    webhook'u işlenmez (404), şablon senkronu reddedilir. "Bağlantıyı test et" ve işçinin 15 dakikalık kalite yenilemesi
    sahipliği her seferinde yeniden denetler; numara WABA'dan çıkarılmışsa bağlantı kullanılmaz hale gelir (Meta'ya
    ulaşılamaması ya da anahtarın geçersizliği doğrulamayı kaldırmaz). **0011 migration'ından önce kurulmuş
    bağlantılar** doğrulanmamış sayılır: yönetici bir kez "Bağlantıyı test et" demelidir.
- **Bağlantıyı test et:** Graph API `GET /{phone-number-id}?fields=id,display_phone_number,verified_name,quality_rating,whatsapp_business_manager_messaging_limit`
  ile numara, kalite (GREEN / YELLOW / RED / NA) ve portföy mesajlaşma limitini (`TIER_250`, `TIER_2K` …) okur.
  Mesajlaşma limiti **işletme portföyü düzeyindedir** ve portföydeki tüm numara ve araçlarca paylaşılır; bu yüzden
  "bu uygulamanın payı" ayarı vardır (varsayılan **%10**).
- **Webhook aboneliğini etkinleştir:** `POST /{waba-id}/subscribed_apps` (yalnızca düğmeye basılınca).
- **Test modu** varsayılan **açık**: kampanyalar yalnızca Ayarlar'daki test numaralarına (en fazla 5, cep) gider.
  Test modu ancak (a) Meta webhook GET doğrulaması başarıyla yapılmış ve (b) **bu uygulamanın gönderdiği** (sandbox
  olmayan, kuyrukta wamid'i bulunan ve bağlantının **mevcut** `phone_number_id`'sinden gönderilmiş) bir iletinin imzası
  doğrulanmış durum (`statuses`) bildirimi alınmışsa kapatılabilir; aksi halde sunucu reddeder ve nedeni gösterilir.
  Aynı numarayı kullanan başka bir aracın (BSP, WhatsApp Manager) bildirimleri imzalı olsa da kilidi açmaz. İşaretleme
  mevcut `phone_number_id` ile koşullu `UPDATE`'tir. Numara ya da WABA değişince doğrulama sıfırlanır ve test modu
  yeniden açılır.
  - **Bilinen sınır:** App Secret ve verify token'ı bilen yönetici, kuyruktaki bir wamid için kendi imzaladığı sahte
    bir durum bildirimi göndererek (b) koşulunu sağlayabilir. Kilit, yöneticinin yanlışlıkla gerçek gönderime
    geçmesini önlemek içindir; kasıtlı atlatmaya karşı bir güvenlik sınırı değildir.
- **Şablonlar:** Meta WhatsApp Manager'da oluşturulur; burada `GET /{waba-id}/message_templates` ile senkronize
  edilip listelenir (uygulamadan şablon oluşturma yok). Meta'da silinen şablon "SILINDI" olarak kalır.
  - Kampanyada kullanılabilmesi için: `APPROVED`; yalnızca metin başlık ve gövde değişkenleri (konumsal `{{1}}` ya da
    adlandırılmış `{{ad}}`); medya başlık, dinamik URL butonu, kopyalanabilir kod vb. bu sürümde desteklenmez.
  - **Pazarlama şablonunda abonelikten çıkma hızlı yanıt butonu zorunludur** (kapatılamaz). Meta API'de bu buton ayrı
    bir tür değil, metni serbest bir `QUICK_REPLY`'dır; metin "Stop promotions", "Unsubscribe", "Abonelikten çık",
    "Durdur", "İptal" gibi kalıplarla tanınır (`src/lib/whatsapp-api.ts`).
- Testler gerçek ağa çıkmaz (sahte Graph istemcisi, `src/server/whatsapp-api/mock.ts`). Geliştirmede
  `WHATSAPP_API_MOCK=1` ile de sahte istemci kullanılır.

#### WhatsApp kampanyaları (İletişim → Yeni kampanya → WhatsApp (API))

- **Yalnızca yönetici** başlatır (Meta ücreti var). Kanal yalnızca yöneticiye görünür.
- **Şablon ve değişkenler:** yalnızca kampanyada kullanılabilir (onaylı, destekli) şablonlar listelenir. Her değişken
  (`{{1}}`, `{{ad}}` …) kaydın işletme adı, ad soyad / yetkili adı ya da sabit metinle eşlenir; kayıtta boşsa
  "yedek" metin kullanılır, o da yoksa alıcı **"şablon değişkeni boş"** nedeniyle hariç tutulur. Değerler Meta'nın
  kuralı gereği tek satıra indirgenir.
- **Özet:** gönderilecek alıcı sayısı ve hariç tutma nedenleri (izin yok, ret, engel, bireyselde İYS beyanı yok,
  numarada WhatsApp yok, test modu, değişken boş, cep değil, iletişim yok), ilk üç alıcı için şablon metni, numara
  kalitesi, Meta limitinin bu uygulamaya ayrılan payı ve son 24 saatteki kullanım, **tahmini Meta ücreti**
  (uygun alıcı × kategori fiyatı; `src/lib/whatsapp-fiyatlar.ts`, Türkiye, 01.10.2026 kartı — Meta'nın kendi
  kartından doğrulanmadı). Meta yalnızca teslim edilen iletiyi ücretlendirir ve ücreti doğrudan işletmenin WhatsApp
  hesabından keser; Harita CRM fatura kesmez.
- **Test modu** (bağlantı ayarı) açıkken yalnızca test numaraları; "Sandbox" seçilirse Meta'ya hiç gidilmez, şablon
  metni kaydedilir.
- **İşçi (her ileti için):** alıcı kuralları yeniden (kampanya sonrası gelen ret gönderimi durdurur) → şablon hâlâ
  kullanılabilir mi → test modu → kalite (15 dakikadan eskiyse Meta'dan okunur) → gönderim saatleri → günlük sınır
  (atomik) → Meta limitinin payı (kayan 24 saat; ileti sayılır, temkinli) → hız (`WHATSAPP_SANIYE_BASI`) → gönderim.
  Telefon varsa `to`, yoksa BSUID ile `recipient`.
  - Pay ya da günlük sınır dolunca kalan alıcılar **ertesi günün gönderim başlangıcına** kalır.
  - **Kalite kırmızı** → çalışma alanının tüm WhatsApp kampanyaları **duraklar**; kalite düzelince yönetici
    "Devam ettir" der (kalite Meta'dan yeniden okunur, hâlâ kırmızıysa reddedilir). Kırmızıyken yeni kampanya
    başlatılamaz.
  - Şablon Meta'da duraklatılır / devre dışı kalır / silinirse (ya da 132xxx şablon hatası) kampanya duraklar.
- **Meta hata kodları** (https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes):

  | Kod | Sonuç |
  |---|---|
  | 131026 (teslim edilemez) | Başarısız; kişi 90 gün "WhatsApp yok" sayılır |
  | 131050 (kişi pazarlama iletilerini durdurdu) | Ret akışı (WhatsApp izni ret, engel listesi) |
  | 131049 (sağlıklı ekosistem için teslim edilmedi) | Başarısız, tekrar denenmez |
  | 131048 (spam kısıtlaması) | Kampanya duraklar |
  | 4, 80007, 130429, 131056, HTTP 429 (hız) | Geçici; artan beklemeyle en fazla 3 deneme |
  | 132xxx (şablon) | Kampanya duraklar |
  | 0, 3, 10, 190, 200, 131005, HTTP 401 (yetki) | Kampanya duraklar |
  | Ağ hatası / zaman aşımı, 5xx, 131000 | **Belirsiz**: gönderilmiş olabilir; iki kez gitmemesi için tekrar denenmez |

- Kampanya detayında Meta teslim bildirimleri (gönderildi / teslim edildi / okundu / teslim edilemedi + hata kodu) ve
  ücretlendirilen ileti sayısı gösterilir.

#### WhatsApp webhook'u (`/api/whatsapp/webhook/<çalışma alanına özel kimlik>`)

- **GET (abonelik doğrulaması):** `hub.verify_token` çalışma alanının şifreli verify token'ıyla sabit zamanlı
  karşılaştırılır; eşleşirse `hub.challenge` döner ve "webhook doğrulandı" işaretlenir (test modu kilidinin 1. koşulu).
- **POST:** `X-Hub-Signature-256` (App Secret ile ham gövdenin HMAC-SHA256'sı) doğrulanmadan gövde ayrıştırılmaz ve
  hiçbir şey yazılmaz (401). Önce adres (kimlik) doğrulanır: bilinmeyen ya da numarası doğrulanmamış adrese gelen
  gövde hiç okunmaz (404). Gövde akış halinde bayt sayacıyla okunur (Content-Length'e güvenilmez, chunked istek
  dahil); 1 MB aşılınca okuma kesilir (413). Sonra her değişiklikte numara (`metadata.phone_number_id`) ya da
  WABA (`entry.id`) bu bağlantınınkiyle eşleşmeli; eşleşmeyen (başka çalışma alanının numarası) atlanır.
  Bir bildirimin tamamı **tek transaction**'da işlenir: herhangi bir değişiklik hata verirse gelen ileti kimlikleri
  dahil hiçbir şey kalıcı olmaz ve 500 döner; Meta'nın tekrar denemesi bildirimi baştan işler (aynı bildirimdeki bir
  RET kaybolmaz). Başarıyla işlenen istek 200 döner.
- **Teslim durumları** (`statuses`): wamid ile kuyruk satırı bulunur; durum yalnızca ileri gider
  (sent → delivered → read; failed teslim edilmiş iletinin üzerine yazılmaz); hata kodu ve `pricing`
  (ücretlendirildi mi, kategori) yazılır. 131026 → kişi "WhatsApp yok"; 131050 → ret akışı. Bu uygulamanın mevcut
  numaradan gönderdiği (sandbox olmayan) bir iletinin imzalı durum bildirimi test modu kilidinin 2. koşuludur;
  başka aracın iletilerinin bildirimleri sayılmaz. `recipient_user_id` (BSUID) kayda öğrenilir.
- **Kişi eşleştirme:** önce BSUID'in bağlı olduğu kayıt (`user_id` / `from_user_id`), yoksa telefon (`wa_id` →
  `leads.telefon_e164`), yoksa **bu BSUID'e gönderim yapılmış kuyruk satırının kaydı** (`message_queue.adres_ozeti`).
  Kullanıcı adını açmış kişide telefon gelmeyebilir; kayıt yalnızca BSUID ile tutulur. BSUID değişimi
  (`system.type` `user_changed_user_id` / `user_changed_number`, `previous_user_id`) kayda işlenir. Yalnızca BSUID'le
  gelen ret, bulunan kayda uygulanır; kaydın telefonu dahil tüm adresleri engellenir ve BSUID kayda bağlanır.
- **Meta yük alanları** (resmî belgeyle 30.10.2026'da karşılaştırıldı: *Business-scoped user IDs* ve
  *user_preferences webhook reference*): `contacts[].user_id`, `messages[].from_user_id` (telefon gizliyse `from` /
  `wa_id` yok), `statuses[].recipient_user_id` (sent / delivered / read / failed), `user_preferences[].user_id` ve
  `value` (`stop` / `resume`), `system.user_id` / `previous_user_id` / `type` doğrulandı. **Doğrulanamayan:** telefona
  gönderilmiş bir iletinin hiçbir durum bildirimi gelmeden (BSUID kayda bağlanmadan) kişinin yalnızca BSUID'le ret
  yazması durumunda kayda bağlanacak bir veri yoktur; bu ret yalnızca BSUID'i engeller (bilinen sınır). Belgeye göre
  durum bildirimleri BSUID'i her zaman taşıdığından pratikte ilk durum bildirimiyle bağ kurulur.
- **Ret:** metin **tam olarak** `RET`, `DUR`, `İPTAL`, `STOP`, `ABONELİKTEN ÇIK`, `ÇIK` (Türkçe büyük/küçük harf,
  boşluk ve sondaki noktalama yok sayılır; "iptal etmek istemiyorum" ret değildir) ya da şablondaki abonelikten çıkma
  butonu (`type: button`) → ret akışı (genel izin + WhatsApp izni ret, telefon ve BSUID engel listesine).
  `user_preferences` "stop" da ret sayılır; "resume" yalnızca olaydır (ret geri alınmaz).
- **Reklamdan gelen** (`referral.source_type = ad`): kişi yoksa `kaynak = meta_reklam` kayıt (ad: WhatsApp profil
  adı, alıcı türü bireysel), WhatsApp izni `var` ("WhatsApp'tan kendisi yazdı"), reklam kimliği ve başlığı,
  `ctwa_clid`, ücretsiz pencere bitişi (+72 saat). Aynı kişi tekrar yazarsa yeni kayıt açılmaz; reklam bilgisi ve
  pencere güncellenir. Kayıtlar listesinde "WhatsApp penceresi açık" rozeti.
- **Diğer gelen iletiler** yalnızca `lead_events`'e "Gelen WhatsApp mesajı (tür)" olayı olarak yazılır; **ileti
  metni hiçbir tabloda saklanmaz**. Meta'nın tekrar gönderdiği webhook ikinci olay üretmez (ileti kimliği 7 gün
  tutulur, `npm run cleanup` siler). Bilinen bir kişiye bağlanamayan ve reklamdan gelmeyen ileti için kayıt açılmaz.
- **Şablon durumu** (`message_template_status_update`): APPROVED / REJECTED / PAUSED / DISABLED / ARCHIVED / DELETED /
  PENDING_DELETION / LOCKED işlenir, kampanyada kullanılabilirlik yeniden hesaplanır (kullanılamazsa çalışan kampanya
  duraklar). Diğer olaylar (FLAGGED, IN_APPEAL …) bir sonraki senkronu bekler.
- **Limit** (`phone_number_quality_update`, `business_capability_update`): `max_daily_conversations_per_business`
  (yoksa `current_limit`) katmanı yazılır ve kalite bir sonraki gönderimden önce Meta'dan yeniden okunur. Not: güncel
  Meta belgesine göre `phone_number_quality_update` kalite puanını değil **limit / hız** değişikliğini bildirir;
  kalite puanı işçi tarafından 15 dakikada bir `GET /{phone-number-id}` ile okunur.
- Meta App Dashboard → WhatsApp → Yapılandırma → Webhook'taki **Test** bağlantısı, kullanıcı adı / BSUID senaryolu
  örnek yükleri bu uca gönderebilir (imza da Meta tarafından atılır).

#### Pilot: işletme sahibinin kendi Business Manager'ında system user ve kalıcı anahtar

1. developers.facebook.com'da işletmenin Business Manager'ına bağlı **Business** türünde bir uygulama açın ve
   WhatsApp ürününü ekleyin. App Secret: Uygulama ayarları → Temel.
2. Business Settings → Kullanıcılar → **System users** → Ekle (**Employee** rolü yeterli; Admin gerekmez).
3. "Varlık ata": yalnızca ilgili **WhatsApp hesabı** (tam kontrol) ve bu uygulama.
4. "Token oluştur": uygulamayı seçin, süre **Hiçbir zaman**, izinler yalnızca `whatsapp_business_messaging` ve
   `whatsapp_business_management`.
5. WABA ID ve Phone Number ID: WhatsApp Manager → Telefon numaraları (ya da uygulamanın API kurulumu sayfası).
6. Harita CRM → Ayarlar → WhatsApp Business (API): bilgileri kaydedin; gösterilen verify token'ı ve callback URL'yi
   uygulamanın WhatsApp → Yapılandırma → Webhook alanına girin; `messages`, `message_template_status_update`,
   `phone_number_quality_update`, `business_capability_update` ve `user_preferences` alanlarına abone olun.
7. "Webhook aboneliğini etkinleştir" ve "Bağlantıyı test et".
8. Test modunda kendi numaranıza bir kampanya gönderin; teslim bildirimi gelince test modu kapatılabilir.

- **Numara başka bir sağlayıcıda ya da araçta kullanılıyorsa** bu bağlantı onu bozmaz: Harita CRM aynı WABA'ya **ek
  abone** olur; mevcut aracın webhook'u ve sohbet yönetimi çalışmaya devam eder. Mesajlaşma limiti ortaktır; payı
  buna göre ayarlayın.
- **İlk gerçek kampanya küçük ve izinli bir listeyle** yapılmalıdır (kalite puanı ve limit buna göre şekillenir).
- Meta geliştirici uygulamasının ücretsiz test numarasıyla deneme: uygulamanın API kurulumu sayfasındaki test numarası
  yalnızca alıcı listesine eklenmiş (en fazla 5) numaraya gönderir; listede olmayana `131030` hatası döner.

## Proje yapısı

```
drizzle/                         migration SQL'leri (drizzle-kit)
scripts/migrate.ts, cleanup.ts,  migration, günlük temizlik,
  kota.ts, sinir.ts, worker.ts   kota / günlük sınır değiştirme, gönderim işçisi
  ortam.ts                       betikler için .env yükleme
  demo-*.ts                      elle deneme ortamı (demo.db, sahte istemciler; docs/TEST-REHBERI.md)
docs/                            elle deneme rehberi, örnek içe aktarma dosyası
src/proxy.ts                     oturum çerezi yoksa /giris (iyimser; asıl kontrol sunucuda)
src/app/(auth)/                  giriş/kayıt, ilk çalışma alanı kurulumu
src/app/davet/[token]/           davet kabulü
src/app/abonelik/[belirtec]/     herkese açık abonelikten çıkma sayfası
src/app/(app)/                   panel, tarama, kayitlar (istemci detay paneli), iletisim (+kampanya/[id]), ayarlar
src/app/api/                     auth, taramalar, adres, kayitlar/[id] (+olaylar), olaylar/[id], kayitlar/disa-aktar,
                                 ayarlar/ileti, ayarlar/saglayicilar/[kanal] (+test), kampanyalar (+ozet, [id]),
                                 abonelik/[belirtec], webhook/sms/[anahtar], whatsapp/liste (+[id]),
                                 whatsapp/ac/[id], whatsapp/ac-kayit/[leadId], kayitlar/[id]/whatsapp
src/instrumentation.ts           başlangıçta yarıda kalan taramaları kapatır
src/components/                  menü, harita, Google atfı
src/lib/                         sabitler, mesajlaşma sabitleri, şablon, İstanbul saati, Places birimleri
src/server/db/                   bağlantı, şema, güvenli migration (yalnızca repo/ ve auth erişir)
src/server/repo/                 kiracıya bağlı depo fonksiyonları; sistem/ = bağlam öncesi işler
src/server/places/               Places istemcisi + mock
src/server/scan/                 hücre geometrisi + tarama motoru (saf)
src/server/servisler/            tarama, canlı bilgi, kampanya, işçi, sağlayıcı, abonelik servisleri
src/server/messaging/            sağlayıcı arayüzü + sandbox, SMTP, Netgsm, alıcı kuralları, şifreleme, abonelik
                                 belirteci, SMTP SSRF koruması
tests/                           Vitest
```

## Alınan kararlar

- **Otomatik gösterim %80'e kadar (1 Kasım 2026; önceki "liste Places'a kendiliğinden gitmez" kararını değiştirir):**
  Kayıtlar listesinde adı girilmemiş Google kayıtlarının ve Bölge tara sonuçlarının adı / adresi, aylık kullanım
  %80'e ulaşana kadar kendiliğinden gelir; sonra satır "Göster" düğmesine döner. Eşik sunucuda, kota ayırmanın
  atomik ifadesinde uygulanır. Listeyi çizen sunucu sayfası yine Places'a gitmez. Detay paneli açılışta Enterprise
  çağrısını yapar; "ilgilenmiyor" kayıtta ve çağrı kullanımı %80'e taşıyacaksa yapmaz (düğme).
- **Arayüzde birim yok:** düğmelerde ve metinlerde birim ya da işlem başı maliyet yazmaz; kullanım yalnızca menüdeki
  yüzde göstergesinde ve Ayarlar > Kullanım ve paket'te (yüzde ve kalemlere göre pay) görünür. Birim sistemi ve kota
  sunucuda aynen sürer; birim tablosu yalnızca bu README'dedir. Kampanya özetindeki tahmini **Meta** ücreti ($) gerçek
  mesaj ücreti olduğu için kalır (yalnızca yöneticiye).
- **Google bilgileri için 30 dakikalık bellek önbelleği — Places politikası yorumu, canlıya almadan önce gözden
  geçirilmeli:** Google'dan gelen ad, adres, konum ve detay panelinin iletişim bilgileri istemcide yalnızca bellekte
  (modül düzeyinde Map), kayıt kimliğine göre en fazla 30 dakika tutulur ve aynı oturumda yeniden kullanılır.
  localStorage, sessionStorage, IndexedDB, Cache API ve sunucu kullanılmaz. Sayfa yenilenince, çıkış ya da giriş
  yapılınca, çalışma alanı değişince ve 30 dakika dolunca silinir; süre ilk alınıştan sayılır, okumak uzatmaz.
  *Gerekçe:* otomatik gösterimde aynı kayıtlar (sekme, sayfa ya da süzgeç değişip geri dönülünce) tekrar tekrar
  istenir; önbellek tüketimi yaklaşık üçte bire indirir (yukarıdaki tahmin). Bunu, Google Maps Platform
  koşullarındaki önbelleğe alma kısıtının dışında, görüntülemenin kısa süreli bir parçası olarak yorumluyoruz; bu yorum
  bir hukuk ya da Google incelemesinden geçmedi. Canlıya almadan önce güncel Google Maps Platform Hizmet Koşulları ve
  Places politikalarıyla karşılaştırılmalı; gerekirse süre kısaltılır ya da önbellek kapatılır
  (`GOOGLE_ONBELLEK_SURESI_MS`). Tarayıcı depolaması yasağı `tests/liste-maliyeti.test.ts` ve
  `tests/gorunurluk.test.ts` ile denetlenir.
- **Tarama sonuçlarının incelenmesi:** `leads.inceleme` (incelenmedi / ilgileniyor / ilgilenmiyor; migration 0013,
  mevcut kayıtlar "ilgileniyor"). "İlgilenme" silmez; gizler ve gönderimlerden çıkarır.
- **Google adı kullanıcının kaydına aktarılmaz:** ad girme alanı her zaman boş gelir; ipucu yalnızca "İşletmeyle
  görüştüğünüzde adını buraya yazın". Alanın yanında Google'daki ad gösterilmez (incelemede "İlgilen" denince o
  satırın Google bilgisi gizlenir); Places içeriğini kayda taşımayı kolaylaştıran ipucu, kopyala düğmesi, otomatik
  doldurma ya da sürükle-bırak yoktur. Kampanya özeti ve alıcı listesi Google kayıtlarını "Google kaydı · ad
  girilmemiş" olarak gösterir; ad istenince yalnızca ekranda görünür, mesaja yazılmaz.
- **CSV'ler Türkçe Excel'e göre:** dışa aktarma ve "Sorunlu satırlar" UTF-8 BOM + noktalı virgül kullanır; dışa aktarmada
  başlıklar ve kod değerleri (durum, izinler, alıcı türü, kaynak, inceleme) Türkçe etiketlerle yazılır.
- **Kayıt geçmişi:** bilgi değişiklikleri "Bilgi güncellendi" (`bilgi` olay türü), ileti izni değişiklikleri "İzin
  değişti" türüyle yazılır (eski kayıtlarda "not" + sistem olarak duranlar da "Bilgi güncellendi" gösterilir). Detay
  panelinde notlar tek bölümdedir: kişi eklenirken / içe aktarılırken girilen kalıcı "kayıt notu" ve tarihli notlar.
- **Liste maskesi:** Telefon ve web sitesi listeden kaldırıldı; listede istenen bilgi yalnızca ad + adres (Place Details Pro),
  detay paneli Enterprise alanlarını ayrı çağrıyla çeker. Ayrıntı ve maliyet yukarıda.
- **Tarama merkezi:** İmzalı belirteç yerine, kaynağı ne olursa olsun tüm merkez koordinatları 30 gün sonra
  silinir; `merkez_kaynagi` bilgi amaçlı kalır. Süre `merkez_tarihi`'nden sayılır; aynı koordinatla açılan yeni
  tarama en eski taramanın süresini devralır.
- **Ret kalıcıdır:** ileti izni ret'ten başka değere geçemez; kaydın bilinen tüm adresleri (gönderim anında
  Places'tan alınan telefon dahil, yalnızca özet) engellenir. Ret her yerde (detay paneli, WhatsApp izni, WhatsApp
  günlük liste, içe aktarmadaki ret satırları) kaydın adını ve "geri alınamaz" uyarısını gösteren bir onaydan geçer;
  API'ler `retOnayi: true` olmadan ret isteğini 400 ile reddeder.
- **Alıcı türünün varsayılanı yok:** "Kişi ekle"de ve içe aktarmada kullanıcı Tacir/esnaf (işletme) ya da Bireysel
  (kişi) seçmek zorundadır; içe aktarmada sütun eşlenmemişse tüm dosya için seçim yapılmadan önizlenemez, sütun
  eşliyse boş hücre hatalı satırdır.
- **Arayüzde komut yok:** kota ve günlük sınır komutları (`npm run kota`, `npm run sinir`) yalnızca bu README'de;
  arayüz "yöneticinizle/destekle iletişime geçin" der.
- **Tek işçi:** gönderim turları veritabanı kilidiyle sırayla çalışır; gönderimden hemen önce satır ve kampanya
  yeniden denetlenir.
- **Migration:** yalnızca `npm run db:migrate` (önce yedek; tek transaction; yabancı anahtar denetimi COMMIT'ten önce).
- **Migration yedeklerinin saklanması:** en son 10 yedek ve son 30 gün içindekilerin hepsi saklanır; diğerleri
  `db:migrate` sonunda ve işçinin günlük bakımında otomatik silinir. Şifreli / harici saklama operasyonun işidir
  (canlıda Litestream önerilir).
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
- **WhatsApp:** yarı otomatik; numara yalnızca "WhatsApp'ta aç" sunucu yönlendirmesinde çözülür (ekran ve yenileme
  Places çağrısı yapmaz); yönlendirme rotaları Origin yerine oturum + SameSite + Sec-Fetch-Site'a dayanır.
- **SMS sağlayıcısı Netgsm** (resmî SDK ile doğrulanan REST v2 alanları); ret yolu "RET yazıp <ret numarası>" metni +
  kiracıya özgü gizli webhook. Places'tan alınan telefon saklanmaz; gönderim anında 4 birim.

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
9. **Engel listesinden çıkarma ve ret'in geri alınması:** Arayüz yok; ret kalıcıdır (kaydın izni geri alınamaz,
   adresleri engelli kalır). Yanlışlıkla "ret" işaretlenen kayıt için yönetici, denetim kayıtlı bir "ret'i ve engeli
   kaldır" işlemi isterse ürün kararı gerekir (ör. kişinin yeni, belgeli onayı).
10. **Geri dönen e-postalar (bounce) ve şikâyetler** işlenmiyor; SMTP sağlayıcısının panelinden izlenmeli.
    SMS teslim raporları (`/sms/rest/v2/report`) da çekilmiyor; "gönderildi" Netgsm'in kabulü demektir.
11. **Sandbox mesaj metni** (`message_queue.sandbox_icerik`) kampanya silinene kadar tutulur; kampanya silme /
    saklama süresi yok.
12. **WhatsApp ve İYS:** WhatsApp mesajları da ticari elektronik ileti sayılabilir; kullanıcı kendi hesabından
    gönderse de İYS / 6563 yükümlülükleri çalışma alanındadır. WhatsApp Business kullanım şartları (toplu ve
    istenmeyen mesaj yasağı) için günlük sınır düşük tutulmuştur. Hukuki gözden geçirme önerilir.
13. **"Gönderdim" beyana dayanır:** uygulama mesajın gerçekten gönderildiğini doğrulayamaz.
14. **Açık bağımlılık uyarısı — nodemailer (orta):** `addressparser`'daki üç açık (GHSA-8c8m-p3m8-cjg8,
    GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h) 10.1.4'te düzeltildi; o sürüm 18.10.2026'da yayınlandığı için
    "en az iki haftalık sürüm" kuralına göre henüz kullanılmıyor (şu an 10.1.1). Etkisi önlendi: alıcı adresleri
    `epostaNormallestir` ile yalnızca tırnaksız, yorumsuz, `;`/`>`/`,` içermeyen adreslere sınırlanıyor; gönderen adresi
    Zod e-posta doğrulamasından geçiyor. **1.11.2026'dan sonra 10.1.4 veya üstüne yükseltilmeli.**
    `drizzle-kit` üzerinden gelen `esbuild` uyarısı yalnızca geliştirme aracını etkiler (çalışma zamanında yok).
15. **WhatsApp "kendisi yazdı" izni ve İYS:** Reklamdan yazan kişi WhatsApp izni "var" (kaynak: kendisi yazdı) ile
    kaydedilir; ancak varsayılan alıcı türü bireysel olduğundan İYS beyanı olmadan kampanyaya girmez. Alıcı türünü
    tacir/esnaf yapmak yalnızca yöneticiye ve açıklamayla açıktır (olay olarak loglanır). Kişinin işletmeye
    yazmasının ticari ileti onayı sayılıp sayılmayacağı hukuken değerlendirilmeli.
16. **WhatsApp ücretsiz pencere süresi:** Meta'nın fiyat sayfası 72 saat, geliştirici changelog'u (28.09.2026) koşullu
    olarak 7 güne kadar der; rozet en az süreyi (72 saat) gösterir.
17. **WhatsApp fiyatları** (`src/lib/whatsapp-fiyatlar.ts`) Meta'nın kendi kartından doğrulanmadı; pilot öncesi
    kontrol edilmeli. Tahmin yalnızca bilgidir.
18. **WhatsApp limit payı** benzersiz alıcı yerine ileti sayar (aynı kişiye iki kampanya iki sayılır); Meta'nın
    sayımından temkinlidir.
19. **Pilot öncesi WhatsApp bağlantıları:** 0011 migration'ından önce kurulmuş bağlantılar numara sahipliği
    doğrulanmadığı için kullanılmaz; yöneticinin bir kez "Bağlantıyı test et" demesi gerekir.
20. **İçe aktarma satırlarının ömrü:** tamamlanmamış oturumun satırları 60 dakikadan sonra kullanılamaz, işçi saatte
    bir siler (en fazla ~2 saat). Daha kısa süre isteniyorsa işçinin bakım aralığı (`SAATLIK_BAKIM_MS`) düşürülebilir.

## Bilinen sınırlar

1. **Test modu kilidi kasıtlı atlatmaya karşı değildir:** App Secret ve verify token'ı bilen yönetici kuyruktaki bir
   wamid için kendi imzaladığı sahte durum bildirimiyle 2. koşulu sağlayabilir. Kilit, yanlışlıkla gerçek gönderime
   geçmeyi önler.
2. **Yalnızca BSUID'le gelen ret:** telefona gönderilmiş iletinin hiçbir durum bildirimi gelmeden (BSUID kayda
   bağlanmadan) kişi yalnızca BSUID'le ret yazarsa kayda bağlanacak veri yoktur; ret yalnızca BSUID'i engeller.
3. **"Tekrar kullan" süre devri koordinat eşitliğine dayanır:** kullanıcı merkezi haritada kaydırırsa yeni bir merkez
   (yeni 30 gün) sayılır.
4. **XLSX denetimi:** ZIP64 ve deflate dışı sıkıştırma reddedilir; açılmış içerik toplamı 50 MB ve iç dosya sayısı
   1.000 ile sınırlı. Doğrulama sırasında dosya bir kez fazladan açılır (en fazla 50 MB bellek).
5. **Gövde sınırları uygulama içindedir:** webhook (1 MB) ve içe aktarma (5 MB) gövdeleri akışta kesilir; yine de önde
   çalışan ters vekilde (nginx `client_max_body_size`, Caddy `request_body max_size`) aynı sınırları koymanız önerilir.
6. **Origin denetimi:** değişiklik yapan API'ler `Origin` başlığı OLMAYAN isteklere (tarayıcı dışı istemciler) izin
   verir; oturum çerezi SameSite=Lax olduğu için tarayıcıdan CSRF'e karşı ikinci katman yine de vardır.
7. **`WHATSAPP_API_MOCK=1` canlıda açılmamalı:** açıksa gönderimler sahte istemciye gider ve "gönderildi" görünür.
8. **SMS gelen webhook biçimi** Netgsm belgesiyle doğrulanmadı (yukarıda, SMS bölümü).
9. **Bilinen sınır (yalnızca geliştirme):** `npm run dev` / `npm run demo` ile, özellikle `.next/dev` önbelleği eski
   bir sürümden kaldıysa, girişten sonraki ilk sayfada sağ üstteki onay bildirimleri görünmeyebilir; bir sayfa
   yenilemesinden (ya da Fast Refresh'ten) sonra görünür. Üretim derlemesinde (`npm run build` + `next start`, demo
   ortamıyla denendi) girişten hemen sonra da görünür. Geliştirmede sürerse sunucuyu kapatıp `.next/dev` klasörünü
   silin.
