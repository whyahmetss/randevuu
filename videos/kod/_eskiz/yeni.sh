#!/bin/sh
#   sh _eskiz/yeni.sh h02-pazartesi-tatil pazartesi-tatil "Pazartesi Tatil" "sabah:amb_sabah"
set -e
HERE=$(cd "$(dirname "$0")" && pwd); K="$HERE/../$1"; mkdir -p "$K"
sed "s/__BASLIK__/$3/" "$HERE/sablon/index.html" > "$K/index.html"; cp "$HERE/sablon/main.js" "$K/main.js"
sed "s/__AD__/$2/; s/__AMB__/$4/; s#_crayon/kur.sh#_eskiz/kur.sh#" "$HERE/../_crayon/sablon/build.sh" > "$K/build.sh"
printf 'out/\nstills/\nortak/\nout_build.log\n' > "$K/.gitignore"
sh "$HERE/kur.sh" "$K"
