# Üç telefondaki rehberi birleştirip Harita CRM'e aktarma

Bu rehber, WhatsApp Business kullandığınız **üç ayrı telefonun** rehberini tek bir Gmail hesabında toplamayı, aynı
kişinin tekrarlarını temizlemeyi ve sonra hepsini Harita CRM'e almayı adım adım anlatır. Bilgisayar bilgisi
gerekmez; yaklaşık 30–60 dakika sürer.

Kısaca yol şu:

1. Her telefonun rehberini bir dosya olarak dışa aktarın.
2. Üç dosyayı tek Gmail hesabına (contacts.google.com) yükleyin ve her birine "Hat 1", "Hat 2", "Hat 3" etiketini verin.
3. Google'ın "Birleştir ve düzelt" özelliğiyle aynı kişinin tekrarlarını birleştirin.
4. Google'dan tek bir "Google CSV" dosyası indirin.
5. Bu dosyayı Harita CRM'de **Kayıtlar → İçe aktar** ile yükleyin.

> Telefonlarda hiçbir şey silinmez. Bu işlemler yalnızca rehberin bir **kopyasını** alır.

---

## Başlamadan önce bilmeniz gerekenler

- **Yalnızca rehbere kaydedilmiş numaralar gelir.** WhatsApp'ta yazıştığınız ama telefonun rehberine
  kaydetmediğiniz numaralar (sohbette yalnızca numara olarak görünenler) bu yolla **gelmez**. Önemli olanları
  başlamadan önce rehbere kaydedin. Harita CRM'e bağlı WhatsApp numaranıza yazan kişiler zaten Gelen kutusunda görünür.
- **WhatsApp Business içindeki etiketler** ("Yeni müşteri", "Ödeme bekleniyor" gibi) rehbere yazılmaz, bu yüzden
  aktarılmaz. Gerekirse Harita CRM'de yeniden etiketleyebilirsiniz.
- **WhatsApp Web'den kişi çeken eklentileri ya da programları KULLANMAYIN.** ("WhatsApp kişilerini Excel'e aktar",
  "grup üyelerini indir" gibi tarayıcı eklentileri.) Bunlar WhatsApp kurallarına aykırıdır; numaranız
  **kısıtlanabilir ya da kapatılabilir**. Ayrıca müşterilerinizin bilgilerini tanımadığınız bir şirkete vermiş
  olursunuz (KVKK). Bu rehberdeki yol yalnızca kendi telefonunuzun ve kendi Gmail hesabınızın araçlarını kullanır.
- Tek bir Gmail hesabı seçin (örneğin işletmenin hesabı) ve hep onunla çalışın. Bu rehberde ona **"ortak hesap"**
  diyoruz.
- Menü adları telefonun markasına ve sürümüne göre biraz farklı olabilir. Aynı anlamdaki seçeneği arayın.

---

## 1. Adım: Her telefonun rehberini dışa aktarın

Her telefon için aşağıdaki **Android** ya da **iPhone** bölümünü uygulayın. Sonunda elinizde her telefon için bir
dosya olacak. Dosyaları karıştırmamak için hangi hatta ait olduğunu adına yazın: `hat1.vcf`, `hat2.vcf`, `hat3.vcf`.

### Android telefonlar

**Önerilen yol: vcf dosyası olarak dışa aktarma**

1. **Kişiler** (Rehber) uygulamasını açın.
2. Menüden (üç çizgi ya da üç nokta) **Kişileri yönet** ya da **Ayarlar** bölümüne girin.
3. **İçe/dışa aktar** → **Dışa aktar** seçin.
   - Samsung: *Kişiler → Menü → Kişileri yönet → Kişileri içe veya dışa aktar → Dışa aktar*.
   - Google Kişiler uygulaması: *Düzelt ve yönet → Dosyaya aktar*.
4. Kişilerin **hepsini** seçin (telefon hafızası, SIM kart ve hesaplar dahil), kaydetme yeri olarak telefonun
   hafızasını seçin.
5. `.vcf` uzantılı bir dosya oluşur (ör. `Kişiler.vcf`). Bu dosyayı bilgisayara alın: kendinize e-postayla gönderin,
   Google Drive'a yükleyin ya da USB kabloyla kopyalayın. Adını `hat1.vcf` gibi değiştirin.

**Diğer yol: Google hesabıyla eşitleme**

