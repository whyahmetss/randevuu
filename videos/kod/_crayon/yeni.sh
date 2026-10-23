#!/bin/sh
# Yeni pastel hikâye klasörüne şablonları koyar:  sh _crayon/yeni.sh h04-dalgin-musteri dalgin-musteri "Dalgın Müşteri" "sabah:amb_sabah kapi_zili:zil"
set -e
HERE=$(cd "$(dirname "$0")" && pwd); K="$HERE/../$1"; mkdir -p "$K"
sed "s/__BASLIK__/$3/" "$HERE/sablon/index.html" > "$K/index.html"
cp "$HERE/sablon/main.js" "$K/main.js"
sed "s/__AD__/$2/; s/__AMB__/$4/" "$HERE/sablon/build.sh" > "$K/build.sh"
printf 'out/\nstills/\nortak/\n' > "$K/.gitignore"
sh "$HERE/kur.sh" "$K"
