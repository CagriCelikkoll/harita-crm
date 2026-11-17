#!/usr/bin/env bash
# Tek komutluk güncelleme: sudo bash /opt/harita-crm/deploy/guncelle.sh [--zorla]
# Hangi klasörden çağrılırsa çağrılsın çalışır: uygulama klasörü, betiğin bulunduğu deploy/ klasörünün üst klasörüdür
# (UYGULAMA_DIZINI ile değiştirilebilir). /opt/harita-crm 750 ve harita sahibi olduğu için yönetici kullanıcı oraya
# "cd" yapamaz; tam yolla çağırmak yeterlidir.
#
# Sırayla:
#   1. Sunucuda elle değiştirilmiş (git'te izlenen) dosya varsa durur.
#   2. git fetch; yeni sürüm yoksa çıkar (--zorla ile yine de derler ve yeniden başlatır).
#   3. Web ve işçiyi durdurur. npm ci ve next build çalışan sürümün dosyalarını değiştirir; yarım bir sürüm sunulmasın
#      diye kesinti (genelde 1-3 dk) kabul edilir. Meta webhook'u cevap alamazsa sonra yeniden dener.
#   4. git merge --ff-only → npm ci → npm run build → npm run db:migrate (önce veritabanı yedeği alır).
#   5. Servisleri başlatır ve /api/saglik'te veritabanının cevap vermesini bekler.
# 4. adımda hata olursa (migration dahil; migration hata verirse veritabanı değişmez) kod eski sürüme döndürülür, eski
# sürüm yeniden derlenip başlatılır. Eski sürüm derlenemese bile servisler yeniden başlatılmaya çalışılır (site kapalı
# kalmasın). Migration başarılı olup sonra sağlık denetimi geçmezse otomatik dönülmez (şema yenidir): ekrandaki geri
# yükleme komutunu kullanın.
#
# Derleme girdisi /dev/null'dan verilir: Next.js, sürüm bir güvenlik bülteninden etkilendiğinde terminalde bir yükseltme
# menüsü açıp cevap bekler (servisler kapalıyken). Girdi terminal olmayınca menü açılmaz, derleme beklemeden biter;
# yükseltme kararı geliştirme ortamında verilir.
set -euo pipefail

BETIK_KOKU="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")/.." && pwd)"
UYGULAMA_DIZINI="${UYGULAMA_DIZINI:-$BETIK_KOKU}"
KULLANICI="${KULLANICI:-harita}"
# Veritabanı klasörü (DATABASE_PATH'in klasörü); migration yedekleri bunun altındaki yedek/ klasöründedir.
VERI_DIZINI="${VERI_DIZINI:-/var/lib/harita-crm}"
SAGLIK_ADRESI="${SAGLIK_ADRESI:-http://127.0.0.1:3000/api/saglik}"
ZORLA=0
[ "${1:-}" = "--zorla" ] && ZORLA=1

if [ "$(id -u)" -ne 0 ]; then
  echo "Bu script sudo ile çalıştırılmalı: sudo bash $UYGULAMA_DIZINI/deploy/guncelle.sh" >&2
  exit 1
fi
cd "$UYGULAMA_DIZINI"

k() { sudo -u "$KULLANICI" -H -- "$@"; }
derle() { k npm run build < /dev/null; }

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
  # Buradan sonra hiçbir adım betiği yarıda kesmez: ne olursa olsun servisler yeniden başlatılmaya çalışılır.
  set +e
  echo "" >&2
  echo "HATA: $1. Eski sürüme dönülüyor ($ESKI)..." >&2
  local sorun=""
  if ! k git reset --hard "$ESKI"; then
    sorun="git reset"
  elif ! k npm ci --no-audit --no-fund; then
    sorun="npm ci"
  elif ! derle; then
    sorun="derleme"
  fi
  if [ -n "$sorun" ]; then
    echo "" >&2
    echo "UYARI: eski sürüme dönüşte de hata çıktı ($sorun). Servisler yine de başlatılmaya çalışılıyor." >&2
  fi
  if ! systemctl start harita-worker harita-web; then
    echo "Servisler başlatılamadı: sudo systemctl status harita-web harita-worker" >&2
  fi
  if saglik_bekle; then
    echo "Eski sürüm çalışıyor. Hatanın ayrıntısı yukarıda." >&2
  else
    echo "Web açılmadı. Loglar: journalctl -u harita-web -n 100 --no-pager" >&2
    echo "Elle başlatmak için: sudo systemctl start harita-worker harita-web" >&2
  fi
  exit 1
}

echo "== Servisler durduruluyor"
systemctl stop harita-web harita-worker

k git merge --ff-only --quiet "$YENI" || geri_don "git merge"
echo "== npm ci"
k npm ci --no-audit --no-fund || geri_don "npm ci"
echo "== Derleniyor"
derle || geri_don "derleme"
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
  echo "Gerekirse geri yükleme: sudo bash $UYGULAMA_DIZINI/deploy/geri-yukle.sh <yedek dosyası>" >&2
  exit 1
fi
