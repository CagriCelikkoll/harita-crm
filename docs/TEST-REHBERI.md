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
> kampanyaları "test modunda" çalışır: hiçbir mesaj gerçekten gönderilmez, yalnızca kaydedilir.
> Demoya **gerçek kişi bilgisi girmeyin.**

**Başarılı işlemler** (kaydetme, durum değiştirme, not ekleme, kişi ekleme, bağlantı testi…) ekranın **sağ üstünde**
birkaç saniye görünen yeşil bir bildirimle (✓) onaylanır. Bir işlemden sonra bu bildirimi görmüyorsanız not alın.

**Menü:** Sol menüde **Panel, Bölge tara, Kayıtlar, Kampanyalar, Ayarlar** vardır. Menünün altında bu ayki Google
kullanımınız yüzde olarak görünür. Ayarlar kendi içinde bölümlere ayrılır (Çalışma alanı, Ekip ve roller, Kullanım
ve paket, Gönderen bilgileri, Saatler ve sınırlar, WhatsApp listesi, WhatsApp (Meta), SMS, E-posta, Veri saklama).

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
| Google kaynaklı kayıtlar | Kadıköy'de sahte bir "emlak ofisi" taramasından gelen 10 kayıt (henüz incelenmemiş). Google'daki adları ve adresleri saklanmaz; ekranda gösterilir (bu ayki kullanım %80'e ulaşana kadar kendiliğinden, sonra **Göster**'e basınca). Değerler sahte istemcinin uydurduğu adlardır (ör. "Bora Emlak 852"). |
| Elle eklenen ve içe aktarılan kayıtlar | Örnek Kırtasiye, Sahte Fırın, Hayali Kuaför, Kurgu Oto Servis, Örnek Bireysel Müşteri |
| Reklamdan gelen kişi | Reklamdan Gelen Deneme Kişi |
| Ret verilmiş kayıt | "Ret Vermiş Örnek İşletme" (0500 000 00 09, `ret.ornek@demo.test`) |
| Sabit hatlı Google kayıtları | İki Google kaydının ("Görüşme" ve "İlgilenmiyor" durumundaki, `demo` etiketli olanlar) telefonu bilerek sabit hattır: SMS'te "Cep telefonu değil" nedeniyle düşmeleri görülebilsin. |
| WhatsApp | Sahte bağlantı (test modunda), 3 şablon (biri kampanyada kullanılamaz; bkz. adım 8c). Test numarası: **+90 500 000 00 01** (Örnek Kırtasiye). |
| Sınırlar (demo için düşük) | Günde en fazla 5 e-posta ve 5 SMS. Google kullanımı yüzde olarak gösterilir (Ayarlar → Kullanım ve paket). |

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

- **Panel** açılır. Üstte dört özet: **Toplam kayıt 17**, **İletişimde + görüşme 4**, **Kazanıldı 2**, **Bu ay
  gönderilen mesaj 0**.
- **Sıradaki işler**: "10 incelenmemiş tarama sonucu" ve "WhatsApp test modunda" gibi yapılacak işler (her biri
  ilgili sayfaya götürür). Altında renkli durum hunisi, son taramalar ve son kampanyalar.
- Panelde kullanım/kota bilgisi **yoktur**; kullanım yalnızca menünün altındaki göstergede (şu an **%0**) ve
  Ayarlar → Kullanım ve paket'te görünür.
- Sol menüde **Panel, Bölge tara, Kayıtlar, Kampanyalar, Ayarlar**.

- [ ] Yönetici girişi çalıştı; panel sayıları yukarıdaki gibi.

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
| Ayarlar menüsü | Bütün bölümler | Yalnızca **Çalışma alanı, Ekip ve roller, Kullanım ve paket, Saatler ve sınırlar, WhatsApp listesi** |
| Ayarlar → Çalışma alanı | Değiştirebilir | Görür ama alanlar kilitli (gri), "Bu ayarları yalnızca yöneticiler değiştirebilir." yazar |
| Ayarlar → WhatsApp (Meta), SMS, E-posta, Gönderen bilgileri, Veri saklama | Görünür | **Menüde yok**; adresi elle yazarsanız (ör. `/ayarlar/whatsapp`) Çalışma alanı'na döner |
| Ayarlar → Ekip ve roller | Davet eder, üye çıkarır | "Kişi davet etmek için yönetici yetkisi gerekir."; **Çıkar** düğmesi yok |
| Kampanyalar → Yeni kampanya, 1. adım (kanal) | E-posta, SMS, **WhatsApp (API)** | Yalnızca E-posta, SMS |
| Kayıtları görme, düzenleme, not ekleme, ret verme | Var | Var |

