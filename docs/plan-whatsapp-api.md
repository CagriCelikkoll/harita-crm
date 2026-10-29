# 3. aşama planı — WhatsApp Business Platform (Cloud API) ile toplu kampanyalar

Durum: **onaylandı (29.10.2026)** — K1–K16 önerildiği gibi; kullanıcı adı yalnızca gösterim için saklanır. Bölüm bölüm
uygulanıyor; her bölüm sonunda typecheck,
lint, testler çalıştırılır, değişen dosyalar ve önerilen commit mesajı yazılır (commit kullanıcıda).

Kapsam: işletmenin zaten iletişimde olduğu müşterilere ve Click-to-WhatsApp (CTWA) reklamlarından gelen kişilere
**onaylı şablonlarla** toplu kampanya. Gelen kutusu / sohbet yönetimi yok.

---

## 0. Güncel Meta dokümantasyonu kontrolü (29.10.2026)

| Konu | Resmi dokümanda bulunan | Plana etkisi |
|---|---|---|
| Graph API sürümü | v26.0 (29.07.2026). v20.0 kaldırıldı; v21.0 21.01.2027'de kalkıyor. | `META_GRAPH_SURUMU` varsayılanı `v26.0`; B'de yeniden kontrol. |
| Mesajlaşma limiti | **İşletme portföyü (business portfolio) düzeyinde**, tüm numaralar paylaşır. Kayan 24 saatte, müşteri hizmetleri penceresi **dışında** ileti teslim edilen benzersiz kullanıcı sayısı. Katmanlar 250 → 2.000 → 10.000 → 100.000 → sınırsız. `messaging_limit_tier` kaldırıldı; `whatsapp_business_manager_messaging_limit` alanı kullanılmalı. Artışta `business_capability_update` webhook'u. | Limit, numaradan değil portföyden okunur; pilot işletme başka araçlarla da gönderiyorsa limiti paylaşır → "uygulamaya ayrılan pay" ayarı (K7). |
| BSUID / kullanıcı adları | Nisan 2026'dan beri tüm `messages` webhook'larında `user_id` (BSUID, ör. `US.1349…`) var. Kullanıcı adı açan kişinin telefonu (`wa_id`) webhook'ta **gelmeyebilir** (son 30 günde o numarayla etkileşim yoksa ya da kişi rehberde değilse). BSUID değişimi `messages` alanında `system.type = user_changed_user_id` (`previous_user_id` ile); numara değişimi `user_changed_number` (o da BSUID'i yeniler). `user_id_update` abone olunabilir bir alan değil. | Kişi eşleştirme önce BSUID, sonra telefon. Telefon olmadan kayıt açılabilmeli. |
| BSUID'e gönderim | Belgede "API'ler BSUID'e gönderimi Temmuz 2026'dan itibaren destekleyecek"; Marketing Messages API örneğinde `recipient` alanı (telefon `to` ile birlikteyse `to` öncelikli). Meta telefonla göndermeyi öneriyor (webhook'larda telefon gelmeye devam etsin diye). | Telefon varsa `to`, yoksa `recipient` = BSUID. Cloud API `/messages` uç noktasında `recipient` desteği B'de referanstan doğrulanacak; doğrulanamazsa telefonsuz kişiler `telefon_yok` nedeniyle hariç (K14). |
| Ücretsiz giriş penceresi (FEP) | 28.09.2026 changelog: CTWA reklamından başlayan sohbetlerde FEP **artık 7 güne kadar** açık kalabiliyor (önceden 72 saat). | İstenen "72 saat" yerine süre ayarlanabilir sabit; varsayılan K6. Koşullar D'de belgeden okunacak. |
| Fiyatlandırma | 01.07.2025'ten beri ileti başı; yalnızca **teslim edilen** şablon iletisi ücretli; kategori × alıcının ülke kodu. Güncel kart 01.10.2026. Türkiye: pazarlama 0,0109 USD, hizmet/doğrulama 0,0009 USD (**üçüncü taraf kaynaklar; Meta CSV'sinden C'de doğrulanacak**). | `src/lib/whatsapp-fiyatlar.ts` içinde tarih ve kaynakla. |
| Test numarası | Geliştirici uygulamasının ücretsiz test numarası; yalnızca alıcı listesine eklenmiş (en fazla 5) numaraya gönderir, listede olmayana hata `131030`. | README adımları. |

