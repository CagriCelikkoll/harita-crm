# Prova: ofis gününden önce demo ortamında deneme

[OFIS-GUNU.md](OFIS-GUNU.md)'deki uygulama tarafı adımlarını (7, 8'in uygulama kısmı, 9, 10, 11) aynı sırayla, kendi
bilgisayarınızda demo ortamında yaptırır.

- Veritabanı `data/demo.db`'dir. `data/app.db` ve `data/gercek-test.db` açılmaz.
- Meta'ya ve Google'a hiçbir istek gitmez; WhatsApp ve Places sahte istemcilerle çalışır.
- Meta'nın bildirimlerini `npm run demo:webhook` taklit eder. Doğru imzalanmış istekleri gerçek webhook adresine
  (localhost) gönderir; yani imza doğrulama ve işleme kodu ofistekiyle aynıdır.
- Numaralar sahtedir: **Ben** `0500 000 00 21`, **Arkadaşım** `0500 000 00 22`, **Babam** `0500 000 00 23`. Demoya
  gerçek numara girmeyin.

> 📍 ile başlayan satırlar ofiste Meta'da ya da telefonda yapacaklarınızdır. Provada onların yerine hemen altındaki
> **Demoda** satırını uygulayın.

**Provada çalıştırmayın:** `npm run dev`, `npm run worker`, `npm run tunel`, `npm run hazirlik`, `npm run kullanim`.
Bunlar gerçek ortam içindir; demonun karşılıkları aşağıda yazıyor.

---

## Hazırlık: üç terminal

1. Açık bir `npm run dev` varsa kapatın (`Ctrl + C`).
2. **1. terminal:** önce demoyu sıfırdan kurun, sonra uygulamayı başlatın:

   ```
   npm run demo:hazirla
   npm run demo
   ```

3. Tarayıcıda **http://localhost:3000** → `yonetici@demo.test` / `Demo-Yonetici-2026`.
4. **2. terminali** açın; `demo:webhook` komutlarını burada çalıştıracaksınız. İşçi için 9. adımda **3. terminal**
   açılacak.

📍 Ofiste önce 0–6. adımlar yapılır (hazırlık, Meta uygulaması, API Setup, App Secret, token, test numaraları). Bunların
demoda karşılığı yok; demo bağlantısı hazır gelir.

---

## 7. Tünel, bağlantı ve webhook doğrulama

**Tünel**

📍 Ofiste: `npm run tunel`, çıkan adresi `.env.local` → `GENEL_ADRES`'e yazıp `npm run dev`'i yeniden başlatırsınız.

**Demoda:** Tünel yok; bildirimler doğrudan localhost'a gider. Bu adımı atlayın.

**Bağlantı bilgileri**

📍 Ofiste: **Ayarlar → WhatsApp (Meta)** → Teknik ayrıntılar'a WABA ID, Phone Number ID, token ve App Secret girip
**Kaydet**'e basarsınız. **Doğrulama anahtarı yalnızca o anda gösterilir;** kopyalayın.

**Demoda:** Bağlantı hazırdır, form doldurulmaz. **Ayarlar → WhatsApp (Meta)** sayfasını açın:

- Üstte **Bağlı**, **Kalite: Yüksek (yeşil)**, **Test modu açık**.
- Kurulum adımları: 1 tamamlandı, 2 "sıradaki adım", 3 bekliyor, 4 kilitli.
- **Teknik ayrıntıları göster**: bildirim adresi demoda `http://localhost:3000/api/whatsapp/webhook/…` ile başlar
  (ofiste `https://…trycloudflare.com/…` olmalı).

**Test numaraları** (ofistekiyle aynı ekran)

1. Test numaraları bölümünde `+90 500 000 00 01`'in yanındaki **×** ile numarayı kaldırın (ofisteki gibi yalnızca üç
   numara kalsın).
2. **Eklenecek test numarası** alanına sırayla `0500 000 00 21`, `0500 000 00 22`, `0500 000 00 23` yazıp
   **+ Numara ekle**'ye basın. Sonra o bölümün **Kaydet** düğmesine basın ("Kaydedildi.").
3. Üstte **Bağlantıyı test et** → "Bağlantı çalışıyor."
4. Kurulum adımları → **Bildirim aboneliğini etkinleştir** → "Bildirim aboneliği etkin."

**Webhook doğrulama**

📍 Ofiste Meta'da: App Dashboard → Use cases → WhatsApp → Customize → **Configuration**; Callback URL ve Verify token
girip **Verify and save**, sonra Webhook fields'ta `messages` → **Subscribe**.

**Demoda:** Verify and save yerine 2. terminalde:

```
npm run demo:webhook -- dogrula
```

