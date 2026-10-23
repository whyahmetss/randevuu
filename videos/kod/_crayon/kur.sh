#!/bin/sh
# Ortak pastel motorunu bir film klasörüne kopyalar (sayfalar /@film/ altında servis edilir, dışarıya erişemez).
#   sh ../_crayon/kur.sh .
set -e
HERE=$(cd "$(dirname "$0")" && pwd); HEDEF=${1:-.}
mkdir -p "$HEDEF/ortak/fonts"
cp "$HERE"/*.js "$HERE"/*.py "$HEDEF/ortak/"
cp "$HERE"/fonts/* "$HEDEF/ortak/fonts/"