- [ ] Üye, kanal ayarlarını (WhatsApp, SMS, E-posta) göremiyor; adresle de açamıyor.
- [ ] Üye, kampanya kanallarında "WhatsApp (API)"yi göremiyor.

Bundan sonraki adımları **yönetici** olarak yapın.

---

## 4. Bölge tara ve sonuçları inceleme

### 4a. Tarama

**Ne yap:** **Bölge tara**'ya gidin. Sol tarafta form, sağda harita vardır.

1. **Merkez** kutusuna `Bağdat Caddesi, Kadıköy` yazıp yanındaki **Bul** düğmesine basın.
2. Kategorilerden **Kafe**'yi seçin.
3. Yarıçapı olduğu gibi bırakın (form son taramanın ayarlarıyla gelir; demoda 1,5 km).
4. **Taramayı başlat**'a basın.

**Ne görmelisin:**

- **Bul**'dan sonra kutunun altında "Adres araması: Bağdat Caddesi, Kadıköy" yazar.
- Formun altında "Örnek veri kullanılıyor (PLACES_MOCK)" notu.
- Tarama birkaç saniye içinde biter: **Tarama durumu** "Tamamlandı · 17 işletme bulundu".
- Haritanın altında sonuç kartları: başlıkta "Son tarama: Bağdat Caddesi, Kadıköy · Kafe · 1.5 km" ve "17 işletme
  bulundu · 17 incelenmedi · 0 ilgilenilen". 17 kartın her birinde Google'daki ad, adres, mesafe ve küçük bir
  **Google** etiketi vardır (kullanım %80'in altındayken bunlar kendiliğinden gelir; saklanmaz).

Harita yerine "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY tanımlı değil" yazıyorsa sorun değil: harita anahtarı yoksa
merkezi adresle girersiniz.

- [ ] Tarama tamamlandı (17 işletme), kartlar adlarıyla göründü.

### 4b. Sonuçları incele

**Ne yap:**

1. İlk kartta **İlgilen**'e basın.
2. İkinci kartta **Geç**'e basın.
3. Diğer kartlara dokunmayın.

**Ne görmelisin:**

- İlk kart "Kayıtlara eklendi" olur, yanında **Geri al** vardır.
- İkinci kart "Geçildi" olur.
- Başlıktaki özet "15 incelenmedi · 1 ilgilenilen" olur.
- İlgilendiğiniz işletmeye ad sormaz: adı daha sonra Kayıtlar'da, işletmeyle görüştüğünüzde kendiniz yazarsınız
  (adım 5).

Geçtiğiniz işletmeler silinmez (sonraki taramada yeniden gelmesinler diye); **Kayıtlar**'da "İlgilenilmiyor"
olarak durur ve hiçbir kampanyaya girmez.

- [ ] İlgilen / Geç işaretleri göründü, özet sayısı güncellendi.

### 4c. Önceki taramalar ve Tekrar kullan

**Ne yap:** Formun altındaki **Önceki taramalar**'ı açın. Demodaki Emlak ofisi taramasında **Tekrar kullan**'a
basın.

**Ne görmelisin:**

- Listede 2 tarama vardır; Emlak ofisi satırında "Kadıköy, İstanbul · 10 bulundu · 10 incelenmedi".
- **Tekrar kullan**'dan sonra "Ayarlar forma alındı; taramayı başlatabilirsiniz." yazar ve kategori "Emlak ofisi"
  seçili olur.

- [ ] "Tekrar kullan" formu doldurdu.

---

## 5. Kayıtlar ve kayıt ayrıntısı

**Ne yap:** **Kayıtlar**'a gidin.

**Ne görmelisin:**

- Üç sekme: **İlgilendiklerim 8**, **İncelenmemiş 25**, **Tümü 34**.
- **İncelenmemiş** sekmesinde tarama sonuçları Google'daki adlarıyla ve **Google** etiketiyle listelenir. Listenin
  altında "'Google' etiketli bilgiler … kaydedilmez" ve "İşletme bilgileri: Google Maps" yazar.
- Liste ve sayfa başına 20 satır; **Tümü** sekmesinde altta sayfalama (‹ 1 / 2 ›).

**Ne yap:**

1. **Tümü** sekmesinde **Filtreler**'e basın, **Durum** = "Görüşme" seçip **Uygula**'ya basın.
2. Filtreleri **Temizle** ile kaldırın.
3. **Ara** kutusuna `demo.test` yazıp **Ara**'ya basın (yalnızca sizin girdiğiniz alanlarda arar).

**Ne görmelisin:** Durum süzgeciyle **2 kayıt**; Filtreler düğmesinde **1** sayısı. `demo.test` aramasıyla **8 kayıt**.

**Ne yap:** **İlgilendiklerim** sekmesinde 4b'de ilgilendiğiniz kafeyi açın (adı Google'dan gelir, ör.
"Kordon Kafe 258").