Uygulama sırasında yeniden doğrulanacaklar (uydurmamak için açıkça işaretli): Cloud API `/messages`'ta `recipient`
desteği; pazarlama "abonelikten çıkma" butonunun şablon bileşenindeki biçimi ve webhook'taki `button.payload`/`text`
değeri; hata kodları (131026 alıcıda WhatsApp yok / teslim edilemez, 131049 pazarlama sınırlaması, 131050 kullanıcı
pazarlamayı durdurdu, 130429 hız sınırı, 131048 spam hız sınırı, 131056 çift hız sınırı); numara alanları
(`quality_rating`, `throughput`); FEP koşulları; geliştirme modundaki uygulamanın gerçek webhook alıp almadığı.

---

## 1. Veri modeli

Tüm yeni tablolar `tenant_id` taşır; erişim yalnızca repo katmanından, her fonksiyon `TenantContext` alır ve her biri için
izolasyon testi yazılır (mevcut kural).

### 1.1 `leads` (değişiklik)
| Sütun | Değişiklik |
|---|---|
| `kaynak` | **Yeni**: `google` \| `ice_aktarma` \| `elle` \| `meta_reklam`. Mevcut kayıtlar `google`. |
| `place_id` | **NULL olabilir**; `CHECK ((kaynak = 'google') = (place_id IS NOT NULL))`. `(tenant_id, place_id)` tekilliği kalır (SQLite'ta NULL'lar çakışmaz). |
| `telefon_e164` | **Yeni**: `ek_telefon`'dan türetilen normalize numara (`905XXXXXXXXX`); `(tenant_id, telefon_e164)` indeksi. Çakışma kontrolü ve webhook eşleştirmesi için. |

- Google kayıtlarında "Places içeriği saklanmaz" kuralı aynen kalır; mevcut şema testleri değişmez, `CHECK` için yeni test.
- Google dışı kayıtlarda ad (`isletme_adi` / `yetkili_adi`) ve telefon (`ek_telefon`) kullanıcının verisidir, saklanır.
- Places çağıran servisler (`canli-bilgi`, `telefon`, WhatsApp yarı otomatik liste) `place_id`'siz kayıtları atlar —
  aksi halde birim harcanır ya da hata olur.
- **Migrasyon riski:** SQLite'ta sütunu NULL yapılabilir yapmak tablo yeniden kurulumu demek. Drizzle'ın üreteceği
  "yeni tablo → kopyala → eskiyi sil" adımı transaction içinde `PRAGMA foreign_keys=OFF` uygulanamadığı için
  `lead_events`, `whatsapp_listesi`, `message_queue` gibi `ON DELETE CASCADE` bağlı tablolardaki satırları **silebilir**.
  Bu migrasyon `scripts/migrate.ts` içinde transaction dışında, `foreign_keys=OFF` + `PRAGMA foreign_key_check` ile
  çalışan özel bir adım olarak yazılır; `migrasyon.test.ts`'e "bağlı satırlar korunur" testi eklenir.

### 1.2 `whatsapp_kisileri` (yeni, `leads` ile 1:1)
`tenant_id`, `lead_id` (PK, bileşik FK), `bsuid` (`(tenant_id, bsuid)` kısmi tekil), `wa_kullanici_adi` (yalnızca
gösterim; K-ek), `izin` (`yok` \| `var` \| `ret`, varsayılan `yok`), `izin_tarihi`, `izin_kaynagi` (`form` \|
`sozlesme` \| `sozlu` \| `kendisi_yazdi` \| `reklam`), `izin_notu`, `izin_ice_aktarma_id`, `iys_beyani` (K2),
`whatsapp_yok_tarihi` (131026 ile işaretlenir), `reklam_kimligi`, `reklam_basligi`, `ctwa_clid` (ileride Conversions
API için; yalnızca kimlik), `pencere_bitis`, `olusturma_tarihi`, `guncelleme_tarihi`.

Ayrı tablo seçildi: `leads` şişmez, WhatsApp'a özgü alanlar tek repoda toplanır.

