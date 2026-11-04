# Ofis günü: Bursa Ofset Meta hesabıyla WhatsApp denemesi

Bu rehber, babamın Meta işletme hesabında (**Bursa Ofset**) bir günlük WhatsApp denemesini sırayla anlatır. Ayrıntılı
ekran açıklamaları ve sık hatalar için [GERCEK-KURULUM.md](GERCEK-KURULUM.md); bu belge onu ofis gününe göre sıralar.

**Günün kuralları**

- **Test modu bütün gün açık kalır.** Ayarlar → WhatsApp (Meta) → Kurulum adımlarındaki **Test modunu kapat**'a
  basılmaz. Uygulama yalnızca **Test numaraları** listesindeki numaralara gönderir.
- Mesajlar Meta'nın verdiği **test numarasından** gider. Bursa Ofset'in gerçek WhatsApp numarası bu denemede Meta'ya
  eklenmez, müşterilere hiçbir mesaj gitmez.
- Veritabanı `data/gercek-test.db`'dir; `app.db` ve `demo.db` kullanılmaz.
- Tokenlar, App Secret ve doğrulama anahtarı **yalnızca uygulamadaki alanlara** girilir. Not defterine, sohbete ya da
  ekran görüntüsüne konmaz.

> Meta menü adları İngilizce yazıldı; Türkçe arayüzde farklı görünebilir. **(doğrulanamadı)** yazan yerlerde ekranda
> gördüğünüze göre ilerleyin (kaynaklar GERCEK-KURULUM.md'nin başında).

---

## 0. Önceki akşam: kendi bilgisayarımda

1. Proje klasöründe terminal (VS Code → Terminal → New Terminal):

   ```
   npm run hazirlik -- --tam
   ```

   Her madde ✓ olmalı. **Yalnızca "WhatsApp bağlantısı yok" ✗ kalabilir;** bağlantı ofiste kurulacak. Komut Google'a
   tek bir **ücretsiz** istek atar (kotadan düşmez), Meta'ya hiç gitmez, hiçbir gizli değeri yazmaz.

2. Bu ayki harcamayı not edin; gün sonunda karşılaştıracaksınız:

   ```
   npm run kullanim -- harita-crm-test
   ```

3. Yanınıza: şarj aleti; kendi telefonunuz (Meta'nın doğrulama kodu WhatsApp'tan gelir); denemede kullanılacak
   numaralar (sizin ve babanızın cep numarası). Test numarası en fazla 5 alıcıya gönderir.

| Olası hata | Çözüm |
|---|---|
| `cloudflared kurulu ama bu terminal onu bulamıyor (PATH)` | VS Code'u tamamen kapatıp açın. |
| `cloudflared kurulu değil` | PowerShell: `winget install --id Cloudflare.cloudflared`, sonra terminali yeniden açın. |
| `3000 portu dolu` | Açık kalan `npm run dev` terminalinde `Ctrl + C`. |
| `Places anahtarı çalışmıyor` | Çıktıdaki Türkçe nedene bakın (faturalandırma, API etkin değil, kısıtlama). `npm run places:dogrula` aynı denemeyi tek başına yapar. |
| `N migration uygulanmamış` | Uygulama ve işçi kapalıyken `npm run db:migrate` (önce yedek alır). |
| `typecheck geçmedi` / `Testler geçmedi` | Ofise gitmeden düzeltin; ofiste kod değiştirmeyin. |

---

## 1. Ofiste: uygulamayı açma

1. Uygulamayı açmadan önce bir kez daha `npm run hazirlik` (port boşken). Ofisin ağında Places denemesi ✓ olmalı.
2. `npm run dev` → tarayıcıda **http://localhost:3000** → kendi hesabınızla giriş.

| Olası hata | Çözüm |
|---|---|
| Places ✗ "Places API'ye ulaşılamadı (ağ / DNS / vekil sunucu)" | Ofis ağı engelliyor olabilir; telefonun hotspot'una bağlanıp yeniden deneyin. |
| `npm run dev` "port 3000 is in use" deyip 3001'e geçiyor | O terminali kapatın (`Ctrl + C`), 3000'i kullanan süreci kapatıp yeniden başlatın. 3001'de giriş çalışmaz. |

---

## 2. Meta: uygulama oluşturma ve beni geliştirici ekleme

Babanız kendi Facebook hesabıyla giriş yapar; Bursa Ofset işletme portföyünde (business portfolio) yönetici olmalıdır.

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App**. (Geliştirici kaydı yoksa önce
   kısa bir kayıt ister.)
2. Uygulama adı (ör. "Harita CRM deneme") ve iletişim e-postası.
3. Kullanım durumu (use case): **Connect with customers through WhatsApp** → **Next**.
4. İşletme portföyü olarak **Bursa Ofset**'i seçin → **Next** → **Create app** (Facebook şifresini isteyebilir).
5. Beni geliştirici ekleyin: App Dashboard → **App roles** → **Roles** → **Add People** → **Developer** → benim Facebook
   adım ya da kullanıcı adım **(doğrulanamadı:** menü adları). Ben kendi hesabımdan
   [developers.facebook.com/requests](https://developers.facebook.com/requests)'te daveti kabul ederim **(doğrulanamadı)**.

| Olası hata | Çözüm |
|---|---|
| Portföy listesinde Bursa Ofset yok | Babanız portföyde yönetici değil ya da başka bir Facebook hesabıyla girdi. business.facebook.com → İşletme ayarları → Kişiler'den yetkisine bakın. |
| "Create App" hesap doğrulaması / telefon istiyor | Meta'nın istediği doğrulamayı babanız kendi telefonuyla tamamlar. |
| Geliştirici daveti görünmüyor | Davet benim Facebook hesabıma gitmeli; adı doğru seçildi mi bakın. Davet beklerken babanın oturumuyla devam edilebilir. |

---

## 3. API Setup: test numarası ve kimlikler

1. Uygulama açılınca **Customize use case → Connect on WhatsApp → Quickstart** → **Start using the API** → **API Setup**.
2. WhatsApp hesabı yoksa **Create a WhatsApp Business account**. Meta bir **test numarası** verir.
3. Not alın (gizli değildir): **Phone Number ID** (test numarasının kimliği) ve **WABA ID** (Messaging account ID /
   WhatsApp Business Account ID).

| Olası hata | Çözüm |
|---|---|
| Test numarası görünmüyor | Sayfayı yenileyin; **From** listesinde olmalı. Hâlâ yoksa portföy seçimini kontrol edin. |
| Bursa Ofset'in gerçek numarasını ekleme önerisi çıkıyor | **Eklemeyin.** Bu deneme yalnızca test numarasıyla yapılır. |

---

## 4. App settings → Basic: gizlilik adresi ve App Secret

1. App Dashboard → **App settings** → **Basic**.
2. **Privacy Policy URL**: `https://cagricelikkoll.github.io/gizlilik.html` → **Save changes**.
3. **App secret** → **Show** (Facebook şifresini ister). Bu değer 7. adımda uygulamaya girilecek; başka yere yazmayın.

| Olası hata | Çözüm |
|---|---|
| Kaydederken "URL'ye ulaşılamadı" | Adresi tarayıcıda açın; sayfa açılmıyorsa GitHub Pages yayında mı bakın. Adresi elle yazmak yerine kopyalayın. |
| Kaydet başka zorunlu alan istiyor (kategori, simge vb.) | İstenen alanı doldurun; deneme için uygulamayı **Live** yapmak gerekmez. |

---

## 5. Sistem kullanıcısı ve kalıcı token

Geçici token birkaç saatte dolar; gün boyu sürmesi için sistem kullanıcısı (system user) tokenı kullanılır.

1. [business.facebook.com](https://business.facebook.com) → Bursa Ofset → **İşletme ayarları (Business settings)** →
   **Users → System users** → **Add** → ad (ör. "harita-crm-deneme"), rol **Employee** **(doğrulanamadı:** rol adı).
2. Sistem kullanıcısını seçin → **Assign assets**:
   - **Apps** → bu uygulama → **Manage app** (Full control),
   - **WhatsApp accounts** → 3. adımdaki hesap → **Manage WhatsApp Business accounts** (Full control).
3. **Generate token** → uygulamayı seçin → süre **Never** → izinler yalnızca:
   - `whatsapp_business_messaging` (mesaj gönderme),
   - `whatsapp_business_management` (numara ve şablonları okuma).
4. Token bir kez gösterilir. **Doğrudan** 7. adımda uygulamanın **Erişim anahtarı** alanına yapıştırın. Bir yere not
   almayın; kaybolursa yenisi üretilir.

| Olası hata | Çözüm |
|---|---|
| Uygulama "Assign assets"te görünmüyor | Uygulama Bursa Ofset portföyüne bağlı değil (2. adım 4). App settings → Basic'te portföyü kontrol edin. |
| Token izin listesinde `whatsapp_business_*` yok | 2. adımda WhatsApp hesabı atanmadı; atayıp yeniden **Generate token**. |
| Daha sonra "erişim anahtarı geçersiz" | Token yanlış kopyalandı ya da iptal edildi: yeni token üretip 7. adımda yeniden girin, **Kaydet**. |

---

## 6. Test numaralarının eklenmesi (Meta tarafı)

1. API Setup → **To** → **Manage phone number list** → sizin ve babanızın numarası (ülke koduyla, +90 5xx …).
2. Her numaraya WhatsApp'tan gelen doğrulama kodunu girin. En fazla 5 numara **(doğrulanamadı:** sayı).

| Olası hata | Çözüm |
|---|---|
| Doğrulama kodu gelmiyor | Numarada WhatsApp kurulu mu, +90 ile mi yazıldı bakın; birkaç dakika sonra yeniden isteyin. |
| Sonradan gönderimde hata kodu `131030` | Numara bu listede yok ya da doğrulanmadı. |

---

## 7. Tünel, GENEL_ADRES ve uygulamada WhatsApp bağlantısı

**Tünel** (Meta'nın teslim ve RET bildirimleri için):

1. `npm run dev` açıkken **ikinci** terminalde `npm run tunel`. Çıktıdaki `https://…trycloudflare.com` adresini kopyalayın.
2. `.env.local` → `GENEL_ADRES=https://…trycloudflare.com` → ilk terminalde `Ctrl + C` → `npm run dev`.
3. Tünel adresi tarayıcıda "Bulunamadı." der; bu normaldir (tünelden yalnızca bildirim adresi açık). Arayüz
   localhost'tan kullanılır. Tünel adresini kimseyle paylaşmayın.

**Uygulama:** **Ayarlar → WhatsApp (Meta)** → **Hesap kimlikleri, erişim anahtarı, bildirim adresi** (teknik ayrıntılar):

| Alan | Değer |
|---|---|
| WhatsApp hesap kimliği (WABA ID) | 3. adım |
| Telefon numarası kimliği (Phone Number ID) | 3. adım |
| Erişim anahtarı | 5. adımdaki token |
| Uygulama gizli anahtarı (App Secret) | 4. adım |

1. **Kaydet** → "Bağlantı kaydedildi." Uygulama numaranın bu hesaba ait olduğunu Meta'dan doğrular.
2. **Doğrulama anahtarı (verify token) yalnızca şimdi gösteriliyor**: kopyalayın (Meta'ya girilecek).
3. **Bildirim adresi**: `https://…trycloudflare.com/api/whatsapp/webhook/…` ile başlamalı; **Kopyala**.
4. **Test numaraları** → **Eklenecek test numarası**: 6. adımdaki numaralar (Meta listesinden ayrı ikinci kilit).
5. Üstte **Bağlantıyı test et** → "Bağlantı çalışıyor."; **Kurulum adımları** → **Bildirim aboneliğini etkinleştir**.

**Meta: webhook doğrulama**

1. App Dashboard → **Use cases** → WhatsApp → **Customize** → **Configuration**.
2. **Callback URL** = bildirim adresi, **Verify token** = doğrulama anahtarı → **Verify and save**.
3. **Webhook fields**: `messages` → **Subscribe** (zorunlu). İsteğe bağlı: `message_template_status_update`,
   `phone_number_quality_update`, `user_preferences`.
4. Uygulamada sayfayı yenileyin: Kurulum adımları 2 "Tamamlandı" olmalı.

Kontrol: `npm run hazirlik` (port dolu ✗ bu sırada normaldir) → WhatsApp bağlantısı ✓, Test modu açık ✓, Meta hesap
kilidi yok ✓.

| Olası hata | Çözüm |
|---|---|
| Kaydet: "Numara bu WhatsApp Business hesabına ait değil" | WABA ID ile Phone Number ID farklı hesaplardan. API Setup'tan ikisini yeniden kopyalayın. |
| Kaydet: token geçersiz | 5. adımı tekrarlayın; tokenın başında/sonunda boşluk olmasın. |
| Bildirim adresi hâlâ `http://localhost:3000/…` | `GENEL_ADRES` boş ya da uygulama yeniden başlatılmadı. |
| **Verify and save** "doğrulanamadı" | Uygulama ve tünel açık mı; adres ve anahtarı uygulamadan **Kopyala** ile yeniden alın. Anahtar kaybolduysa yanındaki **Yenile** ile yenisini üretip Meta'ya girin. |
| Gün içinde tünel kapandı / bilgisayar uyudu | Adres değişir: `npm run tunel` → yeni adresi `GENEL_ADRES`'e → uygulamayı yeniden başlat → Meta'da Callback URL'yi güncelleyip **Verify and save**. |

---

## 8. Pazarlama şablonu (abonelikten çıkma düğmeli)

1. business.facebook.com → **WhatsApp Manager** → **Message templates** → **Create template** **(doğrulanamadı:**
   menü adları).
2. Kategori **Marketing**, dil **Turkish**, ad küçük harf ve alt çizgiyle (ör. `bursa_ofset_deneme`).
3. Gövde: kısa ve değişkensiz, ör. "Merhaba, Bursa Ofset'ten bir deneme mesajıdır."
4. **Buttons** → **Marketing opt-out** ya da metni **"Durdur"** olan bir **Quick reply**. Uygulama Pazarlama
   şablonunu bu düğme olmadan kullanmaz.
5. **Submit**. Onay genellikle dakikalar sürer, bazen saatler. Beklerken 10. adıma (tarama) geçin.
6. Onay gelince uygulamada Ayarlar → WhatsApp (Meta) → **Mesaj şablonları** → **Meta'dan yenile** → "Kullanılabilir".

| Olası hata | Çözüm |
|---|---|
| Şablon "Kullanılamaz: abonelikten çıkma (hızlı yanıt) butonu yok" | Düğmeyi ekleyip yeni şablon gönderin. |
| Şablon reddedildi | Gövdeyi sadeleştirin (bağlantı, indirim vaadi, büyük harf yok), yeni adla gönderin. |
| Onay gün içinde gelmedi | `hello_world` **Kullanılabilir** görünüyorsa onunla deneyin (GERCEK-KURULUM.md 5a). |

---

## 9. Test numarasına kampanya ve RET denemesi

1. **Kayıtlar → Kişi ekle**: ad, telefon (6. adımdaki numaralardan biri), Alıcı türü **Bireysel (kişi)** → **Kaydet**.
   Açılan ayrıntıda **İletişim izni** → WhatsApp izni **Düzenle** → **İzin var**, kaynak "Sözlü", bugünün tarihi,
   **"Bu izin İYS'ye kaydedildi."** → **Kaydet**. (Numarası kullanılan kişiden sözlü izin alın.)
2. Üçüncü terminalde `npm run worker` (mesajları o gönderir).
3. **Kampanyalar → Yeni kampanya**: **1 Kanal** WhatsApp (API) → **2 Alıcılar** → **3 Mesaj** (8. adımdaki şablon) →
   **Gönderim özetini göster** → **4 Gönder**: "Test modu açık" ve alıcı sayısı görünmeli. "Test: Meta'ya
   gönderme…" kutusunu **işaretlemeyin** → **Kampanyayı başlat**.
4. Telefona mesaj gelir; kampanya ayrıntısında "Gönderildi" → "Teslim edildi". Kurulum adımları 3 "Tamamlandı" olur.
5. **RET:** telefondan yanıt olarak yalnızca `RET` yazın. Kayıtlar'da kişi → **İletişim izni** kırmızı **Ret** olmalı.
   Ret geri alınamaz; o numaraya bir daha hiçbir kanaldan gönderilmez. RET'i yalnızca bir numarada deneyin.

| Olası hata | Çözüm |
|---|---|
| Özette 0 alıcı: "Test modu: test numarası değil" | Numarayı Ayarlar → WhatsApp (Meta) → Test numaraları'na ekleyin. |
| Özette "WhatsApp izni yok" / "Bireysel; İYS beyanı yok" | 1. maddedeki izin ve beyanı tamamlayın. |
| Kampanya "Kuyrukta" kalıyor | `npm run worker` açık mı; saat Ayarlar → Saatler ve sınırlar'daki pencerede mi (varsayılan 09:00–20:00). |
| Satır Başarısız, kod `131030` | Numara Meta'nın alıcı listesinde değil (6. adım). |
| "Teslim edildi" olmuyor, RET işlenmiyor | Tünel kapalı ya da adresi değişti (7. adım son satır). |
| Kampanya **Duraklatıldı**, "Meta WhatsApp hesabınız kilitlendi" (`131031`, `368`, `131042`) | Göndermeyi bırakın; babanız Business Support Home'dan nedene baksın. Kilit kalkınca **Bağlantıyı test et** ve **Devam ettir**. |

---

## 10. Babanın kendi taraması ve geri bildirim

1. Babanız benim bilgisayarımda, benim oturumumla kullanır (ayrı hesap açılmaz).
2. **Bölge tara**: haritada Bursa'da bir nokta (ya da adres), yarıçap, kategori → **Taramayı başlat**. Sonuçlarda
   ilgilendiklerini Kayıtlar'a ekler, birkaç kaydın ayrıntısını açar.
3. Gerçek Google isteğidir ve kotadan düşer; gün sonunda `npm run kullanim -- harita-crm-test` ile 0. adımdaki değerle
   karşılaştırın. Arayüzdeki yüzde %80'e gelirse liste "Göster" ile çalışır; bu beklenen davranıştır.
4. Geri bildirim notları (kâğıda ya da bir metin dosyasına): neyi kolay buldu, nerede takıldı, hangi bilgi eksikti,
   hangi kategoriler işine yarar, mesaj şablonunda neyi değiştirirdi.

| Olası hata | Çözüm |
|---|---|
| "Bu ayki veri kotanız doldu." | Denemeyi durdurun; kotayı artırmak bugün gerekmez. |
| Harita yerine "Harita yüklenemedi" | Tarayıcı anahtarının referrer kısıtlaması localhost'u içermiyor olabilir; enlem/boylam alanlarıyla devam edin. |

---

## 11. Gün sonu

1. `npm run worker`, `npm run tunel` ve `npm run dev` terminallerinde `Ctrl + C` (bu sırayla).
2. `.env.local` → `GENEL_ADRES=` (boş). Tünel adresi kapandı; bir sonraki açılışta yenisi alınır.
3. `npm run kullanim -- harita-crm-test`: günün harcaması.
4. **Token nerede?** Yalnızca uygulamanın veritabanında: `data/gercek-test.db` → `whatsapp_baglantilari.sifreli_veri`,
   AES-256-GCM ile şifreli (anahtar `.env.local`'deki `ILETI_SIFRELEME_ANAHTARI`). App Secret ve doğrulama anahtarı da
   aynı yerde. `.env.local`'de, git'te ya da çıktılarda yoktur. `npm run db:migrate` alınmışsa `data/yedek/`'teki
   yedeklerde de şifreli kopyası bulunur. Meta tarafında token, iptal edilene kadar geçerlidir (aşağıda).

---

## 12. Onay, erişilen veriler ve geri alma

### Onay

Deneme, Bursa Ofset adına babamın açık onayıyla yapılır. Ofiste, başlamadan önce:

- [ ] Babama bu belgenin "Erişilen veriler" ve "Geri alma" bölümleri anlatıldı.
- [ ] Bursa Ofset portföyünde uygulama, sistem kullanıcısı ve token oluşturulmasına onay verdi.
- [ ] Hangi numaralara mesaj gideceği (yalnızca test numaraları) ve RET denemesi konuşuldu.
- [ ] Onay yazılı olarak alındı (ör. babamın WhatsApp'tan "onaylıyorum" mesajı). Tarih: ____________

### Erişilen veriler

| Nerede | Neye erişildi | Saklanan |
|---|---|---|
| Meta (Bursa Ofset portföyü) | Yeni uygulama, test numarası ve WhatsApp hesabı; bu hesabın numara bilgisi (görünen numara, kalite, limit) ve şablonları; gönderdiğimiz mesajların durum bildirimleri ve test numaralarından gelen yanıtlar | Numara bilgisi, şablonlar, mesaj durumları, RET kaydı (`gercek-test.db`) |
| Token yetkisi | Yalnızca `whatsapp_business_messaging` ve `whatsapp_business_management` | Şifreli token |
| **Erişilmeyenler** | Bursa Ofset'in WhatsApp Business uygulamasındaki sohbetler, müşteri listesi, reklam hesabı, ödeme bilgileri, portföydeki diğer kişiler | — |
| Google Places | Bursa'daki işletmelerin herkese açık bilgileri | Yalnızca yer kimlikleri (place_id) ve eklenen kayıtlar; ad, adres ve telefon saklanmaz |
| Uygulama | Test numaraları ve izin bilgileri (Kayıtlar) | `gercek-test.db`, yalnızca benim bilgisayarımda |

### Testten sonra geri alma

1. **Uygulamada:** Ayarlar → WhatsApp (Meta) → **Bağlantıyı kaldır** → onay. Bağlantı ve kayıtlı gizli bilgiler
   (token, App Secret, doğrulama anahtarı, test numaraları) silinir.
2. **Token iptali:** business.facebook.com → İşletme ayarları → **Users → System users** → sistem kullanıcısı →
   **Revoke tokens** **(doğrulanamadı:** düğme adı), ya da sistem kullanıcısını **Remove** ile silin. Token o anda
   geçersiz olur.
3. **Uygulamayı silme:** App Dashboard → **App settings → Basic** → sayfanın en altı → **Delete app** **(doğrulanamadı)**.
   Uygulamanın tüm tokenları ve webhook'u geçersiz olur; geliştirici rolüm de uygulamayla birlikte gider.
4. **Şablon:** WhatsApp Manager → Message templates → deneme şablonu → **Delete** (isteğe bağlı).
5. **Benim tarafımda:** deneme kayıtlarını Kayıtlar'dan silin. Bütün izleri silmek için uygulama kapalıyken
   `data/gercek-test.db` (ve `-wal`, `-shm`) ile `data/yedek/gercek-test-*.db` yedeklerini silin, sonra
   `npm run db:migrate` ile boş veritabanı oluşturun.
6. Babama hangi adımların yapıldığını yazılı olarak bildirin (ör. "Uygulama silindi, token iptal edildi, veriler
   silindi"). Tarih: ____________
