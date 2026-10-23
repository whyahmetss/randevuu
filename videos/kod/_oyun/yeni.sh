#!/bin/sh
set -e
HERE=$(cd "$(dirname "$0")" && pwd); K="$HERE/../$1"; mkdir -p "$K"
sed "s/__BASLIK__/$3/" "$HERE/sablon/index.html" > "$K/index.html"
sed "s/__AD__/$2/; s/__AMB__/$4/; s#_crayon/kur.sh#_oyun/kur.sh#" "$HERE/../_crayon/sablon/build.sh" > "$K/build.sh"
printf 'out/\nstills/\nortak/\nout_build.log\n' > "$K/.gitignore"
sh "$HERE/kur.sh" "$K"
