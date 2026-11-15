#!/usr/bin/env bash
# Yedekten geri yükleme: sudo bash deploy/geri-yukle.sh <yedek.db.gz | yedek.db> [--evet] [--zorla]
#
# Günlük yedekler: /var/backups/harita-crm/app-<damga>.db.gz   (ls -1t /var/backups/harita-crm | head)
# Migration yedekleri: /var/lib/harita-crm/yedek/app-<damga>.db
#
# Sırayla: onay → web ve işçiyi durdur → npm run yedek:geri-yukle (yedeği açar ve bütünlüğünü denetler, MEVCUT
# veritabanının bir yedeğini daha alır, sonra yerine koyar) → npm run db:migrate (yedek eski sürümdense şemayı
# günceller) → servisleri başlat → sağlık denetimi.
#   --evet   Onay sorusunu atlar.
#   --zorla  Mevcut veritabanı bozuk olduğu için yedeği alınamıyorsa dosyayı <ad>.bozuk-<damga> olarak kenara taşır.
# Hata olursa servisler DURDURULMUŞ kalır (yarım bir veritabanıyla açılmasın); mesajı okuyun, sonra elle başlatın:
#   sudo systemctl start harita-worker harita-web
set -euo pipefail

UYGULAMA_DIZINI="${UYGULAMA_DIZINI:-/opt/harita-crm}"
KULLANICI="${KULLANICI:-harita}"
SAGLIK_ADRESI="${SAGLIK_ADRESI:-http://127.0.0.1:3000/api/saglik}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Bu script sudo ile çalıştırılmalı: sudo bash deploy/geri-yukle.sh <yedek>" >&2
  exit 1
fi

YEDEK=""
EVET=0
EK=()
for a in "$@"; do
  case "$a" in
    --evet) EVET=1 ;;
    --zorla) EK+=("--zorla") ;;
    -*) echo "Bilinmeyen seçenek: $a" >&2; exit 1 ;;
    *) YEDEK="$a" ;;
  esac
done
if [ -z "$YEDEK" ]; then
  echo "Kullanım: sudo bash deploy/geri-yukle.sh <yedek.db.gz> [--evet] [--zorla]" >&2
  echo "Son günlük yedekler:" >&2
  ls -1t /var/backups/harita-crm 2>/dev/null | head -5 >&2 || true
  exit 1
fi
YEDEK="$(readlink -f "$YEDEK")"
if [ ! -f "$YEDEK" ]; then
  echo "Yedek dosyası bulunamadı: $YEDEK" >&2
  exit 1
fi
if ! sudo -u "$KULLANICI" test -r "$YEDEK"; then
  echo "$KULLANICI kullanıcısı yedeği okuyamıyor: $YEDEK (sudo chown $KULLANICI: \"$YEDEK\")" >&2
  exit 1
fi

echo "Geri yüklenecek yedek: $YEDEK ($(du -h "$YEDEK" | cut -f1))"
echo "Web ve işçi durdurulacak; mevcut veritabanının yedeği alınıp yerine bu yedek konacak."
if [ "$EVET" -ne 1 ]; then
  read -r -p "Devam etmek için 'evet' yazın: " CEVAP
  [ "$CEVAP" = "evet" ] || { echo "Vazgeçildi."; exit 1; }
fi

cd "$UYGULAMA_DIZINI"
k() { sudo -u "$KULLANICI" -H -- "$@"; }

hata() {
  echo "" >&2
  echo "HATA: $1. Servisler durdurulmuş durumda bırakıldı." >&2
  echo "Mesajı okuduktan sonra başlatmak için: sudo systemctl start harita-worker harita-web" >&2
  exit 1
}

echo "== Servisler durduruluyor"
systemctl stop harita-web harita-worker

k npm run --silent yedek:geri-yukle -- "$YEDEK" --evet "${EK[@]}" || hata "geri yükleme"
k npm run --silent db:migrate || hata "migration"

echo "== Servisler başlatılıyor"
systemctl start harita-worker harita-web
for _ in $(seq 1 45); do
  GOVDE="$(curl -s --max-time 3 "$SAGLIK_ADRESI" || true)"
  if printf '%s' "$GOVDE" | grep -q '"ad":"veritabani","durum":"ok"'; then
    echo "Sağlık: $GOVDE"
    echo "== Geri yükleme tamam."
    exit 0
  fi
  sleep 2
done
echo "Web açılmadı. Loglar: journalctl -u harita-web -n 100 --no-pager" >&2
exit 1
