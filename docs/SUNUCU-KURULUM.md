# Sunucu kurulumu — Ubuntu 24.04, Docker'sız

Bu rehber Harita CRM'i `deneme.bursalidagitim.com` adresinde, sıfırdan kurulmuş bir Ubuntu 24.04 VPS'e ilk kez kurmak
için yazıldı. Komutları sırayla kopyalayıp yapıştırın. Her adımın sonunda **Kontrol** satırı, o adımın doğru gittiğini
nasıl anlayacağınızı söyler. Kontrol tutmuyorsa sonraki adıma geçmeyin; en sondaki "Sorun giderme" tablosuna bakın.

**Kurulum sonunda sunucuda çalışanlar:**

| Parça | Ne yapar | Nerede |
|---|---|---|
| `harita-web` (systemd) | Uygulama (Next.js); yalnızca `127.0.0.1:3000`'i dinler | `/opt/harita-crm` |
| `harita-worker` (systemd) | Kampanya gönderimi, saatlik ve günlük bakım | aynı |
| `harita-yedek.timer` (systemd) | Her gün 03:30'da veritabanı yedeği; 14 gün saklanır | `/var/backups/harita-crm` |
| Caddy | HTTPS sertifikası (Let's Encrypt, otomatik), dışarıdan gelen isteği uygulamaya iletir | `/etc/caddy/Caddyfile` |
| ufw | Güvenlik duvarı: yalnızca 22, 80, 443 açık | — |

**Dosyalar:**

| Yol | İçerik |
|---|---|
| `/opt/harita-crm` | Kod (git) |
| `/opt/harita-crm/.env.production.local` | Ayarlar ve gizli anahtarlar (0600, git'e girmez) |
| `/var/lib/harita-crm/app.db` | Veritabanı (SQLite) |
| `/var/lib/harita-crm/yedek/` | Her güncellemede migration öncesi alınan yedekler |
| `/var/lib/harita-crm/medya/` | Gelen WhatsApp fotoğraf, video, belge ve sesleri (işçi indirir; saklama süresi dolunca silinir) |
| `/var/backups/harita-crm/` | Günlük yedekler (`app-<tarih>.db.gz`) |

**Gerekenler:**
- VPS'in IP adresi ve SSH ile `root` (ya da sudo yetkili bir kullanıcı) girişi.
- `bursalidagitim.com` alan adının DNS paneline erişim.
- GitHub'daki `harita-crm` deposuna erişim (deploy key eklemek için depo yöneticisi).
- Kendi bilgisayarınızda SSH anahtarı. Yoksa: `ssh-keygen -t ed25519`.

Komutlardaki `SUNUCU_IP` yazan yerlere kendi IP adresinizi yazın.

---

## 1. DNS kaydı

DNS panelinde bir **A kaydı** ekleyin:

| Ad | Tür | Değer | TTL |
|---|---|---|---|
| `deneme` | A | `SUNUCU_IP` | 300 |

**Kontrol** (kendi bilgisayarınızda; yayılması birkaç dakika sürebilir):

```bash
nslookup deneme.bursalidagitim.com
```

Yanıtta `SUNUCU_IP` görünmeli. Sertifika (12. adım) DNS doğru olmadan alınamaz.

## 2. İlk giriş ve yönetici kullanıcı

Kendi bilgisayarınızdan bağlanın:

```bash
ssh root@SUNUCU_IP
```

Sunucuda sistemi güncelleyin, saat dilimini ayarlayın ve sudo yetkili bir kullanıcı (`yonetici`) açın:

```bash
apt update && apt -y upgrade
timedatectl set-timezone Europe/Istanbul
adduser --gecos "" yonetici
usermod -aG sudo yonetici
install -d -m 700 -o yonetici -g yonetici /home/yonetici/.ssh
cp /root/.ssh/authorized_keys /home/yonetici/.ssh/authorized_keys
chown yonetici:yonetici /home/yonetici/.ssh/authorized_keys
chmod 600 /home/yonetici/.ssh/authorized_keys
```

`adduser` sizden bir parola ister. Bu parola `sudo` için gerekir; güçlü bir parola seçin ve parola yöneticinize kaydedin.

**Kontrol:** **Bu oturumu kapatmadan**, kendi bilgisayarınızda **ikinci bir terminalde** deneyin:

```bash
ssh yonetici@SUNUCU_IP
sudo whoami
```

`root` yazmalı. Bundan sonraki her şeyi `yonetici` ile yapın.

### Parolayla SSH girişini kapatın

`yonetici` ile anahtarla girebildiğinizi doğruladıktan sonra:

```bash
sudo tee /etc/ssh/sshd_config.d/10-harita.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo sshd -t && sudo systemctl reload ssh
```

**Kontrol:** yeni bir terminalde `ssh yonetici@SUNUCU_IP` hâlâ çalışmalı. `ssh root@SUNUCU_IP` artık reddedilmeli.
Çalışmıyorsa açık kalan eski oturumdan `sudo rm /etc/ssh/sshd_config.d/10-harita.conf && sudo systemctl reload ssh`
ile geri alın.

## 3. Paketler ve Node.js 22

Derleme araçları gerekiyor (`better-sqlite3` yerel modülü için). `sqlite3` yalnızca elle inceleme içindir.

```bash
sudo apt install -y git curl ca-certificates build-essential python3 sqlite3
```

Node.js 22 LTS'yi NodeSource deposundan kurun. Ubuntu'nun kendi `nodejs` paketi eskidir.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
```

**Kontrol:** `node -v` → `v22.…`; `which node` → `/usr/bin/node` (servis dosyaları bu yolu kullanır).

## 4. Caddy

Resmî Caddy apt deposundan:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

**Kontrol:** `systemctl is-active caddy` → `active`.

## 5. Güvenlik duvarı (ufw)

SSH kuralını **ilk sırada** ekleyin; yoksa bağlantınız kopar.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose
```

80 numaralı port Let's Encrypt doğrulaması ve http → https yönlendirmesi için açık kalır. 3000 açılmaz; uygulamaya
yalnızca Caddy ulaşır.

**Kontrol:** listede yalnızca `OpenSSH`, `80/tcp`, `443/tcp` görünmeli (v6 karşılıklarıyla). Yeni bir terminalden
`ssh yonetici@SUNUCU_IP` hâlâ çalışmalı.

## 6. Uygulama kullanıcısı ve klasörler

Uygulama kendi kullanıcısıyla (`harita`) çalışır. Bu kullanıcı oturum açamaz.

```bash
sudo useradd --system --create-home --home-dir /home/harita --shell /usr/sbin/nologin harita
sudo install -d -o harita -g harita -m 750 /opt/harita-crm /var/lib/harita-crm
sudo install -d -o harita -g harita -m 700 /var/backups/harita-crm
```

**Kontrol:** `ls -ld /opt/harita-crm /var/lib/harita-crm /var/backups/harita-crm` → üçünün sahibi `harita harita`.

## 7. Kodu indirme (deploy key ile)

Depo özelse sunucuya **yalnızca okuma** yetkili bir anahtar verin:

```bash
sudo -u harita install -d -m 700 /home/harita/.ssh
sudo -u harita ssh-keygen -t ed25519 -N "" -C "harita-crm sunucu" -f /home/harita/.ssh/id_ed25519
sudo cat /home/harita/.ssh/id_ed25519.pub
```

Çıkan tek satırı GitHub'da kopyalayın: **harita-crm deposu → Settings → Deploy keys → Add deploy key**. Başlık
"deneme sunucusu" olsun. **"Allow write access" işaretlemeyin.**

```bash
sudo -u harita ssh -o StrictHostKeyChecking=accept-new -T git@github.com || true
sudo -u harita git clone git@github.com:CagriCelikkoll/harita-crm.git /opt/harita-crm
```

**Kontrol:** ilk komut `Hi CagriCelikkoll/harita-crm! You've successfully authenticated` yazmalı (çıkış kodu 1 olması
normaldir). `ls /opt/harita-crm` → `package.json`, `deploy/`, `docs/` …

## 8. Bağımlılıklar, ortam dosyası ve gizli anahtarlar

```bash
sudo -u harita -H bash -c 'cd /opt/harita-crm && npm ci --no-audit --no-fund'
sudo -u harita cp /opt/harita-crm/.env.production.example /opt/harita-crm/.env.production.local
sudo -u harita chmod 600 /opt/harita-crm/.env.production.local
sudo -u harita -H bash -c 'cd /opt/harita-crm && npm run --silent anahtar:uret -- .env.production.local'
```

> `/opt/harita-crm` yalnızca `harita` kullanıcısına açıktır (750); yönetici kullanıcı oraya `cd` yapamaz. Bu yüzden
> bu rehberdeki komutlar tam yol kullanır ya da klasöre `harita` (veya `sudo`) olarak geçer.

`npm ci` birkaç dakika sürer. Son komut üç gizli anahtarı (`BETTER_AUTH_SECRET`, `ILETI_SIFRELEME_ANAHTARI`,
`ILETI_IMZA_ANAHTARI`) üretip dosyaya yazar. **Değerleri ekrana yazmaz**, dolu olanların üzerine de yazmaz. Ekranda
üç `✓` görünmeli.

Dosyayı düzenleyin:

```bash
sudo -u harita nano /opt/harita-crm/.env.production.local
```

Doldurulacaklar:

| Ayar | Değer |
|---|---|
| `ILK_YONETICI_EPOSTASI` | İlk yönetici hesabının e-postası. Kayıt yalnızca davetle açık (`KAYIT_KIPI=davetle`); hiç kullanıcı yokken yalnızca bu adres kayıt olabilir. |
| `GOOGLE_PLACES_API_KEY` | Google Cloud'da **Places API (New)** ile ve sunucunun IP adresiyle (`SUNUCU_IP`) kısıtlı anahtar. |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Ayrı tarayıcı anahtarı: yalnızca **Maps JavaScript API** ve HTTP referrer `https://deneme.bursalidagitim.com/*`. |

Diğer değerler canlı için hazır gelir: veritabanı yolu, yedek klasörü, alan adı, `PLACES_MOCK=false`. Kaydedip çıkın
(nano: `Ctrl+O`, `Enter`, `Ctrl+X`).

> **Önemli:** bu dosyanın bir kopyasını **sunucu dışında güvenli bir yerde** (parola yöneticisi) saklayın.
> Veritabanı yedeği tek başına yetmez: `ILETI_SIFRELEME_ANAHTARI` olmadan kayıtlı WhatsApp ve SMTP bilgileri
> çözülemez. `ILETI_IMZA_ANAHTARI` olmadan da engel listesi eşleşmez (RET vermiş kişiye yeniden gönderim riski).
> Bu iki anahtarı **hiçbir zaman değiştirmeyin.**

**Kontrol:** `sudo -u harita grep -c '^ILETI_IMZA_ANAHTARI=.\+' /opt/harita-crm/.env.production.local` → `1`.
Bu komut değeri değil, yalnızca doluluğu gösterir. `sudo ls -l /opt/harita-crm/.env.production.local` → `-rw-------`.

## 9. Derleme ve veritabanı

```bash
sudo -u harita -H bash -c 'cd /opt/harita-crm && npm run build < /dev/null && npm run db:migrate'
```

Derleme birkaç dakika sürer. `NEXT_PUBLIC_*` değerleri derleme anında sayfaya gömülür; bunları sonradan değiştirirseniz
`sudo bash /opt/harita-crm/deploy/guncelle.sh --zorla` ile yeniden derleyin.

**Kontrol:**
- `npm run build` sonunda `✓ Compiled successfully` ve rota listesi görünmeli.
- `db:migrate` → `Migration'lar uygulandı: /var/lib/harita-crm/app.db`.
- `ls -l /var/lib/harita-crm/app.db` → sahibi `harita`.

## 10. Servisler (systemd)

```bash
sudo bash -c 'cd /opt/harita-crm/deploy && cp harita-web.service harita-worker.service harita-yedek.service harita-yedek.timer /etc/systemd/system/'
sudo systemctl daemon-reload
sudo systemctl enable --now harita-web harita-worker
```

**Kontrol:**

```bash
systemctl is-active harita-web harita-worker
curl -s http://127.0.0.1:3000/api/saglik; echo
```

- İlk komut iki kez `active` yazmalı.
- İkincisi `"veritabani","durum":"ok"` ve `"isci","durum":"ok"` içermeli. İşçi ilk turunu bir iki saniyede yapar; `isci`
  sorunluysa 30 sn sonra yeniden deneyin.
- `yedek` henüz `sorunlu` görünür ("hiç günlük yedek yok"); 13. adımda düzelir.

Loglar: `journalctl -u harita-web -f` ve `journalctl -u harita-worker -f` (çıkmak için `Ctrl+C`).

## 11. Log sınırı

Servis logları systemd journal'a yazılır; bu ayar toplam boyutu 500 MB ve süreyi 1 ayla sınırlar. Caddy kendi log
dosyasını kendisi döndürür (20 MB × 10 dosya, 30 gün).

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
sudo cp /opt/harita-crm/deploy/journald-harita-crm.conf /etc/systemd/journald.conf.d/harita-crm.conf
sudo systemctl restart systemd-journald
```

**Kontrol:** `journalctl --disk-usage` çalışıyor ve 500 MB'nin altında.

## 12. HTTPS (Caddy)

```bash
sudo cp /opt/harita-crm/deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo chown -R caddy:caddy /var/log/caddy
sudo systemctl reload caddy
```

`caddy validate` root olarak çalıştığı için log dosyasını (`/var/log/caddy/harita-crm.log`) **root sahipli** açar;
`chown` yapılmazsa `reload` "permission denied" ile düşer. Caddyfile'ı her değiştirdiğinizde aynı üç satırı çalıştırın.

Caddy sertifikayı ilk istekte birkaç saniye içinde alır.

**Kontrol:**

```bash
curl -sI https://deneme.bursalidagitim.com/giris | head -3
curl -s https://deneme.bursalidagitim.com/api/saglik; echo
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: SUNUCU_IP' http://127.0.0.1:3000/giris
```

1. `HTTP/2 200` ve `strict-transport-security` başlığı görünmeli.
2. Dışarıdan sağlık ucu **yalnızca** `{"durum":"ok"}` ya da `{"durum":"sorunlu"}` döner. Ayrıntı yalnızca sunucunun
   kendisine (`127.0.0.1`) gösterilir.
3. `404` yazmalı: uygulama alan adı dışındaki Host'a (ör. IP adresi) cevap vermez.

Sertifika alınamıyorsa `journalctl -u caddy -n 50 --no-pager`'a bakın (genelde DNS henüz yayılmamıştır ya da 80/443
kapalıdır).

## 13. Günlük yedek ve geri yükleme provası

Zamanlayıcıyı açın ve ilk yedeği hemen alın:

```bash
sudo systemctl enable --now harita-yedek.timer
sudo systemctl start harita-yedek
journalctl -u harita-yedek -n 5 --no-pager
sudo ls -l /var/backups/harita-crm
systemctl list-timers harita-yedek.timer
```

**Kontrol:**
- Log: `Yedek alındı: /var/backups/harita-crm/app-….db.gz (… MB, bütünlük denetimi geçti)`.
- Dosya `-rw-------` ve sahibi `harita`.
- Zamanlayıcı listesinde bir sonraki 03:30 görünür.
- `curl -s http://127.0.0.1:3000/api/saglik` içinde artık `"yedek","durum":"ok"` var.

**Geri yüklemeyi şimdi, veritabanı boşken bir kez deneyin.** Gerçek bir sorun günü ilk kez denemek riskli.

```bash
SON="$(sudo sh -c 'ls -1t /var/backups/harita-crm/app-*.db.gz | head -1')"; echo "$SON"
sudo bash /opt/harita-crm/deploy/geri-yukle.sh "$SON"
```

Script onay ister (`evet` yazın). Sonra sırayla:
1. Web ve işçiyi durdurur.
2. Yedeği açıp denetler.
3. Mevcut veritabanının bir yedeğini daha alır (`/var/lib/harita-crm/yedek/`).
4. Yedeği yerine koyar ve migration'ları uygular.
5. Servisleri başlatır.

**Kontrol:** `== Geri yükleme tamam.` ve sağlık yanıtı.

### Sunucu dışına kopya (haftada bir)

Sunucu tümden giderse yerel yedekler de gider. En son yedeği kendi bilgisayarınıza alın.

Sunucuda:

```bash
sudo sh -c 'install -m 600 -o yonetici "$(ls -1t /var/backups/harita-crm/app-*.db.gz | head -1)" /home/yonetici/son-yedek.db.gz'
```

Kendi bilgisayarınızda:

```bash
scp yonetici@SUNUCU_IP:son-yedek.db.gz ./harita-crm-yedek-$(date +%Y%m%d).db.gz
ssh yonetici@SUNUCU_IP rm son-yedek.db.gz
```

Yedek kişisel veri içerir; şifreli bir diskte saklayın. Sürekli uzak yedek için README → "Litestream ile yedekleme".

> **Gelen medya yedeğe girmez.** `/var/lib/harita-crm/medya/` (fotoğraf, video, belge, ses) günlük yedekte yoktur; saklama
> süresi (varsayılan 90 gün) dolunca zaten silinir. Sunucu giderse sohbetlerde bu dosyalar "görüntülenemiyor" olur,
> yazışma metinleri yedekten gelir. Çalışma alanı başına üst sınır 5 GB'tır (Ayarlar → Veri saklama'da görünür); diskte
> yer ayırırken çalışma alanı sayısını hesaba katın.

## 14. İlk yönetici ve çalışma alanı

1. Tarayıcıda `https://deneme.bursalidagitim.com/giris` → **Kayıt ol**; e-posta olarak `ILK_YONETICI_EPOSTASI`'na
   yazdığınız adres.
2. Açılan "Çalışma alanınızı oluşturun" ekranında müşterinin adını verin.
3. Ekip arkadaşları **Ayarlar → Ekip**'ten davet edilir. Kayıt yalnızca davetle açık: davet edilmemiş bir e-postayla
   kayıt "Kayıt yalnızca davetle yapılabilir" hatası verir.

**Kontrol:** başka bir e-postayla kayıt denemesi reddedilmeli.

## 15. WhatsApp: önce tek numara

Canlıya **tek numarayla** çıkılır; diğer iki numara sonra taşınır.
- **Ayarlar → WhatsApp (Meta)** ekranındaki bağlantı ve webhook adımları `docs/OFIS-GUNU.md` ile aynıdır. Fark:
  bildirim adresi artık tünel değil, `https://deneme.bursalidagitim.com/api/whatsapp/webhook/<kimlik>`. Ekranda bu adres
  hazır gösterilir; Meta'da **Callback URL**'ye bunu girin.
- Test modu, test numaraları ve "Bağlantıyı test et" adımları ofis rehberindeki gibidir. Test modu webhook
  doğrulanmadan ve imzalı bir teslim bildirimi gelmeden kapanmaz.
- Canlıda `WHATSAPP_API_MOCK` **tanımlı olmamalı** (`.env.production.example`'da yok).
- Diğer numaralar sonra **Ayarlar → WhatsApp → + Numara ekle** ile eklenir. Her numaranın kendi test modu, test
  numaraları, uygulama payı ve kurulum adımları vardır; şablonlar numaranın WhatsApp hesabına (WABA) aittir.
- **Tek Meta uygulaması = tek bildirim adresi.** Meta'da callback adresi uygulama düzeyindedir. Üç numara aynı
  uygulamadaysa Meta'ya **ilk numaranın** adresini girmeniz yeterli: diğer numaraların bildirimleri de oraya gelir ve
  uygulama doğru numaraya işler. Diğer numaraların "Bildirim adresi" adımı, o numaradan gönderilen ilk test mesajının
  imzalı teslim bildirimiyle tamamlanır. Meta'da numara başına ayrı adres (override) girmek de çalışır.

## 16. Güncelleme (her yeni sürümde)

```bash
sudo bash /opt/harita-crm/deploy/guncelle.sh
```

Hangi klasörde olduğunuz fark etmez; betik kendi klasörüne kendisi geçer.

Script sırayla:
1. Sunucuda elle değiştirilmiş dosya var mı bakar.
2. Yeni sürümü çeker; yoksa çıkar.
3. Web ve işçiyi durdurur. Kesinti genelde 1–3 dakikadır; Meta bildirimleri bu sürede cevap alamazsa sonra yeniden
   gönderir.
4. `npm ci`, derleme ve `db:migrate` çalıştırır. Migration'dan önce yedek alınır. Derleme soru sormaz: Next.js
   sürümü bir güvenlik bülteninden etkileniyorsa terminalde yükseltme menüsü açıp cevap beklerdi; betik bunu kapatır
   (`< /dev/null`). Yükseltme geliştirme ortamında yapılır, sunucuya yeni sürümle gelir.
5. Servisleri başlatır ve sağlık denetimini bekler.

Hata durumları:
- **Derleme ya da migration hata verirse:** kod kendiliğinden eski sürüme döner ve eski sürüm başlatılır. Migration
  hata verirse veritabanı değişmez. Eski sürüme dönüşte de bir adım hata verirse (ör. eski sürüm derlenemezse) script
  ekrana `UYARI: eski sürüme dönüşte de hata çıktı` yazar ve servisleri **yine de** başlatmayı dener; site açılmazsa
  logları okuyup `sudo systemctl start harita-worker harita-web` ile elle başlatın.
- **Migration geçip uygulama açılmazsa:** script durur ve son migration yedeğinin yolunu gösterir. Logları okuyun:
  `journalctl -u harita-web -n 100 --no-pager`. Gerekirse `sudo bash /opt/harita-crm/deploy/geri-yukle.sh <yedek>`.

**Kontrol:** `== Tamam: <sürüm> çalışıyor.`

## 17. Son kontrol listesi

- [ ] `https://deneme.bursalidagitim.com` açılıyor, kilit simgesi var
- [ ] `systemctl is-active harita-web harita-worker caddy` → üçü `active`
- [ ] `systemctl list-timers harita-yedek.timer` → sonraki 03:30
- [ ] `curl -s http://127.0.0.1:3000/api/saglik` → `"durum":"ok"` (veritabanı, işçi, yedek, disk)
- [ ] IP ile erişim 404, `sudo ufw status` → yalnızca 22, 80, 443
- [ ] Geri yükleme bir kez denendi (13. adım)
- [ ] `.env.production.local`'in kopyası sunucu dışında güvende
- [ ] Davetsiz kayıt reddediliyor (14. adım)
- [ ] Bir tarama (az sayıda sonuçla) ve bir kayıt içe aktarma denendi
- [ ] `PLACES_MOCK=false`; `WHATSAPP_API_MOCK` tanımlı değil

## Sorun giderme

| Belirti | Neden / çözüm |
|---|---|
| `harita-web` sürekli yeniden başlıyor | `journalctl -u harita-web -n 50 --no-pager`. Sık nedenler: `npm run build` yapılmamış (`.next` yok), `.env.production.local` okunamıyor (sahibi `harita` olmalı). |
| Sağlıkta `isci` sorunlu | `systemctl status harita-worker`; `journalctl -u harita-worker -n 50`. İşçi durmuşsa kampanyalar ilerlemez. |
| Sağlıkta `yedek` sorunlu | `journalctl -u harita-yedek -n 20`; `systemctl list-timers`. Elle: `sudo systemctl start harita-yedek`. |
| Sağlıkta `disk` sorunlu | `df -h /var/lib/harita-crm`. Eski migration yedekleri günlük bakımda kendiliğinden silinir (son 10 + son 30 gün). |
| `systemctl reload caddy` "permission denied" (`/var/log/caddy/harita-crm.log`) | `sudo caddy validate` log dosyasını root sahipli oluşturmuş. `sudo chown -R caddy:caddy /var/log/caddy && sudo systemctl reload caddy` (12. adım). |
| Tarayıcıda sertifika hatası | DNS doğru mu (1. adım), 80/443 açık mı (`sudo ufw status`); `journalctl -u caddy -n 50`. |
| Giriş yapınca hemen çıkıyor | `BETTER_AUTH_URL` tam olarak `https://deneme.bursalidagitim.com` olmalı; `AUTH_INSECURE_COOKIES=false`. |
| Kayıt "ILK_YONETICI_EPOSTASI tanımlı değil" diyor | 8. adımdaki e-postayı doldurun, `sudo systemctl restart harita-web`. |
| Sayfa 404 "Bulunamadı." | Alan adı dışındaki adresle (IP) girilmiş, ya da `UYGULAMA_ALANLARI` / `BETTER_AUTH_URL` alan adıyla uyuşmuyor. |
| Harita görünmüyor | `NEXT_PUBLIC_GOOGLE_MAPS_*` boş ya da referrer kısıtı yanlış; değiştirdikten sonra `sudo bash /opt/harita-crm/deploy/guncelle.sh --zorla`. |
| `guncelle.sh` "değiştirilmiş dosyalar var" diyor | Sunucuda kod elle değiştirilmiş; listedeki dosyaları `sudo -u harita git -C /opt/harita-crm checkout -- .` ile geri alın. |
| `npm ci` "gyp" / derleme hatası | `build-essential` ve `python3` kurulu mu (3. adım). |
