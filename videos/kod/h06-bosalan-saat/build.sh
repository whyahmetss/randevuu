#!/bin/sh
# Tek komut: ortak motor → olaylar → kareler → ses → film (1080×1920, 24 fps, −14 LUFS) → sıkıştırma
set -e
LIB=${LIB:-$HOME/lemo-opuscar}; export LIB
HERE=$(cd "$(dirname "$0")" && pwd); AD=bosalan-saat
sh "$HERE/../_crayon/kur.sh" "$HERE"
mkdir -p "$HERE/out"
EF="$HERE/../../3d/ses/efekt"
for a in klinik:amb_klinik sabah:amb_sabah; do ffmpeg -y -loglevel error -i "$EF/${a%%:*}.mp3" -ar 48000 -ac 1 "$HERE/out/${a##*:}.wav"; done
cd "$LIB"
node core/render/events.mjs "$HERE" --size 1080x1920
node core/render/video.mjs "$HERE" --fps 24 --size 1080x1920 --workers ${WORKERS:-3} --out "$HERE/out/video.mp4"
"$LIB/.venv/bin/python" "$HERE/mix.py"
"$LIB/.venv/bin/python" core/render/srt.py "$HERE/out/cues.json" "$HERE/$AD.srt"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/$AD.mp4" 24 0
sh "$HERE/../_crayon/sikistir.sh" "$HERE/$AD.mp4"