### 1.3 `ice_aktarmalar` (yeni)
`id`, `tenant_id`, `kullanici_id`, `dosya_adi`, `durum` (`hazirlaniyor` \| `tamamlandi` \| `iptal`), `satirlar`
(ayrıştırılmış satırlar, JSON — **geçici**: tamamlanınca ya da 1 saat sonra `cleanup` siler), `eslem` (JSON),
sayılar (`toplam`, `eklenen`, `guncellenen`, `hatali`, `cakisan`, `engelli`), `beyan_onay_tarihi`, `beyan_surumu`,
`olusturma_tarihi`. İzin kanıtı için kalıcı iz: kimin, ne zaman, hangi beyan metniyle içe aktardığı.

### 1.4 `whatsapp_baglantilari` (yeni, çalışma alanı başına bir satır)
`tenant_id` (PK), `webhook_kimligi` (rastgele, tekil; webhook URL'sinde), `waba_id`, `phone_number_id` (gizli değil;
webhook'ta numara doğrulaması için düz), `sifreli_veri` (AES-GCM: kalıcı erişim anahtarı, App Secret, verify token —
mevcut `ILETI_SIFRELEME_ANAHTARI` ve şifreleme fonksiyonu), `test_modu` (bool), `test_numaralari` (şifreli JSON, en
fazla 5), `uygulama_payi` (K7), önbellek alanları (`gorunen_numara`, `dogrulanmis_ad`, `kalite`, `limit`,
`son_kontrol`). API yanıtlarında şifreli alanlar asla dönmez; arayüz yalnızca "tanımlı / tanımlı değil" gösterir.

### 1.5 `whatsapp_sablonlari` (yeni)
`tenant_id`, `meta_id`, `ad`, `dil`, `kategori` (`MARKETING` \| `UTILITY` \| `AUTHENTICATION`), `durum`
(`APPROVED`, `PAUSED`, …), `bilesenler` (JSON), `degisken_sayisi`, `abonelik_butonu` (bool), `destekleniyor` (bool +
neden; K11), `kalite`, `senkron_tarihi`. Tekil: `(tenant_id, ad, dil)`.

### 1.6 Mevcut tablolarda ekler
- `KANALLAR` += `whatsapp_api` → `kampanyalar`, `message_queue`, `gonderim_sayaclari`.
- `kampanyalar`: `sablon_id` (WhatsApp için), `degisken_eslem` (JSON), durum += `duraklatildi`, `duraklatma_nedeni`.
- `message_queue`: `teslim_durumu` (`sent` \| `delivered` \| `read` \| `failed`), `teslim_hata_kodu`,
  `teslim_guncelleme`, `ucret_kategorisi`, `ucretli` (webhook `pricing` nesnesinden); `(tenant_id, saglayici_kimligi)`
  indeksi (wamid ile durum eşleştirme).
- `engel_listesi`: tür += `wa_kimlik` (BSUID özeti; telefonsuz ret için). Kaynak olarak mevcut `whatsapp_ret`.
- `HARIC_NEDENLERI` += `whatsapp_izni_yok`, `whatsapp_yok`, `telefon_yok`, `test_modu`, `iys_beyani_yok`.
- `OLAY_TURLERI` += `whatsapp_gelen` (metin saklanmaz), `whatsapp_api`, `izin`, `ice_aktarma`.
- `whatsapp_gelen_kimlikleri` (yeni): `tenant_id`, `wamid`, `tarih` — webhook tekrarlarını elemek için; içerik yok,
  7 gün sonra `cleanup` siler.

---

## 2. Bölümler, dosyalar, ekranlar

### A1 — Şema ve kişi modeli
- `src/server/db/schema.ts`, `drizzle/0007_*.sql` (+ özel yeniden kurulum adımı `scripts/migrate.ts`)
- `src/lib/telefon.ts` (normalleştirme tek yerde; mevcut `telefonNormallestir`/`cepMi` buraya ya da mevcut yerinde kalır)
- `src/server/repo/kayitlar.ts` (kaynak, `telefon_e164`), `src/server/repo/whatsapp-kisileri.ts` (yeni),
  `src/server/repo/ice-aktarmalar.ts` (yeni)
