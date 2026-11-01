# Yeni düzen planı

Kaynak: `docs/tasarim/` içindeki üç taslak (`Main.dc.html` = Ayarlar, `Kayitlar.dc.html` = Kayıtlar,
`Tarama.dc.html` = Bölge tara). **Klasörde ekran görüntüsü yok**; plan yalnızca bu üç dosyadaki düzen, satır yapısı
ve satır içi stil değerlerine dayanır. Görüntüler başka bir yerdeyse eklenince plan gözden geçirilir.

Taslak kodu kopyalanmaz. Değerler uygulamanın Tailwind 4 belirteçlerine (`globals.css` `@theme`) ve mevcut bileşen
yapısına çevrilir. Kod yazmadan önce her grupta `node_modules/next/dist/docs/` içindeki ilgili rehber okunur
(özellikle layout, redirect, `proxy.ts` eşleyicisi ve route grupları; bu Next.js sürümü eğitim verisinden farklıdır).

---

## 1. Tasarım dili: taslaktan çıkan ölçüler

### 1.1 Ölçüler

| Öğe | Taslak değeri | Tailwind karşılığı (öneri) |
|---|---|---|
| Boşluk ölçeği | 4/8/12/16/24/32/48 | `1/2/3/4/6/8/12` (varsayılan 4 px tabanı tam uyar) |
| Ana menü genişliği | 232 px, iç boşluk 24×16, bloklar arası 28 | `w-58`, `px-4 py-6`, `gap-7` |
| İçerik iç boşluğu | 40 üst / 48 yan / 72 alt (Kayıtlar ve Tarama'da 36/40/64) | Tek değer: `pt-10 px-12 pb-18`; dar ekranda `px-4 pt-5` |
| Sayfa başlığı | h1 28 px / 700, açıklama 15 px soluk, aralık 6 | `text-[28px] font-bold tracking-[-0.01em]`, `text-[15px]` |
| Bölüm başlığı | h2 20 px / 700 + 14 px açıklama | `text-xl font-bold` |
| Kart | beyaz, kenar #E3E6E2, köşe 14 px, `overflow-hidden` | `rounded-kart` (yeni `--radius-kart: 14px`) |
| Kart satırı | 24×28 iç boşluk, satırlar arası 1 px #ECEEEA çizgi | `px-7 py-6 border-t border-cizgi` |
| Kaydet çubuğu | 16×28, zemin #FAFBF9, sağa yaslı | `px-7 py-4 bg-kart-alt justify-end` |
| Düğme / alan | yükseklik 44, köşe 8, yatay 18–20 / 14 | `h-11 rounded-lg px-5` / `h-11 px-3.5` |
| Ana eylem (Taramayı başlat) | 48 px, köşe 10, 15 px | `h-12 rounded-[10px] text-[15px]` |
| Küçük düğme | 40 / 36 px | `h-10` / `h-9` |
| Sekme grubu (segment) | dış #E9ECE7 köşe 10, iç 4; düğme 36 px köşe 7; seçili beyaz + gölge | `SekmeGrubu` bileşeni |
| Alt çizgili sekme | 44 px, seçili 2 px #0E6655 alt çizgi, 600 | `Sekmeler` bileşeni |
| Rozet (pill) | 3×10 iç boşluk, 12 px / 600, tam yuvarlak | `DurumRozeti` |
| Seçim çipi | 34–38 px, tam yuvarlak; seçili dolu yeşil | `SecimCipi` |
| İç kutu (istatistik, bilgi) | #F7F8F6, köşe 10, 14–16 iç boşluk | `IstatistikKutusu`, `BilgiNotu` |
| Yazı | IBM Plex Sans 14 / 1.45; soluk 13; küçük 12; kimlikler IBM Plex Mono 13 | Plex Mono yeni yüklenir (`next/font`) |

### 1.2 Renkler

Ana renkler aynı kalır: #0E6655 (ana), #17201C (menü ve metin), IBM Plex Sans. Taslak, uygulamadaki birkaç ara tonu
hafifçe farklı kullanıyor. Öneri: taslak değerlerini belirteç olarak almak (karar 12).

| Belirteç | Şimdi | Taslak | Not |
|---|---|---|---|
| `metin` | #1B2421 | #17201C | Taslakta metin ile menü aynı renk |
| `zemin` | #F5F7F6 | #F5F6F4 | |
| `kenar` (kart) | #D9E0DD | #E3E6E2 | |
| `kenar-alan` (yeni) | — | #CFD5D0 | Alan ve ikincil düğme kenarı |
| `cizgi` (yeni) | — | #ECEEEA | Kart içi satır ayırıcı |
| `soluk` | #5D6B66 | #5E6A64 | |
| `ana-acik` | #E3F1EE | #E3F1EC | Seçili menü öğesi, bilgi notu |
| `ana-koyu` | #0A4F42 | #0A4A3E | Rozet metni |
| Uyarı (yeni) | amber-50/800 | #FBEEDC / #7A3A05 | "Test modu açık", "Kullanılamaz", "İletişimde" |
| Tehlike | #B42318 | #A1261B, kenar #E7B7B1, zemin #FBE5E2 | |
| Menü içi | `menu-acik` #24302B | kart #222D28, çubuk #3B4A43 / #4FB89A, metin #C9D2CD, alt metin #A7B3AD | |

Kayıt durumu rozetleri (taslaktaki eşlem): Yeni mavi (#1D4F91 / #E4ECF8), İletişimde turuncu, Görüşme mor
(#5B3A99 / #EEE8F8), Kazanıldı yeşil, İlgilenmiyor gri. İzin rozetleri: Onaylı yeşil, Bekliyor turuncu, Ret kırmızı.
Renk tek başına anlam taşımaz; rozetin metni her zaman yazılı kalır.

### 1.3 Mevcut yardımcı sınıflar

`dugme`, `dugme-ana`, `dugme-tehlike`, `girdi`, `etiket`, `kart`, `rozet` ve `baslik` bütün ekranlarda kullanılıyor.
Bunlar 1. grupta yeni ölçülere çekilir; böylece henüz yeniden düzenlenmemiş ekranlar da tutarlı görünür. `kart`
artık iç boşluk vermez (satırlar verir); eski kullanım yerlerine geçici olarak `kart p-6` yazılır.

---

## 2. Tekrar kullanılabilir parçalar

`src/components/arayuz/` altında küçük, durumsuz bileşenler (server component olabilenler server kalır):

| Bileşen | Görev | Kullanıldığı yer |
|---|---|---|
| `AnaMenu` (`menu.tsx` yeniden) | Logo işareti, simgeli 44 px bağlantılar, altta kullanım göstergesi ve kullanıcı kartı (baş harfler, "Rol · Alan"), çıkış, çalışma alanı seçici; telefonda açılır menü | Tüm uygulama |
| `KullanimGostergesi` | "Bu ayki kullanım %N" ve çubuk; %80 sarı, %100 kırmızı | Ana menü |
| `SayfaBasligi` (güncel) | h1 + **zorunlu** bir cümlelik açıklama + sağda eylemler | Her sayfa |
| `Kart`, `KartBaslik` | 14 px köşeli kart; isteğe bağlı başlık satırı (başlık, açıklama, sağda eylem) | Her yer |
| `AyarSatiri` | Solda başlık ve açıklama (`flex 1 1 220px`), sağda alan (`flex 2 1 340px`); dar ekranda alt alta; `label for` bağlantısı | Ayarlar, kampanya sihirbazı |
| `KaydetCubugu` | Kartın altındaki çubuk: solda isteğe bağlı açıklama, sağda düğmeler | Ayarlar |
| `AyarBolumu` | Bölüm başlığı (h2 20 px) + açıklama + kartlar | Ayarlar sağ sütunu |
| `SekmeGrubu` | Segment düğmeleri ve sayılar; durum URL'de (`?grup=`) ya da yerelde; `role="tablist"` + ok tuşları | Kayıtlar, tarama sonuçları, kampanyalar |
| `Sekmeler` | Alt çizgili sekmeler (`role="tab"`, `aria-selected`, ok tuşları) | Kayıt paneli, kampanya detayı |
| `DurumRozeti` | Tür ve değerden renk: kayıt durumu, izin, bağlantı ("Bağlı" / "Bağlı değil"), şablon, kampanya | Her yer |
| `SecimCipi` | `aria-pressed` ile seçilebilir yuvarlak çip | Durum seçimi, kategori, filtreler |
| `IstatistikKutusu` | Küçük başlık + büyük değer (+ isteğe bağlı çubuk) | Kullanım, sınırlar, Panel |
| `IlerlemeCubugu` | `role="progressbar"`, iki boy (6 / 12 px) | Kullanım, menü |
| `BilgiNotu` / `UyariNotu` | Simgeli bilgi ya da uyarı kutusu | Her yer |
| `Katlanir` | `<details>` tabanlı "Teknik ayrıntıları göster / gizle" | WhatsApp, ileri seçenekler |
| `AdimListesi` | Numaralı adımlar: tamam (tik), etkin (çerçeveli numara + eylem), kilitli (kilit simgesi) | WhatsApp kurulumu, kampanya sihirbazı |
| `NumaraCipleri` | Silinebilir numara çipleri + "+ Numara ekle" | WhatsApp test numaraları |
| `TehlikeKarti` | Kırmızı kenarlı tek eylem kartı | Veri saklama |
| `GoogleEtiketi` | Küçük gri "Google" etiketi (11 px, köşe 4) | Kayıt tablosu, tarama kartı |
| `SonucKarti` | Tarama sonucu: ad, adres, mesafe, İlgilen / Geç, karar sonrası etiket + Geri al | Bölge tara |
| `Simge` | Taslaktaki çizgi simgeleri (svg, `aria-hidden`) | Menü, bilgi notları |

Mevcut `GoogleAtfi`, `GoogleBilgisiHucresi`, `RetDugmesi`, `SonucMesaji`/`bildir`, `Harita` korunur; görünümleri
yeni ölçülere çekilir.

---

## 3. Ekran ekran: şimdi ve hedef

### 3.1 Sayfa iskeleti ve menü

| | Şimdi | Hedef |
|---|---|---|
| Menü | 240 px (`w-60`), simgesiz, metin bağlantıları, altta kullanıcı adı / e-posta | 232 px, logo işareti, simgeli 44 px bağlantılar, altta kullanım göstergesi ve kullanıcı kartı |
| Menü adları | Panel, Bölge taraması, Kayıtlar, İletişim, Ayarlar | Panel, **Bölge tara**, Kayıtlar, **Kampanyalar**, Ayarlar |
| İçerik | `px-8 py-7`, çoğu ekranda `max-w-5xl` | `px-12 pt-10 pb-18`, tam genişlik; okunabilirlik için yalnızca form sütunları sınırlı (Ayarlar 920 px) |
| Başlık | h1 20 px, açıklama isteğe bağlı | h1 28 px + her sayfada bir cümlelik açıklama |

Kullanım göstergesi: menü bir layout'ta olduğu için istemci gezinmesinde yeniden çizilmez. `KullanimGostergesi` bir
istemci bileşeni olur: yeni `GET /api/kullanim` (yalnızca yüzde ve eşik durumu) rota değişince ve
`harita-kullanim` olayı gelince (Göster, tarama, detay sonrası) yenilenir. Birim ya da sayı göstermez.

### 3.2 Ayarlar

**Şimdi:** `/ayarlar` tek sayfa, iki sütunlu ızgarada 8 kart: Çalışma alanı, Places kullanımı (birim tablosuyla),
Ticari ileti, Gönderim saatleri, SMTP, SMS, WhatsApp günlük liste, WhatsApp Business (API), Üyeler.

**Hedef:** iki sütun. Solda gruplanmış ayar menüsü, sağda tek bölüm; her bölüm ayrı rota. `/ayarlar` →
`/ayarlar/calisma-alani` yönlendirmesi. `ayarlar/layout.tsx` sol menüyü çizer, etkin öğeyi `usePathname` ile bulur.

| Grup | Öğe → rota | Mevcut içerikten taşınan | Taslakta olup uygulamada olmayan |
|---|---|---|---|
| Genel | Çalışma alanı → `/ayarlar/calisma-alani` | Alan adı (`AlanFormu`) | "Giriş adresi" (alt alan adı yok; `BETTER_AUTH_URL` salt okunur gösterilebilir), "Saat dilimi" (uygulama sabit İstanbul; salt okunur metin), karar 6 |
| | Ekip ve roller → `/ayarlar/ekip` | Üye listesi, rol rozeti, üye çıkarma, davet formu, bekleyen davetler (bağlantıyı kopyala, iptal) | "Daveti yeniden gönder" (davet e-postası yok; bağlantı kopyalama korunur); rol açıklama kartları eklenir |
| | Kullanım ve paket → `/ayarlar/kullanim` | Kota çubuğu (yüzde olarak), %80 / %100 uyarıları, sınır artırma metni | Üç kalemli döküm (yeni sayaç, bölüm 4.4); "Paketiniz" (paket kavramı yok: "Aylık kullanım sınırı" + iletişim metni); **birim tablosu arayüzden kalkar** (README'de kalır) |
| Gönderim | Gönderen bilgileri → `/ayarlar/gonderen` | Ticari ileti alanları (unvan, iletişim, İYS no, SMS ret numarası, yetkili telefonu, sorumluluk onayı) | — |
| | Saatler ve sınırlar → `/ayarlar/saatler` | Gönderim penceresi (00:00 = gün sonu notu korunur), günlük e-posta / SMS sınırları istatistik kutusu olarak, WhatsApp listesi kişi başı sınırı | — |
| Kanallar | WhatsApp (Meta) → `/ayarlar/whatsapp` | WhatsApp Business (API) kartının tamamı; aşağıda | Taslakta test numarası en fazla 5, API 20 kabul ediyor (karar 6) |
| | SMS → `/ayarlar/sms` | Netgsm hesabı ("Tanımlı · Değiştir"), başlık, test SMS'i | — |
| | E-posta → `/ayarlar/eposta` | SMTP alanları, gönderen adresi, test e-postası, "Bağlı / Bağlı değil" | — |
| Veri | Veri saklama → `/ayarlar/veri` | Veri saklama süresi (`veriSaklamaGun`), CSV dışa aktarma bağlantısı, Places saklama notu (30 gün konum) | "Aydınlatma metni" adresi ve "Tüm verileri sil" (ikisi de yeni özellik; karar 6) |

Kanalların yanındaki nokta: bağlıysa yeşil dolu, değilse gri halka (SMTP / Netgsm tanımlı mı, WhatsApp bağlantısı
kayıtlı mı; mevcut DTO'lardan).

**WhatsApp günlük liste ayarları** (mesaj şablonu, günlük sınır) taslakta yok. Öneri: Gönderim grubuna
"WhatsApp listesi" öğesi (`/ayarlar/whatsapp-listesi`), çünkü Meta bağlantısından bağımsız ve üyeler de kullanıyor
(karar 7).

**Yetki:** Üye, bölümleri salt okunur görür (şimdiki gibi). WhatsApp (Meta) yalnızca yöneticiye görünür; üye için
menüde gösterilmez. Sunucu tarafı yetki denetimleri değişmez.

**WhatsApp (Meta Business) bölümü:**

1. **Durum kartı:** simge, "Ad · numara", rozetler: Bağlı, Kalite, "Meta sınırı: günde N kişi",
   "Test modu açık / kapalı". Sağda "Bağlantıyı test et". Numara sahipliği doğrulanmamışsa uyarı rozeti.
2. **Kurulum adımları** (`AdimListesi`); durumlar mevcut kilit verisinden türetilir, yeni saf fonksiyon
   `kurulumAdimlari(baglantiDurumu)`:
   1. Meta Business hesabını bağlayın: kimlikler kayıtlı ve son bağlantı testi başarılı.
   2. Bildirim adresini doğrulayın: webhook doğrulandı (kilidin 1. koşulu).
   3. Test numaranıza bir kampanya gönderin: imzası doğrulanmış en az bir durum bildirimi alındı (kilidin 2.
      koşulu). Etkinken "Test kampanyası oluştur" → `/kampanyalar/yeni?kanal=whatsapp_api`.
   4. Test modunu kapatın: 1–3 tamam değilse kilitli ("3. adım tamamlanınca açılır"); tamamsa onay isteyen
      "Test modunu kapat" düğmesi. Bugünkü pasif onay kutusunun yerini alır; sunucu kuralı aynen kalır.
3. **Uygulama payı** kaydırıcısı (mevcut `uygulamaPayi`, 1–100): "%N · Günde en fazla M kişi" (M = Meta sınırı ×
   pay, mevcut hesap).
4. **Test numaraları:** `NumaraCipleri` (bugünkü metin kutusunun yerine), biçimlendirilmiş gösterim.
5. **Mesaj şablonları:** liste, "Kullanılabilir / Kullanılamaz" rozeti ve gerekçe; "Meta'dan yenile".
6. **Teknik ayrıntılar** (`Katlanir`, kapalı başlar): WABA ID, telefon numarası kimliği, erişim anahtarı ve uygulama
   gizli anahtarı ("Tanımlı · Değiştir"), webhook adresi (Mono, kopyala), doğrulama anahtarı. Bugünkü alan
   açıklamaları (WABA ID nedir vb.) her alanın altında korunur.

### 3.3 Kayıtlar

| | Şimdi | Hedef |
|---|---|---|
| Üst eylemler | Kişi ekle, İçe aktar, CSV dışa aktar | İçe aktar (ikincil), Kişi ekle (ana); CSV dışa aktarma Ayarlar > Veri saklama'ya ve Filtreler menüsüne taşınır |
| Süzme | Satır süzgeç formu (Ara, Durum, İleti izni, Kaynak, WhatsApp izni, İnceleme, Etiket) + "Filtrele" | Segment: **İlgilendiklerim / İncelenmemiş / Tümü** (sayılarla), arama kutusu, **Filtreler** düğmesi (açılır panel: Durum, İzin, Kaynak, WhatsApp izni, Etiket, CSV dışa aktar). Süzgeçler URL'de kalır |
| Kota uyarısı | Üstte kırmızı kota kutusu | Yalnızca %100'de kısa uyarı ("İşletme bilgileri ay sonuna kadar gösterilemiyor"); sayı yok |
| Tablo | İşletme, Google adresi, Durum, İleti izni, Etiketler, Son işlem, inceleme rozeti, "Göster (3 birim)", sayfa içi ad süzgeci | **İşletme** (ad + ikinci satırda adres ya da kaynak; Google'dan gelen ad/adresin yanında `GoogleEtiketi`), **Durum**, **İzin** (+ WhatsApp izni simgesi), **Son işlem**, **Etiket**. Seçili satır açık yeşil zemin. Altta atıf cümlesi ve sayfalama (‹ 1 / 3 ›) |
| Google adı | İstenince ("Göster (3 birim)", "Bu sayfadaki … göster (N × 3 = X birim)") | Adı girilmemiş Google kayıtlarında **otomatik** (kota %80'e kadar), sonra satırda yalnızca "Göster". Bölüm 4.2 |
| Ayrıntı paneli | Uzun tek sütun: Google bilgileri, kişi alanları, durum, izinler, WhatsApp, notlar, etkinlikler | Başlık (ad + "adres · kategori") + kapat; **Ara / WhatsApp / E-posta** düğmeleri; sekmeler **Genel / İletişim izni / Geçmiş** |
| Panel genişliği | — | Masaüstünde tablonun sağında `flex 1 1 380px`, en fazla 460 px; 1100 px altında sağdan açılan çekmece |

**Panel sekmeleri:**

- **Genel:**
  - Durum çipleri (5 durum, tek seçim, anında kaydeder).
  - "İşletme adı (sizin kaydınız)": alan boş gelir, ipucu "İşletmeyle görüştüğünüzde adını buraya yazın".
    **Yanında Google adı gösterilmez** (kural korunur). Panel başlığındaki Google adı önceki kararla serbest.
  - Yetkili adı, e-posta, ek telefon, alıcı türü, etiketler: bugünkü kişi alanları, aynı API.
  - Kayıt notu.
  - "İletişim bilgileri" kutusu, sağ üstte "Google Haritalar" atfı: telefon (Mono), web sitesi, adres,
    "Google Haritalar'da aç". Bunlar bugünkü Enterprise detay çağrısı ve istisnalarıyla gelir; kota %80'i
    geçtiyse kutuda "Google bilgilerini göster" düğmesi (maliyet yazmadan).
- **İletişim izni:**
  - "E-posta ve SMS" satırı (alıcı türü + izin rozeti).
  - "WhatsApp" satırı (kaynak ve tarih, ya da "Kampanyalara dahil edilmez").
  - "İzni güncelle" (bugünkü izin formları) ve "İleti reddi kaydet" (`RetDugmesi`).
  - Engelli / hariç uyarıları burada görünür.
- **Geçmiş:** etkinlik zaman çizelgesi (mevcut etkinlikler) + "Not ekle".
- **Üst düğmeler:**
  - Ara: `tel:` bağlantısı; numara ek telefon ya da Google'dan.
  - WhatsApp: bugünkü "WhatsApp'ta aç" akışı ve `/api/whatsapp/ac`. Günlük liste sayacı panelde küçük metin
    olarak kalır.
  - E-posta: kayıtta e-posta varsa `mailto:`, yoksa pasif ve nedeni yazar.

**Sekme anlamları** (karar 4): İlgilendiklerim = inceleme "ilgileniyor" ya da (taramadan gelmemiş kayıtlarda)
inceleme yok, ve durum "İlgilenmiyor" değil. İncelenmemiş = inceleme "incelenmedi". Tümü = hepsi.
Varsayılan sekme İlgilendiklerim; bugünkü "İlgilenilmiyorlar hariç" varsayılanıyla uyumlu.

### 3.4 Bölge tara

| | Şimdi | Hedef |
|---|---|---|
| Düzen | Solda form + durum + geçmiş, sağda harita; inceleme ayrı sayfa (`/tarama/inceleme`) | Üstte solda form kartı (en fazla 400 px), sağda geniş harita (en az 440 px yükseklik, kartla aynı boy); altında **son taramanın sonuçları** ızgarası |
| Merkez | Adres + Bul, Enlem / Boylam alanları, "Merkez kaynağı" metni | "Merkez": adres alanı + Bul, altında "Ya da haritada bir noktaya tıklayın"; enlem / boylam `Katlanir` "Koordinatla gir" altına |
| Kategori | Açılır liste | "Ne arıyorsunuz?" çipleri (sık kullanılan 5 kategori + "Diğer…" ile tam liste) |
| Yarıçap | Kaydırıcı, "Yarıçap: N km" | Aynı; değer sağda yeşil |
| Bilgi metni | "Tarama başına en fazla N Places isteği… IDs Only…" | Kalkar (teknik ve maliyet içerikli). Yerine "Tarama birkaç dakika sürebilir; sonuçlar aşağıda listelenir." Taslaktaki "Tahmini sonuç: N işletme" için ücretsiz bir kaynak yok (karar 5) |
| Başlat | `dugme-ana` | 48 px tam genişlik ana düğme, kartın dibinde |
| Durum | Ayrı "Tarama durumu" kartı | Form kartında düğmenin üstünde ilerleme satırı; kısmi tarama ve kota uyarıları burada |
| Geçmiş | "Tarama geçmişi" kartı (Tekrar kullan) | Sonuçların altında katlanır "Önceki taramalar"; Tekrar kullan aynen |
| Sonuçlar | `/tarama/inceleme`: liste, "Göster (birim)", İlgilen (ad alanı açılır) / İlgilenme | Başlık "Son tarama: Yer · Kategori · N km", özet "N işletme bulundu · X incelenmedi · Y ilgilenilen", segment **Tümü / İlgilenilen / Geçilen**, 280 px'lik kart ızgarası |

**Sonuç kartları:**

- Ad ve adres **otomatik** gelir (bölüm 4.1), sağ üstte mesafe ("0,4 km").
- **İlgilen / Geç**: inceleme "ilgileniyor" / "ilgilenmiyor"; API değişmez.
- Karar sonrası: "Kayıtlara eklendi" (yeşil kenar) ya da "Geçildi" (soluk) + **Geri al**.
- İlgilen'e basınca ad alanı **açılmaz**; ad, Kayıtlar panelinde girilir. Böylece Google adının ad girme alanının
  yanında görünme riski de ortadan kalkar.
- Altta atıf cümlesi + "Bu sayfadakileri geç" + "Sonraki sayfa" (20'şer).

**Gerekenler:**

- Mesafe için Place Details maskesine `location` eklenir. Bu Essentials alanıdır; istek zaten Pro faturalandığı için
  ek ücret doğurmaz. Konum yalnızca bellekte kullanılır, yazılmaz.
- "Son taramanın sonuçları" için tarama → kayıt ilişkisi gerekir. `leads.scan_id` yalnızca kaydı **ilk** bulan
  taramayı tutar; aynı işletme sonraki taramada tekrar bulunursa o taramanın sonuçlarında görünmez. Öneri: yalnızca
  kimlik tutan `tarama_sonuclari (scan_id, lead_id)` tablosu (karar 10). Places içeriği değil, kendi kimliklerimiz;
  saklama kuralını bozmaz.
- `/tarama/inceleme` → `/tarama?sonuclar=…` yönlendirmesi. Taramalar arası incelenmemişler Kayıtlar > İncelenmemiş
  sekmesinde.

### 3.5 Taslakta olmayan ekranlar: öneriler (aynı ilkelerle)

**Panel** (`/panel`, şimdi: 3 sayı kartı, durum hunisi, son taramalar):

- Başlık "Panel" + "Bugün nereden devam edeceğinizi gösterir."
- Üstte 4 `IstatistikKutusu`: Toplam kayıt, İletişimde + görüşme, Kazanıldı, Bu ay gönderilen mesaj.
- **"Sıradaki işler"** kartı, satır yapısında, her satırda bir eylem:
  - N incelenmemiş tarama sonucu → Bölge tara.
  - WhatsApp günlük listede N kişi → Kampanyalar.
  - Kuyrukta bekleyen kampanya.
  - Gönderim servisi uyarısı (yönetici).
  - Kurulumu bitmemiş kanal → ilgili Ayarlar bölümü.
- İki sütun: durum hunisi (yatay çubuklar, durum renkleriyle) ve son taramalar / son kampanyalar.
- Kullanım yüzdesi Panelde gösterilmez (yalnızca menü ve Ayarlar > Kullanım; ilke c).

**Kampanyalar** (`/kampanyalar`, şimdi `/iletisim`: yeni kampanya formu + kampanya listesi + WhatsApp günlük liste
tek sayfada):

- Başlık "Kampanyalar" + açıklama; sağda ana düğme **"Yeni kampanya"**.
- Segment **Kampanyalar / WhatsApp günlük liste** (`?sekme=`).
- Kampanyalar sekmesi: tablo; sütunlar Ad, Kanal rozeti, Durum rozeti (Kuyrukta / Gönderiliyor / Tamamlandı /
  Duraklatıldı), "gönderilen / toplam" çubuğu, Oluşturma. Satır → `/kampanyalar/[id]`.
- WhatsApp günlük liste sekmesi: bugünkü bileşen yeni kartlarla. Durum varsayılanı ve "doldur" düğmesinin
  yüklenirken pasif olması açıkça gösterilir (turda görülen karışıklık).
- Kampanya detayı (`/kampanyalar/[id]`):
  - Durum kartı (rozetler, ilerleme, işçi durumu).
  - Sekmeler Alıcılar / Mesaj / Geçmiş.
  - Duraklat / Sürdür / İptal düğmeleri sağ üstte.

**Kampanya oluşturma sihirbazı** (`/kampanyalar/yeni`). Şimdi tek uzun form (609 satır): kanal, ad, alıcı grubu,
konu, mesaj, hitap, önizleme, ileri tarih, "Gönderim özetini göster" → özet → onay. Hedef, dört adımlı sihirbaz:

| Adım | İçerik | İlerleme koşulu |
|---|---|---|
| 1. Kanal | Üç büyük seçim kartı: E-posta, SMS, WhatsApp (Meta). Her kartta bağlantı rozeti; bağlı değilse "test modunda gönderilir" açıklaması ve Ayarlar bağlantısı. WhatsApp (Meta) yalnızca yöneticiye | Kanal seçili |
| 2. Alıcılar | Kampanya adı; süzgeç çipleri (Durum, Etiket, Alıcı türü); sağda **canlı alıcı özeti**: "N kişiye gidecek · M hariç" ve hariç nedenleri (ret, engel, iletişim yok, bireysel onaysız, ilgilenmiyor, cep değil). Bugünkü özet uç noktası kullanılır | En az 1 alıcı |
| 3. Mesaj | E-posta: konu + metin. SMS: metin + karakter / parça sayacı. WhatsApp: şablon seçimi (kullanılamazlar gerekçeyle pasif) + değişkenler. Hitap seçeneği, iki önizleme (ad girilmiş / girilmemiş) yan yana | Zorunlu alanlar dolu, şablon geçerli |
| 4. Gözden geçir ve gönder | Özet kartı (kanal, alıcı, mesaj kısa görünüm), zamanlama ("Hemen" / "İleri tarih"), gönderim penceresi ve günlük sınır bilgisi ("Bugün 5'i gönderilir, kalanı ertesi gün"), WhatsApp'ta tahmini Meta ücreti (karar 8), test modu uyarısı. "Kampanyayı başlat" | Sunucu onayı |

Sihirbaz ayrıntıları:

- Üstte `AdimListesi`'nin yatay biçimi (1 Kanal · 2 Alıcılar · 3 Mesaj · 4 Gönder).
- Adım adresi URL'de (`?adim=2`) tutulur; geri düğmesi çalışır. Form durumu bileşende kalır; sayfa yenilenirse
  1. adımdan başlar.
- Sunucu doğrulaması değişmez: son adım bugünkü oluşturma API'sine aynı gövdeyi gönderir. Adım geçişleri saf
  fonksiyonlarla (`adimGecerliMi`) yapılır ve test edilir.
- "Test kampanyası" kısayolu: `?kanal=whatsapp_api&test=1` 1. adımı atlar; alıcıyı test numaralarıyla sınırlar
  (mevcut test modu davranışı).

---

## 4. Veri görünürlüğü ve kullanım

### 4.1 (a) Tarama sonuçlarında ad ve adres otomatik

- Sonuç ızgarası açılınca görünen sayfadaki (20) kayıtların ad, adres ve konumu `POST /api/kayitlar/canli` ile tek
  istekte gelir (Place Details Pro, kayıt başı 3 birim). Yeni bir alan, saklama ya da önbellek yok; içerik sonuç
  ızgarasının React belleğinde.
- Kota %100'deyse kartlarda "İşletme bilgisi gösterilemiyor" çıkar, İlgilen / Geç çalışmaya devam eder.
- Değerlendirilip **elenen** seçenek: taramanın kendisinde Text Search Pro ile ad ve adres istemek. İstek başına 20
  sonuç döndüğü için daha ucuz olurdu, ama tarama ile inceleme arasında içeriğin tutulması gerekir. Saklama kuralı
  buna izin vermiyor.

### 4.2 (b) Kayıtlar listesinde otomatik ad ve adres (%80'e kadar)

- Yalnızca **adı girilmemiş Google kayıtları** için, yalnızca görünen sayfa (en fazla 20). Listeyi çizen sunucu
  sayfası Places'a gitmemeye devam eder; tablo yüklendikten sonra istemci `POST /api/kayitlar/canli` çağırır ve
  gövdede `otomatik: true` gönderir.
- **Eşik sunucuda uygulanır:** `otomatik: true` isteği, birim ayrılmadan önce kullanım %80'e ulaştıysa ya da bu istek
  ulaştıracaksa reddedilir (`{ otomatikKapali: true }`, birim düşmez). İstemci o zaman satırlarda "Göster" düğmesine
  döner. Elle "Göster" bugünkü gibi %100'e kadar çalışır. Eşik `KOTA_UYARI_ORANI` sabitinden okunur (detay
  panelindeki %80 istisnasıyla aynı sabit).
- Gösterim: ad kalın, adres ikinci satırda; ikisinin yanında `GoogleEtiketi`. Tablonun altında "'Google' etiketli
  bilgiler Google Haritalar'dan anlık gösterilir, kaydedilmez." ve `GoogleAtfi`.
- Bellek kuralı aynen: içerik yalnızca o tablo görünümünün belleğinde; sayfa, sekme ya da süzgeç değişince silinir.
  Tarayıcı depolaması yok (`liste-maliyeti` testi korur). Ekran açıkken aynı kimlikler için yeniden çağrı yapmamak
  bir gevşetme olurdu (karar 3; varsayılan: yapılmaz).
- Kullanıcı ad girdiği an satır kendi adını gösterir ve o kayıt bir daha otomatik çağrılmaz. Ayarlar > Kullanım'daki
  bilgi notu bunu söyler: "Kendi kaydınıza adını yazdığınız işletmeler kullanım harcamaz."

### 4.3 (c) Arayüzde "birim" ve tıklama başına maliyet yok

Değişecek yerler:

- `google-bilgisi.tsx` → `maliyetMetni` kalkar. Düğmeler "Göster" ve "Bu sayfadakileri göster".
- `detay-paneli.tsx` → "Google bilgilerini göster (4 birim)" ve "(4 birim, saklanmaz)" → "Google bilgilerini
  göster", "açarken Google'dan alınır, saklanmaz".
- `whatsapp-listesi.tsx` → aynı düzeltme.
- `kota-cubugu.tsx` → "N / M birim" yerine yüzde. Kalan birim metni kalkar.
- `ayarlar/page.tsx` → "Hangi işlem kaç birim?" tablosu ve birim açıklaması arayüzden kalkar, README'de kalır.
- `tarama-paneli.tsx` → istek sayısı, IDs Only ve ücretli ifadeleri kalkar.
- `yeni-kampanya.tsx` → "Tahmini kota maliyeti N birim (bu ay kalan M)" → "Numaralar Google'dan alınır; bu ayki
  kullanımınızın yaklaşık %X'i." Yüzde sunucuda hesaplanır.

Kullanım yalnızca iki yerde görünür: menüdeki yüzde göstergesi ve Ayarlar > Kullanım ve paket.

Kota dolduğunda ya da %80 geçildiğinde davranış değişikliği yine açıklanır (sayı yazmadan):

- "Bu ay otomatik gösterim sınırına ulaşıldı; bilgileri istediğinizde gösterilir."
- "Bu ayki kullanımınız doldu."

WhatsApp kampanya özetindeki **tahmini Meta ücreti** ($) Places birimi değil, Meta'nın gerçek mesaj ücretidir. Öneri:
kalsın, "Tahmini Meta ücreti" olarak (karar 8).

Kod içindeki birim sistemi (`places-birimleri.ts`, kota birimi, iade) aynen kalır; değişen yalnızca arayüz metni.

### 4.4 Kullanım dökümü (Ayarlar > Kullanım ve paket)

Taslak, kullanımı üç kalemde gösteriyor: İşletme bilgileri (liste ve incelemede ad ve adres = Place Details Pro),
Telefon ve web sitesi (detay, arama, WhatsApp = Enterprise), Taramalar (Text Search Pro, adres araması dahil).
Bugün `usage_counters` yalnızca toplamı tutuyor.

- Yeni migration: `usage_counters`'a üç sütun ekle (`isletme_bilgisi`, `iletisim_bilgisi`, `tarama`; birim). Toplam
  sütunu ve kotanın atomik kontrolü aynen kalır.
- Kota ayırma ve iade fonksiyonları bir `kalem` parametresi alır. Aynı SQL ifadesinde toplam ve kalem birlikte
  artırılır, iade ikisinden birlikte düşer.
- Ekran: büyük yüzde, 12 px çubuk, "Kasım ayı · 1 Aralık'ta sıfırlanır", üç kalemin toplam içindeki payı (yüzde
  çubukları, sayı yok), bilgi notu, "Aylık kullanım sınırı" kartı ve `SINIR_ARTIRMA_METNI`.

### 4.5 Tahmini aylık tüketime etkisi (README'deki varsayımla)

**Varsayım** (README, "Tahmini aylık tüketim"):

- Tek çalışma alanı.
- Ayda 1.000 liste sayfası görüntüleme (sayfa başı 20 satır).
- 300 detay açılışı.
- 20 tarama × 40 sonuç incelenir.
- Bugünkü akışta sayfaların %20'sinde "Göster" istenir.

**Ek varsayım:** otomatik gösterim yalnızca adı girilmemiş Google kayıtlarına gider. Görüntülenen satırlarda bunların
payı (p) bilinmiyor; üç senaryo hesaplandı.

| Kalem | Bugün (birim) | Yeni, p = %25 | Yeni, p = %50 | Yeni, p = %100 (en kötü) |
|---|---|---|---|---|
| Kayıt listesi | 200 × 20 × 3 = 12.000 (istenince) | 1.000 × 5 × 3 = 15.000 | 1.000 × 10 × 3 = 30.000 | 1.000 × 20 × 3 = 60.000 |
| Tarama sonuçları (artık otomatik) | 20 × 40 × 3 = 2.400 | 2.400 | 2.400 | 2.400 |
| Detay paneli (Enterprise) | 300 × 4 = 1.200 | 1.200 | 1.200 | 1.200 |
| **Toplam** | **15.600** | **18.600 (×1,2)** | **33.600 (×2,2)** | **63.600 (×4,1)** |

Tarama sonuçları bugünkü varsayımda da tamamı "Göster" ile sayılmıştı; otomatik olunca kalem değişmez. Kullanıcı her
taramanın bütün sonuç sayfalarına bakmazsa daha az olur.

**Kota eşiğiyle etkileşim (önemli):**

- Varsayılan kota 6.000 birim, %80 eşiği 4.800 birim.
- Tarama ve detay ay boyunca ≈ 3.600 birim tutuyor. Ay boyu bakılırsa otomatik liste için ≈ 1.200 birim kalıyor;
  p = %50'de bu ≈ 40 sayfa görüntüleme eder.
- Ayın başında tarama ve detay henüz az harcamış olduğu için liste en fazla ≈ 4.800 birim (≈ 160 sayfa) harcayabilir.
  Ayda 1.000 görüntülemede (günde ≈ 33) otomatik mod **ayın ilk 2–5 gününde** kapanır. Ayın kalanında liste bugünkü
  gibi "Göster" ile çalışır; taramalar ve detay da kalan %20 ile paylaşılır.
- Varsayılan kotayla (b) pratikte çok kısa sürer. Bir çalışma alanının ay boyu otomatik görmesi için kota en az
  toplam / 0,8 olmalı: p = %25 → 23.250, p = %50 → **42.000**, p = %100 → 79.500 birim (karar 1).
- Kota üst sınır olduğu için çalışma alanı başına harcama hiçbir durumda kotayı aşmaz. Değişen, kotanın daha erken
  dolmasıdır.

**Dolar karşılığı** (Ekim 2026 liste fiyatı; Place Details Pro $17 / 1.000 ve ayda 5.000 ücretsiz, Enterprise
$20 / 1.000 ve 1.000 ücretsiz; tek çalışma alanı, kota engel olmadığı varsayımıyla):

| | Pro isteği / ay | Pro ücreti | Enterprise | Toplam (taramalar hariç) |
|---|---|---|---|---|
| Bugün | 4.000 + 800 = 4.800 | $0 (ücretsiz kotada) | 300 → $0 | **≈ $0** |
| p = %25 | 5.000 + 800 = 5.800 | 800 × $0,017 = $13,60 | $0 | **≈ $14** |
| p = %50 | 10.000 + 800 = 10.800 | 5.800 × $0,017 = $98,60 | $0 | **≈ $99** |
| p = %100 | 20.000 + 800 = 20.800 | 15.800 × $0,017 = $268,60 | $0 | **≈ $269** |

**Not:** Google'ın aylık ücretsiz istekleri faturalama hesabı başınadır, çalışma alanı başına değil. Birden çok
çalışma alanı aynı Google hesabını paylaştığında ücretsiz kota ilk çalışma alanında tükenir. İkinci ve sonraki
çalışma alanlarında p = %50 ≈ $184 / ay olur (10.800 × $0,017). README'deki "$0" tahmini de aynı nedenle tek
çalışma alanı içindir.

Bu bölümün sonuçları uygulama sırasında README'nin "Tahmini aylık tüketim" ve "Aylık Places kotası" bölümlerine
işlenir. Liste için "kendiliğinden Places'a gitmez" kuralı "otomatik gösterim %80'e kadar" olarak değişir; bu, README
"Alınan kararlar"daki listenin varsayılan maliyeti kararını geri alan bir değişikliktir ve oraya yazılır.

---

## 5. Rotalar, uç noktalar ve veri

| Tür | Değişiklik |
|---|---|
| Yeni rotalar | `/ayarlar/{calisma-alani,ekip,kullanim,gonderen,saatler,whatsapp-listesi,whatsapp,sms,eposta,veri}` + `ayarlar/layout.tsx`; `/kampanyalar`, `/kampanyalar/yeni`, `/kampanyalar/[id]` |
| Yönlendirmeler | `/ayarlar` → `/ayarlar/calisma-alani`; `/iletisim` → `/kampanyalar`, `/iletisim/kampanya/:id` → `/kampanyalar/:id`; `/tarama/inceleme` → `/tarama` (geçici, `permanent: false`) |
| Güncellenecek bağlantılar | `menu.tsx`; `iletisim/page.tsx`; `kampanya-detayi.tsx` (geri bağlantısı); `whatsapp-listesi.tsx` ("Ayarlar" → `/ayarlar/whatsapp-listesi`); `api/whatsapp/ac/[id]/route.ts` (`/iletisim?wa=capraz#whatsapp` ve `/iletisim` → `/kampanyalar?sekme=whatsapp…`); `ayarlar/eylemler.ts` (`revalidatePath` yolları); **`src/proxy.ts` eşleyicisi** (`/kampanyalar/:path*` eklenmeli; bu iyimser giriş yönlendirmesidir, asıl doğrulama her sayfada `sayfaBaglami` ile yapılır) |
| Yeni uç noktalar | `GET /api/kullanim` (yüzde, eşik durumu); tarama sonuçları için sayfa sorgusu (server component; ayrı API gerekmez) |
| Değişen uç nokta | `POST /api/kayitlar/canli`: `otomatik` bayrağı ve sunucuda %80 eşiği; maskeye `location` (Essentials) |
| Migration | `usage_counters` kalem sütunları; (karar 10 onaylanırsa) `tarama_sonuclari (scan_id, lead_id)` |
| Repo | `kullanim`: kalemli ayırma ve iade, `kullanimDokumu`; `tarama`: `taramaSonuclari(scanId, sayfa)`; `kayitlar`: segment sayıları (İlgilendiklerim / İncelenmemiş / Tümü) |

---

## 6. Uygulama grupları ve sırası

Her grup kendi içinde çalışır durumda biter: typecheck, lint, test, build, değişen dosyalar listesi, Türkçe commit
mesajı, sonra durulur.

| Grup | Kapsam | Görünür sonuç | Bağımlılık |
|---|---|---|---|
| **1. Temel** | Belirteçler (`@theme`: renkler, `--radius-kart`, Plex Mono), yardımcı sınıfların yeni ölçüleri, `src/components/arayuz/*` parçaları, `SayfaBasligi`, `AnaMenu` (232 px, simgeler, kullanıcı kartı, yeni adlar), `KullanimGostergesi` + `GET /api/kullanim`, içerik iç boşlukları; her sayfaya bir cümlelik açıklama | Bütün uygulama yeni iskelette; ekran içerikleri aynı | — |
| **2. Ayarlar** | Ayar alt rotaları ve layout, sol menü (bağlantı noktaları), bölümlerin `AyarSatiri` / `KaydetCubugu` ile yeniden dizilmesi, WhatsApp (Meta) bölümü (durum kartı, `kurulumAdimlari`, pay kaydırıcısı, numara çipleri, şablonlar, teknik ayrıntılar), `/ayarlar` yönlendirmesi, bağlantı ve `revalidatePath` güncellemeleri. Mevcut API'ler aynen | Taslaktaki Ayarlar | 1 |
| **3. Kullanım ve görünürlük altyapısı** | Kalem sayaçları (migration, ayırma / iade), Ayarlar > Kullanım dökümü, arayüzden bütün "birim" metinlerinin kalkması (4.3), `canli` uç noktasında `otomatik` + %80 eşiği + `location`, README maliyet bölümleri ve "Alınan kararlar" | Maliyet metni yok; kullanım yalnızca yüzde | 1, 2 |
| **4. Kayıtlar** | Segment ve sayılar, arama + Filtreler paneli, yeni tablo sütunları, otomatik Google ad / adres (b), ayrıntı paneli (Ara / WhatsApp / E-posta, Genel / İletişim izni / Geçmiş, durum çipleri), dar ekranda çekmece | Taslaktaki Kayıtlar | 3 |
| **5. Bölge tara** | Form kartı + harita düzeni, kategori çipleri, durum satırı, sonuç ızgarası (a), İlgilen / Geç / Geri al, segment, "Bu sayfadakileri geç", önceki taramalar, (karar 10) `tarama_sonuclari`, `/tarama/inceleme` yönlendirmesi | Taslaktaki Bölge tara | 3 |
| **6. Kampanyalar** | `/iletisim` → `/kampanyalar` (yönlendirme, `proxy.ts`), liste + WhatsApp günlük liste segmenti, kampanya detayı sekmeleri, **sihirbaz** (4 adım, `adimGecerliMi`), test kampanyası kısayolu | Yeni Kampanyalar | 1, 3 |
| **7. Panel** | İstatistik kutuları, "Sıradaki işler", huni ve son taramalar / kampanyalar | Yeni Panel | 4, 5, 6 |
| **8. Rehber ve tur** | `docs/TEST-REHBERI.md` yeni gezinmeye göre (menü adları, ayar rotaları, sihirbaz adımları, otomatik ad), demo verisinin kontrolü, Chrome'da tam tur (yalnızca localhost:3000), README ekran adları | Doğrulanmış rehber | 1–7 |

Sıranın gerekçesi: 1. grup her ekranın kullandığı parçaları verir. Ayarlar en az veri değişikliği isteyen ekran
olduğu için parçaları erkenden sınar. Görünürlük kuralları (3), Kayıtlar ve Tarama'dan önce sunucuda hazır olmalı;
böylece %80 eşiği istemciye güvenmeden çalışır. Panel en son yapılır, çünkü diğer ekranların sayılarını özetler.

---

## 7. Test etkisi

**Değişmesi gereken mevcut testler:**

- **Taşınan dosya yollarını kaynak olarak okuyan testler** (`tests/kullanilabilirlik.test.ts`,
  `liste-maliyeti.test.ts`). Örnekler: `tarama/inceleme/inceleme-ekrani.tsx`, `iletisim/whatsapp-listesi.tsx`,
  `iletisim/kampanya/[id]/kampanya-detayi.tsx`, `ayarlar/mesajlasma-ayarlari.tsx`, `ayarlar/whatsapp-api-ayarlari.tsx`,
  `(app)/layout.tsx`. Dosya taşındığı grupta yol güncellenir; doğruladığı davranış korunur:
  - etiket renkleri;
  - tarayıcı depolaması yasağı;
  - giriş formu hidrasyonu;
  - geliştirme simgesinin yeri.
- **`liste-maliyeti.test.ts`:** "sunucu listesi Places'a gitmez" testi kalır. Yeni testler:
  - `otomatik: true` %80'in altında birim düşer (kayıt başı 3);
  - eşikte ve eşiği aşacak istekte reddedilir, birim düşmez (sınır durumu, tam %80);
  - adı girilmiş kayıtlar ücretlendirilmez;
  - elle "Göster" %80–%100 arasında çalışır;
  - kota doluyken ikisi de reddedilir.
- **`places-maske.test.ts`:** liste ve inceleme maskesine `location` eklenir; Enterprise alanı yasağı aynen.
- **`kota.test.ts`, `kota-birim.test.ts`:** kalemli ayırma; toplamın atomikliği (4 süreç testi) aynen geçmeli. Ay
  geçişinde kalem sütunları da sıfırdan başlar. İade, doğru kaleme yapılır.
- **`migrasyon.test.ts`, `sema.test.ts`:** yeni migration(lar).
- **`izolasyon.test.ts`:** her yeni repo dışa aktarımı (`kullanimDokumu`, `taramaSonuclari`, segment sayıları) için
  kiracı izolasyonu testi zorunlu.

**Yeni testler:**

- **Arayüzde "birim" yok:** `src/app/(app)` ve `src/components` altındaki `.tsx` dosyalarında, yorumlar dışında,
  kullanıcıya görünen "birim" geçmez. Grup 3'te eklenir; eski kodda kalır.
- **`kurulumAdimlari`:** WhatsApp kilit verisinden 4 adımın tamam / etkin / kilitli durumları. 4. adım yalnızca 1–3
  tamamsa açılır; sunucu kilidi testleri (`whatsapp-api.test.ts`) değişmez.
- **Kampanya sihirbazı:** `adimGecerliMi` (kanal yokken ilerlenmez, 0 alıcıda ilerlenmez, kullanılamaz şablonla
  ilerlenmez). Son adımın gövdesi bugünkü API sözleşmesiyle aynı; `kampanya.test.ts` değişmeden geçmeli.
- **Yönlendirmeler ve `proxy.ts`:** eski adresler yeni adreslere gider; `/kampanyalar` oturumsuz erişimde girişe
  yönlenir.
- **Sekme anlamları:** İlgilendiklerim / İncelenmemiş / Tümü sayıları ve süzme; ilgilenmiyor kayıtları
  İlgilendiklerim'de yok.
- **Tarama sonuçları:** bir taramanın sonuç sorgusu yalnızca o kiracının ve o taramanın kayıtlarını döndürür. Karar
  10 kabul edilirse tekrar bulunan kayıt da listelenir.
- **Erişilebilirlik:** sekmelerde `role`, `aria-selected` ve ok tuşları için birim testi (saf yardımcı fonksiyon).
  Rozetlerde metin her zaman var.

Her davranış değişikliğinde testin eski kodda kaldığı doğrulanır (bugünkü çalışma şekli).

---

## 8. Karar bekleyenler

1. **Varsayılan kota ve (b):** 6.000 birimle otomatik liste ayın ilk günlerinde kapanır (4.5). Seçenekler: (i)
   varsayılan kotayı yükseltmek (p = %50 için ≈ 42.000 birim; çalışma alanı başına ≈ $99–184 / ay), (ii) kotayı aynı
   bırakıp otomatik modu yalnızca "İncelenmemiş" ve tarama sonuçlarıyla sınırlamak, (iii) olduğu gibi kabul etmek.
   Öneri: (iii) ile başlamak, Ayarlar > Kullanım'da otomatik modun kapandığını açıkça yazmak, gerçek p değerini bir
   ay ölçüp sonra kotaya karar vermek.
2. **Ücretsiz Google kotasının paylaşılması:** dolar tahmini tek çalışma alanı içindir. Fiyatlandırma ya da paket
   kararı bu değişiklikten önce mi verilecek?
3. **Ekran açıkken bellekteki sonucu yeniden kullanmak:** sekme ya da sayfa değişip geri dönüldüğünde aynı kayıtlar
   yeniden çağrılmasın mı? Tüketimi düşürür ama "sayfa değişince silinir" kuralını gevşetir. Öneri: hayır.
4. **Kayıtlar sekmelerinin anlamı:** "İlgilendiklerim" inceleme alanına mı, durum alanına mı, ikisine mi bakmalı?
   Öneri: ikisi (3.3).
5. **"Tahmini sonuç: N işletme"** (Bölge tara): tarama yapmadan ücretsiz bir tahmin kaynağı yok. Öneri: göstermemek;
   yerine süre bilgisi.
6. **Taslakta olup uygulamada olmayanlar:**
   - Giriş adresi (alt alan adı);
   - saat dilimi seçimi;
   - paket adı;
   - aydınlatma metni adresi;
   - "Tüm verileri sil";
   - "Daveti yeniden gönder";
   - test numarası sınırı (taslak 5, API 20);
   - veri saklamada hazır seçenekler (6 / 12 / 24 ay; bugün 30–3650 gün serbest).

   Öneri: bu düzen işinde salt okunur ya da hiç gösterilmez; yeni özellik olarak ayrı ayrı ele alınır. "Tüm
   verileri sil" geri alınamaz ve ayrı bir güvenlik incelemesi ister.
7. **WhatsApp günlük liste ayarlarının yeri:** Gönderim > "WhatsApp listesi" (öneri) ya da WhatsApp (Meta) sayfası.
8. **Kampanya özetindeki Meta ücreti ($):** "birim yok" ilkesine rağmen kalsın mı? Öneri: kalsın, gerçek para ve
   yalnızca yöneticiye görünür.
9. **Rota adları:** `/iletisim` → `/kampanyalar` ve Ayarlar alt rotalarının adları (bölüm 5). Eski adresler
   yönlendirilir.
10. **`tarama_sonuclari` tablosu:** "Son taramanın sonuçları"nın tekrar bulunan işletmeleri de göstermesi için.
    Öneri: evet (yalnızca kimlikler).
11. **Üyenin Ayarlar'da gördükleri:** salt okunur bölümler (bugünkü gibi) mi, yalnızca kendini ilgilendiren
    bölümler mi?
12. **Renk belirteçleri:** ara tonları taslak değerlerine çekmek (1.2). Öneri: evet; ana renk, menü rengi ve yazı
    tipi zaten aynı.

---

## 9. Verilen kararlar (1 Kasım 2026)

Plan onaylandı. Yukarıdaki maddelere verilen yanıtlar:

1. **(iii)**: kota şimdilik aynı. Otomatik gösterim %80'de kapanınca Kayıtlar'da ve Ayarlar > Kullanım'da sade açıklama:
   "Bu ay otomatik gösterim sınırına ulaşıldı; bilgileri istediğinizde gösterilir."
2. Fiyat / paket: karar pilottan sonra.
3. **Bellekte yeniden kullanım: evet, sınırlı.** Google'dan gelen ad, adres, konum ve detay panelinin iletişim
   bilgileri istemcide **yalnızca bellekte** (React context ya da modül düzeyinde Map; localStorage,
   sessionStorage, IndexedDB ve sunucu yok) kayıt kimliğine göre **en fazla 30 dakika** tutulur ve aynı oturumda
   yeniden kullanılır. Sayfa yenilenince, çıkış yapılınca ve 30 dakika dolunca silinir.
   - Bu bir Places politikası yorumudur. README "Alınan kararlar"a gerekçesiyle ve "canlıya almadan önce gözden
     geçirilmeli" notuyla yazılır.
   - Tarayıcı depolaması yasağı testi aynen kalır. Önbelleğin süresi ve çıkışta temizlenmesi için test eklenir.
   - Tüketim tahmini bu varsayımla (ayda görüntülenen **farklı** kayıt sayısı) Grup 3'te yeniden hesaplanır.
4. Sekmeler: inceleme ve durum birlikte (3.3).
5. "Tahmini sonuç" gösterilmez; yerine süre bilgisi.
6. Taslakta olup uygulamada olmayanlar salt okunur ya da hiç gösterilmez. "Tüm verileri sil" ayrı bir iş.
7. WhatsApp günlük liste ayarları: Gönderim > "WhatsApp listesi".
8. Meta ücreti ($) kalır, yalnızca yöneticiye.
9. Rota adları bölüm 5'teki gibi.
10. `tarama_sonuclari (scan_id, lead_id)` eklenir; yalnızca kimlikler.
11. **Üye** Ayarlar'da yalnızca şunları görür:
    - Çalışma alanı ve Ekip (salt okunur);
    - Kullanım;
    - Saatler ve sınırlar (salt okunur);
    - WhatsApp listesi.

    WhatsApp (Meta), SMS, E-posta, Gönderen bilgileri ve Veri saklama üyeye menüde de görünmez. Sunucu tarafı yetki
    denetimleri aynen kalır.
12. Renk belirteçleri taslak değerlerine çekilir.

Önbellek (karar 3), Grup 3'e eklenir: `canli` sonuçları ve detay iletişim bilgileri ortak bir istemci önbelleğinden
geçer. Önbellek `bildirim.tsx` gibi tek bir istemci modülünde, `(app)` layout'una bağlı bir sağlayıcıyla tutulur ve
çıkış eyleminde temizlenir.

Karar 3 sonrası tüketim yeniden hesaplandı (Grup 3): README, "Tahmini aylık tüketim". Oturum başına 40 / 60 / 100 farklı
kayıtla 8.640 / 11.280 / 16.560 birim; bölüm 4.5'teki önbelleksiz rakamların yerini alır.
