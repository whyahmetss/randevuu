#!/bin/sh
# Pastel filmler: kâğıt dokusu yüksek bit hızı ister; mux.sh (CRF 19) çıktısını CRF 28 ile yeniden kodlar (görünür kayıp yok).
#   sh ../_crayon/sikistir.sh film.mp4
set -e
ffmpeg -y -loglevel error -i "$1" -c:v libx264 -preset slow -crf ${CRF:-28} -pix_fmt yuv420p -c:a copy -movflags +faststart "$1.tmp.mp4"
mv "$1.tmp.mp4" "$1"; ls -la "$1" | awk '{print "boyut:", $5}'