Beklenen: `✓ Bildirim adresi doğrulandı`. Sayfayı yenileyin: Kurulum adımları 2 **"Tamamlandı · teslim ve ret
bildirimleri alınabiliyor"** olmalı.

📍 Ofiste bu adımdan sonra `npm run hazirlik` ile kontrol edersiniz. **Demoda** çalıştırmayın (demoya değil gerçek
veritabanına bakar).

---

## 8. Şablon (uygulama kısmı)

📍 Ofiste Meta'da: WhatsApp Manager → Message templates → **Create template**; Marketing, Turkish, kısa gövde, **Marketing
opt-out** düğmesi, **Submit**. Onayı beklersiniz.

**Demoda:** Şablonlar hazır (Meta tarafı atlanır). **Mesaj şablonları** → **Meta'dan yenile** → "Şablonlar yenilendi."

- `kampanya_tanitim`: **Kullanılabilir**. Provada bunu kullanacaksınız.
- `butonsuz_pazarlama`: **Kullanılamaz**, "abonelikten çıkma (hızlı yanıt) butonu yok". OFIS-GUNU 8. adımın hata
  tablosundaki durum tam olarak budur.

---

## 9. Kampanya, teslim, RET ve düğme

**Kişiler**

1. **Kayıtlar → Kişi ekle**. **Ad soyad / yetkili:** `Prova Ben`, **Telefon:** `0500 000 00 21`, **Alıcı türü:**
   **Bireysel (kişi)** → **Kaydet**.
2. Sağda açılan panelde **İletişim izni** sekmesi → WhatsApp izni **Düzenle** → **İzin var**, İzin kaynağı **Sözlü**,
   bugünün tarihi. **"Bu izin İYS'ye kaydedildi." kutusu BOŞ kalır** → **Kaydet**.
3. Panelde "İzin var · Sözlü · … · İYS beyanı yok (kampanyaya yalnızca test modunda, test numarasıysa girer)" yazmalı.
4. Aynısını `Prova Arkadaş` (`0500 000 00 22`) ve `Prova Baba` (`0500 000 00 23`) için yapın.

**Kampanya**

1. **Kampanyalar → Yeni kampanya** → **WhatsApp (API)** → **İleri**.
2. Kampanya adı `Prova WhatsApp` → **İleri**.
3. Şablon **kampanya_tanitim**. Demodaki bu şablonun değişkenleri vardır (ofisteki şablonda bu alanlar çıkmaz):
   Başlık {{1}} için "Kayıtta boşsa" `Deneme`, Gövde {{1}} için "Kayıtta boşsa" `Değerli kişi`, Gövde {{2}} için
   **Sabit metin** `demo.test`. **Gönderim özetini göster**.
4. 4\. adımda beklenen: **"3 alıcıya gönderilecek"**, "Test modu açık" notu. Hariç tutulanlar 17 / 20: İleti reddi 1,
   WhatsApp izni yok 12, Bireysel; İYS beyanı yok 1, Test modu: test numarası değil 3.
5. "Test: Meta'ya gönderme…" kutusunu **işaretlemeyin** → **Kampanyayı başlat**.

**İşçi**

📍 Ofiste: üçüncü terminalde `npm run worker`.

**Demoda:** **3. terminalde** `npm run demo:isci`. En geç 30 saniyede kampanya **Tamamlandı**, ilerleme **3 / 3**,
Alıcılar sekmesinde üç kişi **Gönderildi** olur.

**Teslim bildirimi**

📍 Ofiste: üç telefona mesaj gelir, Meta teslim bildirimlerini kendisi gönderir.

**Demoda:** 2. terminalde:

```
npm run demo:webhook -- durum kampanya --kadar delivered
```

Kampanya ayrıntısını yenileyin → **Geçmiş** sekmesi → **Meta teslim bildirimleri: Teslim edildi 3**. (Teslim durumu bu
sekmede görünür; Alıcılar sekmesindeki satırlar "Gönderildi" kalır.) **Ayarlar → WhatsApp (Meta)**'da Kurulum adımları 3
**Tamamlandı** olur ve 4. adımda **Test modunu kapat** düğmesi çıkar. **Basmayın;** ofiste de bütün gün basılmayacak.

Okundu'yu da görmek için:

```
npm run demo:webhook -- durum kampanya
```

Geçmiş sekmesi: **Okundu 3**. Yalnızca son mesaj için `durum son`, tek mesaj için `durum wamid.…` yazılabilir.

