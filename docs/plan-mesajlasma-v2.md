# Mesajlaşma v2 planı — çoklu numara, gelen kutusu, bot, Google Kişiler, medyalı kampanya, canlıya çıkış

Durum: **ONAYLANDI (15.11.2026).** Sıra: F → A → B1 → D; B2 vakit kalırsa; C, E ve B3 ikinci hafta. Her grup sonunda
typecheck + lint + test + build, rapor ve commit mesajı; kullanıcı commit'ledikten sonra sonraki gruba geçilir.

Hedef: tek bir gerçek müşteri. 3 WhatsApp Business numarası ve binlerce kayıtlı kişisi var (çoğu esnaf ve daha önce
iletişim kurulmuş kişiler). Uygulama 1 hafta içinde `deneme.bursalidagitim.com` (Ubuntu 24.04 VPS, Docker'sız) üzerinde
canlıya çıkacak.

Değişmeyen kurallar:
- Repo katmanı ve TenantContext.
- İzin, RET, engel listesi, İYS beyanı ve test modu kuralları gevşetilmez.
- Gerçek Meta veya Google isteği atılmaz (yalnızca mock ve demo).
- `app.db` ve `gercek-test.db`'ye dokunulmaz.
- Her davranış değişikliğinin testi yazılır ve eski kodda başarısız olduğu doğrulanır.

---

## 0. Kararlar (15.11.2026, kullanıcı)

| # | Soru | Karar |
|---|---|---|
| K1 | 3 numara telefondaki WhatsApp Business uygulamasında mı? Coexistence olmadan Cloud API'ye bağlanan numara telefondan çıkar. | Canlıya bugünkü yolla (müşterinin kendi Meta uygulaması), **önce tek numarayla** çıkılır; diğer iki numara sonra taşınır. Tasarım ve rehber "ilk gün tek numara, sonra Ayarlar'dan numara ekle" akışına göre yazılır. Coexistence ayrı aşama (§9). |
| K2 | 3 numara aynı WABA'da ve aynı Meta uygulamasına mı bağlı? | Evet varsayılıyor; kullanıcı ofiste doğrulayacak. Ayrı olsa da tasarım çalışır (A4). |
| K3 | Gelen ileti metni ne kadar saklansın? | Metin 365 gün, medya 90 gün; Ayarlar'dan değiştirilebilir. |
| K4 | RET vermiş kişi yeniden yazarsa? | **RET pazarlamayı durdurur, müşteri hizmetini değil.** RET'li kişi kendisi yazarsa 24 saat penceresinde temsilci **elle** serbest metin yanıt verebilir; sohbette belirgin uyarı: "RET verdi: yalnızca sorusuna yanıt verin, pazarlama içeriği göndermeyin". **Şablon, kampanya ve bot RET'li kişiye hiçbir koşulda gitmez.** Testlerle sabitlenir. |
| B3 onayı | İzni olmayan ama kendisi yazan kişiye serbest yanıt? | Evet: 24 saat içinde elle serbest metin. Şablon ve kampanya için izin kuralı aynen geçerli. |
| K5 | Bilinmeyen numaradan oluşan kaydın alıcı türü? | Bireysel. |
| K6 | Sunucuda Node? | Node 22 LTS. |
| K7 | İçe aktarma sınırı? | 20 000 satır. |
| Görünürlük | Gelen kutusunda kim neyi görür? | Herkes tüm sohbetleri görür; atama yalnızca sorumluluğu gösterir. |

---

## 1. Bugünkü durum (planı etkileyen noktalar)

- **Tek bağlantı:** `whatsapp_baglantilari` tablosunun birincil anahtarı `tenant_id`, yani çalışma alanı başına bir
  bağlantı var. `baglantiGetir(ctx)` ve `whatsappBaglantisiCoz(ctx)` 11 dosyada 23 yerde bu varsayımla çağrılıyor
  (gönderici, işçi, webhook, ayarlar rotaları, hazırlık, demo scriptleri).
- **Gelen ileti içeriği saklanmıyor:** webhook yalnızca kimliği (`whatsapp_gelen_kimlikleri`, 7 gün) ve olayı yazıyor.
  Gelen kutusu bu kuralı bilerek değiştirir (K3); `schema.ts` ve webhook açıklamaları buna göre güncellenir.
- **Pencere alanının anlamı farklı:** `whatsapp_kisileri.pencere_bitis` Click-to-WhatsApp'ın 72 saatlik ücretsiz
  penceresidir (`UCRETSIZ_PENCERE_SAAT = 72`). 24 saatlik müşteri hizmeti penceresi ayrıca ve **numara başına**
  hesaplanmalı, çünkü pencere işletme numarası ile kişi arasındadır.
- **Mesajlaşma limiti portföy düzeyinde:** mevcut kod limiti zaten böyle yorumluyor. 3 numara aynı portföydeyse limiti
  paylaşırlar.
- **İşçi ayrı süreç ve 30 sn'de bir dönüyor** (`WORKER_ARALIK_SN`). Bot yanıtı için bu çok yavaş (C3'te çözüm).
- **Tünel koruması:** `GENEL_ADRES` ile `BETTER_AUTH_URL` aynı alandaysa alan korunmaz; `*.trycloudflare.com` her zaman
  korunur. Canlıda ikisi de `https://deneme.bursalidagitim.com` olur, beklenen davranış budur (F5).
- **Yedek altyapısı var:** `veritabaniYedekle` SQLite çevrimiçi yedekleme API'sini (`.backup` ile aynı mekanizma)
  kullanıyor. `db:migrate` her çalıştırmada önce yedek alıyor.

---

## 2. Önerilen sıra ve bir haftaya sığanlar

Senin önceliğin F, A, sonra B, D, C, E. Önerim aynı sırada ama B'yi ikiye bölüyorum.

| Gün | Grup | Bir haftaya sığar mı? |
|---|---|---|
| 1 | **F** Canlıya hazırlık (kurulum, servisler, yedek, sağlık ucu, güncelleme scripti, belge) | ✅ |
| 2–3 | **A** Çoklu numara | ✅ |
| 3–5 | **B1** Gelen kutusu çekirdeği: liste, sohbet, metin gönderme, 24 saat penceresi, durumlar, okundu, atama, açık/kapalı, iç notlar, canlı yenileme, bilinmeyen numara | ✅ (sıkı) |
| 5–6 | **D** Google Kişiler CSV | ✅ |
| 6 | **B2** Gelen medya (indirme, saklama, gösterme) | ⚠️ sınırda; yetişmezse ilk günler medya "görüntülenemiyor, telefondan bakın" olarak işaretlenir |
| 7 | Prova, demo ortamında uçtan uca, canlı kurulum | ✅ |
| 2. hafta | **C** Bot | ❌ **sığmaz** (2–3 gün) |
| 2. hafta | **E** Görselli/videolu kampanya | ❌ **sığmaz** (1,5–2 gün) |
| 2. hafta | **B3** Coexistence: echo ve history işleyicisi (yalnızca mock testleri) | ❌ **sığmaz** (1 gün); veri modeli B1'de buna hazır kurulur |
| Ayrı süreç | Embedded Signup / Tech Provider / Coexistence bağlantısı | ❌ Meta onaylarına bağlı, haftalar sürebilir (§9) |

Toplam tahmin: F 1, A 1,5–2, B1 2,5–3, B2 1, D 1–1,5, C 2–3, E 1,5–2, B3 1 gün; yaklaşık 12–14 iş günü. Bir haftada
gerçekçi olan **F + A + B1 + D**, kalırsa B2.

Her grup kendi içinde commit edilebilir parçalara bölünür (ör. A: göç → repo/servis → arayüz).

---

## 3. Grup F — Canlıya hazırlık (Ubuntu 24.04, Docker'sız)

> **Uygulamada plandan ayrılan noktalar (15.11.2026):**
> - Ortam dosyası `/etc/harita-crm/env` yerine `/opt/harita-crm/.env.production.local` (0600, `harita`). Next.js
>   `NEXT_PUBLIC_*` değerlerini ve `next.config` yönlendirmelerini **derleme anında** okur; `npm run build`, işçi,
>   migration ve yedek scriptleri aynı dosyayı okusun diye tek yer.
> - `ProtectSystem=strict` yerine `full`. Next'in çalışma anında yazdığı yerler (`.next/cache`) Linux'ta
>   denenemediği için kırılma riski alınmadı.
> - `deploy/kur.sh` yazılmadı. İlk kurulum `docs/SUNUCU-KURULUM.md`'de açık komutlarla; gizli adım yok.
> - Güncellemede servisler **derlemeden önce** durdurulur. `npm ci` ve `next build` çalışan sürümün dosyalarını
>   değiştirir; yarım sürüm sunulmasın diye 1–3 dk kesinti kabul edildi. Derleme ya da migration hata verirse
>   eski sürüme kendiliğinden dönülür.
> - **Ek (planda yoktu): `KAYIT_KIPI=davetle`.** Kayıt herkese açıktı; internete açık alan adında yabancı biri hesap
>   ve çalışma alanı açıp Places kotası harcayabilirdi. Canlıda yalnızca `ILK_YONETICI_EPOSTASI` (hiç kullanıcı
>   yokken) ve geçerli daveti olanlar kayıt olur.

### F1. Dosyalar

