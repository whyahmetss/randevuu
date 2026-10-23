#!/bin/sh
# Hikâye teslim dosyaları: poster.jpg, CREDITS, videos/seslendirme/<no>-<ad>.md (altyazı = masal anlatıcısının sözleri)
#   sh _crayon/teslim.sh h04-dalgin-musteri dalgin-musteri "Dalgın Müşteri" 11 14.5
set -e
HERE=$(cd "$(dirname "$0")" && pwd); K="$HERE/../$1"; AD=$2; BASLIK=$3; NO=$4; POSTER=${5:-10}
KW=$(cygpath -m "$K"); HW=$(cygpath -m "$HERE")
ffmpeg -y -loglevel error -ss "$POSTER" -i "$K/$AD.mp4" -frames:v 1 -q:v 3 "$K/poster.jpg"
sed "s/__BASLIK__/$BASLIK/" "$HERE/sablon/CREDITS" > "$K/CREDITS"
mkdir -p "$HERE/../../seslendirme"
/c/Users/cvdra/projeler/.araclar/node-v22.11.0-win-x64/node.exe -e "
const c = require('$KW/out/cues.json'), f = x => x.toFixed(2).replace('.', ',');
let s = '# $BASLIK (pastel resimli kitap) — seslendirme\n\nVideo: \`videos/kod/$1/$AD.mp4\`  \nDosya adları: \`${AD}_1.mp3\` … (her satır ayrı dosya)  \nTon: masal anlatıcısı; yumuşak, sıcak, cümle aralarında nefes. Tırnak içindeki sözler hafif canlandırılır. Ekrandaki basılı sözlerle aynı.\n\n| # | Zaman (sn) | En çok | Metin |\n|---|---|---|---|\n';
c.forEach((q, i) => { const son = Math.min(q.t1, c[i + 1] ? c[i + 1].t0 : q.t1) - .3; s += '| ' + (i + 1) + ' | ' + f(q.t0) + ' – ' + f(son) + ' | ' + f(son - q.t0) + ' sn | ' + q.text.replace(/SıraGO/g, 'Sıra Go') + ' |\n'; });
require('fs').writeFileSync('$HW/../../seslendirme/$NO-' + '$AD' + '.md', s);"
echo "teslim: $K/poster.jpg, CREDITS, seslendirme/$NO-$AD.md"