**RET ve düğme** (yalnızca Ben ve Arkadaşım; Babam'ın numarasıyla ASLA)

📍 Ofiste: **kendi telefonunuzdan** gelen mesaja `RET` yazarsınız; **arkadaşınızın telefonundan** mesajın altındaki
abonelikten çıkma düğmesine basılır. Babanızın telefonunda hiçbir şey yapılmaz.

**Demoda:** 2. terminalde:

```
npm run demo:webhook -- ret 05000000021
npm run demo:webhook -- buton 05000000022
```

Beklenen çıktılar: `Kayıt: Prova Ben · İleti izni: ret` ve `Kayıt: Prova Arkadaş · İleti izni: ret`. Babam için komut
**çalıştırmayın**.

**Kayıtlar**'ı yenileyin:

| Kayıt | İzin sütunu | İletişim izni sekmesi |
|---|---|---|
| Prova Ben | kırmızı **Ret** | "WhatsApp'ta ret yazdı" |
| Prova Arkadaş | kırmızı **Ret** | "WhatsApp'ta abonelikten çıkma butonuna dokundu" |
| Prova Baba | değişmedi (Bekliyor, WhatsApp izni var) | "İzin var · Sözlü …" |

Ret alan kayıtların **Geçmiş** sekmesinde "Gelen WhatsApp mesajı (text)" ya da "(button)" olayı görünür.

---

## 10. Baba'nın kendi taraması

**Demoda:** **Bölge tara** → haritada bir nokta ya da adres, yarıçap, kategori → **Taramayı başlat**. Sonuçlar sahtedir,
Google'a gidilmez. Birkaç sonucu Kayıtlar'a ekleyin ve ayrıntısını açın.

📍 Ofiste: bu tarama gerçek Google isteğidir ve kotadan düşer. Harcamayı `npm run kullanim -- harita-crm-test` ile
karşılaştırırsınız. **Demoda** o komut yerine **Ayarlar → Kullanım ve paket**'e bakın.

Ofiste babanıza soracağınız geri bildirim başlıklarını (OFIS-GUNU 10. adım 4. madde) bu sırada gözden geçirin.

---

## 11. Gün sonu

**Karar noktası:** OFIS-GUNU 11. adımı okuyun; babanıza soracağınız soruyu (pilota devam mı, geri alma mı) ve iki durumda
ne yapılacağını provada söyleyebiliyor olun.

**Demoda:**

1. 3\. terminalde (`demo:isci`) `Ctrl + C`, sonra 1. terminalde (`demo`) `Ctrl + C`.
2. Baştan denemek isterseniz: `npm run demo:hazirla`. Bütün prova verisi silinir.

📍 Ofiste: `npm run worker`, `npm run tunel`, `npm run dev` sırasıyla kapatılır, `.env.local`'de `GENEL_ADRES` boşaltılır,
`npm run kullanim -- harita-crm-test` çalıştırılır. "Devam yok" kararı çıkarsa Meta'daki geri alma (OFIS-GUNU 12) yapılır.

---

## Komut sorunları

| Görülen | Çözüm |
|---|---|
| `Demo veritabanı yok` | `npm run demo:hazirla` |
| `adresine ulaşılamadı` | 1. terminalde `npm run demo` açık olmalı. |
| `Webhook adresi bulunamadı (404)` | 3000 portunda demo değil başka bir uygulama açık. `npm run dev`i kapatıp `npm run demo` çalıştırın. |
| `İmza reddedildi (401)` | `npm run demo`yu kapatıp yeniden başlatın. |
| `Henüz gönderilmiş WhatsApp mesajı yok` | Kampanyayı başlatın, 3. terminalde `npm run demo:isci` açık olsun. |
| `numarasında kayıt yok` uyarısı | Numarayı yanlış yazdınız ya da kişiyi eklemediniz. Numara yine de engel listesine yazılır; temizlemek için `npm run demo:hazirla`. |
| `demo.db kullanımda` | `demo` ve `demo:isci` terminallerini kapatıp yeniden deneyin. |

---

## Kendimi kontrol

- [ ] `dogrula` sonrası Kurulum adımları 2 "Tamamlandı" oldu.
- [ ] Özet **3 alıcı** gösterdi; İYS kutusu üç kişide de boştu.
- [ ] Kampanya **Teslim edildi** oldu (Geçmiş sekmesi: Teslim edildi 3), Kurulum adımları 3 "Tamamlandı".
- [ ] **RET kırmızı:** Prova Ben izin sütununda kırmızı Ret, "WhatsApp'ta ret yazdı".
- [ ] **Düğmeyle ret çalıştı:** Prova Arkadaş kırmızı Ret, "WhatsApp'ta abonelikten çıkma butonuna dokundu".
- [ ] Prova Baba değişmedi.
- [ ] Test modunu kapatmadım.
- [ ] Ofiste 📍 ile işaretli Meta adımlarını OFIS-GUNU.md'den takip edeceğimi biliyorum.
