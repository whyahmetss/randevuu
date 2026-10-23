#!/bin/sh
# Fiko ve Mesaj — tek komutla: olaylar → kareler → ses → miks → film (1080×1920, 30 fps, −14 LUFS)
set -e
LIB=${LIB:-$HOME/lemo-opuscar}
HERE=$(cd "$(dirname "$0")" && pwd)
export LIB
[ -f "$LIB/core/render/video.mjs" ] || { echo "LIB'i kütüphane klasörüne ayarla"; exit 1; }
mkdir -p "$HERE/out"
# ambiyans: videos/3d/ses/efekt (ElevenLabs ses efektleri, bizim üretimimiz)
EFEKT="$HERE/../../3d/ses/efekt"
ffmpeg -y -loglevel error -i "$EFEKT/gece.mp3" -ar 48000 -ac 1 "$HERE/out/amb_gece.wav"
ffmpeg -y -loglevel error -i "$EFEKT/dukkan.mp3" -ar 48000 -ac 1 "$HERE/out/amb_dukkan.wav"
cd "$LIB"
node core/render/events.mjs "$HERE" --size 1080x1920
node core/render/video.mjs "$HERE" --fps 30 --size 1080x1920 --workers ${WORKERS:-3} --out "$HERE/out/video.mp4"
"$LIB/.venv/bin/python" "$HERE/mix.py"
"$LIB/.venv/bin/python" core/render/srt.py "$HERE/out/cues.json" "$HERE/fiko-mesaj.srt"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/fiko-mesaj.mp4" 30 0