Telefonun rehberi zaten ortak hesaba eşitleniyorsa (*Ayarlar → Hesaplar → Google → Kişiler açık*) kişiler
contacts.google.com'da kendiliğinden görünür. Ancak bu yolda kişilerin **hangi telefondan geldiği ayırt edilemez**;
"Hat 1/2/3" etiketlerini vermek isterseniz yukarıdaki dosya yolunu kullanın. Telefon hafızasındaki kişiler eşitlenmez;
Kişiler uygulamasında *Cihaz kişilerini taşı / Google hesabına taşı* gibi bir seçenek varsa önce onu kullanın.

### iPhone

**Bilgisayar varsa (iCloud üzerinden)**

1. iPhone'da **Ayarlar → [adınız] → iCloud** bölümüne girin ve **Kişiler**'i açın. Birkaç dakika bekleyin.
2. Bilgisayarda **icloud.com** adresine girip aynı Apple hesabıyla oturum açın, **Kişiler**'i açın.
3. Sol alttaki ayarlar (dişli) ya da üç nokta menüsünden **Tümünü seç**, sonra **vCard'ı dışa aktar** seçin.
4. Bir `.vcf` dosyası iner. Adını `hat2.vcf` gibi değiştirin.

**Bilgisayar yoksa (iOS 16 ve sonrası)**

1. **Kişiler** uygulamasını açın, sol üstteki **Listeler**'e dokunun.
2. **Tüm Kişiler** (ya da **Tüm iCloud**) satırına basılı tutun → **Dışa Aktar**.
3. Dosyayı kendinize e-postayla gönderin ya da Dosyalar'a kaydedin.

> Telefonda birden fazla hesap (iCloud, Gmail, Outlook) varsa her birindeki kişiler ayrı listelerde durur. Hepsini
> almak için **Tüm Kişiler** listesini seçin.

---

## 2. Adım: Dosyaları tek Gmail hesabına yükleyin ve etiketleyin

Bu adımı bilgisayarda yapmak en kolayıdır.

1. Tarayıcıda **contacts.google.com** adresini açın ve **ortak hesapla** oturum açın.
2. Sol menüden **İçe aktar**'a tıklayın, **Dosya seç** ile `hat1.vcf` dosyasını seçin ve **İçe aktar**'a basın.
3. Google, yüklenen kişilere kendiliğinden bir etiket verir: sol menüde **"İçe aktarıldı (tarih)"** gibi görünür.
   Bu etiketin yanındaki kalem simgesiyle (ya da üç nokta → **Yeniden adlandır**) adını **Hat 1** yapın.
4. Aynısını `hat2.vcf` için yapın ve oluşan yeni etiketin adını **Hat 2** yapın. Sonra `hat3.vcf` → **Hat 3**.

> **Sırayla yapın:** bir dosyayı yükleyin, etiketini yeniden adlandırın, sonra diğerine geçin. Aynı gün yüklenen
> dosyalar benzer adlı etiketler alır; sırayla yaparsanız karışmaz.

Kişi Google'ın eşitleme yoluyla zaten hesaptaysa (Android, diğer yol) ona etiketi elle verebilirsiniz: kişileri seçip
üstteki etiket simgesiyle **Hat 1** gibi bir etiket ekleyin.

---

## 3. Adım: Tekrarları birleştirin ("Birleştir ve düzelt")

Aynı müşteri iki ya da üç telefonda kayıtlıysa şimdi Google'da iki ya da üç kez görünür.

1. Sol menüden **Birleştir ve düzelt**'e tıklayın.
2. Google, aynı kişi olduğunu düşündüğü kayıtları gösterir. Önce birkaçına bakın; doğruysa **Tümünü birleştir**'e,
   tek tek karar vermek isterseniz her önerideki **Birleştir**'e basın.
3. Birleşen kişide genelde her iki hattın etiketi de kalır (ör. hem **Hat 1** hem **Hat 3**). Böylece müşterinin hangi
   hatlarla yazıştığını görmeye devam edersiniz.

Google her tekrarı bulamayabilir (ör. bir telefonda "Ahmet Usta", diğerinde "Ahmet Yılmaz" diye kayıtlıysa). Merak
etmeyin: **Harita CRM aynı telefon numarasına sahip satırları içe aktarırken zaten birleştirir.**

---

## 4. Adım: Google CSV dosyasını indirin

1. contacts.google.com'da sol menüden (ya da üstteki üç nokta menüsünden) **Dışa aktar**'a tıklayın.
2. **Kişiler** seçeneğini (hepsi) seçin. Yalnızca bir hattı almak isterseniz o etiketi (ör. **Hat 2**) seçebilirsiniz.
3. Biçim olarak **Google CSV**'yi seçin ve **Dışa aktar**'a basın.
4. `contacts.csv` adlı bir dosya iner. Bu dosyayı **açıp düzenlemenize gerek yok**; Excel'de açıp kaydederseniz
   biçimi bozulabilir. Doğrudan bir sonraki adıma geçin.