- Places çağıran servislerde `place_id` yok kontrolü
- Testler: `sema.test.ts` (CHECK, Google kuralları), `migrasyon.test.ts` (bağlı satırlar korunur),
  `izolasyon.test.ts` (yeni repolar)

### A2 — İçe aktarma, elle kayıt, izin ve alıcı kuralları
- **Ekran: Kayıtlar → İçe aktar** (`/kayitlar/ice-aktar`), 4 adım:
  1. Dosya yükleme (CSV/XLSX, en fazla 5.000 satır, 5 MB) → sunucu ayrıştırır, ilk 20 satırı ve sütunları döner.
  2. Sütun eşleme: ad, işletme adı, telefon, e-posta, etiket, alıcı türü, WhatsApp izni, izin tarihi, izin kaynağı,
     not. İzin sütunu eşlenmezse tümü `yok`.
  3. Önizleme raporu (yazmadan): geçerli / hatalı satır (satır no + neden), normalize telefonla mevcut kayıtla
     çakışanlar, engel listesindekiler, izinli sayısı. Hatalı satırlar CSV olarak indirilebilir.
  4. Onay: "izin var" satırı varsa beyan kutusu işaretlenmeden içe aktarma **sunucu tarafında** reddedilir (beyan metni
     sürümüyle `ice_aktarmalar`'a yazılır).
- Çakışma politikası (K10): varsayılan "atla ve raporla"; seçenek "yalnızca boş alanları doldur". `ret` hiçbir koşulda
  geri alınmaz.
- **Ekran: Yeni kayıt** (elle; kaynak `elle`).
- **Kayıt detayı:** WhatsApp izni bölümü (durum, tarih, kaynak, not; değişiklik `izin` olayı olarak loglanır).
- `aliciDegerlendir(kayit, 'whatsapp_api', …)`: ret (genel ya da WhatsApp) → hariç; engel (telefon ya da BSUID) → hariç;
  `izin ≠ var` → `whatsapp_izni_yok`; `whatsapp_yok_tarihi` son 90 günde → `whatsapp_yok`; bireysel için İYS kuralı
  (K2); telefon da BSUID de yoksa `telefon_yok`; cep değilse `cep_degil`.
- Bağımlılık (K9): `papaparse` (CSV) + `exceljs` (XLSX), sürümler sabitlenir.
- Dosyalar: `src/app/(app)/kayitlar/ice-aktar/*`, `src/app/api/ice-aktarma/*`, `src/server/servisler/ice-aktarma.ts`,
  `src/server/messaging/alici-kurallari.ts`, detay paneli bileşenleri.
- Testler: `ice-aktarma.test.ts` (normalleştirme, hatalı satır, çakışma, engelli işaretleme, beyan olmadan izinli içe
  aktarılamaz, 5.000 satır sınırı), `mesajlasma.test.ts` (whatsapp_api kuralları).

### B — Cloud API bağlantısı ve şablonlar
- `src/server/whatsapp-api/istemci.ts` (gerçek Graph istemcisi), `mock.ts` (senaryolu sahte istemci), `tipler.ts`,
  `fabrika.ts` (testte gerçek istemci oluşturulamaz; `WHATSAPP_API_MOCK=1` geliştirme için).
- Kullanılacak Graph çağrıları (alan adları B'de referanstan doğrulanır):
  - `GET /{phone_number_id}?fields=display_phone_number,verified_name,quality_rating,whatsapp_business_manager_messaging_limit,throughput`
  - `GET /{waba_id}/message_templates?fields=name,language,category,status,components,quality_score` (sayfalı)
  - `POST /{waba_id}/subscribed_apps` (yalnızca kullanıcı "Webhook aboneliğini etkinleştir"e basınca)
- **Ekran: Ayarlar → WhatsApp Business (API)** (yalnızca yönetici):
  - WABA ID, Phone Number ID, kalıcı erişim anahtarı, App Secret alanları (kayıtta yalnızca "tanımlı").
  - Webhook URL'si (`/api/whatsapp/webhook/{webhook_kimligi}`) ve verify token (yalnızca üretildiğinde bir kez
    gösterilir, "yenile" ile değişir; K13).
  - "Bağlantıyı test et": numara, doğrulanmış ad, kalite, portföy limiti, hız katmanı.
  - Test modu + test numaraları (en fazla 5); uygulamaya ayrılan limit payı.
  - System user kurulum rehberi (adım adım, aşağıda §5).
- **Ekran: İletişim → WhatsApp şablonları:** "Senkronize et"; liste (ad, dil, kategori, durum, değişkenler, butonlar);
  MARKETING şablonunda abonelikten çıkma butonu yoksa kırmızı uyarı ve "kampanyada kullanılamaz" (kapatılamaz);
  desteklenmeyen bileşenler (K11) için neden.
- Testler: `whatsapp-api.test.ts` (şifreli alanlar hiçbir yanıtta dönmez, yönetici olmayan bağlantıyı değiştiremez,
  bağlantı testi mock ile, şablon senkronu ve buton tespiti, sayfalama), izolasyon (yeni repolar).

### C — Kampanya gönderimi
- Kampanya oluşturma (`whatsapp_api` kanalı): şablon seçimi (yalnızca `APPROVED` + destekleniyor + pazarlamada buton
  var) → değişken eşleme (`{{n}}` → `isletme_adi` / `yetkili_adi` / sabit metin; boş değerde davranış: kayıt hariç
  `degisken_bos`) → canlı önizleme (ilk 3 alıcıyla) → alıcı özeti ve hariç nedenleri → **tahmini Meta ücreti**
  (uygun alıcı × kategori fiyatı, "Meta doğrudan WABA'nızdan keser; bilgi amaçlı" notu, fiyat tarihi) → başlat.
- `src/lib/whatsapp-fiyatlar.ts`: `{ ulke: 'TR', para: 'USD', tarih: '2026-10-01', kaynak, MARKETING, UTILITY, AUTHENTICATION }`.
- İşçi (`src/server/servisler/isci.ts` + yeni `whatsapp-gonderici.ts`):
  - Gönderim saatleri, günlük sınır, atomik sayaç, idempotent talep (`UPDATE … RETURNING`) ve "belirsiz sonuç tekrar
    denenmez" kuralı aynen.
  - **Limit:** etkin limit = `min(portföy limiti × pay, çalışma alanı günlük sınırı)`; kayan 24 saatte bu çalışma
    alanının gönderdiği benzersiz alıcı sayısı sınıra ulaşınca kalanlar `kuyrukta` kalır ve bir sonraki uygun zamanda
    (pratikte ertesi gün, gönderim saatleri içinde) devam eder.
  - **Hız:** `WHATSAPP_SANIYE_BASI` (varsayılan 20) ile parti içinde aralıklı gönderim; 130429'da parti durur, sonraki
    turda devam.
  - **Kalite:** her turda önbellekteki kalite (15 dakikada bir API'den, `phone_number_quality_update` webhook'unda
    hemen) `RED` ise çalışma alanının tüm WhatsApp kampanyaları `duraklatildi` (`kalite_dusuk`) + uyarı; `YELLOW`'da
    yalnızca uyarı. 131048 (spam hız sınırı) de duraklatır. Şablon `PAUSED`/`DISABLED` olursa o şablonu kullanan
    kampanyalar duraklar. Devam ettirme yalnızca yönetici ve kalite `RED` değilken.
  - **Test modu:** açıkken yalnızca normalize telefonu test numaralarında olan alıcılar kuyruğa girer; diğerleri
    `test_modu` nedeniyle hariç (K8).
  - Alıcı: telefon varsa `to`, yoksa BSUID (`recipient`, K14).
  - Hata eşlemesi: 131026 → başarısız + `whatsapp_yok_tarihi`; 131050 → K5; 131049 → başarısız, tekrar yok.
- Kampanya detayı: kuyrukta / gönderildi / iletildi / okundu / başarısız (hata kodu dağılımı) / hariç; gerçekleşen
  tahmini ücret (webhook `pricing.billable` ile).
- Testler: `whatsapp-kampanya.test.ts` (limit dolunca kalanlar bekler, pay ayarı, kalite RED duraklatır, şablon
  duraklarsa duraklar, test modu yalnızca test numaralarına, izinsiz/ret/engel hariç, kampanya sırasında gelen ret
  sonraki gönderimi durdurur, belirsiz sonuç tekrar denenmez, maliyet tahmini).

### D — Webhook, durumlar, ret, reklamdan gelenler
- Rota: `GET/POST /api/whatsapp/webhook/[webhookKimligi]` (oturum, Origin ve `proxy.ts` kontrollerinin dışında):
  - **GET:** `hub.mode=subscribe` ve `hub.verify_token` o çalışma alanının (şifreli) verify token'ıyla sabit zamanlı
    karşılaştırılır; doğruysa `hub.challenge` düz metin olarak döner, değilse 403.
  - **POST:** ham gövde okunur (en fazla 1 MB) → `X-Hub-Signature-256` o çalışma alanının App Secret'ıyla HMAC-SHA256
    ve `timingSafeEqual` ile doğrulanır → **imza geçmeden JSON ayrıştırılmaz, hiçbir işlem yapılmaz** (401). Sonra
    her `entry.changes[].value.metadata.phone_number_id` kayıtlı numarayla eşleşmeli; eşleşmeyen (başka kiracının
    numarası) değişiklik işlenmez ve loglanır. Her zaman hızlı 200 (Meta tekrar dener).
- **Durumlar** (`statuses[]`): `id` (wamid) ile kuyruk satırı bulunur; durum yalnızca ileri gider (sent → delivered
  → read; failed her zaman yazılır); hata kodu ve `pricing` işlenir. 131026 → kişi `whatsapp_yok` işaretlenir.
- **Kişi eşleştirme:** `contacts[].user_id` (BSUID) → `whatsapp_kisileri.bsuid`; yoksa `wa_id` → `leads.telefon_e164`.
  Telefonla bulunan kişiye BSUID yazılır. `user_changed_user_id` / `user_changed_number` sistem iletilerinde BSUID
  güncellenir, olay loglanır (numara değeri loglanmaz).
- **Ret:** abonelikten çıkma butonu (`type: button`, payload/metin eşleşmesi) ya da metin tam olarak `RET`, `DUR`,
  `İPTAL`, `STOP` (Türkçe büyük/küçük harf ve boşluk normalize, **tam eşleşme**; "iptal etmek istemiyorum" ret değildir)
  → mevcut ret akışı (K3). Telefon yoksa engel listesine BSUID özeti.
- **Reklamdan gelen** (`messages[].referral`, `source_type = ad`): kişi yoksa `kaynak = meta_reklam`,
  `yetkili_adi` = profil adı, izin `var` (`kendisi_yazdi`), `reklam_kimligi` (`source_id`), `reklam_basligi`
  (`headline`), `ctwa_clid`, `pencere_bitis` (K6). Aynı numara/BSUID tekrar yazarsa yeni kayıt açılmaz (tek
  transaction; tekil indeks son güvence), yalnızca olay ve pencere güncellenir.
- **Diğer gelen iletiler:** yalnızca `whatsapp_gelen` olayı (tür ve zaman; **metin saklanmaz**). `wamid`
  `whatsapp_gelen_kimlikleri`'ne yazılır; tekrar gelen webhook ikinci olay üretmez.
- Diğer alanlar: `message_template_status_update` (şablon durumu), `phone_number_quality_update` (kalite),
  `business_capability_update` (limit), `user_preferences` (K5).
- **Kayıtlar listesi:** kaynak filtresi, WhatsApp izni filtresi, "WhatsApp penceresi açık" rozeti (`pencere_bitis >
  şimdi`).
- README: kurulum, system user, test numarasıyla deneme, webhook alanları, açık kararlar.
- Testler: `whatsapp-webhook.test.ts` (GET doğrulama; yanlış imza / imzasız / başka App Secret ile imzalı → 401 ve
  hiçbir yazma yok; başka kiracının phone_number_id'si işlenmez; durum ileri gider, geri gitmez; 131026 işaretleme;
  buton ve metin ret'i; tam eşleşme; referral ile kayıt + aynı numarayla ikinci iletide çift kayıt yok; yalnızca BSUID
  gelen (telefonsuz) kişi; BSUID değişimi; tekrar webhook'u tek olay; gelen metnin hiçbir tabloda olmaması),
  izolasyon.

---

## 3. Commit sırası (öneri; commit'leri kullanıcı yapar)
1. A1 — Kişi modeli: Google dışı kayıtlar ve WhatsApp kişi tablosu
2. A2 — Kişi içe aktarma, elle kayıt ve WhatsApp izin kaydı
3. B — WhatsApp Cloud API bağlantısı ve şablon senkronu
4. C — WhatsApp API kampanyaları (limit, kalite, test modu, maliyet tahmini)
5. D — WhatsApp webhook: durumlar, ret, reklamdan gelen kişiler

## 4. Yeni ortam değişkenleri
| Değişken | Varsayılan | Not |
|---|---|---|
| `META_GRAPH_SURUMU` | `v26.0` | Meta sürümleri ~2 yıl destekler. |
| `META_GRAPH_URL` | `https://graph.facebook.com` | Yalnızca test için değiştirilir. |
| `WHATSAPP_API_MOCK` | boş | `1`: geliştirmede sahte istemci. Testler her zaman sahte. |
| `WHATSAPP_SANIYE_BASI` | `20` | Gönderim hızı (Meta varsayılan kapasitesinin altında). |
| `GUNLUK_WHATSAPP_API_SINIRI` | `1000` | Çalışma alanı başına üst sınır (`npm run sinir` ile değiştirilir). |

## 5. Pilot ve README için system user adımları (özet)
1. İşletme sahibi developers.facebook.com'da kendi Business Manager'ına bağlı bir **Business** türü uygulama açar,
   WhatsApp ürününü ekler. App Secret: Uygulama ayarları → Temel.
2. Business Settings → Kullanıcılar → **System users** → yeni system user (Admin değil, **Employee** rolü yeterli).
3. "Varlık ata": yalnızca ilgili **WhatsApp hesabı** (tam kontrol) ve oluşturulan uygulama.
4. "Token oluştur": uygulamayı seç, süre **Hiçbir zaman**, izinler yalnızca `whatsapp_business_messaging` ve
   `whatsapp_business_management`.
5. Uygulamada Webhook: callback URL ve verify token (Harita CRM ayarlarından), alanlar: `messages`,
   `message_template_status_update`, `phone_number_quality_update`, `business_capability_update`, `user_preferences`.
6. Harita CRM'de "Webhook aboneliğini etkinleştir" (WABA'ya uygulama aboneliği) ve "Bağlantıyı test et".
7. Test modu açıkken bir kampanyayı kendi numarasına gönderip durum ve ret akışını dener; sonra test modunu kapatır.

Pilot riski: işletmenin numarası şu an başka bir sağlayıcı/BSP üzerindeyse, o sağlayıcının webhook'u ve sohbet
yönetimi devam eder; bizim uygulamamız ek bir abone olur. Limit portföy düzeyinde paylaşıldığı için **pay** ayarı
pilotta düşük başlatılmalı. Geliştirme modundaki uygulamanın gerçek webhook alıp almadığı (yayına alma gerekip
gerekmediği) B'de doğrulanacak.

## 6. Kapsam dışı ("ileride")
Embedded Signup (Tech Provider gerektirir), gelen kutusu / sohbet ekranı, uygulamadan şablon oluşturma, Lead Ads
formları, Conversions API for CRM (`ctwa_clid` yalnızca saklanıyor), İYS API entegrasyonu, parent BSUID (çok
portföylü işletmeler), medya başlıklı ve dinamik URL butonlu şablonlar (K11), içe aktarmayı geri alma (K16).

## 7. Onayla gelen eklemeler
1. **Test modu kilidi:** `whatsapp_baglantilari.test_modu` varsayılan AÇIK. Ancak (a) webhook GET doğrulaması başarıyla
   yapılmış ve (b) bu bağlantı için imzası doğrulanmış en az bir `statuses` webhook'u alınmışsa kapatılabilir; aksi
   halde sunucu reddeder, arayüz nedenini gösterir. Testi yazılır.
2. **Limit payı (K7) varsayılanı %10.**
3. **Ret kelimeleri (K4):** `RET`, `DUR`, `İPTAL`, `STOP`, `ABONELİKTEN ÇIK`, `ÇIK` — tam eşleşme.
4. **README pilot bölümü:** numara başka bir sağlayıcıda/araçta kullanılıyorsa bağlantı onu bozmaz, uygulama ek abone
   olur; ilk gerçek kampanya küçük ve izinli bir listeyle yapılmalı.
