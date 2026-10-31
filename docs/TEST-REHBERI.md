# Elle deneme rehberi

Bu rehber, uygulamayı **kendi bilgisayarınızda, sahte verilerle** adım adım denemeniz içindir. Teknik bilgi
gerekmez; komutları olduğu gibi kopyalayıp yapıştırmanız yeterli.

Her adımda iki şey yazıyor:

- **Ne yap:** sizin yapacağınız şey.
- **Ne görmelisin:** doğru çalışıyorsa ekranda göreceğiniz şey. Farklı bir şey görürseniz adımın yanına not alın.

Kutucukları (`[ ]`) denedikçe işaretleyebilirsiniz.

> **Güvenli mi?** Evet. Demo ortamı ayrı bir veritabanı (`data/demo.db`) kullanır; gerçek veritabanınıza ve
> `.env.local` dosyanızdaki ayarlara dokunmaz. Google ve WhatsApp'a hiç bağlanmaz, ücret oluşmaz. E-posta ve SMS
> kampanyaları "sandbox" modunda çalışır: hiçbir mesaj gerçekten gönderilmez, yalnızca kaydedilir.
> Demoya **gerçek kişi bilgisi girmeyin.**

---

## 0. Hazırlık (bir kez)

**Ne yap:**

1. Proje klasöründe bir terminal açın (VS Code'da: üst menü → Terminal → New Terminal).
2. Normal uygulama (`npm run dev`) açıksa o terminalde `Ctrl + C` ile kapatın. İkisi aynı adresi (3000) kullanır.
3. Paketler kurulu değilse bir kez şunu çalıştırın:

   ```
   npm install
   ```

**Ne görmelisin:** Komut hatasız biter (sarı "warning" satırları sorun değildir).

---

## 1. Demo ortamını kur

**Ne yap:** Terminalde şunu çalıştırın:

```
npm run demo:hazirla
```

**Ne görmelisin:** Birkaç saniye sonra şuna benzer bir özet:

```
Demo ortamı hazır: ...\data\demo.db
  Çalışma alanı : Demo Emlak (Sahte Veri)
  Kayıt         : 17 (10 Google kaynaklı örnek taramadan, 7 elle / içe aktarma / reklam)
  ...
Giriş bilgileri (http://localhost:3000/giris):
  Yönetici : yonetici@demo.test   parola: Demo-Yonetici-2026
  Üye      : uye@demo.test         parola: Demo-Uye-2026!
```

- [ ] Özet göründü, giriş bilgileri yazıldı.

Bu komutu **istediğiniz zaman** yeniden çalıştırabilirsiniz. Her çalıştırmada demo sıfırdan kurulur ve
yaptığınız bütün denemeler silinir. Uygulama açıkken çalıştırırsanız "demo.db kullanımda" der. Önce uygulamayı
(`Ctrl + C`) kapatın.

### Demoda neler var?

| Ne | Ayrıntı |
|---|---|
| Çalışma alanı | "Demo Emlak (Sahte Veri)" |
| Kullanıcılar | **Yönetici:** `yonetici@demo.test` / `Demo-Yonetici-2026`<br>**Üye:** `uye@demo.test` / `Demo-Uye-2026!` |
| Google kaynaklı kayıtlar | Kadıköy'de sahte bir "emlak ofisi" taramasından gelen 10 kayıt. Adları, adresleri ve telefonları sahte istemcinin uydurduğu değerlerdir (ör. "Yıldız Emlak"). |
| Elle eklenen ve içe aktarılan kayıtlar | Örnek Kırtasiye, Sahte Fırın, Hayali Kuaför, Kurgu Oto Servis, Örnek Bireysel Müşteri |
| Reklamdan gelen kişi | Reklamdan Gelen Deneme Kişi |
| Ret verilmiş kayıt | "Ret Vermiş Örnek İşletme" (0500 000 00 09, `ret.ornek@demo.test`) |
| WhatsApp | Sahte bağlantı (test modunda), 3 onaylı şablon. Test numarası: **0500 000 00 01** (Örnek Kırtasiye). |
| Sınırlar (demo için düşük) | Günde en fazla 5 e-posta ve 5 SMS. Places kotası ayda 1.000 birim. |

Bütün telefonlar `0500 000 00 xx` biçiminde, bütün e-postalar `@demo.test` uzantılıdır. Bunlar gerçek kişilere
ait değildir.

---

## 2. Uygulamayı başlat

**Ne yap:** Aynı terminalde:

```
npm run demo
```

Terminalde "Ready" yazısını görünce tarayıcıda **http://localhost:3000** adresini açın. Bu terminal açık kalmalı;
kapatırsanız uygulama durur.

**Ne görmelisin:**

- Terminalin ilk satırında `[demo] ...\data\demo.db · Places ve WhatsApp sahte istemcilerle` yazar.
- Tarayıcıda giriş ekranı açılır. Bir sayfanın ilk açılışı birkaç saniye sürebilir; bu normaldir.

- [ ] Giriş ekranı açıldı.

---

## 3. Giriş: yönetici ve üye farkı

### 3a. Yönetici olarak giriş

**Ne yap:** `yonetici@demo.test` / `Demo-Yonetici-2026` ile **Giriş yap**'a basın.

**Ne görmelisin:**

- **Panel** sayfası açılır: durum hunisi, son taramalar ve Places kullanımı.
- Sol menüde **Panel, Bölge taraması, Kayıtlar, İletişim, Ayarlar** vardır.

- [ ] Yönetici girişi çalıştı.

### 3b. Yanlış parola

**Ne yap:** Çıkış yapın (ya da bir gizli pencere açın). Doğru e-posta, yanlış parolayla girmeyi deneyin.

**Ne görmelisin:** "E-posta veya şifre hatalı." uyarısı. Giriş yapılmaz.

- [ ] Yanlış parola reddedildi.

### 3c. Üye olarak giriş

**Ne yap:** Tarayıcıda bir **gizli pencere** açın (Chrome: `Ctrl + Shift + N`). Orada
`uye@demo.test` / `Demo-Uye-2026!` ile girin. Böylece iki rolü yan yana karşılaştırabilirsiniz.

**Ne görmelisin:**

| Ekran | Yönetici | Üye |
|---|---|---|
| Ayarlar → çalışma alanı, ticari ileti ayarları | Değiştirebilir | Görür ama alanlar kilitli (gri) |
| Ayarlar → **WhatsApp Business (API)** bölümü | Görünür | **Hiç görünmez** |
| Ayarlar → üye davet etme ve üye çıkarma | Var | Yok |
| İletişim → yeni kampanyada kanal listesi | E-posta, SMS, **WhatsApp (API)** | Yalnızca E-posta, SMS |
| Kayıtları görme, düzenleme, not ekleme, ret verme | Var | Var |

- [ ] Üye, WhatsApp Business ayarlarını göremiyor.
- [ ] Üye, kampanya kanallarında "WhatsApp (API)"yi göremiyor.

---

## 4. Bölge taraması

**Ne yap:** Yönetici penceresinde **Bölge taraması**'na gidin.

1. Merkez için adres yazın (ör. `Bağdat Caddesi, Kadıköy`) ya da haritaya tıklayın.
2. Kategori seçin (ör. "Kafe").
3. Yarıçapı 1.000 m civarında bırakın.
4. **Taramayı başlat**'a basın.

**Ne görmelisin:**

- Sayfada "PLACES_MOCK açık: örnek veri kullanılıyor." uyarısı.
- Tarama birkaç saniye içinde "Tamamlandı" olur ve bulunan işletme sayısını gösterir.
- **Tarama geçmişi**'nde yeni satır, yanında **Tekrar kullan** düğmesi.

Harita yerine "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY tanımlı değil" yazıyorsa sorun değil. Harita anahtarı yoksa
merkezi adresle ya da enlem/boylam kutularıyla girebilirsiniz.

**Ayrıca dene:** Geçmişteki örnek taramada (Kadıköy, emlak ofisi) **Tekrar kullan**'a basın.

**Ne görmelisin:** Form o taramanın ayarlarıyla dolar: "Ayarlar forma alındı; taramayı başlatabilirsiniz."

- [ ] Tarama tamamlandı.
- [ ] "Tekrar kullan" formu doldurdu.

---

## 5. Kayıt listesi ve kayıt detayı

**Ne yap:** **Kayıtlar**'a gidin.

**Ne görmelisin:**

- Tabloda işletme, adres, durum, ileti izni, WhatsApp izni, etiketler ve güncelleme tarihi.
- Durumlar karışık olmalı: Yeni, İletişimde, Görüşme, Kazanıldı, İlgilenmiyor.
- "Ret Vermiş Örnek İşletme"nin ileti izni **Ret** görünür.

**Ne yap:** Üstteki arama ve süzgeçleri deneyin: durum seçin, `demo` etiketini arayın.

**Ne görmelisin:** Liste süzgece göre daralır.

**Ne yap:** Google kaynaklı bir kayda tıklayın (adı "Emlak" ile biten bir kayıt).

**Ne görmelisin:** Sağda detay paneli açılır:
- İşletme bilgileri (ad, adres, puan; hepsi sahte).
- "Numara kayıtta yok; açarken Google'dan alınır (4 birim, saklanmaz)" notu.
- **Bilgiler ve notlar** ile **Etkinlikler** bölümleri.

**Ne yap:**

1. Durumu değiştirip **Değiştir**'e basın.
2. Etkinlikler bölümüne bir not yazıp kaydedin.
3. Bilgiler bölümüne bir yetkili adı girip kaydedin.

**Ne görmelisin:** "Kaydedildi." mesajı. Etkinlikler listesinde yaptığınız değişiklikler tarih ve adınızla görünür.

**Ne yap:** **Kişi ekle** ile elle bir kişi ekleyin (ör. ad "Deneme Kişi", telefon `0500 000 00 30`).

**Ne görmelisin:** Kişi listede "elle" kaynağıyla görünür.

- [ ] Liste, süzgeçler ve detay paneli çalışıyor.
- [ ] Not ve durum değişikliği etkinliklerde görünüyor.

---

## 6. CSV içe aktarma

Örnek dosya: **`docs/ornek-ice-aktarma.csv`**. Dosyada 12 kişi var: 6'sı doğru, 6'sı bilerek hatalı. Doğru
olanlardan biri mevcut bir kayıtla çakışıyor, biri WhatsApp izinli.

**Ne yap:**

1. **Kayıtlar → İçe aktar**'a gidin.
2. "1. Dosya seçin" adımında `docs/ornek-ice-aktarma.csv` dosyasını seçin.

**Ne görmelisin:** "2. Sütunları eşleyin" adımında bütün sütunlar kendiliğinden doğru alana eşlenmiş olmalı.
Örneğin "Telefon" → Telefon, "WhatsApp izni" → WhatsApp izni.

**Ne yap:** **3. Önizle**'ye basın.

**Ne görmelisin:** "Önizleme (henüz hiçbir şey kaydedilmedi)" başlığı altında şu sayılar:

| Satır | Sayı |
|---|---|
| Toplam satır | 12 |
| Yeni eklenecek | 5 |
| Mevcut kayıtla çakışan | 1 ("Sahte Fırın": aynı telefon) |
| Engel listesinde | 1 (ret vermiş kişinin e-postası) |
| WhatsApp izni var | 1 ("Kurgu Eczane") |
| Hatalı (alınmayacak) | 6 |

"Sorunlu satırlar" listesinde şu nedenler görünmeli:

| Satır | Neden |
|---|---|
| 8 | Telefon numarası tanınmadı |
| 9 | E-posta adresi geçersiz |
| 10 | Telefon veya e-posta yok |
| 11 | WhatsApp izni anlaşılamadı |
| 12 | İzin tarihi geçersiz (gelecek tarih) |
| 13 | Dosyada tekrar (satır 2) |

**Ne yap:** **Sorunlu satırları CSV indir**'e basın ve dosyayı açın.

**Ne görmelisin:** Satır numarası, neden ve orijinal hücrelerle sorunlu satırlar.

**Ne yap:** İzin beyanı kutusunu **işaretlemeden** "4. İçe aktar"a basmayı deneyin.

**Ne görmelisin:** İzinli kişi olduğu için beyan onayı istenir; içe aktarma yapılmaz.

**Ne yap:** Beyanı işaretleyip **4. İçe aktar**'a basın.

**Ne görmelisin:**

- "İçe aktarma tamamlandı".
- Kayıtlar listesinde yeni kişiler ("Deneme Çiçekçi (Sahte)", "Kurgu Eczane (Sahte)" vb.) görünür.
- "Sahte Fırın" ikinci kez **eklenmez**.

- [ ] Önizleme sayıları tablo ile aynı.
- [ ] Beyan onayı olmadan izinli içe aktarma yapılamadı.
- [ ] Çakışan kayıt çoğaltılmadı.

---

## 7. WhatsApp izni

**Ne yap:**

1. **Kayıtlar**'da "Hayali Kuaför"ü açın.
2. **WhatsApp izni (kampanyalar)** bölümünde **Düzenle**'ye basın.
3. **İzin var** seçin. İzin kaynağı seçin (ör. "Form"), bir izin tarihi girin, **Kaydet**'e basın.

**Ne görmelisin:**

- İzin "var" olarak kaydedilir.
- Etkinlikler'de izin değişikliği görünür.
- Kayıtlar listesinde WhatsApp izni sütunu güncellenir.

**Ne yap:** "Örnek Bireysel Müşteri"yi açın.

**Ne görmelisin:**
- İzni var ama yanında "İYS beyanı yok (kampanyaya girmez)" uyarısı.
- "Bireysel kayıtlara yalnızca ileti izni "Onaylı" ise gönderim yapılır." notu.

**Ne yap:** "Ret Vermiş Örnek İşletme"yi açın.

**Ne görmelisin:** "Ret verilmiş bir kişinin izni değiştirilemez." İzin düzenlenemez.

- [ ] İzin verildi ve etkinliklere yazıldı.
- [ ] Ret verilmiş kişinin izni değiştirilemiyor.

---

## 8. Kampanyalar (sandbox)

Kampanyalar **İletişim** sayfasında oluşturulur. Sol taraftaki formu doldurduğunuzda sağda **Gönderim özeti**
görünür: kaç kişiye gideceği, kaç kişinin neden hariç kaldığı ve bugün kaç tanesinin gidebileceği.

### 8a. E-posta kampanyası

**Ne yap:**

1. Kanal **E-posta** seçin, bir ad ve konu yazın.
2. Metin olarak şunu yazın: `Merhaba {isletme}, bu bir deneme mesajıdır.`
3. Alıcı grubunu "Tümü" bırakın.

**Ne görmelisin:**

- "Sandbox: gerçek gönderim yapılmayacak" uyarısı. Demoda e-posta sağlayıcısı tanımlı olmadığı için kampanya
  hep sandbox çalışır.
- Rehberi sırayla izlediyseniz özet şöyle olmalı:
  - **8 alıcıya gönderilecek.**
  - Hariç kalanlar: İleti reddi 1, Engel listesinde 1, Bireysel ve onay yok 2, İletişim bilgisi yok (e-postası
    olmayanlar).
  - Günlük sınır 5 olduğu için 5'i bugün gidecek, 3'ü sonraki günlere kalacak.
- İçe aktarmayı atladıysanız 6 alıcı görürsünüz.

**Ne yap:** **Kampanyayı başlat**'a basın.

**Ne görmelisin:**
- Kampanya listede "Sandbox" etiketiyle görünür.
- Detayına girince mesajlar **Kuyrukta** bekler. Henüz hiçbiri gönderilmemiştir; gönderimi işçi yapar (adım 9).

### 8b. SMS kampanyası

**Ne yap:** Kanal **SMS** seçin, kısa bir metin yazın. Alıcı grubunda etiket olarak `demo` yazın. Kampanyayı
başlatın.

**Ne görmelisin:**

- Özette SMS parça sayısı görünür.
- Telefonu kayıtta olmayan Google kayıtları için "Places'tan telefon" maliyeti (birim) görünür.
- Sabit hat (Kurgu Oto Servis: 0212…) "Cep telefonu değil" nedeniyle hariç kalır.

### 8c. WhatsApp (API) kampanyası (yalnızca yönetici)

**Ne yap:**

1. Kanal **WhatsApp (API)** seçin.
2. Şablon olarak **kampanya_tanitim** seçin.
3. Değişkenler için "Kaydın işletme adı" seçin; boş kalırsa diye bir yedek metin yazın.
4. Son değişkene "Sabit metin" olarak `demo.test` yazın.
5. "Sandbox" kutusunu **işaretlemeyin.**

**Ne görmelisin:**

- Özette bağlantı **test modunda** görünür.
- **Yalnızca 1 alıcı** gönderilecek: test numarası 0500 000 00 01 olan "Örnek Kırtasiye".
- Hariç kalanlar:
  - "Test modu: test numarası değil": izinli ama test numarası olmayanlar (Sahte Fırın, Kurgu Eczane, Hayali
    Kuaför, reklamdan gelen kişi)
  - "WhatsApp izni yok"
  - "Bireysel; İYS beyanı yok"
  - "İleti reddi"
- Tahmini Meta ücreti görünür. Demoda ücret oluşmaz; sahte istemci kullanılır.

**Ne yap:** **Kampanyayı başlat**'a basın.

- [ ] E-posta özeti günlük sınırı ve hariç nedenlerini gösterdi.
- [ ] WhatsApp kampanyası yalnızca test numarasına gidecek şekilde oluştu.

---

## 9. Kampanyayı işçiyle gönderme

Mesajları uygulamanın kendisi değil, ayrı çalışan **gönderim işçisi** gönderir. İşçi çalışmazsa kampanyalar
"Kuyrukta" bekler.

**Ne yap:**

1. **İkinci bir terminal** açın. VS Code'da terminal panelindeki **+** düğmesine basın. İlk terminal (uygulama)
   açık kalmalı.
2. Şunu çalıştırın:

   ```
   npm run demo:isci
   ```

**Ne görmelisin:** Terminalde 30 saniyede bir tur atan işçi ve şuna benzer satırlar:

```
[işçi] başladı (parti 20, aralık 30 sn).
[...] alınan 6, gönderilen 5, bekletilen 1, hariç 0, başarısız 0, ...
```

**Ne yap:** Tarayıcıda **İletişim**'e dönüp kampanyaların detayını açın (sayfayı yenileyin).

**Ne görmelisin:**

- **E-posta:** 5 mesaj "Gönderildi", kalanlar "Kuyrukta" (günlük sınır; ertesi gün gider).
  - **Kaydedilen mesajı göster** ile sandbox'a kaydedilen metni görebilirsiniz. `{isletme}` yerine işletme adı
    yazılmış olmalı.
- **SMS:** En fazla 5 mesaj gönderilmiş, hariç olanlar nedenleriyle listelenmiş.
- **WhatsApp:** Örnek Kırtasiye'ye "Gönderildi". Diğerleri "Hariç", nedenleriyle.
  - Gerçek Meta olmadığı için "Teslim edildi" ya da "Okundu" bildirimi **gelmez**. Bu beklenen bir durumdur.

İşçiyi durdurmak için ikinci terminalde `Ctrl + C`. Yalnızca tek tur çalıştırmak isterseniz:

```
npm run demo:isci -- --bir-kez
```

- [ ] İşçi çalıştı, mesajlar "Gönderildi" oldu.
- [ ] Günlük sınırı aşan mesajlar "Kuyrukta" kaldı.

---

## 10. Ret verme ve sonrasında gönderim yapılmaması

Bu adımın amacı şunu görmek: ret verilen kişiye, kampanya ret'ten **önce** oluşturulmuş olsa bile mesaj gitmez.

**Ne yap:**

1. İşçiyi durdurun (ikinci terminalde `Ctrl + C`).
2. Yeni bir **SMS** kampanyası başlatın. Alıcı grubu etiketi: `demo`. Özette "Sahte Fırın"ın gönderilecekler
   arasında olduğuna dikkat edin.
3. **Kayıtlar**'da "Sahte Fırın"ı açın ve **İleti reddi işaretle**'ye basın. Bunu üye penceresinden de
   yapabilirsiniz.
4. İşçiyi yeniden çalıştırın: `npm run demo:isci -- --bir-kez`.

**Ne görmelisin:**

- Kayıtta ileti izni kırmızı **Ret** olur. Etkinliklerde ret kaydı görünür.
- Kampanya detayında "Sahte Fırın" satırı **Hariç — İleti reddi** olur. Mesaj gönderilmemiştir.
- Kaydı yeniden açtığınızda "İleti reddi işaretle" ve "İzin alındı" düğmeleri artık yoktur. **Ret geri
  alınamaz**; yönetici de değiştiremez.
- Yeni bir kampanya özetinde bu kişi her kanalda "İleti reddi" olarak hariç görünür.

- [ ] Ret sonrası işçi o kişiye göndermedi.
- [ ] Ret geri alınamıyor.

---

## 11. WhatsApp test modu kilidi

Gerçek kullanımda test modu, Meta'dan imzalı teslim bildirimi gelene kadar kapatılamaz. Bu kural, yanlış
ayarlanmış bir bağlantıyla herkese mesaj gönderilmesini önler.

**Ne yap:**

1. Yönetici olarak **Ayarlar → WhatsApp Business (API) → Test modu ve sınır** bölümüne gidin.
2. "Test modu: kampanyalar yalnızca aşağıdaki test numaralarına gider." kutusundaki işareti kaldırın.

**Ne görmelisin:**

- "Test modu kapatılamaz: webhook henüz doğrulanmadı. …" uyarısı.
- Kutu işaretli (test modu açık) kalır.

Demoda Meta bağlantısı olmadığı için bu kilit **hiç açılmaz**. Beklenen davranış budur.

**Ayrıca bakın:** Aynı sayfada numara ("+90 850 000 00 00", "Deneme İşletmesi"), kalite (yeşil), "Numara
sahipliği: Doğrulandı" ve 3 şablon görünür. **Bağlantıyı test edin** düğmesi "Bağlantı çalışıyor." der.

- [ ] Test modu kapatılamadı, açıklayıcı uyarı çıktı.

---

## 12. Kota ve sınırlar

### 12a. Places kotası

**Ne yap:** **Ayarlar**'da "Places kotası" çubuğuna bakın. Sonra birkaç kayıt detayı açıp sayfayı yenileyin.

**Ne görmelisin:** Kullanılan birim artar. Tarama, liste ve detay görüntüleme birim harcar.

**Ne yap:** Kotayı doldurun. Üçüncü bir terminalde (ya da işçi terminalinde, işçiyi durdurduktan sonra) şunu
çalıştırın:

```
npm run demo:kota -- 0
```

Ardından sayfayı yenileyin ve yeni bir tarama başlatın.

**Ne görmelisin:**

- Kota çubuğu dolu görünür.
- Tarama "Bu ayki veri kotanız doldu." mesajıyla durur.
- Kayıtlar listesinde ve detayda Google'dan gelen işletme bilgileri (ad, adres) **gösterilmez**. Kendi
  bilgileriniz (durum, not, e-posta) görünmeye devam eder.

**Ne yap:** Kotayı geri açın:

```
npm run demo:kota -- 1000
```

> Normal `npm run kota` komutu **gerçek** veritabanına yazar; demo için yalnızca `npm run demo:kota` kullanın.

### 12b. Günlük gönderim sınırı

Adım 8 ve 9'da gördünüz: demoda günde en fazla 5 e-posta ve 5 SMS gönderilir. Fazlası "Kuyrukta" kalır ve ertesi
gün (İstanbul saatiyle) gönderilir. **Ayarlar** sayfasında günlük sınırlar yazar. Gerçek varsayılanlar 300 e-posta
ve 200 SMS'tir.

- [ ] Kota dolunca tarama durdu ve Google bilgileri gizlendi.
- [ ] Kota geri açılınca bilgiler yeniden göründü.

---

## 13. CSV dışa aktarma

**Ne yap:** **Kayıtlar**'da isterseniz bir süzgeç seçin, sonra **CSV dışa aktar**'a basın. İnen dosyayı Excel'de
açın.

**Ne görmelisin:**

- Türkçe karakterler düzgün görünür.
- Sütunlar: place_id, durum, ileti_izni, alici_turu, isletme_adi, yetkili_adi, eposta, ek_telefon, etiketler,
  notlar, tarihler.
- Google kayıtlarının **adı, adresi ve Google telefonu dosyada yoktur.** Yalnızca `place_id` (`mock_…`) ve sizin
  girdiğiniz bilgiler vardır. Google kuralları gereği bu bilerek böyledir.
- Süzgeç seçtiyseniz yalnızca süzülen kayıtlar dosyadadır.

- [ ] Dosya Excel'de düzgün açıldı.
- [ ] Google içeriği dışa aktarılmadı.

---

## 14. Bitirme ve sıfırlama

- Uygulamayı kapatmak için: ilk terminalde `Ctrl + C`. İşçiyi kapatmak için: ikinci terminalde `Ctrl + C`.
- Baştan denemek için: ikisini de kapatıp `npm run demo:hazirla`, sonra `npm run demo`.
- Demo dosyası `data/demo.db`'dir. Silmek isterseniz uygulama kapalıyken silebilirsiniz. Gerçek veritabanı
  (`data/app.db`) etkilenmez.

### Sık karşılaşılanlar

| Gördüğünüz | Anlamı ve çözüm |
|---|---|
| `demo.db kullanımda` | Uygulama ya da işçi açık. İkisini `Ctrl + C` ile kapatıp yeniden deneyin. |
| `Demo veritabanı yok` | Önce `npm run demo:hazirla` çalıştırın. |
| `Port 3000 is in use` | Normal `npm run dev` ya da başka bir demo açık. Onu kapatın. |
| Kampanya hep "Kuyrukta" | İşçi çalışmıyor. İkinci terminalde `npm run demo:isci`. |
| Harita görünmüyor | Tarayıcı harita anahtarı tanımlı değil. Adres ya da enlem/boylam ile devam edin. |
| WhatsApp mesajı "Teslim edildi" olmuyor | Demoda Meta yok; teslim bildirimi gelmez. Beklenen durum. |

---

## 15. Otomatik testler

Elle denemeden bağımsız olarak, uygulamanın kurallarını kontrol eden otomatik testler vardır. Demo açıkken de
çalıştırılabilir; testler kendi geçici veritabanlarını kullanır.

| Komut | Ne kontrol eder | Süre |
|---|---|---|
| `npm test` | Bütün otomatik testler (kiracı izolasyonu, ret, kota, içe aktarma, kampanya, WhatsApp, yedek, demo kurulumu…) | 1–3 dk |
| `npm run typecheck` | Kod türleri tutarlı mı | ~30 sn |
| `npm run lint` | Kod kuralları (ör. veritabanına yalnızca izin verilen yerlerden erişim) | ~30 sn |
| `npm run build` | Uygulama yayına hazır derlenebiliyor mu | 1–2 dk |

### Sonuçlar nasıl okunur?

**`npm test` başarılıysa** sonda şuna benzer satırlar görünür:

```
 Test Files  26 passed (26)
      Tests  337 passed (337)
```

"passed" geçti demektir. Sayılar zamanla değişebilir; önemli olan **"failed" kelimesinin hiç olmaması**.

**Başarısızsa** şöyle görünür:

```
 FAIL  tests/kampanya.test.ts > ... > test adı
 AssertionError: expected 5 to be 6
 Test Files  1 failed | 25 passed (26)
```

- `FAIL` satırı hangi dosyadaki hangi testin bozulduğunu söyler.
- `expected … to be …` beklenen ile bulunan değeri gösterir.
- Bu çıktıyı olduğu gibi kopyalayıp geliştiriciye iletin.

Diğer komutlar için:
- **`npm run typecheck`** ve **`npm run lint`** başarılıysa hiçbir hata satırı yazmadan biter. `error` kelimesi
  görürseniz başarısızdır; dosya adı ve satır numarası yazar.
- **`npm run build`** başarılıysa sonda sayfa listesi görünür. Hata varsa kırmızı "Failed to compile" ya da
  "Error" yazar.

Tek bir test dosyasını çalıştırmak için: `npx vitest run tests/yedek-saklama.test.ts`
