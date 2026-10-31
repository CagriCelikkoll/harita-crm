# Elle deneme rehberi

Bu rehber, uygulamayı **kendi bilgisayarınızda, sahte verilerle** adım adım denemeniz içindir. Teknik bilgi
gerekmez; komutları olduğu gibi kopyalayıp yapıştırmanız yeterli.

Her adımda iki şey yazıyor:

- **Ne yap:** sizin yapacağınız şey.
- **Ne görmelisin:** doğru çalışıyorsa ekranda göreceğiniz şey. Farklı bir şey görürseniz adımın yanına not alın.

Kutucukları (`[ ]`) denedikçe işaretleyebilirsiniz. Adımları **sırayla** izleyin: sonraki adımlardaki sayılar
öncekilerde yaptıklarınıza göre yazılmıştır.

> **Güvenli mi?** Evet. Demo ortamı ayrı bir veritabanı (`data/demo.db`) kullanır; gerçek veritabanınıza ve
> `.env.local` dosyanızdaki ayarlara dokunmaz. Google ve WhatsApp'a hiç bağlanmaz, ücret oluşmaz. E-posta ve SMS
> kampanyaları "sandbox" modunda çalışır: hiçbir mesaj gerçekten gönderilmez, yalnızca kaydedilir.
> Demoya **gerçek kişi bilgisi girmeyin.**