**Ne görmelisin:** Sağda ayrıntı paneli açılır:

- Başlıkta Google'daki ad ve adres.
- Sekmeler: **Genel**, **İletişim izni**, **Geçmiş**.
- Genel'de "İşletme adı (sizin kaydınız)" kutusu **boştur**; gri ipucu "İşletmeyle görüştüğünüzde adını buraya
  yazın". Google'daki ad kutuya kopyalanmaz.
- "İletişim bilgileri (Google Haritalar)" kutusu: Telefon, Web sitesi, Puan ve "Google Haritalar'da aç". Bunlar
  saklanmaz.

**Ne yap:**

1. Durum çiplerinden **İletişimde**'ye basın.
2. İşletme adına `Deneme Kafe`, yetkili adına `Deneme Yetkili` yazıp **Kaydet**'e basın.
3. **Geçmiş** sekmesinde bir not yazıp ekleyin.

**Ne görmelisin:**

- Her işlemden sonra sağ üstte bildirim: "Durum güncellendi.", "Kaydedildi.", "Not eklendi.".
- Listede satırın adı ve durumu sayfa yenilenmeden değişir.
- Geçmiş'te sırayla notunuz, "Bilgi güncellendi", "Durum değişti · Yeni → İletişimde" ve "Eklendi".

**Ne yap:** "Hayali Kuaför"ü açın (Tümü sekmesi, Ara: `elif.kurgu`).

**Ne görmelisin:** Genel sekmesinde kayıt notu: "Demo notu: WhatsApp izni henüz alınmadı." ve **Düzenle**. Kayıt
notu, kişi eklerken ya da içe aktarırken girilen kalıcı nottur; tarihli notlar Geçmiş'ten eklenir.

### 5b. Kişi ekle

**Ne yap:** **Kayıtlar → Kişi ekle**. Ad soyad `Deneme Kişi`, telefon `0500 000 00 30` yazın. **Alıcı türü**nü
seçmeden **Kaydet**'e basmayı deneyin; sonra "Tacir/esnaf (işletme)" seçip **Kaydet**'e basın.

**Ne görmelisin:**

- Alıcı türü "Seçin" ile başlar ve zorunludur; seçmeden kaydedilmez (tarayıcı alanı işaretler).
- Kaydedince Kayıtlar açılır, sağ üstte "Kişi eklendi." bildirimi; "Deneme Kişi"nin ayrıntısı açık, altında
  "Elle eklendi".

- [ ] Sekme sayıları ve süzgeçler doğru çalıştı.
- [ ] Ad kutusu boş geldi; Google adı kopyalanmadı.
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
- "Sahte Fırın" ikinci kez **eklenmez** (Tümü sekmesi, Ara: `0500 000 00 02` → 1 kayıt).
- "Ret Örneği Yeniden (Sahte)" kaydının adının altında kırmızı **Engelli** etiketi vardır; ayrıntısını açınca "Bu
  kişinin adreslerinden biri engel listesinde (daha önce ret verilmiş); hiçbir kanaldan ileti gönderilmez." yazar.

- [ ] Önizleme sayıları tablo ile aynı.
- [ ] Beyan onayı olmadan içe aktarma yapılamadı.
- [ ] Çakışan kayıt çoğaltılmadı; engelli kişi işaretli.

---

## 7. WhatsApp izni

**Ne yap:**

1. **Kayıtlar**'da "Hayali Kuaför"ü açın (Tümü sekmesi, Ara: `elif.kurgu`).
2. **İletişim izni** sekmesinde WhatsApp izninin yanındaki **Düzenle**'ye basın.
3. **İzin var** seçin. İzin kaynağı "Form", izin tarihi olarak geçmiş bir gün girin, **Kaydet**'e basın.

**Ne görmelisin:**

- "WhatsApp izni kaydedildi." bildirimi; "İzin var · Form · <tarih>" görünür.
- Listede satırın **İzin** sütununa WhatsApp simgesi **sayfa yenilenmeden** eklenir.

**Ne yap:** "Örnek Bireysel Müşteri"yi açın (Ara: `bireysel.ornek`).

**Ne görmelisin:**

- İletişim izni sekmesinde WhatsApp izninin yanında "İYS beyanı yok (kampanyaya girmez)".
- Genel sekmesinde bireysel kayıtlara yalnızca ileti izni "Onaylı" ise gönderim yapılacağını söyleyen not.

