# SıraGO 3D Reels (Blender + EEVEE)

Sahneler tamamen Python betiklerinden üretilir; `.blend` dosyaları ve ara kareler Git'e girmez.

| Yol | İçerik |
|---|---|
| `ortak/temel.py` | EEVEE ayarı, malzeme, köşeli geometri, ışık, kamera (`yukari` ile telefon planları), anahtar kare yardımcıları |
| `ortak/karakter.py` | Köşeli karakter + ifadeler (`stres`, `endise`, `rahat`, `gulumse`, `mutlu`, `goz_kirp`…), `kirp`, `bak_yon`, `goz_kay`, `egil`, `kol_poz` |
| `ortak/objeler.py` | Telefon (ekran = PNG dizisi dokusu), makas, berber koltuğu, Fiko figürü, bitki, şişe, ampul, raf, berber direği |
| `ortak/telefon.css`, `ortak/zaman.js` | Telefon ekranı HTML'leri: kare kare belirlenimci zaman çizelgesi |
| `ortak/altyazi.css` | Alt yazı + kapanış kartı katmanı (şeffaf 1080×1920) |
| `ortak/katman.mjs` | HTML → PNG kareleri (Edge, `playwright-core`) |
| `ortak/storyboard.mjs` | 3D kareler + alt yazı → storyboard sayfası |
| `<video>/sahne.py` | Mekân, karakterler, animasyon, kamera planları (baştaki yorumda plan listesi) |
| `<video>/ekran.html` | Telefon ekranı zaman çizelgesi. Bot balonları gerçek metinler (kaynak satırları dosyanın başında) |
| `<video>/altyazi.html` | Alt yazılar ve kapanış cümlesi |
| `out/` | Storyboard'lar ve son MP4'ler (1080×1920, 30 fps, H.264) |

## Araçlar (bu bilgisayar)

- Blender 5.2.2 LTS (taşınabilir): `C:\Users\cvdra\projeler\.araclar\blender-5.2.2-windows-x64\blender.exe`
  Windows grafik tercihi: Yüksek performans (GTX 1650 Ti, doğrulandı). Motor: EEVEE (Cycles yok).
  Görünüm dönüşümü: Khronos PBR Neutral (telefon ekranı renkleri ve yazı kontrastı korunur).
- FFmpeg 9.0.2 (winget `Gyan.FFmpeg`), Node 22.11 (taşınabilir: `C:\Users\cvdra\projeler\.araclar\node-v22.11.0-win-x64`)
- `cd videos/3d && npm install` (playwright-core; tarayıcı indirmez, kurulu Edge'i kullanır)

## Komutlar (videos/3d içinde)

```bash
node ortak/katman.mjs berber/ekran.html berber/katmanlar/ekran                # telefon ekranı, 495 kare
blender -b -P berber/sahne.py -- --kadraj                                       # kadraj ölçümü (nokta → ekran konumu)
blender -b -P berber/sahne.py -- --kareler 58,121 --cikti /tmp/k --ornek 32 --yuzde 50
node ortak/storyboard.mjs berber /tmp/k out/storyboard-berber.png "58:Kanca|121:…"
```

Ölçüm (2026-10-21, 1080×1920, 64 örnek): ilk kare ~73 sn (bir kerelik shader derleme), sonrası ~2.7 sn/kare.
Render sırasında oyun / Wallpaper Engine kapalı olsun: 4 GB VRAM'in ~2.7 GB'ını Blender kullanıyor.