**Başarılı işlemler** (kaydetme, durum değiştirme, not ekleme, kişi ekleme, bağlantı testi…) ekranın **sağ üstünde**
birkaç saniye görünen yeşil bir bildirimle (✓) onaylanır. Bir işlemden sonra bu bildirimi görmüyorsanız not alın.

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
  Ret verilmiş  : "Ret Vermiş Örnek İşletme" (0500 000 00 09, ret.ornek@demo.test engel listesinde)
  Sabit hat     : 2 Google kaydının telefonu 0 (212) 000 … (SMS'te "cep telefonu değil")
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
| Google kaynaklı kayıtlar | Kadıköy'de sahte bir "emlak ofisi" taramasından gelen 10 kayıt (henüz incelenmemiş). Google'daki adları ve adresleri yalnızca istediğinizde gösterilir; değerler sahte istemcinin uydurduğu adlardır (ör. "Bora Emlak 852"). |
| Elle eklenen ve içe aktarılan kayıtlar | Örnek Kırtasiye, Sahte Fırın, Hayali Kuaför, Kurgu Oto Servis, Örnek Bireysel Müşteri |
| Reklamdan gelen kişi | Reklamdan Gelen Deneme Kişi |
| Ret verilmiş kayıt | "Ret Vermiş Örnek İşletme" (0500 000 00 09, `ret.ornek@demo.test`) |
| Sabit hatlı Google kayıtları | İki Google kaydının ("Görüşme" ve "İlgilenmiyor" durumundaki, `demo` etiketli olanlar) telefonu bilerek sabit hattır: SMS'te "Cep telefonu değil" nedeniyle düşmeleri görülebilsin. |
| WhatsApp | Sahte bağlantı (test modunda), 3 şablon (biri kampanyada kullanılamaz; bkz. adım 8c). Test numarası: **+90 500 000 00 01** (Örnek Kırtasiye). |
| Sınırlar (demo için düşük) | Günde en fazla 5 e-posta ve 5 SMS. Places kotası ayda 1.000 birim. |

Telefonlar `0500 000 xx xx` biçimindedir (elle girilenler `0500 000 00 xx`, Google kaynaklı sahte kayıtlarınki
`0500 000 10 00`–`99 99`); 0500 öneki hiçbir operatöre ayrılmamıştır. Tek istisna yukarıdaki iki sabit hatlı Google
kaydıdır: onların numarası `0 (212) 000 xx xx` biçimindedir (yerel numara 0 ile başlamaz; gerçek abone olamaz).
Bütün e-postalar `@demo.test` uzantılıdır. Bunlar gerçek kişilere ait değildir.

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
- Giriş düğmesi sayfa tam yüklenene kadar kısa bir süre **"Yükleniyor…"** yazar ve basılamaz; sonra "Giriş yap" olur.
- Sağ altta küçük bir "N" simgesi görünebilir: bu yalnızca geliştirme ortamının simgesidir, dikkate almayın.

- [ ] Giriş ekranı açıldı.

---

## 3. Giriş: yönetici ve üye farkı

### 3a. Yönetici olarak giriş

**Ne yap:** `yonetici@demo.test` / `Demo-Yonetici-2026` ile **Giriş yap**'a basın.

**Ne görmelisin:**

- **Panel** sayfası açılır: toplam kayıt, durum hunisi, son taramalar ve "Bu ayki Places kullanımı".
- Sol menüde **Panel, Bölge taraması, Kayıtlar, İletişim, Ayarlar** vardır.

- [ ] Yönetici girişi çalıştı.

### 3b. Yanlış parola

**Ne yap:** Sol alttaki **Çıkış yap**'a basın (ya da bir gizli pencere açın). Doğru e-posta, yanlış parolayla girmeyi
deneyin.

**Ne görmelisin:** "E-posta veya şifre hatalı." uyarısı. Giriş yapılmaz; yazdığınız e-posta alanda kalır.

- [ ] Yanlış parola reddedildi.

### 3c. Üye olarak giriş

**Ne yap:** Tarayıcıda bir **gizli pencere** açın (Chrome: `Ctrl + Shift + N`). Orada
`uye@demo.test` / `Demo-Uye-2026!` ile girin. Böylece iki rolü yan yana karşılaştırabilirsiniz. (Gizli pencere
açamıyorsanız çıkış yapıp üye olarak girin, karşılaştırmadan sonra yeniden yönetici olarak girin.)

**Ne görmelisin:**

| Ekran | Yönetici | Üye |
|---|---|---|
| Ayarlar → çalışma alanı, ticari ileti ayarları | Değiştirebilir | Görür ama alanlar kilitli (gri), "Bu ayarları yalnızca yöneticiler değiştirebilir." yazar |
| Ayarlar → **WhatsApp Business (API)** bölümü | Görünür | **Hiç görünmez** |
| Ayarlar → üye davet etme ve üye çıkarma | Var | Yok ("Üye davet etmek için yönetici yetkisi gerekir.") |
| İletişim → yeni kampanyada kanal listesi | E-posta, SMS, **WhatsApp (API)** | Yalnızca E-posta, SMS |
| Kayıtları görme, düzenleme, not ekleme, ret verme | Var | Var |

Ayarlar'da kota ve günlük sınırların altında hiçbir komut yazmaz; yalnızca "Kotanızı veya sınırlarınızı artırmak için
yöneticinizle/destekle iletişime geçin." yazar.

- [ ] Üye, WhatsApp Business ayarlarını göremiyor.
- [ ] Üye, kampanya kanallarında "WhatsApp (API)"yi göremiyor.

Bundan sonraki adımları **yönetici** olarak yapın.

---

## 4. Bölge taraması ve sonuçları inceleme

### 4a. Tarama

**Ne yap:** **Bölge taraması**'na gidin.

1. **Adres** kutusuna `Bağdat Caddesi, Kadıköy` yazıp yanındaki **Bul** düğmesine basın.
2. **Kategori** olarak "Kafe" seçin.
3. Yarıçapı olduğu gibi bırakın (form son taramanın ayarlarıyla gelir; demoda 1,5 km).
4. **Taramayı başlat**'a basın.

**Ne görmelisin:**

- **Bul**'dan sonra Enlem/Boylam kutuları dolar ve "Merkez kaynağı: adres araması" yazar.
- Sayfada "PLACES_MOCK açık: örnek veri kullanılıyor." uyarısı.
- Tarama birkaç saniye içinde biter; sağdaki **Tarama durumu** kartında "Tamamlandı" ve **Bulunan işletme 17**
  yazar. Kartın altında **Sonuçları incele** ve **Kayıtlara git** düğmeleri vardır (kartı görmek için biraz aşağı
  kaydırmanız gerekebilir).
- **Tarama geçmişi**'nde yeni satır; incelenmemiş sonucu olan taramalarda **Sonuçları incele (N)** düğmesi
  (Kafe taraması için 17, demodaki Emlak ofisi taraması için 10).

Harita yerine "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY tanımlı değil" yazıyorsa sorun değil: harita anahtarı yoksa
merkezi adresle ya da enlem/boylam kutularıyla girersiniz. Bu durumda "X kaydın X tanesi haritada" gibi bir yazı
da çıkmaz.

- [ ] Tarama tamamlandı (17 işletme).

### 4b. Sonuçları incele

**Ne yap:** Tarama durumu kartındaki **Sonuçları incele**'ye basın.

**Ne görmelisin:**

- "Sonuçları incele" sayfası: "17 incelenmemiş sonuç · bu sayfada 17".
- Satırlarda Google adı **yoktur**; her satırda "Google kaydı · ad girilmemiş" ve **Göster (3 birim)** yazar. Liste
  kendiliğinden Google'a gitmez, kota harcamaz.
- Üstte **Bu sayfanın Google bilgilerini göster (17 × 3 = 51 birim)** düğmesi: maliyet basmadan önce yazar.

**Ne yap:**

1. **Bu sayfanın Google bilgilerini göster**'e basın.
2. İlk satırda **İlgilen**'e basın. Açılan "İşletme adı (sizin kaydınız)" kutusuna `Deneme Kafe` yazıp **Kaydet**'e
   basın.
3. İkinci satırda **İlgilenme**'ye basın.
4. Diğer satırlara dokunmadan **Taramaya dön**'e basın.

**Ne görmelisin:**

- Bilgiler gelince her satırda "Google: Yıldız Kafe 402" gibi bir ad ve adres görünür. Bu bilgi saklanmaz;
  sayfadan ayrılınca silinir.
- **İlgilen**'e basınca o satırın Google bilgisi gizlenir ve **boş** bir ad kutusu açılır. Kutuda yalnızca gri
  "İşletmeyle görüştüğünüzde adını buraya yazın" ipucu vardır; Google'daki ad kutunun yanında gösterilmez, kopyalama
  ya da otomatik doldurma yoktur.
- Kaydettikten sonra satırda "Deneme Kafe" ve "İlgilenilen" etiketi, ikinci satırda "İlgilenilmiyor" etiketi
  görünür. Her ikisinin yanında **Geri al** vardır.
- Tarama geçmişinde Kafe taraması artık **Sonuçları incele (15)** gösterir.

İlgilenmediğiniz işletmeler silinmez (sonraki taramada yeniden gelmesinler diye); **Kayıtlar**'da varsayılan olarak
gizlenir ve hiçbir kampanyaya girmez. Hepsini tek seferde işaretlemek için "Kalan N sonucun hiçbiriyle ilgilenme"
düğmesi vardır (bu rehberde kullanmıyoruz).

- [ ] Google bilgileri istenince geldi; maliyet önceden yazıyordu.
- [ ] Ad kutusu boş geldi, yanında Google adı yoktu.
- [ ] İlgilen / İlgilenme işaretleri göründü.

### 4c. Tekrar kullan

**Ne yap:** **Bölge taraması**'nda, geçmişteki demo taramasında (Emlak ofisi, "Adres: Kadıköy, İstanbul")
**Tekrar kullan**'a basın.

**Ne görmelisin:** Formun üstünde "Ayarlar forma alındı; taramayı başlatabilirsiniz." yazar ve kategori "Emlak ofisi"
olur (mesajı görmek için sayfanın üstüne kaydırın).

- [ ] "Tekrar kullan" formu doldurdu.

---

## 5. Kayıt listesi ve kayıt detayı

**Ne yap:** **Kayıtlar**'a gidin.

**Ne görmelisin:**

- Üstte **33 kayıt** (34 kayıttan "İlgilenilmiyor" işaretlediğiniz 1 tanesi varsayılan olarak gizlidir).
- Liste yalnızca **sizin girdiğiniz** bilgileri gösterir: kendi işletme adınız (yoksa gri, eğik "Google kaydı · ad
  girilmemiş"), durum, ileti izni, etiketler, son işlem. WhatsApp izni, kaynak ("Elle eklendi", "İçe aktarma"…) ve
  inceleme ("İncelenmedi", "İlgilenilmiyor") adın altında küçük etiketler olarak görünür. Ayrı bir "WhatsApp izni"
  sütunu yoktur.
- Google kayıtlarında "Google adresi" sütununda **Göster (3 birim)**; listenin üstünde **Bu sayfadaki Google
  bilgilerini göster (N × 3 = X birim)**. Listeyi açmak kota harcamaz.
- İlk sayfadaki kayıtların çoğu yeni taramanın kafeleridir ("Yeni" durumunda). Demodaki farklı durumlar (İletişimde,
  Görüşme, Kazanıldı, İlgilenmiyor) ve **Ret** ikinci sayfadadır ya da Durum süzgeciyle bulunur.

**Ne yap:**

1. Üstteki süzgeçleri deneyin: **Durum** = "Görüşme" → **Filtrele**. Sonra **Temizle**.
2. **İnceleme** süzgecinde "İlgilenilmeyen"i seçip **Filtrele**: işaretlediğiniz kafe görünür. Sonra **Temizle**.
3. **Ara** kutusuna `demo.test` yazıp **Filtrele** (yalnızca sizin girdiğiniz alanlarda arar). Sonra **Temizle**.

**Ne görmelisin:** Liste süzgece göre daralır ("2 kayıt", "1 kayıt" vb.).

**Ne yap:** Bir Google kaydının adına tıklayın (ör. "Google kaydı · ad girilmemiş" yazan bir kafe).

**Ne görmelisin:** Sağda detay paneli açılır:

- Başlıkta Google'daki ad, altında adres; telefon, web sitesi, puan (hepsi sahte). Bu bilgiler panel açılınca bir
  kez Google'dan çekilir (4 birim) ve saklanmaz. Aynı kaydı aynı sayfada yeniden açarsanız tekrar çekilmez.
- **Bilgiler** bölümünde "İşletme adı (sizin kaydınız)" kutusu boştur; gri ipucu "İşletmeyle görüştüğünüzde adını
  buraya yazın".
- **Notlar ve geçmiş** bölümü: "Not ekle" ve geçmiş (Eklendi, Durum değişti, Bilgi güncellendi…).

**Ne yap:**

1. **Durum**'u "İletişimde" yapıp **Değiştir**'e basın.
2. **Bilgiler**'de **Yetkili adı**'na `Deneme Yetkili` yazıp **Kaydet**'e basın.
3. **Not ekle** kutusuna bir not yazıp **Notu ekle**'ye basın.

**Ne görmelisin:**

- Her işlemden sonra sağ üstte bildirim: "Durum güncellendi.", "Kaydedildi.", "Not eklendi.".
- Listede o satırın durumu ve son işlem tarihi sayfa yenilenmeden değişir.
- Geçmişte "Durum değişti · Yeni → İletişimde", "Bilgi güncellendi · Bilgiler güncellendi: yetkili adı" ve notunuz
  görünür.

**Ne yap:** Demo kayıtlarından "Sahte Fırın"ı açın (Ara: `0500 000 00 02`).

**Ne görmelisin:** Notlar ve geçmiş bölümünde gri bir **Kayıt notu** kutusu yoktur (bu kayıtta not girilmemiş).
"Hayali Kuaför"ü açarsanız kayıt notu kutusunda "Demo notu: WhatsApp izni henüz alınmadı." ve **Düzenle** görünür.
Kayıt notu, kişi eklerken ya da içe aktarırken girilen kalıcı nottur; tarihli notlar "Not ekle" ile eklenir.

### 5b. Kişi ekle

**Ne yap:** **Kayıtlar → Kişi ekle**. Ad soyad `Deneme Kişi`, telefon `0500 000 00 30` yazın. **Alıcı türü**nü
seçmeden **Kaydet**'e basmayı deneyin; sonra "Tacir/esnaf (işletme)" seçip **Kaydet**'e basın.

**Ne görmelisin:**

- Alıcı türü "Seçin" ile başlar ve zorunludur; seçmeden kaydedilmez (tarayıcı alanı işaretler). Altında
  "Bireysel kişilere ticari ileti göndermek için kişinin onayı ve bu onayın İYS'ye kayıtlı olması ayrıca gerekir."
  yazar.
- Kaydedince Kayıtlar açılır, sağ üstte "Kişi eklendi." bildirimi; kişi "Elle eklendi" etiketiyle listede ve detayı
  açık.

- [ ] Liste yalnızca kendi verinizi gösterdi; Google bilgisi istenince geldi.
- [ ] Durum, bilgi ve not işlemleri bildirimle onaylandı.
- [ ] Kişi eklerken alıcı türü seçmek zorunluydu.

---

## 6. CSV içe aktarma

Örnek dosya: **`docs/ornek-ice-aktarma.csv`**. Dosyada 12 kişi var: 6'sı doğru, 6'sı bilerek hatalı. Doğru
olanlardan biri mevcut bir kayıtla çakışıyor, biri WhatsApp izinli, biri engel listesindeki bir e-postayla geliyor.

**Ne yap:**

1. **Kayıtlar → İçe aktar**'a gidin.
2. "1. Dosya seçin" adımında `docs/ornek-ice-aktarma.csv` dosyasını seçin.

**Ne görmelisin:** "2. Sütunları eşleyin — ornek-ice-aktarma.csv (12 satır)". Bütün sütunlar kendiliğinden doğru
alana eşlenir (ör. "Telefon" → Telefon, "Alıcı türü" → Alıcı türü). Dosyada alıcı türü sütunu olduğu için altta
"Alıcı türü hücresi boşsa" seçimi "— boş hücre hatalı sayılır —" olarak gelir. (Dosyanızda alıcı türü sütunu yoksa
burada tüm dosya için "Tacir/esnaf (işletme)" ya da "Bireysel (kişi)" seçmeden önizleme yapılamaz.)

Bu ekranda iki farklı onay kutusu vardır, karıştırmayın:

- Üstteki "**Bireysel kişilerin WhatsApp izinleri İYS'ye kaydedilmiştir.**" kutusu isteğe bağlıdır ve yalnızca
  bireysel kişilere WhatsApp kampanyası gönderilip gönderilemeyeceğini belirler. Bu rehberde işaretlemeyin.
- Önizlemeden sonra çıkan sarı **izin beyanı** kutusu ise izinli kişi içe aktarılacaksa zorunludur (aşağıda).

**Ne yap:** **3. Önizle**'ye basın (önizleme sayfanın altında açılır; aşağı kaydırın).

**Ne görmelisin:** "Önizleme (henüz hiçbir şey kaydedilmedi)" başlığı altında:

| Satır | Sayı |
|---|---|
| Toplam satır | 12 |
| Yeni eklenecek | 5 |
| Mevcut kayıtla çakışan | 1 ("Sahte Fırın": aynı telefon) |
| Hatalı (alınmayacak) | 6 |
| Engel listesinde | 1 (ret vermiş kişinin e-postası) |
| WhatsApp izni var | 1 ("Kurgu Eczane") |
| Ret işaretli | 0 |

**Sorunlu satırlar (6)**'ya tıklayınca:

| Satır | Neden |
|---|---|
| 8 | Telefon numarası tanınmadı |
| 9 | E-posta adresi geçersiz |
| 10 | Telefon veya e-posta yok |
| 11 | WhatsApp izni anlaşılamadı (var / yok / ret) |
| 12 | İzin tarihi geçersiz (gelecek tarih) |
| 13 | Dosyada tekrar (satır 2) |

**Ne yap:** **Sorunlu satırları CSV indir**'e basın ve dosyayı Excel'de açın.

**Ne görmelisin:** Satır numarası, neden ve orijinal hücreler ayrı sütunlarda (dosya UTF-8 ve noktalı virgüllüdür;
Türkçe Excel'de doğrudan sütunlara ayrılır).

**Ne yap:** Sarı izin beyanı kutusuna bakın, **işaretlemeden** "4. İçe aktar" düğmesine bakın.

**Ne görmelisin:** "4. İçe aktar" düğmesi beyan işaretlenene kadar **pasiftir** (basılamaz); ayrı bir uyarı çıkmaz.

**Ne yap:** Beyanı işaretleyip **4. İçe aktar**'a basın.

**Ne görmelisin:**

- "İçe aktarma tamamlandı": Eklenen yeni kişi 5, Mevcut kayıtla çakışan 1, Hatalı 6, Engel listesinde 1.
- **İçe aktarılan kayıtlar**'a basınca yeni kişiler ("Deneme Çiçekçi (Sahte)", "Kurgu Eczane (Sahte)" vb.) görünür.
- "Sahte Fırın" ikinci kez **eklenmez** (Ara: `0500 000 00 02` → 1 kayıt).
- "Ret Örneği Yeniden (Sahte)" kaydının adının altında kırmızı **Engelli** etiketi vardır; detayını açınca "Bu
  kişinin adreslerinden biri engel listesinde (daha önce ret verilmiş); hiçbir kanaldan ileti gönderilmez." yazar.

- [ ] Önizleme sayıları tablo ile aynı.
- [ ] Beyan onayı olmadan içe aktarma yapılamadı.
- [ ] Çakışan kayıt çoğaltılmadı; engelli kişi işaretli.

---

## 7. WhatsApp izni

**Ne yap:**

1. **Kayıtlar**'da "Hayali Kuaför"ü açın (Ara: `elif.kurgu`).
2. **WhatsApp izni (kampanyalar)** bölümünde **Düzenle**'ye basın.
3. **İzin var** seçin. İzin kaynağı "Form", izin tarihi olarak geçmiş bir gün girin, **Kaydet**'e basın.

**Ne görmelisin:**

- "İzin var · Form · <tarih>" görünür; geçmişte "İzin değişti · WhatsApp izni: İzin var, Form".
- Listede satırın altına "WhatsApp izni" etiketi **sayfa yenilenmeden** eklenir ve son işlem tarihi güncellenir.

**Ne yap:** "Örnek Bireysel Müşteri"yi açın (Ara: `bireysel.ornek`).

**Ne görmelisin:**
- İzni var ama yanında "İYS beyanı yok (kampanyaya girmez)".
- Bilgiler bölümünde "Bireysel kayıtlara yalnızca ileti izni "Onaylı" ise gönderim yapılır." notu.

**Ne yap:** "Ret Vermiş Örnek İşletme"yi açın (Ara: `ret.ornek`).

**Ne görmelisin:**

- İleti izni: **Ret · <tarih> · İleti reddi işaretlendi · Demo Yönetici** (ne zaman, nasıl ve kimin verdiği).
- WhatsApp izni bölümünde de aynı "Ret · …" yazar; eski izin kaynağı gösterilmez. "Ret verilmiş bir kişinin izni
  değiştirilemez." yazar; **Düzenle** düğmesi yoktur.

- [ ] İzin verildi; liste sayfa yenilenmeden güncellendi.
- [ ] Ret verilmiş kişide "Ret · tarih · nasıl" görünüyor, izin değiştirilemiyor.

---

## 8. Kampanyalar (sandbox)

Kampanyalar **İletişim** sayfasında oluşturulur. Formu doldurduktan sonra **Gönderim özetini göster**'e
basın: özet formun altında açılır (aşağı kaydırın) ve kaç kişiye gideceğini, kaç kişinin neden hariç kaldığını ve
bugün kaç tanesinin gidebileceğini gösterir. Özet yalnızca **sayıları** gösterir; kimin hariç kaldığını kampanya
başladıktan sonra detay sayfasındaki alıcı listesinde görürsünüz.

### 8a. E-posta kampanyası

**Ne yap:**

1. Kanal **E-posta**, kampanya adı `Demo e-posta`, konu `Merhaba`.
2. Mesaj olarak şunu yazın: `Merhaba {isletme}, bu bir deneme mesajıdır.`
3. Alıcı grubunu "Tümü" bırakın, **Gönderim özetini göster**'e basın.

**Ne görmelisin:**

- "E-posta sağlayıcısı tanımlı değil: kampanya sandbox modunda çalışır" uyarısı.
- Özet (rehberi sırayla izlediyseniz):
  - **8 alıcıya gönderilecek.**
  - Hariç tutulanlar: İleti reddi 1, Engel listesinde 1, İletişim bilgisi yok 27, Bireysel ve onay yok 2,
    **İlgilenilmiyor olarak işaretli 1** (adım 4b'de işaretlediğiniz kafe).
  - "Günlük sınır nedeniyle sonraki günlere kalacak 3" (sınır günde 5).
  - "Kendi kaydınızda işletme adı yok: 3 kayıt (Google'dan gelen ad mesajlara yazılmaz; {isletme} kaldırılacak)" ve
    yanında **Adı boş olan Google kayıtlarını aç** bağlantısı.

**Ne yap:** **Kampanyayı başlat**'a basın.

**Ne görmelisin:**

- Kampanyanın **detay sayfası** açılır: "Gönderiliyor" ve "Sandbox: gerçek gönderim yok" etiketleri, İlerleme 0 / 8.
- **"Gönderim kuyrukta — gönderim servisi henüz hiç çalışmadı."** yazan kırmızı bir kutu ve altında yöneticiye uyarı:
  gönderim servisi çalışmadığı için mesajlar gönderilmeyecek. (Servisi adım 9'da başlatacaksınız.)
- Alıcılar listesinde Google kayıtları gri, eğik "Google kaydı · ad girilmemiş" olarak görünür; yanlarında
  **Göster (3 birim)** vardır (ad yalnızca ekranda gösterilir, mesaja yazılmaz).

### 8b. SMS kampanyası

**Ne yap:** **İletişim**'e dönün. Kanal **SMS**, ad `Demo SMS`, alıcı grubunda **Etiket** `demo`. Mesaj:
`Merhaba {isletme}, demo SMS denemesi.` → **Gönderim özetini göster** → **Kampanyayı başlat**.

**Ne görmelisin (özette):**

- SMS uzunluğu ve parça sayısı (1 SMS).
- **9 alıcıya gönderilecek**; hariç: İleti reddi 1, İletişim bilgisi yok 2, Bireysel ve onay yok 2, **Cep telefonu
  değil 1** (Kurgu Oto Servis: 0212…).
- "Telefonu kayıtta olmayan, gönderim anında Google'dan alınacak: 3 kayıt" ve "Tahmini kota maliyeti 12 birim".
- Bu 3 kaydın **2'si** demodaki bilerek sabit hatlı Google kayıtlarıdır. Numara ancak gönderim anında öğrenildiği
  için özette "gönderilecek" sayılırlar; işçi gönderirken "Cep telefonu değil" nedeniyle **düşer** (adım 9).

### 8c. WhatsApp (API) kampanyası (yalnızca yönetici)

**Ne yap:**

1. Kanal **WhatsApp (API)**, ad `Demo WhatsApp`.
2. Şablon olarak **kampanya_tanitim (tr, Pazarlama)** seçin. (Listede 2 şablon vardır: demodaki üçüncü şablon
   "butonsuz_pazarlama", abonelikten çıkma butonu olmadığı için kampanyada kullanılamaz; nedeni Ayarlar → WhatsApp
   Business (API) → Şablonlar'da yazar.)
3. Değişkenler: Başlık {{1}} ve Gövde {{1}} "Kaydın işletme adı" kalsın; "Kayıtta boşsa" kutularına sırasıyla
   `Merhaba` ve `Değerli işletme` yazın. Gövde {{2}} için **Sabit metin** seçip `demo.test` yazın.
4. "Sandbox" kutusunu **işaretlemeyin.** **Gönderim özetini göster**.

**Ne görmelisin:**

- Şablon seçilince **şablonun tam metni** (Başlık, Gövde, Altbilgi, Butonlar) görünür; `{{1}}`, `{{2}}` sarı
  vurgulu. Yanında **Önizleme**: değişkenlerin yerinde "Örnek İşletme", "demo.test" gibi örnek değerler.
- Özet: "Test modu açık: kampanya yalnızca Ayarlar'daki test numaralarına gider".
- **1 alıcıya gönderilecek** (Örnek Kırtasiye, test numarası). Hariç: İleti reddi 1, İlgilenilmiyor olarak işaretli 1,
  WhatsApp izni yok 32, Bireysel; İYS beyanı yok 1, **Test modu: test numarası değil 4** (Sahte Fırın, Kurgu Eczane,
  Hayali Kuaför, reklamdan gelen kişi).
- Tahmini Meta ücreti yazar (demoda ücret oluşmaz).

**Ne yap:** **Kampanyayı başlat**.

- [ ] Özet düğmeyle açıldı, sayılar rehberle aynı.
- [ ] Kampanya detayında gönderim servisi uyarısı göründü.
- [ ] WhatsApp şablonunun tam metni ve önizlemesi göründü.

---

## 9. Kampanyayı işçiyle gönderme

Mesajları uygulamanın kendisi değil, ayrı çalışan **gönderim işçisi** (gönderim servisi) gönderir. İşçi çalışmazsa
kampanyalar "Kuyrukta" bekler ve kampanya detayında uyarı görünür.

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
[...] alınan 18, gönderilen 11, bekletilen 5, hariç 2, başarısız 0, ...
```

**Ne yap:** Tarayıcıda **İletişim**'e dönüp kampanyaların detayını açın (açık bir detay sayfası 10 saniyede bir kendini
yeniler).

**Ne görmelisin:**

- **E-posta:** 5 mesaj "Gönderildi", 3 mesaj "Kuyrukta" ("Günlük sınır doldu, ertesi güne kaldı"). Kuyrukta mesaj
  olduğu için "Gönderim kuyrukta — gönderim servisi az önce çalıştı." (ya da "en son X dakika önce") yazar; kutu
  artık kırmızı değildir.
  - **Kaydedilen mesajı göster** ile sandbox'a kaydedilen metni görebilirsiniz: `{isletme}` yerine işletme adı (ad
    yoksa "Merhaba,") ve altta gönderen bilgileri.
- **SMS:** 5 "Gönderildi", 2 "Kuyrukta" (günlük sınır), hariçler arasında **"Cep telefonu değil" 3**: Kurgu Oto
  Servis ile iki sabit hatlı Google kaydı.
- **WhatsApp:** Örnek Kırtasiye'ye "Gönderildi"; kampanya "Tamamlandı". Diğerleri "Hariç", nedenleriyle.
  - Gerçek Meta olmadığı için "Teslim edildi" ya da "Okundu" bildirimi **gelmez**. Bu beklenen bir durumdur.

İşçiyi durdurmak için ikinci terminalde `Ctrl + C`. Yalnızca tek tur çalıştırmak isterseniz:

```
npm run demo:isci -- --bir-kez
```

İşçi 5 dakikadan uzun süre çalışmazsa, kuyrukta mesajı olan kampanyaların detayında yöneticiye yeniden kırmızı uyarı
çıkar.

- [ ] İşçi çalıştı, mesajlar "Gönderildi" oldu.
- [ ] Günlük sınırı aşan mesajlar "Kuyrukta" kaldı; sabit hatlı Google kayıtları SMS'ten düştü.

---

## 10. Ret verme ve sonrasında gönderim yapılmaması

Bu adımın amacı şunu görmek: ret verilen kişiye, kampanya ret'ten **önce** oluşturulmuş olsa bile mesaj gitmez.

**Ne yap:**

1. İşçiyi durdurun (ikinci terminalde `Ctrl + C`).
2. Yeni bir **SMS** kampanyası başlatın (ad `Ret testi`, Etiket `demo`). Kampanya detayındaki **Alıcılar**
   listesinde "Sahte Fırın"ın **Kuyrukta** olduğunu görün. (Özet yalnızca sayı gösterir; isimleri detayda görürsünüz.)
3. **Kayıtlar**'da "Sahte Fırın"ı açın (Ara: `0500 000 00 02`) ve **İleti reddi işaretle**'ye basın.
4. Açılan pencerede önce **Vazgeç**'e basın, sonra düğmeye yeniden basıp **Ret ver**'e basın.
5. İşçiyi tek tur çalıştırın: `npm run demo:isci -- --bir-kez`, sonra kampanya detayını yenileyin.

**Ne görmelisin:**

- Onay penceresi: başlıkta **"Ret: Sahte Fırın"**, altında "Bu kişiye hiçbir kanaldan ileti gönderilmeyecek ve bu
  işlem geri alınamaz." **Vazgeç** dediğinizde hiçbir şey değişmez.
- **Ret ver**'den sonra sağ üstte "İleti reddi kaydedildi." bildirimi; ileti izni kırmızı **Ret · <tarih> · İleti
  reddi işaretlendi · Demo Yönetici** olur. "İleti reddi işaretle" ve "İzin alındı" düğmeleri kaybolur. **Ret geri
  alınamaz**; yönetici de değiştiremez.
- Kampanya detayında "Sahte Fırın" satırı **Hariç — İleti reddi** olur; mesaj gönderilmemiştir. (Günlük SMS sınırı
  dolduğu için diğer alıcılar "Kuyrukta" kalır; bu normaldir.)
- Yeni bir kampanya özetinde bu kişi her kanalda "İleti reddi" olarak hariç sayılır.

Aynı onay penceresi WhatsApp izni bölümündeki **Ret istedi** düğmesinde ve İletişim → WhatsApp günlük listedeki
**Ret istedi** düğmesinde de çıkar. İçe aktarılan dosyada "ret" işaretli kişi varsa önizlemede aynı uyarıyla bir onay
kutusu çıkar.

- [ ] Ret onay penceresi çıktı; Vazgeç hiçbir şey değiştirmedi.
- [ ] Ret sonrası işçi o kişiye göndermedi.
- [ ] Ret geri alınamıyor.

---

## 11. WhatsApp Business ayarları ve test modu kilidi

Gerçek kullanımda test modu, Meta'dan imzalı teslim bildirimi gelene kadar kapatılamaz. Bu kural, yanlış
ayarlanmış bir bağlantıyla herkese mesaj gönderilmesini önler.

**Ne yap:** Yönetici olarak **Ayarlar → WhatsApp Business (API)** bölümüne gidin (sayfanın alt kısmı).

**Ne görmelisin:**

- Numara "+90 850 000 00 00 — Deneme İşletmesi", Numara sahipliği "Doğrulandı (numara bu WhatsApp Business hesabına
  ait)", Kalite "Yüksek (yeşil)", Mesajlaşma limiti **"Günde 10.000 kişi"** ve altında sade bir açıklama.
- Alanların altında kısa açıklamalar: "WhatsApp Business hesap kimliği (WABA ID)", "Telefon numarası kimliği (Phone
  Number ID) … telefon numarasının kendisi değildir", erişim anahtarı ve App Secret ne işe yarar, bildirim adresi
  (callback URL) ve "Webhook" ne demek.
- **Test modu ve sınır**: "Test modu: kampanyalar yalnızca aşağıdaki test numaralarına gider." kutusu **işaretli ve
  baştan pasiftir** (tıklanamaz). Altında "Kapatmak için webhook doğrulanmış olmalı ve imzası doğrulanmış en az bir
  mesaj durumu bildirimi alınmış olmalı." yazar. Ayrı bir hata mesajı çıkmaz.
- Test numaraları kutusunda **+90 500 000 00 01** (biçimlendirilmiş) yazar.

Demoda Meta bağlantısı olmadığı için bu kilit **hiç açılmaz**. Beklenen davranış budur.

**Ne yap:** **Bağlantıyı test et**'e basın.

**Ne görmelisin:** Sağ üstte "Bağlantı çalışıyor." bildirimi; "Son kontrol" zamanı güncellenir.

- [ ] Test modu kutusu pasif ve açıklamalı.
- [ ] Bağlantı testi bildirimle onaylandı; limit "Günde 10.000 kişi" görünüyor.

---

## 12. Kota ve sınırlar

### 12a. Places kotası

**Ne yap:** **Ayarlar**'da "Places kullanımı" çubuğuna bakın. Sonra Kayıtlar'da bir sayfa açın ve **Göster**'e
basmadan geri dönün; sonra bir Google kaydının detayını açın.

**Ne görmelisin:** Listeyi açmak birim harcamaz; **Göster** (3 birim / kayıt), detay açılışı (4 birim) ve taramalar
harcar. Çubuğun altında "Tarama, istenince gösterilen Google bilgileri ve kayıt detayı kota birimi kullanır; kayıt
listesi kendiliğinden birim harcamaz." yazar.

**Ne yap:** Kotayı doldurun. Üçüncü bir terminalde (ya da işçi terminalinde, işçiyi durdurduktan sonra) şunu
çalıştırın:

```
npm run demo:kota -- 0
```

Ardından sayfaları yenileyin.

**Ne görmelisin:**

- **Kayıtlar**'ın üstünde kırmızı kota kutusu: "Bu ayki veri kotanız doldu. İşletme bilgileri ve taramalar ay sonuna
  kadar durduruldu; kendi verileriniz görünmeye devam eder."
- Bir satırda **Göster**'e basınca "İşletme bilgisi gösterilemiyor (kota doldu)" yazar.
- Bir Google kaydının detayını açınca Google bilgileri kendiliğinden çekilmez: "Bu ayki Places kotanızın %80'i
  kullanıldı; Google bilgileri kendiliğinden çekilmedi." ve **Google bilgilerini göster (4 birim)** düğmesi. (Aynı
  davranış kota %80'i geçince başlar; "İlgilenilmiyor" işaretli kayıtlarda da detay kendiliğinden çekilmez.)
- **Bölge taraması**'nda **Taramayı başlat** düğmesi **pasiftir**; üstünde "Bu ayki veri kotanız doldu. Yeni tarama
  ay sonuna kadar yapılamaz." yazar. Tarama başlamaz.

**Ne yap:** Kotayı geri açın:

```
npm run demo:kota -- 1000
```

> Normal `npm run kota` komutu **gerçek** veritabanına yazar; demo için yalnızca `npm run demo:kota` kullanın.

### 12b. Günlük gönderim sınırı

Adım 8 ve 9'da gördünüz: demoda günde en fazla 5 e-posta ve 5 SMS gönderilir. Fazlası "Kuyrukta" kalır ve ertesi
gün (İstanbul saatiyle) gönderilir. **Ayarlar**'da "Gönderim saatleri ve sınırlar" bölümünde günlük sınırlar yazar.
Gerçek varsayılanlar 300 e-posta ve 200 SMS'tir.

Aynı bölümde demo gönderim saatleri **00:00 – 00:00** görünür: demo günün her saatinde gönderir; bitişteki 00:00 gün
sonu (gece yarısı) demektir. **Kaydet**'e basınca "Kaydedildi" bildirimi çıkar (gerçek varsayılan 09:00 – 20:00).

- [ ] Kota dolunca Göster ve tarama durdu; detay kendiliğinden çekilmedi.
- [ ] Kota geri açılınca bilgiler yeniden geldi.

---

## 13. CSV dışa aktarma

**Ne yap:** **Kayıtlar**'da isterseniz bir süzgeç seçin, sonra **CSV dışa aktar**'a basın. İnen dosyayı Excel'de
açın.

**Ne görmelisin:**

- Türkçe karakterler düzgün görünür; sütunlar ayrı ayrıdır.
- Başlıklar Türkçedir: "Google yer kimliği (place_id)", "Kaynak", "Durum", "İleti izni", "Alıcı türü", "İnceleme",
  "İşletme adı", "Yetkili adı", "E-posta", "Ek telefon", "Etiketler", "Notlar", tarihler.
- Değerler de Türkçedir: "Yeni", "Bekliyor", "Tacir / esnaf", "Google tarama", "İncelenmedi" (kod değerleri yok).
- Google kayıtlarının **adı, adresi ve Google telefonu dosyada yoktur.** Yalnızca `place_id` (`mock_…`) ve sizin
  girdiğiniz bilgiler vardır. Google kuralları gereği bu bilerek böyledir.
- Süzgeç seçtiyseniz yalnızca süzülen kayıtlar dosyadadır. Varsayılan olarak "İlgilenilmiyor" işaretliler hariçtir.

- [ ] Dosya Excel'de düzgün açıldı; başlık ve değerler Türkçe.
- [ ] Google içeriği dışa aktarılmadı.

---

## 14. WhatsApp günlük liste (isteğe bağlı)

**Ne yap:** **İletişim** sayfasının altındaki **WhatsApp günlük liste** bölümünde Durum'u **Yeni** seçip **Bugünkü
listeyi doldur**'a basın (düğme, sayfa yüklenip liste bilgisi gelene kadar birkaç saniye pasif kalabilir).

**Ne görmelisin:**

- "25 kayıt sıraya eklendi · hariç: İleti reddi 1, Bireysel ve onay yok 2, İlgilenilmiyor olarak işaretli 1, İletişim
  bilgisi yok 2" gibi bir özet (sayılar önceki adımlarda eklediklerinize göre değişebilir).

- "Sıradaki işletme" kartı. Kayıt Google kaydıysa ve kendi adınız yoksa "Google kaydı · ad girilmemiş" ve altında
  **Göster (3 birim)** yazar; basınca Google'daki ad yalnızca ekranda görünür.
- **WhatsApp'ta aç** WhatsApp'ı yeni sekmede açar (demoda gerçek bir WhatsApp sohbeti açılır; mesaj göndermeyin).
  Numara Google'dan alınıyorsa aynı işlem Google'daki adı da getirir ve listede gösterir; ek birim harcanmaz.
- **Ret istedi** düğmesi, adım 10'daki onay penceresini açar.

- [ ] Google kaydının adı istenince göründü.

---

## 15. Bitirme ve sıfırlama

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
| Kampanya hep "Kuyrukta", detayda kırmızı "gönderim servisi" uyarısı | İşçi çalışmıyor. İkinci terminalde `npm run demo:isci`. |
| Giriş düğmesi "Yükleniyor…" yazıyor | Sayfa henüz yükleniyor; birkaç saniye bekleyin. |
| Harita görünmüyor | Tarayıcı harita anahtarı tanımlı değil. Adres ya da enlem/boylam ile devam edin. |
| Listede Google adları yok | Bilerek böyle: **Göster** ya da **Bu sayfadaki Google bilgilerini göster** ile isteyin. |
| WhatsApp mesajı "Teslim edildi" olmuyor | Demoda Meta yok; teslim bildirimi gelmez. Beklenen durum. |

---

## 16. Otomatik testler

Elle denemeden bağımsız olarak, uygulamanın kurallarını kontrol eden otomatik testler vardır. Demo açıkken de
çalıştırılabilir; testler kendi geçici veritabanlarını kullanır.

| Komut | Ne kontrol eder | Süre |
|---|---|---|
| `npm test` | Bütün otomatik testler (kiracı izolasyonu, ret, kota, liste maliyeti, içe aktarma, kampanya, WhatsApp, yedek, demo kurulumu…) | 1–3 dk |
| `npm run typecheck` | Kod türleri tutarlı mı | ~30 sn |
| `npm run lint` | Kod kuralları (ör. veritabanına yalnızca izin verilen yerlerden erişim) | ~30 sn |
| `npm run build` | Uygulama yayına hazır derlenebiliyor mu | 1–2 dk |

### Sonuçlar nasıl okunur?

**`npm test` başarılıysa** sonda şuna benzer satırlar görünür:

```
 Test Files  29 passed (29)
      Tests  380 passed (380)
```

"passed" geçti demektir. Sayılar zamanla değişebilir; önemli olan **"failed" kelimesinin hiç olmaması**.

**Başarısızsa** şöyle görünür:

```
 FAIL  tests/kampanya.test.ts > ... > test adı
 AssertionError: expected 5 to be 6
 Test Files  1 failed | 28 passed (29)
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
