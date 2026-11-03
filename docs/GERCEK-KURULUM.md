# Gerçek kuruluma geçiş

Bu rehber, uygulamayı demodan çıkarıp **gerçek servislere** bağlamak içindir. Teknik bilgi gerekmez; adımları sırayla
izleyin. Komutları VS Code'da proje klasöründe açtığınız terminale (üst menü → Terminal → New Terminal) yapıştırın.

> **Bu rehberdeki Meta ekranları hakkında:** Menü ve düğme adları Meta'nın güncel resmi belgelerinden (Haziran 2026
> güncellemeleri, 2 Kasım 2026'da okundu) alınmıştır ve İngilizce yazılmıştır; Meta'yı Türkçe kullanıyorsanız
> karşılıkları farklı görünebilir. Belgelerde **doğrulayamadığım** her bilgi yanında **(doğrulanamadı)** yazar; o adımda
> ekranda gördüğünüz farklıysa ekrandakine göre ilerleyin.
>
> Kaynaklar: [Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started),
> [Create a webhook endpoint](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint),
> [WhatsApp use case](https://developers.facebook.com/documentation/development/create-an-app/whatsapp-use-case),
> [About the platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform),
> [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

---

## E-posta (sonra)

_Bu bölüm daha sonra yazılacak. Şimdilik e-posta kampanyaları test modunda kalır (gerçek gönderim yapılmaz)._

---

## 0. Gerçek deneme ortamı (bir kez; hazır)

Bu adımlar yapıldı; yalnızca ne olduğunu bilmeniz için:

- `.env.local` dosyasında `DATABASE_PATH=./data/gercek-test.db`. Bu, **boş ve ayrı** bir veritabanıdır;
  `data/app.db` ve `data/demo.db`'ye dokunulmaz. Migration'lar uygulandı.
- `PLACES_MOCK=true`: Google'a henüz bağlanmıyoruz (Bölge tara örnek veriyle çalışır).
- `WHATSAPP_API_MOCK` boş: WhatsApp **gerçek** Meta'ya gider.
- `ILETI_SIFRELEME_ANAHTARI` ve `ILETI_IMZA_ANAHTARI` zaten tanımlıydı; değiştirilmedi. (Bu iki değeri **asla
  değiştirmeyin**: kayıtlı gizli bilgiler çözülemez, ret listesi eşleşmez.)
- `GENEL_ADRES` boş: 3. adımda tünel adresiyle dolduracaksınız.

Demoya dönmek isterseniz `npm run demo` kendi `data/demo.db` dosyasını kullanır; `.env.local`'i değiştirmeniz
gerekmez.

---

## 1. İlk kullanım: hesap, çalışma alanı, kendiniz

**Ne yap:**

1. `npm run dev` ile uygulamayı açın, tarayıcıda **http://localhost:3000**.
2. Giriş ekranında **Kayıt ol** sekmesi: ad soyad, e-posta, en az 10 karakterlik şifre → **Hesap oluştur**.
3. "Çalışma alanınızı oluşturun": bir ad → **Oluştur**. Panel açılır.
4. **Ayarlar → Gönderen bilgileri** (Gönderen unvanı, İletişim bilgisi, İYS numarası, Sorumluluk beyanı): **test için
   şart değil.** WhatsApp bağlantısı test modundayken, yalnızca test numaralarına giden kampanyalar bunlar olmadan da
   Meta'ya gerçekten gönderilir. **Test modunu kapatmak** ve test modu kapalıyken gönderim yapmak için ise hepsi
   gerekir (6. bölüm).
5. **Kayıtlar → Kişi ekle**: Ad soyad (kendiniz), Telefon (kendi cep numaranız, ör. `0532 …`), **Alıcı türü**
   "Bireysel (kişi)" → **Kaydet**.
6. Açılan ayrıntıda **İletişim izni** sekmesi → WhatsApp izni **Düzenle** → **İzin var**, İzin kaynağı (ör. "Sözlü"),
   İzin tarihi (bugün), **"Bu izin İYS'ye kaydedildi."** kutusu → **Kaydet**. "WhatsApp izni kaydedildi." çıkar.

**Ne görmelisin:** Bu akış Google'a hiç gitmez (denendi: Google tamamen kapalıyken de hatasız çalışıyor). Paneldeki
"Gönderen bilgileri eksik" uyarısı, gönderen bilgilerini girene kadar görünür; test kampanyasını engellemez.

> **Dikkat: alıcı türü ve İYS.** Bireysel kişiye WhatsApp kampanyası yalnızca WhatsApp izni "var" **ve** İYS beyanı
> işaretliyse gider. Kendinizi "Tacir/esnaf" diye eklemek kuralı aşmanın yolu değildir; deneme için beyan kutusunu
> işaretleyin. Bu kural test modunda da geçerlidir (gönderen bilgilerinden farklı olarak alıcı izinleri hiçbir zaman
> atlanmaz).

---

## 2. Meta: test numarası (developers.facebook.com)

### 2a. Uygulama oluşturma

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App**. (Geliştirici kaydınız yoksa
   önce kayıt istenir.)
2. Uygulama adı ve e-posta.
3. Kullanım durumu (use case) olarak **Connect with customers through WhatsApp** → **Next**.
4. Bir işletme portföyü (business portfolio) seçin ya da yeni oluşturun → **Next** → bilgileri onaylayıp **Create app**.

> Eski rehberlerde "**Business** türünde uygulama açıp **WhatsApp ürününü ekleyin**" yazar. Güncel belgede uygulama
> türü seçimi yerine bu kullanım durumu seçilir. Ekranınızda tür seçimi çıkarsa **Business**'ı seçip WhatsApp'ı ekleyin.

### 2b. API Setup: test numarası ve kimlikler

Uygulama oluşunca **Customize use case → Connect on WhatsApp → Quickstart** sayfası açılır.

1. **Start using the API** → **API Setup** sayfası.
2. Bir mesajlaşma hesabı bağlayın (yoksa **Create a WhatsApp Business account**). Yeni portföy açtıysanız hesap ve bir
   **test numarası** kendiliğinden oluşmuş olabilir.
3. Bu sayfada not alın:
   - **Test numarası**: **From** listesindeki numara.
   - **Phone Number ID**: test numarasının kimliği (uzun bir sayı; telefon numarasının kendisi değildir).
   - **WABA ID**: belgede "Messaging account ID" (eski adıyla "WhatsApp Business Account ID") olarak geçer. Uygulamada
     "WhatsApp hesap kimliği (WABA ID)" alanına bu girilir.

> Meta artık iki hesap adı kullanıyor: "WhatsApp account" (numaralar) ve "Messaging account" (şablonlar, ödeme).
> Uygulama bu kimlikle hem numaraları hem şablonları okur. "Numara bu hesaba ait değil" hatası alırsanız API Setup'taki
> diğer kimliği deneyin (doğrulanamadı: iki kimliğin farklı olduğu bir durumu belgede göremedim).

### 2c. Alıcı listesine kendi numaranız

1. API Setup'ta **To** alanına kendi WhatsApp numaranızı ekleyin (ülke koduyla, ör. +90 532 …).
2. Meta numaranıza WhatsApp'tan bir doğrulama kodu gönderir; kodu girin. **(doğrulanamadı:** güncel belgede kod adımı
   ayrıca anlatılmıyor.)
3. Test numarası yalnızca bu listedeki numaralara gönderir. Liste en fazla 5 numaradır **(doğrulanamadı:** güncel
   belgede sayı yok; önceki belgelere dayanır).

İsterseniz **Send message** ile hazır `hello_world` mesajını telefonunuza bir kez gönderip bağlantıyı burada da
deneyebilirsiniz.

### 2d. App Secret

Uygulama ayarları → **Basic** → **App secret** → **Show** (şifrenizi isteyebilir). Bu değer, Meta'dan gelen
bildirimlerin gerçekten Meta'dan geldiğini doğrulamak için gerekir.

### 2e. Erişim anahtarı: geçici mi, kalıcı mı?

| | Geçici anahtar | Kalıcı anahtar (system user) |
|---|---|---|
| Nereden | API Setup → **Generate access token** | business.facebook.com → İşletme ayarları → **System users** |
| Süre | Kısa; Meta "çabuk dolar" diyor. Panelde genellikle 24 saat yazar **(doğrulanamadı)** | Süre "Never" seçilirse dolmaz |
| Ne zaman yeter | **Bu testi aynı gün bitirecekseniz yeter.** | Birkaç gün sürecekse ya da gerçek kullanımda |

Geçici anahtarın süresi dolunca **Bağlantıyı test et** ve gönderim hata verir; o zaman API Setup'tan yeni anahtar
üretip uygulamada **Erişim anahtarı** alanına yeniden girin ve **Kaydet**'e basın.

Kalıcı anahtar için (belgeye göre):

1. İşletme ayarları → **System users** → sağ üstte **Add+** → bir system user oluşturun.
2. System user'ı seçip **Assign Assets**: uygulamanız (**Full control → Manage app**) ve WhatsApp hesabınız
   (**Full control → Manage WhatsApp Business accounts**) → **Assign assets**.
3. **Generate token** → izinler: `whatsapp_business_messaging` ve `whatsapp_business_management` (belge
   `business_management`'ı da listeler; bu uygulama onu kullanmaz) → anahtarı kopyalayın.

---

## 3. Tünel: Meta'nın bilgisayarınıza ulaşması

Meta, teslim ve "RET" bildirimlerini internetten gönderir; `localhost`'a ulaşamaz. Geçici bir **https** adresi için
Cloudflare'in hesap gerektirmeyen "quick tunnel" özelliğini kullanıyoruz.

### 3a. cloudflared kurulumu (bir kez)

Bilgisayarınızda kurulu değil. İkisinden birini yapın:

- **Resmî indirme:** [cloudflared-windows-amd64.msi](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi)
  dosyasını indirip çalıştırın (Cloudflare'in indirme sayfasındaki Windows 64-bit MSI).
- **ya da winget ile** (PowerShell'de):

  ```
  winget install --id Cloudflare.cloudflared
  ```

  (Bu paket winget'te `Cloudflare.cloudflared` adıyla duruyor; Cloudflare'in indirme sayfası winget'i anmıyor.)

Kurulumdan sonra **terminali kapatıp yeniden açın**, `cloudflared --version` bir sürüm yazmalı.

### 3b. Tüneli açma ve GENEL_ADRES

1. Uygulama bir terminalde çalışırken (`npm run dev`), **ikinci** bir terminalde:

   ```
   npm run tunel
   ```

2. Çıktıda şuna benzer bir kutu çıkar; içindeki adresi kopyalayın:

   ```
   Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
   https://rastgele-dort-kelime.trycloudflare.com
   ```

3. `.env.local` dosyasını açın, `GENEL_ADRES=` satırını bu adresle doldurun (sonunda `/` olmasa da olur):

   ```
   GENEL_ADRES=https://rastgele-dort-kelime.trycloudflare.com
   ```

4. Uygulamayı yeniden başlatın (ilk terminalde `Ctrl + C`, sonra `npm run dev`). `.env.local` yalnızca başlangıçta okunur.
5. **Ayarlar → WhatsApp (Meta) → Teknik ayrıntıları** altındaki **Bildirim adresi (webhook)** artık
   `https://…trycloudflare.com/api/whatsapp/webhook/…` ile başlar. (Bağlantıyı kaydetmeden bu alan görünmez; bkz. 4a.)

Arayüzü **localhost:3000**'den kullanmaya devam edin. Yalnızca Meta'nın istekleri tünelden gelir. Meta'nın bildirim
isteği oturum ya da tarayıcı kaynağı (Origin) istemez; uygulama yalnızca adresteki çalışma alanı kimliğine ve Meta'nın
imzasına (App Secret) bakar.

**Tünel koruması:** Tünel adresinden (`…trycloudflare.com` ya da `GENEL_ADRES`) gelen istekler **yalnızca bildirim
adresine** (`/api/whatsapp/webhook/…`) ulaşır. Giriş, kayıt ve diğer bütün sayfalar tünelden **404 (Bulunamadı)** döner.
Tünel adresini tarayıcıda açarsanız "Bulunamadı." görmeniz normaldir; arayüz yalnızca localhost'tan açılır.

> **Tünel adresi her açılışta değişir.** `npm run tunel`'i kapatıp açtığınızda (ya da bilgisayar yeniden başladığında)
> yeni bir adres çıkar. O zaman: `.env.local`'deki `GENEL_ADRES`'i güncelleyin → uygulamayı yeniden başlatın →
> **Meta'daki Callback URL'yi** yeni bildirim adresiyle değiştirip **Verify and save**'e basın (4b). Bunu yapmazsanız
> Meta bildirimleri eski, kapalı adrese gönderir; teslim ve RET bildirimleri gelmez. (Meta, ulaşamadığı bildirimleri
> 7 güne kadar yeniden dener.)
>
> **Güvenlik:** Cloudflare'e göre tünel adresini bilen herkes bilgisayarınızdaki uygulamaya istek gönderebilir. Tünel
> koruması bu istekleri yalnızca bildirim adresine bırakır (o da Meta'nın imzası olmadan hiçbir şey yapmaz). Yine de
> adresi paylaşmayın, `npm run tunel` dışında bir tünel komutu (özellikle `--http-host-header`) kullanmayın ve denemeniz
> bitince tüneli `Ctrl + C` ile kapatın.

---

## 4. Uygulamada WhatsApp ayarları ve Meta'da webhook

### 4a. Uygulama: Ayarlar → WhatsApp (Meta)

**Teknik ayrıntıları** bölümüne girin:

| Uygulamadaki alan | Meta'daki değer |
|---|---|
| WhatsApp hesap kimliği (WABA ID) | 2b'deki Messaging account / WhatsApp Business Account ID |
| Telefon numarası kimliği (Phone Number ID) | 2b'deki test numarasının Phone Number ID'si |
| Erişim anahtarı (system user token) | 2e'deki geçici ya da kalıcı anahtar |
| Uygulama gizli anahtarı (App Secret) | 2d |

**Kaydet**'e basın. Uygulama önce numaranın bu hesaba ait olduğunu Meta'dan doğrular. Başarılıysa:

- **Doğrulama anahtarı (verify token) yalnızca bu bir kez gösterilir; hemen kopyalayın.** Kaçırırsanız yanındaki
  **Yenile** ile yenisini üretirsiniz (Meta'daki değeri de değiştirmeniz gerekir).
- **Bildirim adresi (webhook)** görünür; **Kopyala** ile alın.
- **Test numaraları** alanına **kendi cep numaranızı** ekleyin. Test modunda uygulama yalnızca bu numaralara gönderir
  (Meta'nın alıcı listesinden ayrı, ikinci bir güvenlik kilidi).

### 4b. Meta: Webhook

1. App Dashboard → **Use cases** → WhatsApp'ta **Customize** → **Configuration**. (Uygulamayı eski yolla açtıysanız
   **WhatsApp → Configuration**.)
2. **Callback URL**: uygulamadaki bildirim adresi. **Verify token**: uygulamadaki doğrulama anahtarı.
3. **Verify and save**. Meta adresi o anda arar; uygulama ve tünel açık olmalı.
4. Kaydedince abone olunacak alanlar listesi çıkar. **Subscribe** ile şunlara abone olun:
   - `messages`: **zorunlu** (teslim, okundu ve gelen "RET" mesajları bununla gelir)
   - `message_template_status_update`, `phone_number_quality_update`, `business_capability_update`,
     `user_preferences`: önerilir (şablon durumu, kalite, limit ve "pazarlama mesajlarını durdur" tercihi)

### 4c. Kurulum adımları (uygulamada, sırayla)

Ayarlar → WhatsApp (Meta) sayfasının üstündeki **Kurulum adımları**:

1. **Meta Business hesabını bağlayın**: 4a'daki **Kaydet** başarılı olunca "Tamamlandı" olur. Sonra üstteki
   **Bağlantıyı test et**'e de basın (numara, kalite ve limit okunur).
2. **Bildirim adresini doğrulayın**: önce adımdaki **Bildirim aboneliğini etkinleştir** düğmesine basın (hesabınızı bu
   uygulamanın bildirimlerine abone eder). 4b'de Meta adresi doğrulayınca adım "Tamamlandı" olur; sayfayı yenileyin.
3. **Test numaranıza bir kampanya gönderin**: 5. bölüm. Meta'dan imzalı teslim bildirimi gelince kendiliğinden tamamlanır.
4. **Test modunu kapatın**: 2. ve 3. adım tamamlanınca açılır. **Şimdi kapatmayın** (6. bölüm).

---

## 5. Test kampanyası

### 5a. Şablon

1. Ayarlar → WhatsApp (Meta) → **Mesaj şablonları** → **Meta'dan yenile**.
2. Listede `hello_world` (dil `en_US`) görünür. Yanında **Kullanılabilir** ya da **Kullanılamaz** yazar.

**hello_world bizim kurallarımıza göre:** başlık (metin) "Hello World", gövde ve altbilgi metinleri var; değişken ve
buton yok. Uygulamanın kuralları: şablon onaylı olmalı; medya başlık, dinamik URL butonu gibi parçalar desteklenmez;
**Pazarlama (Marketing) kategorisindeki şablonda abonelikten çıkma (hızlı yanıt) butonu zorunludur.** Bu yüzden:

- `hello_world` **Hizmet (Utility)** kategorisindeyse → **kullanılabilir**, doğrudan 5b'ye geçin.
- **Pazarlama** kategorisindeyse → **kullanılamaz** ("Pazarlama şablonunda abonelikten çıkma (hızlı yanıt) butonu yok").

`hello_world`'ün kategorisini resmi belgede **doğrulayamadım**; uygulamadaki listede yazar. Kullanılamazsa:

1. business.facebook.com → **WhatsApp Manager** → **Message templates** → yeni şablon **(doğrulanamadı:** menü adları).
2. Kategori **Marketing**, dil Türkçe, kısa bir gövde (ör. "Merhaba, bu bir deneme mesajıdır.").
3. **Buton** olarak "Marketing opt-out" türünü ya da metni **"Durdur"** veya **"Abonelikten çık"** olan bir hızlı yanıt
   (Quick reply) butonu ekleyin. Uygulama "stop", "durdur", "abonelik", "çık", "iptal", "ret" gibi metinleri çıkış
   butonu sayar.
4. Gönderin, onay gelince (birkaç dakika sürebilir) uygulamada **Meta'dan yenile**. Şablon "Kullanılabilir" olmalı.

### 5b. Kampanyayı gönderme

1. **Üçüncü bir terminalde gönderim işçisini açın** (mesajları o gönderir):

   ```
   npm run worker
   ```

2. **Kampanyalar → Yeni kampanya** (ya da kurulum 3. adımındaki **Test kampanyası oluştur**):
   - **1 Kanal:** WhatsApp (API) → **İleri**.
   - **2 Alıcılar:** kampanya adı (ör. "İlk deneme"), Durum ve Alıcı türü "Tümü" → **İleri**.
   - **3 Mesaj:** şablonu seçin (`hello_world` ya da kendi şablonunuz) → **Gönderim özetini göster**.
   - **4 Gönder:** "Test modu açık" notu ve **1 alıcı** (siz) görünmeli. **"Test: Meta'ya gönderme…" kutusunu
     işaretlemeyin** (işaretlerseniz Meta'ya gitmez, kurulum 3. adımı tamamlanmaz) → **Kampanyayı başlat**.
3. Gönderim saatleri dışındaysanız (varsayılan 09:00–20:00, Ayarlar → Saatler ve sınırlar) mesaj saat gelene kadar
   kuyrukta bekler.

**Ne görmelisin:**

- Telefonunuza şablon mesajı gelir.
- Kampanya ayrıntısında satır "Gönderildi", birkaç saniye sonra "Teslim edildi" (ve okuyunca "Okundu") olur.
- Ayarlar → WhatsApp (Meta) → Kurulum adımları 3: "Tamamlandı · Meta'dan imzalı bir teslim bildirimi alındı".

### 5c. RET denemesi

1. Telefonunuzdan, gelen mesaja yanıt olarak yalnızca **RET** yazın. (DUR, İPTAL, STOP, ÇIK da olur; büyük/küçük harf
   önemsiz. "İptal etmek istemiyorum" gibi cümleler ret sayılmaz.)
2. Kayıtlar'da kendinizi açın → **İletişim izni**.

**Ne görmelisin:** İleti izni kırmızı **Ret · <tarih> · …** olur; açıklamada WhatsApp'tan ret yazıldığı görünür. Ret **geri alınamaz**; bu kayda bir
daha hiçbir kanaldan gönderim yapılmaz. Tekrar denemek isterseniz başka bir numara gerekir (ya da `gercek-test.db`'yi
silip 0. adımdaki migration'ı yeniden çalıştırmak: `npm run db:migrate`; o zaman her şeye baştan başlarsınız).

---

## 6. Test modunu kapatma (yalnızca deneme sonrası)

Kurulum adımları 2 ve 3 tamamlanınca **Test modunu kapat** düğmesi görünür. **Gönderen bilgileri** (unvan, iletişim
bilgisi, İYS numarası, sorumluluk beyanı) eksikse düğme pasif kalır ve neyin eksik olduğu yazar; Ayarlar → Gönderen
bilgileri'ni tamamlayınca açılır. Kapatınca kampanyalar test numaraları dışındaki **herkese** gider ve her kampanya
gönderen bilgilerini ister. Bu yüzden:

- **Gerçek müşteri kaydı yokken** ve yalnızca kurulumu bitirmek için kapatın; ya da hiç kapatmayın.
- Meta'nın test numarası zaten yalnızca alıcı listesine gönderir; gerçek müşterilere göndermek için kendi işletme
  numaranızı Meta'ya eklemeniz gerekir (bu rehberin dışında).
- İstediğiniz zaman **Test modunu yeniden aç** ile geri açabilirsiniz.

---

## 7. Sık hatalar ve çözümleri

| Gördüğünüz | Neden | Çözüm |
|---|---|---|
| **Bağlantıyı test et** ya da gönderim "erişim anahtarı geçersiz / süresi dolmuş" gibi bir hata veriyor | Geçici anahtarın süresi doldu | API Setup → **Generate access token** → uygulamada **Erişim anahtarı**'na girip **Kaydet**. Kalıcı çözüm: system user anahtarı (2e). |
| Teslim bildirimi gelmiyor; kurulum 2. ya da 3. adımı ilerlemiyor | Tünel kapandı ya da yeniden açıldı, adres değişti | `npm run tunel` açık mı bakın. Yeni adresi `GENEL_ADRES`'e yazın, uygulamayı yeniden başlatın, Meta'da **Callback URL**'yi güncelleyip **Verify and save** (3b). |
| Kampanya **Duraklatıldı**; Ayarlar ve Panel'de kırmızı "Meta WhatsApp hesabınız kilitlendi" uyarısı; teslim bildiriminde hata kodu `131031` | Meta, WhatsApp Business hesabını politika nedeniyle kısıtladı ya da kapattı (`368` de aynı anlama gelir). Uygulama tüm WhatsApp kampanyalarını durdurur; kuyruktaki mesajlar bekler, tekrar denenmez | Meta Business Suite > Business Support Home'dan nedenini görüp inceleme isteyin. Kilit kalkınca uygulamada **Bağlantıyı test et** (Meta hâlâ "gönderime kapalı" diyorsa test başarısız olur ve kilit kalır); başarılı olursa kampanya ayrıntısında **Devam ettir**. |
| Aynı uyarı "ödeme sorunu" diyor, hata kodu `131042` | WhatsApp hesabının ödeme yöntemi tanımlı değil, kredi limiti doldu ya da hesap askıya alındı | Meta Business Suite'te WhatsApp hesabının ödeme yöntemini kontrol edin; sonra **Bağlantıyı test et** ve **Devam ettir**. |
| Kampanyada satır **Başarısız**, hata kodu `131030` | Numaranız Meta'daki test numarası alıcı listesinde değil | API Setup → **To** listesine numaranızı ekleyip doğrulayın (2c), kampanyayı yeniden oluşturun. |
| Kampanya özetinde 0 alıcı, neden "Test modu: test numarası değil" | Numaranız uygulamadaki **Test numaraları**'nda yok | Ayarlar → WhatsApp (Meta) → Test numaraları'na ekleyin. |
| Özette neden "WhatsApp izni yok" ya da "Bireysel; İYS beyanı yok" | Kaydınızda izin ya da İYS beyanı eksik | 1. bölüm, 6. adım. |
| "Gerçek gönderim için Ayarlar → Ticari ileti bölümünü tamamlayın" | Test modu kapalı ve gönderen bilgileri eksik (test modunda bu uyarı çıkmaz) | Ayarlar → Gönderen bilgileri'ni tamamlayın ya da test modunu yeniden açın. |
| **Test modunu kapat** düğmesi pasif | Gönderen bilgileri eksik (eksikler adımın altında yazar) | Ayarlar → Gönderen bilgileri. |
| Tünel adresini tarayıcıda açınca "Bulunamadı." | Tünel koruması: tünelden yalnızca bildirim adresi açıktır | Beklenen durum; arayüzü localhost:3000'den kullanın. |
| Şablon kampanyada görünmüyor ya da **Kullanılamaz** | Şablon onaylı değil; Pazarlama şablonunda abonelikten çıkma butonu yok; medya başlık / dinamik URL butonu gibi desteklenmeyen parça var | Nedeni şablon satırında yazar. Yeni şablon: 5a. Meta'da değişiklik yaptıysanız **Meta'dan yenile**. |
| Meta'da **Verify and save** "doğrulanamadı" diyor | Uygulama ya da tünel kapalı; Callback URL eski / yanlış kopyalandı; verify token yanlış; `GENEL_ADRES` değişip uygulama yeniden başlatılmadı | Uygulama ve `npm run tunel` açık olsun; adresi ve anahtarı uygulamadan **Kopyala** ile yeniden alın. Anahtarı kaybettiyseniz **Yenile** ile yenisini üretip Meta'ya girin. |
| Bildirim adresi hâlâ `http://localhost:3000/…` | `GENEL_ADRES` boş, `https://` ile başlamıyor ya da uygulama yeniden başlatılmadı | `.env.local`'de `GENEL_ADRES=https://…trycloudflare.com`, sonra uygulamayı yeniden başlatın. Geçersiz değer terminalde uyarıyla yok sayılır. |
| "Numara bu WhatsApp Business hesabına ait değil" | WABA ID ile Phone Number ID aynı hesaptan değil | API Setup'tan ikisini yeniden kopyalayın (2b'deki nota bakın). |
| Kampanya "Kuyrukta" kalıyor | Gönderim işçisi kapalı ya da gönderim saatleri dışında | `npm run worker` açık olsun; Ayarlar → Saatler ve sınırlar. |