**Ne yap:** Ara: `ret.ornek` (2 kayıt çıkar: "Ret Vermiş Örnek İşletme" ve 6. adımda içe aktarılan "Ret Örneği
Yeniden (Sahte)"). **Ret Vermiş Örnek İşletme**'yi açıp **İletişim izni** sekmesine geçin.

**Ne görmelisin:**

- İleti izni: **Ret · <tarih> · İleti reddi işaretlendi · Demo Yönetici** (ne zaman, nasıl ve kimin verdiği).
- WhatsApp izninde de aynı "Ret · …" yazar; **Düzenle** düğmesi yoktur ve "Ret verilmiş bir kişinin izni
  değiştirilemez." yazar.

- [ ] İzin verildi; liste sayfa yenilenmeden güncellendi.
- [ ] Ret verilmiş kişide "Ret · tarih · nasıl" görünüyor, izin değiştirilemiyor.

---

## 8. Kampanyalar (test modu)

Kampanyalar **Kampanyalar → Yeni kampanya** ile, 4 adımlı bir sihirbazla oluşturulur: **1 Kanal → 2 Alıcılar →
3 Mesaj → 4 Gönder**. Adımlar arasında **İleri** / **Geri** ile geçilir; 3. adımdaki **Gönderim özetini göster** sizi
4. adıma götürür. 4. adımdaki özet yalnızca **sayıları** gösterir; kimin hariç kaldığını kampanya başladıktan sonra
ayrıntı sayfasının **Alıcılar** sekmesinde görürsünüz.

### 8a. E-posta kampanyası

**Ne yap:**

1. **1 Kanal:** **E-posta** kartını seçin → **İleri**.
2. **2 Alıcılar:** Kampanya adı `Demo e-posta`; Durum ve Alıcı türü "Tümü" kalsın → **İleri**.
3. **3 Mesaj:** Konu `Merhaba`, mesaj `Merhaba {isletme}, bu bir deneme mesajıdır.` → **Gönderim özetini göster**.

**Ne görmelisin:**

- 1\. adımda kanal kartları: E-posta "Bağlı değil" (test modunda çalışacağını söyleyen notla), SMS "Bağlı değil",
  WhatsApp (API) "Bağlı".
- 2\. adımda canlı sayı: **"8 kişiye gidecek · 32 hariç"** ve hariçlerin dökümü: İleti reddi 1, Engel 1, İletişim
  bilgisi yok 27, Bireysel ve onay yok 2, **İlgilenilmiyor 1** (4b'de geçtiğiniz kafe).
- 4\. adımda (rehberi sırayla izlediyseniz):
  - **8 alıcı**; Hariç tutulanlar 32 / 40.
  - "Günlük sınır nedeniyle sonraki günlere kalacak 3" (sınır günde 5).
  - "Kendi kaydınızda işletme adı yok: 3 kayıt" (Google'dan gelen ad mesajlara yazılmaz).
  - "E-posta bağlı değil: kampanya test modunda çalışır (gerçek gönderim yapılmaz, mesajlar kaydedilir)."

**Ne yap:** **Kampanyayı başlat**'a basın.

**Ne görmelisin:**

- Kampanyanın **ayrıntı sayfası** açılır: "Gönderiliyor" ve "Test modu: gerçek gönderim yok" etiketleri, ilerleme
  0 / 8, Kuyrukta 8, Hariç 32.
- **"Gönderim kuyrukta — gönderim servisi henüz hiç çalışmadı."** yazan kırmızı bir kutu ve altında yöneticiye
  uyarı. (Servisi adım 9'da başlatacaksınız.)
- Altta sekmeler: **Alıcılar**, **Mesaj**, **Geçmiş**. Alıcılar'da Google kayıtları gri, eğik "Google kaydı · ad
  girilmemiş" olarak görünür; yanlarında **Göster** vardır (ad yalnızca ekranda gösterilir, mesaja yazılmaz).

### 8b. SMS kampanyası

**Ne yap:** **Kampanyalar → Yeni kampanya**. Kanal **SMS**; ad `Demo SMS`, Etiket `demo`. Mesaj:
`Merhaba {isletme}, demo SMS denemesi.` → **Gönderim özetini göster** → **Kampanyayı başlat**.

**Ne görmelisin:**

- 2\. adımda: **"9 kişiye gidecek · 6 hariç"** (İleti reddi 1, İletişim bilgisi yok 2, Bireysel ve onay yok 2,
  **Cep telefonu değil 1**: Kurgu Oto Servis, 0212…).
- 3\. adımda SMS sayacı: "… karakter · 1 SMS".
- 4\. adımda: 9 alıcı; sonraki günlere 4; "Google'dan alınacak: 3 kayıt" (telefonu kayıtta olmayan, gönderim
  anında Google'dan alınacak) ve "Bu ayki kullanımınıza yaklaşık %2 eklenir."; işletme adı olmayan 4 kayıt.
- Bu 3 kaydın **2'si** demodaki bilerek sabit hatlı Google kayıtlarıdır. Numara ancak gönderim anında öğrenildiği
  için özette "gönderilecek" sayılırlar; işçi gönderirken "Cep telefonu değil" nedeniyle **düşer** (adım 9).

### 8c. WhatsApp (API) kampanyası (yalnızca yönetici)

**Ne yap:**

1. Kanal **WhatsApp (API)**; ad `Demo WhatsApp`. 2. adımda şu not görünür: "WhatsApp'ta gönderilecek kişi sayısı …
   son adımda hesaplanır."
2. Şablon olarak **kampanya_tanitim** seçin. (Listede 2 şablon vardır: kampanya_tanitim ve randevu_hatirlatma.
   Demodaki üçüncü şablon "butonsuz_pazarlama", abonelikten çıkma butonu olmadığı için kampanyada kullanılamaz;
   Ayarlar → WhatsApp (Meta)'da "Kullanılamaz" yazar.)
3. Değişkenler: Başlık {{1}} ve Gövde {{1}} "Kaydın işletme adı" kalsın; "Kayıtta boşsa" kutularına sırasıyla
   `Merhaba` ve `Değerli işletme` yazın. Gövde {{2}} için **Sabit metin** seçip `demo.test` yazın.
4. 4\. adımdaki "Test: Meta'ya gönderme, yalnızca şablon metnini kaydet" kutusunu **işaretlemeyin.**

**Ne görmelisin:**

- Şablon seçilince **şablonun tam metni** (Başlık, Gövde, Altbilgi, Butonlar) ve değişkenler görünür.
- 4\. adımda: Test modu açık notu ("kampanya yalnızca Ayarlar'daki test numaralarına gider").
- **1 alıcı** (Örnek Kırtasiye, test numarası). Hariç: İleti reddi 1, İlgilenilmiyor 1, WhatsApp izni yok 32,
  Bireysel İYS beyanı yok 1, **Test modu 4** (test numarası olmayanlar).
- Kalite, pay ("1.000 ileti / 24 saat") ve tahmini Meta ücreti (ör. $0.01; demoda ücret oluşmaz).

**Ne yap:** **Kampanyayı başlat**.

- [ ] Sihirbaz adımları çalıştı; canlı sayı ve özet rehberle aynı.
- [ ] Kampanya ayrıntısında gönderim servisi uyarısı ve Alıcılar / Mesaj / Geçmiş sekmeleri göründü.
- [ ] WhatsApp şablonunun tam metni göründü.

---

## 9. Kampanyayı işçiyle gönderme

Mesajları uygulamanın kendisi değil, ayrı çalışan **gönderim işçisi** (gönderim servisi) gönderir. İşçi çalışmazsa
kampanyalar "Kuyrukta" bekler ve kampanya ayrıntısında uyarı görünür.

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
[...] alınan 18, gönderilen 11, bekletilen 5, hariç 2, başarısız 0, ..., biten kampanya 1
```

**Ne yap:** Tarayıcıda **Kampanyalar**'a dönün ve kampanyaların ayrıntısını açın (açık bir ayrıntı sayfası 10 saniyede
bir kendini yeniler).

**Ne görmelisin:**

- Kampanya listesi: **Demo WhatsApp** "Tamamlandı" 1 / 1; **Demo SMS** "Gönderiliyor" 5 / 7 (8 hariç); **Demo
  e-posta** 5 / 8.
- **E-posta:** 5 mesaj "Gönderildi", 3 mesaj "Kuyrukta" (günlük sınır). Kutu artık kırmızı değildir; "gönderim
  servisi az önce çalıştı" (ya da "en son X dakika önce") yazar.
  - **Mesaj** sekmesinde konu ve şablon; alıcı satırındaki **Kaydedilen mesajı göster** ile test modunda kaydedilen
    metni görebilirsiniz (`{isletme}` yerine işletme adı; ad yoksa "Merhaba,").
- **SMS:** Gönderildi 5, Kuyrukta 2, Hariç 8. **Geçmiş** sekmesindeki nedenler: **Cep telefonu değil 3** (Kurgu Oto
  Servis ile iki sabit hatlı Google kaydı), Günlük sınır doldu 2.
- **WhatsApp:** Örnek Kırtasiye'ye "Gönderildi"; kampanya "Tamamlandı". Diğerleri "Hariç", nedenleriyle.
  - Gerçek Meta olmadığı için "Teslim edildi" ya da "Okundu" bildirimi **gelmez**. Bu beklenen bir durumdur.

İşçiyi durdurmak için ikinci terminalde `Ctrl + C`. Yalnızca tek tur çalıştırmak isterseniz:

```
npm run demo:isci -- --bir-kez
```

İşçi 5 dakikadan uzun süre çalışmazsa, kuyrukta mesajı olan kampanyaların ayrıntısında yöneticiye yeniden kırmızı
uyarı çıkar; Panel'in "Sıradaki işler"inde de "Gönderim servisi çalışmıyor" görünür.

- [ ] İşçi çalıştı, mesajlar "Gönderildi" oldu.
- [ ] Günlük sınırı aşan mesajlar "Kuyrukta" kaldı; sabit hatlı Google kayıtları SMS'ten düştü.

---

## 10. Ret verme ve sonrasında gönderim yapılmaması

Bu adımın amacı şunu görmek: ret verilen kişiye, kampanya ret'ten **önce** oluşturulmuş olsa bile mesaj gitmez.

**Ne yap:**

1. İşçiyi durdurun (ikinci terminalde `Ctrl + C`).
2. Yeni bir **SMS** kampanyası başlatın (ad `Ret testi`, Etiket `demo`). Kampanya ayrıntısındaki **Alıcılar**
   sekmesinde "Sahte Fırın"ın **Kuyrukta** olduğunu görün.
3. **Kayıtlar**'da "Sahte Fırın"ı açın (Tümü sekmesi, Ara: `0500 000 00 02`), **İletişim izni** sekmesinde **İleti
   reddi işaretle**'ye basın.
4. Açılan pencerede önce **Vazgeç**'e basın, sonra düğmeye yeniden basıp **Ret ver**'e basın.
5. İşçiyi tek tur çalıştırın: `npm run demo:isci -- --bir-kez`, sonra kampanya ayrıntısını yenileyin.

**Ne görmelisin:**

- Onay penceresi: başlıkta **"Ret: Sahte Fırın"**, altında "Bu kişiye hiçbir kanaldan ileti gönderilmeyecek ve bu
  işlem geri alınamaz." **Vazgeç** dediğinizde hiçbir şey değişmez.
- **Ret ver**'den sonra sağ üstte "İleti reddi kaydedildi." bildirimi; ileti izni kırmızı **Ret · <tarih> · İleti
  reddi işaretlendi · Demo Yönetici** olur ve izin düğmeleri kaybolur. **Ret geri alınamaz**; yönetici de
  değiştiremez.
- İşçi satırında "hariç 1"; kampanya ayrıntısında "Sahte Fırın" satırı **Hariç · İleti reddi** olur; mesaj
  gönderilmemiştir. (Günlük SMS sınırı dolduğu için diğer alıcılar "Kuyrukta" kalır; bu normaldir.)
- Yeni bir kampanya özetinde bu kişi her kanalda "İleti reddi" olarak hariç sayılır.

Aynı onay penceresi WhatsApp izninin **Ret istedi** düğmesinde ve Kampanyalar → WhatsApp günlük liste'deki **Ret
istedi** düğmesinde de çıkar. İçe aktarılan dosyada "ret" işaretli kişi varsa önizlemede aynı uyarıyla bir onay
kutusu çıkar.

- [ ] Ret onay penceresi çıktı; Vazgeç hiçbir şey değiştirmedi.
- [ ] Ret sonrası işçi o kişiye göndermedi.
- [ ] Ret geri alınamıyor.

---

## 11. WhatsApp (Meta) ayarları ve test modu kilidi

Gerçek kullanımda test modu, Meta'dan imzalı teslim bildirimi gelene kadar kapatılamaz. Bu kural, yanlış
ayarlanmış bir bağlantıyla herkese mesaj gönderilmesini önler.

**Ne yap:** Yönetici olarak **Ayarlar → WhatsApp (Meta)**'ya gidin.

**Ne görmelisin:**

- Üstte rozetler: "Deneme İşletmesi · +90 850 000 00 00", **Bağlı**, **Kalite: Yüksek** (yeşil), **Meta sınırı: günde
  10.000 kişi**, **Test modu açık**.
- **Kurulum adımları**: 1. adım tamamlandı; 2. adım "sıradaki adım" (Bildirim aboneliğini etkinleştir); 3. adım
  önceki adımları bekliyor; 4. adım (test modunu kapatma) **kilitli**: "2. ve 3. adım tamamlanınca açılır."
- Kampanya payı %10 ve "Günde en fazla 1.000 kişi"; test numarası **+90 500 000 00 01**.
- Şablonlarda "butonsuz_pazarlama" yanında **Kullanılamaz**.
- Kimlikler ve bildirim adresi **Teknik ayrıntıları göster** altında katlıdır.

Demoda Meta bağlantısı olmadığı için 4. adım **hiç açılmaz**. Beklenen davranış budur.

**Ne yap:** **Bağlantıyı test et**'e basın.

**Ne görmelisin:** Sağ üstte "Bağlantı çalışıyor." bildirimi; "Son kontrol" zamanı güncellenir.

- [ ] Test modunu kapatma adımı kilitli ve açıklamalı.
- [ ] Bağlantı testi bildirimle onaylandı; sınır "günde 10.000 kişi" görünüyor.

---

## 12. Kullanım ve sınırlar

### 12a. Google kullanımı

Uygulama Google'dan aldığı bilgiler için aylık bir kullanım hakkı tutar ve bunu **yalnızca yüzde olarak**
gösterir: menünün altındaki göstergede ve **Ayarlar → Kullanım ve paket**'te (kategorilere göre: İşletme bilgileri,
Telefon ve web sitesi, Taramalar). Kullanım **%80**'e ulaşınca Google bilgileri artık kendiliğinden gösterilmez;
istediğinizde **Göster** ile gösterilir.

**Ne yap:** Kullanımı doldurun. Üçüncü bir terminalde (ya da işçi terminalinde, işçiyi durdurduktan sonra) şunu
çalıştırın:

```
npm run demo:kota -- 0
```

Ardından sayfaları yenileyin.

**Ne görmelisin:**

- **Ayarlar → Kullanım ve paket**: **%100**, "<Ay> ayı · 1 <sonraki ay>'ta sıfırlanır", kategori kutuları ve "Bu ayki
  kullanımınız doldu. İşletme bilgileri ve yeni taramalar ay sonuna kadar durduruldu; kendi verileriniz görünmeye
  devam eder." Menüdeki gösterge "%100, doldu".
- **Kayıtlar**'ın üstünde aynı metinle kırmızı kutu; Google kayıtları adsız gelir. Bir satırda **Göster**'e basınca
  "İşletme bilgisi gösterilemiyor (kota doldu)".
- Bir Google kaydının ayrıntısını açınca bilgiler kendiliğinden gelmez: "Bu ay otomatik gösterim sınırına
  ulaşıldı; bilgileri istediğinizde gösterilir." ve **Google bilgilerini göster** düğmesi.
- **Bölge tara**'da **Taramayı başlat** **pasiftir**; "Bu ayki veri kotanız doldu. Yeni tarama ay sonuna kadar
  yapılamaz." yazar.

**Ne yap:** Kullanımı geri açın:

```
npm run demo:kota -- 1000
```

> Normal `npm run kota` komutu **gerçek** veritabanına yazar; demo için yalnızca `npm run demo:kota` kullanın.

### 12b. Günlük gönderim sınırı

Adım 8 ve 9'da gördünüz: demoda günde en fazla 5 e-posta ve 5 SMS gönderilir. Fazlası "Kuyrukta" kalır ve ertesi
gün (İstanbul saatiyle) gönderilir. **Ayarlar → Saatler ve sınırlar**'da kutular: **E-posta 5 / gün**, **SMS 5 /
gün**, **WhatsApp listesi 30 / kişi**. Gerçek varsayılanlar 300 e-posta ve 200 SMS'tir.

Aynı bölümde demo gönderim saatleri **00:00 – 00:00** görünür: demo günün her saatinde gönderir; bitişteki 00:00 gün
sonu (gece yarısı) demektir. **Kaydet**'e basınca "Kaydedildi" bildirimi çıkar (gerçek varsayılan 09:00 – 20:00).

- [ ] Kullanım dolunca Göster ve tarama durdu; ayrıntı kendiliğinden çekilmedi.
- [ ] Kullanım geri açılınca bilgiler yeniden geldi.

---

## 13. CSV dışa aktarma

**Ne yap:** **Kayıtlar**'da bir sekme seçin (ör. İlgilendiklerim), **Filtreler**'i açıp **Bu listeyi CSV olarak
indir**'e basın. İnen dosyayı Excel'de açın. Bütün kayıtları indirmek için: **Ayarlar → Veri saklama**'daki dışa
aktarma.

**Ne görmelisin:**

- Türkçe karakterler düzgün görünür; sütunlar ayrı ayrıdır.
- Kayıtlar'dan inen dosyada yalnızca o sekmenin (ve seçili süzgeçlerin) kayıtları vardır; Veri saklama'dan inen
  dosyada hepsi.
- Başlıklar Türkçedir: "Google yer kimliği (place_id)", "Kaynak", "Durum", "İleti izni", "Alıcı türü", "İnceleme",
  "İşletme adı", "Yetkili adı", "E-posta", "Ek telefon", "Etiketler", "Notlar", tarihler.
- Değerler de Türkçedir: "Yeni", "Bekliyor", "Tacir / esnaf", "Google tarama", "İncelenmedi" (kod değerleri yok).
- Google kayıtlarının **adı, adresi ve Google telefonu dosyada yoktur.** Yalnızca `place_id` (`mock_…`) ve sizin
  girdiğiniz bilgiler vardır. Google kuralları gereği bu bilerek böyledir.

- [ ] Dosya Excel'de düzgün açıldı; başlık ve değerler Türkçe.
- [ ] Google içeriği dışa aktarılmadı.

---

## 14. WhatsApp günlük liste (isteğe bağlı)

**Ne yap:** **Kampanyalar → WhatsApp günlük liste** sekmesinde Durum'u **Yeni** seçip **Bugünkü listeyi doldur**'a
basın (düğme, liste bilgisi gelene kadar birkaç saniye pasif kalabilir).

**Ne görmelisin:**

- "26 kayıt sıraya eklendi · hariç: Bireysel ve onay yok 2, İleti reddi 1, İlgilenilmiyor olarak işaretli 1, İletişim
  bilgisi yok 2" gibi bir özet (sayılar önceki adımlarda yaptıklarınıza göre değişebilir).
- "Sıradaki işletme" kartı. Kayıt Google kaydıysa ve kendi adınız yoksa "Google kaydı · ad girilmemiş" ve **Göster**
  yazar; basınca Google'daki ad ("Google: Bora Emlak 838" gibi) yalnızca ekranda görünür.
- **WhatsApp'ta aç** WhatsApp'ı yeni sekmede açar (demoda gerçek bir WhatsApp sohbeti açılır; mesaj göndermeyin).
- **Ret istedi** düğmesi, adım 10'daki onay penceresini açar ("Ret: …").

- [ ] Google kaydının adı istenince göründü.

---

## 15. Bitirme ve sıfırlama

- Uygulamayı kapatmak için: ilk terminalde `Ctrl + C`. İşçiyi kapatmak için: ikinci terminalde `Ctrl + C`.
- Baştan denemek için: ikisini de kapatıp `npm run demo:hazirla`, sonra `npm run demo`.
- Demo dosyası `data/demo.db`'dir. Silmek isterseniz uygulama kapalıyken silebilirsiniz. Gerçek veritabanı
  (`data/app.db`) etkilenmez.
- Eski adresler (`/iletisim`, `/ayarlar`, `/tarama/inceleme`) yeni sayfalara yönlendirilir; yer imleriniz çalışmaya
  devam eder.

### Sık karşılaşılanlar

| Gördüğünüz | Anlamı ve çözüm |
|---|---|
| `demo.db kullanımda` | Uygulama ya da işçi açık. İkisini `Ctrl + C` ile kapatıp yeniden deneyin. |
| `Demo veritabanı yok` | Önce `npm run demo:hazirla` çalıştırın. |
| `Port 3000 is in use` | Normal `npm run dev` ya da başka bir demo açık. Onu kapatın. |
| Kampanya hep "Kuyrukta", ayrıntıda kırmızı "gönderim servisi" uyarısı | İşçi çalışmıyor. İkinci terminalde `npm run demo:isci`. |
| Giriş düğmesi "Yükleniyor…" yazıyor | Sayfa henüz yükleniyor; birkaç saniye bekleyin. |
| Harita görünmüyor | Tarayıcı harita anahtarı tanımlı değil. Merkezi adresle girerek devam edin. |
| Listede Google adları yok, satırlarda "Göster" var | Bu ayki kullanım %80'e ulaşmış: Google bilgileri artık kendiliğinden gelmez, **Göster** ile istenir. |
| WhatsApp mesajı "Teslim edildi" olmuyor | Demoda Meta yok; teslim bildirimi gelmez. Beklenen durum. |

---

## 16. Otomatik testler

Elle denemeden bağımsız olarak, uygulamanın kurallarını kontrol eden otomatik testler vardır. Demo açıkken de
çalıştırılabilir; testler kendi geçici veritabanlarını kullanır.

| Komut | Ne kontrol eder | Süre |
|---|---|---|
| `npm test` | Bütün otomatik testler (kiracı izolasyonu, ret, kullanım, liste maliyeti, içe aktarma, kampanya, WhatsApp, yedek, demo kurulumu, yeni düzen…) | 1–3 dk |
| `npm run typecheck` | Kod türleri tutarlı mı | ~30 sn |
| `npm run lint` | Kod kuralları (ör. veritabanına yalnızca izin verilen yerlerden erişim) | ~30 sn |
| `npm run build` | Uygulama yayına hazır derlenebiliyor mu | 1–2 dk |

### Sonuçlar nasıl okunur?

**`npm test` başarılıysa** sonda şuna benzer satırlar görünür:

```
 Test Files  31 passed (31)
      Tests  426 passed (426)
```

"passed" geçti demektir. Sayılar zamanla değişebilir; önemli olan **"failed" kelimesinin hiç olmaması**.

**Başarısızsa** şöyle görünür:

```
 FAIL  tests/kampanya.test.ts > ... > test adı
 AssertionError: expected 5 to be 6
 Test Files  1 failed | 30 passed (31)
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
