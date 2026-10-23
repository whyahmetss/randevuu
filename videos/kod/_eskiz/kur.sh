#!/bin/sh
# Ortak eskiz motorunu film klasörüne kopyalar:  sh ../_eskiz/kur.sh .
set -e
HERE=$(cd "$(dirname "$0")" && pwd); HEDEF=${1:-.}
mkdir -p "$HEDEF/ortak/fonts"; cp "$HERE"/*.js "$HEDEF/ortak/"; cp "$HERE"/fonts/* "$HEDEF/ortak/fonts/"
cp "$HERE/../_crayon/muzik.py" "$HEDEF/ortak/"
