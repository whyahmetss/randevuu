# SıraGO sosyal medya tasarımları

Her şey `marka-kitabi/` kurallarına ve `sistem/marka.css` tek kaynağına göre üretilir.

| Klasör | İçerik |
|---|---|
| `marka-kitabi/` | Marka kitapçığı sayfaları (HTML → PNG) ve birleşik PDF |
| `sistem/` | `marka.css` (renk, yazı, bileşen), `ikonlar.js` (ikon seti) |
| `instagram/gonderi/` | Gönderiler, 1080×1350. Carousel'de her sayfa ayrı dosya |
| `instagram/story/` | Story'ler, 1080×1920 |
| `instagram/reels-kapak/` | Reels kapakları, 1080×1920 (ızgarada orta 3:4 görünür) |
| `instagram/one-cikan/` | Öne çıkan kapakları (a = gece, b = krem) |
| `varliklar/` | Kenarı temizlenmiş 3D tilki, yeşil blok logosu |
| `fontlar/` | Bricolage Grotesque, Inter (OFL) yerel kopyası; render internetsiz çalışır |
| `instagram/profil/` | Profil önizlemesi (bio + öne çıkanlar + 9'lu grid) |
| `instagram/grid-9-onizleme.*` | İlk 9 gönderinin ızgara görünümü |
| `icerik/` | Strateji, profil, 30 günlük takvim (md + csv), açıklama/hashtag kütüphanesi, hazır cevaplar |
| `yonler/` | İlk aşamadaki 3 görsel yön (arşiv) |

Reels/TikTok videoları `videos/src/reels-*.html` (stil: `videos/src/reels.css`).

## Komutlar

```bash
node tasarim/render.mjs [yol-parçası]   # HTML → PNG (yanına). Boyut <body data-w data-h>; data-h="auto" içerikten
node videos/render.mjs reels-01          # HTML → MP4 (videos/out/), 30 fps
```

Playwright global kuruluysa ESM için bir kez: `mkdir -p node_modules && ln -s "$(npm root -g)/playwright" node_modules/playwright`

## Ürün ekranı kuralı

Bot balonlarında yalnız botun gerçek metni kullanılır: `randevugo/src/services/sohbetAsistani.js` (M.tr), `utils/botMesajlar.js` (randevuOnaylandi), `services/hatirlatma.js` (teyit, 15 dk). Kod değişirse görseller de güncellenir.
