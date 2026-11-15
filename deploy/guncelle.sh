#!/usr/bin/env bash
# Tek komutluk güncelleme: sudo bash deploy/guncelle.sh [--zorla]
#
# Sırayla:
#   1. Sunucuda elle değiştirilmiş (git'te izlenen) dosya varsa durur.
#   2. git fetch; yeni sürüm yoksa çıkar (--zorla ile yine de derler ve yeniden başlatır).
#   3. Web ve işçiyi durdurur. npm ci ve next build çalışan sürümün dosyalarını değiştirir; yarım bir sürüm sunulmasın
#      diye kesinti (genelde 1-3 dk) kabul edilir. Meta webhook'u cevap alamazsa sonra yeniden dener.
#   4. git merge --ff-only → npm ci → npm run build → npm run db:migrate (önce veritabanı yedeği alır).
#   5. Servisleri başlatır ve /api/saglik'te veritabanının cevap vermesini bekler.
# 4. adımda hata olursa (migration dahil; migration hata verirse veritabanı değişmez) kod eski sürüme döndürülür, eski
# sürüm yeniden derlenip başlatılır. Migration başarılı olup sonra sağlık denetimi geçmezse otomatik dönülmez
# (şema yenidir): ekrandaki geri yükleme komutunu kullanın.
set -euo pipefail

UYGULAMA_DIZINI="${UYGULAMA_DIZINI:-/opt/harita-crm}"
KULLANICI="${KULLANICI:-harita}"
# Veritabanı klasörü (DATABASE_PATH'in klasörü); migration yedekleri bunun altındaki yedek/ klasöründedir.
VERI_DIZINI="${VERI_DIZINI:-/var/lib/harita-crm}"
SAGLIK_ADRESI="${SAGLIK_ADRESI:-http://127.0.0.1:3000/api/saglik}"
ZORLA=0
[ "${1:-}" = "--zorla" ] && ZORLA=1

if [ "$(id -u)" -ne 0 ]; then
  echo "Bu script sudo ile çalıştırılmalı: sudo bash deploy/guncelle.sh" >&2
  exit 1
fi
cd "$UYGULAMA_DIZINI"

k() { sudo -u "$KULLANICI" -H -- "$@"; }

saglik_bekle() {
  # Web cevap verene kadar en fazla 90 sn bekler; veritabanı "ok" ise başarılı. İşçi ve yedek uyarıları yazdırılır.
  local govde=""
  for _ in $(seq 1 45); do
    govde="$(curl -s --max-time 3 "$SAGLIK_ADRESI" || true)"
    if printf '%s' "$govde" | grep -q '"ad":"veritabani","durum":"ok"'; then
      echo "Sağlık: $govde"
      return 0
    fi
    sleep 2
  done
  echo "Sağlık denetimi geçmedi. Son yanıt: ${govde:-yanıt yok}" >&2
  return 1
}

if [ -n "$(k git status --porcelain --untracked-files=no)" ]; then
  echo "Sunucuda değiştirilmiş dosyalar var; güncelleme yapılmadı:" >&2
  k git status --short --untracked-files=no >&2
  echo "Bu değişiklikleri geri almak için: sudo -u $KULLANICI git -C $UYGULAMA_DIZINI checkout -- ." >&2
  exit 1
fi

ESKI="$(k git rev-parse HEAD)"
k git fetch --quiet
YENI="$(k git rev-parse '@{u}')"
if [ "$ESKI" = "$YENI" ] && [ "$ZORLA" -eq 0 ]; then
  echo "Zaten güncel ($(k git rev-parse --short HEAD)). Yine de derleyip yeniden başlatmak için: --zorla"
  exit 0
fi

echo "== Güncelleniyor: $(k git rev-parse --short "$ESKI") → $(k git rev-parse --short "$YENI")"
k git log --oneline "$ESKI..$YENI" || true

geri_don() {
  echo "" >&2
  echo "HATA: $1. Eski sürüme dönülüyor ($(k git rev-parse --short "$ESKI"))..." >&2
  k git reset --hard "$ESKI"
  k npm ci
  k npm run build
  systemctl start harita-worker harita-web
  saglik_bekle || true
  echo "Eski sürüm çalışıyor. Hatanın ayrıntısı yukarıda." >&2
  exit 1
}

echo "== Servisler durduruluyor"
systemctl stop harita-web harita-worker

k git merge --ff-only --quiet "$YENI" || geri_don "git merge"
echo "== npm ci"
k npm ci --no-audit --no-fund || geri_don "npm ci"
echo "== Derleniyor"
k npm run build || geri_don "derleme"
echo "== Migration"
k npm run db:migrate || geri_don "migration (veritabanı değiştirilmedi)"

echo "== Servisler başlatılıyor"
systemctl start harita-worker harita-web
if saglik_bekle; then
  echo "== Tamam: $(k git rev-parse --short HEAD) çalışıyor."
else
  echo "Web açılmadı. Loglar: journalctl -u harita-web -n 100 --no-pager" >&2
  SON_YEDEK="$(ls -1t "$VERI_DIZINI"/yedek/*.db 2>/dev/null | head -1 || true)"
  echo "Migration öncesi yedek: ${SON_YEDEK:-bulunamadı}" >&2
  echo "Gerekirse geri yükleme: sudo bash deploy/geri-yukle.sh <yedek dosyası>" >&2
  exit 1
fi
