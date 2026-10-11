# Harita CRM — 1. aşama uygulama planı

## Adımlar
1. **Altyapı:** Next.js 16 (App Router, TS, Tailwind 4), SQLite (better-sqlite3, WAL) + Drizzle, drizzle-kit migration'ları, Vitest.
2. **Kimlik:** Better Auth (e-posta/şifre, Drizzle SQLite adaptörü, httpOnly + secure çerez). İlk girişte çalışma alanı kurulumu, e-posta ile davet (davet bağlantısı; gerçek e-posta gönderimi bir `Mailer` arayüzünün arkasında, 1. aşamada konsol adaptörü).
3. **Kiracı izolasyonu:** `src/server/repo/` dışındaki hiçbir kod `db`'ye erişemez (ESLint `no-restricted-imports`). Her depo fonksiyonu ilk parametre olarak `TenantContext` alır, her sorguya `tenant_id` koşulunu kendisi ekler; id ile yapılan işlemlerde sahiplik aynı sorguda doğrulanır, yoksa `null` döner ve çağıran 404 verir.
4. **Places istemcisi** (`src/server/places/`): tek modül, `PLACES_MOCK=true` iken sahte yanıt. Tüm istekler sayaç kancasından geçer (`usage_counters`, `scans.istek_sayisi`).
5. **Tarama:** daireyi kapsayan kare, dörtlü ağaç (quadtree) hücrelere bölünür. Daire içindeki hücreler Text Search **IDs Only** (ücretsiz), sınırı kesen hücreler `places.location` ile (Text Search Pro) aranır ve daire dışı sonuçlar elenir. 60 sonuçla doyan hücre 4'e bölünür. İstek bütçesi `SCAN_MAX_REQUESTS` (varsayılan 50).
6. **Kayıtlar:** sayfa başı 20; Places içeriği (ad, adres, telefon) her istekte canlı çekilir, yalnızca istek belleğinde tutulur. Detay paneli, olaylar, işlemler; her işlem `lead_events`'e yazılır. CSV yalnızca kullanıcı verisi.
7. **Panel, Ayarlar, İletişim (yakında).**
8. **Testler:** izolasyon (her depo fonksiyonu), tarama hücre/tekilleştirme, şema kontrolü (Places içeriği sütunu yok).
9. **Bakım:** `npm run cleanup` — 30 günden eski Places konumlarını ve saklama süresini aşan kullanıcı verisini siler.
10. **2. aşama için yer:** `src/server/messaging/` — `MessageProvider` arayüzü + `sandbox` adaptörü + ret filtresi.

## Dosya yapısı
```
drizzle/                      drizzle-kit migration SQL'leri
scripts/migrate.ts            migration'ları uygular
scripts/cleanup.ts            30 gün / saklama süresi temizliği
src/proxy.ts                  oturum çerezi yoksa /giris'e yönlendirme (iyimser)
src/app/
  (auth)/giris, (auth)/kurulum, davet/[token]
  (app)/layout.tsx            sol menü + içerik
  (app)/panel, tarama, kayitlar, iletisim, ayarlar
  api/auth/[...all]           Better Auth
  api/taramalar/...           tarama oluştur / çalıştır / durum
  api/adres                   adres → konum (Places Text Search)
  api/kayitlar/disa-aktar     CSV
src/components/               arayüz bileşenleri (harita, atıf, menü…)
src/server/
  db/                         bağlantı + şema (yalnızca repo/ ve auth içe aktarabilir)
  auth.ts                     Better Auth örneği
  baglam.ts                   oturum + memberships → TenantContext
  repo/                       kiracıya bağlı depo fonksiyonları
  repo/sistem/                bağlam üretimi, kurulum, bakım (kiracı öncesi işlemler)
  places/                     Places istemcisi + mock
  scan/                       hücre geometrisi + tarama motoru (saf, test edilebilir)
  messaging/                  2. aşama arayüzü (sandbox)
tests/                        vitest testleri
```