| Dosya | İçerik |
|---|---|
| `deploy/harita-web.service` | `next start -H 127.0.0.1 -p 3000`. Kullanıcı `harita`; `EnvironmentFile=/etc/harita-crm/env` (0600, root:harita); `Restart=always`; sertleştirme: `NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths=/var/lib/harita-crm`, `PrivateTmp`, `ProtectHome`. |
| `deploy/harita-worker.service` | `npm run worker` (aynı kullanıcı ve ortam). `KillSignal=SIGTERM`, `TimeoutStopSec=150`; işçi turunu bitirip çıkar (kilit 120 sn). |
| `deploy/harita-yedek.service` + `.timer` | Günlük 03:30 (İstanbul); `Persistent=true`, sunucu kapalıyken kaçan yedek açılışta alınır. |
| `deploy/Caddyfile` | `deneme.bursalidagitim.com { reverse_proxy 127.0.0.1:3000 }`. Otomatik HTTPS; HSTS, `X-Content-Type-Options` ve `Referrer-Policy` başlıkları; `request_body` sınırı (webhook 1 MB, medya yükleme E'ye göre); kendi dosyasına `roll_size`/`roll_keep` ile log. |
| `deploy/kur.sh` | İlk kurulumda tekrar çalıştırılabilir adımlar (kullanıcı ve dizinler, izinler, servis dosyalarını kopyalama, `daemon-reload`). Belgedeki komutların toplamıdır, sihir içermez. |
| `deploy/guncelle.sh` | Tek komutluk güncelleme (F4). |
| `deploy/geri-yukle.sh` | Yedekten geri yükleme (F3). |
| `scripts/yedek-al.ts` (`npm run yedek`) | `veritabaniYedekle` ile çevrimiçi yedek, `PRAGMA integrity_check`, gzip, 14 günden eskileri sil. Medya klasörü B2 gelince aynı yedeğe girmez, ayrı `tar` ile 14 gün tutulur. |
| `scripts/anahtar-uret.ts` (`npm run anahtar:uret -- <env dosyası>`) | `BETTER_AUTH_SECRET`, `ILETI_SIFRELEME_ANAHTARI` ve `ILETI_IMZA_ANAHTARI` için 32 bayt rastgele değer üretir. **Ekrana yazmaz**, doğrudan dosyaya 0600 izinle yazar. Dosyada değer zaten varsa **üzerine yazmaz** (imza anahtarı değişirse engel listesi eşleşmez), yalnızca "zaten var" der. |
| `.env.production.example` | Üretim değerleri: `DATABASE_PATH=/var/lib/harita-crm/app.db`, `MEDYA_KLASORU=/var/lib/harita-crm/medya`, `BETTER_AUTH_URL` ve `GENEL_ADRES` = `https://deneme.bursalidagitim.com`, `AUTH_INSECURE_COOKIES=false`, `PLACES_MOCK=false`, `WHATSAPP_API_MOCK` yok, `NODE_ENV=production`. |
| `src/app/api/saglik/route.ts` | F6. |
| `docs/SUNUCU-KURULUM.md` | F7. |

### F2. Dizin düzeni

- `/opt/harita-crm`: kod (git clone), sahibi `harita`.
- `/var/lib/harita-crm`: `app.db`, `medya/`, `yedek/` (migration yedekleri).
- `/var/backups/harita-crm`: günlük yedekler.
- `/etc/harita-crm/env`: gizli değerler.

Uygulama yalnızca `127.0.0.1:3000`'i dinler. Dışarıya yalnızca Caddy açıktır: `ufw allow OpenSSH`, `ufw allow 80,443/tcp`,
`ufw enable`. 80 numaralı port Let's Encrypt doğrulaması ve https'e yönlendirme için açık kalır.

### F3. Yedek ve geri yükleme

- **Yedek:** `npm run yedek` → `/var/backups/harita-crm/app-<damga>.db.gz`; 14 gün saklanır; sonucu journal'a yazar.
  Başarısızsa servis "failed" olur ve sağlık ucunda görünür (son yedek yaşı).
- **Geri yükleme:** `sudo deploy/geri-yukle.sh <dosya.db.gz>`.
  1. Web ve worker servislerini durdurur.
  2. Mevcut veritabanının bir yedeğini daha alır (geri dönülebilsin).
  3. Seçilen dosyayı açar ve `integrity_check` yapar.
  4. Dosyayı yerine koyar, eski `-wal` ve `-shm` dosyalarını kaldırır.
  5. `db:migrate` çalıştırır (yedek eski sürümdense) ve servisleri başlatır.
- **Sunucu dışı kopya:** Belgede "yedeği haftada bir sunucu dışına kopyalayın" adımı (`scp` örneği) olacak. Sunucunun
  kendisi giderse yerel yedek de gider. Otomatik uzak yedek kapsam dışı.

### F4. Güncelleme: `sudo deploy/guncelle.sh`

1. `git pull --ff-only`
2. `npm ci`
3. `npm run build` (eski sürüm çalışmaya devam eder)
4. `npm run db:migrate` (önce yedek alır)
5. `systemctl restart harita-worker harita-web`
6. `/api/saglik` 200 dönene kadar en fazla 60 sn bekler.

Herhangi bir adım hata verirse durur ve servisleri yeniden başlatmaz. Migration'dan sonra hata çıkarsa ekranda
geri yükleme komutunu ve son yedeğin yolunu gösterir.

### F5. Tünel host koruması ve alan adı

- Canlıda `GENEL_ADRES` ve `BETTER_AUTH_URL` aynı alandadır, bu alan korunmaz ve arayüz açılır. `*.trycloudflare.com`
  canlıda da 404 kalır (test edilir).
- **Ek koruma:** `UYGULAMA_ALANLARI` (boşsa `BETTER_AUTH_URL`'in alanı) dışındaki her Host'a (ör. sunucunun IP'si) 404
  dönülür. Yalnızca `NODE_ENV=production` iken açık, localhost'u etkilemez. Caddy zaten yalnızca alan adına hizmet
  verir; bu, yanlış Caddy ayarına karşı ikinci kat.
- Better Auth `trustedOrigins` ve çerezlerin `Secure` olması canlı alanla test edilir.

### F6. Sağlık ucu `GET /api/saglik`

- **Oturumsuz kısa yanıt:** `{ durum: "ok" | "sorunlu" }`. 200 ya da 503 döner.
- **Kontrol edilenler:**
  - Veritabanı `select 1` cevap veriyor mu?
  - İşçinin son nabzı (`isci_son_nabiz`) 5 dakikadan yeni mi?
  - Son yedek 26 saatten yeni mi?
- **Ayrıntılı yanıt:** yalnızca `localhost`'tan gelen istekte (güncelleme scripti ve `curl` için); hangi kontrolün
  sorunlu olduğunu ve sürümü (git kısa sha) gösterir.
- Gizli değer ve kayıt sayısı hiçbir yanıtta yoktur.

### F7. `docs/SUNUCU-KURULUM.md`

Sunucuya ilk kez kurulum yapan biri için yazılır; her adımda kopyala-yapıştır komut ve "doğru gittiğini nasıl anlarım"
satırı olur.

1. DNS: `deneme` için A kaydı → VPS IP. Doğrulama: `dig +short`.
2. SSH: anahtarla giriş ve parola girişini kapatma (yanlışlıkla kilitlenmemek için önce ikinci oturumda deneme).
3. `apt update && apt upgrade`; `build-essential` ve `git` (better-sqlite3 için).
4. Node 22: NodeSource deposu; `node -v` ile kontrol.
5. Caddy: resmî apt deposu.
6. `harita` kullanıcısı, dizinler, `git clone`.
7. `/etc/harita-crm/env`: `.env.production.example`'dan kopyala, `npm run anahtar:uret`, kalan alanlar.
8. `npm ci && npm run build && npm run db:migrate`.
9. İlk yönetici: `/kurulum` ekranı.
10. systemd servisleri: `enable --now`, `systemctl status`, `journalctl -u … -f`.
11. Caddyfile; `caddy validate`; sertifika alındı mı?
12. ufw.
13. Yedek zamanlayıcısı ve **elle bir geri yükleme denemesi** (canlıdan önce mutlaka).
14. Log sınırı: journald `SystemMaxUse=500M` (servis logları journal'da döner); Caddy kendi dosyasını döndürür.
15. Meta webhook adresi: her numaranın Ayarlar'da gösterilen adresi (A4).
16. Güncelleme: `sudo deploy/guncelle.sh`.
17. Sorun giderme tablosu.

### F8. Riskler

- better-sqlite3 yerel derlemesi: Node sürümü değişirse `npm ci` yeniden derler; belge ve güncelleme scripti `npm ci`
  kullanır.
- Yedek ve migration aynı diskte. Disk dolarsa ikisi de durur; sağlık ucu disk doluluğunu da raporlar (% boş).
- `ProtectSystem=strict` ile yazma izni unutulan bir dizin, ancak çalışma anında hata verir. Kurulumdan sonra belgede
  "kontrol listesi" olacak: tarama, içe aktarma, yedek, medya.

### F9. Testler

- `tunel`: canlı alan adı açık, IP Host'u 404, `trycloudflare` 404, webhook yolu her durumda açık.
- `saglik`: veritabanı yok veya işçi nabzı eski → 503; dışarıya ayrıntı sızmıyor.
- `yedek-al`: 14 gün saklama, `integrity_check` başarısızsa hata ve dosya silinir, `.gz` açılınca geçerli veritabanı.
- `anahtar-uret`: var olan değer korunur, dosya izni 0600 (Windows'ta atlanır), stdout'ta değer yok.
- Geri yükleme betiğinin bash kısmı Windows'ta test edilemez. Mantığı (`integrity_check`, dosya değişimi) bir TS
  yardımcısında test edilir; betik onu çağırır.

**Süre:** 1 gün. Meta isteği yok.

---

## 4. Grup A — Çoklu numara

> **Uygulamada plandan ayrılan noktalar (16.11.2026):**
> - **Günlük sınır:** çalışma alanı geneli kaldı, yani bütün numaraların toplamı (daha sıkı). Sayaç numara başına
>   bölünmedi. Numara başına ayrı sınır gerekirse sonra eklenir.
> - **Kampanya – bağlantı ilişkisi:** `kampanyalar.baglanti_id` yabancı anahtarsız. Numara silinince kampanya geçmişi
>   kalır ("Silinmiş numara"); çalışan kampanyaları duraklar. RESTRICT yerine bu seçildi: numarayı kaldırmak için
>   önce kampanya arşivlemek gerekmesin.
> - **Kuyruk:** `message_queue.baglanti_id` eklenmedi. Mevcut `gonderen_numara` (phone_number_id) yetiyor.
> - **Ek (planda yoktu): ortak bildirim adresi.** Tek Meta uygulamasında Meta'nın GET doğrulaması yalnızca tek adrese
>   gelir. 2. ve 3. numaranın "bildirim adresi doğrulandı" adımı, kendi App Secret'larıyla imzalı bir teslim
>   bildirimi ortak adresten gelince tamamlanır. Bu olmadan diğer numaraların test modu hiç kapanamazdı.
> - **Rotalar:** `/api/ayarlar/whatsapp-api` (liste GET, yeni numara POST) ve `/api/ayarlar/whatsapp-api/[id]` (GET,
>   PUT, PATCH, DELETE ve `test`, `abonelik`, `verify-token`); şablonlar `?baglanti=<id>`.
> - **Demo:** canlıdaki gibi tek numara ("Merkez"); `demo:webhook` komutları `--numara <ad>` alır.

### A1. Veri modeli — migration `0019_coklu_whatsapp_baglantisi.sql`

`whatsapp_baglantilari` tablosu yeniden kurulur (SQLite birincil anahtar değiştiremez): yeni tablo, kopyala, eskiyi
sil, adını değiştir. `db:migrate` önce yedek alır.

- `id` (text, PK) yeni. Mevcut satıra `lower(hex(randomblob(16)))` verilir.
- `tenant_id` artık PK değil, `NOT NULL` + indeks.
- `ad` yeni: "Merkez", "Şube 2" gibi. Zorunlu, çalışma alanında benzersiz; mevcut satıra "Numara 1".
- `sira` yeni.
- Diğer alanların hepsi (test modu, uygulama payı, hesap kilidi, kalite, limit, webhook kimliği, şifreli veri) satır
  başına kalır. Böylece her numaranın kendi test modu, test numaraları, kilidi ve webhook kimliği olur.
- Benzersizlikler korunur: `webhook_kimligi`, `phone_number_id` (aynı numara iki yere bağlanamaz).
- `(tenant_id, id)` benzersiz; bileşik yabancı anahtarlar için.

Diğer tablolar:

- `kampanyalar.baglanti_id`: WhatsApp kampanyalarında zorunlu (servis denetler). Mevcut kampanyalara tek bağlantının
  id'si yazılır. Bileşik FK `(tenant_id, baglanti_id)`, `ON DELETE RESTRICT`: kampanyası olan bağlantı silinemez,
  önce kampanyalar arşivlenir.
- `message_queue`: `gonderen_numara` (phone_number_id) zaten var; ek olarak `baglanti_id` (gösterim ve sayım için).
- `whatsapp_sablonlari`: şablonlar **WABA'ya** aittir, numaraya değil. `waba_id` sütunu eklenir; benzersizlik
  `(tenant_id, waba_id, ad, dil)` olur. Aynı WABA'daki numaralar aynı şablonları görür, farklı WABA'dakiler ayrı.
  Arayüzde "Bu numaranın şablonları" listesi o numaranın WABA'sına göre süzülür.
- `ileti_ayarlari.gunluk_whatsapp_api_siniri` bağlantı satırına taşınır (`gunluk_sinir`); günlük sayaç anahtarı
  `whatsapp_api:<baglanti_id>` olur. Mevcut sayaç satırı göçte tek bağlantıya aktarılır.

### A2. Kurallar

- **Hesap kilidi (131031, 368, 131042):** kod hesap düzeyidir. Kilit, **aynı WABA'daki tüm bağlantılara** yazılır ve
  yalnızca bu bağlantıların kampanyaları duraklar. Farklı WABA'daki numaralar gönderime devam eder. Bugün "çalışma
  alanının tüm WhatsApp kampanyaları duraklar" diyen yorum ve test buna göre güncellenir.
- **Kalite RED:** numaraya özgüdür; yalnızca o bağlantının kampanyaları duraklar.
- **Portföy limiti:** kayan 24 saat sayımı (`whatsappSon24Saat`) **çalışma alanının tüm bağlantılarının toplamı**
  üzerinden yapılır. Bu temkinli seçim; portföy kimliğini bilmiyoruz ve ayrı portföy kullanılmıyorsa doğru sonuç
  verir. Uygulama payı bağlantı başına kalır, en düşüğü uygulanır.
- **Test modu:** her bağlantıda ayrı ve test numaraları ayrı. Test modunu kapatma kilidi (webhook doğrulandı + imzalı
  durum bildirimi) bağlantı başına işler.
- **İzin, RET ve engel listesi** kişiye aittir, numaraya değil: bir numaraya RET yazan, diğer iki numaradan da mesaj
  almaz. Gevşetme yok; bilinçli seçim.

### A3. Servis ve repo

- `baglantiGetir(ctx)` kaldırılır.
  - `baglantilariListele(ctx)`: tüm bağlantılar.
  - `baglantiGetir(ctx, baglantiId)`: tenant filtreli tek bağlantı.
  - `baglantiNumarayla(ctx, phoneNumberId)`: webhook için.
- `whatsappBaglantisiCoz(ctx, baglantiId)`.
- Gönderici, kampanya satırının `baglanti_id`'siyle çalışır. Kampanya ile bağlantının WABA'sı ve şablonun WABA'sı
  uyuşmuyorsa kampanya oluşturulamaz.
- Rotalar: `/api/ayarlar/whatsapp-api` → `/api/ayarlar/whatsapp-api/[baglantiId]/…` (test, abonelik, verify-token).
  `POST /api/ayarlar/whatsapp-api` yeni bağlantı ekler. Bağlantı sayısı üst sınırı 10 (yapılandırılabilir sabit).

### A4. Webhook yönlendirmesi (önemli)

Meta'da callback adresi **uygulama düzeyindedir**: tek uygulama kullanılıyorsa üç numaranın bildirimleri tek adrese
gelir. Bunu karşılamak için:

- Her bağlantının kendi webhook kimliği ve adresi kalır.
- İstek hangi kimliğe gelirse gelsin, imza o kimliğin bağlantısının App Secret'ıyla doğrulanır.
- Her değişiklik `metadata.phone_number_id` ile **aynı çalışma alanındaki** bağlantıya yönlendirilir. Bu bağlantının
  App Secret'ı da isteği doğrulayanla aynı olmalı; yoksa atlanır (başka uygulamanın imzasıyla başka numaraya yazılmaz).
- Numarasız değişiklikler (şablon, limit) `entry.id` (WABA) ile eşleşen tüm bağlantılara uygulanır.
- Sonuç: Meta'da tek adres girilse de olur, numara başına `override_callback_uri` ile ayrı adres girilse de olur.
  `OFIS-GUNU.md` için öneri: tek uygulamada uygulamanın adresini **ilk** numaranın adresi yapmak yeterli.

### A5. Arayüz

- **Ayarlar > WhatsApp:** numara kartları (ad, görünen numara, doğrulanmış ad, kalite, limit, test modu, kilit
  durumu); "Numara ekle"; kart başına mevcut kurulum adımları (bağlantı testi, webhook doğrulama, test modu).
- **Kampanya sihirbazı:** 1. adımda "Gönderen numara" seçimi (tek numara varsa otomatik seçilir ama görünür). Şablon
  listesi o numaranın WABA'sına göre süzülür. Özet ve ayrıntıda "Gönderen: Merkez (+90 …)".
- Kampanya listesi, kampanya ayrıntısı, kayıt ayrıntısındaki WhatsApp bölümü, Panel uyarıları ve gelen kutusunda
  numara rozeti (ad + son 4 hane, numaraya göre sabit renk).

### A6. Meta API çağrıları

Yeni uç yok; mevcutlar bağlantı başına çağrılır.

| Uç | Amaç | İzin |
|---|---|---|
| `GET /{phone-number-id}?fields=…` | numara bilgisi, kalite, limit, sağlık | `whatsapp_business_management` |
| `GET /{waba-id}/message_templates` | şablon senkronu | `whatsapp_business_management` |
| `POST /{waba-id}/subscribed_apps` | bildirim aboneliği | `whatsapp_business_management` |
| `POST /{phone-number-id}/messages` | gönderim | `whatsapp_business_messaging` |

### A7. Riskler

- 23 çağrı yeri değişiyor; en büyük risk bağlantının yanlışlıkla başka numarayla eşleşmesi. Tenant filtresi ve
  `baglantiId` her repo fonksiyonunda zorunlu parametre olur.
- Migration tablo yeniden kurulumu: yabancı anahtarlar göç boyunca kapatılır (`PRAGMA foreign_keys=OFF`, `drizzle`
  migration'ında `PRAGMA foreign_key_check` ile doğrulama).
- Demo ve prova scriptleri (`demo-hazirla`, `demo-webhook`, `hazirlik`) güncellenmeli; `demo:webhook` komutuna
  `--numara <ad>` eklenir. `PROVA.md` ve `OFIS-GUNU.md` "numara başına" diye düzeltilir.

### A8. Testler

- Göç: tek bağlantılı eski veritabanı taşınır; kampanya, şablon ve sayaçlar doğru bağlantıya bağlanır;
  `foreign_key_check` temiz.
- İki bağlantı: biri test modunda, diğeri değil. Test modundaki yalnızca kendi test numaralarına gönderir.
- Hesap kilidi aynı WABA'daki bağlantıları kilitler, diğer WABA'yı kilitlemez. Kalite RED yalnızca o numarayı durdurur.
- Portföy sayımı iki numaranın toplamıdır.
- Webhook: tek adrese gelen üç numaranın bildirimi doğru bağlantıya işlenir; başka çalışma alanının numarası atlanır;
  App Secret'ı farklı bağlantıya yönlendirme yapılmaz; WABA düzeyindeki şablon güncellemesi ilgili bağlantılara yazılır.
- Kampanya: şablonun WABA'sı bağlantınınkiyle uyuşmuyorsa 400.
- RET bir numaradan gelir, diğer numaralardan da gönderim engellenir.
- TenantContext: başka çalışma alanının `baglantiId`'si 404.

**Süre:** 1,5–2 gün.

---

## 5. Grup B — Gelen kutusu

> **B1'in uygulanması (16.11.2026) — plandan ayrılan ve plana eklenen noktalar:**
> - **Reklam akışı (karar 17.11.2026):** reklamdan (Click-to-WhatsApp) ilk kez yazan kişinin WhatsApp izni artık
>   otomatik `var` yazılmaz: izin **yok**, kayıt kaynağı "Reklamdan yazdı" (`meta_reklam`). Pencere içinde elle yanıt
>   verilebilir (B3 gibi). Sohbet ekranında "Pazarlama izni istedi" eylemi izni `var` kaydeder (yeni izin kaynağı
>   `whatsapp_sohbeti`, tarih, temsilci adı notta ve olayda); bireyselde İYS beyanı kuralı aynen. RET'li ya da engelli
>   kişide 409. Daha önce bu akışla `var` yazılmış kayıtlar kendiliğinden değiştirilmedi.
> - **Günlük temizlik işçide:** `temizlikYap` (Places konumları 30 gün, veri saklama, davetler ve yeni olarak mesaj
>   metinleri) yalnızca `npm run cleanup` ile çalışıyordu; sunucu rehberinde bunun için cron yoktu. Artık işçinin günlük
>   bakımı da çalıştırır.
> - **`sohbet_mesajlari.tarih`** sıralama için ayrı alan (gelen iletide Meta'nın zamanı, gidende gönderim anı);
>   `icerik_silindi` saklama süresi dolunca boşaltılan metni işaretler. `istemci_kimligi` çift gönderim koruması için
>   tabloda (benzersiz), eşzamanlı ikinci istek 409.
> - **Okundu "bir kez":** okunmamış sayısı > 0 iken son gelen mesaja gönderilir; numara test modundaysa yalnızca test
>   numaralarına (bildirim de bir gönderim sayıldı).
> - **Şablon sınırları:** gelen kutusundan şablon günlük WhatsApp sınırına ve (17.11.2026'dan beri) Meta portföy
>   payının kayan 24 saat sayımına (`whatsappSon24Saat`: kuyruk + `sohbet_mesajlari`'ndaki temsilci şablonları, Meta'nın
>   "iletilemedi" dedikleri hariç) sayılır; pay doluysa 429 ve kampanya mesajı bekler. Gelen kutusu ile işçi ayrı
>   süreçte olduğundan aynı anda gönderimde pay bir-iki ileti aşılabilir (kampanya tarafında da sayım atomik değil).
> - **Arayüz ek:** pencere kapalı ve izin yoksa şablon seçici yerine açıklama (sunucu zaten 403 verir). Menü rozeti
>   sayfa geçişinde güncellenir; sayfanın kendisi canlı.
> - **Demo:** `demo:hazirla` üç örnek sohbet kurar; `npm run demo:webhook -- mesaj <tel> [metin]` müşteri mesajı yollar.

### B1. Veri modeli — migration `0020_gelen_kutusu.sql`

**`sohbetler`:** kişi × numara başına bir satır.
- Alanlar: `id`, `tenant_id`, `baglanti_id`, `lead_id`, `durum` (`acik` / `kapali`), `atanan_kullanici` (null olabilir),
  `son_mesaj_tarihi`, `son_gelen_tarihi`, `okunmamis`, `bot_sus_bitis` (C için), `surum`, `olusturma_tarihi`.
- 24 saatlik pencere `son_gelen_tarihi` + 24 saat ile hesaplanır.
- Benzersiz `(tenant_id, baglanti_id, lead_id)`. İndeks `(tenant_id, baglanti_id, son_mesaj_tarihi)`.

**`sohbet_mesajlari`:**
- Kimlik ve sahiplik: `id`, `tenant_id`, `sohbet_id`, `yon` (`gelen` / `giden`).
- `kaynak`: `musteri` | `temsilci` | `bot` | `kampanya` | `telefon` (Coexistence yansıması) | `gecmis` (history içe
  aktarma).
- `wamid` (benzersiz `(tenant_id, wamid)`; Meta tekrar gönderse de bir kez yazılır).
- `tur`: text, image, video, document, audio, sticker, location, button, interactive, template, reaction,
  unsupported.
- İçerik: `metin` (yalnızca metin ve başlık; medya baytları burada değil), `medya_id`.
- Gönderen ve kampanya: `gonderen_kullanici`, `kampanya_id`.
- Teslim: `teslim_durumu`, `teslim_hata_kodu`, `meta_zamani`, `surum`, `olusturma_tarihi`.
- `metin` alanı saklama süresi dolunca boşaltılır (K3); satır kalır, "içerik saklama süresi doldu" görünür.

**`sohbet_notlari`:** `id`, `tenant_id`, `sohbet_id`, `kullanici_id`, `metin`, `tarih`. İç notlar Meta'ya asla
gitmez.

**`gelen_kutusu_surumu`:** `tenant_id`, `surum`. Sohbeti ya da mesajı değiştiren her transaction bu sayacı artırır ve
satıra yazar; canlı yenileme imleci budur (B4).

`whatsapp_gelen_kimlikleri` tekrar korumasını sürdürür. `sohbet_mesajlari.wamid` benzersizliği ikinci kattır.

`ileti_ayarlari` ekleri:
- `mesaj_saklama_gun` (varsayılan 365) ve `medya_saklama_gun` (varsayılan 90).
- `okundu_bildirimi` (varsayılan açık).

### B2. Webhook değişiklikleri

İmza doğrulamadan sonra her işlem tek transaction'da kalır.

1. **Gelen ileti:**
   - Önce tekrar kontrolü, sonra kişi eşleştirme (mevcut BSUID → telefon → kuyruk sırası).
   - **Önce RET ve abonelikten çıkma** (mevcut akış, değişmez), sonra sohbet ve mesaj satırı.
   - Sonra `son_gelen_tarihi` ve okunmamış sayısı güncellenir; kapalı sohbet yeni mesajla açılır.
   - Medya varsa `sohbet_medyalari` satırı "bekliyor" durumuyla eklenir (B2 grubu).
2. **Bilinmeyen numara:**
   - Yeni kayıt açılır: `kaynak = "whatsapp_gelen"` (yeni `KAYIT_KAYNAKLARI` değeri; SQL check'i etkilemez).
   - Ad için WhatsApp profil adı `yetkili_adi`'na yazılır; `isletme_adi` boş kalır. Alıcı türü bireysel (K5).
   - `whatsapp_kisileri.izin = "yok"`, izin kaynağı yok. **Kendisi yazdı diye pazarlama izni sayılmaz.**
   - Olay: "Müşteri WhatsApp'tan kendisi yazdı (Merkez numarası)".
   - Yazdığı sırada RET dediyse kayıt yine açılır ve hemen ret işlenir.
   - Click-to-WhatsApp reklamı akışı (`meta_reklam`) aynen kalır.
     **Not:** bugünkü reklam akışı izin kaynağına "kendisi_yazdı" yazıyor mu, B1 başında kontrol edilecek. Yazıyorsa
     ve izin `var` yapılıyorsa ayrıca raporlanır; plan bunu değiştirmez.
3. **Durum bildirimi:** `message_queue` (mevcut) ve `sohbet_mesajlari` aynı wamid ile güncellenir, yine yalnızca ileri.
4. **Kampanya mesajları sohbete girer:** işçi gönderimi başarılı yazdığı transaction'da `sohbet_mesajlari` satırı da
   ekler (`kaynak = kampanya`, şablonun işlenmiş metni). Sohbet satırını açar ama **kapalı** başlatır; müşteri cevap
   verince açılır.

### B3. Gönderme ve pencere

- **`POST /api/sohbetler/[id]/mesaj`:**
  - Gövde: `{ tur: "metin", metin }` veya `{ tur: "sablon", sablonId, degiskenler }`. İstemci üretimi
    `istemciKimligi` ile aynı mesaj iki kez gönderilmez.
  - Pencere açıksa metin; kapalıysa **yalnızca** o numaranın WABA'sında onaylı ve kullanılabilir şablonlar seçilebilir.
    Sunucu da denetler (400), arayüz yalnızca kısıt değildir.
- **Kurallar** (sunucu, gönderimden hemen önce):
  - Hesap kilidi ve kalite RED → gönderim yok.
  - Test modu açıksa yalnızca test numaraları.
  - **Şablon** (her kategori): kampanya alıcı kurallarının tamamı uygulanır (WhatsApp izni, RET, engel listesi,
    bireyselde İYS beyanı). RET'li veya engelli kişiye şablon **hiçbir koşulda** gitmez (K4).
  - **Pencere içindeki elle serbest metin** müşteri hizmeti yanıtıdır: izin "yok" olsa da, kişi RET vermiş olsa da
    gönderilebilir (K4, B3 onayı), çünkü müşteri kendisi yazdı. Yalnızca temsilcinin elle yazdığı metin; bot ve
    kampanya bu yoldan geçmez. RET'li kişinin sohbetinde yazma alanının üstünde kalıcı kırmızı uyarı: "RET verdi:
    yalnızca sorusuna yanıt verin, pazarlama içeriği göndermeyin". Gönderilen her yanıt olay geçmişine "RET'li kişiye
    hizmet yanıtı" olarak yazılır.
- Gönderim web sürecinde, istekte yapılır (kuyruğa girmez); sonucu kişiyi bekletmeden döner. Belirsiz sonuç (zaman
  aşımı) tekrar denenmez, mesaj "gönderilemedi, durum belirsiz" görünür.
- Günlük sınır: sohbet yanıtları kampanya sınırına **sayılmaz** (ayrı sayaç, yalnızca rapor). Şablon gönderimleri
  sayılır. Portföy limiti yalnızca işletmenin başlattığı şablon gönderimlerini kapsar.
- **Okundu bildirimi:** temsilci sohbeti açtığında, ayar açıksa son gelen mesaja bir kez gönderilir
  (`status: "read"`). Okunmamış sayısı sıfırlanır.

### B4. Canlı yenileme: kısa aralıklı yoklama (SSE değil)

**Önerim: imleçli kısa yoklama.** Görünür sekmede 3 sn, arka plandaki sekmede 20 sn aralıkla
`GET /api/gelen-kutusu/degisiklikler?sonra=<surum>&numara=<id>` çağrılır. Değişmeyen istek boş ve küçük bir yanıt
döner.

Gerekçe:
1. **Değişiklikler iki süreçten geliyor:** webhook web sürecinde, kampanya mesajları ise ayrı işçi sürecinde yazılıyor.
   SSE'de sunucunun "yeni bir şey var" diye haberdar olması için ya süreçler arası bir mesajlaşma katmanı (Redis vb.;
   yeni bağımlılık ve servis) ya da yine veritabanını yoklayan bir döngü gerekir. SSE bu durumda gecikmeyi
   azaltmıyor, yoklamayı yalnızca sunucuya taşıyor.
2. **SQLite'ta yoklama ucuz:** indeksli sayaç okuması mikrosaniyeler sürer. Küçük bir ekip (≤10 kişi) için bu,
   saniyede birkaç istek eder.
3. **Uzun bağlantının yan sorunları yok:**
   - Her istek oturum ve üyelik denetiminden geçer; üyelikten çıkarılan kişi sonraki istekte düşer.
   - `proxy.ts` her istekte çalışır.
   - Caddy, tamponlama ve sıkıştırma ayarı gerekmez.
   - Next.js akış rehberindeki tamponlama uyarıları uygulanmaz.
   - Yeniden başlatmada (güncelleme) bağlantılar kopmaz.
4. 3 sn gecikme insan yazışması için yeterli; bot yanıtı yoklamaya bağlı değil (C3).

İleride SSE gerekirse aynı `surum` imleci üzerine kurulur; istemci tarafındaki değişiklik küçük olur.

### B5. Arayüz (`/gelen-kutusu`)

- **Sol sütun: sohbet listesi.**
  - Numara filtresi: "Tümü", Merkez, Şube 2 …; her birinde okunmamış rozeti.
  - Diğer filtreler: Açık / Kapalı, "Bana atanan", "Atanmamış", arama (ad, telefon).
  - Satır: ad, son mesajın kısa hali, saat, okunmamış sayısı, numara rozeti, pencere göstergesi (kalan süre).
- **Sağ: sohbet ekranı.**
  - Balonlar: gelen ve giden; kaynak etiketi (temsilci adı, Bot, Kampanya, Telefon); teslim işaretleri ✓ ✓✓ mavi ✓✓;
    hata kodu ipucu.
  - Üst bar: kişi adı ve kayıt bağlantısı, izin ve RET durumu, numara, atama seçimi, "Kapat" / "Yeniden aç".
  - Yan panel: iç notlar.
  - Pencere kapalıysa yazma alanı yerine "24 saatlik pencere kapalı; şablon seçin" ve şablon seçici (değişkenler,
    önizleme).
  - RET'li kişide pencere açıksa yazma alanı açık, üstünde kırmızı RET uyarısı; şablon seçici kapalı. Pencere kapalıysa
    hiçbir gönderim yapılamaz ("RET verdi; yalnızca kendisi yazarsa 24 saat içinde yanıt verebilirsiniz").
- Menüde "Gelen kutusu" ve toplam okunmamış rozeti. Mobilde liste ve sohbet ayrı ekran.
- Üye yalnızca kendine atanmış ve atanmamış sohbetleri mi görsün? **Varsayılan: herkes hepsini görür**, atama yalnızca
  sorumluluk gösterir. İstersen "üye yalnızca kendininkini görür" ayarı eklenir.

### B6. Gelen medya (alt grup B2) — migration `0021_sohbet_medyalari.sql`

- **`sohbet_medyalari`:** `id`, `tenant_id`, `mesaj_id`, `meta_medya_id`, `mime`, `boyut`, `sha256`, `dosya_adi`
  (belgede gönderenin verdiği ad), `yol` (MEDYA_KLASORU altında `tenant/yyyy-mm/<uuid>`), `durum` (`bekliyor` /
  `indirildi` / `hata` / `silindi`), `deneme`, `silinme_tarihi`.
- **İndirme:** işçi her turda bekleyenleri indirir. Webhook ağ isteği yapmaz; transaction kısa kalır.
  - Webhook'taki medya kimliği 7 gün geçerli; işçi dakikalar içinde alır.
  - Akış: `GET /{media-id}` → kısa ömürlü URL. Sonra o URL'ye `Authorization` ile `GET`.
    - URL'nin alanı Meta'nın medya alanlarından biri olmalı (beyaz liste); `redirect: "error"` uygulanır.
    - Boyut sınırı türe göre uygulanır; akışla yazılır, sınır aşılırsa kesilir.
    - Yazılan dosya sha256 ile doğrulanır.
- **Gösterme:** `GET /api/medya/[id]` oturum ve tenant denetimli.
  - `Content-Type` dosyadan değil kayıttaki beyaz listeden alınır; `X-Content-Type-Options: nosniff`.
  - Görseller satır içi gösterilir; belge ve ses `Content-Disposition: attachment` ile iner.
  - SVG ve HTML kabul edilmez.
- **Saklama:** günlük bakımda süresi dolan dosyalar silinir; satır "silindi" olur ve sohbette "medya saklama süresi
  doldu" görünür.
- Disk kotası: çalışma alanı başına üst sınır (ör. 5 GB); aşılırsa yeni medya indirilmez ve yöneticiye uyarı gösterilir.

### B7. Coexistence hazırlığı (alt grup B3, 2. hafta, yalnızca mock)

Veri modeli B1'de buna göre kurulur (`kaynak = telefon | gecmis`, `meta_zamani`).

- **`smb_message_echoes`:** işletmenin telefondaki WhatsApp Business uygulamasından gönderdiği mesaj. Sohbete
  `yon = giden`, `kaynak = telefon` olarak yazılır.
  - Kampanya veya izin kuralı uygulanmaz, çünkü uygulama göndermedi.
  - Bot susar: insan devralmış sayılır.
  - Cloud API'den giden mesajlar echo üretmez; çift kayıt oluşmaz, wamid benzersizliği ayrıca korur.
- **`history`:** en fazla 180 güne kadar geçmiş, sıralı faz ve parça (phase/chunk) bildirimleriyle gelir. Mesajlar
  `kaynak = gecmis` ve gerçek zamanlarıyla eklenir.
  - Okunmamış sayısını artırmaz, bot ve okundu bildirimi tetiklemez.
  - 24 saat penceresini yalnızca son 24 saat içindeki gelen mesajlar açar.
  - Geçmişteki **RET metinleri de ret olarak işlenir**. Daha sıkı olan bu; gevşetme yasak. Olay açıklamasına
    "geçmiş içe aktarmadan" eklenir.
  - Bilinmeyen numaralar için kayıt açılır (kaynak `whatsapp_gelen`, izin yok).
- **`smb_app_state_sync`** (kişi senkronu) yalnızca kayıt eşleştirmesi için okunur, şimdilik yeni kayıt açmaz.
- **Testler:** gerçekçi örnek yüklerle (mock) echo sohbete düşer ve botu susturur; history parçaları sırasız gelse de
  doğru sıralanır; aynı parça iki kez gelirse tek kayıt olur; geçmiş RET'i engel listesine girer.

### B8. Meta API çağrıları

| Uç | Amaç | İzin |
|---|---|---|
| `POST /{phone-number-id}/messages` (`type: text`) | pencere içi yanıt | `whatsapp_business_messaging` |
| `POST /{phone-number-id}/messages` (`type: template`) | pencere dışı | `whatsapp_business_messaging` |
| `POST /{phone-number-id}/messages` (`status: read`, `message_id`) | okundu | `whatsapp_business_messaging` |
| `GET /{media-id}` ve dönen URL | gelen medya indirme | `whatsapp_business_messaging` |
| Webhook alanı `messages` | gelen ileti ve durumlar | uygulama aboneliği |
| (Coexistence) webhook alanları `smb_message_echoes`, `history`, `smb_app_state_sync` | yalnızca mock | Embedded Signup gerekir (§9) |

### B9. Riskler

- **KVKK:** müşteri yazışmaları ilk kez saklanıyor. Saklama süresi ayarı, silme ve dışa aktarma kaydı (kim indirdi)
  var. Aydınlatma metni müşterinin (veri sorumlusu) işi; belgeye not düşülür.
- **İşlem sırası:** RET'in sohbet kaydından önce işlenmesi şart; test ile kilitlenir.
- **Tekrar gelen webhook:** wamid benzersizliği ve mevcut kimlik tablosu çift mesajı önler.
- **Dosya güvenliği:** medya yolu kullanıcı girdisinden üretilmez (uuid); MIME beyaz listesi; indirme yalnızca Meta
  alanlarından.
- **Ölçek:** binlerce kişi, kampanya başına binlerce sohbet satırı demek. Liste sayfalı ve indeksli; okunmamış sayısı
  satırda tutulur (sayım sorgusu yok).

### B10. Testler

- Gelen metin sohbet ve mesaj oluşturur, okunmamış artar, kapalı sohbet açılır, aynı wamid ikinci kez yazılmaz.
- RET: önce engel listesi, sonra mesaj. RET'li kişi kendisi yazdıysa pencere içinde elle metin gider; pencere
  dışında metin 400; şablon her durumda 403; bot ve kampanya hiç gitmez (K4).
- İzni olmayan kişi kendisi yazdıysa pencere içinde elle metin gider; şablon için izin kuralı aynen geçerli (B3).
- Bilinmeyen numara: kayıt `whatsapp_gelen`, izin `yok`, alıcı türü bireysel; bu kişiye **kampanya gönderilmez**
  (alıcı kuralları "WhatsApp izni yok" der).
- Pencere: 23 sa 59 dk'da metin gider, 24 saat 1 sn'de 400; pencere dışında şablon gider; başka WABA'nın şablonu 400.
- Kampanya mesajı sohbete düşer; teslim durumu hem kuyruğa hem sohbete yazılır; durum yalnızca ileri gider.
- Okundu: sohbet açılınca bir kez gönderilir; ayar kapalıysa gönderilmez.
- Değişiklik ucu: `sonra=<surum>` yalnızca yenileri döner; başka çalışma alanının değişikliği görünmez; üyelikten
  çıkarılan kullanıcı 401 alır.
- Atama yalnızca aynı çalışma alanının üyesine yapılabilir; notlar Meta istemcisine gitmez (mock gönderim sayısı 0).
- Test modu açık bağlantıdan test numarası dışına metin gönderilemez; hesap kilidinde gönderim yok.
- Medya: bekleyen indirilir, boyut aşımı kesilir, Meta dışı URL reddedilir, saklama süresi dolunca silinir, başka
  tenant'ın medyası 404, SVG reddedilir.
- Saklama: süresi dolan metin boşaltılır, satır ve teslim bilgisi kalır.

**Süre:** B1 2,5–3 gün, B2 1 gün, B3 1 gün.

---

## 6. Grup D — Google Kişiler CSV

> **D'nin uygulanması (17.11.2026) — plandan ayrılan ve plana eklenen noktalar:**
> - **Migration `0021_google_kisiler`** (planda 0022): `ice_aktarmalar.bicim` (genel | google) ve `birlesen`.
> - Ön işlem yükleme anında yapılır; oturumda dönüşmüş satırlar (7 sütun, son sütun "Dosya satırı") saklanır.
>   Önizlemedeki ve sorunlu satır raporundaki satır numaraları dönüşmüş listeye göredir; özgün satır CSV'deki "Dosya
>   satırı" sütunundadır. "Dosya içi tekrar birleşti" ayrı satır olarak raporlanmaz; sayısı ve birleşen satırlar görünür.
> - **Uyarı listesi (yeni):** alınan ama izni yazılmayan satırlar (engel listesi, İYS beyanı gerekli) ayrı sayılır ve
>   sorunlu satırlar CSV'sine "Uyarı:" önekiyle eklenir. **Engel listesine izin yazılmaması bütün içe aktarmalara
>   uygulandı** (genel biçim dahil); "bireysel + İYS beyanı yok → izin yazılmaz" yalnızca Google biçiminde (genel
>   biçimde eskisi gibi izin yazılır, kampanya İYS beyanı olmadan gitmez).
> - Toplu WhatsApp izni (`varsayilanIzin`) ve etiket eşleme (`etiketEslemi`) genel seçenektir; izin sütunu eşlenmemiş her
>   dosyada kullanılabilir. Etiketler Türkçe küçük harfe çevrilir (mevcut kural: "VIP" → "vıp").
> - Google dosyasında sütun sınırı 250 (genelde 50); satır sınırı 20 000, dosya 10 MB (Caddy sınırı 25 MB).
> - 20 000 satır (ayrıştırma + ön işlem + tamamlama) geliştirme makinesinde yaklaşık 5,2 sn; parti işleme gerekmedi.
> - Dışa aktarma olayı her kayda "bilgi" türünde yazılır; kaydın güncelleme tarihi değişmez. Kullanıcı verisi olmayan
>   Google kaydı satır olarak çıkmaz. E-postası olup telefonu olmayan kişi gidiş-dönüşte yeniden eklenir (veritabanı
>   çakışması telefona göredir).

### D1. Biçim

Google Contacts'ın iki dışa aktarma biçimi de tanınır (başlıklara bakılarak otomatik):

- **Yeni biçim:** `First Name`, `Middle Name`, `Last Name`, `Nickname`, `Organization Name`, `Organization Title`,
  `E-mail 1 - Value`, `Phone 1 - Label`, `Phone 1 - Value` … `Phone N - Value`, `Labels`, `Notes`.
- **Eski biçim:** `Name`, `Given Name`, `Family Name`, `Group Membership`, `Phone 1 - Type`, `Phone 1 - Value`,
  `Organization 1 - Name`.

Kurallar:
- Bir hücrede birden çok değer ` ::: ` ile ayrılır (ör. `Phone 1 - Value = "+90 532 … ::: 0224 …"`).
- Etiketler `* myContacts ::: Esnaf ::: Bursa` biçimindedir. `*` ile başlayan sistem grupları (`myContacts`,
  `starred`) atılır; kalanlar bizim etiketlerimiz olur. Etiket eşleme ekranında "Google etiketi → bizim etiket"
  (yeniden adlandır veya yok say) ayarlanabilir.
- **Telefon:** önce cep (+90 5xx) olanlar seçilir, `Phone N - Label` "Mobile" olan önceliklidir. Kayıtta tek telefon
  alanı (`ek_telefon`) olduğu için diğer telefonlar `notlar`'a "Diğer telefonlar: …" olarak eklenir. Normalleştirme
  mevcut `telefonNormallestir` ile yapılır (0 ile başlayan, boşluklu, `+90`, `0090`). Görüntü ve dışa aktarma
  `+90 5xx xxx xx xx`.
- **Ad:** `isletme_adi` = Organization Name, yoksa Ad Soyad. `yetkili_adi` = Ad Soyad.

### D2. Akış

Mevcut içe aktarma hattı (`ice-aktarma.ts`: yükle → eşle → önizle → tamamla → sorunlu satırlar CSV'si) kullanılır.
Google biçimi yalnızca **ön işlemci** ve hazır sütun eşlemesidir; ikinci bir hat yazılmaz.

- **Tekrarlar:**
  - Dosya içinde normalleştirilmiş telefona göre birleştirilir: etiketler birleşir, notlar eklenir, ad olarak ilk dolu
    değer kalır.
  - Veritabanındakilerle mevcut çakışma politikası (`atla` / `bos_doldur`) uygulanır.
  - Önizlemede "x satır birleşti" görünür.
- **Toplu seçimler** (tek seferde tüm dosyaya): alıcı türü (tacir/esnaf | bireysel), WhatsApp izni (yok | var) ve
  izin kaynağı (form, sözleşme, sözlü …).
  - Bireysel + izin var seçilirse **İYS beyanı kuralı aynen** uygulanır: beyan yoksa izin yazılmaz, satır "İYS beyanı
    gerekli" sorunu olur.
  - İzinli içe aktarmada mevcut beyan onayı metni ve sürümü kanıt olarak tutulur.
- **Önizleme:** ilk 50 satırda dönüşmüş hal (ad, +90 telefon, etiketler, birleşenler); sayılar (eklenecek,
  güncellenecek, atlanacak, sorunlu).
- **Hata raporu:** mevcut "sorunlu satırlar CSV'si". Nedenler: telefon geçersiz veya yok, yurt dışı numara, İYS beyanı
  gerekli, engel listesinde, dosya içi tekrar birleşti (bilgi).
- **Engel listesi:** RET'li ve engelli numaralar içe aktarılır ama izin `var` **yazılmaz**; satır "engel listesinde"
  olarak raporlanır.

### D3. Dışa aktarma

- `GET /api/kayitlar/disa-aktar?bicim=google`: yeni Google biçiminde sütunlar `First Name`, `Last Name`,
  `Organization Name`, `Phone 1 - Label`, `Phone 1 - Value`, `E-mail 1 - Value`, `Labels`, `Notes`.
  - `Phone 1 - Value` `+90 …` biçiminde; `Labels` `* myContacts ::: etiket1 ::: etiket2`.
  - Google'ın içe aktarabildiği UTF-8, BOM'lu.
- Yalnızca kullanıcının girdiği veriler çıkar; **Google Places içeriği yazılmaz** (mevcut kural). Places'tan gelen
  kayıtta Places adı ve telefonu yoksa satır kullanıcı verisiyle çıkar.
- Yalnızca yönetici kullanabilir; dışa aktarma kayıt geçmişine olay olarak yazılır.
- `docs/ornek-google-kisiler.csv`: 10–15 satır, sahte numaralar (`0500 000 00 xx`). İçinde birleşecek tekrar, eski
  biçimde etiket, iki telefonlu kişi, geçersiz numara, yurt dışı numara ve şirket adı olan ve olmayan satırlar var.

### D4. Veri modeli

Migration gerekmez. `ice_aktarmalar` tablosuna `bicim` (`genel` | `google`) eklenecekse küçük bir migration
(`0022`) yapılır. `ICE_AKTARMA_AZAMI_SATIR` 20 000 olur (K7). Dosya boyutu sınırı 5 MB → 10 MB.

### D5. Meta ve Google çağrıları

Yok. Google Kişiler API'si kullanılmaz; dosya tabanlıdır.

### D6. Riskler

- Google sütun adları dile göre değişebilir (Türkçe arayüzden alınan dışa aktarma). Google CSV başlıkları İngilizce
  verir, ama emin olmak için Türkçe hesapla alınmış gerçek bir örnek dosya istenir. Bilinmeyen başlıkta mevcut elle
  eşleme ekranına düşülür.
- 20 000 satır önizleme ve tamamlama süresi: tamamlama tek transaction'da; 20 000 satırda süre ölçülür (hedef < 5 sn).
  Aşarsa parti parti işlenir.

### D7. Testler

- Yeni ve eski biçim tanınır; ` ::: ` çoklu değer; cep önceliği; ikinci telefon notlara gider.
- Dosya içi tekrar birleşir (etiket birleşimi); veritabanı çakışmasında politika uygulanır.
- Etiket dönüşümü: `* myContacts` atılır; eşleme ile yeniden adlandırma ve yok sayma.
- Bireysel + izin var + İYS beyanı yok → izin yazılmaz, satır sorunlu. Tacir → beyan aranmaz.
- Engel listesindeki numaraya izin yazılmaz.
- Dışa aktarma: biçim ve sütun sırası; BOM; `+90` biçimi; Places verisi yok; üye 403.
- Gidiş-dönüş: dışa aktarılan dosya yeniden içe aktarılınca 0 yeni, n atlandı.
- `ornek-google-kisiler.csv` önizlemesi beklenen sayıları verir (test bu dosyayı kullanır).
- 20 000 satırlık sentetik dosya süre sınırı içinde (performans testi; CI'da `--testTimeout` ile).

**Süre:** 1–1,5 gün.

---

## 7. Grup C — Bot (numara başına) — 2. hafta

### C1. Veri modeli — migration `0023_bot.sql`

**`bot_ayarlari`:** bağlantı başına bir satır.
- Temel: `baglanti_id` (PK, tenant FK), `aktif`, `karsilama_metni`, `karsilama_tekrar_saat` (aynı kişiye tekrar
  karşılama için en az süre; varsayılan 24).
- Menü: `menu_turu` (`yok` | `numarali` | `dugme` | `liste`), `menu` (JSON: en fazla 10 öğe; her öğe başlık, kimlik,
  eylem).
  - Eylemler: yanıt metni, alt menü, temsilciye bağla.
  - Sınırlar Meta'nınkiler: düğme en fazla 3 ve başlık 20 karakter; liste en fazla 10 satır ve başlık 24 karakter.
- `anahtar_kelimeler` (JSON: kelime listesi, eşleşme türü tam/içerir, yanıt veya eylem).
- Mesai: `mesai` (JSON: haftanın günleri ve İstanbul saat aralıkları), `mesai_disi_metni`.
- Devretme: `devret_kelimeleri` (varsayılan "temsilci", "yetkili", "insan"), `devret_metni`, `sus_dakika`
  (varsayılan 120).
- Kayıt: `guncelleyen`, `guncelleme_tarihi`.

`sohbetler.bot_sus_bitis` (B1'de var). `sohbet_mesajlari.kaynak = bot`.

### C2. Karar sırası (saf fonksiyon `botKarari`)

1. Tekrar kontrolü (webhook).
2. **RET ve abonelikten çıkma her zaman önce** (mevcut akış). RET ise bot hiçbir şey göndermez.
3. Kişi RET'li veya engelli → bot **hiçbir koşulda** yazmaz; sohbet temsilciye kalır (temsilci K4'e göre elle yanıt
   verebilir).
4. Geçmiş (`history`) veya echo (`telefon`) mesajı → bot çalışmaz; echo `bot_sus_bitis`'i uzatır.
5. Sohbet devredilmiş ve `bot_sus_bitis` gelecekte → bot susar.
6. Temsilci son `sus_dakika` içinde yazdıysa → bot susar.
7. Devretme kelimesi veya menüde "Temsilciye bağlan" → `devret_metni`; `bot_sus_bitis = şimdi + sus_dakika`; sohbet
   açık ve atanmamış.
8. Anahtar kelime kuralı (ilk eşleşen) → yanıtı.
9. Menü yanıtı (numara, düğme kimliği, liste satırı) → öğenin eylemi.
10. Mesai dışı → `mesai_disi_metni` (aynı sohbette mesai dışı dönemi başına bir kez).
11. İlk mesaj veya `karsilama_tekrar_saat` geçti → karşılama + menü.
12. Hiçbiri → sessiz; sohbet temsilci için okunmamış kalır.

Bot yanıtları her zaman müşteri yazdıktan hemen sonra, yani 24 saat penceresi içinde gider; serbest metin ve
etkileşimli mesaj kullanılabilir.

### C3. Gönderim zamanı

Bot kararı webhook transaction'ında verilir; giden mesaj `sohbet_mesajlari`'na `gonderilecek` durumuyla yazılır. Ağ
isteği transaction'da yapılmaz.

- **Hemen gönderme:** yanıt döndükten sonra Next.js `after()` ile aynı süreçte gönderilir; gecikme saniyenin altında.
  Uygulama öncesi `node_modules/next/dist/docs` içindeki `after` belgesi okunur.
- **Yedek:** `after` yarıda kalırsa (yeniden başlatma) işçi her turda 2 dakikadan eski `gonderilecek` mesajları dener.
  Pencere hâlâ açık olmalı; 10 dakikadan eskiyse "geç kaldı" diye iptal edilir. Eski karşılama mesajı gönderilmez.
- Atomik "gönderiliyor" kilidi (kuyruktaki gibi) aynı mesajın iki kez gitmesini önler.

### C4. Arayüz

- **Ayarlar > WhatsApp > [numara] > Bot:**
  - Açma/kapatma; karşılama; menü düzenleyici (öğe ekle, sırala, tür seç; karakter sınırları canlı denetlenir);
    anahtar kelimeler; haftalık mesai tablosu; devretme.
  - Kaydederken doğrulama hataları alan alan gösterilir.
- **Önizleme:** sağda telefon görünümlü sohbet simülatörü. Kullanıcı müşteri olarak yazar, `botKarari` aynı kodla
  çalışır; **hiçbir şey gönderilmez**, veritabanına yazılmaz.
  - Saat seçici: "mesai dışını dene".
  - Düğme ve liste mesajları WhatsApp'taki gibi çizilir.
- Gelen kutusunda bot mesajları "Bot" etiketli; devredilen sohbette "Bot 1 sa 45 dk susuyor" ve "Botu şimdi aç"
  düğmesi.

### C5. Meta API çağrıları

| Uç | Amaç | İzin |
|---|---|---|
| `POST /{phone-number-id}/messages` (`type: text`) | karşılama ve yanıtlar | `whatsapp_business_messaging` |
| `POST /{phone-number-id}/messages` (`type: interactive`, `button` / `list`) | menü | `whatsapp_business_messaging` |
| Webhook `messages` → `interactive.button_reply` / `list_reply` | menü seçimi | — |

### C6. Riskler

- Botun RET'li kişiye yazması; C2'deki sıra testlerle kilitlenir.
- Döngü: botun kendi mesajına veya echo'ya yanıt vermesi. Yalnızca `kaynak = musteri` mesajlar botu tetikler.
- Kötü niyetli müşteri saniyede onlarca mesaj atarsa: sohbet başına bot yanıtı 1 dakikada en fazla 3; aşılırsa sessiz.
- `after()` ve işçi yedeğinin aynı mesajı iki kez göndermesi; atomik kilit ve testi.

### C7. Testler

- `botKarari` için tablo testleri: her adım ayrı ve sıra çakışmaları. RET + anahtar kelime → yalnızca ret, yanıt yok.
  RET'li kişi → sessiz. Devredilmiş sohbette anahtar kelime → sessiz. Echo → sessiz ve süre uzar.
- Mesai: hafta sonu, gece yarısını aşan aralık, İstanbul saati.
- Menü: numaralı ("2"), düğme kimliği, liste kimliği, geçersiz seçim.
- Karakter sınırları ayar doğrulamasında 400.
- Gönderim: `after` ile gönderildi; `after` çalışmadıysa işçi gönderir; 10 dakikadan eski mesaj iptal; iki kez
  gönderilmez.
- Hız sınırı: 1 dakikada 4. bot yanıtı yok.
- Önizleme ucu veritabanına yazmaz ve Meta istemcisini çağırmaz.

**Süre:** 2–3 gün.

---

## 8. Grup E — Görselli, videolu ve belgeli kampanya — 2. hafta

### E1. Kapsam

Başlığı (HEADER) `IMAGE`, `VIDEO` veya `DOCUMENT` olan onaylı şablonlar kampanyada kullanılabilir hale gelir. Bugün
şablon senkronu bunları `destek_nedeni` ile dışarıda bırakıyor olmalı; E başında doğrulanır.

### E2. Veri modeli — migration `0024_kampanya_medyasi.sql`

- **`kampanya_medyalari`:** `id`, `tenant_id`, `kampanya_id`, `tur`, `mime`, `boyut`, `sha256`, `dosya_adi`, `yol`
  (sunucuda saklanan kopya), `baglanti_id`, `meta_medya_id`, `meta_yukleme_tarihi`.
  - Meta medya kimliği 30 gün geçerlidir ve yükleyen numaraya bağlıdır. Kampanya 25 günden uzun sürerse ya da
    duraklatılıp sonra devam ederse işçi yeniden yükler.
- `kampanyalar.medya_id`.

### E3. Akış

1. **Sihirbaz:** şablon seçildiğinde başlık türü görünür; dosya alanı açılır.
2. **Yükleme:** `POST /api/kampanyalar/taslak-medya` (yönetici; Caddy ve rota boyut sınırı).
   - Denetim yalnızca uzantıyla değil, **dosyanın ilk baytlarına** (magic number) bakarak yapılır.
   - Sınırlar Meta'nın desteklenen medya tablosundan alınır. Uygulama günü resmî tablodan yeniden doğrulanacak; ikincil
     kaynaklardaki değerler:

     | Tür | Biçim | En fazla |
     |---|---|---|
     | Görsel | JPEG, PNG | 5 MB |
     | Video | MP4 (H.264 + AAC), 3GPP | 16 MB |
     | Belge | PDF (başlık şablonlarında yalnızca PDF) | 100 MB |

     Meta'nın sınırı şifreleme sonrası boyuta uygulandığı için %5 pay bırakılır.
3. **Önizleme:** görsel ve video küçük resmi, belge adı ve sayfa simgesiyle şablon balonu.
4. **Kampanya oluşturma:** dosya `kampanya_medyalari`'na taşınır. Meta'ya yükleme **gönderim başlarken işçide**
   yapılır (`POST /{phone-number-id}/media`, multipart), kimlik saklanır. Sandbox ve mock'ta sahte kimlik verilir.
5. **Gönderim:** şablon bileşenine `{ type: "header", parameters: [{ type: "image" | "video" | "document",
   image: { id } }] }` eklenir; belgede `filename` gönderilir.
6. **Hatalar:**
   - Medya hatası 131052/131053 → kampanya duraklar ("medya Meta'da işlenemedi").
   - Kimlik süresi dolmuşsa bir kez yeniden yüklenip denenir.
7. Kampanya mesajının sohbetteki kopyası (B) başlıkta medyayı gösterir.

### E4. Meta API çağrıları

| Uç | Amaç | İzin |
|---|---|---|
| `POST /{phone-number-id}/media` | medya yükleme, kimlik alma | `whatsapp_business_messaging` |
| `POST /{phone-number-id}/messages` (header parametreli şablon) | gönderim | `whatsapp_business_messaging` |
| `DELETE /{media-id}` (isteğe bağlı) | kampanya bitince silme | `whatsapp_business_messaging` |

### E5. Riskler

- Video codec denetimi sunucuda yapılamaz (ffprobe yok ve kurulmayacak). MP4 kabul edilir, codec uygun değilse Meta
  hata verir ve kampanya duraklar; arayüzde "H.264/AAC MP4 kullanın" uyarısı olur.
- Büyük belge yükleme: Caddy `request_body` ve Next rota sınırları; yükleme akışla diske yazılır, belleğe alınmaz.
- Üç numaralı kampanyada (ileride) her numara için ayrı yükleme gerekir.

### E6. Testler

- Magic number: PNG uzantılı JPEG kabul, PNG uzantılı HTML ret; boyut sınırının bir bayt üstü ret.
- Şablon başlık türü ile dosya türü uyuşmazlığı 400.
- İşçi: ilk gönderimde bir kez yükler, sonrakilerde aynı kimliği kullanır; 25 günden eskiyse yeniden yükler.
- Gönderim yükünde header parametresi doğru; belgede dosya adı var.
- 131053 → kampanya duraklar; süresi dolmuş kimlik → tek yeniden deneme.
- Sandbox kampanyası Meta'ya yükleme yapmaz.

**Süre:** 1,5–2 gün.

---

## 9. Embedded Signup, Tech Provider ve Coexistence: uygulamamızda ne gerektirir?

Bu bölüm bilgi amaçlıdır; kod yazılmayacak.

**Bugünkü yol (bu müşteri için yeterli):** müşterinin kendi Meta uygulaması ve kendi işletmesinin system user anahtarı
Ayarlar'a girilir. İşletme yalnızca **kendi** varlıklarına eriştiği için uygulama incelemesi ve gelişmiş erişim
gerekmez. Bir haftalık canlıya çıkış bu yolla yapılır.

**Embedded Signup / Tech Provider:** başka işletmeleri "Facebook ile bağlan" düğmesiyle bizim uygulamamıza bağlamak
için gerekir. **Coexistence'ın tek yolu da budur:** WhatsApp Business uygulamasındaki numara Cloud API'ye ancak
Embedded Signup akışıyla (Business app onboarding) bağlanır.

Meta tarafında gerekenler:
1. **İşletme doğrulaması** (Business verification): bölgeye göre birkaç gün ile birkaç hafta.
2. **Uygulama incelemesi** (App Review): `whatsapp_business_management` ve `whatsapp_business_messaging` için
   **gelişmiş erişim** (Advanced Access). Onaysız izin Embedded Signup akışında görünmez. Geliştirme modunda kendi test
   kullanıcılarımızla denenebilir.
3. **Erişim doğrulaması** (Tech Provider olduğumuzun teyidi): Meta'nın ortalama süresi yaklaşık 5 iş günü.
4. **Uygulama sayfası:** gizlilik politikası adresi, veri silme talimatı, simge, iki adımlı doğrulama açık iş hesabı.
5. **Facebook Login for Business** yapılandırması (Embedded Signup yapılandırma kimliği).

Bizim uygulamada gerekecekler (tahmin 3–4 gün, Meta onaylarından sonra):
- **Arayüz:** Ayarlar > WhatsApp'ta Meta JS SDK ile Embedded Signup penceresi; Coexistence için Business app
  onboarding seçeneği. Pencereden dönen `code`, WABA ID ve phone number ID alınır.
- **Sunucu:**
  1. `code` → işletme anahtarı değişimi (`/oauth/access_token`; App ID ve App Secret sunucuda).
  2. `POST /{waba-id}/subscribed_apps`.
  3. Normal yolda `POST /{phone-number-id}/register`; Coexistence'ta kayıt yerine senkron adımları.
- **Coexistence senkronu:** bağlandıktan sonra belirli süre içinde (Meta 24 saat diyor)
  `POST /{phone-number-id}/smb_app_data` ile kişi (`smb_app_state_sync`) ve geçmiş (`history`) senkronu başlatılır.
  Geçmiş en fazla 180 güne kadar gelir; B7'deki işleyici bunu karşılar.
- **Webhook alanları:** `messages` yanında `smb_message_echoes`, `history`, `smb_app_state_sync`.
- **Anahtar saklama:** Tech Provider'da anahtar bizim uygulamamızın; App Secret çalışma alanında değil ortamda
  (`.env`) tutulur. Şifreli bağlantı verisi yalnızca işletme anahtarını taşır. Bu, A'daki modele "uygulama düzeyi
  sır" kavramını ekler.

Bilinen kısıtlar (uygulama günü yeniden doğrulanacak):
- **Türkiye:** Coexistence Türkiye'de 23 Ekim 2025'ten beri destekleniyor (kullanıcının bildirdiği Meta Embedded
  Signup "Onboard WhatsApp Business app users" duyurusu). Engel ülke değil; asıl bekleme süresi Tech Provider
  onaylarıdır.
- Coexistence'ta numara başına gönderim hızı düşüktür; bazı uygulama özellikleri (ör. yayın listeleri) kısıtlanır.

**Öneri:** bu müşteri için önce bugünkü yolla ve tek numarayla canlıya çık (K1). İşletme doğrulaması ve uygulama
incelemesi başvurusunu paralel başlat; Coexistence ayrı aşama olarak planlanır. Kalan iki numara telefondan
kullanılmaya devam edecekse Coexistence onayını beklemek, Cloud API'ye taşımaktan daha az kayıplıdır (telefondaki
geçmiş korunur); bu karar o numaralar taşınırken verilir.

---

## 10. Migration listesi (özet)

| No | Grup | İçerik |
|---|---|---|
| 0019 | A | `whatsapp_baglantilari` yeniden kurulum (id PK, ad, sıra, günlük sınır); `kampanyalar.baglanti_id`; `message_queue.baglanti_id`; `whatsapp_sablonlari.waba_id` ve yeni benzersizlik; sayaç taşıma |
| 0020 | B1 | `sohbetler`, `sohbet_mesajlari`, `sohbet_notlari`, `gelen_kutusu_surumu`; `ileti_ayarlari` saklama ve okundu ayarları |
| 0021 | B2 | `sohbet_medyalari` |
| 0022 | D | (gerekirse) `ice_aktarmalar.bicim` |
| 0023 | C | `bot_ayarlari` |
| 0024 | E | `kampanya_medyalari`, `kampanyalar.medya_id` |

Her migration'dan önce `db:migrate` yedek alır. Gerçek veritabanlarında çalıştırılmaz; testler bellekte, prova
`data/demo.db`'de.

## 11. Yeni ortam değişkenleri

- `MEDYA_KLASORU` (varsayılan `./data/medya`)
- `MEDYA_KOTASI_MB` (varsayılan 5120)
- `UYGULAMA_ALANLARI` (canlıda izinli Host'lar; boşsa `BETTER_AUTH_URL`)
- `YEDEK_KLASORU` (varsayılan `/var/backups/harita-crm`) ve `YEDEK_SAKLAMA_GUN` (14)
- `GELEN_KUTUSU_YOKLAMA_SN` (3)

## 12. Demo ve prova

- `demo:hazirla` iki numaralı bağlantı, sohbetler ve bot ayarı üretir.
- `demo:webhook` yeni komutlar alır:
  - `gelen <telefon> <metin> [--numara]`
  - `medya <telefon> görsel|belge`
  - `echo <telefon> <metin>`
  - `gecmis <telefon>`
  - `menu <telefon> <seçim>`
- `PROVA.md` gelen kutusu, çoklu numara ve canlı kurulum bölümleriyle genişler.
- Hepsi mock; gerçek Meta isteği yok.