---

## 5. Adım: Harita CRM'e aktarın

1. Harita CRM'de **Kayıtlar** sayfasına girin ve **İçe aktar** düğmesine tıklayın.
2. **1. Dosya seçin**: `contacts.csv` dosyasını seçin. Uygulama bunun bir Google Kişiler dosyası olduğunu
   kendiliğinden anlar ve ekranın üstünde **"Google Kişiler:"** diye bir bilgi gösterir. Sütunlar kendiliğinden eşlenir:
   şirket adı yoksa ad soyad işletme adı olur, cep numarası telefon olarak alınır, diğer numaralar nota yazılır.
3. **2. Sütunları eşleyin** bölümünde şunları seçin:
   - **Alıcı türü:** Kişilerin çoğu işletmeyse **Tacir/esnaf (işletme)**, kişiyse **Bireysel (kişi)**.
   - **Telefonu mevcut bir kayıtla aynıysa:** Ne yapacağınızdan emin değilseniz **Atla ve raporla** seçin;
     **Yalnızca boş alanları doldur** mevcut kayıttaki boş alanları dosyadan doldurur, dolu alanlara dokunmaz.
   - **WhatsApp izni:** Bu kişilerden WhatsApp'tan tanıtım/kampanya mesajı almak için **açık onay aldıysanız**
     **İzin var (hepsinden onay alındı)**, almadıysanız ya da emin değilseniz **İzin yok** seçin. İzin vardıysa
     **İzin kaynağı**'nı da seçin. Bireysel kişiler için izinlerin İYS'ye kayıtlı olduğuna dair kutuyu yalnızca
     gerçekten kayıtlıysa işaretleyin. İşaretlemezseniz bu kişiler yine eklenir ama izinleri yazılmaz.
   - **Etiketler:** "Hat 1", "Hat 2", "Hat 3" ve diğer Google etiketleriniz listelenir. İsterseniz adlarını
     değiştirin ya da işinize yaramayanları **yok sayın**. Etiketler Harita CRM'de küçük harfle görünür (ör. "hat 1").
4. **3. Önizle**'ye basın. Henüz hiçbir şey kaydedilmez. Ekranda şunlar görünür: toplam kişi, dosyada birleşen satır,
   yeni eklenecek, mevcut kayıtla çakışan, hatalı (alınmayacak), engel listesinde olanlar.
5. Sayılar size makul geliyorsa **4. İçe aktar**'a basın. Biten ekranda özet görünür.
6. Hatalı satırlar varsa **Sorunlu satırları CSV indir** ile bir liste alıp düzeltebilirsiniz.

### Hangi kişiler alınmaz ya da uyarı alır?

- **Yurt dışı numaralar** (+49, +44 …): Harita CRM yalnızca Türkiye numaralarını alır.
- **Telefonu da e-postası da olmayan kişiler.**
- **Hatalı numaralar** (eksik ya da fazla rakam).
- Daha önce mesaj almak istemediğini bildiren, yani **engel listesindeki** kişiler eklenir ama onlara WhatsApp izni
  yazılmaz.

### Sınırlar

Tek seferde en fazla **20.000 kişi** ve **10 MB** dosya alınır. Daha büyük bir rehberiniz varsa 4. adımda etiket
seçerek (Hat 1, Hat 2, Hat 3) üç ayrı dosya indirip ayrı ayrı aktarın.

---

## Sık sorulanlar

**Aynı dosyayı yanlışlıkla iki kez yüklersem ne olur?**
Harita CRM telefon numarasına bakar. **Atla ve raporla** seçiliyse aynı numara ikinci kez eklenmez; önizlemede
"mevcut kayıtla çakışan" olarak görünür. (Telefonu olmayan, yalnızca e-postası olan kişiler ikinci yüklemede tekrar
eklenebilir.)

**Telefonlarımdaki rehber değişir mi?**
Hayır. Dışa aktarma yalnızca kopya alır. Ancak Android'de ortak hesabı telefona eşitlemeyi açtıysanız
contacts.google.com'da yaptığınız birleştirmeler o telefona da yansır.

**Sonradan yeni kaydettiğim kişileri de aktarabilir miyim?**
Evet. Aynı adımları tekrarlayın ve 5. adımda **Atla ve raporla** seçin; yalnızca yeni numaralar eklenir.

**Harita CRM'deki kişileri Google'a geri alabilir miyim?**
Evet, yönetici hesabıyla **Kayıtlar → Google Kişiler CSV olarak indir** seçeneğini kullanın, sonra dosyayı
contacts.google.com'da **İçe aktar** ile yükleyin.
