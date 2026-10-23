#!/bin/sh
# Kareler hazırken yalnız ses → altyazı → birleştirme → sıkıştırma:  sh _oyun/son.sh h10-yer-var-mi yer-var-mi
set -e
LIB=${LIB:-$HOME/lemo-opuscar}; export LIB
HERE=$(cd "$(dirname "$0")/../$1" && pwd); AD=$2
sh "$HERE/$(sed -n 's#^sh "$HERE/\(\.\./_[a-z]*/kur.sh\)".*#\1#p' "$HERE/build.sh")" "$HERE"
"$LIB/.venv/bin/python" "$HERE/mix.py"
cd "$LIB"; "$LIB/.venv/bin/python" core/render/srt.py "$HERE/out/cues.json" "$HERE/$AD.srt"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/$AD.mp4" 24 0
CRF=24 sh "$HERE/../_crayon/sikistir.sh" "$HERE/$AD.mp4"
